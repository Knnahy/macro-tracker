import { SEED_FOODS } from './seed.js';

const DexieRef = globalThis.Dexie;
if (!DexieRef) {
  throw new Error('Dexie.js missing. Place dexie.min.js inside /vendor/dexie.min.js');
}

export const db = new DexieRef('NutriLogDB');

// Schema Version 1 (migration-ready for future versions via db.version(2).stores(...).upgrade(...))
db.version(1).stores({
  foods: '++id, name, brand, market, category, isDrink, archived, updatedAt',
  dishes: '++id, name, updatedAt',
  dishItems: '++id, dishId, foodId',
  log: '++id, date, meal, [refType+refId], createdAt',
  water: '++id, date, type, createdAt',
  profile: 'id'
});

export async function initDatabase() {
  await db.open();
  const foodCount = await db.foods.count();
  if (foodCount === 0) {
    const now = Date.now();
    const initialFoods = SEED_FOODS.map((f) => ({
      ...f,
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
      archived: 0,
      updatedAt: now
    }));
    await db.foods.bulkAdd(initialFoods);
  }
}

export async function getProfile() {
  return (await db.profile.get('main')) || null;
}

export async function saveProfile(profileData) {
  const existing = (await getProfile()) || { id: 'main' };
  const merged = {
    ...existing,
    ...profileData,
    id: 'main',
    updatedAt: Date.now()
  };
  await db.profile.put(merged);
  return merged;
}

export async function deleteOrArchiveFood(foodId) {
  const id = Number(foodId);
  const usedInDishes = await db.dishItems.where('foodId').equals(id).count();
  const usedInLogs = await db.log.where('[refType+refId]').equals(['food', id]).count();
  const totalUses = usedInDishes + usedInLogs;

  if (totalUses > 0) {
    await db.foods.update(id, { archived: 1, updatedAt: Date.now() });
    return { action: 'archived', totalUses };
  }
  await db.foods.delete(id);
  return { action: 'deleted', totalUses: 0 };
}

export async function saveDishWithItems(dish, items) {
  return db.transaction('rw', db.dishes, db.dishItems, async () => {
    const now = Date.now();
    let dishId = dish.id ? Number(dish.id) : undefined;
    if (dishId) {
      await db.dishes.update(dishId, {
        name: dish.name,
        notes: dish.notes || '',
        updatedAt: now
      });
      await db.dishItems.where('dishId').equals(dishId).delete();
    } else {
      dishId = await db.dishes.add({
        name: dish.name,
        notes: dish.notes || '',
        updatedAt: now
      });
    }
    const cleanItems = items.map((item) => ({
      dishId,
      foodId: Number(item.foodId),
      grams: Number(item.grams)
    }));
    if (cleanItems.length > 0) {
      await db.dishItems.bulkAdd(cleanItems);
    }
    return dishId;
  });
}

export async function deleteDish(dishId) {
  const id = Number(dishId);
  return db.transaction('rw', db.dishes, db.dishItems, async () => {
    await db.dishItems.where('dishId').equals(id).delete();
    await db.dishes.delete(id);
  });
}

export async function exportFullDatabaseJSON() {
  const [foods, dishes, dishItems, log, water, profile] = await Promise.all([
    db.foods.toArray(),
    db.dishes.toArray(),
    db.dishItems.toArray(),
    db.log.toArray(),
    db.water.toArray(),
    db.profile.toArray()
  ]);
  const backupTime = Date.now();
  await saveProfile({ lastBackupAt: backupTime });
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date(backupTime).toISOString(),
      tables: { foods, dishes, dishItems, log, water, profile }
    },
    null,
    2
  );
}

export async function importFullDatabaseJSON(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || !parsed.tables) {
    throw new Error('Invalid backup file format: missing tables object.');
  }
  const { foods = [], dishes = [], dishItems = [], log = [], water = [], profile = [] } = parsed.tables;
  await db.transaction('rw', [db.foods, db.dishes, db.dishItems, db.log, db.water, db.profile], async () => {
    await Promise.all([
      db.foods.clear(),
      db.dishes.clear(),
      db.dishItems.clear(),
      db.log.clear(),
      db.water.clear(),
      db.profile.clear()
    ]);
    const normalizedFoods = foods.map((f) => ({
      ...f,
      per100: {
        ...f.per100,
        micros: f.per100 && f.per100.micros ? { ...f.per100.micros } : {}
      }
    }));
    await db.foods.bulkPut(normalizedFoods);
    await db.dishes.bulkPut(dishes);
    await db.dishItems.bulkPut(dishItems);
    await db.log.bulkPut(log);
    await db.water.bulkPut(water);
    await db.profile.bulkPut(profile);
  });
}