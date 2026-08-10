# Development

## Architecture

VK Toolkit is built as a modular browser extension.

Each feature should be isolated inside a module with:

- id
- name
- settings
- init()
- destroy()

## Guidelines

- Do not mix UI tweaks with data collection.
- Keep VK-specific selectors isolated.
- Avoid external servers for user data.
- Prefer local storage.

## Future

The project may move to a build system when the number of modules grows.
