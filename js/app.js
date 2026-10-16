import {
  db,
  initDatabase,
  getProfile,
  saveProfile,
  deleteOrArchiveFood,
  saveDishWithItems,
  deleteDish,
  exportFullDatabaseJSON,
  importFullDatabaseJSON
} from './db.js';

import {
  calculateTargets,
  getDefaultProteinPerKg,
  checkLabelDiscrepancy,
  scaleNutrition,
  sumNutrition,
  computeDishNutrition,
  formatLocalDate,
  computeStreaks
} from './calc.js';

import {
  escapeHtml,
  fmt,
  showBanner,
  hideBanner,
  renderTodaySummary,
  renderTodayLogs,
  renderWaterSection,
  renderFoodsList,
  renderProfileCalculated,
  renderStreaks
} from './ui.js';

const state = {
  selectedDate: formatLocalDate(new Date()),
  profile: null,
  targets: null,
  foods: [],
  dishes: [],
  dishItems: [],
  draftDishItems: []
};

async function safeRun(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showBanner(err?.message || 'Database operation failed.', 'err');
  }
}

async function initPersistenceAndBackupCheck() {
  const badge = document.getElementById('storage-badge');
  if (navigator.storage && navigator.storage.persist) {
    try {
      const persisted = await navigator.storage.persist();
      if (badge) {
        badge.textContent = persisted ? 'Storage: Persistent' : 'Storage: Best-Effort';
      }
    } catch (_e) {
      if (badge) badge.textContent = 'Storage: Standard';
    }
  } else if (badge) {
    badge.textContent = 'Storage: Local';
  }
  updateBackupStatusUI();
}

function updateBackupStatusUI() {
  const banner = document.getElementById('backup-banner');
  const label = document.getElementById('last-backup-label');
  const lastBackupAt = state.profile?.lastBackupAt || 0;

  if (label) {
    label.textContent = lastBackupAt
      ? `Last full JSON backup: ${new Date(lastBackupAt).toLocaleString()}`
      : 'Last full JSON backup: Never';
  }
  if (banner) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const overdue = !lastBackupAt || Date.now() - lastBackupAt > sevenDaysMs;
    banner.classList.toggle('hidden', !overdue);
  }
}

async function reloadCoreState() {
  const [profile, foods, dishes, dishItems] = await Promise.all([
    getProfile(),
    db.foods.toArray(),
    db.dishes.toArray(),
    db.dishItems.toArray()
  ]);
  state.profile = profile;
  state.targets = calculateTargets(profile);
  state.foods = foods.sort((a, b) => a.name.localeCompare(b.name));
  state.dishes = dishes.sort((a, b) => a.name.localeCompare(b.name));
  state.dishItems = dishItems;

  populateFoodFilterOptions();
  populateLogItemSelector();
  populateDrinkFoodSelector();
  populateDishIngredientSelector();
  renderFoodsTab();
  renderDishesTab();
  renderProfileTab();
  updateBackupStatusUI();
  await renderTodayTab();
  await renderStreaksTab();
}

function populateFoodFilterOptions() {
  const marketSel = document.getElementById('food-filter-market');
  const catSel = document.getElementById('food-filter-category');
  if (!marketSel || !catSel) return;

  const currentMarket = marketSel.value;
  const currentCat = catSel.value;

  const markets = [...new Set(state.foods.map((f) => f.market).filter(Boolean))].sort();
  const categories = [...new Set(state.foods.map((f) => f.category).filter(Boolean))].sort();

  marketSel.innerHTML =
    `<option value="">All Markets</option>` +
    markets.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  catSel.innerHTML =
    `<option value="">All Categories</option>` +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  marketSel.value = markets.includes(currentMarket) ? currentMarket : '';
  catSel.value = categories.includes(currentCat) ? currentCat : '';
}

function getDishNutritionById(dishId, servings = 1) {
  const items = state.dishItems
    .filter((di) => di.dishId === Number(dishId))
    .map((di) => ({
      grams: di.grams,
      food: state.foods.find((f) => f.id === di.foodId)
    }));
  return computeDishNutrition(items, servings);
}

function populateLogItemSelector() {
  const typeSel = document.getElementById('log-ref-type');
  const idSel = document.getElementById('log-ref-id');
  const gramsInput = document.getElementById('log-grams');
  if (!typeSel || !idSel) return;

  const refType = typeSel.value;
  if (refType === 'food') {
    const activeFoods = state.foods.filter((f) => !f.archived);
    idSel.innerHTML = activeFoods
      .map(
        (f) =>
          `<option value="${Number(f.id)}" data-serving="${Number(f.defaultServingG) || 100}">${escapeHtml(f.name)} (${fmt(f.per100?.kcal, 0)} kcal/100g)</option>`
      )
      .join('');
    if (activeFoods[0] && gramsInput) {
      gramsInput.value = activeFoods[0].defaultServingG || 100;
    }
  } else {
    idSel.innerHTML = state.dishes
      .map((d) => {
        const calc = getDishNutritionById(d.id, 1);
        return `<option value="${Number(d.id)}" data-serving="${fmt(calc.totalGrams || 100, 0)}">${escapeHtml(d.name)} (${fmt(calc.per100.kcal, 0)} kcal/100g)</option>`;
      })
      .join('');
    if (state.dishes[0] && gramsInput) {
      const firstCalc = getDishNutritionById(state.dishes[0].id, 1);
      gramsInput.value = fmt(firstCalc.totalGrams || 100, 0);
    }
  }
}

function populateDrinkFoodSelector() {
  const sel = document.getElementById('water-drink-food-id');
  if (!sel) return;
  const drinks = state.foods.filter((f) => !f.archived && Number(f.isDrink) === 1);
  sel.innerHTML =
    `<option value="">— No calories / unlinked —</option>` +
    drinks
      .map(
        (d) =>
          `<option value="${Number(d.id)}">${escapeHtml(d.name)} (${fmt(d.per100?.kcal, 0)} kcal/100ml)</option>`
      )
      .join('');
}

function populateDishIngredientSelector() {
  const sel = document.getElementById('dish-ingredient-food');
  if (!sel) return;
  const activeFoods = state.foods.filter((f) => !f.archived);
  sel.innerHTML = activeFoods
    .map((f) => `<option value="${Number(f.id)}">${escapeHtml(f.name)} (${fmt(f.per100?.kcal, 0)} kcal/100g)</option>`)
    .join('');
}

async function renderTodayTab() {
  const dateInput = document.getElementById('today-date-input');
  if (dateInput) dateInput.value = state.selectedDate;

  const [dayLogs, dayWater] = await Promise.all([
    db.log.where('date').equals(state.selectedDate).toArray(),
    db.water.where('date').equals(state.selectedDate).toArray()
  ]);

  const totals = sumNutrition(dayLogs.map((l) => l.snapshot));
  renderTodaySummary(totals, state.targets);
  renderTodayLogs(dayLogs);
  renderWaterSection(dayWater, state.targets);
}

function renderFoodsTab() {
  const q = (document.getElementById('food-search')?.value || '').trim().toLowerCase();
  const market = document.getElementById('food-filter-market')?.value || '';
  const category = document.getElementById('food-filter-category')?.value || '';
  const isDrinkVal = document.getElementById('food-filter-drink')?.value ?? '';
  const showArchived = Boolean(document.getElementById('food-show-archived')?.checked);

  const filtered = state.foods.filter((f) => {
    if (!showArchived && f.archived) return false;
    if (market && f.market !== market) return false;
    if (category && f.category !== category) return false;
    if (isDrinkVal !== '' && Number(f.isDrink) !== Number(isDrinkVal)) return false;
    if (q) {
      const hay = `${f.name} ${f.brand || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderFoodsList(filtered, state.profile?.currency || '€');
}

function renderDraftDishUI() {
  const listEl = document.getElementById('dish-Draft-items');
  const sumEl = document.getElementById('dish-live-summary');
  const servings = Number(document.getElementById('dish-servings')?.value) || 1;
  if (!listEl || !sumEl) return;

  if (state.draftDishItems.length === 0) {
    listEl.innerHTML = `<p class="meta-text">Add at least one ingredient above.</p>`;
    sumEl.innerHTML = `<span class="meta-text">Total: 0g | 0 kcal</span>`;
    return;
  }

  const enriched = state.draftDishItems.map((item, idx) => ({
    idx,
    grams: item.grams,
    food: state.foods.find((f) => f.id === Number(item.foodId))
  }));

  listEl.innerHTML = enriched
    .map(
      (row) => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(row.food?.name || 'Unknown')} — ${fmt(row.grams, 0)}g</div>
        </div>
        <button type="button" class="btn btn-sm" data-action="remove-draft-item" data-idx="${row.idx}">Remove</button>
      </div>
    `
    )
    .join('');

  const calc = computeDishNutrition(enriched, servings);
  sumEl.innerHTML = `
    <div class="mono-text"><strong>Total (${fmt(calc.totalGrams, 0)}g):</strong> ${fmt(calc.total.kcal, 0)} kcal | P ${fmt(calc.total.protein, 1)}g | C ${fmt(calc.total.carbs, 1)}g | F ${fmt(calc.total.fat, 1)}g</div>
    <div class="mono-text"><strong>Per 100g:</strong> ${fmt(calc.per100.kcal, 0)} kcal | P ${fmt(calc.per100.protein, 1)}g | C ${fmt(calc.per100.carbs, 1)}g | F ${fmt(calc.per100.fat, 1)}g</div>
    <div class="mono-text"><strong>Per Serving (1/${fmt(servings, 1)}):</strong> ${fmt(calc.perServing.kcal, 0)} kcal | P ${fmt(calc.perServing.protein, 1)}g | C ${fmt(calc.perServing.carbs, 1)}g | F ${fmt(calc.perServing.fat, 1)}g</div>
  `;
}

function renderDishesTab() {
  renderDraftDishUI();
  const container = document.getElementById('dishes-list');
  if (!container) return;

  if (state.dishes.length === 0) {
    container.innerHTML = `<p class="meta-text">No saved dishes yet.</p>`;
    return;
  }

  container.innerHTML = state.dishes
    .map((d) => {
      const calc = getDishNutritionById(d.id, 1);
      return `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.name)} (${fmt(calc.totalGrams, 0)}g total)</div>
            <div class="list-item-sub mono-text">
              Total: ${fmt(calc.total.kcal, 0)} kcal | 100g: ${fmt(calc.per100.kcal, 0)} kcal (P ${fmt(calc.per100.protein, 1)}g, C ${fmt(calc.per100.carbs, 1)}g, F ${fmt(calc.per100.fat, 1)}g)
            </div>
            ${d.notes ? `<div class="list-item-sub">${escapeHtml(d.notes)}</div>` : ''}
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-sm" data-action="edit-dish" data-id="${Number(d.id)}">Edit</button>
            <button type="button" class="btn btn-sm" data-action="delete-dish" data-id="${Number(d.id)}">Del</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function renderStreaksTab() {
  const [allLogs, allWater] = await Promise.all([db.log.toArray(), db.water.toArray()]);
  const logsByDate = {};
  for (const l of allLogs) {
    if (!logsByDate[l.date]) logsByDate[l.date] = [];
    logsByDate[l.date].push(l);
  }
  const waterByDate = {};
  for (const w of allWater) {
    if (!waterByDate[w.date]) waterByDate[w.date] = [];
    waterByDate[w.date].push(w);
  }

  const streakData = computeStreaks({
    logsByDate,
    waterByDate,
    targets: state.targets,
    restDaysInput: state.profile?.restDays || '',
    todayStr: formatLocalDate(new Date())
  });
  renderStreaks(streakData);
}

function renderProfileTab() {
  const p = state.profile;
  if (p) {
    document.getElementById('prof-sex').value = p.sex || 'female';
    document.getElementById('prof-age').value = p.age || '';
    document.getElementById('prof-height').value = p.heightCm || '';
    document.getElementById('prof-weight').value = p.weightKg || '';
    document.getElementById('prof-activity').value = String(p.activityLevel || '1.2');
    document.getElementById('prof-goal').value = p.goal || 'maintenance';
    document.getElementById('prof-rate').value = p.rateKgPerWeek ?? 0.25;
    document.getElementById('prof-protein-gkg').value = p.proteinPerKg ?? getDefaultProteinPerKg(p.goal);
    document.getElementById('prof-fat-pct').value = p.fatPct ?? 25;
    document.getElementById('prof-water-mlkg').value = p.waterMlPerKg ?? 35;
    document.getElementById('prof-currency').value = p.currency || '€';
    document.getElementById('prof-restdays').value = p.restDays || '';
  }
  renderProfileCalculated(state.targets);
}

function updateFoodFormAtwaterCheck() {
  const per100 = {
    kcal: Number(document.getElementById('food-kcal')?.value) || 0,
    protein: Number(document.getElementById('food-protein')?.value) || 0,
    carbs: Number(document.getElementById('food-carbs')?.value) || 0,
    fat: Number(document.getElementById('food-fat')?.value) || 0
  };
  const check = checkLabelDiscrepancy(per100);
  const warnBox = document.getElementById('food-atwater-warning');
  if (!warnBox) return;

  if (check.hasWarning) {
    warnBox.textContent = `Label check: Macros estimate ${fmt(check.atwaterKcal, 0)} kcal/100g vs entered ${fmt(check.enteredKcal, 0)} kcal (${fmt(check.diffRatio * 100, 0)}% difference > 15%). Check for label typos.`;
    warnBox.classList.remove('hidden');
  } else {
    warnBox.classList.add('hidden');
  }
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function bindEvents() {
  // Bottom Tab Navigation
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        p.classList.toggle('active', p.id === `tab-${target}`)
      );
    });
  });

  document.getElementById('status-banner-close')?.addEventListener('click', hideBanner);

  // Date navigation
  document.getElementById('today-date-input')?.addEventListener('change', (e) => {
    if (e.target.value) {
      state.selectedDate = e.target.value;
      safeRun(renderTodayTab);
    }
  });

  document.getElementById('date-prev-btn')?.addEventListener('click', () => {
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    state.selectedDate = formatLocalDate(new Date(y, m - 1, d - 1));
    safeRun(renderTodayTab);
  });

  document.getElementById('date-next-btn')?.addEventListener('click', () => {
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    state.selectedDate = formatLocalDate(new Date(y, m - 1, d + 1));
    safeRun(renderTodayTab);
  });

  document.getElementById('date-today-btn')?.addEventListener('click', () => {
    state.selectedDate = formatLocalDate(new Date());
    safeRun(renderTodayTab);
  });

  // Log entry form
  document.getElementById('log-ref-type')?.addEventListener('change', populateLogItemSelector);
  document.getElementById('log-ref-id')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.serving) {
      document.getElementById('log-grams').value = opt.dataset.serving;
    }
  });

  document.getElementById('log-entry-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      const meal = document.getElementById('log-meal').value;
      const refType = document.getElementById('log-ref-type').value;
      const refId = Number(document.getElementById('log-ref-id').value);
      const grams = Number(document.getElementById('log-grams').value);
      if (!refId || grams <= 0) throw new Error('Select a valid item and positive gram amount.');

      let per100;
      let itemName;
      if (refType === 'food') {
        const food = state.foods.find((f) => f.id === refId);
        if (!food) throw new Error('Selected food not found.');
        per100 = { ...food.per100, micros: { ...(food.per100?.micros || {}) } };
        itemName = food.name;
      } else {
        const dish = state.dishes.find((d) => d.id === refId);
        if (!dish) throw new Error('Selected dish not found.');
        const calc = getDishNutritionById(refId, 1);
        per100 = calc.per100;
        itemName = `${dish.name} (Dish)`;
      }

      const scaled = scaleNutrition(per100, grams);
      await db.log.add({
        date: state.selectedDate,
        meal,
        refType,
        refId,
        grams,
        snapshot: {
          name: itemName,
          per100,
          ...scaled
        },
        createdAt: Date.now()
      });
      await renderTodayTab();
      await renderStreaksTab();
    });
  });

  // Edit / Delete Today Log
  document.getElementById('today-log-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.dataset.action === 'delete-log') {
      safeRun(async () => {
        await db.log.delete(id);
        await renderTodayTab();
        await renderStreaksTab();
      });
    } else if (btn.dataset.action === 'edit-log') {
      const currentGrams = Number(btn.dataset.grams) || 100;
      const input = window.prompt('Enter updated weight (g / ml):', String(currentGrams));
      if (input === null) return;
      const newGrams = Number(input);
      if (!newGrams || newGrams <= 0) {
        showBanner('Weight must be a positive number.', 'warn');
        return;
      }
      safeRun(async () => {
        const existing = await db.log.get(id);
        if (!existing) return;
        const basePer100 = existing.snapshot?.per100 || scaleNutrition(existing.snapshot, 10000 / (existing.grams || 100));
        const rescaled = scaleNutrition(basePer100, newGrams);
        await db.log.update(id, {
          grams: newGrams,
          snapshot: {
            ...existing.snapshot,
            per100: basePer100,
            ...rescaled
          }
        });
        await renderTodayTab();
        await renderStreaksTab();
      });
    }
  });

  // Water quick buttons & custom form
  document.querySelectorAll('.water-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ml = Number(btn.dataset.ml);
      safeRun(async () => {
        await db.water.add({
          date: state.selectedDate,
          ml,
          type: 'water',
          label: 'Water',
          createdAt: Date.now()
        });
        await renderTodayTab();
        await renderStreaksTab();
      });
    });
  });

  document.getElementById('water-custom-type')?.addEventListener('change', (e) => {
    const row = document.getElementById('water-drink-food-row');
    if (row) row.classList.toggle('hidden', e.target.value !== 'other');
  });

  document.getElementById('water-custom-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      const ml = Number(document.getElementById('water-custom-ml').value);
      const type = document.getElementById('water-custom-type').value;
      const linkedFoodId = Number(document.getElementById('water-drink-food-id').value);
      let label = document.getElementById('water-custom-label').value.trim();

      if (!ml || ml <= 0) throw new Error('Enter a valid fluid volume in ml.');

      if (type === 'other' && linkedFoodId) {
        const drinkFood = state.foods.find((f) => f.id === linkedFoodId);
        if (drinkFood) {
          if (!label) label = drinkFood.name;
          const per100 = { ...drinkFood.per100, micros: { ...(drinkFood.per100?.micros || {}) } };
          const scaled = scaleNutrition(per100, ml);
          await db.log.add({
            date: state.selectedDate,
            meal: 'Snack',
            refType: 'food',
            refId: drinkFood.id,
            grams: ml,
            snapshot: {
              name: `${drinkFood.name} (Drink)`,
              per100,
              ...scaled
            },
            createdAt: Date.now()
          });
        }
      }

      await db.water.add({
        date: state.selectedDate,
        ml,
        type,
        label: label || (type === 'water' ? 'Water' : 'Drink'),
        createdAt: Date.now()
      });

      document.getElementById('water-custom-ml').value = '';
      document.getElementById('water-custom-label').value = '';
      await renderTodayTab();
      await renderStreaksTab();
    });
  });

  document.getElementById('water-log-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-water"]');
    if (!btn) return;
    safeRun(async () => {
      await db.water.delete(Number(btn.dataset.id));
      await renderTodayTab();
      await renderStreaksTab();
    });
  });

  // Food Form & Live Atwater Validation
  ['food-kcal', 'food-protein', 'food-carbs', 'food-fat'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateFoodFormAtwaterCheck);
  });

  function resetFoodForm() {
    document.getElementById('food-form').reset();
    document.getElementById('food-id').value = '';
    document.getElementById('food-form-title').textContent = 'Fast Add / Edit Food';
    document.getElementById('food-form-reset-btn').classList.add('hidden');
    document.getElementById('food-atwater-warning').classList.add('hidden');
  }

  document.getElementById('food-form-reset-btn')?.addEventListener('click', resetFoodForm);

  document.getElementById('food-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      const editId = document.getElementById('food-id').value;
      const existing = editId ? await db.foods.get(Number(editId)) : null;

      const record = {
        name: document.getElementById('food-name').value.trim(),
        brand: document.getElementById('food-brand').value.trim(),
        market: document.getElementById('food-market').value.trim(),
        category: document.getElementById('food-category').value.trim(),
        isDrink: Number(document.getElementById('food-is-drink').value) ? 1 : 0,
        per100: {
          kcal: Number(document.getElementById('food-kcal').value) || 0,
          protein: Number(document.getElementById('food-protein').value) || 0,
          carbs: Number(document.getElementById('food-carbs').value) || 0,
          sugars: Number(document.getElementById('food-sugars').value) || 0,
          fiber: Number(document.getElementById('food-fiber').value) || 0,
          fat: Number(document.getElementById('food-fat').value) || 0,
          satFat: Number(document.getElementById('food-satfat').value) || 0,
          sodiumMg: Number(document.getElementById('food-sodium').value) || 0,
          micros: existing?.per100?.micros ? { ...existing.per100.micros } : {}
        },
        defaultServingG: Number(document.getElementById('food-serving').value) || 100,
        pricePerKg: document.getElementById('food-price').value
          ? Number(document.getElementById('food-price').value)
          : null,
        source: document.getElementById('food-source').value.trim() || 'user-label',
        archived: existing ? existing.archived : 0,
        updatedAt: Date.now()
      };

      if (editId) {
        await db.foods.update(Number(editId), record);
        showBanner(`Updated "${record.name}". Past logs remain unchanged.`, 'info');
      } else {
        await db.foods.add(record);
        showBanner(`Added "${record.name}" to database.`, 'info');
      }
      resetFoodForm();
      await reloadCoreState();
    });
  });

  // Food Filters & List Actions
  ['food-search', 'food-filter-market', 'food-filter-category', 'food-filter-drink', 'food-show-archived'].forEach(
    (id) => {
      document.getElementById(id)?.addEventListener('input', renderFoodsTab);
      document.getElementById(id)?.addEventListener('change', renderFoodsTab);
    }
  );

  document.getElementById('foods-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.dataset.action === 'edit-food') {
      const food = state.foods.find((f) => f.id === id);
      if (!food) return;
      document.getElementById('food-id').value = food.id;
      document.getElementById('food-name').value = food.name;
      document.getElementById('food-brand').value = food.brand || '';
      document.getElementById('food-market').value = food.market || '';
      document.getElementById('food-category').value = food.category || '';
      document.getElementById('food-is-drink').value = String(food.isDrink ? 1 : 0);
      document.getElementById('food-kcal').value = food.per100.kcal;
      document.getElementById('food-protein').value = food.per100.protein;
      document.getElementById('food-carbs').value = food.per100.carbs;
      document.getElementById('food-fat').value = food.per100.fat;
      document.getElementById('food-sugars').value = food.per100.sugars ?? 0;
      document.getElementById('food-fiber').value = food.per100.fiber ?? 0;
      document.getElementById('food-satfat').value = food.per100.satFat ?? 0;
      document.getElementById('food-sodium').value = food.per100.sodiumMg ?? 0;
      document.getElementById('food-serving').value = food.defaultServingG || 100;
      document.getElementById('food-price').value = food.pricePerKg ?? '';
      document.getElementById('food-source').value = food.source || 'user-label';
      document.getElementById('food-form-title').textContent = `Edit Food: ${food.name}`;
      document.getElementById('food-form-reset-btn').classList.remove('hidden');
      updateFoodFormAtwaterCheck();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.dataset.action === 'delete-food') {
      safeRun(async () => {
        const res = await deleteOrArchiveFood(id);
        if (res.action === 'archived') {
          showBanner(
            `Food is referenced ${res.totalUses} time(s) in dishes or logs. Archived (hidden from active search) to preserve history.`,
            'warn'
          );
        } else {
          showBanner('Unused food permanently deleted.', 'info');
        }
        await reloadCoreState();
      });
    }
  });

  // Export / Import JSON & CSV
  async function handleExportJSON() {
    safeRun(async () => {
      const jsonStr = await exportFullDatabaseJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nutrilog-backup-${formatLocalDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await reloadCoreState();
      showBanner('Full database exported as JSON.', 'info');
    });
  }

  document.getElementById('export-json-btn')?.addEventListener('click', handleExportJSON);
  document.getElementById('backup-now-btn')?.addEventListener('click', handleExportJSON);

  document.getElementById('import-json-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    safeRun(async () => {
      const text = await file.text();
      await importFullDatabaseJSON(text);
      e.target.value = '';
      await reloadCoreState();
      showBanner('Database restored from JSON backup.', 'info');
    });
  });

  document.getElementById('import-csv-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    safeRun(async () => {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) throw new Error('CSV file must include a header row and at least one food row.');

      const headers = parseCSVLine(lines[0]);
      const toAdd = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = cols[idx] ?? '';
        });
        if (!row.name) continue;
        toAdd.push({
          name: row.name,
          brand: row.brand || '',
          market: row.market || '',
          category: row.category || '',
          isDrink: Number(row.isDrink) === 1 ? 1 : 0,
          per100: {
            kcal: Number(row.kcal) || 0,
            protein: Number(row.protein) || 0,
            carbs: Number(row.carbs) || 0,
            sugars: Number(row.sugars) || 0,
            fiber: Number(row.fiber) || 0,
            fat: Number(row.fat) || 0,
            satFat: Number(row.satFat) || 0,
            sodiumMg: Number(row.sodiumMg) || 0,
            micros: {}
          },
          defaultServingG: Number(row.defaultServingG) || 100,
          pricePerKg: row.pricePerKg ? Number(row.pricePerKg) : null,
          source: row.source || 'csv-import',
          archived: 0,
          updatedAt: Date.now()
        });
      }
      if (toAdd.length > 0) {
        await db.foods.bulkAdd(toAdd);
      }
      e.target.value = '';
      await reloadCoreState();
      showBanner(`Imported ${toAdd.length} food(s) from CSV.`, 'info');
    });
  });

  // Dishes Builder
  document.getElementById('dish-servings')?.addEventListener('input', renderDraftDishUI);

  document.getElementById('dish-add-ingredient-btn')?.addEventListener('click', () => {
    const foodId = Number(document.getElementById('dish-ingredient-food')?.value);
    const grams = Number(document.getElementById('dish-ingredient-grams')?.value);
    if (!foodId || grams <= 0) {
      showBanner('Select an ingredient and enter a positive gram weight.', 'warn');
      return;
    }
    state.draftDishItems.push({ foodId, grams });
    renderDraftDishUI();
  });

  document.getElementById('dish-Draft-items')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove-draft-item"]');
    if (!btn) return;
    state.draftDishItems.splice(Number(btn.dataset.idx), 1);
    renderDraftDishUI();
  });

  function resetDishForm() {
    document.getElementById('dish-form').reset();
    document.getElementById('dish-id').value = '';
    document.getElementById('dish-form-title').textContent = 'Build / Edit Dish';
    document.getElementById('dish-form-reset-btn').classList.add('hidden');
    state.draftDishItems = [];
    renderDraftDishUI();
  }

  document.getElementById('dish-form-reset-btn')?.addEventListener('click', resetDishForm);

  document.getElementById('dish-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      if (state.draftDishItems.length === 0) {
        throw new Error('Add at least one food ingredient to save the dish.');
      }
      const id = document.getElementById('dish-id').value;
      const name = document.getElementById('dish-name').value.trim();
      const notes = document.getElementById('dish-notes').value.trim();
      await saveDishWithItems({ id, name, notes }, state.draftDishItems);
      resetDishForm();
      await reloadCoreState();
      showBanner(`Saved dish "${name}".`, 'info');
    });
  });

  document.getElementById('dishes-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.dataset.action === 'edit-dish') {
      const dish = state.dishes.find((d) => d.id === id);
      if (!dish) return;
      document.getElementById('dish-id').value = dish.id;
      document.getElementById('dish-name').value = dish.name;
      document.getElementById('dish-notes').value = dish.notes || '';
      state.draftDishItems = state.dishItems
        .filter((di) => di.dishId === id)
        .map((di) => ({ foodId: di.foodId, grams: di.grams }));
      document.getElementById('dish-form-title').textContent = `Edit Dish: ${dish.name}`;
      document.getElementById('dish-form-reset-btn').classList.remove('hidden');
      renderDraftDishUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.dataset.action === 'delete-dish') {
      safeRun(async () => {
        await deleteDish(id);
        await reloadCoreState();
        showBanner('Dish deleted.', 'info');
      });
    }
  });

  // Profile Form
  document.getElementById('prof-goal')?.addEventListener('change', (e) => {
    document.getElementById('prof-protein-gkg').value = getDefaultProteinPerKg(e.target.value);
  });

  document.getElementById('profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      await saveProfile({
        sex: document.getElementById('prof-sex').value,
        age: Number(document.getElementById('prof-age').value),
        heightCm: Number(document.getElementById('prof-height').value),
        weightKg: Number(document.getElementById('prof-weight').value),
        activityLevel: Number(document.getElementById('prof-activity').value),
        goal: document.getElementById('prof-goal').value,
        rateKgPerWeek: Number(document.getElementById('prof-rate').value) || 0,
        proteinPerKg: Number(document.getElementById('prof-protein-gkg').value),
        fatPct: Number(document.getElementById('prof-fat-pct').value),
        waterMlPerKg: Number(document.getElementById('prof-water-mlkg').value),
        currency: document.getElementById('prof-currency').value.trim() || '€',
        restDays: document.getElementById('prof-restdays').value.trim()
      });
      await reloadCoreState();
      showBanner('Profile and physiological targets saved.', 'info');
    });
  });
}

async function bootstrap() {
  bindEvents();
  await safeRun(async () => {
    await initDatabase();
    await reloadCoreState();
    await initPersistenceAndBackupCheck();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration skipped:', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);