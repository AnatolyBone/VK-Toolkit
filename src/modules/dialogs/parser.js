const MESSAGE_SELECTORS = [
  '[data-cmid]', '[data-conversation-message-id]', '.im-mess[data-msgid]',
  '[data-testid="message"]', '[data-message-id]',
].join(',');

export function isMessagesPage() {
  return /^\/(?:im|mail)(?:\/|$)/.test(location.pathname) || /(?:^|[?&])(sel|peer)=/.test(location.search);
}

export function getPeerId() {
  const params = new URLSearchParams(location.search);
  const queryPeer = params.get('sel') || params.get('peer') || params.get('peer_id');
  const pathPeer = location.pathname.match(/\/(?:im\/convo|im|mail)\/(-?\d+)/)?.[1];
  const domPeer = document.querySelector('[data-peer-id], [data-peer]')?.dataset.peerId
    || document.querySelector('[data-peer-id], [data-peer]')?.dataset.peer;
  const value = queryPeer || pathPeer || domPeer;
  if (/^c\d+$/.test(value || '')) return 2_000_000_000 + Number(value.slice(1));
  return value && /^-?\d+$/.test(value) ? Number(value) : null;
}

export function findMessageContainer() {
  const first = document.querySelector(MESSAGE_SELECTORS);
  if (!first) return null;
  let node = first.parentElement;
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight + 100 && getComputedStyle(node).overflowY !== 'visible') return node;
    node = node.parentElement;
  }
  return first.closest('[role="log"], .im-page--history, .im-mess-stack')?.parentElement || document.scrollingElement;
}

export function parseDomMessages(root = document) {
  const nodes = root.matches?.(MESSAGE_SELECTORS) ? [root, ...root.querySelectorAll(MESSAGE_SELECTORS)] : [...root.querySelectorAll(MESSAGE_SELECTORS)];
  return nodes.map(parseDomMessage).filter(Boolean);
}

export function parseDomMessage(element) {
  const cmid = numberFrom(element.dataset.cmid || element.dataset.conversationMessageId || element.getAttribute('data-cmid'));
  const id = numberFrom(element.dataset.msgid || element.dataset.messageId || element.getAttribute('data-msgid'));
  const peerId = numberFrom(element.dataset.peerId || element.dataset.peer) || getPeerId();
  const textNode = element.querySelector('[class*="message__text"], .im-mess--text, [data-testid="message-text"]');
  const authorNode = element.querySelector('[class*="author"], .im-mess-stack--pname, [data-testid="message-author"]');
  const time = element.querySelector('time')?.dateTime || element.querySelector('time')?.getAttribute('datetime');
  const timestamp = numberFrom(element.dataset.date || element.dataset.timestamp);
  const attachments = [...element.querySelectorAll('a[href], img[src], video[src]')]
    .map((node) => node.href || node.currentSrc || node.src).filter(Boolean);
  const text = (textNode || element).textContent?.trim() || '';
  if (!cmid && !id && !text) return null;
  return normalizeMessage({ id, conversation_message_id: cmid, peer_id: peerId, date: time || timestamp, author: authorNode?.textContent?.trim(), text, attachments }, 'dom');
}

export function parseNetworkPayload(payload) {
  let data;
  try { data = typeof payload?.text === 'string' ? JSON.parse(payload.text) : payload; } catch { return []; }
  const profiles = buildProfiles(data);
  const found = [];
  walk(data, (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (value.conversation_message_id == null && value.cmid == null) return;
    const fromId = value.from_id ?? value.fromId ?? value.sender_id;
    found.push(normalizeMessage({
      ...value,
      conversation_message_id: value.conversation_message_id ?? value.cmid,
      peer_id: value.peer_id ?? value.peerId ?? getPeerId(),
      author: value.author || profiles.get(Number(fromId)) || String(fromId || ''),
      attachments: value.attachments || [],
    }, 'network'));
  });
  return found;
}

export function normalizeMessage(message, source = 'unknown') {
  const rawDate = message.date;
  const parsedDate = typeof rawDate === 'number' ? new Date(rawDate * (rawDate < 1e12 ? 1000 : 1)) : new Date(rawDate || NaN);
  const date = Number.isNaN(parsedDate.valueOf()) ? String(rawDate || '') : parsedDate.toISOString();
  return {
    id: numberFrom(message.id),
    conversation_message_id: numberFrom(message.conversation_message_id),
    peer_id: numberFrom(message.peer_id),
    date,
    author: String(message.author || ''),
    text: String(message.text || '').trim(),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    source,
  };
}

function buildProfiles(data) {
  const profiles = new Map();
  walk(data, (value, key) => {
    if (!Array.isArray(value) || !['profiles', 'groups'].includes(key)) return;
    for (const item of value) {
      if (!item?.id) continue;
      const id = key === 'groups' ? -Number(item.id) : Number(item.id);
      profiles.set(id, [item.first_name, item.last_name].filter(Boolean).join(' ') || item.name || String(id));
    }
  });
  return profiles;
}

function walk(value, visitor, key = '') {
  visitor(value, key);
  if (!value || typeof value !== 'object') return;
  for (const [childKey, child] of Object.entries(value)) walk(child, visitor, childKey);
}

function numberFrom(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).match(/-?\d+/)?.[0]);
  return Number.isFinite(number) ? number : null;
}
