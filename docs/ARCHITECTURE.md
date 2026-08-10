# Архитектура VK Toolkit

## Запуск

Chrome загружает `bootstrap.js` как классический content script. Он выполняет динамический импорт `runtime.js` по extension URL. Runtime создаёт `Storage`, `EventBus`, `Logger` и `ModuleManager`, регистрирует модули и запускает включённые.

Контент работает в isolated world. Только перехват `fetch` и XHR выполняется небольшим `networkBridge.js` в контексте страницы; данные передаются назад через проверяемое событие `window.postMessage` того же origin.

`background.js` — Manifest V3 service worker. Он загружает только разрешённые прямые VK CDN URL, ограничивает файл 30 МБ и отдаёт его content script порциями. Это позволяет добавить медиа в ZIP без ослабления CORS страницы.

## Жизненный цикл

```js
export default {
  id: 'example',
  name: 'Пример',
  version: '1.0.0',
  enabledByDefault: true,
  init(ctx) {},
  destroy() {},
};
```

`ModuleManager` предоставляет `register`, `enable`, `disable`, `isEnabled`, `start` и `destroy`. Настройки состояния имеют вид:

```json
{ "modules": { "dialogs": true, "debug": true, "photos": false, "ui": true } }
```

Изменения `chrome.storage.sync` применяются к открытой странице без её перезагрузки. `destroy()` каждого модуля обязан удалить обработчики, observers и добавленный DOM.

## Сервисы контекста

- `storage` — promise-based оболочка над `chrome.storage.sync`.
- `events` — синхронная шина с `on/off/once/emit`.
- `logger` — единый префикс сообщений консоли.
- `manager` — управление состоянием модулей.

Инкрементальные точки (`lastCmid`) хранятся в `chrome.storage.local`: они относятся к конкретному браузеру и не синхронизируют сведения о диалогах через аккаунт Google.
