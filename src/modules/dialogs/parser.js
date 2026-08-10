const MESSAGE_SELECTORS = [
  '[data-cmid]', '[data-conversation-message-id]', '.im-mess[data-msgid]',
  '[data-testid="message"]', '[data-testid*="message-item"]', '[data-message-id]',
  '[class*="MessageItem"]', '[class*="HistoryMessage"]',
  '.ConvoHistory__messageBlock',
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

export function getDialogTitle() {
  const selectors = [
    '[data-testid="conversation-header-title"]',
    '.ConvoHeader__title',
    '.ConvoHeader__peerTitle',
    '.im-page--title-main-inner',
    '[class*="ConvoHeader"] [class*="Title"]',
  ];
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

export function findMessageContainer() {
  const explicit = document.querySelector([
    '[data-testid="conversation-messages"]', '[data-testid="message-list"]',
    '[role="log"]', '.im-page--history', '.im-page--chat-body', '.MailHistory',
    '[class*="ConversationMessages"]', '[class*="MessageList"]', '[class*="ChatHistory"]',
  ].join(','));
  const explicitScrollable = explicit && closestScrollable(explicit);
  if (explicitScrollable) return explicitScrollable;

  const first = document.querySelector(MESSAGE_SELECTORS);
  const messageScrollable = first && closestScrollable(first);
  if (messageScrollable) return messageScrollable;

  const candidates = [...document.querySelectorAll('main,section,div')]
    .filter(isScrollable)
    .filter((element) => !element.closest('#vk-toolkit-dialogs'))
    .map((element) => ({ element, score: containerScore(element) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.element || (isScrollable(document.scrollingElement) ? document.scrollingElement : null);
}

function closestScrollable(element) {
  let node = element;
  while (node && node !== document.body) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function isScrollable(element) {
  if (!element || element.clientHeight < 180 || element.clientWidth < 280) return false;
  const style = getComputedStyle(element);
  return element.scrollHeight > element.clientHeight + 80 && /(auto|scroll|overlay)/.test(style.overflowY);
}

function containerScore(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 280 || rect.height < 180 || rect.bottom < 0 || rect.top > innerHeight) return -1;
  const messages = element.querySelectorAll(MESSAGE_SELECTORS).length;
  const inputs = element.querySelectorAll('textarea,[contenteditable="true"],[data-testid*="composer"]').length;
  const centerBonus = rect.left < innerWidth * 0.8 && rect.right > innerWidth * 0.35 ? 30 : 0;
  return messages * 100 + inputs * 40 + centerBonus + Math.min(rect.height, 900) / 10;
}

export function parseDomMessages(root = document) {
  const nodes = root.matches?.(MESSAGE_SELECTORS) ? [root, ...root.querySelectorAll(MESSAGE_SELECTORS)] : [...root.querySelectorAll(MESSAGE_SELECTORS)];
  return nodes.map(parseDomMessage).filter(Boolean);
}

export function parseDomMessage(element) {
  const cmid = numberFrom(element.dataset.cmid || element.dataset.conversationMessageId || element.getAttribute('data-cmid'));
  const id = numberFrom(element.dataset.msgid || element.dataset.messageId || element.getAttribute('data-msgid'));
  const peerId = numberFrom(element.dataset.peerId || element.dataset.peer) || getPeerId();
  const textNode = element.querySelector('.MessageText, .ConvoMessageWithoutBubble__text, [class*="message__text"], .im-mess--text, [data-testid="message-text"]');
  const authorNode = element.querySelector('.ConvoMessageHeader__authorLink, [class*="author"], .im-mess-stack--pname, [data-testid="message-author"]');
  const dateNode = element.querySelector('time, .ConvoMessageInfoWithoutBubbles__date');
  const time = dateNode?.dateTime || dateNode?.getAttribute('datetime') || normalizeVisibleDate(dateNode?.textContent);
  const timestamp = numberFrom(element.dataset.date || element.dataset.timestamp);
  const attachments = [...element.querySelectorAll([
    '[class*="Attachment"] a[href]', '[class*="Attachment"] img[src]', '[class*="Attachment"] video[src]', '[class*="Attachment"] audio[src]',
    '[class*="MediaGrid"] a[href]', '[class*="MediaGrid"] img[src]', '[class*="Photo"] img[src]',
    '.MessageText a[href]', 'video[src]', 'audio[src]',
  ].join(','))]
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
    if (value.conversation_message_id == null && value.conversationMessageId == null && value.cmid == null) return;
    if (value.date == null && value.from_id == null && value.fromId == null && value.sender_id == null && value.text == null && value.attachments == null) return;
    const fromId = value.from_id ?? value.fromId ?? value.sender_id;
    found.push(normalizeMessage({
      ...value,
      conversation_message_id: value.conversation_message_id ?? value.conversationMessageId ?? value.cmid,
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

function normalizeVisibleDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return text;
  const [hours, minutes] = text.split(':').map(Number);
  const date = new Date(); date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}
