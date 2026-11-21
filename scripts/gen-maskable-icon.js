// Jana icon-maskable-512.png: kunci di tengah dalam zon selamat (bulatan 80%),
// latar penuh supaya tidak terpotong oleh bentuk ikon Android. Tiada kebergantungan luar.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const N = 512, SS = 4;                // saiz & supersampling (anti-alias)
const BG = [0x1e, 0x3a, 0x8a];        // sama seperti icon-512.png
const FG = [0xff, 0xff, 0xff];

// Bentuk kunci (koordinat icon-512.png asal), dipusatkan & dikecilkan ke dalam zon selamat
const SRC_CX = 255, SRC_CY = 215, SCALE = 0.85;
function inKey(x, y) {
  const sx = (x - N / 2) / SCALE + SRC_CX;
  const sy = (y - N / 2) / SCALE + SRC_CY;
  const d = Math.hypot(sx - 184, sy - 215);
  if (d <= 82 && d >= 52) return true;                          // gelang
  if (sx >= 262 && sx <= 410 && sy >= 199 && sy <= 231) return true; // batang
  if (sx >= 337 && sx <= 368 && sy >= 231 && sy <= 286) return true; // gigi 1
  if (sx >= 388 && sx <= 410 && sy >= 231 && sy <= 267) return true; // gigi 2
  return false;
}

const raw = Buffer.alloc(N * (N * 3 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 3 + 1)] = 0; // penapis: tiada
  for (let x = 0; x < N; x++) {
    let hit = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      if (inKey(x + (i + 0.5) / SS, y + (j + 0.5) / SS)) hit++;
    }
    const a = hit / (SS * SS);
    const o = y * (N * 3 + 1) + 1 + x * 3;
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
const png = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const out = path.join(__dirname, '..', 'icon-maskable-512.png');
fs.writeFileSync(out, png);
console.log('Dijana:', out, png.length, 'bait');
