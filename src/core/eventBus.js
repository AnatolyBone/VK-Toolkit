export class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(name, callback) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(callback);
  }

  emit(name, payload) {
    for (const callback of this.events.get(name) || []) {
      callback(payload);
    }
  }
}
