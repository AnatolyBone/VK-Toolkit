# Changelog

## 0.10.0

### Added

- Visible retry and failed-media counters during export.
- Final export report with message count, downloaded and failed media, archive size and elapsed time.
- Separate raw attachment and unique downloadable-file counts in the export wizard.

### Changed

- Removed the persistent 500 MB media cache and its popup controls.
- Media bytes now exist only in short-lived memory while the current file is transferred to the archive.
- Removed the no-longer-required `unlimitedStorage` permission.

## 0.9.1

### Fixed

- Reaching the visual beginning of a VK conversation now completes collection even when the minimum available CMID is greater than 1.
- Large CMID gaps are classified as unavailable after the history start is reached instead of producing an endless incomplete-history warning.
- Completed collection state survives page reloads and is recorded explicitly in `archive.json` schema version 3.

## 0.9.0

### Added

- Persistent extension media cache with a 500 MB limit and least-recently-used eviction.
- Cache hit counters in live export progress and `archive.json`.
- Media cache size, file count and clear action in the popup.

### Changed

- Repeated exports reuse cached VK CDN responses instead of downloading identical URLs again.
- Cache entries retain content type and are still subject to the existing per-file and archive limits.

## 0.8.0

### Added

- Compact CMID range analysis with collected segments and coverage percentage.
- Separate short missing ranges from large, probably uncollected history ranges.
- Incomplete-history warning in the export wizard.

### Changed

- `archive.json` schema version 2 stores compact ranges instead of thousands of individual missing CMIDs.
- Dialog panel now reports probable uncollected history separately from individual gaps.
- CMID analysis runs in linear time over collected IDs and no longer iterates across every absent number.

## 0.7.0

### Added

- Attachment filters for photos, stickers, voice messages, audio, documents and video in `viewer.html`.
- Fullscreen image lightbox for local and linked photos.
- Native audio and video players with lazy media loading.
- Document cards that distinguish local files from external links.
- Search across message text, authors, attachment names and URLs.

### Changed

- Viewer summary now reports both visible messages and attachment count.
- CMID navigation clears attachment filters before locating a message.

## 0.6.1

### Fixed

- Range-specific export wizard fields now hide correctly instead of being forced visible by label styles.

## 0.6.0

### Added

- Export wizard shown before ZIP/VKT generation.
- Full-history, last-N-messages and date-range export modes.
- Preflight summary with selected message count, attachment count and text size.
- Per-export media download and encryption choices without changing global defaults.

### Changed

- Clicking ZIP/VKT now opens a confirmation step instead of immediately starting a potentially large export.

## 0.5.3

### Added

- Independent `downloadMedia` option for fast dialog exports.
- Link-only mode keeps attachment metadata and original URLs without downloading binary files.

### Changed

- Popup now distinguishes preserving attachment links from downloading media into the offline archive.
- `archive.json` explicitly marks exports where media downloading was skipped by user choice.

## 0.5.2

### Added

- Cancel button for an active dialog export.
- Abort propagation from the dialog panel through the exporter to the background CDN request.

### Changed

- Cancelled exports stop the media queue, release cached chunks and never download a partial archive.
- The panel reports cancellation and becomes ready for a clean retry.

## 0.5.1

### Added

- Live export stages for preparation, media downloads, ZIP creation, encryption and browser download.
- Attachment progress with processed count, downloaded count and current archive size.

### Fixed

- The export action is locked until completion, preventing repeated clicks from downloading duplicate archives.
- A second defensive lock prevents concurrent exports even if the UI state changes while VK updates the page.

## 0.5.0

### Added

- Structured photo, document, audio, voice-message, video and sticker attachment metadata.
- Maximum-size photo and sticker selection.
- Human-readable media filenames linked to source CMIDs.
- Up to three download attempts for temporarily unavailable media.
- Attachment types, names, CMIDs, MIME types and failure reasons in `archive.json`.

### Changed

- `dialog.json` now includes `conversation_message_id` for every message.
- Unsupported or protected attachments remain available as original links instead of silently disappearing.

## 0.4.2

### Fixed

- Dialog settings now save immediately when a checkbox changes.
- The dialog export button now displays `VKT` when encrypted export is active and `ZIP` otherwise.
- Encryption state changes are reflected on an open VK page without reloading the extension.
- Password prompts and decryptor instructions now explain that the user creates the password and VK Toolkit cannot recover it.

## 0.4.1

### Added

- Persistent dialog collection sessions per peer.
- Automatic collection recovery after a VK page reload.
- CMID coverage progress indicator.
- Export date in archive filenames.

### Changed

- Resetting dialog history now also removes saved collection sessions.

## 0.4.0

### Added

- Password-protected `.vkt` archives using AES-256-GCM and PBKDF2-SHA-256.
- Local decryptor page that restores the original ZIP without uploading data.

### Security

- Passwords are requested at export time, kept only in memory and never written to extension storage.
- Authenticated encryption detects an incorrect password and any encrypted archive corruption.

## 0.3.1

### Added

- Offline `verify.html` for checking extracted files against SHA-256 and byte sizes.
- Explicit media byte totals and a 200 MB aggregate safety limit.

### Changed

- Large media archives now skip files beyond the safety limit and document every omission in `archive.json`.

## 0.3.0

### Added

- Dialog title and `peer_id` preview in the collection panel.
- Human-readable CMID completeness status before export.

### Changed

- Disable ZIP export until at least one message has been collected.

### Archive

- Added local `viewer.html` with search, author filter, CMID navigation and themes.
- Added `analytics.json` with activity, author, attachment and word statistics.
- Added incremental export state stored in `chrome.storage.local`.
- Added author anonymization and attachment exclusion controls.
- Added background media downloads with chunking and a 30 MB per-file limit.

## 0.2.4

### Added

- `archive.json` with export metadata, source counts and explicit missing CMIDs.
- SHA-256 checksums and byte sizes for every exported document and downloaded media file.
- Human-readable ZIP filenames containing the dialog title and `peer_id`.

### Changed

- Describe CMID gaps as potentially deleted or service messages instead of assuming data loss.

## 0.2.3

### Fixed

- Parse messages rendered by the current `ConvoHistory` VK interface.
- Collect author, text and visible date when VK omits message IDs from DOM attributes.
- Extract CMID-capable message objects from React page data as a best-effort source.
- Skip VK navigation links when downloading media to avoid CORS redirects during ZIP export.
- Merge DOM fallback records into their network/CMID versions instead of counting messages twice.

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
