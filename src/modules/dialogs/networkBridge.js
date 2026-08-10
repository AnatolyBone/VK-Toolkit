(() => {
  if (window.__vkToolkitNetworkBridge) return;
  window.__vkToolkitNetworkBridge = true;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const interesting = (url) => /message|history|conversation|im\b/i.test(String(url));
  const publish = (url, text) => {
    if (!interesting(url) || !text || text.length > 25_000_000) return;
    window.postMessage({ type: 'vk-toolkit:network-response', payload: { url: String(url), text } }, location.origin);
  };

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    if (interesting(args[0]?.url || args[0])) response.clone().text().then((text) => publish(response.url, text)).catch(() => {});
    return response;
  };
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__vkToolkitUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (interesting(this.__vkToolkitUrl)) this.addEventListener('load', () => {
      if (!this.responseType || this.responseType === 'text') publish(this.responseURL || this.__vkToolkitUrl, this.responseText);
    }, { once: true });
    return originalSend.apply(this, args);
  };
  window.addEventListener('message', function stop(event) {
    if (event.source !== window || event.data?.type !== 'vk-toolkit:network-stop') return;
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    window.__vkToolkitNetworkBridge = false;
    window.removeEventListener('message', stop);
  });
})();
