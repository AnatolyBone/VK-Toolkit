import { MessageStore } from './dedupe.js';
import { findMessageContainer, getDialogTitle, getPeerId, parseDomMessages, parseNetworkPayload } from './parser.js';

export class DialogCollector {
  constructor({ logger, events }) {
    this.logger = logger;
    this.events = events;
    this.store = new MessageStore();
    this.observer = null;
    this.running = false;
    this.peerId = null;
    this.restoreToken = 0;
    this.saveTimer = null;
    this.restored = false;
    this.collection = { active: false, paused: false, cancelled: false, reachedStart: false, iteration: 0, unchanged: 0, status: 'idle' };
  }

  start() {
    this.running = true;
    this.syncPeer();
    this.ingestDom();
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) this.ingestDom(node);
      }
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  stop() { this.running = false; this.cancel(); this.observer?.disconnect(); clearTimeout(this.saveTimer); this.persistSession(); }

  ingestNetwork(payload) { this.syncPeer(); this.add(parseNetworkPayload(payload)); }
  ingestDom(root = document) { this.syncPeer(); this.add(parseDomMessages(root)); }
  add(messages) {
    const currentPeer = this.peerId;
    const relevant = messages.filter((message) => {
      if (currentPeer == null) return false;
      return message.peer_id == null || Number(message.peer_id) === currentPeer;
    });
    const added = this.store.addMany(relevant);
    if (added) {
      this.restored = false;
      this.events.emit('dialogs:progress', this.store.stats());
      this.schedulePersist();
    }
    return added;
  }

  snapshot() {
    return { peerId: this.peerId, title: getDialogTitle(), messages: this.store.values(), stats: this.store.stats(), collection: { ...this.collection }, restored: this.restored };
  }

  syncPeer() {
    const peerId = getPeerId();
    if (peerId === this.peerId) return;
    if (this.collection.active) this.cancel();
    if (this.peerId != null && this.store.messages.size) this.persistSession();
    this.peerId = peerId;
    this.store.clear();
    this.restored = false;
    this.events.emit('dialogs:progress', this.store.stats());
    this.logger.info('Active peer changed', peerId);
    this.restoreSession(peerId, ++this.restoreToken);
  }

  async restoreSession(peerId, token) {
    if (peerId == null) return;
    try {
      const key = sessionKey(peerId);
      const saved = (await chrome.storage.local.get(key))[key];
      if (!this.running || token !== this.restoreToken || peerId !== this.peerId || !Array.isArray(saved?.messages)) return;
      const added = this.store.addMany(saved.messages);
      this.restored = added > 0;
      if (added) {
        this.collection = { ...this.collection, reachedStart: Boolean(saved.reachedStart), status: saved.reachedStart ? 'complete' : 'restored' };
        this.events.emit('dialogs:progress', this.store.stats());
        this.events.emit('dialogs:collecting', { ...this.collection });
        this.logger.info('Restored collection session', peerId, added);
      }
    } catch (error) { this.logger.warn('Could not restore collection session', error); }
  }

  schedulePersist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistSession(), 750);
  }

  async persistSession() {
    clearTimeout(this.saveTimer);
    if (this.peerId == null || !this.store.messages.size) return;
    const key = sessionKey(this.peerId);
    try {
      await chrome.storage.local.set({ [key]: { peerId: this.peerId, title: getDialogTitle(), savedAt: new Date().toISOString(), reachedStart: Boolean(this.collection.reachedStart), messages: this.store.values() } });
    } catch (error) { this.logger.warn('Could not persist collection session', error); }
  }

  async collectFullHistory() {
    if (this.collection.active) return this.snapshot();
    const container = findMessageContainer();
    if (!container) throw new Error('Контейнер сообщений не найден');
    this.logger.info('History container selected', describeContainer(container));
    let unchanged = 0;
    let previousSignature = '';
    this.setCollection({ active: true, paused: false, cancelled: false, reachedStart: false, iteration: 0, unchanged: 0, status: 'collecting' });
    try {
      while (this.running && !this.collection.cancelled && unchanged < 5) {
        while (this.collection.paused && !this.collection.cancelled) await delay(200);
        if (this.collection.cancelled) break;
        this.ingestDom();
        const stats = this.store.stats();
        const signature = `${stats.count}:${stats.min}`;
        unchanged = signature === previousSignature ? unchanged + 1 : 0;
        previousSignature = signature;
        this.setCollection({ iteration: this.collection.iteration + 1, unchanged });
        if (stats.min === 1) break;
        if (container === document.scrollingElement) window.scrollTo(0, 0);
        else container.scrollTop = 0;
        await waitForChanges(container, 1400);
      }
      this.ingestDom();
      const stats = this.store.stats();
      const scrollTop = container === document.scrollingElement ? window.scrollY : container.scrollTop;
      const reachedStart = !this.collection.cancelled && scrollTop <= 2 && unchanged >= 5;
      const status = this.collection.cancelled ? 'cancelled' : stats.min === 1 || reachedStart ? 'complete' : stats.min == null ? 'dom-only' : 'stable';
      this.setCollection({ status, reachedStart: status === 'complete' });
      return this.snapshot();
    } finally {
      this.setCollection({ active: false, paused: false });
    }
  }

  togglePause() {
    if (!this.collection.active) return;
    this.setCollection({ paused: !this.collection.paused, status: this.collection.paused ? 'collecting' : 'paused' });
  }

  cancel() {
    if (this.collection.active) this.setCollection({ cancelled: true, paused: false, status: 'cancelling' });
  }

  setCollection(patch) {
    this.collection = { ...this.collection, ...patch };
    this.events.emit('dialogs:collecting', { ...this.collection });
  }
}

function sessionKey(peerId) { return `dialogCollectorSession:${peerId}`; }

function delay(timeout) { return new Promise((resolve) => setTimeout(resolve, timeout)); }

function describeContainer(element) {
  if (element === document.scrollingElement) return 'document.scrollingElement';
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;
}

function waitForChanges(container, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; observer.disconnect(); clearTimeout(timer); resolve(); };
    const observer = new MutationObserver(() => setTimeout(finish, 250));
    observer.observe(container === document.scrollingElement ? document.body : container, { childList: true, subtree: true });
    const timer = setTimeout(finish, timeout);
  });
}
