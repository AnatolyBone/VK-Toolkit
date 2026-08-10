(() => {
  const runtimeUrl = chrome.runtime.getURL('src/runtime.js');
  import(runtimeUrl).catch((error) => console.error('[VK Toolkit] Startup failed', error));
})();
