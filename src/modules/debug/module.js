import { DebugOverlay } from './overlay.js';

let overlay = null;
let storageListener = null;
export default {
  id: 'debug', name: 'ID сообщений', version: '1.0.0', enabledByDefault: true,
  async init(ctx) {
    const settings = await ctx.storage.get('debug', { showMessageIds: true });
    const apply = (enabled) => {
      overlay?.unmount(); overlay = null;
      if (enabled) { overlay = new DebugOverlay(); overlay.mount(); }
    };
    apply(settings.showMessageIds);
    storageListener = (changes, area) => { if (area === 'sync' && changes.debug) apply(changes.debug.newValue?.showMessageIds ?? true); };
    chrome.storage.onChanged.addListener(storageListener);
  },
  destroy() { overlay?.unmount(); overlay = null; if (storageListener) chrome.storage.onChanged.removeListener(storageListener); storageListener = null; },
};
