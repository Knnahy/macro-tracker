export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmt(num, decimals = 0) {
  const n = Number(num);
  if (Number.isNaN(n) || !Number.isFinite(n)) return '0';
  return n.toFixed(decimals);
}

export function showBanner(message, type = 'err') {
  const banner = document.getElementById('status-banner');
  const text = document.getElementById('status-banner-text');
  if (!banner || !text) return;
  banner.className = `banner banner-${type}`;
  text.textContent = message;
}

export function hideBanner() {
  const banner = document.getElementById('status-banner');
  if (banner) banner.classList.add('hidden');
}

export function renderMacroProgressBar(label, current, target, unit) {
  const safeTarget = Number(target) > 0 ? Number(target) : 0;
  const pct = safeTarget > 0 ? Math.min(100, Math.max(0, (current / safeTarget) * 100)) : 0;
  const isOver = safeTarget > 0 && current > safeTarget * 1.1;
  const rem = safeTarget - current;
  const remLabel = rem >= 0 ? `${fmt(rem, 0)}${unit} left` : `${fmt(Math.abs(rem), 0)}${unit} over`;

  return `
    <div class="macro-row">
      <div class="macro-label-line">
        <strong>${escapeHtml(label)}</strong>
        <span class="mono-text">${fmt(current, 1)} / ${fmt(safeTarget, 0)}${escapeHtml(unit)} (${escapeHtml(remLabel)})</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${isOver ? 'over' : ''}" style="width:${fmt(pct, 1)}%"></div>
      </div>
    </div>
  `;
}

export function renderTodaySummary(totals, targets) {
  const container = document.getElementById('today-targets-summary');
  if (!container) return;

  if (!targets) {
    container.innerHTML = `
      <h2 class="section-title">Daily Progress</h2>
      <p class="meta-text">Profile incomplete. Open the <strong>Profile</strong> tab to configure your biometrics and calculate daily calorie and macronutrient targets.</p>
      <div class="mt-sm mono-text">
        Logged today: ${fmt(totals.kcal, 0)} kcal | P ${fmt(totals.protein, 1)}g | C ${fmt(totals.carbs, 1)}g | F ${fmt(totals.fat, 1)}g | Fiber ${fmt(totals.fiber, 1)}g
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <h2 class="section-title">Daily Targets &amp; Remaining</h2>
    <div class="macro-grid">
      ${renderMacroProgressBar('Calories', totals.kcal, targets.targetKcal, ' kcal')}
      ${renderMacroProgressBar('Protein', totals.protein, targets.proteinG, 'g')}
      ${renderMacroProgressBar('Carbs', totals.carbs, targets.carbsG, 'g')}
      ${renderMacroProgressBar('Fat', totals.fat, targets.fatG, 'g')}
      ${renderMacroProgressBar('Fiber', totals.fiber, targets.fiberG, 'g')}
    </div>
    <div class="meta-text mt-sm mono-text">
      Sugars: ${fmt(totals.sugars, 1)}g | Sat Fat: ${fmt(totals.satFat, 1)}g | Sodium: ${fmt(totals.sodiumMg, 0)}mg
    </div>
  `;
}

export function renderTodayLogs(logs) {
  const container = document.getElementById('today-log-list');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `<p class="meta-text">No meals logged for this date yet.</p>`;
    return;
  }

  container.innerHTML = logs
    .map((entry) => {
      const s = entry.snapshot || {};
      return `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">[${escapeHtml(entry.meal)}] ${escapeHtml(s.name || 'Item')} (${fmt(entry.grams, 0)}g)</div>
            <div class="list-item-sub mono-text">
              ${fmt(s.kcal, 0)} kcal • P ${fmt(s.protein, 1)}g • C ${fmt(s.carbs, 1)}g • F ${fmt(s.fat, 1)}g • Fib ${fmt(s.fiber, 1)}g
            </div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-sm" data-action="edit-log" data-id="${Number(entry.id)}" data-grams="${Number(entry.grams)}">Edit g</button>
            <button type="button" class="btn btn-sm" data-action="delete-log" data-id="${Number(entry.id)}">Del</button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderWaterSection(waterLogs, targets) {
  const totalMl = waterLogs.reduce((acc, w) => acc + (Number(w.ml) || 0), 0);
  const targetMl = targets ? targets.waterMl : 0;
  const label = document.getElementById('water-progress-label');
  const bar = document.getElementById('water-progress-bar');
  const list = document.getElementById('water-log-list');

  if (label) {
    label.textContent = `${fmt(totalMl, 0)} / ${targetMl > 0 ? fmt(targetMl, 0) : '—'} ml`;
  }
  if (bar) {
    const pct = targetMl > 0 ? Math.min(100, (totalMl / targetMl) * 100) : 0;
    bar.style.width = `${fmt(pct, 1)}%`;
  }
  if (!list) return;

  if (waterLogs.length === 0) {
    list.innerHTML = `<p class="meta-text">No fluids logged today.</p>`;
    return;
  }

  list.innerHTML = waterLogs
    .map(
      (w) => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(w.label || (w.type === 'water' ? 'Water' : 'Drink'))}</div>
          <div class="list-item-sub mono-text">${fmt(w.ml, 0)} ml (${escapeHtml(w.type)})</div>
        </div>
        <div class="list-item-actions">
          <button type="button" class="btn btn-sm" data-action="delete-water" data-id="${Number(w.id)}">Del</button>
        </div>
      </div>
    `
    )
    .join('');
}

export function renderFoodsList(foods, currency = '€') {
  const container = document.getElementById('foods-list');
  if (!container) return;

  if (!foods || foods.length === 0) {
    container.innerHTML = `<p class="meta-text">No matching foods found.</p>`;
    return;
  }

  container.innerHTML = foods
    .map((f) => {
      const p = f.per100 || {};
      const priceTag = f.pricePerKg ? ` • ${escapeHtml(currency)}${fmt(f.pricePerKg, 2)}/kg` : '';
      const archTag = f.archived ? ' [ARCHIVED]' : '';
      const typeTag = f.isDrink ? 'Drink' : 'Food';
      return `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(f.name)} ${f.brand ? `(${escapeHtml(f.brand)})` : ''}${escapeHtml(archTag)}</div>
            <div class="list-item-sub mono-text">
              100g: ${fmt(p.kcal, 0)} kcal | P ${fmt(p.protein, 1)}g | C ${fmt(p.carbs, 1)}g | F ${fmt(p.fat, 1)}g | Fib ${fmt(p.fiber, 1)}g
            </div>
            <div class="list-item-sub">
              ${escapeHtml(typeTag)} • ${escapeHtml(f.market || '—')} • ${escapeHtml(f.category || '—')} • Src: ${escapeHtml(f.source || 'user')}${priceTag}
            </div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-sm" data-action="edit-food" data-id="${Number(f.id)}">Edit</button>
            <button type="button" class="btn btn-sm" data-action="delete-food" data-id="${Number(f.id)}">Del</button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderProfileCalculated(targets) {
  const card = document.getElementById('profile-calculated-card');
  if (!card) return;

  if (!targets) {
    card.innerHTML = `<p class="meta-text">Enter valid sex, age, height, and weight above to calculate BMR, TDEE, and daily macro targets.</p>`;
    return;
  }

  const warnHtml = targets.warnings
    .map((w) => `<div class="banner banner-warn">${escapeHtml(w)}</div>`)
    .join('');

  card.innerHTML = `
    <h2 class="section-title">Calculated Physiological Targets</h2>
    ${warnHtml}
    <div class="item-list mono-text">
      <div class="list-item"><span>BMR (Mifflin-St Jeor)</span><strong>${fmt(targets.bmr, 0)} kcal</strong></div>
      <div class="list-item"><span>TDEE (Maintenance)</span><strong>${fmt(targets.tdee, 0)} kcal</strong></div>
      <div class="list-item"><span>Daily Calorie Target</span><strong>${fmt(targets.targetKcal, 0)} kcal</strong></div>
      <div class="list-item"><span>Protein (${fmt(targets.proteinPerKg, 1)} g/kg)</span><strong>${fmt(targets.proteinG, 1)} g (${fmt(targets.proteinG * 4, 0)} kcal)</strong></div>
      <div class="list-item"><span>Fat (${fmt(targets.fatPct, 0)}% / ≥0.6g/kg)</span><strong>${fmt(targets.fatG, 1)} g (${fmt(targets.fatG * 9, 0)} kcal)</strong></div>
      <div class="list-item"><span>Carbohydrates (remaining)</span><strong>${fmt(targets.carbsG, 1)} g (${fmt(targets.carbsG * 4, 0)} kcal)</strong></div>
      <div class="list-item"><span>Fiber (14g / 1000 kcal)</span><strong>${fmt(targets.fiberG, 1)} g</strong></div>
      <div class="list-item"><span>Water (${fmt(targets.waterMlPerKg, 0)} ml/kg)</span><strong>${fmt(targets.waterMl, 0)} ml</strong></div>
    </div>
    <p class="meta-text mt-sm">${escapeHtml(targets.formulaText)}</p>
  `;
}

export function renderStreaks(streakData) {
  const cardsEl = document.getElementById('streaks-summary-cards');
  const gridEl = document.getElementById('streaks-calendar-grid');
  if (!cardsEl || !gridEl) return;

  cardsEl.innerHTML = `
    <div class="streak-card">
      <div class="list-item-sub">Logging (2+)</div>
      <div class="streak-val">${Number(streakData.logging.current)}d</div>
      <div class="streak-best">Best: ${Number(streakData.logging.best)}d</div>
    </div>
    <div class="streak-card">
      <div class="list-item-sub">Macro Target</div>
      <div class="streak-val">${Number(streakData.target.current)}d</div>
      <div class="streak-best">Best: ${Number(streakData.target.best)}d</div>
    </div>
    <div class="streak-card">
      <div class="list-item-sub">Hydration</div>
      <div class="streak-val">${Number(streakData.water.current)}d</div>
      <div class="streak-best">Best: ${Number(streakData.water.best)}d</div>
    </div>
  `;

  gridEl.innerHTML = streakData.last28Days
    .map((d) => {
      const shortDate = d.date.slice(5);
      return `
        <div class="cal-cell" title="${escapeHtml(d.date)}">
          <div class="cal-date">${escapeHtml(shortDate)}</div>
          <div class="cal-dots">
            ${d.logMet ? '<i class="dot dot-log"></i>' : ''}
            ${d.targetMet ? '<i class="dot dot-target"></i>' : ''}
            ${d.waterMet ? '<i class="dot dot-water"></i>' : ''}
            ${d.isRest ? '<i class="dot dot-rest"></i>' : ''}
          </div>
        </div>
      `;
    })
    .join('');
}