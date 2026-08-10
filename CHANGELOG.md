# Changelog

## 0.2.2

### Fixed

- Filter network messages by the active `peer_id` so CMIDs from different dialogs cannot mix.
- Reset collected messages when navigating to another dialog.
- Detect scrollable history containers used by current VK layouts.
- Log the selected history container for easier selector diagnostics.

## 0.2.1

### Added

- Working module manager
- Dialog exporter migration
- Debug overlay
- Photo tools
- UI tweaks and custom CSS
- Persistent popup settings

### Changed

- Fixed the content-script entry point for native ES modules.
- Updated documentation and extension metadata.

## 0.2.0

### Changed

- Migrated project layout to a modular architecture.
- Updated manifest for the `src`-based structure.
- Added popup foundation.

## 0.1.0

- Initial VK Toolkit release.
