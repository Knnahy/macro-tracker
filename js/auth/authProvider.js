/**
 * Authentication Provider Contract.
 *
 * SECURITY NOTE:
 * In local offline mode (LocalAuthProvider), authentication acts as a privacy gate
 * separating accounts on a shared browser profile. It is NOT encryption at rest.
 *
 * UI modules must call ONLY this contract and never query auth tables directly.
 * A future Supabase/Postgres RemoteAuthProvider can implement these exact methods.
 */

/**
 * @typedef {Object} AuthUserSession
 * @property {string} sessionId
 * @property {string} accountId
 * @property {string} login
 * @property {string} displayName
 * @property {string} dbName
 * @property {number} createdAt
 * @property {number} expiresAt
 * @property {boolean} keepSignedIn
 */

/**
 * @typedef {Object} SignUpParams
 * @property {string} login
 * @property {string} displayName
 * @property {string} password
 * @property {boolean} acceptLegal
 * @property {boolean} confirmAge18
 * @property {boolean} [keepSignedIn]
 */

/**
 * @typedef {Object} SignInParams
 * @property {string} login
 * @property {string} password
 * @property {boolean} [keepSignedIn]
 */

/**
 * @typedef {Object} AuthProvider
 * @property {() => Promise<void>} init
 * @property {(params: SignUpParams) => Promise<{ session: AuthUserSession, recoveryCode: string, migratedLegacy: boolean }>} signUp
 * @property {(params: SignInParams) => Promise<{ session: AuthUserSession }>} signIn
 * @property {(reason?: string) => Promise<void>} signOut
 * @property {() => Promise<AuthUserSession | null>} getSession
 * @property {(callback: (session: AuthUserSession | null, meta?: Object) => void) => () => void} onAuthChange
 * @property {(currentPassword: string, newPassword: string) => Promise<void>} changePassword
 * @property {(login: string, recoveryCode: string, newPassword: string) => Promise<{ recoveryCode: string }>} resetPasswordWithRecovery
 * @property {(password: string, confirmationText: string) => Promise<void>} deleteAccount
 * @property {() => Promise<string>} exportAccountData
 * @property {() => Promise<{ hasLegacyData: boolean, migrated: boolean, legacyDeleted: boolean }>} getLegacyStatus
 * @property {() => Promise<string>} exportLegacyBackupJSON
 * @property {() => Promise<void>} removeLegacyDatabase
 */

export function assertAuthProviderContract(provider) {
  const required = [
    'init',
    'signUp',
    'signIn',
    'signOut',
    'getSession',
    'onAuthChange',
    'changePassword',
    'resetPasswordWithRecovery',
    'deleteAccount',
    'exportAccountData',
    'getLegacyStatus',
    'exportLegacyBackupJSON',
    'removeLegacyDatabase'
  ];
  for (const method of required) {
    if (typeof provider?.[method] !== 'function') {
      throw new Error(`AuthProvider contract violation: missing ${method}()`);
    }
  }
  return provider;
}