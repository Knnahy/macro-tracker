# Path: README.md
# NutriLog (README v2)

Personal macro, calorie, and daily nutrition tracker running as an offline-capable Progressive Web Application (PWA).

- **Live App:** [https://knnahy.github.io/macro-tracker/](https://knnahy.github.io/macro-tracker/)
- **Status:** `v0.2.0, local-only, personal project`

---

## 1. Overview

NutriLog is a browser-based nutrition and macronutrient tracker for adults (18+). In **v0.2.0 (Mode A — Local-Only)**, all accounts, passwords, settings, foods, dishes, and daily logs stay inside your device's browser (`IndexedDB`). There is no backend server, no cloud database, no analytics, and no advertising.

NutriLog provides general educational information and mathematical estimates only. It is not a medical device and does not provide medical advice or individualized dietary prescriptions.

---

## 2. Features (v0.2.0)

Only features that exist in the current build are listed below:

- **Macro and Calorie Targets (Mifflin-St Jeor):** Calculates estimated Basal Metabolic Rate (BMR), Total Daily Energy Expenditure (TDEE), and daily calorie/macronutrient targets, with automatic safety warnings if a target falls below 1200 kcal (women) or 1500 kcal (men).
- **Foods Database (CRUD + Import/Export):** Create, view, edit, and soft-delete custom foods alongside default seed foods, plus import and export food catalogs as JSON.
- **Dishes Builder:** Combine multiple foods and ingredient weights into reusable multi-ingredient dishes/recipes with automatic macro summation.
- **Daily Log:** Log food and dish portions by meal and date, storing self-contained nutritional snapshots so historical logs do not break if a food item is edited later.
- **Water and Drinks Tracking:** Log daily water intake and beverage entries toward daily hydration goals.
- **Streaks:** Tracks consecutive daily logging streaks.
- **Local Accounts with Login:** Multiple isolated local accounts on the same browser, protected by a local login screen and PBKDF2 password hashing.
- **Auto-Lock and Lockout:** Automatic session lock after inactivity, optional 30-day "keep me signed in" setting, and temporary lockout after 5 failed login attempts.
- **One-Time Recovery Code:** Generates a single-use recovery code at sign-up (and upon rotation) to reset a forgotten local password.
- **Full JSON Export:** One-click export of all account data (`profile`, `foods`, `dishes`, `daily logs`, `water logs`, `streaks`) as a structured JSON file.
- **Delete Account:** Permanently deletes the active local account and wipes its dedicated per-account `IndexedDB` database (including all soft-deleted records).
- **Offline PWA:** Installable web app with a Service Worker that caches application assets for offline use.
- **Bilingual Legal Pages (Draft):** Built-in Spanish and English draft legal pages (`legal/terms.html`, `legal/privacy.html`, `legal/health-disclaimer.html`) with an offline CSS language switch.

---

## 3. Stack and Architecture

- **Markup & Styling:** Semantic HTML5 and responsive CSS3 (dark/light mode via `prefers-color-scheme`, no external fonts or CSS frameworks).
- **Scripting:** Vanilla JavaScript (ES Modules), zero build step or bundler required.
- **Database Engine:** [Dexie.js](https://dexie.org/) loaded locally as a global script from `/vendor` wrapping browser `IndexedDB`.
- **Offline Layer:** Native Service Worker API and Web App Manifest.

### Module Diagram

```text
                    +-------------------+
                    |    index.html     |
                    +---------+---------+
                              |
              +---------------+---------------+
              |                               |
              v                               v
    +-------------------+           +-------------------+
    | /vendor/dexie.js  |           |      app.js       |
    |  (Global Dexie)   |           | (Bootstrap & Flow)|
    +---------+---------+           +---------+---------+
              |                               |
              |        +----------------------+----------------------+
              |        |                      |                      |
              |        v                      v                      v
              |  +-----------+          +-----------+          +-----------+
              |  | config.js |          |   ui.js   |          |  calc.js  |
              |  | (Versions |          | (DOM, Esc |          | (Pure Math|
              |  | & Consts) |          | & Events) |          | No DOM/DB)|
              |  +-----------+          +-----+-----+          +-----------+
              |                               |
              +---------------+---------------+
                              |
              +---------------+---------------+
              |                               |
              v                               v
    +-------------------+           +-------------------+
    |   Auth Provider   |           |       db.js       |
    |     Interface     |           | (Dexie Schemas,   |
    | (Local PBKDF2 ->  |           |  CRUD, Snapshots  |
    |  Future Supabase) |           |  & v0.1 Migration)|
    +---------+---------+           +---------+---------+
              |                               |
              v                               v
    [ IndexedDB: nutrilog-auth ]    [ IndexedDB: nutrilog-data-<accountId> ]
```

- **`config.js`:** Holds `APP_VERSION`, `TERMS_VERSION`, `PRIVACY_VERSION`, lockout thresholds, calorie floor constants, and default configuration.
- **`calc.js`:** Pure mathematical functions (Mifflin-St Jeor BMR/TDEE, macro calories, gram scaling, streak calculations). Contains zero DOM and zero database code.
- **`db.js`:** Manages the per-account Dexie database (`nutrilog-data-<accountId>`), schema versioning, soft-delete filtering, JSON import/export, and legacy v0.1 migration.
- **Auth Provider Interface (`auth.js` / auth module):** Abstracts account creation, login, logout, password change, recovery code reset, inactivity auto-lock, and 5-attempt lockout against `nutrilog-auth`. Designed so a future cloud provider (Supabase) can plug into the same interface.
- **`ui.js`:** Renders views, escapes user strings before DOM insertion, binds event listeners (no inline HTML handlers), and manages forms and modals.
- **`app.js`:** Application entry point; coordinates auth state, database initialization, Service Worker registration, and UI rendering.

---

## 4. Folder Tree

```text
macro-tracker/
├── index.html
├── manifest.json
├── service-worker.js
├── README.md
├── CHANGELOG.md
├── SECURITY.md
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── calc.js
│   ├── config.js
│   ├── db.js
│   └── ui.js
├── vendor/
│   └── dexie.min.js
└── legal/
    ├── terms.html
    ├── privacy.html
    ├── health-disclaimer.html
    ├── legal.css
    ├── es/
    │   └── consent-texts.md
    └── en/
        └── consent-texts.md
```

*(Note: If your local working tree places `.js` or `.css` files at the root instead of `/js` and `/css`, keep relative imports matching the root layout. Internal compliance drafts are stored privately outside the Git repository and are never committed).*

---

## 5. Data Model

NutriLog separates authentication metadata from nutrition data using two browser `IndexedDB` database namespaces via Dexie:

### 5.1. Global Auth Database: `nutrilog-auth`
Stores local account records and active session state across the browser:
- **`accounts`:** `id` (UUID), `username` (normalized login name), `displayName`, `passwordHash` (PBKDF2), `passwordSalt`, `recoveryHash` (PBKDF2), `recoverySalt`, `failedAttempts`, `lockoutUntil`, `termsVersion`, `privacyVersion`, `consentAt`, `createdAt`, `updatedAt`, `deleted`.
- **`sessions`:** `id`, `accountId`, `createdAt`, `expiresAt` (supports optional 30-day "keep me signed in"), `lastActiveAt` (for inactivity auto-lock).

### 5.2. Per-Account Data Database: `nutrilog-data-<accountId>`
Each local account gets its own isolated Dexie database named `nutrilog-data-<accountId>`:
- **`profile` / `settings`:** `id`, `sex`, `age`, `heightCm`, `weightKg`, `activityLevel`, `goalType`, `targetKcal`, `proteinRatio`, `carbsRatio`, `fatRatio`, `waterGoalMl`, `lastBackupPromptAt`, `createdAt`, `updatedAt`, `deleted`.
- **`foods`:** `id` (UUID), `name`, `brand`, `kcalPer100g`, `proteinPer100g`, `carbsPer100g`, `fatPer100g`, `defaultGrams`, `isSeed`, `createdAt`, `updatedAt`, `deleted`.
- **`dishes`:** `id` (UUID), `name`, `items` (array of `{ foodId, nameSnapshot, grams, kcal, protein, carbs, fat }`), `totalGrams`, `totalKcal`, `totalProtein`, `totalCarbs`, `totalFat`, `createdAt`, `updatedAt`, `deleted`.
- **`logs` (daily food & drink entries):** `id` (UUID), `date` (`YYYY-MM-DD`), `mealType`, `sourceType` (`food` | `dish` | `quick`), `sourceId`, `grams`, `snapshot` (`{ name, kcal, protein, carbs, fat }`), `createdAt`, `updatedAt`, `deleted`.
- **`waterLogs`:** `id` (UUID), `date` (`YYYY-MM-DD`), `amountMl`, `beverageName`, `createdAt`, `updatedAt`, `deleted`.
- **`streaks`:** `id`, `currentStreak`, `longestStreak`, `lastLoggedDate`, `updatedAt`, `deleted`.

### 5.3. Record Conventions
- **UUIDs:** Every entity uses a UUID (`crypto.randomUUID()`) as its primary key to avoid collisions during JSON imports and future sync.
- **Audit & Sync Metadata:** Every record includes `createdAt` (ISO timestamp), `updatedAt` (ISO timestamp), and `deleted` (`boolean` / timestamp flag).
- **Soft Deletes:** Deleting a food, dish, or log entry in the UI sets `deleted = true` and updates `updatedAt`. Soft-deleted records are hidden from active UI queries but remain on the device until the user deletes their account (which drops `nutrilog-data-<accountId>`).
- **Snapshots in Log Entries:** Daily log entries store a frozen copy (`snapshot`) of the item's name, calories, and macros at the moment of logging. Editing or soft-deleting a food in the catalog never corrupts past daily totals.
- **Schema Versions & Migrations:** Dexie `db.version(N).stores({...}).upgrade(tx => ...)` manages non-destructive schema upgrades when fields or indexes are added.

---

## 6. Accounts and Security Design

### What Is Stored
- **PBKDF2 Password Hashing:** Passwords are never stored in plain text. They are hashed in the browser using the Web Crypto API (`PBKDF2` with SHA-256 and a random per-user salt).
- **One-Time Recovery Code:** On account creation, a high-entropy recovery code is generated and displayed **once** to the user. Only its PBKDF2 hash and salt are stored in `nutrilog-auth`. If the user forgets their password, the recovery code verifies identity, lets them set a new password, and rotates the recovery code. **Without the password or the recovery code, nobody (including the developer) can recover the account.**
- **Lockout & Auto-Lock:**
  - **5 Failed Attempts:** After 5 consecutive failed password attempts, the account is temporarily locked (`lockoutUntil`).
  - **Inactivity Auto-Lock:** Active sessions lock automatically after the configured idle timeout.
  - **30-Day Session Option:** Users can opt into "keep me signed in" for 30 days on trusted personal devices.

### Limits (Important)
**Local login is a visual privacy gate on a shared device and is NOT encryption at rest.** All records inside `IndexedDB` (`nutrilog-data-<accountId>`) are stored as unencrypted browser data on your device's disk. Anyone with physical access to an unlocked device, OS user profile, or browser Developer Tools can inspect or delete `IndexedDB` tables without logging in. Do not use "keep me signed in" on public or shared computers, and always protect your device with an operating system passcode and disk encryption (such as BitLocker or FileVault).

---

## 7. Legacy v0.1 Migration

When a user upgrades from `v0.1.0` (which stored single-user data without accounts) to `v0.2.0`:
1. Upon creating the first local account in `v0.2.0` (or via the migration prompt), `db.js` detects the legacy `v0.1` IndexedDB database/stores.
2. It copies all legacy profile settings, custom foods, dishes, and daily logs into the new `nutrilog-data-<accountId>` database, assigning UUIDs, `createdAt`/`updatedAt` timestamps, and `deleted: false` flags, and verifies that migrated record counts match.
3. **Old Database Kept for Safety:** The legacy `v0.1` database is **not** automatically deleted during migration. It remains untouched in the browser until you confirm your migrated data looks right and explicitly choose to remove the legacy data.
4. **What to Do If Something Looks Wrong:** **Do NOT clear browser site data or uninstall the PWA.** Clearing site data wipes both the new and legacy databases permanently. Instead, export a JSON backup immediately and inspect or re-run the migration from the preserved legacy database.

---

## 8. Run Locally on Windows and Mac

Because NutriLog uses native ES modules without a bundler, you only need a static local HTTP server (opening `index.html` via `file://` will fail due to browser CORS rules on ES modules).

### Using VS Code + Live Server (Windows & macOS)
1. Install [Visual Studio Code](https://code.visualstudio.com/) and the **Live Server** extension (`ritwickdey.LiveServer`).
2. Clone the repository and open the folder in VS Code:
   - **macOS (Terminal):**
     ```bash
     git clone [https://github.com/knnahy/macro-tracker.git](https://github.com/knnahy/macro-tracker.git)
     cd macro-tracker
     code .
     ```
   - **Windows (PowerShell):**
     ```powershell
     git clone [https://github.com/knnahy/macro-tracker.git](https://github.com/knnahy/macro-tracker.git)
     Set-Location macro-tracker
     code .
     ```
3. Right-click `index.html` in VS Code and select **"Open with Live Server"** (or click **Go Live** in the bottom status bar).
4. Your browser will open `http://127.0.0.1:5500/` (or similar).

> **Note on CSP Console Warning in Live Server:** `index.html` enforces a strict Content Security Policy (CSP) that blocks inline scripts. VS Code Live Server automatically injects a small inline WebSocket reload script into the page, which triggers a CSP error in the browser DevTools console locally. **This is expected in Live Server and does not occur in production on GitHub Pages.**

---

## 9. Tests and Acceptance Checks

Before releasing any change, verify the following acceptance checks manually or via the test runner:

| Check | Input / Scenario | Expected Result |
|---|---|---|
| **1. BMR Calculation (Male)** | Sex: Male, Weight: `80 kg`, Height: `180 cm`, Age: `30` | Mifflin-St Jeor BMR = **`1780 kcal`** ($(10 \times 80) + (6.25 \times 180) - (5 \times 30) + 5$) |
| **2. BMR Calculation (Female)** | Sex: Female, Weight: `60 kg`, Height: `165 cm`, Age: `30` | Mifflin-St Jeor BMR = **`1320.25 kcal`** ($(10 \times 60) + (6.25 \times 165) - (5 \times 30) - 161$) |
| **3. Food Macro Energy (100 g)** | Protein: `10 g`, Carbs: `20 g`, Fat: `5 g` per 100 g | Calculated energy = **`165 kcal`** per 100 g ($(10 \times 4) + (20 \times 4) + (5 \times 9)$) |
| **4. Portion Scaling (150 g)** | `150 g` of the food above (`165 kcal` / 100 g) | Portion energy = **`247.5 kcal`** (Protein `15 g`, Carbs `30 g`, Fat `7.5 g`) |
| **5. Account Isolation** | Create Account A and Account B; log food in Account A; switch to Account B | Account B sees zero logs/foods from Account A; data stays isolated in `nutrilog-data-<accountId>`. |
| **6. Failed Login Lockout** | Enter wrong password 5 times in a row | Account locks on the 5th failed attempt and rejects login until the lockout timer expires. |
| **7. Legacy v0.1 Migration Counts** | Trigger migration from a populated v0.1 database | Count of foods, dishes, and logs in `nutrilog-data-<accountId>` equals the v0.1 source counts; v0.1 DB remains intact. |
| **8. Soft Delete & Snapshots** | Log a food today, then soft-delete that food from the catalog | Food disappears from active catalog picker, stays in DB with `deleted: true`, and today's log snapshot stays intact. |
| **9. Offline Mode** | Load app once, enable Airplane Mode / DevTools "Offline", reload page | App loads from Service Worker cache and allows logging and viewing data offline. |

---

## 10. Releasing and Version Bumping

### Git Release Workflow
```bash
# 1. Work on a feature or release branch
git checkout -b release/v0.2.x

# 2. Stage and commit changes
git add .
git commit -m "release: v0.2.x description"

# 3. Merge to main, tag, and push to deploy on GitHub Pages
git checkout main
git merge --no-ff release/v0.2.x
git tag -a v0.2.x -m "NutriLog v0.2.x"
git push origin main --tags
```

### When and How to Bump Version Constants

| Constant / Version | Where Defined | When You MUST Bump It |
|---|---|---|
| **Service Worker Cache Name** (`CACHE_NAME`) | `service-worker.js` | **Every release** that modifies any HTML, CSS, JS, or vendor file, so returning browsers purge stale cached assets. |
| **Dexie Schema Version** (`db.version(N)`) | `db.js` | Whenever you add, rename, or change indexed fields or tables in `nutrilog-auth` or `nutrilog-data-<accountId>`. Never edit an existing version block in place; add a new `.version(N+1)` block. |
| **`APP_VERSION`** | `config.js` | Every release (`MAJOR.MINOR.PATCH`) to match the Git tag and `CHANGELOG.md`. |
| **`TERMS_VERSION`** | `config.js`, `legal/terms.html`, `consent-texts.md` | Whenever `legal/terms.html` changes in a way that affects user obligations, features, or scope. |
| **`PRIVACY_VERSION`** | `config.js`, `legal/privacy.html`, `consent-texts.md` | Whenever `legal/privacy.html` changes (e.g., new storage fields, retention rules, or processors). |

---

## 11. Backups

Because all data in v0.2.0 lives only inside your browser's `IndexedDB`:
- **Export JSON Weekly:** Use the in-app **Export JSON** button at least once a week.
- **Store Copies Outside the Device:** Save exported `.json` files to an external drive or personal cloud drive so a lost phone, broken laptop, or accidental browser reset does not wipe your history.
- **In-App Backup Reminder:** NutriLog tracks when you last exported a backup and displays a periodic in-app reminder prompting you to export your JSON data.

---

## 12. Legal Documents

- **Public Legal Pages (`/legal`) Are Drafts:** The user-facing pages (`legal/terms.html`, `legal/privacy.html`, `legal/health-disclaimer.html`) and UI consent strings (`legal/es/consent-texts.md`, `legal/en/consent-texts.md`) are **drafts pending review by a licensed lawyer** (`DRAFT: not legally reviewed`) and contain visible `[PENDING]` placeholders for operator identity and contact details. Spanish (`lang="es"`) is the reference version.
- **Internal Compliance Documents Stay Private:** Internal governance documents (Record of Processing Activities, Breach Response Plan, DPIA Screening Checklist, and Legal Maintenance Guide) are maintained privately **outside this public repository** and **must never be committed to Git**.
- **Triggers That Require Updating Legal Documents Before Shipping Code:**
  1. **Accounts Online / Cloud Sync:** Moving from local-only (Mode A) to cloud accounts (Mode B / Supabase).
  2. **Analytics or Crash Reporting:** Adding any telemetry, error tracker, or third-party script.
  3. **Payments or Subscriptions:** Introducing paid plans or checkout providers.
  4. **New Processors:** Adding or changing hosting, database, email, or payment providers.
  5. **New Data Categories:** Collecting new personal or health/biometric fields (e.g., weight log history, medical conditions, barcode scans hitting external APIs).
  6. **New Target Countries:** Targeting users outside Colombia and Spain/EU.

---

## 13. Developer Rules

1. **No `localStorage` for Core Data:** All profile, account, food, dish, and log data must live in `IndexedDB` via Dexie (`nutrilog-auth` and `nutrilog-data-<accountId>`).
2. **No `eval`:** Never use `eval()`, `new Function()`, or string-based `setTimeout`.
3. **No Inline Scripts or Handlers:** Keep a strict CSP. Never use `<script>...</script>`, `onclick="..."`, or `style="..."` in HTML files.
4. **No External Runtime Requests:** Do not load external fonts (e.g., Google Fonts), CDN scripts, icons, or API calls at runtime. Vendor libraries live in `/vendor`.
5. **Escape All User Text:** Always escape or sanitize user-supplied names (foods, dishes, display names) before inserting into the DOM (prefer `textContent` over `innerHTML`).
6. **Keep `calc.js` Pure:** `calc.js` must remain 100% pure functions with zero DOM references and zero database/Dexie imports.
7. **No Analytics or Logging of Personal Data:** Never log user passwords, recovery codes, body metrics, or food logs to `console.log` or any external service. Do not add analytics without prior legal review.
8. **Relative Paths Only:** Always use relative paths (`./`, `../`) so the app runs cleanly under the GitHub Pages subpath (`/macro-tracker/`).

---

## 14. Known Issues and Limitations

- **OneDrive Folder Locking on Windows:** If your local repository is inside a folder synced by Microsoft OneDrive, OneDrive can lock `.git` or project folders when switching branches (`git checkout`), causing permission errors. Store your local clone outside OneDrive or pause OneDrive sync while switching branches.
- **No Server Sync Yet:** Data stays strictly on the device/browser where it was entered. Moving between a phone and a laptop currently requires exporting and importing JSON manually.
- **No Encryption at Rest:** Local `IndexedDB` tables are not encrypted on disk; local login only gates UI access on shared devices.

---

## 15. Roadmap (Planned — Not Yet in Force)

- **v0.3 — Password System Refinements & UI Styling:** Polish password/recovery UX, session lock transitions, and visual styling.
- **Legal Review & `[PENDING]` Completion:** Complete formal review with licensed counsel in Colombia and Spain/EU and fill all `[PENDING]` operator fields.
- **Server Sync with Cloud Accounts (Mode B):** Optional cloud accounts and multi-device sync using **Supabase (Postgres with Row Level Security in an EU region)** implemented behind the existing Auth Provider Interface.
- **Weight Log:** Dedicated historical body weight tracking and trend visualization.
- **Micronutrients:** Optional tracking for fiber, sodium, sugars, vitamins, and minerals.
- **Barcode Lookup:** Optional food lookup by barcode (requires privacy and processor review before enabling external API calls).
- **Price per Market:** Optional cost tracking per food item and store/market.

---

## 16. Contributing, License and Contact

- **Contributing:** This is a personal project. If submitting changes or bug reports, follow the Developer Rules in Section 13 and verify all acceptance checks in Section 9 before opening a pull request.
- **License:** `[PENDING]`
- **Contact:** `[PENDING]`