const encoder = new TextEncoder();

export async function exportDialog(snapshot, { logger, settings = {}, incrementalFrom = null } = {}) {
  snapshot = prepareSnapshot(snapshot, settings, incrementalFrom);
  if (!snapshot.messages.length) throw new Error(incrementalFrom == null ? 'Нет сообщений для экспорта' : 'Новых сообщений после прошлого экспорта нет');
  const folder = 'VK Dialog Export/';
  const dialog = snapshot.messages.map(publicMessage);
  const analysis = dialog.map(({ date, author, text }) => ({ date, author, text, type: 'message' }));
  const analytics = buildAnalytics(dialog);
  const entries = [
    { name: `${folder}dialog.json`, data: pretty(dialog) },
    { name: `${folder}analysis.json`, data: pretty(analysis) },
    { name: `${folder}analytics.json`, data: pretty(analytics) },
    { name: `${folder}dialog.txt`, data: asText(snapshot.messages) },
    { name: `${folder}dialog.html`, data: asHtml(snapshot.messages, snapshot.peerId) },
    { name: `${folder}media/`, data: new Uint8Array() },
  ];
  const media = await appendMedia(entries, dialog, folder, logger);
  entries.push({ name: `${folder}viewer.html`, data: asViewer(snapshot.messages, snapshot, media.files) });
  entries.push({ name: `${folder}archive.json`, data: pretty(await archiveManifest(snapshot, entries, media)) });
  const blob = new Blob([createZip(entries)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: archiveFileName(snapshot) });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { count: snapshot.messages.length, maxCmid: snapshot.stats.max };
}

function prepareSnapshot(snapshot, settings, incrementalFrom) {
  let messages = snapshot.messages;
  if (incrementalFrom != null) messages = messages.filter((message) => Number.isFinite(message.conversation_message_id) && message.conversation_message_id > incrementalFrom);
  const aliases = new Map();
  messages = messages.map((message) => {
    const copy = { ...message };
    if (settings.anonymize) {
      const identity = copy.author || String(copy.peer_id || 'unknown');
      if (!aliases.has(identity)) aliases.set(identity, `Участник ${aliases.size + 1}`);
      copy.author = aliases.get(identity);
      copy.id = null;
      copy.peer_id = null;
      copy.attachments = [];
    }
    if (settings.includeAttachments === false) copy.attachments = [];
    return copy;
  });
  const cmids = messages.map((item) => item.conversation_message_id).filter(Number.isFinite);
  const unique = new Set(cmids); const min = cmids.length ? Math.min(...cmids) : null; const max = cmids.length ? Math.max(...cmids) : null; const missingCmids = [];
  if (min != null && max != null) for (let id = min; id <= max; id++) if (!unique.has(id)) missingCmids.push(id);
  return { ...snapshot, peerId: settings.anonymize ? null : snapshot.peerId, title: settings.anonymize ? 'Обезличенный диалог' : snapshot.title, messages, incrementalFrom, stats: { count: messages.length, min, max, gaps: missingCmids.length, missingCmids } };
}

async function archiveManifest(snapshot, entries, media) {
  const sources = snapshot.messages.reduce((result, message) => {
    result[message.source || 'unknown'] = (result[message.source || 'unknown'] || 0) + 1;
    return result;
  }, {});
  const files = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    files.push({ path: entry.name.replace(/^VK Dialog Export\//, ''), bytes: data.length, sha256: await sha256(data) });
  }
  return {
    schemaVersion: 1,
    generator: { name: 'VK Toolkit', version: chrome.runtime.getManifest().version },
    exportedAt: new Date().toISOString(),
    peerId: snapshot.peerId,
    dialogTitle: snapshot.title || '',
    incrementalFrom: snapshot.incrementalFrom,
    messages: {
      count: snapshot.stats.count,
      cmid: { min: snapshot.stats.min, max: snapshot.stats.max, missing: snapshot.stats.missingCmids || [] },
      sources,
    },
    media,
    note: 'Missing CMIDs can represent deleted or service messages and do not by themselves prove an incomplete export.',
    files,
  };
}

export function archiveFileName(snapshot) {
  const title = sanitizeFilePart(snapshot.title) || 'Диалог';
  const peer = snapshot.peerId ?? 'unknown';
  return `VK Dialog - ${title} - ${peer}.zip`;
}

function sanitizeFilePart(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
}

async function sha256(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function publicMessage(item) {
  return { id: item.id, date: item.date, author: item.author, text: item.text, attachments: item.attachments };
}
function pretty(value) { return JSON.stringify(value, null, 2); }
function buildAnalytics(messages) {
  const authors = {}; const days = {}; const hours = Array(24).fill(0); const words = {}; let attachments = 0;
  for (const message of messages) {
    const author = message.author || 'Без автора'; authors[author] = (authors[author] || 0) + 1;
    const date = new Date(message.date); if (!Number.isNaN(date.valueOf())) { const day = date.toISOString().slice(0, 10); days[day] = (days[day] || 0) + 1; hours[date.getHours()]++; }
    attachments += message.attachments?.length || 0;
    for (const word of String(message.text || '').toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{3,}/gu) || []) words[word] = (words[word] || 0) + 1;
  }
  const topWords = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 100).map(([word, count]) => ({ word, count }));
  return { messages: messages.length, authors, firstDate: messages[0]?.date || '', lastDate: messages.at(-1)?.date || '', attachments, messagesByDay: days, messagesByHour: hours, topWords };
}
function asText(messages) { return messages.map((m) => `[${m.date}] ${m.author || m.peer_id}: ${m.text}${attachmentText(m.attachments)}`).join('\n'); }
function attachmentText(items) { return items?.length ? `\n  Вложения: ${items.map(attachmentUrl).filter(Boolean).join(', ')}` : ''; }
function asHtml(messages, peerId) {
  const rows = messages.map((m) => `<article><header><b>${escapeHtml(m.author || String(m.peer_id || ''))}</b><time>${escapeHtml(m.date)}</time><small>CMID ${m.conversation_message_id ?? '—'}</small></header><div>${escapeHtml(m.text).replace(/\n/g, '<br>')}</div>${attachmentHtml(m.attachments)}</article>`).join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VK dialog ${peerId || ''}</title><style>body{max-width:850px;margin:auto;padding:24px;font:15px/1.5 system-ui;background:#f0f2f5;color:#222}article{margin:10px 0;padding:12px 16px;background:#fff;border-radius:10px}header{display:flex;gap:10px;align-items:baseline}time,small{color:#777;font-size:12px}small{margin-left:auto}a{word-break:break-all}</style><h1>Диалог ${escapeHtml(String(peerId || ''))}</h1>${rows}</html>`;
}
export function asViewer(messages, snapshot, mediaFiles = []) {
  const localMedia = new Map(mediaFiles.map((item) => [item.url, item.path]));
  const payload = JSON.stringify(messages.map((message) => ({ ...publicMessage(message), cmid: message.conversation_message_id, attachments: (message.attachments || []).map((item) => { const url = attachmentUrl(item); return { url, local: localMedia.get(url) || '' }; }) }))).replace(/</g, '\\u003c');
  const title = escapeHtml(snapshot.title || `Диалог ${snapshot.peerId || ''}`);
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · VK Toolkit</title><style>
  :root{color-scheme:light dark;--bg:#eef1f5;--card:#fff;--text:#1d2733;--muted:#6d7885;--accent:#447bba}body.dark{--bg:#151719;--card:#222529;--text:#edf0f3;--muted:#9ba3ad}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:16px;background:var(--card);box-shadow:0 1px 8px #0002}h1{max-width:980px;margin:0 auto 10px;font-size:20px}.tools,.summary{display:flex;max-width:980px;margin:auto;gap:8px;flex-wrap:wrap}.summary{margin-top:9px;color:var(--muted)}input,select,button{border:1px solid #8885;border-radius:8px;padding:8px;background:var(--bg);color:var(--text)}input{flex:1;min-width:220px}button{cursor:pointer}.messages{max-width:980px;margin:16px auto;padding:0 12px}.message{margin:8px 0;padding:12px 14px;background:var(--card);border-radius:10px}.message header{position:static;display:flex;padding:0 0 5px;box-shadow:none;gap:8px}.message time,.cmid{color:var(--muted);font-size:12px}.cmid{margin-left:auto}.empty{text-align:center;color:var(--muted);padding:50px}.attachment{display:block;margin-top:7px;word-break:break-all;color:var(--accent)}img.attachment{max-width:min(100%,600px);max-height:500px;border-radius:8px}audio.attachment{width:min(100%,480px)}</style>
  <header><h1>${title}</h1><div class="tools"><input id="search" placeholder="Поиск по сообщениям"><select id="author"><option value="">Все авторы</option></select><input id="cmid" inputmode="numeric" placeholder="Перейти к CMID"><button id="theme">Тема</button></div><div class="summary" id="summary"></div></header><main class="messages" id="messages"></main>
  <script type="application/json" id="data">${payload}</script><script>(()=>{const data=JSON.parse(document.querySelector('#data').textContent),root=document.querySelector('#messages'),search=document.querySelector('#search'),author=document.querySelector('#author'),cmid=document.querySelector('#cmid');[...new Set(data.map(x=>x.author).filter(Boolean))].sort().forEach(x=>author.add(new Option(x,x)));const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),media=v=>{const u=v.local||v.url||'',safe=/^(?:https:\\/\\/|media\\/)/i.test(u);if(!safe)return'';if(/\\.(?:jpe?g|png|gif|webp|avif)$/i.test(u))return'<img class="attachment" loading="lazy" src="'+esc(u)+'">';if(/\\.(?:mp3|ogg|m4a|wav)$/i.test(u))return'<audio class="attachment" controls src="'+esc(u)+'"></audio>';return'<a class="attachment" target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(v.url||u)+'</a>'};function render(){const q=search.value.toLowerCase(),a=author.value;const rows=data.filter(x=>(!q||x.text.toLowerCase().includes(q))&&(!a||x.author===a));root.innerHTML=rows.length?rows.map(x=>'<article class="message" data-cmid="'+(x.cmid??'')+'"><header><b>'+esc(x.author||'Без автора')+'</b><time>'+esc(x.date)+'</time><span class="cmid">CMID '+esc(x.cmid??'—')+'</span></header><div>'+esc(x.text).replace(/\\n/g,'<br>')+'</div>'+(x.attachments||[]).map(media).join('')+'</article>').join(''):'<div class="empty">Сообщения не найдены</div>';document.querySelector('#summary').textContent='Показано '+rows.length+' из '+data.length+' · Авторов '+new Set(data.map(x=>x.author).filter(Boolean)).size;}search.oninput=author.onchange=render;cmid.onchange=()=>document.querySelector('[data-cmid="'+CSS.escape(cmid.value)+'"]')?.scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('#theme').onclick=()=>document.body.classList.toggle('dark');render()})()</script></html>`;
}
function attachmentHtml(items = []) { return items.map((item) => { const url = attachmentUrl(item); return url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''; }).join(''); }
function attachmentUrl(item) {
  if (typeof item === 'string') return item;
  return item?.url || item?.photo?.orig_photo?.url || item?.video?.player || item?.doc?.url || '';
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

async function appendMedia(entries, messages, folder, logger) {
  const urls = [...new Set(messages.flatMap((m) => m.attachments || []).map(attachmentUrl).filter(isDirectMediaUrl))];
  const report = { discovered: urls.length, downloaded: 0, files: [], unavailable: [] };
  for (let index = 0; index < urls.length; index++) {
    try {
      const { data, contentType } = await fetchMedia(urls[index]);
      const extension = mimeExtension(contentType) || urlExtension(urls[index]);
      const path = `media/${String(index + 1).padStart(4, '0')}.${extension}`;
      entries.push({ name: `${folder}${path}`, data });
      report.downloaded++;
      report.files.push({ url: urls[index], path, bytes: data.length });
    } catch (error) { report.unavailable.push({ url: urls[index], reason: error.message || String(error) }); logger?.warn('Media was left as a link', urls[index], error); }
  }
  return report;
}

async function fetchMedia(url) {
  const meta = await chrome.runtime.sendMessage({ type: 'media:fetch', url });
  if (!meta?.ok) throw new Error(meta?.error || 'Не удалось загрузить медиа');
  const output = new Uint8Array(meta.size);
  let offset = 0;
  try {
    for (let index = 0; index < meta.chunks; index++) {
      const response = await chrome.runtime.sendMessage({ type: 'media:chunk', token: meta.token, index });
      if (!response?.ok) throw new Error(response?.error || 'Не удалось получить часть медиа');
      const bytes = fromBase64(response.base64);
      output.set(bytes, offset); offset += bytes.length;
    }
    return { data: output, contentType: meta.contentType };
  } finally {
    chrome.runtime.sendMessage({ type: 'media:release', token: meta.token }).catch(() => {});
  }
}

function fromBase64(value) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function mimeExtension(mime = '') { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3' })[mime.split(';')[0]]; }
function urlExtension(url) { return new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'bin'; }
function isDirectMediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (/\.(?:jpe?g|png|gif|webp|avif|mp4|webm|mp3|ogg|m4a|wav)(?:$|[?#])/i.test(url.href)) return true;
    return /(?:^|\.)(?:userapi\.com|vkuseraudio\.net|vkuserphoto\.ru|vkcdn\.ru)$/i.test(url.hostname);
  } catch { return false; }
}

export function createZip(entries) {
  const chunks = []; const central = []; let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data); const local = header(0x04034b50, [20, 0x0800, 0, 0, 0, crc, data.length, data.length, name.length, 0]);
    chunks.push(local, name, data); central.push(header(0x02014b50, [20, 20, 0x0800, 0, 0, 0, crc, data.length, data.length, name.length, 0, 0, 0, 0, entry.name.endsWith('/') ? 0x10 : 0, offset]), name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  chunks.push(...central, header(0x06054b50, [0, 0, entries.length, entries.length, centralSize, offset, 0]));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const output = new Uint8Array(total); let position = 0;
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
  return output;
}
function header(signature, values) {
  const size = signature === 0x04034b50 ? 30 : signature === 0x02014b50 ? 46 : 22; const bytes = new Uint8Array(size); const view = new DataView(bytes.buffer); view.setUint32(0, signature, true);
  let offset = 4; const widths = size === 30 ? [2,2,2,2,2,4,4,4,2,2] : size === 46 ? [2,2,2,2,2,2,4,4,4,2,2,2,2,2,4,4] : [2,2,2,2,4,4,2];
  values.forEach((value, index) => { widths[index] === 4 ? view.setUint32(offset, value >>> 0, true) : view.setUint16(offset, value, true); offset += widths[index]; }); return bytes;
}
const CRC_TABLE = Array.from({ length: 256 }, (_, number) => { let crc = number; for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
function crc32(data) { let crc = 0xffffffff; for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
