import { APP_VERSION, DEFAULT_AUTOLOCK_MIN } from './config.js';
import { authProvider, evaluatePasswordPolicy } from './auth/localAuth.js';
import {
  openUserDb,
  closeUserDb,
  getProfile,
  saveProfile,
  getUserSettings,
  saveUserSettings,
  deleteOrArchiveFood,
  saveDishWithItems,
  softDeleteDish,
  softDeleteRecord,
  exportUserDbJSON,
  importUserDbJSON
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
  showAuthError,
  renderTodaySummary,
  renderTodayLogs,
  renderWaterSection,
  renderFoodsList,
  renderProfileCalculated,
  renderStreaks
} from './ui.js';

const state = {
  session: null,
  userDb: null,
  selectedDate: formatLocalDate(new Date()),
  profile: null,
  settings: null,
  targets: null,
  foods: [],
  dishes: [],
  dishItems: [],
  draftDishItems: [],
  inactivityTimer: null,
  pendingRecoveryDoneAction: null
};

async function safeRun(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showBanner(err?.message || 'Operation failed.', 'err');
  }
}

async function safeAuthRun(fn) {
  showAuthError('');
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showAuthError(err?.message || 'Authentication error.');
  }
}

// ---------------- AUTO-LOCK INACTIVITY TIMER ----------------

function resetInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    state.inactivityTimer = null;
  }
  if (!state.session) return;
  const minutes = Number(state.settings?.autoLockMinutes ?? DEFAULT_AUTOLOCK_MIN);
  if (!minutes || minutes <= 0) return;

  state.inactivityTimer = setTimeout(() => {
    authProvider.signOut('autolock').catch(console.error);
  }, minutes * 60 * 1000);
}

function bindActivityListeners() {
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  for (const ev of events) {
    window.addEventListener(ev, () => {
      if (state.session) resetInactivityTimer();
    }, { passive: true });
  }
}

// ---------------- AUTH UI & VIEW SWITCHING ----------------

function showAuthPanel(panelId) {
  showAuthError('');
  const panels = ['auth-signin-panel', 'auth-signup-panel', 'auth-recovery-panel', 'auth-reset-panel'];
  for (const id of panels) {
    document.getElementById(id)?.classList.toggle('hidden', id !== panelId);
  }
  const activePanel = document.getElementById(panelId);
  const firstInput = activePanel?.querySelector('input:not([type="hidden"]):not([type="checkbox"])');
  if (firstInput) firstInput.focus();
}

async function refreshLegacyNoticeUI() {
  const status = await authProvider.getLegacyStatus();
  const notice = document.getElementById('legacy-migration-notice');
  if (notice) {
    notice.classList.toggle('hidden', !status.hasLegacyData);
  }
  const cleanupRow = document.getElementById('settings-legacy-cleanup-row');
  if (cleanupRow) {
    cleanupRow.classList.toggle('hidden', !(status.migrated && !status.legacyDeleted));
  }
}

async function enterAuthenticatedApp(session) {
  state.session = session;
  state.userDb = await openUserDb(session.accountId);

  document.getElementById('auth-view')?.classList.add('hidden');
  document.getElementById('app-main')?.classList.remove('hidden');
  document.getElementById('bottom-nav')?.classList.remove('hidden');
  document.getElementById('header-lock-btn')?.classList.remove('hidden');

  const userBadge = document.getElementById('account-badge');
  if (userBadge) {
    userBadge.textContent = session.displayName || session.login;
    userBadge.classList.remove('hidden');
  }

  await reloadCoreState();
  await initPersistenceAndBackupCheck();
  await refreshLegacyNoticeUI();
  resetInactivityTimer();
}

async function enterLockedAuthView(meta = {}) {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    state.inactivityTimer = null;
  }
  if (state.session?.accountId) {
    await closeUserDb(state.session.accountId);
  }
  state.session = null;
  state.userDb = null;
  state.profile = null;
  state.settings = null;
  state.targets = null;
  state.foods = [];
  state.dishes = [];
  state.dishItems = [];
  state.draftDishItems = [];

  document.getElementById('app-main')?.classList.add('hidden');
  document.getElementById('bottom-nav')?.classList.add('hidden');
  document.getElementById('header-lock-btn')?.classList.add('hidden');
  document.getElementById('account-badge')?.classList.add('hidden');
  document.getElementById('backup-banner')?.classList.add('hidden');
  hideBanner();

  document.getElementById('auth-view')?.classList.remove('hidden');
  showAuthPanel('auth-signin-panel');

  if (meta?.lastLogin) {
    const loginInput = document.getElementById('signin-login');
    if (loginInput) loginInput.value = meta.lastLogin;
  }
  if (meta?.reason === 'autolock') {
    showAuthError('Session locked due to inactivity. Sign in to continue.');
  } else if (meta?.reason === 'locked') {
    showAuthError('Session locked.');
  }

  await refreshLegacyNoticeUI();
}

function presentRecoveryCodeModal(recoveryCode, onConfirmed) {
  const codeEl = document.getElementById('recovery-code-display');
  const confirmCheck = document.getElementById('recovery-saved-checkbox');
  const continueBtn = document.getElementById('recovery-continue-btn');

  if (codeEl) codeEl.textContent = recoveryCode;
  if (confirmCheck) confirmCheck.checked = false;
  if (continueBtn) continueBtn.disabled = true;

  state.pendingRecoveryDoneAction = onConfirmed;
  showAuthPanel('auth-recovery-panel');
}

// ---------------- PERSISTENCE & BACKUP REMINDER ----------------

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
  if (banner && state.session) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const overdue = !lastBackupAt || Date.now() - lastBackupAt > sevenDaysMs;
    banner.classList.toggle('hidden', !overdue);
  }
}

// ---------------- CORE DATA LOADING (SCOPED TO userDb) ----------------

async function reloadCoreState() {
  if (!state.userDb) return;
  const userDb = state.userDb;

  const [profile, settings, rawFoods, rawDishes, rawDishItems] = await Promise.all([
    getProfile(userDb),
    getUserSettings(userDb),
    userDb.foods.toArray(),
    userDb.dishes.toArray(),
    userDb.dishItems.toArray()
  ]);

  state.profile = profile;
  state.settings = settings;
  state.targets = calculateTargets(profile);
  state.foods = rawFoods.filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
  state.dishes = rawDishes.filter((d) => !d.deleted).sort((a, b) => a.name.localeCompare(b.name));
  state.dishItems = rawDishItems.filter((di) => !di.deleted);

  populateFoodFilterOptions();
  populateLogItemSelector();
  populateDrinkFoodSelector();
  populateDishIngredientSelector();
  renderFoodsTab();
  renderDishesTab();
  renderProfileTab();
  updateBackupStatusUI();
  resetInactivityTimer();
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
    .filter((di) => di.dishId === String(dishId) && !di.deleted)
    .map((di) => ({
      grams: di.grams,
      food: state.foods.find((f) => f.id === String(di.foodId))
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
    const activeFoods = state.foods.filter((f) => !f.archived && !f.deleted);
    idSel.innerHTML = activeFoods
      .map(
        (f) =>
          `<option value="${escapeHtml(f.id)}" data-serving="${Number(f.defaultServingG) || 100}">${escapeHtml(f.name)} (${fmt(f.per100?.kcal, 0)} kcal/100g)</option>`
      )
      .join('');
    if (activeFoods[0] && gramsInput) {
      gramsInput.value = activeFoods[0].defaultServingG || 100;
    }
  } else {
    idSel.innerHTML = state.dishes
      .map((d) => {
        const calc = getDishNutritionById(d.id, 1);
        return `<option value="${escapeHtml(d.id)}" data-serving="${fmt(calc.totalGrams || 100, 0)}">${escapeHtml(d.name)} (${fmt(calc.per100.kcal, 0)} kcal/100g)</option>`;
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
  const drinks = state.foods.filter((f) => !f.archived && !f.deleted && Number(f.isDrink) === 1);
  sel.innerHTML =
    `<option value="">— No calories / unlinked —</option>` +
    drinks
      .map(
        (d) =>
          `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${fmt(d.per100?.kcal, 0)} kcal/100ml)</option>`
      )
      .join('');
}

function populateDishIngredientSelector() {
  const sel = document.getElementById('dish-ingredient-food');
  if (!sel) return;
  const activeFoods = state.foods.filter((f) => !f.archived && !f.deleted);
  sel.innerHTML = activeFoods
    .map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)} (${fmt(f.per100?.kcal, 0)} kcal/100g)</option>`)
    .join('');
}

async function renderTodayTab() {
  if (!state.userDb) return;
  const dateInput = document.getElementById('today-date-input');
  if (dateInput) dateInput.value = state.selectedDate;

  const [rawLogs, rawWater] = await Promise.all([
    state.userDb.log.where('date').equals(state.selectedDate).toArray(),
    state.userDb.water.where('date').equals(state.selectedDate).toArray()
  ]);

  const dayLogs = rawLogs.filter((l) => !l.deleted);
  const dayWater = rawWater.filter((w) => !w.deleted);

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
    if (f.deleted) return false;
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
    food: state.foods.find((f) => f.id === String(item.foodId))
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
            <button type="button" class="btn btn-sm" data-action="edit-dish" data-id="${escapeHtml(d.id)}">Edit</button>
            <button type="button" class="btn btn-sm" data-action="delete-dish" data-id="${escapeHtml(d.id)}">Del</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function renderStreaksTab() {
  if (!state.userDb) return;
  const [rawLogs, rawWater] = await Promise.all([
    state.userDb.log.toArray(),
    state.userDb.water.toArray()
  ]);

  const logsByDate = {};
  for (const l of rawLogs) {
    if (l.deleted) continue;
    if (!logsByDate[l.date]) logsByDate[l.date] = [];
    logsByDate[l.date].push(l);
  }
  const waterByDate = {};
  for (const w of rawWater) {
    if (w.deleted) continue;
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
  } else {
    document.getElementById('profile-form')?.reset();
  }

  const autoLockSel = document.getElementById('settings-autolock');
  if (autoLockSel && state.settings) {
    autoLockSel.value = String(state.settings.autoLockMinutes ?? DEFAULT_AUTOLOCK_MIN);
  }

  const accSummary = document.getElementById('settings-account-summary');
  if (accSummary && state.session) {
    accSummary.textContent = `Signed in as ${state.session.displayName} (${state.session.login})`;
  }

  const verEl = document.getElementById('settings-app-version');
  if (verEl) {
    verEl.textContent = `v${APP_VERSION}`;
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
    warnBox.textContent = `Label check: Macros estimate ${fmt(check.atwaterKcal, 0)} kcal/100g vs entered ${fmt(check.enteredKcal, 0)} kcal (${fmt(check.diffRatio * 100, 0)}% difference). Check for label typos.`;
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

function triggerFileDownload(content, filename, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bindAuthEvents() {
  // Switch auth screens
  document.getElementById('goto-signup-btn')?.addEventListener('click', () => showAuthPanel('auth-signup-panel'));
  document.getElementById('goto-signin-from-signup-btn')?.addEventListener('click', () => showAuthPanel('auth-signin-panel'));
  document.getElementById('goto-reset-btn')?.addEventListener('click', () => showAuthPanel('auth-reset-panel'));
  document.getElementById('goto-signin-from-reset-btn')?.addEventListener('click', () => showAuthPanel('auth-signin-panel'));

  // Show / Hide password toggles
  document.querySelectorAll('button[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      btn.textContent = isPwd ? 'Hide' : 'Show';
    });
  });

  // Live password strength hints
  const updateStrengthHint = (pwdInputId, loginInputId, hintElId) => {
    const pwd = document.getElementById(pwdInputId)?.value || '';
    const login = loginInputId ? document.getElementById(loginInputId)?.value || '' : '';
    const hintEl = document.getElementById(hintElId);
    if (!hintEl) return;
    if (!pwd) {
      hintEl.textContent = 'Minimum 10 characters.';
      return;
    }
    const res = evaluatePasswordPolicy(pwd, login);
    hintEl.textContent = res.message;
  };

  document.getElementById('signup-password')?.addEventListener('input', () =>
    updateStrengthHint('signup-password', 'signup-login', 'signup-password-hint')
  );
  document.getElementById('reset-new-password')?.addEventListener('input', () =>
    updateStrengthHint('reset-new-password', 'reset-login', 'reset-password-hint')
  );
  document.getElementById('settings-new-password')?.addEventListener('input', () =>
    updateStrengthHint('settings-new-password', '', 'settings-password-hint')
  );

  // Pre-migration legacy backup button
  document.getElementById('legacy-backup-btn')?.addEventListener('click', () => {
    safeAuthRun(async () => {
      const jsonStr = await authProvider.exportLegacyBackupJSON();
      triggerFileDownload(jsonStr, `nutrilog-v0.1-legacy-backup-${formatLocalDate(new Date())}.json`);
    });
  });

  // Sign In form
  document.getElementById('signin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeAuthRun(async () => {
      const login = document.getElementById('signin-login').value;
      const passwordInput = document.getElementById('signin-password');
      const password = passwordInput.value;
      const keepSignedIn = document.getElementById('signin-keep').checked;
      passwordInput.value = '';
      await authProvider.signIn({ login, password, keepSignedIn });
    });
  });

  // Sign Up form
  document.getElementById('signup-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeAuthRun(async () => {
      const login = document.getElementById('signup-login').value;
      const displayName = document.getElementById('signup-display-name').value;
      const pwdInput = document.getElementById('signup-password');
      const confirmInput = document.getElementById('signup-confirm-password');
      const password = pwdInput.value;
      const confirmPwd = confirmInput.value;
      const acceptLegal = document.getElementById('signup-accept-legal').checked;
      const confirmAge18 = document.getElementById('signup-confirm-age').checked;
      const keepSignedIn = document.getElementById('signup-keep').checked;

      if (password !== confirmPwd) {
        throw new Error('Password and Confirm Password do not match.');
      }

      pwdInput.value = '';
      confirmInput.value = '';

      const { recoveryCode, migratedLegacy } = await authProvider.signUp({
        login,
        displayName,
        password,
        acceptLegal,
        confirmAge18,
        keepSignedIn
      });

      document.getElementById('signup-form').reset();

      presentRecoveryCodeModal(recoveryCode, () => {
        authProvider.notifySignedIn();
        if (migratedLegacy) {
          showBanner('Legacy v0.1 data migrated and verified in your new account.', 'info');
        }
      });
    });
  });

  // Recovery code display actions
  document.getElementById('recovery-copy-btn')?.addEventListener('click', () => {
    const code = document.getElementById('recovery-code-display')?.textContent || '';
    if (navigator.clipboard && code) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
  });

  document.getElementById('recovery-download-btn')?.addEventListener('click', () => {
    const code = document.getElementById('recovery-code-display')?.textContent || '';
    if (!code) return;
    const content = `NutriLog Account Recovery Code\r\nGenerated: ${new Date().toISOString()}\r\nRecovery Code: ${code}\r\n\r\nKeep this code safe. Without your password or this recovery code, your account cannot be unlocked.\r\n`;
    triggerFileDownload(content, 'nutrilog-recovery-code.txt', 'text/plain');
  });

  document.getElementById('recovery-saved-checkbox')?.addEventListener('change', (e) => {
    const btn = document.getElementById('recovery-continue-btn');
    if (btn) btn.disabled = !e.target.checked;
  });

  document.getElementById('recovery-continue-btn')?.addEventListener('click', () => {
    const codeEl = document.getElementById('recovery-code-display');
    if (codeEl) codeEl.textContent = '';
    const cb = state.pendingRecoveryDoneAction;
    state.pendingRecoveryDoneAction = null;
    if (typeof cb === 'function') cb();
  });

  // Reset Password with Recovery Code
  document.getElementById('reset-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeAuthRun(async () => {
      const login = document.getElementById('reset-login').value;
      const recoveryCodeInput = document.getElementById('reset-recovery-code');
      const newPwdInput = document.getElementById('reset-new-password');
      const confirmPwdInput = document.getElementById('reset-confirm-password');

      if (newPwdInput.value !== confirmPwdInput.value) {
        throw new Error('New password and confirmation do not match.');
      }

      const recoveryCode = recoveryCodeInput.value;
      const newPassword = newPwdInput.value;
      recoveryCodeInput.value = '';
      newPwdInput.value = '';
      confirmPwdInput.value = '';

      const res = await authProvider.resetPasswordWithRecovery(login, recoveryCode, newPassword);
      document.getElementById('reset-form').reset();

      presentRecoveryCodeModal(res.recoveryCode, () => {
        showAuthPanel('auth-signin-panel');
        const loginField = document.getElementById('signin-login');
        if (loginField) loginField.value = login;
      });
    });
  });

  // Header Lock Now button
  document.getElementById('header-lock-btn')?.addEventListener('click', () => {
    safeRun(async () => {
      await authProvider.signOut('locked');
    });
  });
}

function bindAppEvents() {
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
      if (!state.userDb) return;
      const meal = document.getElementById('log-meal').value;
      const refType = document.getElementById('log-ref-type').value;
      const refId = String(document.getElementById('log-ref-id').value);
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
      await state.userDb.log.add({
        date: state.selectedDate,
        meal,
        refType,
        refId,
        grams,
        snapshot: {
          name: itemName,
          per100,
          ...scaled
        }
      });
      await renderTodayTab();
      await renderStreaksTab();
    });
  });

  // Edit / Delete Today Log
  document.getElementById('today-log-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || !state.userDb) return;
    const id = String(btn.dataset.id);

    if (btn.dataset.action === 'delete-log') {
      safeRun(async () => {
        await softDeleteRecord(state.userDb.log, id);
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
        const existing = await state.userDb.log.get(id);
        if (!existing || existing.deleted) return;
        const basePer100 =
          existing.snapshot?.per100 ||
          scaleNutrition(existing.snapshot, 10000 / (existing.grams || 100));
        const rescaled = scaleNutrition(basePer100, newGrams);
        await state.userDb.log.update(id, {
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
        if (!state.userDb) return;
        await state.userDb.water.add({
          date: state.selectedDate,
          ml,
          type: 'water',
          label: 'Water'
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
      if (!state.userDb) return;
      const ml = Number(document.getElementById('water-custom-ml').value);
      const type = document.getElementById('water-custom-type').value;
      const linkedFoodId = String(document.getElementById('water-drink-food-id').value || '');
      let label = document.getElementById('water-custom-label').value.trim();

      if (!ml || ml <= 0) throw new Error('Enter a valid fluid volume in ml.');

      if (type === 'other' && linkedFoodId) {
        const drinkFood = state.foods.find((f) => f.id === linkedFoodId);
        if (drinkFood) {
          if (!label) label = drinkFood.name;
          const per100 = { ...drinkFood.per100, micros: { ...(drinkFood.per100?.micros || {}) } };
          const scaled = scaleNutrition(per100, ml);
          await state.userDb.log.add({
            date: state.selectedDate,
            meal: 'Snack',
            refType: 'food',
            refId: drinkFood.id,
            grams: ml,
            snapshot: {
              name: `${drinkFood.name} (Drink)`,
              per100,
              ...scaled
            }
          });
        }
      }

      await state.userDb.water.add({
        date: state.selectedDate,
        ml,
        type,
        label: label || (type === 'water' ? 'Water' : 'Drink')
      });

      document.getElementById('water-custom-ml').value = '';
      document.getElementById('water-custom-label').value = '';
      await renderTodayTab();
      await renderStreaksTab();
    });
  });

  document.getElementById('water-log-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-water"]');
    if (!btn || !state.userDb) return;
    safeRun(async () => {
      await softDeleteRecord(state.userDb.water, btn.dataset.id);
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
      if (!state.userDb) return;
      const editId = document.getElementById('food-id').value.trim();
      const existing = editId ? await state.userDb.foods.get(editId) : null;

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
        deleted: false
      };

      if (editId) {
        await state.userDb.foods.update(editId, record);
        showBanner(`Updated "${record.name}". Past logs remain unchanged.`, 'info');
      } else {
        await state.userDb.foods.add(record);
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
    if (!btn || !state.userDb) return;
    const id = String(btn.dataset.id);

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
        const res = await deleteOrArchiveFood(state.userDb, id);
        if (res.action === 'archived') {
          showBanner(
            `Food is referenced ${res.totalUses} time(s) in dishes or logs. Archived (hidden from active search) to preserve history.`,
            'warn'
          );
        } else {
          showBanner('Unused food removed.', 'info');
        }
        await reloadCoreState();
      });
    }
  });

  // Export / Import JSON & CSV (Scoped to Current Account)
  async function handleExportJSON() {
    safeRun(async () => {
      if (!state.userDb || !state.session) return;
      const jsonStr = await exportUserDbJSON(state.userDb, state.session.accountId, { includeDeleted: true });
      triggerFileDownload(jsonStr, `nutrilog-backup-${state.session.login}-${formatLocalDate(new Date())}.json`);
      await reloadCoreState();
      showBanner('Account database exported as JSON.', 'info');
    });
  }

  document.getElementById('export-json-btn')?.addEventListener('click', handleExportJSON);
  document.getElementById('backup-now-btn')?.addEventListener('click', handleExportJSON);
  document.getElementById('settings-export-btn')?.addEventListener('click', handleExportJSON);

  document.getElementById('import-json-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file || !state.userDb) return;
    safeRun(async () => {
      const text = await file.text();
      await importUserDbJSON(state.userDb, text);
      e.target.value = '';
      await reloadCoreState();
      showBanner('Account database restored from JSON backup.', 'info');
    });
  });

  document.getElementById('import-csv-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file || !state.userDb) return;
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
          deleted: false
        });
      }
      if (toAdd.length > 0) {
        await state.userDb.foods.bulkAdd(toAdd);
      }
      e.target.value = '';
      await reloadCoreState();
      showBanner(`Imported ${toAdd.length} food(s) from CSV.`, 'info');
    });
  });

  // Dishes Builder
  document.getElementById('dish-servings')?.addEventListener('input', renderDraftDishUI);

  document.getElementById('dish-add-ingredient-btn')?.addEventListener('click', () => {
    const foodId = String(document.getElementById('dish-ingredient-food')?.value || '');
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
      if (!state.userDb) return;
      if (state.draftDishItems.length === 0) {
        throw new Error('Add at least one food ingredient to save the dish.');
      }
      const id = document.getElementById('dish-id').value.trim();
      const name = document.getElementById('dish-name').value.trim();
      const notes = document.getElementById('dish-notes').value.trim();
      await saveDishWithItems(state.userDb, { id, name, notes }, state.draftDishItems);
      resetDishForm();
      await reloadCoreState();
      showBanner(`Saved dish "${name}".`, 'info');
    });
  });

  document.getElementById('dishes-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || !state.userDb) return;
    const id = String(btn.dataset.id);

    if (btn.dataset.action === 'edit-dish') {
      const dish = state.dishes.find((d) => d.id === id);
      if (!dish) return;
      document.getElementById('dish-id').value = dish.id;
      document.getElementById('dish-name').value = dish.name;
      document.getElementById('dish-notes').value = dish.notes || '';
      state.draftDishItems = state.dishItems
        .filter((di) => di.dishId === id && !di.deleted)
        .map((di) => ({ foodId: di.foodId, grams: di.grams }));
      document.getElementById('dish-form-title').textContent = `Edit Dish: ${dish.name}`;
      document.getElementById('dish-form-reset-btn').classList.remove('hidden');
      renderDraftDishUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.dataset.action === 'delete-dish') {
      safeRun(async () => {
        await softDeleteDish(state.userDb, id);
        await reloadCoreState();
        showBanner('Dish deleted.', 'info');
      });
    }
  });

  // Biometric Profile Form
  document.getElementById('prof-goal')?.addEventListener('change', (e) => {
    document.getElementById('prof-protein-gkg').value = getDefaultProteinPerKg(e.target.value);
  });

  document.getElementById('profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      if (!state.userDb) return;
      await saveProfile(state.userDb, {
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
      showBanner('Biometric profile and physiological targets saved.', 'info');
    });
  });

  // Settings & Security Actions inside Profile Tab
  document.getElementById('settings-autolock')?.addEventListener('change', (e) => {
    safeRun(async () => {
      if (!state.userDb) return;
      const autoLockMinutes = Number(e.target.value);
      state.settings = await saveUserSettings(state.userDb, { autoLockMinutes });
      resetInactivityTimer();
      showBanner('Auto-lock timer updated.', 'info');
    });
  });

  document.getElementById('settings-lock-btn')?.addEventListener('click', () => {
    safeRun(async () => {
      await authProvider.signOut('locked');
    });
  });

  document.getElementById('settings-signout-btn')?.addEventListener('click', () => {
    safeRun(async () => {
      await authProvider.signOut('signout');
    });
  });

  document.getElementById('settings-password-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      const curInput = document.getElementById('settings-current-password');
      const newInput = document.getElementById('settings-new-password');
      const confInput = document.getElementById('settings-confirm-password');

      if (newInput.value !== confInput.value) {
        throw new Error('New password and confirmation do not match.');
      }

      const cur = curInput.value;
      const next = newInput.value;
      curInput.value = '';
      newInput.value = '';
      confInput.value = '';

      await authProvider.changePassword(cur, next);
      showBanner('Password updated.', 'info');
    });
  });

  document.getElementById('settings-remove-legacy-btn')?.addEventListener('click', () => {
    const ok = window.confirm(
      'Remove the legacy v0.1 database from this device? Your migrated account data will remain intact.'
    );
    if (!ok) return;
    safeRun(async () => {
      await authProvider.removeLegacyDatabase();
      await refreshLegacyNoticeUI();
      showBanner('Legacy v0.1 database removed.', 'info');
    });
  });

  document.getElementById('settings-delete-account-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRun(async () => {
      const pwdInput = document.getElementById('delete-account-password');
      const confirmInput = document.getElementById('delete-account-confirm-text');
      const pwd = pwdInput.value;
      const confirmText = confirmInput.value;
      pwdInput.value = '';
      confirmInput.value = '';
      await authProvider.deleteAccount(pwd, confirmText);
    });
  });
}

async function bootstrap() {
  bindAuthEvents();
  bindAppEvents();
  bindActivityListeners();

  authProvider.onAuthChange((session, meta) => {
    if (session) {
      safeRun(() => enterAuthenticatedApp(session));
    } else {
      safeRun(() => enterLockedAuthView(meta));
    }
  });

  await safeRun(async () => {
    await authProvider.init();
    const existingSession = await authProvider.getSession();
    if (existingSession) {
      await enterAuthenticatedApp(existingSession);
    } else {
      await enterLockedAuthView();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration skipped:', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);