# Path: CHANGELOG.md
# Changelog

All notable changes to NutriLog are documented in this file. This project follows Semantic Versioning.

## 0.2.0 - 2026-10-17

### Added
- **Local Accounts & Authentication (`nutrilog-auth`):** Multi-account support on a single browser with PBKDF2 password hashing, per-user cryptographic salts, and an Auth Provider Interface ready for future cloud providers.
- **Per-Account Isolated Databases (`nutrilog-data-<accountId>`):** Dedicated Dexie `IndexedDB` database per account so multiple local users on the same device have strictly isolated foods, dishes, logs, and settings.
- **One-Time Recovery Code:** Generates a single-use recovery code (stored only as a PBKDF2 hash) at account creation to allow local password resets without a server.
- **Session Controls & Brute-Force Lockout:** Added optional 30-day "keep me signed in", automatic session lock after inactivity, and temporary account lockout after 5 consecutive failed login attempts.
- **Account Management & Backup Tools:** Added in-app password change, full account data JSON export, periodic in-app backup reminders, and permanent account deletion (which drops the account's local database and wipes all soft-deleted records).
- **Water, Drinks & Streaks Tracking:** Added daily hydration/drinks logging and consecutive day logging streak counters.
- **Bilingual Legal Pages (Drafts):** Added offline-ready Spanish and English legal pages (`legal/terms.html`, `legal/privacy.html`, `legal/health-disclaimer.html`, `legal/legal.css`) and versioned UI consent strings (`TERMS_VERSION`, `PRIVACY_VERSION`).

### Changed
- **Modular ES Architecture:** Split application logic into dedicated vanilla ES modules (`calc.js` for pure math, `db.js` for Dexie persistence and migrations, auth provider module, `ui.js`, `app.js`, and `config.js`) with local Dexie in `/vendor`.
- **Soft Deletes & Log Snapshots:** Standardized all records with UUIDs, `createdAt`, `updatedAt`, and `deleted` flags. Daily log entries now store immutable nutrition snapshots so editing or soft-deleting a food or dish preserves historical daily logs.
- **Strict Content Security Policy (CSP):** Removed inline scripts and inline styles across the app and legal pages, using relative paths for GitHub Pages compatibility (`/macro-tracker/`).

### Migration
- **Automatic Legacy `v0.1.0` Data Migration:** On first account setup in `0.2.0`, existing `v0.1.0` single-user foods, dishes, settings, and logs are automatically migrated into the user's new `nutrilog-data-<accountId>` database with UUIDs and audit timestamps.
- **Non-Destructive Fallback:** The legacy `v0.1.0` database is intentionally kept untouched in the browser until the user verifies their migrated records and explicitly removes it. If anything looks wrong after upgrading, **do not clear browser site data**—export a JSON backup first.

---

## 0.1.0 - Initial Release

### Added
- Initial single-user local-only PWA prototype for macro and calorie tracking (Mifflin-St Jeor calculator, foods catalog, dishes builder, daily food log, and Service Worker offline caching).