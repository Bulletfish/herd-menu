/**
 * One-time migration: data/menu.json → data/menus/lunch.json + data/settings.json
 * Run once with: node scripts/migrate.js
 * Safe to re-run (idempotent).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OLD_MENU = path.join(ROOT, 'data', 'menu.json');
const MENUS_DIR = path.join(ROOT, 'data', 'menus');
const SETTINGS_FILE = path.join(ROOT, 'data', 'settings.json');
const NEW_MENU = path.join(MENUS_DIR, 'lunch.json');

if (!fs.existsSync(OLD_MENU)) {
  console.log('data/menu.json not found — migration may have already run.');
  process.exit(0);
}

const old = JSON.parse(fs.readFileSync(OLD_MENU, 'utf8'));

// Create menus directory
if (!fs.existsSync(MENUS_DIR)) fs.mkdirSync(MENUS_DIR, { recursive: true });

// Write settings.json (global defaults)
if (!fs.existsSync(SETTINGS_FILE)) {
  const settings = {
    logoPath: '/assets/herd-brand.png',
    tagline: old.meta?.tagline || '',
    footer: old.meta?.footer || '',
    lastUpdated: new Date().toISOString().split('T')[0]
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  console.log('✓ Created data/settings.json');
} else {
  console.log('  data/settings.json already exists — skipping');
}

// Write lunch.json
if (!fs.existsSync(NEW_MENU)) {
  const menu = {
    id: 'lunch',
    title: 'Lunch',
    slug: 'lunch',
    status: 'active',
    tagline: '',
    footer: '',
    publishedAt: null,
    lastUpdated: old.meta?.lastUpdated || new Date().toISOString().split('T')[0],
    sections: old.sections || []
  };
  fs.writeFileSync(NEW_MENU, JSON.stringify(menu, null, 2));
  console.log('✓ Created data/menus/lunch.json');
} else {
  console.log('  data/menus/lunch.json already exists — skipping');
}

console.log('\nMigration complete.');
console.log('You can now delete data/menu.json once you have verified the migrated files.\n');
