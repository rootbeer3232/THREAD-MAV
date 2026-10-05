import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

function gitSha(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
const BUILD_ID = `${stamp}-${gitSha()}`;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Writes dist/sw.js with the precache list and a cache name derived from the content hash. */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'thread-mav-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const cacheName = `thread-mav-${hash.digest('hex').slice(0, 10)}`;
      const urls = ['./', ...files.map((f) => `./${f}`)];
      const tpl = readFileSync('sw/sw.template.js', 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        tpl.replaceAll('__CACHE_NAME__', cacheName).replaceAll('__PRECACHE__', JSON.stringify(urls, null, 1)),
      );
      console.log(`\n[thread-mav-sw] ${cacheName} · ${urls.length} precached files · build ${BUILD_ID}`);
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(now.toISOString()),
  },
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  plugins: [serviceWorkerPlugin()],
  server: { host: true },
});
