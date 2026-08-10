# VK Toolkit

Набор локальных инструментов для актуального VK (`vk.ru`, с поддержкой `vk.com`), собранный как модульное браузерное расширение.

## Архитектура

Начиная с `0.2.0-dev` проект переходит на модульную структуру.

```text
VK-Toolkit/
├── manifest.json
├── src/
│   ├── bootstrap.js
│   ├── core/
│   │   ├── moduleManager.js
│   │   ├── storage.js
│   │   └── eventBus.js
│   │
│   ├── modules/
│   │   ├── dialogs/
│   │   ├── debug/
│   │   ├── photos/
│   │   └── ui/
│   │
│   └── popup/
│       ├── popup.html
│       ├── popup.js
│       └── popup.css
│
├── docs/
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Принцип модулей

Каждый модуль содержит:

- `id`
- `name`
- `init(context)`
- `destroy()`

Модули независимы и могут включаться/отключаться через систему настроек.

## Модули

### Dialogs
Экспорт и анализ истории переписок.

### Debug
Технические инструменты: ID, CMID, peer_id.

### Photos
Инструменты работы с фотографиями VK.

### UI
Настройки интерфейса VK.

## Разработка

Проект работает локально в браузере пользователя и не отправляет данные на внешние серверы.

Подробности:
- `docs/ARCHITECTURE.md`
- `docs/MODULES.md`
- `docs/DEVELOPMENT.md`

## Лицензия

MIT.
