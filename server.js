const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads');
const MENUS_DIR = path.join(__dirname, 'data', 'menus');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;

// ── Startup ───────────────────────────────────────────────────────────────────
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MENUS_DIR, { recursive: true });
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    logoPath: '/assets/herd-brand.png', tagline: '', footer: '', lastUpdated: today()
  }, null, 2));
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth ──────────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const auth = req.headers.authorization || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (pass === ADMIN_PASSWORD) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Herd Menu Admin"');
  res.status(401).send('Authentication required');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function readSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

function readMenu(slug) {
  const file = path.join(MENUS_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeMenu(slug, data) {
  fs.writeFileSync(path.join(MENUS_DIR, `${slug}.json`), JSON.stringify(data, null, 2));
}

function listMenus() {
  if (!fs.existsSync(MENUS_DIR)) return [];
  return fs.readdirSync(MENUS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const m = JSON.parse(fs.readFileSync(path.join(MENUS_DIR, f), 'utf8'));
      return { id: m.id, title: m.title, slug: m.slug, status: m.status, lastUpdated: m.lastUpdated, publishedAt: m.publishedAt || null };
    })
    .sort((a, b) => {
      const order = { active: 0, draft: 1, archived: 2 };
      const statusDiff = (order[a.status] || 1) - (order[b.status] || 1);
      if (statusDiff !== 0) return statusDiff;
      return (b.lastUpdated || '').localeCompare(a.lastUpdated || '');
    });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function uniqueSlug(base) {
  let slug = base, i = 1;
  while (fs.existsSync(path.join(MENUS_DIR, `${slug}.json`))) slug = `${base}-${i++}`;
  return slug;
}

function resolveLogoUrl(req, settings) {
  if (!settings.logoPath) return '';
  if (settings.logoPath.startsWith('http')) return settings.logoPath;
  return `${req.protocol}://${req.get('host')}${settings.logoPath}`;
}

function mergedMenu(menu, settings) {
  return {
    ...menu,
    meta: {
      logoUrl: '',  // filled at render time
      tagline: menu.tagline || settings.tagline || '',
      footer: menu.footer || settings.footer || ''
    }
  };
}

function renderTemplate(name, vars) {
  let tpl = fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
  Object.entries(vars).forEach(([k, v]) => { tpl = tpl.replaceAll(k, v); });
  return tpl;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Settings
app.get('/api/settings', requireAuth, (req, res) => res.json(readSettings()));

app.post('/api/settings', requireAuth, (req, res) => {
  const s = { ...readSettings(), ...req.body, lastUpdated: today() };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  res.json({ ok: true });
});

// Logo upload (raw binary body)
app.post('/api/logo', requireAuth, (req, res) => {
  const ext = (req.headers['content-type'] || '').split('/')[1]?.split(';')[0] || 'png';
  const filename = `logo.${ext}`;
  const dest = path.join(UPLOAD_DIR, filename);
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    fs.writeFileSync(dest, Buffer.concat(chunks));
    const logoPath = `/uploads/${filename}`;
    const s = { ...readSettings(), logoPath, lastUpdated: today() };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
    res.json({ ok: true, logoPath });
  });
  req.on('error', () => res.status(500).json({ error: 'Upload failed' }));
});

// Menus — list
app.get('/api/menus', requireAuth, (req, res) => res.json(listMenus()));

// Menus — create
app.post('/api/menus', requireAuth, (req, res) => {
  const { title, status = 'draft' } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const slug = uniqueSlug(slugify(title));
  const menu = { id: slug, title, slug, status, tagline: '', footer: '', publishedAt: null, lastUpdated: today(), sections: [] };
  writeMenu(slug, menu);
  res.json({ ok: true, slug });
});

// Menus — get single
app.get('/api/menus/:slug', requireAuth, (req, res) => {
  const menu = readMenu(req.params.slug);
  if (!menu) return res.status(404).json({ error: 'Not found' });
  res.json(menu);
});

// Menus — save
app.post('/api/menus/:slug', requireAuth, (req, res) => {
  if (!readMenu(req.params.slug)) return res.status(404).json({ error: 'Not found' });
  const menu = { ...req.body, slug: req.params.slug, lastUpdated: today() };
  writeMenu(req.params.slug, menu);
  res.json({ ok: true, lastUpdated: menu.lastUpdated });
});

// Menus — duplicate
app.post('/api/menus/:slug/duplicate', requireAuth, (req, res) => {
  const src = readMenu(req.params.slug);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const newSlug = uniqueSlug(slugify(`${src.title} copy`));
  const copy = { ...src, id: newSlug, slug: newSlug, title: `Copy of ${src.title}`, status: 'draft', publishedAt: null, lastUpdated: today() };
  writeMenu(newSlug, copy);
  res.json({ ok: true, slug: newSlug });
});

// Menus — archive
app.post('/api/menus/:slug/archive', requireAuth, (req, res) => {
  const menu = readMenu(req.params.slug);
  if (!menu) return res.status(404).json({ error: 'Not found' });
  writeMenu(req.params.slug, { ...menu, status: 'archived', lastUpdated: today() });
  res.json({ ok: true });
});

// Menus — delete
app.delete('/api/menus/:slug', requireAuth, (req, res) => {
  const file = path.join(MENUS_DIR, `${req.params.slug}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

// Embed data (unauthenticated — for future live-fetch mode)
app.get('/api/embed-data/:slug', (req, res) => {
  const menu = readMenu(req.params.slug);
  if (!menu) return res.status(404).json({ error: 'Not found' });
  const settings = readSettings();
  const data = mergedMenu(menu, settings);
  data.meta.logoUrl = resolveLogoUrl(req, settings);
  res.json(data);
});

// Print
app.get('/print/:slug', requireAuth, (req, res) => {
  const menu = readMenu(req.params.slug);
  if (!menu) return res.status(404).send('Menu not found');
  const settings = readSettings();
  const data = mergedMenu(menu, settings);
  data.meta.logoUrl = resolveLogoUrl(req, settings);
  res.send(renderTemplate('print.template.html', {
    __MENU_DATA__: JSON.stringify(data),
    __LOGO_URL__: data.meta.logoUrl,
    __MENU_TITLE__: data.title
  }));
});

// Embed (unauthenticated)
app.get('/embed/:slug', (req, res) => {
  const menu = readMenu(req.params.slug);
  if (!menu) return res.status(404).send('<!-- Menu not found -->');
  const settings = readSettings();
  const data = mergedMenu(menu, settings);
  data.meta.logoUrl = resolveLogoUrl(req, settings);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(renderTemplate('embed.template.html', {
    __MENU_DATA__: JSON.stringify(data)
  }));
});

app.listen(PORT, () => {
  console.log(`\nHerd Menu Admin → http://localhost:${PORT}`);
  console.log(`Password protection: ${ADMIN_PASSWORD ? 'ON' : 'OFF (set ADMIN_PASSWORD to enable)'}\n`);
});
