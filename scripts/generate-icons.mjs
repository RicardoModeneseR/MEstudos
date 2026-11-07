// Gera os PNGs do PWA a partir de public/icons/icon.svg
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icons/icon.svg');
const out = (name, size) => sharp(svg).resize(size, size).png().toFile(`public/icons/${name}`);
await out('icon-192.png', 192);
await out('icon-512.png', 512);

// maskable: ícone com margem de segurança sobre fundo sólido
const inner = await sharp(svg).resize(380, 380).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#5B2547' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile('public/icons/icon-maskable-512.png');
console.log('Ícones gerados.');
// iOS arredonda sozinho: o ícone precisa ser quadrado e sem transparência
await sharp('public/icons/icon-maskable-512.png').resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
