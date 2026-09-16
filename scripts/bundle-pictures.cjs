// Build an offline image bundle from the seven organizer-supplied originals.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.argv[2];
if (!source) throw new Error('Provide the directory containing the event photographs.');
const names = [
  'Weixin Image_20260916142052_194_46.jpg',
  'Weixin Image_20260916142046_189_46.jpg',
  'Weixin Image_20260916142047_190_46.jpg',
  'Weixin Image_20260916142054_195_46.jpg',
  'Weixin Image_20260916142050_192_46.jpg',
  'Weixin Image_20260916142051_193_46.jpg',
  'Weixin Image_20260916142048_191_46.jpg'
];
const entries = names.map(name => {
  const bytes = fs.readFileSync(path.join(source, name));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`Invalid JPEG: ${name}`);
  return { id: 'bundled-' + crypto.createHash('sha256').update(bytes).digest('hex'), isAI: false, base64: bytes.toString('base64') };
});
fs.writeFileSync(path.join(__dirname, '..', 'bundled-pictures.js'), '// Generated from organizer-supplied photographs. All labeled Real by the organizer.\nwindow.BUNDLED_PICTURES = ' + JSON.stringify(entries) + ';\n');
console.log(`Bundled ${entries.length} real photographs without changing their image bytes.`);
