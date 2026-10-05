/**
 * Generates PWA icons and iOS startup images with headless Chromium (Playwright).
 * Dev-only; the PNGs are committed so a normal build needs no browser.
 *   npm i -D playwright-core   (or have `playwright` globally)   then   npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) {
    try {
      return require(id);
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright not found');
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

/**
 * Brand mark on a 1000-unit canvas: wordmark over a 60° thread profile with three best-size
 * wires seated in the grooves (wire tops sit flush with the crests, as a best wire should).
 */
const MARK = (() => {
  const P = 190;
  const x0 = 120;
  const baseY = 800;
  const depth = 0.866 * P;
  const r = 0.2887 * P;
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([x0 + (i * P) / 2, i % 2 === 0 ? baseY : baseY - depth]);
  const poly = [...pts, [x0 + 4 * P, 900], [x0, 900]].map((p) => p.join(',')).join(' ');
  const wires = [1, 2, 3]
    .map((i) => `<circle cx="${x0 + i * P}" cy="${baseY - 2 * r}" r="${r}" fill="#f2f6fa" stroke="#1d78e6" stroke-width="10"/>`)
    .join('');
  return `
  <polygon points="${poly}" fill="#52a8ff"/>
  ${wires}
  <text x="500" y="300" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="900" font-size="165" letter-spacing="8" fill="#f6f8fa">THREAD</text>
  <text x="500" y="500" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="900" font-size="215" letter-spacing="36" fill="#2fd36b">MAV</text>`;
})();

/** scale < 1 shrinks the art toward the centre (maskable safe zone / splash logo). */
const icon = (size, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">
  <rect width="1000" height="1000" fill="#07090b"/>
  <g transform="translate(${500 * (1 - scale)} ${500 * (1 - scale)}) scale(${scale})">${MARK}</g>
</svg>`;

const splash = (w, h) => {
  const logo = Math.round(w * 0.46);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#07090b"/>
  <svg x="${(w - logo) / 2}" y="${(h - logo) / 2}" width="${logo}" height="${logo}" viewBox="0 0 1000 1000">${MARK}</svg>
</svg>`;
};

const { chromium } = loadPlaywright();
const exe = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();

async function png(svg, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:#07090b">${svg}</body></html>`);
  const buf = await page.screenshot({ type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: w, height: h } });
  writeFileSync(join(out, file), buf);
  console.log('wrote', file);
}

await png(icon(180), 180, 180, 'apple-touch-icon.png');
await png(icon(192), 192, 192, 'icon-192.png');
await png(icon(512), 512, 512, 'icon-512.png');
await png(icon(512, 0.78), 512, 512, 'icon-maskable-512.png');
await png(icon(32), 32, 32, 'favicon-32.png');

// iOS startup (splash) images: [pixelW, pixelH]
const splashes = [
  [1320, 2868], [1206, 2622], [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532], [1125, 2436], [750, 1334],
];
for (const [w, h] of splashes) await png(splash(w, h), w, h, `splash-${w}x${h}.png`);
await browser.close();
