# Path: README.md
# NutriLog — Personal Nutrition & Macro Tracker (PWA)
- **Version:** 0.1.0
- **Effective date:** [PENDING]
- **Last reviewed:** 2026-10-17
- **Operating mode:** MODE A (Local-Only Browser Storage in Force). Includes planned architecture for MODE B (not in force until cloud launch).
- **Status:** DRAFT: not legally reviewed

## 1. Overview
**NutriLog** is an offline-first Progressive Web Application (PWA) for adults (18+) in Colombia and Spain/EU to log daily meals, drinks, water intake, body weight, and physical activity, and to calculate estimated daily calorie and macronutrient targets using the **Mifflin-St Jeor** equation.

- **Wellness & Educational Boundary:** NutriLog is a general self-tracking and educational tool. It is **not** a medical device, does **not** diagnose or treat medical conditions, and does **not** provide individualized clinical dietary prescriptions.
- **Current Operating Mode (MODE A — Local-Only):** All user data stays 100% inside the user's browser (`IndexedDB`). There is no backend server, no analytics, no advertising, and no third-party tracking. Static files are hosted on GitHub Pages.

## 2. Key Features (v0.1.0 — MODE A)
- **Local Profile & Privacy Gate:** Create a local profile (login name, display name, sex, age, height, weight, activity level, goals). *Note: Local login is an on-screen privacy gate, NOT encryption at rest.*
- **Mifflin-St Jeor Calculator & Safety Warnings:** Calculates estimated Basal Metabolic Rate (BMR), Total Daily Energy Expenditure (TDEE), and macro splits, displaying mandatory health warnings whenever a target falls below **1200 kcal/day (women)** or **1500 kcal/day (men)**.
- **Daily Logging:** Log food and drinks (using approximate seed data or custom entries), water intake, weight history, and daily logging streaks.
- **Offline-First PWA:** Service Worker caches static assets for offline reliability.
- **Built-In Data Rights (Export & Delete):** One-click full data export (`JSON`/`CSV`) and immediate, irreversible local account/data deletion inside the app.

## 3. Architecture & Stack
- **Frontend Stack:** HTML5, CSS3, TypeScript / Vanilla ES Modules (or lightweight UI framework `[PENDING]`), Web App Manifest, Service Worker API.
- **Storage (MODE A — In Force):** Browser `IndexedDB` for structured user data; `Cache Storage` for static PWA assets.
- **Hosting:** GitHub Pages (static bundle deployment over HTTPS).
<!-- MODE B -->
- **Planned Cloud Stack (MODE B — NOT IN FORCE UNTIL CLOUD LAUNCH):** Supabase (Postgres database + Supabase Auth in EU region `[PENDING]`), transactional email via `[PENDING]`, and subscription payments via `[PENDING payment provider]`.
<!-- MODE B -->

## 4. Repository Folder Structure
```text
nutrilog/
├── README.md                  # Developer documentation & privacy-by-design rules
├── SECURITY.md                # Vulnerability reporting policy & security scope
├── CHANGELOG.md               # Release history (v0.1.0 released; v0.2.0 planned)
├── src/                       # Application source code (UI, Mifflin-St Jeor math, IndexedDB layer)
├── public/                    # Static assets, manifest.json, service-worker.js, seed food data
├── tests/                     # Unit and acceptance test suites
├── legal/
│   ├── es/                    # Spanish user-facing legal documents (8 files)
│   └── en/                    # English user-facing legal documents (8 files)
└── docs/
    └── internal/              # Internal compliance docs (ROPA, Breach Plan, DPIA, Maintenance)
```

## 5. Setup Instructions (Windows & macOS)

### Prerequisites
- **Node.js:** v20 LTS or higher (`node -v`)
- **npm:** v10 or higher (`npm -v`)
- **Git:** v2.40 or higher

### Setup on macOS
```bash
# 1. Clone the repository
git clone [https://github.com/](https://github.com/)[PENDING]/nutrilog.git
cd nutrilog

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

### Setup on Windows (PowerShell or Command Prompt)
```powershell
# 1. Clone the repository
git clone [https://github.com/](https://github.com/)[PENDING]/nutrilog.git
Set-Location nutrilog

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

## 6. Running, Building & Testing
- `npm run dev` — Starts the local development server with hot reload.
- `npm run build` — Compiles and bundles static production assets into `dist/`.
- `npm run preview` — Serves the production `dist/` folder locally to test the Service Worker.
- `npm test` — Runs unit tests (Mifflin-St Jeor math, calorie floor warnings, schema migrations).
- `npm run test:e2e` — Runs end-to-end acceptance tests.

### Mandatory Acceptance Tests Before Any Release
1. **Zero Network Leak Test (MODE A):** Verify in headless browser network inspector that creating a profile, logging food/water, exporting data, and deleting an account trigger **zero** outgoing HTTP/WebSocket requests containing user data.
2. **Calorie Floor Warning Test:** Verify that setting or calculating a target below `1200 kcal` (female profile) or `1500 kcal` (male profile) renders the mandatory non-dismissible health warning banner (`calorie_floor_warning_v0.1.0`).
3. **18+ Gate & Unchecked Consent Test:** Verify that sign-up checkboxes are unchecked by default and reject ages under 18.
4. **Data Export & Deletion Completeness Test:** Verify that exporting outputs all user stores (`profile`, `food_logs`, `water_logs`, `streaks`) and that clicking "Delete Account" wipes all `IndexedDB` object stores completely.

## 7. Database Schemas & Versioning

### 7.1. Local `IndexedDB` Schema (`nutrilog_db`, Schema Version `1`)
- **`users_local`:** `id` (UUID), `login_name`, `display_name`, `sex`, `age` (must be greater than or equal to 18), `height_cm`, `weight_kg`, `activity_level`, `goal_type`, `target_kcal`, `consent_version`, `consent_timestamp`, `created_at`.
- **`food_logs`:** `id` (UUID), `user_id`, `date_iso`, `meal_type`, `item_name`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `is_custom`.
- **`water_logs`:** `id` (UUID), `user_id`, `date_iso`, `amount_ml`.
- **`streaks`:** `user_id`, `current_streak_days`, `longest_streak_days`, `last_logged_date`.

<!-- MODE B -->
### 7.2. Planned Cloud Schema (MODE B — NOT IN FORCE UNTIL CLOUD LAUNCH)
- Hosted on Supabase Postgres (EU region `[PENDING]`).
- Mirrors the local stores above with `user_id` referencing `auth.users(id)` and mandatory Postgres **Row Level Security (RLS)** policies (`auth.uid() = user_id`) on every table, plus `updated_at` and `deleted_at` columns for conflict-free sync.
<!-- MODE B -->

## 8. Accounts Design (Local Now, Remote Later)
- **MODE A (v0.1.0 — Current):** Local accounts are keyed by `login_name` inside `IndexedDB`. Switching profiles on the same browser switches the active `user_id` filter. It is an on-screen privacy gate only, **not** cryptographic encryption at rest.
<!-- MODE B -->
- **MODE B (v0.2.0 — Planned, Not in Force):** Users may optionally stay in local-only mode OR opt in to a Supabase cloud account (email + password) after checking the separate explicit health-data consent checkbox (`mode_b_cloud_signup_v0.1.0`). Upon opt-in, local `IndexedDB` records can be migrated to the user's cloud account.
<!-- MODE B -->

## 9. How to Bump Cache and Schema Versions
1. **Bumping `IndexedDB` Schema Version:**
   - Increment `DB_VERSION` in `src/storage/db.ts` (e.g., from `1` to `2`).
   - Add a non-destructive migration block inside `onupgradeneeded(event)` so existing users do not lose their local logs.
   - Write a migration unit test verifying upgrade from `v(N-1)` to `vN`.
2. **Bumping Service Worker Cache Version:**
   - Increment `CACHE_NAME = "nutrilog-cache-v0.1.X"` in `public/service-worker.js`.
   - Ensure the `activate` event listener deletes old cache keys not matching the current `CACHE_NAME`.

## 10. Deploying to GitHub Pages
1. Run `npm test` and confirm all acceptance tests pass.
2. Run `npm run build` to generate the static `dist/` bundle.
3. Deploy via GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) on push to `main`, or via `npm run deploy`.
4. Verify HTTPS enforcement is enabled in GitHub Repository Settings -> Pages.

## 11. Security Rules & Privacy-by-Design Rules for Developers
Every contributor must follow these rules strictly:
1. **Data Minimization:** Never add fields to the database schema that are not strictly necessary for calorie/macro tracking.
2. **Zero Silent Network Calls:** Do **not** embed Google Fonts from external CDNs, Google Analytics, Sentry, Meta Pixels, or third-party CDNs without prior legal review and updating `local-storage-notice.md` and `privacy-policy.md`. Bundle all fonts and icons locally.
3. **Never Log Personal or Health Data:** Never pass user weight, age, food logs, or email addresses to `console.log` in production builds or to any error-monitoring service.
4. **Honest Security Messaging:** Never describe Mode A local login as "encrypted" in UI copy, comments, or release notes.
5. **Check the Legal Trigger List:** Before building any feature involving cloud sync, payments, AI, analytics, or new health formulas, check `docs/internal/legal-maintenance.md` (Section 4).

## 12. Coding Conventions
- Strict TypeScript (`"strict": true`).
- Bilingual parity: Any new UI legal string or disclaimer must be added to both `legal/es/` and `legal/en/` simultaneously.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `security:`).

## 13. Roadmap
- **v0.1.0 (Released — MODE A):** Local-only PWA (`IndexedDB` + Service Worker), Mifflin-St Jeor calculator, 1200/1500 kcal safety warnings, in-app JSON/CSV export and account deletion.
- **v0.2.0 (Planned — MODE B, Not in Force):** Optional Supabase cloud accounts (EU region `[PENDING]`), multi-device sync, transactional emails, and optional paid subscription plans.

## 14. Contributing
1. Fork the repository and create a feature branch.
2. Ensure all unit and acceptance tests pass (`npm test`).
3. Confirm your PR does not trigger any item on the Legal Trigger List (`docs/internal/legal-maintenance.md`) without accompanying legal doc updates.

## 15. License
Distributed under the **[PENDING]** license.