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

  const scanned = new WeakSet();
  const compactRelated = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 2) return null;
    const forwarded = value.fwd_messages ?? value.fwdMessages;
    return {
      id: value.id ?? value.message_id ?? value.messageId,
      conversation_message_id: value.conversation_message_id ?? value.conversationMessageId ?? value.cmid,
      date: value.date ?? value.timestamp,
      from_id: value.from_id ?? value.fromId ?? value.sender_id,
      author: typeof value.author === 'string' ? value.author : '',
      text: typeof value.text === 'string' ? value.text : '',
      attachments: Array.isArray(value.attachments) ? value.attachments : [],
      fwd_messages: depth < 2 && Array.isArray(forwarded) ? forwarded.map((item) => compactRelated(item, depth + 1)).filter(Boolean) : [],
    };
  };
  const scanReactMessage = (element) => {
    if (!element || scanned.has(element)) return;
    scanned.add(element);
    const roots = [];
    let node = element;
    for (let level = 0; node && level < 4; level++, node = node.parentElement) {
      for (const key of Object.keys(node)) {
        if (key.startsWith('__reactProps') || key.startsWith('__reactFiber')) roots.push(node[key]);
      }
    }
    const messages = findReactMessages(roots);
    if (messages.length) publish('im-react-dom', JSON.stringify({ items: messages }));
  };

  const findReactMessages = (roots) => {
    const found = []; const visited = new WeakSet(); let inspected = 0;
    const walk = (value, depth) => {
      if (!value || typeof value !== 'object' || visited.has(value) || depth > 12 || inspected++ > 8000) return;
      visited.add(value);
      const cmid = value.conversation_message_id ?? value.conversationMessageId ?? value.cmid;
      if (cmid != null && (value.text != null || value.date != null || value.from_id != null || value.fromId != null)) found.push({
        id: value.id ?? value.message_id ?? value.messageId,
        conversation_message_id: cmid,
        peer_id: value.peer_id ?? value.peerId,
        date: value.date ?? value.timestamp,
        from_id: value.from_id ?? value.fromId ?? value.sender_id,
        author: typeof value.author === 'string' ? value.author : '',
        text: typeof value.text === 'string' ? value.text : '',
        attachments: Array.isArray(value.attachments) ? value.attachments : [],
        reply_message: compactRelated(value.reply_message ?? value.replyMessage),
        fwd_messages: Array.isArray(value.fwd_messages ?? value.fwdMessages) ? (value.fwd_messages ?? value.fwdMessages).map((item) => compactRelated(item)).filter(Boolean) : [],
        reactions: Array.isArray(value.reactions) ? value.reactions.map((item) => ({ reaction_id: item?.reaction_id ?? item?.reactionId ?? item?.id ?? item?.emoji, count: item?.count, user_ids: item?.user_ids ?? item?.userIds })) : [],
        action: value.action && typeof value.action === 'object' ? { type: value.action.type, member_id: value.action.member_id ?? value.action.memberId, text: value.action.text || value.action.email } : null,
      });
      if (Array.isArray(value)) { for (const child of value) walk(child, depth + 1); return; }
      for (const [key, child] of Object.entries(value)) {
        if (key === 'return' || key === 'child' || key === 'sibling' || key === 'stateNode' || key === '_owner') continue;
        walk(child, depth + 1);
      }
    };
    roots.forEach((root) => walk(root, 0));
    return [...new Map(found.map((item) => [item.conversation_message_id, item])).values()];
  };

  const scanExisting = () => document.querySelectorAll('.ConvoHistory__messageBlock').forEach(scanReactMessage);
  const reactObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) for (const added of mutation.addedNodes) {
      if (!(added instanceof Element)) continue;
      if (added.matches('.ConvoHistory__messageBlock')) scanReactMessage(added);
      added.querySelectorAll?.('.ConvoHistory__messageBlock').forEach(scanReactMessage);
    }
  });
  const startReactObserver = () => {
    if (!document.documentElement) return;
    reactObserver.observe(document.documentElement, { childList: true, subtree: true });
    scanExisting();
  };
  if (document.documentElement) startReactObserver();
  else document.addEventListener('readystatechange', startReactObserver, { once: true });

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
    reactObserver.disconnect();
    window.__vkToolkitNetworkBridge = false;
    window.removeEventListener('message', stop);
  });
})();
