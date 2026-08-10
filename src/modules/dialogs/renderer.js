const utf8Encoder = new TextEncoder();
function formatBytes(bytes) { return bytes < 1_048_576 ? `${Math.ceil(bytes / 1024)} КБ` : `${(bytes / 1_048_576).toFixed(1)} МБ`; }

export class DialogRenderer {
  constructor({ collector, onCollect, onPause, onStop, onExport }) {
    this.collector = collector;
    this.onCollect = onCollect;
    this.onPause = onPause;
    this.onStop = onStop;
    this.onExport = onExport;
    this.exporting = false;
    this.exportEncrypted = false;
    this.exportOptions = { downloadMedia: true, encrypt: false };
    this.unsubscribers = [];
  }

  mount() {
    this.root = document.createElement('section');
    this.root.id = 'vk-toolkit-dialogs';
    this.root.innerHTML = `
      <style>
        #vk-toolkit-dialogs{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:250px;padding:14px;color:#e7e9ea;background:#19191a;border:1px solid #3f4146;border-radius:12px;box-shadow:0 8px 32px #0007;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}
        #vk-toolkit-dialogs[hidden]{display:none}#vk-toolkit-dialogs header{display:grid;font-size:14px;font-weight:700;margin-bottom:9px}#vk-toolkit-dialogs header small{overflow:hidden;color:#9ba1aa;font-size:11px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
        #vk-toolkit-dialogs .vkt-stats{display:grid;grid-template-columns:1fr auto;gap:3px 10px;color:#adb3bc;margin-bottom:10px}#vk-toolkit-dialogs .vkt-stats b{color:#fff;font-weight:600}
        #vk-toolkit-dialogs .vkt-actions{display:flex;gap:7px}#vk-toolkit-dialogs button{flex:1;border:0;border-radius:8px;padding:8px;background:#447bba;color:#fff;cursor:pointer}#vk-toolkit-dialogs button[data-pause],#vk-toolkit-dialogs button[data-stop],#vk-toolkit-dialogs button[data-cancel-export]{display:none;flex:0 0 34px;padding:8px 4px;background:#34373b}#vk-toolkit-dialogs[data-collecting] button[data-pause],#vk-toolkit-dialogs[data-collecting] button[data-stop],#vk-toolkit-dialogs[data-exporting] button[data-cancel-export]{display:block}#vk-toolkit-dialogs button:disabled{opacity:.55;cursor:not-allowed}
        #vk-toolkit-dialogs .vkt-health{margin:-2px 0 9px;color:#9ba1aa;font-size:11px}#vk-toolkit-dialogs .vkt-health[data-state="ok"]{color:#72ca84}#vk-toolkit-dialogs .vkt-health[data-state="warn"]{color:#e5ae55}
        #vk-toolkit-dialogs .vkt-progress{height:4px;margin:-3px 0 10px;overflow:hidden;background:#34373b;border-radius:4px}#vk-toolkit-dialogs .vkt-progress i{display:block;width:0;height:100%;background:#4c8dd7;transition:width .2s}
        #vk-toolkit-dialogs .vkt-error{color:#ff7a7a;margin-top:8px;white-space:pre-wrap}
        #vk-toolkit-dialogs .vkt-export-wizard{position:absolute;right:0;bottom:0;width:310px;padding:15px;background:#222326;border:1px solid #555;border-radius:12px;box-shadow:0 10px 35px #000a}#vk-toolkit-dialogs .vkt-export-wizard [hidden]{display:none!important}#vk-toolkit-dialogs .vkt-export-wizard h3{margin:0 0 10px;font-size:15px}#vk-toolkit-dialogs .vkt-export-wizard label{display:grid;gap:4px;margin:8px 0;color:#c8cbd0}#vk-toolkit-dialogs .vkt-export-wizard label.vkt-check{display:flex;align-items:center}#vk-toolkit-dialogs .vkt-export-wizard input,#vk-toolkit-dialogs .vkt-export-wizard select{box-sizing:border-box;width:100%;padding:7px;color:#fff;background:#151617;border:1px solid #4b4e53;border-radius:7px}#vk-toolkit-dialogs .vkt-export-wizard input[type=checkbox]{width:auto}#vk-toolkit-dialogs .vkt-export-summary{padding:8px;margin:10px 0;color:#aeb4bd;background:#171819;border-radius:7px}#vk-toolkit-dialogs .vkt-wizard-actions{display:flex;gap:7px}
      </style>
      <header><span>VK Toolkit · Диалог</span><small data-dialog-title>Определение диалога…</small></header>
      <div class="vkt-stats"><span>Получено:</span><b data-count>0 сообщений</b><span>CMID:</span><b data-range>—</b><span>Пропусков:</span><b data-gaps>0</b><span data-uncollected-label>Не собрано:</span><b data-uncollected>0</b><span>Текст:</span><b data-size>0 КБ</b></div>
      <div class="vkt-progress" title="Охват CMID"><i data-progress></i></div>
      <div class="vkt-health" data-health data-state="idle">Сбор ещё не запускался</div>
      <div class="vkt-actions"><button data-collect>Собрать</button><button data-pause title="Пауза">Ⅱ</button><button data-stop title="Остановить сбор">■</button><button data-cancel-export title="Отменить экспорт">✕</button><button data-export disabled>ZIP</button></div><div class="vkt-error" hidden></div>
      <div class="vkt-export-wizard" data-export-wizard hidden><h3>Настройка экспорта</h3><label>Диапазон<select data-range><option value="all">Все собранные сообщения</option><option value="recent">Последние N сообщений</option><option value="dates">Диапазон дат</option></select></label><label data-recent-row hidden>Количество<input data-recent type="number" min="1" max="100000" value="1000"></label><div data-date-row hidden><label>С даты<input data-date-from type="date"></label><label>По дату<input data-date-to type="date"></label></div><label class="vkt-check"><input data-wizard-media type="checkbox"> Скачать медиа в архив</label><label class="vkt-check"><input data-wizard-encrypt type="checkbox"> Зашифровать в VKT</label><div class="vkt-export-summary" data-wizard-summary></div><div class="vkt-wizard-actions"><button type="button" data-wizard-close>Отмена</button><button type="button" data-wizard-start>Начать</button></div></div>`;
    document.documentElement.appendChild(this.root);
    this.collectButton = this.root.querySelector('[data-collect]');
    this.exportButton = this.root.querySelector('[data-export]');
    this.pauseButton = this.root.querySelector('[data-pause]');
    this.stopButton = this.root.querySelector('[data-stop]');
    this.cancelExportButton = this.root.querySelector('[data-cancel-export]');
    this.wizard = this.root.querySelector('[data-export-wizard]');
    this.collectButton.addEventListener('click', () => this.run(this.onCollect));
    this.exportButton.addEventListener('click', () => this.openExportWizard());
    this.pauseButton.addEventListener('click', this.onPause);
    this.stopButton.addEventListener('click', this.onStop);
    this.cancelExportButton.addEventListener('click', () => this.cancelExport());
    this.root.querySelector('[data-wizard-close]').addEventListener('click', () => { this.wizard.hidden = true; });
    this.root.querySelector('[data-wizard-start]').addEventListener('click', () => { const options = this.readWizardOptions(); this.wizard.hidden = true; this.runExport(options); });
    for (const node of this.wizard.querySelectorAll('input,select')) node.addEventListener('input', () => this.updateWizard());
    this.unsubscribers.push(this.collector.events.on('dialogs:progress', (stats) => this.update(stats)));
    this.unsubscribers.push(this.collector.events.on('dialogs:collecting', (state) => {
      this.root.toggleAttribute('data-collecting', state.active);
      this.collectButton.disabled = state.active;
      this.collectButton.textContent = state.active ? `Сбор · ${state.iteration}` : 'Собрать';
      this.pauseButton.textContent = state.paused ? '▶' : 'Ⅱ';
      this.pauseButton.title = state.paused ? 'Продолжить' : 'Пауза';
      this.updateHealth(this.collector.store.stats(), state);
    }));
    this.update(this.collector.store.stats());
  }

  async run(action) {
    this.showError('');
    try { await action(); } catch (error) { this.showError(error.message || String(error)); }
  }

  async runExport(options = {}) {
    if (this.exporting) return;
    this.exporting = true;
    this.showError('');
    this.cancelExportButton.disabled = false;
    this.exportButton.disabled = true;
    this.collectButton.disabled = true;
    this.root.toggleAttribute('data-exporting', true);
    this.exportController = new AbortController();
    try { await this.onExport((detail) => this.showExportProgress(detail), this.exportController.signal, options); }
    catch (error) {
      if (error?.name === 'AbortError' || this.exportController.signal.aborted) {
        const health = this.root.querySelector('[data-health]');
        health.dataset.state = 'warn'; health.textContent = 'Экспорт отменён · архив не создан';
      } else this.showError(error.message || String(error));
    }
    finally {
      this.exporting = false;
      this.exportController = null;
      this.cancelExportButton.disabled = false;
      this.root.toggleAttribute('data-exporting', false);
      this.setExportFormat(this.exportEncrypted);
      this.exportButton.disabled = this.collector.store.stats().count === 0;
      this.collectButton.disabled = Boolean(this.collector.collection.active);
      setTimeout(() => { if (!this.exporting) this.updateHealth(this.collector.store.stats(), this.collector.collection); }, 1800);
    }
  }

  openExportWizard() {
    if (this.exporting || !this.collector.store.stats().count) return;
    this.wizard.querySelector('[data-wizard-media]').checked = this.exportOptions.downloadMedia !== false;
    this.wizard.querySelector('[data-wizard-encrypt]').checked = Boolean(this.exportOptions.encrypt);
    this.wizard.hidden = false;
    this.updateWizard();
  }

  readWizardOptions() {
    return {
      rangeMode: this.wizard.querySelector('[data-range]').value,
      recentCount: Number(this.wizard.querySelector('[data-recent]').value) || 1000,
      dateFrom: this.wizard.querySelector('[data-date-from]').value,
      dateTo: this.wizard.querySelector('[data-date-to]').value,
      downloadMedia: this.wizard.querySelector('[data-wizard-media]').checked,
      encrypt: this.wizard.querySelector('[data-wizard-encrypt]').checked,
    };
  }

  updateWizard() {
    const options = this.readWizardOptions();
    this.wizard.querySelector('[data-recent-row]').hidden = options.rangeMode !== 'recent';
    this.wizard.querySelector('[data-date-row]').hidden = options.rangeMode !== 'dates';
    let messages = this.collector.snapshot().messages;
    if (options.rangeMode === 'recent') messages = messages.slice(-Math.max(1, options.recentCount));
    if (options.rangeMode === 'dates') {
      const from = options.dateFrom ? new Date(`${options.dateFrom}T00:00:00`).valueOf() : -Infinity;
      const to = options.dateTo ? new Date(`${options.dateTo}T23:59:59.999`).valueOf() : Infinity;
      messages = messages.filter((message) => { const date = new Date(message.date).valueOf(); return Number.isFinite(date) && date >= from && date <= to; });
    }
    const attachments = messages.reduce((sum, message) => sum + (message.attachments?.length || 0), 0);
    const textBytes = messages.reduce((sum, message) => sum + utf8Encoder.encode(message.text || '').length, 0);
    const coverage = this.collector.store.stats();
    const complete = this.collector.collection.reachedStart || this.collector.collection.status === 'complete';
    const warning = coverage.uncollected
      ? complete
        ? ` · начало переписки достигнуто · отсутствуют/недоступны ${coverage.uncollected} CMID`
        : ` · ⚠ вероятно не собрано ${coverage.uncollected} CMID — можно отменить и продолжить сбор`
      : '';
    this.wizard.querySelector('[data-wizard-summary]').textContent = `${messages.length} сообщений · ${attachments} вложений · текст ${formatBytes(textBytes)}${options.downloadMedia ? ' · размер медиа определяется при загрузке' : ' · быстрый режим'}${warning}`;
  }

  cancelExport() {
    if (!this.exporting || !this.exportController) return;
    this.exportController.abort();
    this.cancelExportButton.disabled = true;
    const health = this.root.querySelector('[data-health]');
    health.dataset.state = 'warn'; health.textContent = 'Отмена экспорта…';
  }

  showExportProgress(detail) {
    const health = this.root.querySelector('[data-health]');
    health.dataset.state = detail.stage === 'complete' ? 'ok' : 'idle';
    const mb = detail.bytes ? ` · ${(detail.bytes / 1_048_576).toFixed(1)} МБ` : '';
    const labels = {
      preparing: 'Подготовка данных…',
      'media-skipped': `Быстрый экспорт · ${detail.total || 0} вложений оставлены ссылками`,
      building: `Упаковка архива${mb}…`,
      encrypting: `Шифрование архива${mb}…`,
      downloading: `Подготовка скачивания${mb}…`,
      complete: `Готово · скачан один архив${mb}`,
    };
    health.textContent = detail.stage === 'media'
      ? `Вложения ${detail.current}/${detail.total} · готово ${detail.downloaded} · из кэша ${detail.cacheHits || 0}${mb}`
      : labels[detail.stage] || 'Экспорт…';
    if (detail.stage === 'media') this.exportButton.textContent = detail.total ? `${Math.round((detail.current / detail.total) * 100)}%` : '…';
    else this.exportButton.textContent = detail.stage === 'complete' ? '✓' : '…';
  }

  update(stats) {
    if (!this.root) return;
    const snapshot = this.collector.snapshot();
    this.root.querySelector('[data-dialog-title]').textContent = `${snapshot.title || 'Без названия'} · peer ${snapshot.peerId ?? '—'}`;
    this.root.querySelector('[data-count]').textContent = `${stats.count} сообщений`;
    this.root.querySelector('[data-range]').textContent = stats.min == null ? '—' : `${stats.min} – ${stats.max}`;
    this.root.querySelector('[data-gaps]').textContent = String(stats.gaps);
    const complete = snapshot.collection.reachedStart || snapshot.collection.status === 'complete';
    this.root.querySelector('[data-uncollected-label]').textContent = complete ? 'Нет CMID:' : 'Не собрано:';
    this.root.querySelector('[data-uncollected]').textContent = String(stats.uncollected || 0);
    const coverage = complete ? 100 : (stats.coverage ?? 0);
    this.root.querySelector('[data-progress]').style.width = `${coverage}%`;
    const textBytes = snapshot.messages.reduce((sum, message) => sum + utf8Encoder.encode(message.text || '').length, 0);
    this.root.querySelector('[data-size]').textContent = textBytes < 1_000_000 ? `${Math.ceil(textBytes / 1024)} КБ` : `${(textBytes / 1_048_576).toFixed(1)} МБ`;
    this.updateHealth(stats, snapshot.collection);
    this.exportButton.disabled = this.exporting || stats.count === 0;
  }

  setExportFormat(encrypted) {
    if (!this.exportButton) return;
    this.exportEncrypted = encrypted;
    if (this.exporting) return;
    this.exportButton.textContent = encrypted ? 'VKT' : 'ZIP';
    this.exportButton.title = encrypted ? 'Зашифрованный архив .vkt' : 'Обычный ZIP-архив';
  }

  setExportOptions(settings = {}) { this.exportOptions = { ...this.exportOptions, ...settings }; }

  updateHealth(stats, collection) {
    if (this.exporting) return;
    const health = this.root.querySelector('[data-health]');
    if (collection?.active) {
      health.dataset.state = collection.paused ? 'warn' : 'idle';
      health.textContent = collection.paused ? `Пауза · цикл ${collection.iteration}` : `Сбор истории · без изменений ${collection.unchanged}/5`;
      return;
    }
    if (collection?.status === 'cancelled') { health.dataset.state = 'warn'; health.textContent = 'Сбор остановлен пользователем'; return; }
    if (collection?.status === 'restored') { health.dataset.state = 'ok'; health.textContent = 'Восстановлена сохранённая сессия · можно продолжить'; return; }
    if (collection?.status === 'complete') { health.dataset.state = 'ok'; health.textContent = stats.uncollected ? `Начало переписки достигнуто · отсутствуют/недоступны CMID: ${stats.uncollected}` : 'Достигнуто начало переписки'; return; }
    if (collection?.status === 'stable' && stats.count) { health.dataset.state = stats.uncollected || stats.gaps ? 'warn' : 'ok'; health.textContent = stats.uncollected ? `Собран фрагмент · продолжите сбор (${stats.coverage}% покрытия диапазона)` : stats.gaps ? `Сбор завершён · отдельных пропусков: ${stats.gaps}` : 'Сбор завершён · диапазон непрерывный'; return; }
    if (!stats.count) { health.dataset.state = 'idle'; health.textContent = 'Сбор ещё не запускался'; }
    else if (stats.min == null) { health.dataset.state = 'warn'; health.textContent = 'DOM fallback: CMID пока не получены'; }
    else if (stats.uncollected) { health.dataset.state = 'warn'; health.textContent = `Собран фрагмент · вероятно не собрано CMID: ${stats.uncollected}`; }
    else if (stats.gaps) { health.dataset.state = 'warn'; health.textContent = `Отдельные пропуски CMID: ${stats.gaps}`; }
    else { health.dataset.state = 'ok'; health.textContent = 'Диапазон CMID непрерывный'; }
  }

  showError(message) { const node = this.root.querySelector('.vkt-error'); node.textContent = message; node.hidden = !message; }
  setVisible(visible) { if (this.root) { this.root.hidden = !visible; if (visible) this.update(this.collector.store.stats()); } }
  unmount() { this.unsubscribers.forEach((off) => off()); this.unsubscribers = []; this.root?.remove(); this.root = null; }
}
