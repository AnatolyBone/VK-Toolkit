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
    if (message.conversation_message_id != null) {
      const fallback = this.findFallback(message);
      if (fallback) this.messages.delete(fallback[0]);
    } else if (this.hasNetworkEquivalent(message)) {
      return false;
    }
    if (!previous || (previous.source !== 'network' && message.source === 'network')) this.messages.set(key, { ...previous, ...message });
    return !previous && !this.findFallback(message);
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

  findFallback(message) {
    if (message.conversation_message_id == null) return null;
    return [...this.messages].find(([, item]) => item.conversation_message_id == null && equivalentContent(item, message)) || null;
  }
  hasNetworkEquivalent(message) {
    return [...this.messages.values()].some((item) => item.conversation_message_id != null && equivalentContent(item, message));
  }
}

function equivalentContent(left, right) {
  if (Number(left.peer_id) !== Number(right.peer_id)) return false;
  if (normalizeText(left.text) !== normalizeText(right.text)) return false;
  const leftMinute = String(left.date || '').slice(0, 16);
  const rightMinute = String(right.date || '').slice(0, 16);
  return !leftMinute || !rightMinute || leftMinute === rightMinute || !left.conversation_message_id || !right.conversation_message_id;
}
function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
