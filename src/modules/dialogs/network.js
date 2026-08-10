const MESSAGE_TYPE = 'vk-toolkit:network-response';

export class DialogNetwork {
  constructor(onResponse, logger) {
    this.onResponse = onResponse;
    this.logger = logger;
    this.listener = this.listener.bind(this);
    this.script = null;
  }

  start() {
    window.addEventListener('message', this.listener);
    this.script = document.createElement('script');
    this.script.src = chrome.runtime.getURL('src/modules/dialogs/networkBridge.js');
    this.script.onload = () => this.script?.remove();
    const inject = () => (document.documentElement || document.head || document.body)?.appendChild(this.script);
    if (document.documentElement) inject();
    else document.addEventListener('readystatechange', inject, { once: true });
  }

  stop() {
    window.removeEventListener('message', this.listener);
    this.script?.remove();
    window.postMessage({ type: 'vk-toolkit:network-stop' }, location.origin);
  }

  listener(event) {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== MESSAGE_TYPE) return;
    this.onResponse(event.data.payload);
  }
}
