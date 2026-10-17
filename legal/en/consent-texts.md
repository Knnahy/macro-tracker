# Path: legal/en/consent-texts.md
# User Interface Consent Texts (UI Strings)
- **Version:** 0.2.0
- **Effective date:** [PENDING]
- **Last reviewed:** 2026-10-17
- **Operating mode:** Section 1 for MODE A (in force); Section 2 for MODE B (not in force until cloud launch)
- **Status:** DRAFT: not legally reviewed

## Version Constants
- `TERMS_VERSION = "0.2.0"`
- `PRIVACY_VERSION = "0.2.0"`

## 1. MODE A (Local - In Force)

### `mode_a_local_notice`
Appears on: Local account creation screen, above the password and recovery code form.
> **Local Mode (your data never leaves this device):** Your account and logs exist only on your device; nothing is sent to the operator. Your password is stored only as a PBKDF2 hash and a **recovery code is shown once**; without your password or recovery code, nobody can recover the data. Data in the browser is **not encrypted at rest** (local login only gates access on shared devices).

### `mode_a_signup_checkbox`
Appears on: Local account creation screen, required unchecked checkbox above the "Create account" button.
> `[ ]` I confirm that I am **18 years of age or older**, accept the [Terms and Conditions](legal/terms.html) (`TERMS_VERSION: 0.2.0`) and the [Health and Nutrition Disclaimer](legal/health-disclaimer.html), and have read the [Privacy Policy](legal/privacy.html) (`PRIVACY_VERSION: 0.2.0`).

### `mode_a_keep_signed_in_checkbox`
Appears on: Local sign-in screen, optional unchecked checkbox below the password field.
> `[ ]` Keep me signed in for 30 days on this browser (do not use on shared devices).

### `calorie_floor_warning`
Appears on: Nutrition goals and Mifflin-St Jeor calculator screen whenever a daily target is below 1200 kcal (women) or 1500 kcal (men).
> **Health warning:** Your daily target is below the general reference threshold (1200 kcal/day for women or 1500 kcal/day for men). NutriLog is an educational tool and does not promote extreme restriction: please consult a physician or dietitian-nutritionist before following a target below this limit.

<!-- MODE B -->
## 2. MODE B (Not in force until cloud launch / No vigente hasta el lanzamiento en la nube)

### `mode_b_terms_checkbox`
Appears on: Cloud account sign-up screen (MODE B), first required unchecked checkbox.
> `[ ]` I confirm that I am **18 years of age or older**, accept the [Terms and Conditions](legal/terms.html) (`TERMS_VERSION: 0.2.0`) and the [Health and Nutrition Disclaimer](legal/health-disclaimer.html), and have read the [Privacy Policy](legal/privacy.html) (`PRIVACY_VERSION: 0.2.0`).

### `mode_b_health_consent_checkbox`
Appears on: Cloud sign-up or cloud sync activation screen (MODE B), second required and separate unchecked checkbox.
> `[ ]` **Explicit consent for health data (GDPR Art. 9.2.a [VERIFIED] / Law 1581 of 2012 Art. 6 [VERIFIED]):** I give my prior, express, and informed authorization to `[PENDING]` to store and process my physical and nutritional data (sex, age, height, weight, activity, goals, and food, drink, and water logs) on its cloud servers to calculate my estimates and synchronize my devices. I understand that under Colombian law I am not required to authorize sensitive data processing (I may use local mode) and that I may withdraw my consent and delete my account at any time.

### `mode_b_paid_checkout_checkbox`
Appears on: Paid subscription checkout screen (MODE B), unchecked checkbox before confirming payment.
> `[ ]` I request that my paid subscription begin immediately and understand how starting the service affects my right of withdrawal (14 calendar days in Spain/EU, Art. 103 TRLGDCU [VERIFIED]; and 5 business days *retracto* in Colombia, Art. 47 Law 1480 of 2011 [VERIFIED]), as set out in Section 14 of the [Terms and Conditions](legal/terms.html).
<!-- MODE B -->