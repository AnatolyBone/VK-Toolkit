export class ModuleManager {
  constructor(context) {
    this.context = context;
    this.modules = new Map();
  }

  register(module) {
    if (!module?.id) return;
    this.modules.set(module.id, module);
  }

  async start() {
    for (const module of this.modules.values()) {
      if (module.enabled === false) continue;
      await module.init?.(this.context);
    }
  }

  async destroy() {
    for (const module of this.modules.values()) {
      await module.destroy?.();
    }
  }
}
