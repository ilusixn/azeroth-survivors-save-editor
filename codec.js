const crypto = require('crypto');

// HMAC key from the game's RSE1 save format (ASCII label + 16-byte suffix).
const KEY = Buffer.from('617a65726f74682d7375727669766f72732f736176652f76312f9c4e27d16af013b85de2710ca936c48f', 'hex');

function hmac(buf) {
  return crypto.createHmac('sha1', KEY).update(buf).digest();
}

function cat(parts) {
  return Buffer.concat(parts);
}

function le64(n) {
  const b = Buffer.alloc(8);
  let x = n;
  for (let i = 0; i < 8; i++) {
    b[i] = x % 256;
    x = Math.floor(x / 256);
  }
  return b;
}

function mask(iv, data) {
  const out = Buffer.alloc(data.length);
  for (let i = 0, block = 0; i < data.length; i += 20, block++) {
    const stream = hmac(cat([Buffer.from('ks'), iv, le64(block)]));
    const n = Math.min(20, data.length - i);
    for (let j = 0; j < n; j++) out[i + j] = data[i + j] ^ stream[j];
  }
  return out;
}

function decode(text) {
  const s = String(text).trim();
  if (!s.startsWith('RSE1:')) throw new Error('Not an RSE1 save.');
  const raw = Buffer.from(s.slice(5).replace(/\s+/g, ''), 'base64');
  if (raw.length < 36) throw new Error('Save is too short.');
  const iv = raw.subarray(0, 16);
  const body = raw.subarray(16, raw.length - 20);
  const mac = raw.subarray(raw.length - 20);
  const expect = hmac(cat([Buffer.from('tag'), iv, body]));
  if (mac.length !== expect.length || !crypto.timingSafeEqual(mac, expect)) {
    throw new Error('Save checksum failed. It was cut off or it is not from this game.');
  }
  return mask(iv, body).toString('latin1');
}

function encode(plain) {
  const iv = crypto.randomBytes(16);
  const body = mask(iv, Buffer.from(String(plain), 'latin1'));
  const mac = hmac(cat([Buffer.from('tag'), iv, body]));
  return 'RSE1:' + cat([iv, body, mac]).toString('base64');
}

module.exports = { decode, encode };
