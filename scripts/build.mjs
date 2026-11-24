// NO HABAL — يبني ملفات النشر من مجلد extension/:
//   dist/no-habal-chromium-<v>.zip  → Chrome Web Store و Microsoft Edge Add-ons و GitHub
//   dist/no-habal-firefox-<v>.zip   → Firefox Add-ons (AMO)
// الاستخدام:  node scripts/build.mjs
// بدون مكتبات خارجية: كاتب zip صغير فوق zlib المدمج في Node.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension');
const dist = path.join(root, 'dist');

// ---------------------------------------------------------------- zip
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
};

function zip(entries) { // entries: [{ name, data: Buffer }]
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);       // version needed
    head.writeUInt16LE(0x0800, 6);   // UTF-8 names
    head.writeUInt16LE(8, 8);        // deflate
    head.writeUInt32LE(0, 10);       // time/date
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(deflated.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, nameBuf, deflated);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(deflated.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    centrals.push(cen, nameBuf);
    offset += head.length + nameBuf.length + deflated.length;
  }
  const cenBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cenBuf, end]);
}

// ---------------------------------------------------------------- files
function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full, base);
    if (e.name.startsWith('.')) return [];
    return [{ name: path.relative(base, full).split(path.sep).join('/'), data: fs.readFileSync(full) }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const files = listFiles(src);
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const withManifest = (m) => files.map((f) =>
  f.name === 'manifest.json' ? { name: f.name, data: Buffer.from(JSON.stringify(m, null, 2) + '\n') } : f);

// Firefox: سكربت خلفية بدل service worker، ومعرّف ثابت، وتصريح جمع البيانات (مطلوب في AMO)
function firefoxManifest(m) {
  const fx = structuredClone(m);
  fx.background = { scripts: [m.background.service_worker] };
  fx.browser_specific_settings = {
    gecko: {
      id: 'no-habal@no-habal.app',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['websiteContent', 'websiteActivity'],
      },
    },
  };
  return fx;
}

fs.mkdirSync(dist, { recursive: true });
const outputs = [
  [`no-habal-chromium-${manifest.version}.zip`, withManifest(manifest)],
  [`no-habal-firefox-${manifest.version}.zip`, withManifest(firefoxManifest(manifest))],
];
for (const [name, entries] of outputs) {
  const buf = zip(entries);
  fs.writeFileSync(path.join(dist, name), buf);
  console.log(`dist/${name}  (${entries.length} files, ${(buf.length / 1024).toFixed(1)} KB)`);
}
