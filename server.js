const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { decode, encode } = require('./codec');
const { looksLikeSave, usualPlaces, resolveHook } = require('./find-save');

const PORT = 8734;
const ROOT = __dirname;
const HOOK_FILE = path.join(ROOT, 'hooked-save.txt');
const FALLBACK = path.join(process.env.APPDATA || '', 'wenilla-rogue', 'characters.txt');

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > 2000000) {
        reject(new Error('Save is too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function plainOf(body) {
  const plain = String(body.plain ?? '').replace(/\r\n/g, '\n');
  return plain.endsWith('\n') ? plain.slice(0, -1) : plain;
}

function signed(plain) {
  if (!plain.includes('|')) throw new Error('Refusing to write an empty save.');
  const text = encode(plain);
  if (decode(text) !== plain) throw new Error('The signed save did not match. Nothing was written.');
  return text;
}

function readHooked() {
  try {
    const saved = fs.readFileSync(HOOK_FILE, 'utf8').trim();
    if (saved && looksLikeSave(saved)) return path.resolve(saved);
  } catch { /* first run, or the old path is gone */ }
  if (looksLikeSave(FALLBACK)) return FALLBACK;
  return '';
}

let saveFile = readHooked();

function remember(file) {
  saveFile = path.resolve(file);
  fs.writeFileSync(HOOK_FILE, saveFile + '\n');
}

function readSave(file) {
  return { path: file, plain: decode(fs.readFileSync(file, 'utf8')) };
}

function psQuote(s) {
  return String(s || '').replace(/'/g, "''");
}

function pickPath(kind) {
  const start = saveFile ? path.dirname(saveFile) : '';
  const script = kind === 'dir'
    ? `Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Select the game folder, or the folder that contains the save'
if ('${psQuote(start)}') { $d.SelectedPath = '${psQuote(start)}' }
if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`
    : `Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = 'Select the Azeroth Survivors save'
$d.Filter = 'Save (characters.txt, .sav)|characters.txt;*.sav;*.txt|All files|*.*'
$d.CheckFileExists = $true
if ('${psQuote(start)}') { $d.InitialDirectory = '${psQuote(start)}' }
if ($d.ShowDialog() -eq 'OK') { $d.FileName }`;
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { timeout: 180000, windowsHide: false }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').trim() || 'Could not open the file picker.'));
      else resolve(String(stdout || '').replace(/^\uFEFF/, '').trim());
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(ROOT, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/model.js') {
      return send(res, 200, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(ROOT, 'model.js')));
    }
    if (req.method === 'GET' && url.pathname === '/api/save') {
      const suggestions = usualPlaces().filter(p => p !== saveFile);
      if (!saveFile) return send(res, 200, 'application/json', JSON.stringify({ path: '', plain: '', suggestions }));
      const data = readSave(saveFile);
      data.suggestions = suggestions;
      return send(res, 200, 'application/json', JSON.stringify(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/hook') {
      const body = JSON.parse(await readBody(req));
      const found = resolveHook(body.path);
      if (!found.path) return send(res, 200, 'application/json', JSON.stringify({ choices: found.choices }));
      remember(found.path);
      return send(res, 200, 'application/json', JSON.stringify(readSave(saveFile)));
    }
    if (req.method === 'POST' && url.pathname === '/api/browse') {
      const body = JSON.parse(await readBody(req));
      const picked = await pickPath(body.kind === 'dir' ? 'dir' : 'file');
      if (!picked) return send(res, 200, 'application/json', JSON.stringify({ cancelled: true }));
      const found = resolveHook(picked);
      if (!found.path) return send(res, 200, 'application/json', JSON.stringify({ choices: found.choices }));
      remember(found.path);
      return send(res, 200, 'application/json', JSON.stringify(readSave(saveFile)));
    }
    if (req.method === 'POST' && url.pathname === '/api/decode') {
      const body = JSON.parse(await readBody(req));
      const text = String(body.text || '');
      const plain = text.trim().startsWith('RSE1:') ? decode(text) : text.replace(/\r\n/g, '\n');
      return send(res, 200, 'application/json', JSON.stringify({ plain }));
    }
    if (req.method === 'POST' && url.pathname === '/api/save') {
      if (!saveFile) throw new Error('Choose the save file or game folder first.');
      const plain = plainOf(JSON.parse(await readBody(req)));
      const text = signed(plain);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (fs.existsSync(saveFile)) fs.copyFileSync(saveFile, saveFile + '.editor-backup-' + stamp);
      fs.writeFileSync(saveFile, text + '\n');
      return send(res, 200, 'application/json', JSON.stringify({ ok: true, path: saveFile }));
    }
    if (req.method === 'POST' && url.pathname === '/api/download') {
      const plain = plainOf(JSON.parse(await readBody(req)));
      return send(res, 200, 'application/json', JSON.stringify({ text: signed(plain) }));
    }
    send(res, 404, 'text/plain', 'not found');
  } catch (err) {
    send(res, 400, 'application/json', JSON.stringify({ error: err.message || String(err) }));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Already running. Open http://127.0.0.1:' + PORT + '/');
    exec('cmd /c start "" "http://127.0.0.1:' + PORT + '/"');
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT + '/';
  console.log('Save editor at ' + url);
  console.log(saveFile ? 'Game save: ' + saveFile : 'No save hooked yet. Pick the file in the page.');
  exec('cmd /c start "" "' + url + '"');
});
