export class Storage {
  async get(key, fallback = null) {
    const result = await chrome.storage.sync.get(key);
    return result[key] ?? fallback;
  }

  async set(key, value) {
    await chrome.storage.sync.set({ [key]: value });
    return value;
  }

  async update(key, updater, fallback = {}) {
    const current = await this.get(key, fallback);
    return this.set(key, updater(current));
  }

  async remove(key) {
    await chrome.storage.sync.remove(key);
  }
}
