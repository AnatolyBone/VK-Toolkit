import { ModuleManager } from './core/moduleManager.js';
import { Storage } from './core/storage.js';
import { EventBus } from './core/eventBus.js';
import { Logger } from './core/logger.js';
import dialogs from './modules/dialogs/module.js';
import debug from './modules/debug/module.js';
import photos from './modules/photos/module.js';
import ui from './modules/ui/module.js';

const logger = new Logger('runtime');
const context = { storage: new Storage(), events: new EventBus(), logger };
const manager = new ModuleManager(context);

[dialogs, debug, photos, ui].forEach((module) => manager.register(module));
manager.start().catch((error) => logger.error('Startup failed', error));

globalThis.VKToolkit = { manager, context };
