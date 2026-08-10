export function messageKey(message) {
  if (message.conversation_message_id != null) return `cmid:${message.conversation_message_id}`;
  return `fallback:${message.peer_id || ''}:${message.date || ''}:${message.text || ''}`;
}

export class MessageStore {
  constructor() { this.messages = new Map(); }
  clear() { this.messages.clear(); }
  add(message) {
    const key = messageKey(message);
    const previous = this.messages.get(key);
    if (!previous || (previous.source !== 'network' && message.source === 'network')) this.messages.set(key, { ...previous, ...message });
    return !previous;
  }
  addMany(messages) { return messages.reduce((count, message) => count + Number(this.add(message)), 0); }
  values() {
    return [...this.messages.values()].sort((a, b) => (a.conversation_message_id ?? Infinity) - (b.conversation_message_id ?? Infinity) || String(a.date).localeCompare(String(b.date)));
  }
  stats() {
    const cmids = this.values().map((item) => item.conversation_message_id).filter(Number.isFinite);
    const unique = new Set(cmids);
    const min = cmids.length ? Math.min(...cmids) : null;
    const max = cmids.length ? Math.max(...cmids) : null;
    let gaps = 0;
    if (min != null && max != null) for (let id = min; id <= max; id++) if (!unique.has(id)) gaps++;
    return { count: this.messages.size, min, max, gaps };
  }
}
