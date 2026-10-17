# Path: SECURITY.md
# Security Policy
- **Version:** 0.1.0
- **Effective date:** [PENDING]
- **Last reviewed:** 2026-10-17
- **Operating mode:** MODE A (Local-only PWA in force). Includes scope notes for planned MODE B (not in force until cloud launch).
- **Status:** DRAFT: not legally reviewed

## 1. Supported Versions
Only the latest released version deployed on GitHub Pages is actively supported with security updates:

| Version | Operating Mode | Supported |
|---|---|---|
| **0.1.x** | MODE A (Local-only PWA) | Yes |
| **0.2.x (Planned)** | MODE B (Cloud accounts — not yet released) | Not yet released |

## 2. How to Report a Security Vulnerability
If you discover a security or privacy vulnerability in NutriLog, please report it privately so we can fix it before public disclosure:

- **Email:** **[PENDING]**
- **Subject line:** `[SECURITY] Brief description of the issue`
- **What to include:** Steps to reproduce, affected URL or file path, browser/OS version, and potential impact on user data.

**Please do NOT open a public GitHub issue for undisclosed security vulnerabilities.** We aim to acknowledge receipt of your report within **5 business days** and provide an assessment or fix timeline within **15 business days**.

## 3. Security Scope & Known Architecture Constraints (MODE A)

### In Scope (MODE A)
- Cross-Site Scripting (XSS) or DOM injection vulnerabilities in the PWA frontend (which could allow malicious scripts to read local `IndexedDB` stores).
- Supply-chain compromises or unauthorized third-party network calls leaking user data from the browser.
- Service Worker cache poisoning or insecure asset loading.
- Failures in the in-app "Delete Account" function that leave orphaned personal data in `IndexedDB` or `LocalStorage`.

### Known Architectural Boundary (Not a Bug in MODE A)
- **Local `IndexedDB` is NOT encrypted at rest:** As explicitly documented in our Terms of Use and Privacy Policy, MODE A stores data locally inside the user's browser (`IndexedDB`) without encryption at rest, and the local login screen is a visual privacy gate rather than cryptographic protection. Reports stating that a local attacker with physical/OS access to an unlocked device can inspect browser DevTools to view `IndexedDB` are **by design for Mode A** and are already disclosed to users.

<!-- MODE B -->
## 4. Planned Scope for MODE B (NOT IN FORCE UNTIL CLOUD LAUNCH)
When MODE B (Supabase cloud accounts and payments) is launched, the security scope will expand to include:
- Authentication bypass or session management flaws in Supabase Auth.
- Missing or misconfigured Postgres Row Level Security (RLS) policies allowing cross-user data access (IDOR).
- Insecure handling of transactional email tokens or payment webhooks (`[PENDING payment provider]`).
<!-- MODE B -->