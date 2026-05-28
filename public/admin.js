/* Herd Menu Admin — vanilla JS SPA */

// ── State ─────────────────────────────────────────────────────────────────────
let menus = [];
let settings = {};
let currentMenu = null;
let dragSrcSection = null;
let dragSrcItem = null;

// ── Router ────────────────────────────────────────────────────────────────────
function route() {
  const hash = location.hash.replace('#', '') || '/dashboard';
  const [, view, slug] = hash.split('/');
  if (view === 'editor' && slug) return showEditor(slug);
  if (view === 'settings') return showSettings();
  return showDashboard();
}
window.addEventListener('hashchange', route);

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  [menus, settings] = await Promise.all([
    fetch('/api/menus').then(r => r.json()),
    fetch('/api/settings').then(r => r.json())
  ]);
  route();
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
async function showDashboard() {
  setTopbar({
    title: 'Herd Menu Admin',
    right: `
      <button class="btn btn-ghost btn-sm" onclick="openCombinedEmbedModal()">⟨/⟩ Website Embed</button>
      <a href="#/settings" class="btn btn-ghost btn-sm">⚙ Settings</a>
      <button class="btn btn-primary btn-sm" onclick="openNewMenuModal()">+ New Menu</button>
    `
  });

  const groups = { active: [], draft: [], archived: [] };
  menus.forEach(m => (groups[m.status] || groups.draft).push(m));

  let html = '';

  if (!menus.length) {
    html = `<div class="empty-state">
      <h2>No menus yet</h2>
      <p>Create your first menu to get started.</p>
      <button class="btn btn-green" onclick="openNewMenuModal()">+ New Menu</button>
    </div>`;
  } else {
    ['active', 'draft', 'archived'].forEach(status => {
      if (!groups[status].length) return;
      const labels = { active: 'Active', draft: 'Drafts', archived: 'Archived' };
      html += `<div class="section-label">${labels[status]}</div>`;
      html += `<div class="menu-grid">`;
      groups[status].forEach(m => { html += menuCard(m); });
      html += `</div>`;
    });
  }

  document.getElementById('app').innerHTML = `<div class="main">${html}</div>`;
}

function menuCard(m) {
  const badge = `<span class="badge badge-${m.status}">${m.status}</span>`;
  const updated = m.lastUpdated ? `Updated ${m.lastUpdated}` : '';
  const embedTag = m.showInEmbed
    ? `<span style="font-size:10px;font-weight:700;color:var(--green);letter-spacing:.04em;white-space:nowrap;">⟨/⟩ In embed</span>`
    : '';
  return `
    <div class="menu-card ${m.status === 'archived' ? 'archived' : ''}">
      <div class="menu-card-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div class="menu-card-title">${esc(m.title)}</div>
          ${badge}
        </div>
        <div class="menu-card-meta" style="display:flex;align-items:center;justify-content:space-between;">${updated}${embedTag}</div>
      </div>
      <div class="menu-card-actions">
        <button class="btn btn-green btn-sm" onclick="nav('/editor/${m.slug}')">Edit</button>
        <button class="btn btn-ghost btn-sm" style="background:#f0f4f0;color:var(--green);border-color:var(--border);" onclick="window.open('/print/${m.slug}','_blank')">Print</button>
        <div class="overflow-wrap" style="margin-left:auto">
          <button class="btn btn-ghost btn-sm" style="background:#f0f4f0;color:var(--muted);border-color:var(--border);" onclick="toggleOverflow(this)">⋯</button>
          <div class="overflow-menu">
            <button class="overflow-item" onclick="duplicateMenu('${m.slug}')">Duplicate</button>
            ${m.status !== 'archived' ? `<button class="overflow-item" onclick="archiveMenu('${m.slug}')">Archive</button>` : ''}
            <button class="overflow-item danger" onclick="deleteMenu('${m.slug}', '${esc(m.title)}')">Delete</button>
          </div>
        </div>
      </div>
    </div>`;
}

function toggleOverflow(btn) {
  document.querySelectorAll('.overflow-menu.open').forEach(m => { if (m !== btn.nextElementSibling) m.classList.remove('open'); });
  btn.nextElementSibling.classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.overflow-wrap')) document.querySelectorAll('.overflow-menu.open').forEach(m => m.classList.remove('open'));
});

// New menu modal
function openNewMenuModal() {
  openModal(`
    <div class="modal-header"><h2>New Menu</h2><button class="btn-icon" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>Menu title</label><input type="text" id="new-title" placeholder="e.g. Breakfast" autofocus></div>
      <div class="field"><label>Status</label>
        <div class="radio-group">
          <label><input type="radio" name="new-status" value="active"> Active</label>
          <label><input type="radio" name="new-status" value="draft" checked> Draft</label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()" style="border:1px solid var(--border)">Cancel</button>
      <button class="btn btn-green" onclick="createMenu()">Create</button>
    </div>`);
  setTimeout(() => document.getElementById('new-title')?.focus(), 50);
}

async function createMenu() {
  const title = document.getElementById('new-title').value.trim();
  if (!title) return;
  const status = document.querySelector('input[name="new-status"]:checked')?.value || 'draft';
  const res = await fetch('/api/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, status }) });
  const data = await res.json();
  if (data.ok) { closeModal(); nav(`/editor/${data.slug}`); }
}

async function duplicateMenu(slug) {
  const res = await fetch(`/api/menus/${slug}/duplicate`, { method: 'POST' });
  const data = await res.json();
  if (data.ok) { menus = await fetch('/api/menus').then(r => r.json()); showDashboard(); }
}

async function archiveMenu(slug) {
  await fetch(`/api/menus/${slug}/archive`, { method: 'POST' });
  menus = await fetch('/api/menus').then(r => r.json());
  showDashboard();
}

async function deleteMenu(slug, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  await fetch(`/api/menus/${slug}`, { method: 'DELETE' });
  menus = await fetch('/api/menus').then(r => r.json());
  showDashboard();
}

// ════════════════════════════════════════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════════════════════════════════════════
async function showEditor(slug) {
  currentMenu = await fetch(`/api/menus/${slug}`).then(r => r.json());
  if (!currentMenu) { nav('/dashboard'); return; }
  renderEditor();
}

function renderEditor() {
  const m = currentMenu;
  setTopbar({
    back: '/dashboard',
    title: 'Herd Menu Admin',
    subtitle: m.title,
    right: `
      <span class="save-status" id="save-status"></span>
      <button class="btn btn-ghost btn-sm" onclick="window.open('/print/${m.slug}','_blank')">Print</button>
      <button class="btn btn-ghost btn-sm" onclick="openCombinedEmbedModal()">Embed</button>
      <button class="btn btn-primary btn-sm" onclick="saveMenu()">Save</button>
    `
  });

  let html = `
    <div class="card">
      <div class="card-header"><span style="font-weight:700;color:var(--green);font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Menu Details</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 160px;gap:14px;margin-bottom:14px;">
          <div class="field" style="margin:0"><label>Title</label><input type="text" id="ed-title" value="${esc(m.title)}"></div>
          <div class="field" style="margin:0"><label>Status</label>
            <select id="ed-status">
              <option value="active" ${m.status==='active'?'selected':''}>Active</option>
              <option value="draft" ${m.status==='draft'?'selected':''}>Draft</option>
              <option value="archived" ${m.status==='archived'?'selected':''}>Archived</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="field" style="margin:0">
            <label>Tagline</label>
            <textarea id="ed-tagline" rows="3" placeholder="Leave blank to use global default">${esc(m.tagline||'')}</textarea>
          </div>
          <div class="field" style="margin:0">
            <label>Footer note</label>
            <textarea id="ed-footer" rows="3" placeholder="Leave blank to use global default">${esc(m.footer||'')}</textarea>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:32px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;user-select:none;">
            <input type="checkbox" id="ed-dividers" ${(m.showDividers !== false) ? 'checked' : ''}>
            Show section divider lines
          </label>
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:220px;">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap;">Logo size</span>
            <input type="range" id="ed-logo-scale" min="30" max="120" step="5" value="${m.logoScale || 62}"
              style="flex:1;accent-color:var(--green);"
              oninput="document.getElementById('logo-scale-val').textContent=this.value+'mm'">
            <span id="logo-scale-val" style="font-size:12px;color:var(--muted);min-width:38px;text-align:right;">${m.logoScale || 62}mm</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap;">Page size</span>
            <select id="ed-page-size" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius);background:#fff;">
              <option value="a4" ${(!m.pageSize||m.pageSize==='a4')?'selected':''}>A4</option>
              <option value="a5" ${m.pageSize==='a5'?'selected':''}>A5</option>
            </select>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;user-select:none;">
            <input type="checkbox" id="ed-two-col" ${m.pageColumns===2?'checked':''}>
            Two-column layout
          </label>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;user-select:none;">
            <input type="checkbox" id="ed-show-embed" ${m.showInEmbed ? 'checked' : ''}>
            Include in website embed
            <span style="font-size:11px;color:var(--muted);font-weight:400;">— when checked, this menu appears as a tab in the Ecwid embed code</span>
          </label>
          <div class="field" style="margin:10px 0 0;">
            <label>Online info <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);">(embed only — not printed)</span></label>
            <textarea id="ed-embed-note" rows="2" placeholder="e.g. Available Monday–Friday, 12pm–3pm">${esc(m.embedNote||'')}</textarea>
          </div>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <div class="field" style="margin:0 0 8px;">
            <label>Print title <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);">(print only — large centred heading above sections)</span></label>
            <input type="text" id="ed-print-title" value="${esc(m.printTitle||'')}" placeholder="e.g. Set Menu">
          </div>
          <div class="field" style="margin:0;">
            <label>Print intro lines <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);">(print only — centred, line breaks respected)</span></label>
            <textarea id="ed-print-intro" rows="3" placeholder="e.g. 2 courses £25&#10;3 courses £35">${esc(m.printIntro||'')}</textarea>
          </div>
        </div>
      </div>
    </div>
    <div id="sections-container"></div>
    <div class="add-section-wrap"><button class="btn-add-section" onclick="addSection()">+ Add Section</button></div>`;

  document.getElementById('app').innerHTML = `<div class="main">${html}</div>`;
  renderSections();
}

function renderSections() {
  const container = document.getElementById('sections-container');
  if (!container) return;
  container.innerHTML = '';
  currentMenu.sections.forEach((s, si) => container.appendChild(buildSectionCard(s, si)));
}

function buildSectionCard(section, si) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.si = si;
  card.draggable = true;
  card.addEventListener('dragstart', e => { dragSrcSection = si; card.style.opacity = '.5'; e.dataTransfer.effectAllowed = 'move'; });
  card.addEventListener('dragend', () => { card.style.opacity = ''; document.querySelectorAll('.card[data-si]').forEach(c => c.style.borderTop = ''); });
  card.addEventListener('dragover', e => { e.preventDefault(); if (si !== dragSrcSection) card.style.borderTop = '3px solid var(--green)'; });
  card.addEventListener('dragleave', () => { card.style.borderTop = ''; });
  card.addEventListener('drop', e => {
    e.preventDefault(); card.style.borderTop = '';
    if (dragSrcSection !== null && dragSrcSection !== si) {
      const [moved] = currentMenu.sections.splice(dragSrcSection, 1);
      currentMenu.sections.splice(si, 0, moved);
      dragSrcSection = null; renderSections();
    }
  });

  const layout = section.layout || 'full';
  const subtitle = section.subtitle || '';
  const priceColumns = section.priceColumns || [];
  const multiPrice = priceColumns.length >= 2;
  const priceCols = priceColumns.length >= 3 ? '65px 65px 65px' : priceColumns.length === 2 ? '70px 70px' : '80px';
  const gridTpl = `1fr ${priceCols} 1fr 32px`;
  const headerInner = multiPrice
    ? `<span>Item</span>${priceColumns.map(c => `<span style="text-align:right">${esc(c)}</span>`).join('')}<span class="col-desc">Note / Add-on</span><span></span>`
    : `<span>Item</span><span>Price</span><span class="col-desc">Note / Add-on</span><span></span>`;

  card.innerHTML = `
    <div class="card-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <input class="section-name-input" value="${esc(section.name)}" placeholder="SECTION NAME"
        onchange="currentMenu.sections[${si}].name=this.value.toUpperCase();this.value=this.value.toUpperCase();">
      <button class="btn-icon" onclick="deleteSection(${si})">✕</button>
    </div>
    <div class="section-meta">
      <div class="section-meta-field">
        <label>Print layout</label>
        <select onchange="currentMenu.sections[${si}].layout=this.value">
          <option value="full"  ${layout==='full' ?'selected':''}>Full width</option>
          <option value="half"  ${layout==='half' ?'selected':''}>Half width</option>
          <option value="third" ${layout==='third'?'selected':''}>One third</option>
        </select>
      </div>
      <div class="section-meta-field">
        <label>Price columns <span style="font-weight:400;opacity:.6;">(e.g. Half, Pint)</span></label>
        <input type="text" value="${esc(priceColumns.join(', '))}" placeholder="e.g. Half, Pint"
          onchange="updatePriceColumns(${si}, this.value)">
      </div>
      <div class="section-meta-field section-meta-subtitle">
        <label>Subtitle <span style="font-weight:400;opacity:.6;">(optional italic line, e.g. "Teapigs Herbal Teas")</span></label>
        <input type="text" value="${esc(subtitle)}" placeholder="Leave blank if not needed"
          onchange="currentMenu.sections[${si}].subtitle=this.value.trim();">
      </div>
    </div>
    <div class="items-header" style="grid-template-columns:${gridTpl}">
      ${headerInner}
    </div>
    <div class="items-list" id="items-${si}"></div>
    <div class="add-item-row"><button class="btn-add-item" onclick="addItem(${si})">+ Add item</button></div>`;

  const list = card.querySelector(`#items-${si}`);
  section.items.forEach((item, ii) => list.appendChild(buildItemRow(item, si, ii, priceColumns)));
  return card;
}

function buildItemRow(item, si, ii, priceColumns) {
  priceColumns = priceColumns || [];
  const multiPrice = priceColumns.length >= 2;
  const row = document.createElement('div');
  row.className = 'item-row';
  row.draggable = true;
  row.addEventListener('dragstart', e => { dragSrcItem = { si, ii }; row.classList.add('dragging'); e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); document.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over')); });
  row.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); if (dragSrcItem?.si === si && dragSrcItem.ii !== ii) row.classList.add('drag-over'); });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); row.classList.remove('drag-over');
    if (dragSrcItem?.si === si && dragSrcItem.ii !== ii) {
      const [moved] = currentMenu.sections[si].items.splice(dragSrcItem.ii, 1);
      currentMenu.sections[si].items.splice(ii, 0, moved);
      dragSrcItem = null; renderSections();
    }
  });

  const allergens = item.allergens || [];
  const allergenDefs = [
    { code: 'v',  label: 'V',  title: 'Vegetarian' },
    { code: 've', label: 'VE', title: 'Vegan' },
    { code: 'g',  label: 'G',  title: 'Contains gluten' }
  ];
  const allergenBtns = allergenDefs.map(a =>
    `<button class="allergen-tag${allergens.includes(a.code) ? ' active' : ''}" title="${a.title}"
      onclick="toggleAllergen(${si},${ii},'${a.code}')">${a.label}</button>`
  ).join('');
  const boldBtn = `<button class="allergen-tag bold-tag${item.bold ? ' active' : ''}" title="Bold item name" onclick="toggleBold(${si},${ii})">B</button>`;

  const priceCols = priceColumns.length >= 3 ? '65px 65px 65px' : priceColumns.length === 2 ? '70px 70px' : '80px';
  row.style.gridTemplateColumns = `1fr ${priceCols} 1fr 32px`;

  let priceInputsHtml;
  if (multiPrice) {
    const prices = item.prices || [];
    priceInputsHtml = priceColumns.map((col, pi) =>
      `<input class="item-input price-input" type="text" value="${esc(String(prices[pi]||''))}" placeholder="—"
        onchange="setPriceAt(${si},${ii},${pi},this.value.trim());">`
    ).join('');
  } else {
    priceInputsHtml = `<input class="item-input price-input" type="text" value="${esc(String(item.price||''))}" placeholder="£ or MP"
      onchange="currentMenu.sections[${si}].items[${ii}].price=this.value.trim();">`;
  }

  row.innerHTML = `
    <input class="item-input" value="${esc(item.name)}" placeholder="Item name"
      onchange="currentMenu.sections[${si}].items[${ii}].name=this.value.trim();">
    ${priceInputsHtml}
    <input class="item-input desc" value="${esc(item.description||'')}" placeholder="Optional note or add-on…"
      onchange="currentMenu.sections[${si}].items[${ii}].description=this.value.trim();">
    <button class="btn-icon" onclick="deleteItem(${si},${ii})">✕</button>
    <div class="item-allergens-row">${boldBtn}<span class="allergen-sep"></span>${allergenBtns}</div>`;
  return row;
}

function addSection() {
  currentMenu.sections.push({ id: 'section-' + Date.now(), name: 'NEW SECTION', items: [] });
  renderSections();
  const cards = document.querySelectorAll('.card[data-si]');
  cards[cards.length - 1]?.querySelector('.section-name-input')?.focus();
}

function deleteSection(si) {
  if (!confirm(`Delete section "${currentMenu.sections[si].name}"?`)) return;
  currentMenu.sections.splice(si, 1);
  renderSections();
}

function toggleBold(si, ii) {
  const item = currentMenu.sections[si].items[ii];
  item.bold = !item.bold;
  renderSections();
}

function toggleAllergen(si, ii, code) {
  const item = currentMenu.sections[si].items[ii];
  if (!item.allergens) item.allergens = [];
  const idx = item.allergens.indexOf(code);
  if (idx >= 0) item.allergens.splice(idx, 1);
  else item.allergens.push(code);
  renderSections();
}

function addItem(si) {
  const section = currentMenu.sections[si];
  const priceColumns = section.priceColumns || [];
  const newItem = { name: '', price: '', description: '', allergens: [] };
  if (priceColumns.length >= 2) newItem.prices = priceColumns.map(() => '');
  section.items.push(newItem);
  renderSections();
  const rows = document.querySelectorAll(`#items-${si} .item-row`);
  rows[rows.length - 1]?.querySelector('.item-input')?.focus();
}

function deleteItem(si, ii) {
  currentMenu.sections[si].items.splice(ii, 1);
  renderSections();
}

function setPriceAt(si, ii, pi, val) {
  const item = currentMenu.sections[si].items[ii];
  if (!item.prices) item.prices = [];
  item.prices[pi] = val;
}

function updatePriceColumns(si, rawValue) {
  const cols = rawValue.split(',').map(s => s.trim()).filter(Boolean);
  currentMenu.sections[si].priceColumns = cols.length >= 2 ? cols : [];
  if (cols.length >= 2) {
    currentMenu.sections[si].items.forEach(item => {
      if (!item.prices) item.prices = [];
      while (item.prices.length < cols.length) item.prices.push('');
    });
  }
  renderSections();
}

async function saveMenu() {
  currentMenu.title = document.getElementById('ed-title')?.value.trim() || currentMenu.title;
  currentMenu.status = document.getElementById('ed-status')?.value || currentMenu.status;
  currentMenu.tagline = document.getElementById('ed-tagline')?.value.trim() || '';
  currentMenu.footer = document.getElementById('ed-footer')?.value.trim() || '';
  currentMenu.embedNote = document.getElementById('ed-embed-note')?.value.trim() || '';
  currentMenu.showDividers = document.getElementById('ed-dividers')?.checked ?? true;
  currentMenu.logoScale = parseInt(document.getElementById('ed-logo-scale')?.value) || 62;
  currentMenu.pageSize = document.getElementById('ed-page-size')?.value || 'a4';
  currentMenu.showInEmbed = document.getElementById('ed-show-embed')?.checked || false;
  currentMenu.printTitle = document.getElementById('ed-print-title')?.value.trim() || '';
  currentMenu.printIntro = document.getElementById('ed-print-intro')?.value.trim() || '';
  currentMenu.pageColumns = document.getElementById('ed-two-col')?.checked ? 2 : 1;

  const statusEl = document.getElementById('save-status');
  if (statusEl) statusEl.textContent = 'Saving…';

  const res = await fetch(`/api/menus/${currentMenu.slug}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentMenu)
  });
  const data = await res.json();
  if (data.ok) {
    currentMenu.lastUpdated = data.lastUpdated;
    if (statusEl) { statusEl.textContent = 'Saved ✓'; setTimeout(() => statusEl.textContent = '', 2500); }
    // refresh topbar subtitle in case title changed
    const sub = document.querySelector('.topbar-subtitle');
    if (sub) sub.textContent = currentMenu.title;
    // refresh menus list in background
    fetch('/api/menus').then(r => r.json()).then(d => { menus = d; });
  } else {
    if (statusEl) statusEl.textContent = 'Save failed!';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════════════
const BODY_FONTS = [
  { label: 'Helvetica / Arial (default)', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Palatino', value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { label: 'Gill Sans', value: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', Tahoma, Geneva, sans-serif" },
  { label: 'Garamond', value: "Garamond, 'Times New Roman', serif" },
];

async function showSettings() {
  settings = await fetch('/api/settings').then(r => r.json());
  const logoSrc = settings.logoPath
    ? (settings.logoPath.startsWith('http') ? settings.logoPath : settings.logoPath + '?t=' + Date.now())
    : '';

  setTopbar({
    back: '/dashboard',
    title: 'Herd Menu Admin',
    subtitle: 'Settings',
    right: `<button class="btn btn-primary btn-sm" onclick="saveSettings()">Save</button>`
  });

  document.getElementById('app').innerHTML = `<div class="main">
    <div class="card">
      <div class="card-header"><span style="font-weight:700;color:var(--green);font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Logo</span></div>
      <div class="card-body">
        ${logoSrc ? `<img class="logo-preview" id="logo-preview" src="${esc(logoSrc)}" alt="Current logo">` : '<p style="font-size:13px;color:var(--muted);margin-bottom:12px;">No logo uploaded yet.</p>'}
        <div class="logo-upload-row">
          <input type="file" id="logo-file" accept="image/*">
          <button class="btn btn-green btn-sm" onclick="uploadLogo()">Upload</button>
        </div>
        <p class="hint" style="margin-top:8px;">Upload replaces the current logo everywhere (print views and website embeds).</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span style="font-weight:700;color:var(--green);font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Fonts</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start;">
          <div class="field" style="margin:0">
            <label>Body font</label>
            <select id="s-bodyfont" onchange="previewBodyFont(this.value)">
              ${BODY_FONTS.map(f => `<option value="${esc(f.value)}"${(settings.bodyFont||BODY_FONTS[0].value)===f.value?' selected':''}>${esc(f.label)}</option>`).join('')}
            </select>
            <p class="hint">Used for item names, descriptions, and taglines on printed menus.</p>
          </div>
          <div style="padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);background:#fafcfa;" id="font-preview">
            <p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px;">Preview</p>
            <p id="font-preview-text" style="font-size:14px;line-height:1.6;font-family:${esc(settings.bodyFont||BODY_FONTS[0].value)}">Fried chicken, sriracha, hot honey &nbsp; <span style="color:var(--muted);font-style:italic;font-size:12px;">Grass-fed, served with fries</span></p>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span style="font-weight:700;color:var(--green);font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Backup &amp; Restore</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <p style="font-size:13px;font-weight:600;margin-bottom:4px;">Export all data</p>
            <p class="hint" style="margin-bottom:10px;">Downloads all menus and settings as a single JSON file. Use this to back up your data or copy it to another environment.</p>
            <button class="btn btn-green btn-sm" onclick="exportData()">Download backup</button>
          </div>
          <div>
            <p style="font-size:13px;font-weight:600;margin-bottom:4px;">Import data</p>
            <p class="hint" style="margin-bottom:10px;">Restore from a backup file. <strong>This replaces all current menus and settings.</strong></p>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <input type="file" id="import-file" accept=".json" style="font-size:12px;color:var(--muted);">
              <button class="btn btn-sm" style="border:1px solid var(--border);background:#fff;" onclick="importData()">Import</button>
            </div>
            <p id="import-status" style="font-size:12px;margin-top:6px;display:none;"></p>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span style="font-weight:700;color:var(--green);font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Global Defaults</span></div>
      <div class="card-body settings-grid">
        <div class="field" style="margin:0">
          <label>Default tagline</label>
          <textarea id="s-tagline" rows="4">${esc(settings.tagline||'')}</textarea>
          <p class="hint">Used on any menu where you haven't set a custom tagline.</p>
        </div>
        <div class="field" style="margin:0">
          <label>Default footer note</label>
          <textarea id="s-footer" rows="4">${esc(settings.footer||'')}</textarea>
          <p class="hint">Used on any menu where you haven't set a custom footer.</p>
        </div>
      </div>
    </div>
  </div>`;
}

function previewBodyFont(value) {
  const el = document.getElementById('font-preview-text');
  if (el) el.style.fontFamily = value;
}

async function uploadLogo() {
  const file = document.getElementById('logo-file')?.files[0];
  if (!file) return alert('Please choose a file first.');
  const res = await fetch('/api/logo', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  const data = await res.json();
  if (data.ok) {
    settings.logoPath = data.logoPath;
    const preview = document.getElementById('logo-preview');
    if (preview) { preview.src = data.logoPath + '?t=' + Date.now(); }
    else { showSettings(); }
    alert('Logo updated! It will appear in new print views and embed codes.');
  }
}

async function saveSettings() {
  settings.tagline = document.getElementById('s-tagline')?.value.trim() || '';
  settings.footer = document.getElementById('s-footer')?.value.trim() || '';
  settings.bodyFont = document.getElementById('s-bodyfont')?.value || BODY_FONTS[0].value;
  const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
  const data = await res.json();
  if (data.ok) { showToast('Settings saved'); }
}

function exportData() {
  window.location.href = '/api/export';
}

async function importData() {
  const file = document.getElementById('import-file')?.files[0];
  if (!file) return alert('Please choose a backup file first.');
  const statusEl = document.getElementById('import-status');
  let bundle;
  try {
    bundle = JSON.parse(await file.text());
  } catch {
    alert('That file doesn\'t look like a valid backup — could not parse JSON.');
    return;
  }
  if (!bundle.menus || !bundle.settings) {
    alert('That file doesn\'t look like a Herd Menu backup.');
    return;
  }
  if (!confirm(`This will replace all ${bundle.menus.length} menus and settings with those from the backup dated ${bundle.exportedAt ? bundle.exportedAt.slice(0,10) : 'unknown'}.\n\nContinue?`)) return;
  const res = await fetch('/api/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bundle)
  });
  const data = await res.json();
  if (data.ok) {
    if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--green)'; statusEl.textContent = `✓ Imported ${data.menusImported} menus successfully. Reloading…`; }
    setTimeout(() => location.reload(), 1500);
  } else {
    if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--red)'; statusEl.textContent = 'Import failed: ' + (data.error || 'unknown error'); }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EMBED MODAL
// ════════════════════════════════════════════════════════════════════════════
let embedOrderSlugs = [];

async function openCombinedEmbedModal() {
  const visible = menus
    .filter(m => m.showInEmbed && m.status !== 'archived')
    .sort((a, b) => (a.embedOrder || 999) - (b.embedOrder || 999));
  embedOrderSlugs = visible.map(m => m.slug);

  openModal(`
    <div class="modal-header"><h2>Website Embed</h2><button class="btn-icon" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="embed-section-label">Tab order</p>
      <div id="embed-order-list">${renderEmbedOrderList(visible)}</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
        <button class="btn btn-green btn-sm" onclick="saveEmbedOrder()">Save order</button>
        <span id="order-saved" style="display:none;font-size:12px;color:var(--green);font-weight:500;">Saved ✓</span>
      </div>
      <p class="embed-section-label" style="margin-top:20px;">Live embed snippet <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--green);font-size:11px;">— recommended</span></p>
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.6;">
        Paste this into Ecwid <strong>once</strong>. It fetches the latest menu automatically every time a visitor loads the page — you never need to update the Ecwid code again.
      </p>
      <textarea class="code-area" id="embed-live" readonly onclick="this.select()" style="height:130px;">Loading…</textarea>
      <div style="margin-top:6px;display:flex;align-items:center;gap:10px;">
        <button class="btn btn-green btn-sm" onclick="copyLiveEmbed()">Copy live snippet</button>
        <span class="copy-success" id="copy-live-success">Copied!</span>
      </div>

      <p class="embed-section-label" style="margin-top:20px;">Static fallback <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);font-size:11px;">— use this if the live snippet causes issues in Ecwid</span></p>
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.6;">
        A self-contained snapshot. Re-copy from here whenever you change which menus appear in the embed.
      </p>
      <textarea class="code-area" id="embed-static" readonly onclick="this.select()">Loading…</textarea>
    </div>
    <div class="modal-footer">
      <span class="copy-success" id="copy-success">Copied!</span>
      <button class="btn btn-green" onclick="copyEmbed()">Copy static code</button>
      <button class="btn" onclick="closeModal()" style="border:1px solid var(--border)">Close</button>
    </div>`, true);

  const embedUrl = window.location.origin + '/embed';
  const liveSnippet = `<div id="herd-menu-embed"></div>\n<script>\nfetch('${embedUrl}')\n  .then(function(r){return r.text();})\n  .then(function(html){\n    var el=document.getElementById('herd-menu-embed');\n    el.innerHTML=html;\n    el.querySelectorAll('script').forEach(function(s){\n      var n=document.createElement('script');\n      n.textContent=s.textContent;\n      s.parentNode.replaceChild(n,s);\n    });\n  });\n<\/script>`;

  const liveEl = document.getElementById('embed-live');
  if (liveEl) liveEl.value = liveSnippet;

  const html = await fetch('/embed').then(r => r.text());
  const staticEl = document.getElementById('embed-static');
  if (staticEl) staticEl.value = html;
}

function renderEmbedOrderList(orderedMenus) {
  if (!orderedMenus.length) return '<p style="font-size:13px;color:var(--muted);padding:4px 0;">No menus are marked "Include in website embed". Edit a menu to enable this.</p>';
  return orderedMenus.map((m, i) => `
    <div class="embed-order-row">
      <span class="embed-order-title">${esc(m.title)}</span>
      <div class="embed-order-btns">
        <button class="btn-icon" ${i === 0 ? 'disabled' : ''} onclick="moveEmbedMenu('${m.slug}',-1)" title="Move up">↑</button>
        <button class="btn-icon" ${i === orderedMenus.length - 1 ? 'disabled' : ''} onclick="moveEmbedMenu('${m.slug}',1)" title="Move down">↓</button>
      </div>
    </div>`).join('');
}

function moveEmbedMenu(slug, dir) {
  const idx = embedOrderSlugs.indexOf(slug);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= embedOrderSlugs.length) return;
  [embedOrderSlugs[idx], embedOrderSlugs[newIdx]] = [embedOrderSlugs[newIdx], embedOrderSlugs[idx]];
  const orderedMenus = embedOrderSlugs.map(s => menus.find(m => m.slug === s)).filter(Boolean);
  const list = document.getElementById('embed-order-list');
  if (list) list.innerHTML = renderEmbedOrderList(orderedMenus);
}

async function saveEmbedOrder() {
  await fetch('/api/embed-order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slugs: embedOrderSlugs })
  });
  embedOrderSlugs.forEach((slug, i) => {
    const m = menus.find(m => m.slug === slug);
    if (m) m.embedOrder = i + 1;
  });
  const html = await fetch('/embed').then(r => r.text());
  const ta = document.getElementById('embed-code');
  if (ta) ta.value = html;
  const saved = document.getElementById('order-saved');
  if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2500); }
}

async function copyEmbed() {
  const ta = document.getElementById('embed-static');
  try { await navigator.clipboard.writeText(ta.value); }
  catch { ta.select(); document.execCommand('copy'); }
  const el = document.getElementById('copy-success');
  if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
}

async function copyLiveEmbed() {
  const ta = document.getElementById('embed-live');
  try { await navigator.clipboard.writeText(ta.value); }
  catch { ta.select(); document.execCommand('copy'); }
  const el = document.getElementById('copy-live-success');
  if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ════════════════════════════════════════════════════════════════════════════
function setTopbar({ back, title, subtitle, right }) {
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `
    <div class="topbar-left">
      ${back ? `<button class="topbar-back" onclick="nav('${back}')">←</button>` : ''}
      <span class="topbar-title">${title}</span>
      ${subtitle ? `<span class="topbar-subtitle">${esc(subtitle)}</span>` : ''}
    </div>
    <div class="topbar-right">${right || ''}</div>`;
}

function nav(path) { location.hash = '#' + path; }

function openModal(html, wide = false) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}">${html}</div>`;
  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.addEventListener('click', e => {
  const overlay = document.getElementById('modal-overlay');
  if (e.target === overlay) closeModal();
});

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--green);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.2);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
