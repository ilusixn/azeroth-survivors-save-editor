const CLASSES = [
  [1, 'Warrior'], [2, 'Paladin'], [3, 'Hunter'], [4, 'Rogue'], [5, 'Priest'],
  [7, 'Shaman'], [8, 'Mage'], [9, 'Warlock'], [11, 'Druid']
];
const ZONES = [
  ['Elwynn Forest', 'elwynn'],
  ['Duskwood', 'duskwood'],
  ['Warsong Gulch', 'wsg'],
  ["Un'Goro Crater", 'ungoro'],
  ['Arathi Basin', 'ab'],
  ['Feralas', 'feralas'],
  ['Gurubashi Arena', 'arena'],
  ['Scarlet Monastery', 'sm'],
  ['Alterac Valley', 'av'],
  ['Blackrock Mountain', 'brm'],
  ["Gates of Ahn'Qiraj", 'aq'],
  ['Naxxramas', 'naxx']
];
const SLOTS = ['Head', 'Shoulder', 'Chest', 'Waist', 'Legs', 'Feet', 'Wrist', 'Hands', 'Main Hand', 'Off Hand'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'PvP', 'Legendary'];
const MAX_TALENT_XP = 23205;

function splitLines(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function joinLines(lines) {
  return lines.join('\n');
}

function kindOf(line) {
  const i = line.indexOf('|');
  return i < 0 ? line : line.slice(0, i);
}

function itemId(classId, slot, rarity) {
  return String(100000 + Number(classId) * 1000 + slot * 100 + rarity * 10);
}

function slotCount(classId) {
  return String(classId) === '4' || String(classId) === '7' ? 10 : 9;
}

function allItemIds() {
  const ids = [];
  for (const [id] of CLASSES) {
    const slots = slotCount(id);
    for (let r = 0; r < 6; r++) {
      for (let s = 0; s < slots; s++) ids.push(itemId(id, s, r));
    }
  }
  return ids;
}

function pointsFromXp(xp) {
  let points = 0;
  let cost = 80;
  let left = Number(xp) || 0;
  while (points < 51 && left >= cost) {
    left -= cost;
    points++;
    cost += 15;
  }
  return points;
}

function talentOf(line) {
  const p = line.split('|');
  return { classId: p[1], xp: p[2] || '0', ranks: p.slice(3).join('|') };
}

function matches(line, kind, classId) {
  const p = line.split('|');
  if (p[0] !== kind) return false;
  return classId === undefined || p[1] === String(classId);
}

function replaceWhere(lines, pred, nextLines) {
  const at = [];
  for (let i = 0; i < lines.length; i++) if (pred(lines[i])) at.push(i);
  if (!nextLines.length) {
    for (let i = at.length - 1; i >= 0; i--) lines.splice(at[i], 1);
    return lines;
  }
  if (!at.length) {
    lines.push(...nextLines);
    return lines;
  }
  lines.splice(at[0], 1, ...nextLines);
  const shift = nextLines.length - 1;
  for (let i = at.length - 1; i >= 1; i--) lines.splice(at[i] + shift, 1);
  return lines;
}

function listField(lines, name) {
  const line = lines.find(l => l.startsWith(name + '|'));
  if (!line) return [];
  return line.slice(name.length + 1).split(',').filter(Boolean);
}

function setListField(lines, name, values) {
  const line = values.length ? name + '|' + values.join(',') : null;
  replaceWhere(lines, l => matches(l, name), line ? [line] : []);
}

function talents(lines) {
  return lines.filter(l => l.startsWith('talent|')).map(talentOf);
}

function setTalent(lines, classId, xp, ranks) {
  const id = String(classId);
  const row = 'talent|' + id + '|' + String(xp) + '|' + (ranks || '');
  const at = lines.findIndex(l => matches(l, 'talent', id));
  if (at >= 0) lines[at] = row;
  else {
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (matches(lines[i], 'talent')) last = i;
    if (last < 0) lines.push(row);
    else lines.splice(last + 1, 0, row);
  }
}

function removeTalent(lines, classId) {
  const at = lines.findIndex(l => matches(l, 'talent', classId));
  if (at >= 0) lines.splice(at, 1);
}

function beats(lines, classId) {
  const zones = [];
  for (const line of lines) {
    if (!matches(line, 'beat', classId)) continue;
    for (const z of line.split('|').slice(2).join('|').split(',')) if (z) zones.push(z);
  }
  return zones;
}

function setBeats(lines, classId, zones) {
  const id = String(classId);
  const unique = [];
  for (const z of zones) if (z && !unique.includes(z)) unique.push(z);
  const row = 'beat|' + id + '|' + unique.join(',');
  replaceWhere(lines, l => matches(l, 'beat', id), unique.length ? [row] : []);
}

function openZone(lines, classId) {
  const line = lines.find(l => matches(l, 'open', classId));
  return line ? line.split('|').slice(2).join('|') : '';
}

function setOpenZone(lines, classId, zone) {
  const id = String(classId);
  replaceWhere(lines, l => matches(l, 'open', id), zone ? ['open|' + id + '|' + zone] : []);
}

function pairs(line, name) {
  const body = line.startsWith(name + '|') ? line.slice(name.length + 1) : '';
  if (!body) return [];
  return body.split(',').filter(Boolean).map(part => {
    const eq = part.indexOf('=');
    return eq < 0 ? [part, ''] : [part.slice(0, eq), part.slice(eq + 1)];
  });
}

function statPairs(lines) {
  const line = lines.find(l => l.startsWith('stat|'));
  return line ? pairs(line, 'stat') : [];
}

function setStatPairs(lines, entries) {
  setListField(lines, 'stat', entries.filter(e => e[0]).map(e => e[0] + '=' + e[1]));
}

function seenPairs(lines) {
  const line = lines.find(l => l.startsWith('seen|'));
  return line ? pairs(line, 'seen') : [];
}

function setSeenPairs(lines, entries) {
  setListField(lines, 'seen', entries.filter(e => e[0]).map(e => e[0] + '=' + e[1]));
}

function equipBody(lines, classId) {
  const line = lines.find(l => matches(l, 'equip', classId));
  return line ? line.split('|').slice(2).join('|') : '';
}

function setEquipBody(lines, classId, body) {
  const id = String(classId);
  replaceWhere(lines, l => matches(l, 'equip', id), body ? ['equip|' + id + '|' + body] : []);
}

const api = {
  CLASSES, ZONES, SLOTS, RARITIES, MAX_TALENT_XP,
  splitLines, joinLines, kindOf, itemId, slotCount, allItemIds, pointsFromXp,
  listField, setListField, talents, setTalent, removeTalent,
  beats, setBeats, openZone, setOpenZone, statPairs, setStatPairs,
  seenPairs, setSeenPairs, equipBody, setEquipBody
};

if (typeof window !== 'undefined') window.M = api;
if (typeof module !== 'undefined') module.exports = api;
