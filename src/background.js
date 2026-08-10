const mediaCache = new Map();
const mediaRequests = new Map();
const MAX_MEDIA_BYTES = 30_000_000;
const CHUNK_BYTES = 384_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith('media:')) return false;
  handleMediaMessage(message).then(sendResponse, (error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMediaMessage(message) {
  if (message.type === 'media:fetch') {
    if (!isAllowedMediaUrl(message.url)) throw new Error('Недопустимый media URL');
    const controller = new AbortController();
    if (message.requestId) mediaRequests.set(message.requestId, controller);
    try {
      const response = await fetch(message.url, { credentials: 'omit', redirect: 'follow', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > MAX_MEDIA_BYTES) throw new Error('Файл больше 30 МБ');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > MAX_MEDIA_BYTES) throw new Error('Файл больше 30 МБ');
      const token = crypto.randomUUID();
      mediaCache.set(token, bytes);
      setTimeout(() => mediaCache.delete(token), 120_000);
      return { ok: true, token, size: bytes.length, chunks: Math.ceil(bytes.length / CHUNK_BYTES), contentType: response.headers.get('content-type') || '' };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Загрузка отменена');
      throw error;
    } finally { if (message.requestId) mediaRequests.delete(message.requestId); }
  }
  if (message.type === 'media:cancel') {
    mediaRequests.get(message.requestId)?.abort();
    mediaRequests.delete(message.requestId);
    return { ok: true };
  }
  if (message.type === 'media:chunk') {
    const bytes = mediaCache.get(message.token);
    if (!bytes) throw new Error('Media cache expired');
    const start = Number(message.index) * CHUNK_BYTES;
    return { ok: true, base64: toBase64(bytes.subarray(start, start + CHUNK_BYTES)) };
  }
  if (message.type === 'media:release') {
    mediaCache.delete(message.token);
    return { ok: true };
  }
  throw new Error('Unknown media operation');
}

function isAllowedMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(?:^|\.)(?:vk\.com|vk\.ru|userapi\.com|vkuseraudio\.net|vkuserphoto\.ru|vkcdn\.ru|vkvideo\.ru)$/i.test(url.hostname);
  } catch { return false; }
}

function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
