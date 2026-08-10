const MODULES_KEY = 'modules';

export class ModuleManager {
  constructor(context) {
    this.context = context;
    this.modules = new Map();
    this.active = new Set();
    this.started = false;
    this.onStorageChange = this.onStorageChange.bind(this);
  }

  register(module) {
    if (!module?.id || typeof module.init !== 'function' || typeof module.destroy !== 'function') {
      throw new TypeError('A module must expose id, init() and destroy()');
    }
    if (this.modules.has(module.id)) throw new Error(`Module "${module.id}" is already registered`);
    this.modules.set(module.id, module);
    return this;
  }

  async settings() {
    const saved = await this.context.storage.get(MODULES_KEY, {});
    return Object.fromEntries([...this.modules].map(([id, module]) => [
      id,
      saved[id] ?? module.enabledByDefault ?? false,
    ]));
  }

  isEnabled(id) { this.require(id); return this.active.has(id); }

  async enable(id, persist = true) {
    const module = this.require(id);
    if (!this.started) { if (persist) await this.saveState(id, true); return; }
    if (this.active.has(id)) { if (persist) await this.saveState(id, true); return; }
    try {
      await module.init({ ...this.context, moduleId: id, manager: this });
      this.active.add(id);
      if (persist) await this.saveState(id, true);
      this.context.events.emit('module:enabled', { id });
    } catch (error) {
      this.context.logger.child(id).error('Failed to initialize', error);
    }
  }

  async disable(id, persist = true) {
    const module = this.require(id);
    if (!this.active.has(id)) { if (persist) await this.saveState(id, false); return; }
    try {
      await module.destroy();
    } finally {
      this.active.delete(id);
      if (persist) await this.saveState(id, false);
      this.context.events.emit('module:disabled', { id });
    }
  }

  async start() {
    if (this.started) return;
    this.started = true;
    chrome.storage.onChanged.addListener(this.onStorageChange);
    const settings = await this.settings();
    for (const [id, enabled] of Object.entries(settings)) {
      if (enabled) await this.enable(id, false);
    }
  }

  async destroy() {
    chrome.storage.onChanged.removeListener(this.onStorageChange);
    for (const id of [...this.active].reverse()) await this.disable(id, false);
    this.started = false;
  }

  async saveState(id, enabled) {
    const modules = await this.context.storage.get(MODULES_KEY, {});
    await this.context.storage.set(MODULES_KEY, { ...modules, [id]: enabled });
  }

  onStorageChange(changes, area) {
    if (area !== 'sync' || !changes[MODULES_KEY]) return;
    const previous = changes[MODULES_KEY].oldValue || {};
    const current = changes[MODULES_KEY].newValue || {};
    for (const [id, module] of this.modules) {
      const before = previous[id] ?? module.enabledByDefault ?? false;
      const after = current[id] ?? module.enabledByDefault ?? false;
      if (before !== after) (after ? this.enable(id, false) : this.disable(id, false));
    }
  }

  require(id) {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Unknown module "${id}"`);
    return module;
  }
}
