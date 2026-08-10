# VK Toolkit

Расширение для `vk.ru` и `vk.com` с независимыми модулями и настройками в `chrome.storage.sync`. Версия: **0.4.0**.

## Установка

1. Скачайте репозиторий.
2. Откройте `chrome://extensions` и включите «Режим разработчика».
3. Нажмите «Загрузить распакованное расширение» и выберите корень проекта.
4. Откройте или перезагрузите страницу VK. Настройки доступны по иконке расширения.

## Реализованные модули

- **Диалоги** — управляемый network-first сбор с DOM fallback, дедупликация по CMID, проверяемый ZIP, локальный viewer, аналитика, инкрементальный режим, обезличивание и AES-256-GCM шифрование.
- **Debug** — CMID, MSG ID, peer и дата сообщения при наведении.
- **Фото** — поиск URL максимального размера и кнопка «Открыть оригинал».
- **Интерфейс** — скрытие клипов и историй, компактное меню и пользовательский CSS.

## Структура

```text
src/
├── bootstrap.js
├── runtime.js
├── core/
│   ├── moduleManager.js
│   ├── storage.js
│   ├── eventBus.js
│   └── logger.js
├── modules/
│   ├── dialogs/  (module, collector, network, parser, dedupe, exporter, renderer)
│   ├── debug/    (module, overlay)
│   ├── photos/   (module, original)
│   └── ui/       (module, hideClips, hideStories, customCss)
└── popup/
```

Подробности: [архитектура](docs/ARCHITECTURE.md), [модули](docs/MODULES.md), [разработка](docs/DEVELOPMENT.md).

Данные диалогов обрабатываются локально. Внешний сервер VK Toolkit не используется. Лицензия MIT.
