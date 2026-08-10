import { DialogCollector } from './collector.js';
import { DialogNetwork } from './network.js';
import { exportDialog } from './exporter.js';
import { DialogRenderer } from './renderer.js';
import { getPeerId, isMessagesPage } from './parser.js';

let state = null;

export default {
  id: 'dialogs',
  name: 'Экспорт переписок',
  version: '1.0.0',
  enabledByDefault: true,

  init(ctx) {
    const logger = ctx.logger.child('dialogs');
    const collector = new DialogCollector({ logger, events: ctx.events });
    const network = new DialogNetwork((payload) => collector.ingestNetwork(payload), logger);
    const exportCurrent = async () => {
      const settings = await ctx.storage.get('dialogs', { incremental: false, anonymize: false, includeAttachments: true, encrypt: false });
      let password = '';
      if (settings.encrypt) {
        password = window.prompt('Пароль для зашифрованного архива VK Toolkit:') || '';
        if (!password) throw new Error('Шифрование отменено: пароль не задан');
        const confirmation = window.prompt('Повторите пароль:') || '';
        if (password !== confirmation) throw new Error('Пароли не совпадают');
      }
      const snapshot = collector.snapshot();
      const local = await chrome.storage.local.get('dialogArchiveState');
      const previous = local.dialogArchiveState?.[snapshot.peerId] || {};
      const result = await exportDialog(snapshot, { logger, settings, password, incrementalFrom: settings.incremental ? previous.lastCmid : null });
      if (result.maxCmid != null) {
        await chrome.storage.local.set({ dialogArchiveState: { ...(local.dialogArchiveState || {}), [snapshot.peerId]: { lastCmid: result.maxCmid, exportedAt: new Date().toISOString(), title: snapshot.title } } });
      }
    };
    const renderer = new DialogRenderer({
      collector,
      onCollect: () => collector.collectFullHistory(),
      onPause: () => collector.togglePause(),
      onStop: () => collector.cancel(),
      onExport: exportCurrent,
    });
    const refresh = () => renderer.setVisible(isMessagesPage() && Boolean(getPeerId()));

    network.start();
    collector.start();
    renderer.mount();
    refresh();
    const refreshTimer = setInterval(refresh, 1000);
    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);
    state = { collector, network, renderer, refresh, refreshTimer };
    logger.info('Initialized');
  },

  destroy() {
    if (!state) return;
    state.network.stop();
    state.collector.stop();
    state.renderer.unmount();
    window.removeEventListener('popstate', state.refresh);
    window.removeEventListener('hashchange', state.refresh);
    clearInterval(state.refreshTimer);
    state = null;
  },
};
