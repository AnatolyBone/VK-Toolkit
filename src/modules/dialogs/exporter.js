const encoder = new TextEncoder();

export async function exportDialog(snapshot, { logger } = {}) {
  if (!snapshot.messages.length) throw new Error('Нет сообщений для экспорта');
  const folder = 'VK Dialog Export/';
  const dialog = snapshot.messages.map(publicMessage);
  const analysis = dialog.map(({ date, author, text }) => ({ date, author, text, type: 'message' }));
  const entries = [
    { name: `${folder}dialog.json`, data: pretty(dialog) },
    { name: `${folder}analysis.json`, data: pretty(analysis) },
    { name: `${folder}dialog.txt`, data: asText(snapshot.messages) },
    { name: `${folder}dialog.html`, data: asHtml(snapshot.messages, snapshot.peerId) },
    { name: `${folder}media/`, data: new Uint8Array() },
  ];
  await appendMedia(entries, dialog, folder, logger);
  const blob = new Blob([createZip(entries)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `vk-dialog-${snapshot.peerId || 'unknown'}.zip` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function publicMessage(item) {
  return { id: item.id, date: item.date, author: item.author, text: item.text, attachments: item.attachments };
}
function pretty(value) { return JSON.stringify(value, null, 2); }
function asText(messages) { return messages.map((m) => `[${m.date}] ${m.author || m.peer_id}: ${m.text}${attachmentText(m.attachments)}`).join('\n'); }
function attachmentText(items) { return items?.length ? `\n  Вложения: ${items.map(attachmentUrl).filter(Boolean).join(', ')}` : ''; }
function asHtml(messages, peerId) {
  const rows = messages.map((m) => `<article><header><b>${escapeHtml(m.author || String(m.peer_id || ''))}</b><time>${escapeHtml(m.date)}</time><small>CMID ${m.conversation_message_id ?? '—'}</small></header><div>${escapeHtml(m.text).replace(/\n/g, '<br>')}</div>${attachmentHtml(m.attachments)}</article>`).join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VK dialog ${peerId || ''}</title><style>body{max-width:850px;margin:auto;padding:24px;font:15px/1.5 system-ui;background:#f0f2f5;color:#222}article{margin:10px 0;padding:12px 16px;background:#fff;border-radius:10px}header{display:flex;gap:10px;align-items:baseline}time,small{color:#777;font-size:12px}small{margin-left:auto}a{word-break:break-all}</style><h1>Диалог ${escapeHtml(String(peerId || ''))}</h1>${rows}</html>`;
}
function attachmentHtml(items = []) { return items.map((item) => { const url = attachmentUrl(item); return url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ''; }).join(''); }
function attachmentUrl(item) {
  if (typeof item === 'string') return item;
  return item?.url || item?.photo?.orig_photo?.url || item?.video?.player || item?.doc?.url || '';
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

async function appendMedia(entries, messages, folder, logger) {
  const urls = [...new Set(messages.flatMap((m) => m.attachments || []).map(attachmentUrl).filter((url) => /^https:\/\//.test(url)))];
  for (let index = 0; index < urls.length; index++) {
    try {
      const response = await fetch(urls[index], { credentials: 'omit' });
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 30_000_000) continue;
      const data = new Uint8Array(await response.arrayBuffer());
      const extension = mimeExtension(response.headers.get('content-type')) || urlExtension(urls[index]);
      entries.push({ name: `${folder}media/${String(index + 1).padStart(4, '0')}.${extension}`, data });
    } catch (error) { logger?.warn('Media was left as a link', urls[index], error); }
  }
}
function mimeExtension(mime = '') { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3' })[mime.split(';')[0]]; }
function urlExtension(url) { return new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'bin'; }

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
