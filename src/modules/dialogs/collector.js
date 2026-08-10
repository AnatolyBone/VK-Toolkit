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
    this.collection = { active: false, paused: false, cancelled: false, iteration: 0, unchanged: 0, status: 'idle' };
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

  stop() { this.running = false; this.cancel(); this.observer?.disconnect(); }

  ingestNetwork(payload) { this.syncPeer(); this.add(parseNetworkPayload(payload)); }
  ingestDom(root = document) { this.syncPeer(); this.add(parseDomMessages(root)); }
  add(messages) {
    const currentPeer = this.peerId;
    const relevant = messages.filter((message) => {
      if (currentPeer == null) return false;
      return message.peer_id == null || Number(message.peer_id) === currentPeer;
    });
    const added = this.store.addMany(relevant);
    if (added) this.events.emit('dialogs:progress', this.store.stats());
    return added;
  }

  snapshot() {
    return { peerId: this.peerId, title: getDialogTitle(), messages: this.store.values(), stats: this.store.stats(), collection: { ...this.collection } };
  }

  syncPeer() {
    const peerId = getPeerId();
    if (peerId === this.peerId) return;
    if (this.collection.active) this.cancel();
    this.peerId = peerId;
    this.store.clear();
    this.events.emit('dialogs:progress', this.store.stats());
    this.logger.info('Active peer changed', peerId);
  }

  async collectFullHistory() {
    if (this.collection.active) return this.snapshot();
    const container = findMessageContainer();
    if (!container) throw new Error('Контейнер сообщений не найден');
    this.logger.info('History container selected', describeContainer(container));
    let unchanged = 0;
    let previousSignature = '';
    this.setCollection({ active: true, paused: false, cancelled: false, iteration: 0, unchanged: 0, status: 'collecting' });
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
      const status = this.collection.cancelled ? 'cancelled' : stats.min === 1 ? 'complete' : stats.min == null ? 'dom-only' : 'stable';
      this.setCollection({ status });
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
