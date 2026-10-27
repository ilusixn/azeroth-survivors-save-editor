const fs = require('fs');
const { decode, encode } = require('./codec');
const model = require('./model');

const backup = 'C:/Users/ilusi/AppData/Roaming/wenilla-rogue/characters.backup-before-xp.txt';
const plain = decode(fs.readFileSync(backup, 'utf8'));
if (model.joinLines(model.splitLines(plain)) !== plain.replace(/\r\n/g, '\n').replace(/\n$/, '')) {
  throw new Error('line split changed the save');
}
const lines = model.splitLines(plain);
const before = model.joinLines(lines);
model.setTalent(lines, 11, 870, model.talents(lines).find(t => t.classId === '11').ranks);
if (model.joinLines(lines) !== before) throw new Error('rewriting the same talent changed the file');
const again = decode(encode(plain));
if (again !== plain) throw new Error('encrypt roundtrip mismatch');
if (!plain.includes('talent|11|870|')) throw new Error('expected original xp');
const ids = model.allItemIds();
if (ids.length !== 498) throw new Error('item count ' + ids.length);
if (model.pointsFromXp(870) !== 6) throw new Error('points ' + model.pointsFromXp(870));
if (model.pointsFromXp(23205) !== 51) throw new Error('max points');
const copy = lines.slice();
model.setBeats(copy, 1, ['elwynn']);
if (copy.find(l => l.startsWith('beat|11|')) !== 'beat|11|elwynn') throw new Error('class 1 edit touched druid');
if (!copy.includes('beat|1|elwynn')) throw new Error('class 1 beat missing');

const os = require('os');
const path = require('path');
const { findInFolder, resolveHook } = require('./find-save');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azs-find-'));
const nested = path.join(dir, 'somewhere', 'else');
fs.mkdirSync(nested, { recursive: true });
fs.writeFileSync(path.join(nested, 'notes.txt'), 'not a save');
fs.writeFileSync(path.join(dir, 'characters.txt'), encode('pick|1|\n'));
const other = path.join(nested, 'Backup old.sav');
fs.writeFileSync(other, encode('pick|2|\n'));
const hits = findInFolder(dir);
if (hits[0] !== path.join(dir, 'characters.txt')) throw new Error('preferred ' + hits.join(' | '));
if (resolveHook(nested).path !== other) throw new Error('folder resolve failed');
fs.rmSync(dir, { recursive: true });
console.log('ok', lines.length, 'lines');
