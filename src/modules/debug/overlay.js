const SELECTOR = '[data-cmid],[data-conversation-message-id],[data-msgid],[data-message-id],.im-mess[data-msgid]';
export class DebugOverlay {
  mount() {
    this.tip = document.createElement('div');
    this.tip.id = 'vk-toolkit-debug-tip';
    Object.assign(this.tip.style, { position: 'fixed', zIndex: '2147483647', display: 'none', pointerEvents: 'none', padding: '7px 9px', borderRadius: '7px', background: '#111d', color: '#fff', font: '12px/1.45 ui-monospace,monospace', whiteSpace: 'pre' });
    document.documentElement.appendChild(this.tip);
    this.move = (event) => this.onMove(event);
    document.addEventListener('pointermove', this.move, { passive: true });
  }
  onMove(event) {
    const message = event.target.closest?.(SELECTOR);
    if (!message) { this.tip.style.display = 'none'; return; }
    const data = message.dataset;
    const date = data.date || data.timestamp || message.querySelector('time')?.dateTime || '—';
    const lines = [
      `CMID: ${data.cmid || data.conversationMessageId || '—'}`,
      `MSG ID: ${data.msgid || data.messageId || '—'}`,
      `PEER: ${data.peerId || data.peer || new URLSearchParams(location.search).get('sel') || '—'}`,
      `DATE: ${formatDate(date)}`,
    ];
    this.tip.textContent = lines.join('\n'); this.tip.style.display = 'block';
    const left = Math.min(event.clientX + 14, innerWidth - this.tip.offsetWidth - 8);
    const top = Math.min(event.clientY + 14, innerHeight - this.tip.offsetHeight - 8);
    this.tip.style.left = `${left}px`; this.tip.style.top = `${top}px`;
  }
  unmount() { document.removeEventListener('pointermove', this.move); this.tip?.remove(); }
}
function formatDate(value) { const numeric = Number(value); const date = new Date(numeric ? numeric * (numeric < 1e12 ? 1000 : 1) : value); return Number.isNaN(date.valueOf()) ? String(value) : date.toISOString(); }
