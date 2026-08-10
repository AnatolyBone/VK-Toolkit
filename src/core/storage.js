export class Storage {
  async get(key, fallback = null) {
    const result = await chrome.storage.sync.get(key);
    return result[key] ?? fallback;
  }

  async set(key, value) {
    return chrome.storage.sync.set({ [key]: value });
  }
}
