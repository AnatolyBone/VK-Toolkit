import { OriginalPhotoTool } from './original.js';
let tool = null;
export default {
  id: 'photos', name: 'Оригиналы фотографий', version: '1.0.0', enabledByDefault: true,
  init() { tool = new OriginalPhotoTool(); tool.mount(); },
  destroy() { tool?.unmount(); tool = null; },
};
