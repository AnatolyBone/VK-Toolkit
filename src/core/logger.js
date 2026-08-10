export class Logger {
  constructor(scope = 'core') { this.scope = scope; }
  child(scope) { return new Logger(`${this.scope}:${scope}`); }
  debug(...args) { console.debug(`[VK Toolkit:${this.scope}]`, ...args); }
  info(...args) { console.info(`[VK Toolkit:${this.scope}]`, ...args); }
  warn(...args) { console.warn(`[VK Toolkit:${this.scope}]`, ...args); }
  error(...args) { console.error(`[VK Toolkit:${this.scope}]`, ...args); }
}
