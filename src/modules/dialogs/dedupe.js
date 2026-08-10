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
    return { count: this.messages.size, ...analyzeCmids(this.values()) };
  }

  findFallback(message) {
    if (message.conversation_message_id == null) return null;
    return [...this.messages].find(([, item]) => item.conversation_message_id == null && equivalentContent(item, message)) || null;
  }
  hasNetworkEquivalent(message) {
    return [...this.messages.values()].some((item) => item.conversation_message_id != null && equivalentContent(item, message));
  }
}

export function analyzeCmids(messages, unloadedThreshold = 20) {
  const ids = [...new Set(messages.map((item) => item.conversation_message_id).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!ids.length) return { min: null, max: null, gaps: 0, uncollected: 0, missingTotal: 0, missingRanges: [], uncollectedRanges: [], segments: [], coverage: null };
  const missingRanges = []; const uncollectedRanges = []; const segments = [];
  let segmentStart = ids[0]; let gaps = 0; let uncollected = 0;
  for (let index = 1; index < ids.length; index++) {
    const previous = ids[index - 1]; const current = ids[index];
    if (current === previous + 1) continue;
    segments.push({ from: segmentStart, to: previous, count: previous - segmentStart + 1 });
    const range = { from: previous + 1, to: current - 1, count: current - previous - 1 };
    if (range.count > unloadedThreshold) { uncollectedRanges.push(range); uncollected += range.count; }
    else { missingRanges.push(range); gaps += range.count; }
    segmentStart = current;
  }
  segments.push({ from: segmentStart, to: ids.at(-1), count: ids.at(-1) - segmentStart + 1 });
  const min = ids[0]; const max = ids.at(-1); const span = max - min + 1;
  return { min, max, gaps, uncollected, missingTotal: gaps + uncollected, missingRanges, uncollectedRanges, segments, coverage: Math.round((ids.length / span) * 10_000) / 100 };
}

function equivalentContent(left, right) {
  if (Number(left.peer_id) !== Number(right.peer_id)) return false;
  if (normalizeText(left.text) !== normalizeText(right.text)) return false;
  const leftMinute = String(left.date || '').slice(0, 16);
  const rightMinute = String(right.date || '').slice(0, 16);
  return !leftMinute || !rightMinute || leftMinute === rightMinute || !left.conversation_message_id || !right.conversation_message_id;
}
function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
