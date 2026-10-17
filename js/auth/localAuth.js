/**
 * Local Offline Authentication Provider (IndexedDB + WebCrypto PBKDF2-HMAC-SHA256).
 *
 * SECURITY NOTE:
 * Local authentication provides account isolation and a privacy screen on a shared device.
 * Per-account IndexedDB tables are stored unencrypted at rest so standard IndexedDB indexes
 * and queries work offline. Do not treat local login as disk/database encryption.
 */

import {
  AUTH_DB_NAME,
  USER_DB_PREFIX,
  TERMS_VERSION,
  PRIVACY_VERSION,
  PBKDF2_ITERATIONS,
  PBKDF2_VERSION,
  PBKDF2_ALGO,
  SESSION_TTL_KEEP_MS,
  LOCKOUT_THRESHOLD,
  LOCKOUT_STEPS_MS,
  COMMON_PASSWORDS_100
} from '../config.js';

import {
  openUserDb,
  seedUserDbIfEmpty,
  exportUserDbJSON,
  purgeUserDb,
  detectLegacyDb,
  exportLegacyDbJSON,
  migrateLegacyDbToAccount,
  deleteLegacyDb
} from '../db.js';

import { assertAuthProviderContract } from './authProvider.js';

const DexieRef = globalThis.Dexie;
if (!DexieRef) {
  throw new Error('Dexie.js missing. Place dexie.min.js inside /vendor/dexie.min.js');
}

const authDb = new DexieRef(AUTH_DB_NAME);
authDb.version(1).stores({
  accounts: 'id, &login, updatedAt',
  sessions: 'id, accountId, expiresAt',
  meta: 'id'
});

// 32-character alphabet without ambiguous characters (0, O, 1, I)
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_RAW_LENGTH = 20;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(aBytes, bBytes) {
  if (!(aBytes instanceof Uint8Array) || !(bBytes instanceof Uint8Array)) return false;
  if (aBytes.length !== bBytes.length || aBytes.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function generateSaltHex(byteLength = 16) {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function generateRecoveryCode() {
  const rand = new Uint8Array(RECOVERY_RAW_LENGTH);
  crypto.getRandomValues(rand);
  let raw = '';
  for (let i = 0; i < RECOVERY_RAW_LENGTH; i++) {
    raw += RECOVERY_ALPHABET[rand[i] % RECOVERY_ALPHABET.length];
  }
  rand.fill(0);
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

function normalizeRecoveryCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '');
}

async function derivePbkdf2Bytes(secretString, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(String(secretString));
  const saltBytes = hexToBytes(saltHex);
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: saltBytes,
        iterations: Number(iterations)
      },
      keyMaterial,
      256
    );
    return new Uint8Array(bits);
  } finally {
    secretBytes.fill(0);
    saltBytes.fill(0);
  }
}

export function evaluatePasswordPolicy(password, login = '') {
  const pwd = String(password || '');
  const cleanLogin = String(login || '').trim().toLowerCase();
  const lowerPwd = pwd.toLowerCase();

  if (pwd.length < 10) {
    return { valid: false, level: 'weak', message: 'Password must be at least 10 characters.' };
  }
  if (cleanLogin && lowerPwd === cleanLogin) {
    return { valid: false, level: 'weak', message: 'Password cannot match your login.' };
  }
  if (COMMON_PASSWORDS_100.has(lowerPwd)) {
    return { valid: false, level: 'weak', message: 'Password is in the top 100 common passwords list; choose a less predictable phrase.' };
  }
  if (pwd.length >= 16) {
    return { valid: true, level: 'strong', message: 'Strength: Strong (16+ characters).' };
  }
  if (pwd.length >= 13) {
    return { valid: true, level: 'good', message: 'Strength: Good (13+ characters).' };
  }
  return { valid: true, level: 'ok', message: 'Strength: Acceptable (10+ characters).' };
}

class LocalAuthProvider {
  constructor() {
    this.activeSession = null;
    this.listeners = new Set();
  }

  notify(meta = {}) {
    for (const cb of this.listeners) {
      try {
        cb(this.activeSession, meta);
      } catch (err) {
        console.error('Auth listener error:', err);
      }
    }
  }

  onAuthChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async init() {
    await authDb.open();
    const now = Date.now();
    const allSessions = await authDb.sessions.toArray();

    let validSessionRecord = null;
    for (const s of allSessions) {
      if (!s.expiresAt || s.expiresAt <= now) {
        await authDb.sessions.delete(s.id);
      } else if (!validSessionRecord || s.createdAt > validSessionRecord.createdAt) {
        validSessionRecord = s;
      }
    }

    if (validSessionRecord) {
      const account = await authDb.accounts.get(validSessionRecord.accountId);
      if (account) {
        this.activeSession = {
          sessionId: validSessionRecord.id,
          accountId: account.id,
          login: account.login,
          displayName: account.displayName,
          dbName: account.dbName,
          createdAt: validSessionRecord.createdAt,
          expiresAt: validSessionRecord.expiresAt,
          keepSignedIn: true
        };
      } else {
        await authDb.sessions.delete(validSessionRecord.id);
      }
    }
  }

  async getSession() {
    if (!this.activeSession) return null;
    if (this.activeSession.keepSignedIn && this.activeSession.expiresAt <= Date.now()) {
      await this.signOut('expired');
      return null;
    }
    return this.activeSession;
  }

  async getLegacyStatus() {
    await authDb.open();
    const migMeta = await authDb.meta.get('legacyMigration');
    const hasLegacyRows = await detectLegacyDb();
    return {
      hasLegacyData: hasLegacyRows && !migMeta?.migrated,
      migrated: Boolean(migMeta?.migrated),
      legacyDeleted: Boolean(migMeta?.legacyDeleted) || !hasLegacyRows
    };
  }

  async exportLegacyBackupJSON() {
    return exportLegacyDbJSON();
  }

  async removeLegacyDatabase() {
    await deleteLegacyDb();
    await authDb.meta.put({
      id: 'legacyMigration',
      migrated: true,
      legacyDeleted: true,
      updatedAt: Date.now()
    });
  }

  async createSessionRecord(account, keepSignedIn) {
    const now = Date.now();
    await authDb.sessions.where('accountId').equals(account.id).delete();

    // Persistent session lives 30 days across reloads; non-keepSignedIn expires on reload
    const expiresAt = keepSignedIn ? now + SESSION_TTL_KEEP_MS : now;
    const sessionRecord = {
      id: crypto.randomUUID(),
      accountId: account.id,
      createdAt: now,
      expiresAt
    };
    await authDb.sessions.put(sessionRecord);

    this.activeSession = {
      sessionId: sessionRecord.id,
      accountId: account.id,
      login: account.login,
      displayName: account.displayName,
      dbName: account.dbName,
      createdAt: now,
      expiresAt: keepSignedIn ? expiresAt : now + SESSION_TTL_KEEP_MS,
      keepSignedIn: Boolean(keepSignedIn)
    };
    return this.activeSession;
  }

  async signUp({ login, displayName, password, acceptLegal, confirmAge18, keepSignedIn = false }) {
    const cleanLogin = String(login || '').trim().toLowerCase();
    const cleanDisplay = String(displayName || '').trim() || cleanLogin;

    if (!cleanLogin || cleanLogin.length < 2) {
      throw new Error('Enter a valid login (at least 2 characters).');
    }
    if (!acceptLegal) {
      throw new Error('You must accept the Terms of Use and Privacy Policy.');
    }
    if (!confirmAge18) {
      throw new Error('You must confirm that you are 18 years of age or older.');
    }

    const policy = evaluatePasswordPolicy(password, cleanLogin);
    if (!policy.valid) {
      throw new Error(policy.message);
    }

    const existing = await authDb.accounts.where('login').equals(cleanLogin).first();
    if (existing) {
      throw new Error('An account with this login already exists on this device.');
    }

    const accountId = crypto.randomUUID();
    const dbName = `${USER_DB_PREFIX}${accountId}`;
    const salt = generateSaltHex(16);
    const pwdHashBytes = await derivePbkdf2Bytes(password, salt, PBKDF2_ITERATIONS);

    const recoveryCode = generateRecoveryCode();
    const normRecovery = normalizeRecoveryCode(recoveryCode);
    const recoverySalt = generateSaltHex(16);
    const recHashBytes = await derivePbkdf2Bytes(normRecovery, recoverySalt, PBKDF2_ITERATIONS);

    const now = Date.now();
    const accountRecord = {
      id: accountId,
      login: cleanLogin,
      displayName: cleanDisplay,
      passwordHash: bytesToHex(pwdHashBytes),
      salt,
      kdf: {
        name: PBKDF2_ALGO,
        iterations: PBKDF2_ITERATIONS,
        version: PBKDF2_VERSION
      },
      recoveryHash: bytesToHex(recHashBytes),
      recoverySalt,
      dbName,
      createdAt: now,
      updatedAt: now,
      failedAttempts: 0,
      lockedUntil: 0,
      consent: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: now,
        ageConfirmed: true
      }
    };

    pwdHashBytes.fill(0);
    recHashBytes.fill(0);

    // Check if unmigrated v0.1 data exists before saving account
    const legacyStatus = await this.getLegacyStatus();
    let migratedLegacy = false;

    const userDb = await openUserDb(accountId);
    try {
      if (legacyStatus.hasLegacyData) {
        await migrateLegacyDbToAccount(accountId, userDb);
        await authDb.meta.put({
          id: 'legacyMigration',
          migrated: true,
          migratedAt: Date.now(),
          migratedToAccountId: accountId,
          legacyDeleted: false
        });
        migratedLegacy = true;
      } else {
        await seedUserDbIfEmpty(userDb, accountId);
      }

      await authDb.accounts.add(accountRecord);
      const session = await this.createSessionRecord(accountRecord, keepSignedIn);
      return { session, recoveryCode, migratedLegacy };
    } catch (err) {
      userDb.close();
      await purgeUserDb(accountId);
      throw err;
    }
  }

  async signIn({ login, password, keepSignedIn = false }) {
    const cleanLogin = String(login || '').trim().toLowerCase();
    const genericError = 'Invalid login or password.';

    if (!cleanLogin || !password) {
      throw new Error(genericError);
    }

    const account = await authDb.accounts.where('login').equals(cleanLogin).first();
    if (!account) {
      // Perform dummy derivation to reduce timing side-channel differences
      const dummySalt = '000102030405060708090a0b0c0d0e0f';
      const dummyBytes = await derivePbkdf2Bytes(password, dummySalt, PBKDF2_ITERATIONS);
      dummyBytes.fill(0);
      throw new Error(genericError);
    }

    const now = Date.now();
    if (account.lockedUntil && account.lockedUntil > now) {
      const waitSec = Math.ceil((account.lockedUntil - now) / 1000);
      throw new Error(`Invalid login or password. Account locked for ${waitSec}s due to failed attempts.`);
    }

    const storedIterations = Number(account.kdf?.iterations) || PBKDF2_ITERATIONS;
    const candidateBytes = await derivePbkdf2Bytes(password, account.salt, storedIterations);
    const storedBytes = hexToBytes(account.passwordHash);
    const match = constantTimeEqual(candidateBytes, storedBytes);
    candidateBytes.fill(0);
    storedBytes.fill(0);

    if (!match) {
      const failedAttempts = (Number(account.failedAttempts) || 0) + 1;
      let lockedUntil = 0;
      if (failedAttempts >= LOCKOUT_THRESHOLD) {
        const stepIdx = Math.min(
          failedAttempts - LOCKOUT_THRESHOLD,
          LOCKOUT_STEPS_MS.length - 1
        );
        lockedUntil = Date.now() + LOCKOUT_STEPS_MS[stepIdx];
      }
      await authDb.accounts.update(account.id, {
        failedAttempts,
        lockedUntil,
        updatedAt: Date.now()
      });

      if (lockedUntil > Date.now()) {
        const waitSec = Math.ceil((lockedUntil - Date.now()) / 1000);
        throw new Error(`Invalid login or password. Account locked for ${waitSec}s due to failed attempts.`);
      }
      throw new Error(genericError);
    }

    const updates = {
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: Date.now()
    };

    // Transparently upgrade KDF hash if stored iteration count or version is older
    if (
      storedIterations < PBKDF2_ITERATIONS ||
      (Number(account.kdf?.version) || 0) < PBKDF2_VERSION
    ) {
      const newSalt = generateSaltHex(16);
      const upgradedBytes = await derivePbkdf2Bytes(password, newSalt, PBKDF2_ITERATIONS);
      updates.salt = newSalt;
      updates.passwordHash = bytesToHex(upgradedBytes);
      updates.kdf = {
        name: PBKDF2_ALGO,
        iterations: PBKDF2_ITERATIONS,
        version: PBKDF2_VERSION
      };
      upgradedBytes.fill(0);
    }

    await authDb.accounts.update(account.id, updates);
    const session = await this.createSessionRecord(account, keepSignedIn);
    this.notify({ action: 'signIn' });
    return { session };
  }

  async signOut(reason = 'manual') {
    const prevLogin = this.activeSession?.login || '';
    if (this.activeSession?.accountId) {
      await authDb.sessions.where('accountId').equals(this.activeSession.accountId).delete();
    }
    this.activeSession = null;
    this.notify({ action: 'signOut', reason, lastLogin: prevLogin });
  }

  async changePassword(currentPassword, newPassword) {
    if (!this.activeSession) throw new Error('Not signed in.');
    const account = await authDb.accounts.get(this.activeSession.accountId);
    if (!account) throw new Error('Account record not found.');

    const policy = evaluatePasswordPolicy(newPassword, account.login);
    if (!policy.valid) throw new Error(policy.message);

    const storedIterations = Number(account.kdf?.iterations) || PBKDF2_ITERATIONS;
    const currentBytes = await derivePbkdf2Bytes(currentPassword, account.salt, storedIterations);
    const storedBytes = hexToBytes(account.passwordHash);
    const match = constantTimeEqual(currentBytes, storedBytes);
    currentBytes.fill(0);
    storedBytes.fill(0);

    if (!match) {
      throw new Error('Current password is incorrect.');
    }

    const newSalt = generateSaltHex(16);
    const newHashBytes = await derivePbkdf2Bytes(newPassword, newSalt, PBKDF2_ITERATIONS);
    await authDb.accounts.update(account.id, {
      salt: newSalt,
      passwordHash: bytesToHex(newHashBytes),
      kdf: {
        name: PBKDF2_ALGO,
        iterations: PBKDF2_ITERATIONS,
        version: PBKDF2_VERSION
      },
      updatedAt: Date.now()
    });
    newHashBytes.fill(0);
  }

  async resetPasswordWithRecovery(login, recoveryCode, newPassword) {
    const cleanLogin = String(login || '').trim().toLowerCase();
    const normCode = normalizeRecoveryCode(recoveryCode);
    const genericErr = 'Invalid login or recovery code.';

    if (!cleanLogin || normCode.length < 20) {
      throw new Error(genericErr);
    }

    const policy = evaluatePasswordPolicy(newPassword, cleanLogin);
    if (!policy.valid) throw new Error(policy.message);

    const account = await authDb.accounts.where('login').equals(cleanLogin).first();
    if (!account || !account.recoveryHash || !account.recoverySalt) {
      const dummyBytes = await derivePbkdf2Bytes(normCode, '000102030405060708090a0b0c0d0e0f', PBKDF2_ITERATIONS);
      dummyBytes.fill(0);
      throw new Error(genericErr);
    }

    const candidateRecBytes = await derivePbkdf2Bytes(normCode, account.recoverySalt, PBKDF2_ITERATIONS);
    const storedRecBytes = hexToBytes(account.recoveryHash);
    const match = constantTimeEqual(candidateRecBytes, storedRecBytes);
    candidateRecBytes.fill(0);
    storedRecBytes.fill(0);

    if (!match) {
      throw new Error(genericErr);
    }

    const newPwdSalt = generateSaltHex(16);
    const newPwdBytes = await derivePbkdf2Bytes(newPassword, newPwdSalt, PBKDF2_ITERATIONS);

    // Rotate recovery code so the used code is immediately invalidated
    const nextRecoveryCode = generateRecoveryCode();
    const nextNormRec = normalizeRecoveryCode(nextRecoveryCode);
    const nextRecSalt = generateSaltHex(16);
    const nextRecBytes = await derivePbkdf2Bytes(nextNormRec, nextRecSalt, PBKDF2_ITERATIONS);

    await authDb.accounts.update(account.id, {
      salt: newPwdSalt,
      passwordHash: bytesToHex(newPwdBytes),
      kdf: {
        name: PBKDF2_ALGO,
        iterations: PBKDF2_ITERATIONS,
        version: PBKDF2_VERSION
      },
      recoverySalt: nextRecSalt,
      recoveryHash: bytesToHex(nextRecBytes),
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: Date.now()
    });

    newPwdBytes.fill(0);
    nextRecBytes.fill(0);

    await authDb.sessions.where('accountId').equals(account.id).delete();
    return { recoveryCode: nextRecoveryCode };
  }

  async exportAccountData() {
    if (!this.activeSession) throw new Error('Not signed in.');
    const userDb = await openUserDb(this.activeSession.accountId);
    return exportUserDbJSON(userDb, this.activeSession.accountId, { includeDeleted: true });
  }

  async deleteAccount(password, confirmationText) {
    if (!this.activeSession) throw new Error('Not signed in.');
    if (String(confirmationText || '').trim() !== 'DELETE') {
      throw new Error('Type DELETE in uppercase to confirm permanent account deletion.');
    }

    const accountId = this.activeSession.accountId;
    const account = await authDb.accounts.get(accountId);
    if (!account) throw new Error('Account not found.');

    const storedIterations = Number(account.kdf?.iterations) || PBKDF2_ITERATIONS;
    const candidateBytes = await derivePbkdf2Bytes(password, account.salt, storedIterations);
    const storedBytes = hexToBytes(account.passwordHash);
    const match = constantTimeEqual(candidateBytes, storedBytes);
    candidateBytes.fill(0);
    storedBytes.fill(0);

    if (!match) {
      throw new Error('Incorrect password. Account deletion aborted.');
    }

    await purgeUserDb(accountId);
    await authDb.sessions.where('accountId').equals(accountId).delete();
    await authDb.accounts.delete(accountId);
    this.activeSession = null;
    this.notify({ action: 'deleteAccount' });
  }

  notifySignedIn() {
    this.notify({ action: 'signIn' });
  }
}

export const authProvider = assertAuthProviderContract(new LocalAuthProvider());