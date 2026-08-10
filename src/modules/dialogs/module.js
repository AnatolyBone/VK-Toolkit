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
    const renderer = new DialogRenderer({
      collector,
      onCollect: () => collector.collectFullHistory(),
      onExport: () => exportDialog(collector.snapshot(), { logger }),
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
