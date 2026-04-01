const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MENU_PATH = path.join(__dirname, 'data', 'menu.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Password protection (skipped if ADMIN_PASSWORD not set) ───────────────────
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // local dev: no password set
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
function readMenu() {
  return JSON.parse(fs.readFileSync(MENU_PATH, 'utf8'));
}

function renderTemplate(templateName, menu) {
  const tpl = fs.readFileSync(path.join(TEMPLATES_DIR, templateName), 'utf8');
  return tpl.replace('__MENU_DATA__', JSON.stringify(menu));
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/admin'));

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/menu', requireAuth, (req, res) => {
  res.json(readMenu());
});

app.post('/menu', requireAuth, (req, res) => {
  const menu = req.body;
  menu.meta.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(MENU_PATH, JSON.stringify(menu, null, 2));
  res.json({ ok: true, lastUpdated: menu.meta.lastUpdated });
});

app.get('/print', requireAuth, (req, res) => {
  const menu = readMenu();
  res.send(renderTemplate('print.template.html', menu));
});

app.get('/embed', requireAuth, (req, res) => {
  const menu = readMenu();
  const html = renderTemplate('embed.template.html', menu);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`\nHerd Menu Admin running at http://localhost:${PORT}`);
  if (ADMIN_PASSWORD) {
    console.log('Password protection: ON\n');
  } else {
    console.log('Password protection: OFF (set ADMIN_PASSWORD env var to enable)\n');
  }
});
