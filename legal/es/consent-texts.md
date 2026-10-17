# Path: legal/es/consent-texts.md
# Textos de Consentimiento para la Interfaz (UI Strings)
- **Versión:** 0.2.0
- **Fecha de entrada en vigor:** [PENDING]
- **Última revisión:** 2026-10-17
- **Modo operativo:** Sección 1 para MODO A (vigente); Sección 2 para MODO B (no vigente hasta el lanzamiento en la nube)
- **Estado:** DRAFT: not legally reviewed (Borrador: sin revisión legal)

## Constantes de Versión
- `TERMS_VERSION = "0.2.0"`
- `PRIVACY_VERSION = "0.2.0"`

## 1. MODO A (Local - Vigente)

### `mode_a_local_notice`
Aparece en: Pantalla de creación de cuenta local, encima del formulario de contraseña y código de recuperación.
> **Modo Local (tus datos no salen de este dispositivo):** Tu cuenta y tus registros existen solo en tu dispositivo; nada se envía al operador. Tu contraseña se guarda solo como un hash PBKDF2 y se muestra un **código de recuperación una sola vez**; sin tu contraseña o ese código, nadie puede recuperar los datos. Los datos en el navegador **no están cifrados en reposo** (el inicio de sesión local solo controla el acceso en dispositivos compartidos).

### `mode_a_signup_checkbox`
Aparece en: Pantalla de creación de cuenta local, casilla desmarcada obligatoria antes del botón "Crear cuenta".
> `[ ]` Confirmo que tengo **18 años o más**, acepto los [Términos y Condiciones](legal/terms.html) (`TERMS_VERSION: 0.2.0`) y el [Aviso de Salud y Nutrición](legal/health-disclaimer.html), y he leído la [Política de Privacidad](legal/privacy.html) (`PRIVACY_VERSION: 0.2.0`).

### `mode_a_keep_signed_in_checkbox`
Aparece en: Pantalla de inicio de sesión local, casilla desmarcada opcional debajo del campo de contraseña.
> `[ ]` Mantener mi sesión iniciada durante 30 días en este navegador (no usar en dispositivos compartidos).

### `calorie_floor_warning`
Aparece en: Pantalla de objetivos y calculadora Mifflin-St Jeor cuando la meta diaria es inferior a 1200 kcal (mujeres) o 1500 kcal (hombres).
> **Aviso de salud:** Tu objetivo diario está por debajo del umbral de referencia general (1200 kcal/día para mujeres o 1500 kcal/día para hombres). NutriLog es una herramienta educativa y no promueve la restricción extrema: consulta a un médico o dietista-nutricionista antes de seguir una meta inferior a este límite.

<!-- MODE B -->
## 2. MODO B (No vigente hasta el lanzamiento en la nube / Not in force until cloud launch)

### `mode_b_terms_checkbox`
Aparece en: Pantalla de registro de cuenta en la nube (MODO B), primera casilla desmarcada obligatoria.
> `[ ]` Confirmo que tengo **18 años o más**, acepto los [Términos y Condiciones](legal/terms.html) (`TERMS_VERSION: 0.2.0`) y el [Aviso de Salud y Nutrición](legal/health-disclaimer.html), y he leído la [Política de Privacidad](legal/privacy.html) (`PRIVACY_VERSION: 0.2.0`).

### `mode_b_health_consent_checkbox`
Aparece en: Pantalla de registro o activación de sincronización en la nube (MODO B), segunda casilla desmarcada obligatoria y separada.
> `[ ]` **Consentimiento explícito para datos de salud (RGPD art. 9.2.a [VERIFIED] / Ley 1581 de 2012 art. 6 [VERIFIED]):** Autorizo de forma previa, expresa e informada a `[PENDING]` para almacenar y tratar mis datos físicos y nutricionales (sexo, edad, altura, peso, actividad, metas y registros de comidas, bebidas y agua) en sus servidores en la nube para calcular mis estimaciones y sincronizar mis dispositivos. Entiendo que bajo la ley colombiana no estoy obligado a autorizar el tratamiento de datos sensibles (puedo usar el modo local) y que puedo retirar mi consentimiento y eliminar mi cuenta en cualquier momento.

### `mode_b_paid_checkout_checkbox`
Aparece en: Pantalla de pago de suscripción (MODO B), casilla desmarcada antes de confirmar el pago.
> `[ ]` Solicito que mi suscripción de pago comience de inmediato y entiendo cómo el inicio del servicio afecta a mi derecho de desistimiento (14 días naturales en España/UE, art. 103 TRLGDCU [VERIFIED]) y de retracto (5 días hábiles en Colombia, art. 47 Ley 1480 de 2011 [VERIFIED]), según la sección 14 de los [Términos y Condiciones](legal/terms.html).
<!-- MODE B -->