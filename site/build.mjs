// Tiny static-site builder for the Inkarr docs: no dependencies.
// src/index.html            -> dist/index.html (landing page)
// src/docs/NN-slug.html     -> dist/docs/slug.html, wrapped in src/layout.html
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'docs'), { recursive: true });

const layout = readFileSync(join(src, 'layout.html'), 'utf8');
const pages = readdirSync(join(src, 'docs'))
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((file) => {
    const raw = readFileSync(join(src, 'docs', file), 'utf8');
    const meta = JSON.parse(raw.match(/^<!--\s*({.*?})\s*-->/s)[1]);
    const body = raw.replace(/^<!--.*?-->\s*/s, '');
    const toc = [...body.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map(([, id, text]) => ({ id, text: text.replace(/<[^>]+>/g, '') }));
    return { ...meta, slug: file.replace(/^\d+-/, '').replace(/\.html$/, ''), body, toc };
  });

const groups = [...new Set(pages.map((p) => p.group))];
for (const [i, page] of pages.entries()) {
  const nav = groups
    .map((g) => `<div class="nav-group"><div class="nav-group-title">${g}</div>${pages
      .filter((p) => p.group === g)
      .map((p) => `<a href="${p.slug}.html"${p === page ? ' class="active" aria-current="page"' : ''}>${p.title}</a>`)
      .join('')}</div>`)
    .join('');
  const toc = page.toc.length ? `<div class="toc-title">On this page</div>${page.toc.map((t) => `<a href="#${t.id}">${t.text}</a>`).join('')}` : '';
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const pager = `<nav class="pager">${prev ? `<a class="prev" href="${prev.slug}.html"><small>Previous</small>${prev.title}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.slug}.html"><small>Next</small>${next.title}</a>` : ''}</nav>`;
  const html = layout
    .replaceAll('{{title}}', page.title)
    .replaceAll('{{description}}', page.description ?? '')
    .replace('{{nav}}', nav)
    .replace('{{toc}}', toc)
    .replace('{{content}}', `<h1>${page.title}</h1>${page.lead ? `<p class="lead">${page.lead}</p>` : ''}${page.body}${pager}`);
  writeFileSync(join(dist, 'docs', `${page.slug}.html`), html);
}
writeFileSync(join(dist, 'docs', 'index.html'), `<!doctype html><meta http-equiv="refresh" content="0; url=${pages[0].slug}.html"><link rel="canonical" href="${pages[0].slug}.html">`);
for (const f of ['index.html', 'style.css', 'logo.svg', 'screenshot.png']) {
  try { copyFileSync(join(src, f), join(dist, f)); } catch { /* optional */ }
}
writeFileSync(join(dist, '.nojekyll'), '');
console.log(`built ${pages.length} docs pages -> ${dist}`);
