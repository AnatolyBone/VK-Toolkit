# Architecture

## Overview

VK Toolkit uses a modular extension architecture.

Core components:

- ModuleManager — module lifecycle
- Storage — settings persistence
- EventBus — communication between modules
- Bootstrap — application startup

## Module lifecycle

```js
{
  id: 'example',
  name: 'Example',
  init(context) {},
  destroy() {}
}
```

## Goals

- isolate VK-specific logic;
- keep modules independent;
- allow future plugins;
- simplify maintenance.
