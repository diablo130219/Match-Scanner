const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.MAGICSCANNER_DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_FILE)) {
  fs.writeFileSync(STORE_FILE, JSON.stringify({ matchdays: {}, details: {} }, null, 2));
}

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      matchdays: parsed && typeof parsed.matchdays === 'object' && parsed.matchdays ? parsed.matchdays : {},
      details: parsed && typeof parsed.details === 'object' && parsed.details ? parsed.details : {}
    };
  } catch (e) {
    console.error('Store read error:', e.message);
    return { matchdays: {}, details: {} };
  }
}

function writeStore(store) {
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const token = String(req.get('x-admin-token') || '').trim();
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: 'ADMIN_TOKEN non valido' });
  next();
}

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => {
  const store = readStore();
  res.json({
    ok: true,
    version: '3.2.2',
    storage: 'server-json',
    admin_token_required: !!ADMIN_TOKEN,
    matchdays: Object.keys(store.matchdays).length,
    details: Object.keys(store.details).length
  });
});

app.get('/api/matchdays', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, matchdays: readStore().matchdays });
});

app.get('/api/matchdays/:date', (req, res) => {
  const store = readStore();
  const pack = store.matchdays[req.params.date];
  if (!pack) return res.status(404).json({ ok: false, error: 'Giornata non trovata' });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, matchday: pack });
});

app.post('/api/matchdays/:date', requireAdmin, (req, res) => {
  const key = String(req.params.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return res.status(400).json({ ok: false, error: 'Data non valida' });
  const pack = req.body && typeof req.body === 'object' ? req.body : {};
  if (!Array.isArray(pack.matches)) return res.status(400).json({ ok: false, error: 'matches deve essere un array' });
  const store = readStore();
  store.matchdays[key] = { ...pack, date: key, published_at: new Date().toISOString() };
  writeStore(store);
  res.json({ ok: true, date: key, matches: pack.matches.length });
});

app.delete('/api/matchdays/:date', requireAdmin, (req, res) => {
  const store = readStore();
  const existed = !!store.matchdays[req.params.date];
  delete store.matchdays[req.params.date];
  writeStore(store);
  res.json({ ok: true, deleted: existed, date: req.params.date });
});

app.delete('/api/matchdays', requireAdmin, (req, res) => {
  const store = readStore();
  const count = Object.keys(store.matchdays).length;
  store.matchdays = {};
  writeStore(store);
  res.json({ ok: true, deleted: count });
});

app.get('/api/details', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, details: readStore().details });
});

app.post('/api/details/bulk', requireAdmin, (req, res) => {
  const incoming = req.body && req.body.details && typeof req.body.details === 'object' ? req.body.details : {};
  const store = readStore();
  let count = 0;
  for (const [id, detail] of Object.entries(incoming)) {
    if (!id || !detail || typeof detail !== 'object') continue;
    store.details[id] = detail;
    count++;
  }
  writeStore(store);
  res.json({ ok: true, saved: count, total: Object.keys(store.details).length });
});

app.delete('/api/details', requireAdmin, (req, res) => {
  const store = readStore();
  const count = Object.keys(store.details).length;
  store.details = {};
  writeStore(store);
  res.json({ ok: true, deleted: count });
});

app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Errore server' });
});

app.listen(PORT, () => {
  console.log(`MagicScanner V3.2.2 listening on port ${PORT}`);
  console.log(`Storage: ${STORE_FILE}`);
  console.log(`ADMIN_TOKEN: ${ADMIN_TOKEN ? 'required' : 'not configured'}`);
});
