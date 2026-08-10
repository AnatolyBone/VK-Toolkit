import { mountStyle } from './hideClips.js';
import { clipsCss, compactMenuCss } from './hideClips.js';
import { storiesCss } from './hideStories.js';
import { customCss } from './customCss.js';

let styles = [];
let storageListener = null;
function apply(settings) {
  styles.forEach((style) => style.remove());
  styles = [
    settings.hideClips && mountStyle('vk-toolkit-hide-clips', clipsCss),
    settings.hideStories && mountStyle('vk-toolkit-hide-stories', storiesCss),
    settings.compactMenu && mountStyle('vk-toolkit-compact-menu', compactMenuCss),
    settings.customCss && mountStyle('vk-toolkit-custom-css', customCss(settings.customCss)),
  ].filter(Boolean);
}
export default {
  id: 'ui', name: 'Настройки интерфейса', version: '1.0.0', enabledByDefault: true,
  async init(ctx) {
    const settings = await ctx.storage.get('ui', { hideClips: false, hideStories: false, compactMenu: false, customCss: '' });
    apply(settings);
    storageListener = (changes, area) => { if (area === 'sync' && changes.ui) apply({ hideClips: false, hideStories: false, compactMenu: false, customCss: '', ...changes.ui.newValue }); };
    chrome.storage.onChanged.addListener(storageListener);
  },
  destroy() { styles.forEach((style) => style.remove()); styles = []; if (storageListener) chrome.storage.onChanged.removeListener(storageListener); storageListener = null; },
};
