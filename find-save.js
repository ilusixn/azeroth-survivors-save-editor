const fs = require('fs');
const path = require('path');

function looksLikeSave(file) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile() || st.size < 8 || st.size > 2000000) return false;
  const name = path.basename(file).toLowerCase();
  if (name !== 'characters.txt' && !name.endsWith('.sav') && !name.endsWith('.txt')) return false;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(120);
  const n = fs.readSync(fd, buf, 0, 120, 0);
  fs.closeSync(fd);
  const head = buf.subarray(0, n).toString('utf8');
  return head.startsWith('RSE1:') || head.includes('talent|') || head.includes('pick|');
}

function rank(file, root) {
  const name = path.basename(file).toLowerCase();
  const backup = name.includes('backup') ? 1 : 0;
  const live = name === 'characters.txt' ? 0 : 1;
  const depth = path.relative(root, file).split(path.sep).length;
  return [live, backup, depth];
}

function findInFolder(root) {
  const start = path.resolve(root);
  const found = [];
  const stack = [{ dir: start, depth: 0 }];
  let seen = 0;
  while (stack.length && seen < 4000) {
    const { dir, depth } = stack.pop();
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (name === 'node_modules' || name === '.git' || name === 'Data') continue;
      const full = path.join(dir, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      seen++;
      if (st.isDirectory()) {
        if (depth < 4) stack.push({ dir: full, depth: depth + 1 });
      } else if (looksLikeSave(full)) found.push(full);
    }
  }
  found.sort((a, b) => {
    const ra = rank(a, start);
    const rb = rank(b, start);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.length - b.length;
  });
  return found;
}

function usualPlaces() {
  const roots = [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean);
  const rels = [
    ['wenilla-rogue', 'characters.txt'],
    ['benilla', 'characters.txt'],
    ['benilla-config', 'characters.txt'],
    ['AzerothSurvivors', 'characters.txt']
  ];
  const out = [];
  for (const root of roots) {
    for (const rel of rels) {
      const full = path.join(root, ...rel);
      if (looksLikeSave(full)) out.push(full);
    }
  }
  return out;
}

function resolveHook(input) {
  const full = path.resolve(String(input || '').trim());
  let st;
  try { st = fs.statSync(full); } catch {
    throw new Error('Nothing at that path.');
  }
  if (st.isFile()) {
    if (!looksLikeSave(full)) throw new Error('That file is not an Azeroth Survivors save.');
    return { path: full, choices: [] };
  }
  if (!st.isDirectory()) throw new Error('Choose a save file or a folder.');
  const choices = findInFolder(full);
  if (!choices.length) throw new Error('No characters.txt or RSE1 save in that folder. Point at the save file itself.');
  if (choices.length === 1) return { path: choices[0], choices: [] };
  return { path: null, choices };
}

module.exports = { looksLikeSave, findInFolder, usualPlaces, resolveHook };
