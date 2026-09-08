import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createMarkdownProcessor, parseFrontmatter } from "@astrojs/markdown-remark";
import config from "../astro.config.mjs";

const root = new URL("../", import.meta.url);
const read = name => readFileSync(new URL(name, root), "utf8");
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
  return entry.isDirectory() ? files(child) : entry.name.endsWith(".md") ? [child] : [];
});
const compact = html => html.replace(/>\s+</g, "><").trim();
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const home = read("dist/index.html");
const cards = [...home.matchAll(/<article\b[^>]*class="post-card[^"]*"[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
const published = files(new URL("src/content/blog/", root)).map(file => ({
  file,
  ...parseFrontmatter(readFileSync(file, "utf8"))
})).filter(post => !post.frontmatter.draft);
assert.equal(cards.length, published.length, "Every published article must appear once on the homepage");
assert.equal(cards.filter(card => /class="[^"]*\bfeatured\b/.test(card)).length, Math.min(2, published.length));
assert.equal(new Set(cards.map(card => card.match(/href="([^"]+)"/)[1])).size, cards.length);

const processor = await createMarkdownProcessor(config.markdown);
for (const post of published) {
  const id = decodeURIComponent(post.file.pathname.split("/src/content/blog/")[1]).replace(/\.md$/, "");
  const href = `/blog/${id}/`;
  const card = cards.find(value => value.includes(`href="${href}"`));
  assert.ok(card, `Missing card: ${id}`);
  assert.ok(card.includes(`data-cover-fit="${post.frontmatter.cover_fit ?? "contain"}"`), `Lost per-post image policy: ${id}`);
  assert.ok(card.includes(escape(post.frontmatter.title)), `Changed title: ${id}`);
  assert.ok(card.includes(escape(post.frontmatter.summary)), `Changed summary: ${id}`);
  const date = new Date(post.frontmatter.date).toISOString().slice(0, 10);
  assert.ok(card.includes(`<time datetime="${date}"`));
  const html = read(`dist${href}index.html`);
  const masthead = html.match(/<header class="post-header"[^>]*>([\s\S]*?)<\/header>/)[1];
  assert.ok(masthead.includes(`<time datetime="${date}"`));
  assert.ok(masthead.includes(escape(post.frontmatter.title)));
  assert.equal(masthead.includes('class="post-header-media"'), Boolean(post.frontmatter.cover_image));
  if (post.frontmatter.cover_image) {
    assert.ok(masthead.includes(`data-cover-fit="${post.frontmatter.cover_fit ?? "contain"}"`), `Article cover lost its fit policy: ${id}`);
    assert.ok(masthead.indexOf('class="post-meta"') < masthead.indexOf('class="post-header-media"'), "Cover must follow the full-width title and metadata");
    assert.ok(card.includes(`src="${post.frontmatter.cover_image}"`));
    assert.ok(existsSync(new URL(`dist${post.frontmatter.cover_image}`, root)));
  }
  const start = html.match(/<div class="post-body"[^>]*>/);
  const body = html.slice(start.index + start[0].length, html.lastIndexOf("</article>")).trim().replace(/<\/div>$/, "").trim();
  const expected = (await processor.render(post.content, { fileURL: post.file, frontmatter: post.frontmatter })).code;
  assert.equal(compact(body), compact(expected), `Layout must not change handwritten Markdown: ${id}`);
  const nav = html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.ok(/<a[^>]*aria-current="page"[^>]*href="\/"[^>]*>\s*Blog\s*<\/a>/.test(nav));
}

// Execute the built filter script against a small DOM-shaped fixture, without browser QA.
const filterScript = [...home.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes("archive-filter"));
assert.ok(filterScript, "Missing built archive filter script");
const element = dataset => {
  const attributes = new Map();
  const classes = new Set();
  const listeners = {};
  return {
    dataset, attributes, classes, listeners,
    classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
    toggleAttribute: (name, on) => on ? attributes.set(name, "") : attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
};
const archiveCards = cards.filter(card => !/class="[^"]*\bfeatured\b/.test(card)).map(card => element({ category: card.match(/data-category="([^"]+)"/)[1] }));
const filters = [...home.matchAll(/<button[^>]*data-filter="([^"]+)"/g)].map(match => element({ filter: match[1] }));
const grid = element({});
grid.querySelectorAll = () => archiveCards;
const empty = element({});
runInNewContext(filterScript, {
  document: {
    querySelectorAll: () => filters,
    querySelector: selector => selector === "[data-archive-grid]" ? grid : empty
  }
});
const checkFilter = category => {
  for (const card of archiveCards) {
    assert.equal(card.attributes.has("hidden"), category !== "all" && category !== card.dataset.category);
  }
  for (const filter of filters) {
    assert.equal(filter.attributes.get("aria-pressed"), String(filter.dataset.filter === category));
    assert.equal(filter.classes.has("active"), filter.dataset.filter === category);
  }
  const hasResults = archiveCards.some(card => !card.attributes.has("hidden"));
  assert.equal(empty.attributes.has("hidden"), hasResults);
  assert.equal(grid.attributes.has("hidden"), !hasResults);
};
checkFilter("all");
for (const filter of [...filters, filters[0]]) {
  filter.listeners.click();
  checkFilter(filter.dataset.filter);
}
// A future empty category must show the empty state; returning to All must recover.
const originalFilter = filters[0].dataset.filter;
filters[0].dataset.filter = "missing-test-category";
filters[0].listeners.click();
checkFilter("missing-test-category");
filters[0].dataset.filter = originalFilter;
filters[0].listeners.click();
checkFilter("all");

// Keep CSS display rules from overriding the native hidden attribute.
const cardSource = read("src/components/PostCard.astro");
const indexSource = read("src/pages/index.astro");
// A percentage-height frame in an auto-sized flex item lets source image dimensions
// change card geometry. Reserve the frame first, then crop a positioned image inside it.
const frameCSS = cardSource.match(/\.post-card-media-frame\s*\{([^}]+)\}/)[1];
const imageCSS = cardSource.match(/\.post-card-media img\s*\{([^}]+)\}/)[1];
assert.match(frameCSS, /position:\s*relative/);
assert.match(frameCSS, /aspect-ratio:\s*2 \/ 1\s*;/);
assert.ok(!/height:\s*100%/.test(frameCSS), "Frame height must not depend on an indefinite parent height");
assert.match(imageCSS, /position:\s*absolute/);
assert.match(imageCSS, /inset:\s*0/);
assert.match(imageCSS, /object-fit:\s*contain/, "Unmarked technical figures must preserve their information");
assert.match(cardSource, /\.post-card\.cover-image \.post-card-media img\s*\{\s*object-fit:\s*cover/, "Photos explicitly marked cover should still crop to fill the frame");
assert.ok(!cardSource.includes("flex-basis: 10rem"), "Archive diagrams must not be squeezed into small side thumbnails");
assert.match(cardSource, /\.featured \.post-card-media-frame\s*\{\s*aspect-ratio:\s*16 \/ 9/);
for (const card of cards) {
  if (!card.includes("<img")) continue;
  const featured = /class="[^"]*\bfeatured\b/.test(card);
  assert.ok(card.includes(`loading="${featured ? "eager" : "lazy"}"`), "Featured covers should load eagerly; archive covers may load lazily");
}
assert.match(cardSource, /\.post-card\[hidden\]\s*\{\s*display:\s*none/);
assert.match(indexSource, /\.archive-grid\[hidden\],\s*\.archive-empty\[hidden\]\s*\{\s*display:\s*none/);
assert.ok(!read("src/pages/blog/[...slug].astro").includes("1.25fr) 26rem"), "Fixed cover column must not squeeze article titles");
console.log(`Verified ${published.length} article cards, unchanged rendered bodies, cover/no-cover mastheads, Blog navigation and built category filters including empty/reset states.`);
