import { ModuleManager } from './core/moduleManager.js';
import { Storage } from './core/storage.js';
import { EventBus } from './core/eventBus.js';
import debugModule from './modules/debug/module.js';
import uiModule from './modules/ui/module.js';
import photosModule from './modules/photos/module.js';
import dialogsModule from './modules/dialogs/module.js';

const storage = new Storage();
const events = new EventBus();

const context = { storage, events };

const manager = new ModuleManager(context);

[
  debugModule,
  dialogsModule,
  photosModule,
  uiModule,
].forEach((module) => manager.register(module));

manager.start();

window.VKToolkit = { manager, context };
