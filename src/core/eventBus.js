export class EventBus {
  constructor() { this.events = new Map(); }

  on(name, callback) {
    const listeners = this.events.get(name) || new Set();
    listeners.add(callback);
    this.events.set(name, listeners);
    return () => this.off(name, callback);
  }

  once(name, callback) {
    const unsubscribe = this.on(name, (payload) => { unsubscribe(); callback(payload); });
    return unsubscribe;
  }

  off(name, callback) {
    this.events.get(name)?.delete(callback);
  }

  emit(name, payload) {
    for (const callback of [...(this.events.get(name) || [])]) {
      try { callback(payload); } catch (error) { console.error('[VK Toolkit] Event handler failed', error); }
    }
  }

  clear() { this.events.clear(); }
}
