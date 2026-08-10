export class DialogRenderer {
  constructor({ collector, onCollect, onExport }) {
    this.collector = collector;
    this.onCollect = onCollect;
    this.onExport = onExport;
    this.unsubscribers = [];
  }

  mount() {
    this.root = document.createElement('section');
    this.root.id = 'vk-toolkit-dialogs';
    this.root.innerHTML = `
      <style>
        #vk-toolkit-dialogs{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:250px;padding:14px;color:#e7e9ea;background:#19191a;border:1px solid #3f4146;border-radius:12px;box-shadow:0 8px 32px #0007;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}
        #vk-toolkit-dialogs[hidden]{display:none}#vk-toolkit-dialogs header{font-size:14px;font-weight:700;margin-bottom:9px}
        #vk-toolkit-dialogs .vkt-stats{display:grid;grid-template-columns:1fr auto;gap:3px 10px;color:#adb3bc;margin-bottom:10px}#vk-toolkit-dialogs .vkt-stats b{color:#fff;font-weight:600}
        #vk-toolkit-dialogs .vkt-actions{display:flex;gap:7px}#vk-toolkit-dialogs button{flex:1;border:0;border-radius:8px;padding:8px;background:#447bba;color:#fff;cursor:pointer}#vk-toolkit-dialogs button:disabled{opacity:.55;cursor:wait}
        #vk-toolkit-dialogs .vkt-error{color:#ff7a7a;margin-top:8px;white-space:pre-wrap}
      </style>
      <header>VK Toolkit · Диалог</header>
      <div class="vkt-stats"><span>Получено:</span><b data-count>0 сообщений</b><span>CMID:</span><b data-range>—</b><span>Пропусков:</span><b data-gaps>0</b></div>
      <div class="vkt-actions"><button data-collect>Собрать</button><button data-export>ZIP</button></div><div class="vkt-error" hidden></div>`;
    document.documentElement.appendChild(this.root);
    this.collectButton = this.root.querySelector('[data-collect]');
    this.exportButton = this.root.querySelector('[data-export]');
    this.collectButton.addEventListener('click', () => this.run(this.onCollect));
    this.exportButton.addEventListener('click', () => this.run(this.onExport));
    this.unsubscribers.push(this.collector.events.on('dialogs:progress', (stats) => this.update(stats)));
    this.unsubscribers.push(this.collector.events.on('dialogs:collecting', (active) => {
      this.collectButton.disabled = active;
      this.collectButton.textContent = active ? 'Сбор…' : 'Собрать';
    }));
    this.update(this.collector.store.stats());
  }

  async run(action) {
    this.showError('');
    try { await action(); } catch (error) { this.showError(error.message || String(error)); }
  }
  update(stats) {
    if (!this.root) return;
    this.root.querySelector('[data-count]').textContent = `${stats.count} сообщений`;
    this.root.querySelector('[data-range]').textContent = stats.min == null ? '—' : `${stats.min} – ${stats.max}`;
    this.root.querySelector('[data-gaps]').textContent = String(stats.gaps);
  }
  showError(message) { const node = this.root.querySelector('.vkt-error'); node.textContent = message; node.hidden = !message; }
  setVisible(visible) { if (this.root) this.root.hidden = !visible; }
  unmount() { this.unsubscribers.forEach((off) => off()); this.unsubscribers = []; this.root?.remove(); this.root = null; }
}
