export const APP_VERSION = '0.2.0';
export const SCHEMA_VERSION = 2;
export const TERMS_VERSION = '2026-10-v1';
export const PRIVACY_VERSION = '2026-10-v1';

export const AUTH_DB_NAME = 'nutrilog-auth';
export const USER_DB_PREFIX = 'nutrilog-data-';
export const LEGACY_DB_NAME = 'NutriLogDB';

export const PBKDF2_ITERATIONS = 600000;
export const PBKDF2_VERSION = 1;
export const PBKDF2_ALGO = 'PBKDF2-SHA256';

export const SESSION_TTL_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_AUTOLOCK_MIN = 10;
export const AUTOLOCK_OPTIONS_MIN = Object.freeze([1, 5, 10, 30, 0]); // 0 = never

// Exponential lockout steps starting at failure #5: 30s, 1m, 5m, 15m (capped at 15m)
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_STEPS_MS = Object.freeze([
  30 * 1000,
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000
]);

// 100 most common passwords rejected by policy (lowercased)
export const COMMON_PASSWORDS_100 = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789',
  '12345', '1234', '111111', '1234567', 'dragon',
  '123123', 'baseball', 'abc123', 'football', 'monkey',
  'letmein', '696969', 'shadow', 'master', '666666',
  'qwertyuiop', '123321', 'mustang', '1234567890', 'michael',
  '654321', 'pussy', 'superman', '1qaz2wsx', '7777777',
  'fuckyou', '121212', '000000', 'qazwsx', '123qwe',
  'killer', 'trustno1', 'jordan', 'jennifer', 'zxcvbnm',
  'asdfgh', 'hunter', 'buster', 'soccer', 'harley',
  'batman', 'andrew', 'tigger', 'sunshine', 'iloveyou',
  'fuckme', '2000', 'charlie', 'robert', 'thomas',
  'hockey', 'ranger', 'daniel', 'starwars', 'klaster',
  '112233', 'george', 'asshole', 'computer', 'michelle',
  'jessica', 'pepper', '1111', 'zxcvbn', '555555',
  '11111111', '131313', 'freedom', '777777', 'pass',
  'fuck', 'maggie', '159753', 'aaaaaa', 'ginger',
  'princess', 'joshua', 'cheese', 'amanda', 'summer',
  'love', 'ashley', '6969', 'nicole', 'chelsea',
  'biteme', 'matthew', 'access', 'yankees', '987654321',
  'dallas', 'austin', 'thunder', 'taylor', 'matrix',
  'password123', 'password1234', 'qwerty12345', '12345678910', 'admin12345'
]);