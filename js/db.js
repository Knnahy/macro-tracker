import { SEED_FOODS } from './seed.js';
import {
  USER_DB_PREFIX,
  LEGACY_DB_NAME,
  SCHEMA_VERSION,
  DEFAULT_AUTOLOCK_MIN
} from './config.js';

const DexieRef = globalThis.Dexie;
if (!DexieRef) {
  throw new Error('Dexie.js missing. Place dexie.min.js inside /vendor/dexie.min.js');
}

const openDbCache = new Map();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

const TABLE_NAMES = Object.freeze([
  'foods',
  'dishes',
  'dishItems',
  'log',
  'water',
  'profile',
  'settings'
]);

function installSyncHooks(dbInstance, accountId) {
  for (const tableName of TABLE_NAMES) {
    const table = dbInstance.table(tableName);

    table.hook('creating', function (_primKey, obj) {
      const now = Date.now();
      if (!isValidUuid(obj.id)) {
        obj.id = crypto.randomUUID();
      }
      obj.userId = accountId;
      if (typeof obj.createdAt !== 'number' || !obj.createdAt) {
        obj.createdAt = now;
      }
      obj.updatedAt = now;
      obj.deleted = Boolean(obj.deleted);
      return obj.id;
    });

    table.hook('updating', function (modifications) {
      return {
        ...modifications,
        updatedAt: Date.now()
      };
    });
  }
}

export async function openUserDb(accountId) {
  if (!accountId) {
    throw new Error('Cannot open user database without a valid accountId.');
  }
  if (openDbCache.has(accountId)) {
    const cached = openDbCache.get(accountId);
    if (cached.isOpen()) return cached;
    openDbCache.delete(accountId);
  }

  const dbName = `${USER_DB_PREFIX}${accountId}`;
  const db = new DexieRef(dbName);

  // Schema Version 2: UUID string keys, userId, createdAt, updatedAt, deleted across all tables
  db.version(2).stores({
    foods: 'id, userId, name, brand, market, category, isDrink, archived, updatedAt, deleted',
    dishes: 'id, userId, name, updatedAt, deleted',
    dishItems: 'id, userId, dishId, foodId, updatedAt, deleted',
    log: 'id, userId, date, meal, [refType+refId], createdAt, updatedAt, deleted',
    water: 'id, userId, date, type, createdAt, updatedAt, deleted',
    profile: 'id, userId, updatedAt, deleted',
    settings: 'id, userId, updatedAt, deleted'
  });

  installSyncHooks(db, accountId);
  db.accountId = accountId;
  db.listChangesSince = (timestamp) => listChangesSince(db, timestamp);

  await db.open();
  openDbCache.set(accountId, db);
  return db;
}

export async function closeUserDb(accountId) {
  const db = openDbCache.get(accountId);
  if (db) {
    db.close();
    openDbCache.delete(accountId);
  }
}

export async function purgeUserDb(accountId) {
  await closeUserDb(accountId);
  const dbName = `${USER_DB_PREFIX}${accountId}`;
  await DexieRef.delete(dbName);
}

export async function seedUserDbIfEmpty(userDb, accountId) {
  const count = await userDb.foods.count();
  if (count === 0) {
    const now = Date.now();
    const initialFoods = SEED_FOODS.map((f) => ({
      id: crypto.randomUUID(),
      userId: accountId,
      name: f.name,
      brand: f.brand || 'Generic',
      market: f.market || '',
      category: f.category || '',
      isDrink: f.isDrink ? 1 : 0,
      per100: {
        kcal: Number(f.per100.kcal) || 0,
        protein: Number(f.per100.protein) || 0,
        carbs: Number(f.per100.carbs) || 0,
        sugars: Number(f.per100.sugars) || 0,
        fiber: Number(f.per100.fiber) || 0,
        fat: Number(f.per100.fat) || 0,
        satFat: Number(f.per100.satFat) || 0,
        sodiumMg: Number(f.per100.sodiumMg) || 0,
        micros: f.per100.micros ? { ...f.per100.micros } : {}
      },
      defaultServingG: Number(f.defaultServingG) || 100,
      pricePerKg: null,
      source: f.source || 'seed-approx',
      archived: 0,
      createdAt: now,
      updatedAt: now,
      deleted: false
    }));
    await userDb.foods.bulkAdd(initialFoods);
  }
}

export async function getProfile(userDb) {
  const rows = await userDb.profile.toArray();
  return rows.find((r) => !r.deleted) || null;
}

export async function saveProfile(userDb, profileData) {
  const existing = await getProfile(userDb);
  if (existing) {
    await userDb.profile.update(existing.id, {
      ...profileData,
      deleted: false
    });
    return userDb.profile.get(existing.id);
  }
  const newId = crypto.randomUUID();
  const now = Date.now();
  const record = {
    id: newId,
    userId: userDb.accountId,
    ...profileData,
    createdAt: now,
    updatedAt: now,
    deleted: false
  };
  await userDb.profile.add(record);
  return record;
}

export async function getUserSettings(userDb) {
  const rows = await userDb.settings.toArray();
  const active = rows.find((r) => !r.deleted);
  if (active) return active;
  const created = {
    id: crypto.randomUUID(),
    userId: userDb.accountId,
    autoLockMinutes: DEFAULT_AUTOLOCK_MIN,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deleted: false
  };
  await userDb.settings.add(created);
  return created;
}

export async function saveUserSettings(userDb, updates) {
  const current = await getUserSettings(userDb);
  await userDb.settings.update(current.id, updates);
  return userDb.settings.get(current.id);
}

export async function deleteOrArchiveFood(userDb, foodId) {
  const id = String(foodId);
  const [dishItems, logs] = await Promise.all([
    userDb.dishItems.where('foodId').equals(id).toArray(),
    userDb.log.where('[refType+refId]').equals(['food', id]).toArray()
  ]);

  const activeDishUses = dishItems.filter((di) => !di.deleted).length;
  const activeLogUses = logs.filter((l) => !l.deleted).length;
  const totalUses = activeDishUses + activeLogUses;

  if (totalUses > 0) {
    await userDb.foods.update(id, { archived: 1 });
    return { action: 'archived', totalUses };
  }
  await userDb.foods.update(id, { deleted: true });
  return { action: 'deleted', totalUses: 0 };
}

export async function saveDishWithItems(userDb, dish, items) {
  return userDb.transaction('rw', userDb.dishes, userDb.dishItems, async () => {
    let dishId = dish.id && isValidUuid(dish.id) ? dish.id : null;
    if (dishId) {
      await userDb.dishes.update(dishId, {
        name: dish.name,
        notes: dish.notes || '',
        deleted: false
      });
      const oldItems = await userDb.dishItems.where('dishId').equals(dishId).toArray();
      for (const oldItem of oldItems) {
        if (!oldItem.deleted) {
          await userDb.dishItems.update(oldItem.id, { deleted: true });
        }
      }
    } else {
      dishId = crypto.randomUUID();
      await userDb.dishes.add({
        id: dishId,
        userId: userDb.accountId,
        name: dish.name,
        notes: dish.notes || '',
        deleted: false
      });
    }

    const cleanItems = items.map((item) => ({
      id: crypto.randomUUID(),
      userId: userDb.accountId,
      dishId,
      foodId: String(item.foodId),
      grams: Number(item.grams),
      deleted: false
    }));

    if (cleanItems.length > 0) {
      await userDb.dishItems.bulkAdd(cleanItems);
    }
    return dishId;
  });
}

export async function softDeleteDish(userDb, dishId) {
  const id = String(dishId);
  return userDb.transaction('rw', userDb.dishes, userDb.dishItems, async () => {
    const items = await userDb.dishItems.where('dishId').equals(id).toArray();
    for (const item of items) {
      if (!item.deleted) {
        await userDb.dishItems.update(item.id, { deleted: true });
      }
    }
    await userDb.dishes.update(id, { deleted: true });
  });
}

export async function softDeleteRecord(table, id) {
  await table.update(String(id), { deleted: true });
}

export async function listChangesSince(userDb, timestamp = 0) {
  const since = Number(timestamp) || 0;
  const result = {};
  for (const name of TABLE_NAMES) {
    result[name] = await userDb
      .table(name)
      .where('updatedAt')
      .above(since)
      .toArray();
  }
  return {
    accountId: userDb.accountId,
    since,
    tables: result
  };
}

export async function exportUserDbJSON(userDb, accountId, { includeDeleted = true } = {}) {
  const filterFn = (rows) => (includeDeleted ? rows : rows.filter((r) => !r.deleted));
  const [foods, dishes, dishItems, log, water, profile, settings] = await Promise.all([
    userDb.foods.toArray().then(filterFn),
    userDb.dishes.toArray().then(filterFn),
    userDb.dishItems.toArray().then(filterFn),
    userDb.log.toArray().then(filterFn),
    userDb.water.toArray().then(filterFn),
    userDb.profile.toArray().then(filterFn),
    userDb.settings.toArray().then(filterFn)
  ]);

  const backupTime = Date.now();
  await saveProfile(userDb, { lastBackupAt: backupTime });

  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      accountId,
      exportedAt: new Date(backupTime).toISOString(),
      tables: { foods, dishes, dishItems, log, water, profile, settings }
    },
    null,
    2
  );
}

export async function importUserDbJSON(userDb, jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed.tables !== 'object') {
    throw new Error('Invalid backup file: missing tables object.');
  }
  const ver = Number(parsed.schemaVersion) || 1;
  if (ver !== 1 && ver !== 2) {
    throw new Error(`Unsupported backup schemaVersion: ${parsed.schemaVersion}`);
  }

  const accountId = userDb.accountId;
  const now = Date.now();
  const {
    foods = [],
    dishes = [],
    dishItems = [],
    log = [],
    water = [],
    profile = [],
    settings = []
  } = parsed.tables;

  const foodIdMap = new Map();
  const dishIdMap = new Map();

  const mappedFoods = foods.map((f) => {
    const newId = isValidUuid(f.id) ? f.id : crypto.randomUUID();
    foodIdMap.set(String(f.id), newId);
    return {
      ...f,
      id: newId,
      userId: accountId,
      per100: {
        ...f.per100,
        micros: f.per100?.micros ? { ...f.per100.micros } : {}
      },
      archived: f.archived ? 1 : 0,
      createdAt: Number(f.createdAt) || Number(f.updatedAt) || now,
      updatedAt: now,
      deleted: Boolean(f.deleted)
    };
  });

  const mappedDishes = dishes.map((d) => {
    const newId = isValidUuid(d.id) ? d.id : crypto.randomUUID();
    dishIdMap.set(String(d.id), newId);
    return {
      ...d,
      id: newId,
      userId: accountId,
      createdAt: Number(d.createdAt) || Number(d.updatedAt) || now,
      updatedAt: now,
      deleted: Boolean(d.deleted)
    };
  });

  const mappedDishItems = dishItems.map((di) => ({
    ...di,
    id: isValidUuid(di.id) ? di.id : crypto.randomUUID(),
    userId: accountId,
    dishId: dishIdMap.get(String(di.dishId)) || String(di.dishId),
    foodId: foodIdMap.get(String(di.foodId)) || String(di.foodId),
    grams: Number(di.grams) || 0,
    createdAt: Number(di.createdAt) || now,
    updatedAt: now,
    deleted: Boolean(di.deleted)
  }));

  const mappedLogs = log.map((l) => {
    const refMap = l.refType === 'dish' ? dishIdMap : foodIdMap;
    return {
      ...l,
      id: isValidUuid(l.id) ? l.id : crypto.randomUUID(),
      userId: accountId,
      refId: refMap.get(String(l.refId)) || String(l.refId),
      createdAt: Number(l.createdAt) || now,
      updatedAt: now,
      deleted: Boolean(l.deleted)
    };
  });

  const mappedWater = water.map((w) => ({
    ...w,
    id: isValidUuid(w.id) ? w.id : crypto.randomUUID(),
    userId: accountId,
    createdAt: Number(w.createdAt) || now,
    updatedAt: now,
    deleted: Boolean(w.deleted)
  }));

  const mappedProfile = profile.map((p) => ({
    ...p,
    id: isValidUuid(p.id) ? p.id : crypto.randomUUID(),
    userId: accountId,
    createdAt: Number(p.createdAt) || now,
    updatedAt: now,
    deleted: Boolean(p.deleted)
  }));

  const mappedSettings = settings.map((s) => ({
    ...s,
    id: isValidUuid(s.id) ? s.id : crypto.randomUUID(),
    userId: accountId,
    createdAt: Number(s.createdAt) || now,
    updatedAt: now,
    deleted: Boolean(s.deleted)
  }));

  await userDb.transaction(
    'rw',
    [userDb.foods, userDb.dishes, userDb.dishItems, userDb.log, userDb.water, userDb.profile, userDb.settings],
    async () => {
      await Promise.all([
        userDb.foods.clear(),
        userDb.dishes.clear(),
        userDb.dishItems.clear(),
        userDb.log.clear(),
        userDb.water.clear(),
        userDb.profile.clear(),
        userDb.settings.clear()
      ]);
      await userDb.foods.bulkPut(mappedFoods);
      await userDb.dishes.bulkPut(mappedDishes);
      await userDb.dishItems.bulkPut(mappedDishItems);
      await userDb.log.bulkPut(mappedLogs);
      await userDb.water.bulkPut(mappedWater);
      await userDb.profile.bulkPut(mappedProfile);
      if (mappedSettings.length > 0) {
        await userDb.settings.bulkPut(mappedSettings);
      }
    }
  );
}

// ---------------- LEGACY v0.1 DATABASE MIGRATION ----------------

function openLegacyHandle() {
  const legacyDb = new DexieRef(LEGACY_DB_NAME);
  legacyDb.version(1).stores({
    foods: '++id, name, brand, market, category, isDrink, archived, updatedAt',
    dishes: '++id, name, updatedAt',
    dishItems: '++id, dishId, foodId',
    log: '++id, date, meal, [refType+refId], createdAt',
    water: '++id, date, type, createdAt',
    profile: 'id'
  });
  return legacyDb;
}

export async function detectLegacyDb() {
  const exists = await DexieRef.exists(LEGACY_DB_NAME);
  if (!exists) return false;
  const legacyDb = openLegacyHandle();
  try {
    await legacyDb.open();
    const counts = await Promise.all([
      legacyDb.foods.count(),
      legacyDb.dishes.count(),
      legacyDb.dishItems.count(),
      legacyDb.log.count(),
      legacyDb.water.count(),
      legacyDb.profile.count()
    ]);
    return counts.some((c) => c > 0);
  } catch (_err) {
    return false;
  } finally {
    legacyDb.close();
  }
}

export async function exportLegacyDbJSON() {
  const exists = await DexieRef.exists(LEGACY_DB_NAME);
  if (!exists) throw new Error('No legacy v0.1 database found on this device.');
  const legacyDb = openLegacyHandle();
  try {
    await legacyDb.open();
    const [foods, dishes, dishItems, log, water, profile] = await Promise.all([
      legacyDb.foods.toArray(),
      legacyDb.dishes.toArray(),
      legacyDb.dishItems.toArray(),
      legacyDb.log.toArray(),
      legacyDb.water.toArray(),
      legacyDb.profile.toArray()
    ]);
    return JSON.stringify(
      {
        schemaVersion: 1,
        legacySource: LEGACY_DB_NAME,
        exportedAt: new Date().toISOString(),
        tables: { foods, dishes, dishItems, log, water, profile }
      },
      null,
      2
    );
  } finally {
    legacyDb.close();
  }
}

export async function migrateLegacyDbToAccount(accountId, userDb) {
  const legacyDb = openLegacyHandle();
  try {
    await legacyDb.open();
    const [oldFoods, oldDishes, oldDishItems, oldLogs, oldWater, oldProfiles] = await Promise.all([
      legacyDb.foods.toArray(),
      legacyDb.dishes.toArray(),
      legacyDb.dishItems.toArray(),
      legacyDb.log.toArray(),
      legacyDb.water.toArray(),
      legacyDb.profile.toArray()
    ]);

    const now = Date.now();
    const foodIdMap = new Map();
    const dishIdMap = new Map();

    const newFoods = oldFoods.map((f) => {
      const uuid = crypto.randomUUID();
      foodIdMap.set(String(f.id), uuid);
      return {
        ...f,
        id: uuid,
        userId: accountId,
        per100: {
          ...f.per100,
          micros: f.per100?.micros ? { ...f.per100.micros } : {}
        },
        archived: f.archived ? 1 : 0,
        createdAt: Number(f.updatedAt) || now,
        updatedAt: Number(f.updatedAt) || now,
        deleted: false
      };
    });

    const newDishes = oldDishes.map((d) => {
      const uuid = crypto.randomUUID();
      dishIdMap.set(String(d.id), uuid);
      return {
        ...d,
        id: uuid,
        userId: accountId,
        createdAt: Number(d.updatedAt) || now,
        updatedAt: Number(d.updatedAt) || now,
        deleted: false
      };
    });

    // If a legacy dishItem or log pointed to a food/dish that was hard-deleted in v0.1,
    // assign a deterministic fallback UUID so foreign keys remain valid UUID strings.
    const orphanMap = new Map();
    const resolveRef = (map, legacyId) => {
      const key = String(legacyId);
      if (map.has(key)) return map.get(key);
      if (!orphanMap.has(key)) orphanMap.set(key, crypto.randomUUID());
      return orphanMap.get(key);
    };

    const newDishItems = oldDishItems.map((di) => ({
      id: crypto.randomUUID(),
      userId: accountId,
      dishId: resolveRef(dishIdMap, di.dishId),
      foodId: resolveRef(foodIdMap, di.foodId),
      grams: Number(di.grams) || 0,
      createdAt: now,
      updatedAt: now,
      deleted: false
    }));

    const newLogs = oldLogs.map((l) => {
      const targetMap = l.refType === 'dish' ? dishIdMap : foodIdMap;
      return {
        ...l,
        id: crypto.randomUUID(),
        userId: accountId,
        refId: resolveRef(targetMap, l.refId),
        snapshot: structuredClone ? structuredClone(l.snapshot) : JSON.parse(JSON.stringify(l.snapshot)),
        createdAt: Number(l.createdAt) || now,
        updatedAt: Number(l.createdAt) || now,
        deleted: false
      };
    });

    const newWater = oldWater.map((w) => ({
      ...w,
      id: crypto.randomUUID(),
      userId: accountId,
      createdAt: Number(w.createdAt) || now,
      updatedAt: Number(w.createdAt) || now,
      deleted: false
    }));

    const newProfiles = oldProfiles.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      userId: accountId,
      createdAt: Number(p.updatedAt) || now,
      updatedAt: Number(p.updatedAt) || now,
      deleted: false
    }));

    await userDb.transaction(
      'rw',
      [userDb.foods, userDb.dishes, userDb.dishItems, userDb.log, userDb.water, userDb.profile],
      async () => {
        await userDb.foods.bulkAdd(newFoods);
        await userDb.dishes.bulkAdd(newDishes);
        await userDb.dishItems.bulkAdd(newDishItems);
        await userDb.log.bulkAdd(newLogs);
        await userDb.water.bulkAdd(newWater);
        await userDb.profile.bulkAdd(newProfiles);
      }
    );

    // Verification: compare row counts and reference resolution before marking complete
    const [cFoods, cDishes, cDishItems, cLogs, cWater, cProfiles] = await Promise.all([
      userDb.foods.count(),
      userDb.dishes.count(),
      userDb.dishItems.count(),
      userDb.log.count(),
      userDb.water.count(),
      userDb.profile.count()
    ]);

    if (
      cFoods !== oldFoods.length ||
      cDishes !== oldDishes.length ||
      cDishItems !== oldDishItems.length ||
      cLogs !== oldLogs.length ||
      cWater !== oldWater.length ||
      cProfiles !== oldProfiles.length
    ) {
      throw new Error('Migration verification failed: row count mismatch between v0.1 and v0.2 tables.');
    }

    const validFoodIds = new Set(newFoods.map((f) => f.id));
    const validDishIds = new Set(newDishes.map((d) => d.id));

    for (const di of newDishItems) {
      if (!orphanMap.has(String(di.dishId)) && !validDishIds.has(di.dishId)) {
        const check = Array.from(orphanMap.values()).includes(di.dishId);
        if (!check) throw new Error('Migration verification failed: unresolved dishId in dishItems.');
      }
      if (!validFoodIds.has(di.foodId) && !Array.from(orphanMap.values()).includes(di.foodId)) {
        throw new Error('Migration verification failed: unresolved foodId in dishItems.');
      }
    }

    for (const l of newLogs) {
      const pool = l.refType === 'dish' ? validDishIds : validFoodIds;
      if (!pool.has(l.refId) && !Array.from(orphanMap.values()).includes(l.refId)) {
        throw new Error('Migration verification failed: unresolved refId in log entry.');
      }
    }
  } finally {
    legacyDb.close();
  }
}

export async function deleteLegacyDb() {
  await DexieRef.delete(LEGACY_DB_NAME);
}