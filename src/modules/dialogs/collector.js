import { MessageStore } from './dedupe.js';
import { findMessageContainer, getPeerId, parseDomMessages, parseNetworkPayload } from './parser.js';

export class DialogCollector {
  constructor({ logger, events }) {
    this.logger = logger;
    this.events = events;
    this.store = new MessageStore();
    this.observer = null;
    this.running = false;
  }

  start() {
    this.running = true;
    this.ingestDom();
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) this.ingestDom(node);
      }
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  stop() { this.running = false; this.observer?.disconnect(); }

  ingestNetwork(payload) { this.add(parseNetworkPayload(payload)); }
  ingestDom(root = document) { this.add(parseDomMessages(root)); }
  add(messages) {
    const added = this.store.addMany(messages);
    if (added) this.events.emit('dialogs:progress', this.store.stats());
    return added;
  }

  snapshot() {
    return { peerId: getPeerId(), messages: this.store.values(), stats: this.store.stats() };
  }

  async collectFullHistory() {
    const container = findMessageContainer();
    if (!container) throw new Error('Контейнер сообщений не найден');
    let unchanged = 0;
    let previousSignature = '';
    this.events.emit('dialogs:collecting', true);
    try {
      while (this.running && unchanged < 5) {
        this.ingestDom();
        const stats = this.store.stats();
        const signature = `${stats.count}:${stats.min}`;
        unchanged = signature === previousSignature ? unchanged + 1 : 0;
        previousSignature = signature;
        if (container === document.scrollingElement) window.scrollTo(0, 0);
        else container.scrollTop = 0;
        await waitForChanges(container, 1400);
      }
      this.ingestDom();
      return this.snapshot();
    } finally {
      this.events.emit('dialogs:collecting', false);
    }
  }
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
