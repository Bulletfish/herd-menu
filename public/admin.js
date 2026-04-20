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
  return `
    <div class="menu-card ${m.status === 'archived' ? 'archived' : ''}">
      <div class="menu-card-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div class="menu-card-title">${esc(m.title)}</div>
          ${badge}
        </div>
        <div class="menu-card-meta">${updated}</div>
      </div>
      <div class="menu-card-actions">
        <button class="btn btn-green btn-sm" onclick="nav('/editor/${m.slug}')">Edit</button>
        <button class="btn btn-ghost btn-sm" style="background:#f0f4f0;color:var(--green);border-color:var(--border);" onclick="window.open('/print/${m.slug}','_blank')">Print</button>
        <button class="btn btn-ghost btn-sm" style="background:#f0f4f0;color:var(--green);border-color:var(--border);" onclick="openEmbedModal('${m.slug}')">Embed</button>
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
      <button class="btn btn-ghost btn-sm" onclick="openEmbedModal('${m.slug}')">Embed</button>
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
      <div class="section-meta-field section-meta-subtitle">
        <label>Subtitle <span style="font-weight:400;opacity:.6;">(optional italic line, e.g. "Teapigs Herbal Teas")</span></label>
        <input type="text" value="${esc(subtitle)}" placeholder="Leave blank if not needed"
          onchange="currentMenu.sections[${si}].subtitle=this.value.trim();">
      </div>
    </div>
    <div class="items-header">
      <span>Item</span><span>Price</span><span class="col-desc">Note / Add-on</span><span></span>
    </div>
    <div class="items-list" id="items-${si}"></div>
    <div class="add-item-row"><button class="btn-add-item" onclick="addItem(${si})">+ Add item</button></div>`;

  const list = card.querySelector(`#items-${si}`);
  section.items.forEach((item, ii) => list.appendChild(buildItemRow(item, si, ii)));
  return card;
}

function buildItemRow(item, si, ii) {
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

  row.innerHTML = `
    <input class="item-input" value="${esc(item.name)}" placeholder="Item name"
      onchange="currentMenu.sections[${si}].items[${ii}].name=this.value.trim();">
    <div class="price-wrap">
      <input class="item-input" type="number" step="0.01" min="0" value="${item.price||''}" placeholder="0.00"
        onchange="currentMenu.sections[${si}].items[${ii}].price=parseFloat(this.value)||0;">
    </div>
    <input class="item-input desc" value="${esc(item.description||'')}" placeholder="Optional note or add-on…"
      onchange="currentMenu.sections[${si}].items[${ii}].description=this.value.trim();">
    <button class="btn-icon" onclick="deleteItem(${si},${ii})">✕</button>`;
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

function addItem(si) {
  currentMenu.sections[si].items.push({ name: '', price: 0, description: '' });
  renderSections();
  const rows = document.querySelectorAll(`#items-${si} .item-row`);
  rows[rows.length - 1]?.querySelector('.item-input')?.focus();
}

function deleteItem(si, ii) {
  currentMenu.sections[si].items.splice(ii, 1);
  renderSections();
}

async function saveMenu() {
  currentMenu.title = document.getElementById('ed-title')?.value.trim() || currentMenu.title;
  currentMenu.status = document.getElementById('ed-status')?.value || currentMenu.status;
  currentMenu.tagline = document.getElementById('ed-tagline')?.value.trim() || '';
  currentMenu.footer = document.getElementById('ed-footer')?.value.trim() || '';

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
  const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
  const data = await res.json();
  if (data.ok) { showToast('Settings saved'); }
}

// ════════════════════════════════════════════════════════════════════════════
// EMBED MODAL
// ════════════════════════════════════════════════════════════════════════════
async function openEmbedModal(slug) {
  openModal(`
    <div class="modal-header"><h2>Embed Code — ${esc(slug)}</h2><button class="btn-icon" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.6;">
        Copy the code below and paste it into the <strong>Custom HTML</strong> block on the Herd menu page in Ecwid.<br>
        Select all existing code and replace it with this each time you update the menu.
      </p>
      <textarea class="code-area" id="embed-code" readonly onclick="this.select()">Loading…</textarea>
    </div>
    <div class="modal-footer">
      <span class="copy-success" id="copy-success">Copied!</span>
      <button class="btn btn-green" onclick="copyEmbed()">Copy to Clipboard</button>
      <button class="btn" onclick="closeModal()" style="border:1px solid var(--border)">Close</button>
    </div>`, true);

  const html = await fetch(`/embed/${slug}`).then(r => r.text());
  const ta = document.getElementById('embed-code');
  if (ta) ta.value = html;
}

async function copyEmbed() {
  const ta = document.getElementById('embed-code');
  try { await navigator.clipboard.writeText(ta.value); }
  catch { ta.select(); document.execCommand('copy'); }
  const el = document.getElementById('copy-success');
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
