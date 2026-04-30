const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// DATA_DIR lets Railway (or any host) point at a persistent volume.
// Locally it defaults to the repo's data/ folder so nothing changes.
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads');
const MENUS_DIR  = path.join(DATA_DIR, 'menus');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;

// ── Startup ───────────────────────────────────────────────────────────────────
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MENUS_DIR, { recursive: true });

// Seed a fresh persistent volume from the repo's data/ on first run.
// Only runs when DATA_DIR differs from the local data/ path (i.e. on Railway).
const LOCAL_DATA = path.join(__dirname, 'data');
if (DATA_DIR !== LOCAL_DATA) {
  const localSettings = path.join(LOCAL_DATA, 'settings.json');
  if (!fs.existsSync(SETTINGS_FILE) && fs.existsSync(localSettings)) {
    fs.copyFileSync(localSettings, SETTINGS_FILE);
    console.log('Seeded settings.json from repo defaults.');
  }
  const localMenus = path.join(LOCAL_DATA, 'menus');
  if (fs.existsSync(localMenus) && fs.readdirSync(MENUS_DIR).length === 0) {
    fs.readdirSync(localMenus).filter(f => f.endsWith('.json')).forEach(f => {
      fs.copyFileSync(path.join(localMenus, f), path.join(MENUS_DIR, f));
    });
    console.log('Seeded menus/ from repo defaults.');
  }
}

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
      return { id: m.id, title: m.title, slug: m.slug, status: m.status, lastUpdated: m.lastUpdated, publishedAt: m.publishedAt || null, showInEmbed: m.showInEmbed || false };
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
      footer: menu.footer || settings.footer || '',
      bodyFont: settings.bodyFont || "'Helvetica Neue', Helvetica, Arial, sans-serif"
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

// Storage diagnostic — open this URL after deploy to verify persistence is configured
app.get('/api/status', requireAuth, (req, res) => {
  const LOCAL_DATA_ABS = path.resolve(path.join(__dirname, 'data'));
  const DATA_DIR_ABS   = path.resolve(DATA_DIR);
  const usingVolume    = DATA_DIR_ABS !== LOCAL_DATA_ABS;
  const menusExist     = fs.existsSync(MENUS_DIR);
  const menuFiles      = menusExist ? fs.readdirSync(MENUS_DIR).filter(f => f.endsWith('.json')) : [];
  res.json({
    status:       usingVolume ? 'OK — persistent volume in use' : 'WARNING — no volume, data resets on every deploy',
    usingVolume,
    DATA_DIR:     DATA_DIR_ABS,
    MENUS_DIR:    path.resolve(MENUS_DIR),
    SETTINGS_FILE: path.resolve(SETTINGS_FILE),
    UPLOAD_DIR:   path.resolve(UPLOAD_DIR),
    menusFound:   menuFiles,
    menusCount:   menuFiles.length,
    fix: usingVolume ? null : 'In Railway: add a Volume mounted at /data, then set env var DATA_DIR=/data and redeploy'
  });
});

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

// Helper: build resolved menu array for embed
function buildEmbedMenus(req, menus) {
  const settings = readSettings();
  return menus.map(m => {
    const data = mergedMenu(m, settings);
    data.meta.logoUrl = resolveLogoUrl(req, settings);
    return data;
  });
}

// Combined embed — all menus marked showInEmbed, in dashboard sort order (unauthenticated)
app.get('/embed', (req, res) => {
  const visible = listMenus()
    .filter(m => m.showInEmbed && m.status !== 'archived')
    .map(m => readMenu(m.slug))
    .filter(Boolean);
  const resolved = buildEmbedMenus(req, visible);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(renderTemplate('embed.template.html', { __MENUS_DATA__: JSON.stringify(resolved) }));
});

// Single-menu embed — kept for reference / backward compat (unauthenticated)
app.get('/embed/:slug', (req, res) => {
  const menu = readMenu(req.params.slug);
  if (!menu) return res.status(404).send('<!-- Menu not found -->');
  const resolved = buildEmbedMenus(req, [menu]);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(renderTemplate('embed.template.html', { __MENUS_DATA__: JSON.stringify(resolved) }));
});

app.listen(PORT, () => {
  console.log(`\nHerd Menu Admin → http://localhost:${PORT}`);
  console.log(`Password protection: ${ADMIN_PASSWORD ? 'ON' : 'OFF (set ADMIN_PASSWORD to enable)'}\n`);
});
