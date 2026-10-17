# Path: CHANGELOG.md
# Changelog
- **Version:** 0.1.0
- **Effective date:** [PENDING]
- **Last reviewed:** 2026-10-17
- **Operating mode:** MODE A (v0.1.0 in force); MODE B (v0.2.0 planned, not in force)
- **Status:** DRAFT: not legally reviewed

All notable changes to NutriLog (application code and legal/privacy documentation) are documented in this file. This project adheres to Semantic Versioning.

<!-- MODE B -->
## [0.2.0] - Planned (MODE B — NOT IN FORCE UNTIL CLOUD LAUNCH)
### Planned (Not Yet Implemented or Active)
- **Cloud Accounts & Multi-Device Sync:** Optional email + password accounts backed by Supabase (Postgres in EU region `[PENDING]`) with Row Level Security (RLS).
- **Explicit Sensitive Data Consent Flow:** Dedicated, unbundled sign-up checkbox (`mode_b_cloud_signup_v0.1.0`) for explicit health-data consent under GDPR Art. 9.2.a and Colombian Law 1581 of 2012 Art. 6.
- **Transactional Emails:** Password reset and security alerts via `[PENDING]`.
- **Paid Subscriptions:** Optional paid plans processed via `[PENDING payment provider]` with statutory 14-day EU withdrawal (`TRLGDCU`) and 5-business-day Colombian *retracto* (`Ley 1480 de 2011`) support.
<!-- MODE B -->

---

## [0.1.0] - 2026-10-17 (MODE A — Released & In Force)
### Added
- **Local-Only PWA Architecture (MODE A):** All user profiles, body metrics, calorie/macro goals, food/drink logs, water logs, and streaks are stored 100% locally in the user's browser via `IndexedDB`.
- **Offline Support:** Service Worker for caching static application assets on GitHub Pages.
- **Mifflin-St Jeor Calculator:** Local calculation of estimated BMR, TDEE, and macronutrient targets.
- **Calorie-Floor Health Warnings:** Automatic in-app warning banner (`calorie_floor_warning_v0.1.0`) whenever a daily calorie target falls below **1200 kcal (women)** or **1500 kcal (men)**.
- **In-App Data Rights Controls:** Full data export (`JSON`/`CSV`) and immediate local account/data deletion inside Settings.
- **Bilingual Legal & Compliance Documentation Suite (`v0.1.0`):** Drafted Spanish (`legal/es/`) and English (`legal/en/`) Terms of Use, Privacy Policy, Health Disclaimer, Local Storage Notice, Data Subject Rights Guide, UI Consent Texts, Retention & Deletion Policy, Refund & Withdrawal Policy, and internal compliance records (`docs/internal/`).