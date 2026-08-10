import { encryptBytes } from '../../core/encryption.js';
import { analyzeCmids } from './dedupe.js';

const encoder = new TextEncoder();

export async function exportDialog(snapshot, { logger, settings = {}, incrementalFrom = null, password = '', onProgress, signal } = {}) {
  const startedAt = performance.now();
  throwIfAborted(signal);
  notifyProgress(onProgress, { stage: 'preparing' });
  snapshot = prepareSnapshot(snapshot, settings, incrementalFrom);
  if (!snapshot.messages.length) throw new Error(incrementalFrom == null ? 'Нет сообщений для экспорта' : 'Новых сообщений после прошлого экспорта нет');
  const folder = 'VK Dialog Export/';
  const dialog = snapshot.messages.map(publicMessage);
  const analysis = dialog.map(({ date, author, text, reply, forwarded, reactions, service }) => ({ date, author, text, type: service ? 'service' : 'message', reply, forwarded, reactions, service }));
  const analytics = buildAnalytics(dialog);
  const entries = [
    { name: `${folder}dialog.json`, data: pretty(dialog) },
    { name: `${folder}analysis.json`, data: pretty(analysis) },
    { name: `${folder}analytics.json`, data: pretty(analytics) },
    { name: `${folder}dialog.txt`, data: asText(snapshot.messages) },
    { name: `${folder}dialog.html`, data: asHtml(snapshot.messages, snapshot.peerId) },
    { name: `${folder}media/`, data: new Uint8Array() },
  ];
  const media = settings.downloadMedia === false
    ? skipMediaDownloads(dialog, onProgress)
    : await appendMedia(entries, dialog, folder, logger, onProgress, signal);
  entries.push({ name: `${folder}failed-media.json`, data: pretty(media.unavailable) });
  entries.push({ name: `${folder}diagnostics.json`, data: pretty(buildDiagnostics(snapshot, dialog, media)) });
  throwIfAborted(signal);
  notifyProgress(onProgress, { stage: 'building', downloaded: media.downloaded, total: media.discovered, bytes: media.totalBytes });
  entries.push({ name: `${folder}viewer.html`, data: asViewer(snapshot.messages, snapshot, media.files) });
  const verificationTarget = await archiveManifest(snapshot, entries, media);
  entries.push({ name: `${folder}verify.html`, data: asVerifier(verificationTarget) });
  entries.push({ name: `${folder}archive.json`, data: pretty(await archiveManifest(snapshot, entries, media)) });
  throwIfAborted(signal);
  const zip = createZip(entries);
  const encrypted = Boolean(settings.encrypt);
  if (encrypted) notifyProgress(onProgress, { stage: 'encrypting', bytes: zip.length });
  const output = encrypted ? await encryptBytes(zip, password) : zip;
  notifyProgress(onProgress, { stage: 'downloading', bytes: output.length });
  const blob = new Blob([output], { type: encrypted ? 'application/octet-stream' : 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: archiveFileName(snapshot).replace(/\.zip$/, encrypted ? '.vkt' : '.zip') });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  const durationMs = Math.round(performance.now() - startedAt);
  notifyProgress(onProgress, { stage: 'complete', bytes: output.length, messages: snapshot.messages.length, downloaded: media.downloaded, failed: media.unavailable.length, retries: media.retries || 0, total: media.discovered, durationMs });
  return { count: snapshot.messages.length, maxCmid: snapshot.stats.max, bytes: output.length, media, durationMs };
}

function notifyProgress(callback, detail) {
  try { callback?.(detail); } catch { /* UI progress must not interrupt an export. */ }
}

function prepareSnapshot(snapshot, settings, incrementalFrom) {
  let messages = snapshot.messages;
  if (incrementalFrom != null) messages = messages.filter((message) => Number.isFinite(message.conversation_message_id) && message.conversation_message_id > incrementalFrom);
  if (settings.rangeMode === 'recent') {
    const limit = Math.max(1, Math.min(100_000, Number(settings.recentCount) || 1000));
    messages = messages.slice(-limit);
  } else if (settings.rangeMode === 'dates') {
    const from = settings.dateFrom ? new Date(`${settings.dateFrom}T00:00:00`).valueOf() : -Infinity;
    const to = settings.dateTo ? new Date(`${settings.dateTo}T23:59:59.999`).valueOf() : Infinity;
    messages = messages.filter((message) => { const date = new Date(message.date).valueOf(); return Number.isFinite(date) && date >= from && date <= to; });
  }
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
      copy.reply = anonymizeRelated(copy.reply, aliases);
      copy.forwarded = (copy.forwarded || []).map((item) => anonymizeRelated(item, aliases));
    }
    if (settings.includeAttachments === false) {
      copy.attachments = [];
      copy.reply = stripRelatedAttachments(copy.reply);
      copy.forwarded = (copy.forwarded || []).map(stripRelatedAttachments);
    }
    return copy;
  });
  const coverage = analyzeCmids(messages);
  return { ...snapshot, peerId: settings.anonymize ? null : snapshot.peerId, title: settings.anonymize ? 'Обезличенный диалог' : snapshot.title, messages, incrementalFrom, stats: { count: messages.length, ...coverage } };
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
    schemaVersion: 5,
    generator: { name: 'VK Toolkit', version: chrome.runtime.getManifest().version },
    exportedAt: new Date().toISOString(),
    peerId: snapshot.peerId,
    dialogTitle: snapshot.title || '',
    incrementalFrom: snapshot.incrementalFrom,
    messages: {
      count: snapshot.stats.count,
      cmid: {
        min: snapshot.stats.min,
        max: snapshot.stats.max,
        coverage: snapshot.stats.coverage,
        missingCount: snapshot.stats.gaps || 0,
        missingRanges: snapshot.stats.missingRanges || [],
        historyStartReached: Boolean(snapshot.collection?.reachedStart || snapshot.collection?.status === 'complete'),
        unavailableCount: snapshot.collection?.reachedStart || snapshot.collection?.status === 'complete' ? snapshot.stats.uncollected || 0 : 0,
        unavailableRanges: snapshot.collection?.reachedStart || snapshot.collection?.status === 'complete' ? snapshot.stats.uncollectedRanges || [] : [],
        probablyUncollectedCount: snapshot.collection?.reachedStart || snapshot.collection?.status === 'complete' ? 0 : snapshot.stats.uncollected || 0,
        probablyUncollectedRanges: snapshot.collection?.reachedStart || snapshot.collection?.status === 'complete' ? [] : snapshot.stats.uncollectedRanges || [],
        collectedSegments: snapshot.stats.segments || [],
      },
      sources,
    },
    media,
    note: 'CMID is not guaranteed to be continuous. When the beginning of VK history is reached, absent ranges are classified as unavailable rather than uncollected.',
    files,
  };
}

export function asVerifier(manifest) {
  const payload = JSON.stringify({ files: manifest.files }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Проверка архива · VK Toolkit</title><style>body{max-width:900px;margin:40px auto;padding:0 20px;font:14px/1.45 system-ui;background:#f1f3f6;color:#20242a}main{padding:22px;background:#fff;border-radius:14px}input{display:block;margin:16px 0}table{width:100%;border-collapse:collapse}td,th{padding:7px;border-bottom:1px solid #ddd;text-align:left}.ok{color:#178a3d}.bad{color:#c33434}.muted{color:#6c7480}</style><main><h1>Проверка целостности</h1><p>Выберите распакованную папку <b>VK Dialog Export</b>. Проверка выполняется локально.</p><input id="folder" type="file" webkitdirectory multiple><p id="summary" class="muted">Ожидание папки</p><table><thead><tr><th>Файл</th><th>Статус</th></tr></thead><tbody id="results"></tbody></table></main><script type="application/json" id="manifest">${payload}</script><script>(()=>{const expected=JSON.parse(document.querySelector('#manifest').textContent).files,input=document.querySelector('#folder'),body=document.querySelector('#results'),summary=document.querySelector('#summary'),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');input.onchange=async()=>{const selected=[...input.files],rows=[];let ok=0;for(const item of expected){const file=selected.find(f=>f.webkitRelativePath.endsWith('/'+item.path)||f.name===item.path);if(!file){rows.push([item.path,'Не найден','bad']);continue}const hash=hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),valid=hash===item.sha256&&file.size===item.bytes;if(valid)ok++;rows.push([item.path,valid?'OK':'Повреждён',''+(valid?'ok':'bad')])}body.innerHTML=rows.map(r=>'<tr><td>'+r[0].replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</td><td class="'+r[2]+'">'+r[1]+'</td></tr>').join('');summary.textContent='Проверено '+ok+' из '+expected.length;summary.className=ok===expected.length?'ok':'bad'}})()</script></html>`;
}

export function archiveFileName(snapshot) {
  const title = sanitizeFilePart(snapshot.title) || 'Диалог';
  const peer = snapshot.peerId ?? 'unknown';
  const date = new Date().toISOString().slice(0, 10);
  return `VK Dialog - ${title} - ${peer} - ${date}.zip`;
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
  return { id: item.id, conversation_message_id: item.conversation_message_id, date: item.date, author: item.author, text: item.text, attachments: item.attachments, reply: item.reply || null, forwarded: item.forwarded || [], reactions: item.reactions || [], service: item.service || null };
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

function buildDiagnostics(snapshot, messages, media) {
  const sources = {};
  for (const message of snapshot.messages) sources[message.source || 'unknown'] = (sources[message.source || 'unknown'] || 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    messages: messages.length,
    sources,
    context: {
      replies: messages.filter((item) => item.reply).length,
      forwardedMessages: messages.reduce((sum, item) => sum + (item.forwarded?.length || 0), 0),
      messagesWithReactions: messages.filter((item) => item.reactions?.length).length,
      serviceMessages: messages.filter((item) => item.service).length,
    },
    media: { discovered: media.discovered, downloaded: media.downloaded, unavailable: media.unavailable.length, retries: media.retries || 0 },
  };
}

function anonymizeRelated(item, aliases) {
  if (!item) return null;
  const identity = item.author || 'unknown';
  if (!aliases.has(identity)) aliases.set(identity, `Участник ${aliases.size + 1}`);
  return { ...item, id: null, conversation_message_id: null, author: aliases.get(identity), attachments: [], forwarded: (item.forwarded || []).map((child) => anonymizeRelated(child, aliases)) };
}

function stripRelatedAttachments(item) {
  return item ? { ...item, attachments: [], forwarded: (item.forwarded || []).map(stripRelatedAttachments) } : null;
}
function asText(messages) { return messages.map((m) => `[${m.date}] ${m.author || m.peer_id}: ${m.text}${attachmentText(m.attachments)}`).join('\n'); }
function attachmentText(items) { return items?.length ? `\n  Вложения: ${items.map(attachmentUrl).filter(Boolean).join(', ')}` : ''; }
function asHtml(messages, peerId) {
  const rows = messages.map((m) => `<article><header><b>${escapeHtml(m.author || String(m.peer_id || ''))}</b><time>${escapeHtml(m.date)}</time><small>CMID ${m.conversation_message_id ?? '—'}</small></header><div>${escapeHtml(m.text).replace(/\n/g, '<br>')}</div>${attachmentHtml(m.attachments)}</article>`).join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VK dialog ${peerId || ''}</title><style>body{max-width:850px;margin:auto;padding:24px;font:15px/1.5 system-ui;background:#f0f2f5;color:#222}article{margin:10px 0;padding:12px 16px;background:#fff;border-radius:10px}header{display:flex;gap:10px;align-items:baseline}time,small{color:#777;font-size:12px}small{margin-left:auto}a{word-break:break-all}</style><h1>Диалог ${escapeHtml(String(peerId || ''))}</h1>${rows}</html>`;
}
function asViewerLegacy(messages, snapshot, mediaFiles = []) {
  const localMedia = new Map(mediaFiles.map((item) => [item.url, item.path]));
  const payload = JSON.stringify(messages.map((message) => ({ ...publicMessage(message), cmid: message.conversation_message_id, attachments: (message.attachments || []).map((item) => { const info = attachmentInfo(item); return { ...info, local: localMedia.get(info.url) || '' }; }) }))).replace(/</g, '\\u003c');
  const title = escapeHtml(snapshot.title || `Диалог ${snapshot.peerId || ''}`);
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · VK Toolkit</title><style>
  :root{color-scheme:light dark;--bg:#eef1f5;--card:#fff;--text:#1d2733;--muted:#6d7885;--accent:#447bba}body.dark{--bg:#151719;--card:#222529;--text:#edf0f3;--muted:#9ba3ad}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:16px;background:var(--card);box-shadow:0 1px 8px #0002}h1{max-width:980px;margin:0 auto 10px;font-size:20px}.tools,.summary{display:flex;max-width:980px;margin:auto;gap:8px;flex-wrap:wrap}.summary{margin-top:9px;color:var(--muted)}input,select,button{border:1px solid #8885;border-radius:8px;padding:8px;background:var(--bg);color:var(--text)}input{flex:1;min-width:220px}button{cursor:pointer}.messages{max-width:980px;margin:16px auto;padding:0 12px}.message{margin:8px 0;padding:12px 14px;background:var(--card);border-radius:10px}.message header{position:static;display:flex;padding:0 0 5px;box-shadow:none;gap:8px}.message time,.cmid{color:var(--muted);font-size:12px}.cmid{margin-left:auto}.empty{text-align:center;color:var(--muted);padding:50px}.attachment{display:block;margin-top:7px;word-break:break-all;color:var(--accent)}img.attachment{max-width:min(100%,600px);max-height:500px;border-radius:8px}audio.attachment{width:min(100%,480px)}</style>
  <header><h1>${title}</h1><div class="tools"><input id="search" placeholder="Поиск по сообщениям"><select id="author"><option value="">Все авторы</option></select><input id="cmid" inputmode="numeric" placeholder="Перейти к CMID"><button id="theme">Тема</button></div><div class="summary" id="summary"></div></header><main class="messages" id="messages"></main>
  <script type="application/json" id="data">${payload}</script><script>(()=>{const data=JSON.parse(document.querySelector('#data').textContent),root=document.querySelector('#messages'),search=document.querySelector('#search'),author=document.querySelector('#author'),cmid=document.querySelector('#cmid');[...new Set(data.map(x=>x.author).filter(Boolean))].sort().forEach(x=>author.add(new Option(x,x)));const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),media=v=>{const u=v.local||v.url||'',safe=/^(?:https:\\/\\/|media\\/)/i.test(u);if(!safe)return'';if(/\\.(?:jpe?g|png|gif|webp|avif)$/i.test(u))return'<img class="attachment" loading="lazy" src="'+esc(u)+'">';if(/\\.(?:mp3|ogg|m4a|wav)$/i.test(u))return'<audio class="attachment" controls src="'+esc(u)+'"></audio>';return'<a class="attachment" target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(v.url||u)+'</a>'};function render(){const q=search.value.toLowerCase(),a=author.value;const rows=data.filter(x=>(!q||x.text.toLowerCase().includes(q))&&(!a||x.author===a));root.innerHTML=rows.length?rows.map(x=>'<article class="message" data-cmid="'+(x.cmid??'')+'"><header><b>'+esc(x.author||'Без автора')+'</b><time>'+esc(x.date)+'</time><span class="cmid">CMID '+esc(x.cmid??'—')+'</span></header><div>'+esc(x.text).replace(/\\n/g,'<br>')+'</div>'+(x.attachments||[]).map(media).join('')+'</article>').join(''):'<div class="empty">Сообщения не найдены</div>';document.querySelector('#summary').textContent='Показано '+rows.length+' из '+data.length+' · Авторов '+new Set(data.map(x=>x.author).filter(Boolean)).size;}search.oninput=author.onchange=render;cmid.onchange=()=>document.querySelector('[data-cmid="'+CSS.escape(cmid.value)+'"]')?.scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('#theme').onclick=()=>document.body.classList.toggle('dark');render()})()</script></html>`;
}
export function asViewer(messages, snapshot, mediaFiles = []) {
  const localMedia = new Map(mediaFiles.map((item) => [item.url, item.path]));
  const data = messages.map((message) => ({
    ...publicMessage(message),
    cmid: message.conversation_message_id,
    attachments: (message.attachments || []).map((item) => { const info = attachmentInfo(item); return { ...info, local: localMedia.get(info.url) || '' }; }),
  }));
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  const title = escapeHtml(snapshot.title || `Диалог ${snapshot.peerId || ''}`);
  return viewerDocument(title, payload);
}

function viewerDocument(title, payload) {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · VK Toolkit</title><style>
:root{color-scheme:light dark;--bg:#eef1f5;--card:#fff;--text:#1d2733;--muted:#6d7885;--accent:#447bba}body.dark{--bg:#151719;--card:#222529;--text:#edf0f3;--muted:#9ba3ad}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:16px;background:var(--card);box-shadow:0 1px 8px #0002}h1{max-width:1100px;margin:0 auto 10px;font-size:20px}.tools,.summary{display:flex;max-width:1100px;margin:auto;gap:8px;flex-wrap:wrap}.summary{margin-top:9px;color:var(--muted)}input,select,button{border:1px solid #8885;border-radius:8px;padding:8px;background:var(--bg);color:var(--text)}input{flex:1;min-width:190px}button{cursor:pointer}.messages{max-width:1100px;margin:16px auto;padding:0 12px}.message{margin:8px 0;padding:12px 14px;background:var(--card);border-radius:10px}.message header{position:static;display:flex;padding:0 0 5px;box-shadow:none;gap:8px}.message time,.cmid{color:var(--muted);font-size:12px}.cmid{margin-left:auto}.empty{text-align:center;color:var(--muted);padding:50px}.context{margin:7px 0;padding:7px 10px;border-left:3px solid var(--accent);background:var(--bg);color:var(--muted);border-radius:5px}.reactions{margin-top:6px;color:var(--muted)}.attachments{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:8px}.attachment{display:block;min-width:0;word-break:break-word;color:var(--accent)}img.attachment{width:100%;max-height:360px;object-fit:contain;background:#0001;border-radius:8px;cursor:zoom-in}audio.attachment,video.attachment{width:100%;max-height:420px}.file-card{padding:10px;background:var(--bg);border-radius:8px;text-decoration:none}.file-card small{display:block;color:var(--muted)}dialog{max-width:95vw;max-height:95vh;padding:0;border:0;background:transparent}dialog::backdrop{background:#000c}dialog img{display:block;max-width:92vw;max-height:90vh}dialog button{position:fixed;top:14px;right:18px;background:#222;color:#fff}</style>
<header><h1>${title}</h1><div class="tools"><input id="search" placeholder="Поиск по сообщениям и файлам"><select id="author"><option value="">Все авторы</option></select><select id="kind"><option value="">Все сообщения</option><option value="with">С вложениями</option><option value="photo">Фото</option><option value="sticker">Стикеры</option><option value="voice">Голосовые</option><option value="audio">Аудио</option><option value="document">Документы</option><option value="video">Видео</option></select><input id="cmid" inputmode="numeric" placeholder="Перейти к CMID"><button id="theme">Тема</button></div><div class="summary" id="summary"></div></header><main class="messages" id="messages"></main><dialog id="lightbox"><button id="lightbox-close">Закрыть</button><img id="lightbox-image" alt="Просмотр вложения"></dialog>
<script type="application/json" id="data">${payload}</script><script>(()=>{
const data=JSON.parse(document.querySelector('#data').textContent),root=document.querySelector('#messages'),search=document.querySelector('#search'),author=document.querySelector('#author'),kind=document.querySelector('#kind'),cmid=document.querySelector('#cmid'),lightbox=document.querySelector('#lightbox'),lightboxImage=document.querySelector('#lightbox-image');
[...new Set(data.map(x=>x.author).filter(Boolean))].sort().forEach(x=>author.add(new Option(x,x)));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context=(x,label)=>x?'<div class="context"><b>'+label+(x.author?' · '+esc(x.author):'')+'</b><div>'+esc(x.text||'').split(String.fromCharCode(10)).join('<br>')+'</div></div>':'';
const reactionList=x=>(x.reactions||[]).length?'<div class="reactions">Реакции: '+x.reactions.map(r=>esc(r.id)+' × '+esc(r.count)).join(' · ')+'</div>':'';
const media=v=>{const u=v.local||v.url||'',lower=u.toLowerCase().split('?')[0].split('#')[0],safe=u.startsWith('https://')||u.startsWith('media/'),has=extensions=>extensions.some(ext=>lower.endsWith(ext)),label=v.name||v.type||'Вложение';if(!safe)return'';if(v.type==='photo'||v.type==='sticker'||has(['.jpg','.jpeg','.png','.gif','.webp','.avif']))return'<img class="attachment" data-lightbox src="'+esc(u)+'" loading="lazy" alt="'+esc(label)+'">';if(v.type==='voice'||v.type==='audio'||has(['.mp3','.ogg','.m4a','.wav']))return'<audio class="attachment" controls preload="none" src="'+esc(u)+'"></audio>';if(v.type==='video'||has(['.mp4','.webm']))return'<video class="attachment" controls preload="metadata" src="'+esc(u)+'"></video>';return'<a class="attachment file-card" target="_blank" rel="noopener noreferrer" href="'+esc(u)+'"><b>'+esc(label)+'</b><small>'+(v.local?'Локальный файл':'Внешняя ссылка')+' · '+esc(v.type||'attachment')+'</small></a>'};
function render(){const q=search.value.toLowerCase(),a=author.value,k=kind.value;const rows=data.filter(x=>{const items=x.attachments||[],hay=[x.text,x.author,x.reply?.text,...(x.forwarded||[]).map(v=>v.text),...items.map(v=>v.name||v.url||'')].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!a||x.author===a)&&(!k||(k==='with'?items.length:items.some(v=>v.type===k)))});root.innerHTML=rows.length?rows.map(x=>'<article class="message" data-cmid="'+(x.cmid??'')+'"><header><b>'+esc(x.author||'Без автора')+'</b><time>'+esc(x.date)+'</time><span class="cmid">CMID '+esc(x.cmid??'—')+'</span></header>'+context(x.reply,'Ответ')+(x.forwarded||[]).map(v=>context(v,'Переслано')).join('')+'<div>'+esc(x.text).split(String.fromCharCode(10)).join('<br>')+'</div>'+reactionList(x)+'<div class="attachments">'+(x.attachments||[]).map(media).join('')+'</div></article>').join(''):'<div class="empty">Сообщения не найдены</div>';root.querySelectorAll('[data-lightbox]').forEach(img=>img.onclick=()=>{lightboxImage.src=img.src;lightbox.showModal()});document.querySelector('#summary').textContent='Показано '+rows.length+' из '+data.length+' · Вложений '+rows.reduce((n,x)=>n+(x.attachments||[]).length,0)+' · Авторов '+new Set(data.map(x=>x.author).filter(Boolean)).size;}
search.oninput=author.onchange=kind.onchange=render;cmid.onchange=()=>{kind.value='';render();document.querySelector('[data-cmid="'+CSS.escape(cmid.value)+'"]')?.scrollIntoView({behavior:'smooth',block:'center'})};document.querySelector('#theme').onclick=()=>document.body.classList.toggle('dark');document.querySelector('#lightbox-close').onclick=()=>lightbox.close();lightbox.onclick=e=>{if(e.target===lightbox)lightbox.close()};render()})()</script></html>`;
}
function attachmentHtml(items = []) { return items.map((item) => { const url = attachmentUrl(item); return url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''; }).join(''); }
function attachmentUrl(item) { return attachmentInfo(item).url; }

export function attachmentInfo(item) {
  if (typeof item === 'string') return { type: inferMediaType(item), url: item, name: '' };
  if (!item || typeof item !== 'object') return { type: 'attachment', url: '', name: '' };
  const type = item.type || Object.keys(item).find((key) => ['photo', 'doc', 'audio', 'audio_message', 'video', 'sticker', 'graffiti'].includes(key)) || 'attachment';
  const value = item[type] || item;
  if (type === 'photo') {
    const sizes = [...(value.sizes || []), value.orig_photo].filter((entry) => entry?.url);
    const best = sizes.sort((left, right) => mediaArea(right) - mediaArea(left))[0];
    return { type, url: best?.url || value.max_size_url || value.url || '', name: '' };
  }
  if (type === 'audio_message') return { type: 'voice', url: value.link_mp3 || value.link_ogg || value.url || '', name: value.title || 'Голосовое сообщение' };
  if (type === 'doc') return { type: 'document', url: value.url || '', name: value.title || value.name || '' };
  if (type === 'audio') return { type, url: value.url || '', name: [value.artist, value.title].filter(Boolean).join(' — ') };
  if (type === 'sticker') {
    const images = [...(value.images_with_background || []), ...(value.images || [])].filter((entry) => entry?.url);
    const best = images.sort((left, right) => mediaArea(right) - mediaArea(left))[0];
    return { type, url: best?.url || value.url || '', name: '' };
  }
  return { type, url: value.url || value.player || item.url || '', name: value.title || value.name || '' };
}

function mediaArea(item) { return Number(item?.width || 0) * Number(item?.height || 0); }
function inferMediaType(url) {
  if (/\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(url)) return 'photo';
  if (/\.(?:mp3|ogg|m4a|wav)(?:$|[?#])/i.test(url)) return 'audio';
  if (/\.(?:mp4|webm)(?:$|[?#])/i.test(url)) return 'video';
  return 'attachment';
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

async function appendMedia(entries, messages, folder, logger, onProgress, signal) {
  const maxTotalBytes = 200_000_000;
  const references = collectMediaReferences(messages);
  const report = { discovered: references.length, downloaded: 0, retries: 0, totalBytes: 0, limitBytes: maxTotalBytes, files: [], unavailable: [] };
  const progress = (current) => notifyProgress(onProgress, { stage: 'media', current, total: references.length, downloaded: report.downloaded, failed: report.unavailable.length, retries: report.retries, bytes: report.totalBytes });
  progress(0);
  for (let index = 0; index < references.length; index++) {
    throwIfAborted(signal);
    const reference = references[index];
    if (!isDirectMediaUrl(reference.url)) {
      report.unavailable.push({ ...reference, reason: reference.url ? 'Вложение доступно только как ссылка' : 'URL вложения не найден' });
      progress(index + 1);
      continue;
    }
    try {
      const { data, contentType } = await fetchMediaWithRetry(reference.url, 3, signal, () => { report.retries++; progress(index); });
      if (report.totalBytes + data.length > maxTotalBytes) {
        report.unavailable.push({ ...reference, reason: 'Превышен общий лимит медиа 200 МБ' });
        continue;
      }
      const extension = mimeExtension(contentType) || urlExtension(reference.url);
      const path = mediaPath(reference, index, extension);
      entries.push({ name: `${folder}${path}`, data });
      report.downloaded++;
      report.totalBytes += data.length;
      report.files.push({ ...reference, path, bytes: data.length, contentType });
    } catch (error) { report.unavailable.push({ ...reference, reason: error.message || String(error) }); logger?.warn('Media was left as a link', reference.url, error); }
    progress(index + 1);
  }
  return report;
}

export function collectMediaReferences(messages) {
  const unique = new Map();
  for (const message of messages) for (const item of message.attachments || []) {
    const info = attachmentInfo(item);
    const key = info.url || `${message.conversation_message_id}:${info.type}:${info.name}`;
    const cmid = message.conversation_message_id ?? null;
    if (unique.has(key)) {
      const reference = unique.get(key);
      if (cmid != null && !reference.cmids.includes(cmid)) reference.cmids.push(cmid);
    } else unique.set(key, { ...info, cmids: cmid == null ? [] : [cmid] });
  }
  return [...unique.values()];
}

function skipMediaDownloads(messages, onProgress) {
  const references = collectMediaReferences(messages);
  notifyProgress(onProgress, { stage: 'media-skipped', total: references.length, downloaded: 0, bytes: 0 });
  return {
    discovered: references.length,
    downloaded: 0,
    retries: 0,
    totalBytes: 0,
    limitBytes: 200_000_000,
    downloadSkipped: true,
    files: [],
    unavailable: references.map((reference) => ({ ...reference, reason: 'Скачивание медиа отключено в настройках; сохранена исходная ссылка' })),
  };
}

function mediaPath(reference, index, extension) {
  const cmid = reference.cmids[0] ?? 'unknown';
  const type = sanitizeFilePart(reference.type || 'attachment').toLowerCase().replace(/\s+/g, '-') || 'attachment';
  const name = sanitizeFilePart(reference.name).replace(/\.[a-z0-9]{1,8}$/i, '').slice(0, 45);
  return `media/cmid-${cmid}-${type}-${String(index + 1).padStart(4, '0')}${name ? `-${name}` : ''}.${extension}`;
}

async function fetchMediaWithRetry(url, attempts, signal, onRetry) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    throwIfAborted(signal);
    try { return await fetchMedia(url, signal); }
    catch (error) { if (signal?.aborted) throw abortError(); lastError = error; if (attempt < attempts) { onRetry?.(attempt, error); await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } }
  }
  throw new Error(`Не удалось скачать после ${attempts} попыток: ${lastError?.message || lastError}`);
}

async function fetchMedia(url, signal) {
  throwIfAborted(signal);
  const requestId = crypto.randomUUID();
  const cancel = () => chrome.runtime.sendMessage({ type: 'media:cancel', requestId }).catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  let meta;
  try { meta = await chrome.runtime.sendMessage({ type: 'media:fetch', url, requestId }); }
  finally { signal?.removeEventListener('abort', cancel); }
  if (signal?.aborted) {
    if (meta?.token) chrome.runtime.sendMessage({ type: 'media:release', token: meta.token }).catch(() => {});
    throw abortError();
  }
  if (!meta?.ok) throw new Error(meta?.error || 'Не удалось загрузить медиа');
  const output = new Uint8Array(meta.size);
  let offset = 0;
  try {
    for (let index = 0; index < meta.chunks; index++) {
      throwIfAborted(signal);
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

function throwIfAborted(signal) { if (signal?.aborted) throw abortError(); }
function abortError() { const error = new Error('Экспорт отменён'); error.name = 'AbortError'; return error; }

function fromBase64(value) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function mimeExtension(mime = '') { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' })[mime.split(';')[0]]; }
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
