import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = name => readFileSync(path.join(root, name), "utf8");
const graph = JSON.parse(read("src/data/researchGraph.json"));
const atlas = read("dist/atlas/index.html");
const exported = JSON.parse(atlas.match(/<script[^>]*id="atlas-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
const personal = exported.nodes.filter(node => node.fieldMode === "personal");
assert.equal(personal.length, graph.nodes.filter(node => node.type === "paper").length);
// Preserve the integration contract, including intentionally blank map labels.
const fieldMap = { title: "title", status: "status", readingLevel: "readingLevel", sourceUrl: "sourceUrl", zoteroUri: "zoteroUri", atlasLabel: "atlasLabel", cardHtml: "atlasCardHtml", cardImageCount: "atlasCardImages", year: "year", maturity: "maturity" };
for (const node of personal) {
  const source = graph.nodes.find(item => item.id === node.id);
  assert.ok(source, `Unknown personal node: ${node.id}`);
  for (const [outputKey, sourceKey] of Object.entries(fieldMap)) {
    assert.deepEqual(node[outputKey], source[sourceKey], `${node.id}: changed ${sourceKey}`);
  }
}
assert.ok(atlas.includes('data-field-mode="personal"'));
assert.ok(!/data-atlas-search|data-view-mode|data-results/.test(atlas), "Atlas should remain a single constellation view");

const radar = read("dist/papers/index.html");
assert.ok(!radar.includes("今日更新"));
assert.ok(radar.includes('class="edition-hero"'), "Radar should show the full latest edition");
assert.ok(radar.includes('class="archive-strip"'), "Date archive navigation must remain available");
assert.ok(radar.includes('class="best-first"'));
assert.ok(!radar.includes('class="month"') && !radar.includes('class="paper-row"'), "Compact monthly list should not replace the edition");
assert.ok(radar.includes('rel="canonical" href="https://txtxx.me/papers/"'));
const publishedEditions = [];
for (const filename of readdirSync(path.join(root, "src/content/paper-radar"))) {
  if (!filename.endsWith(".md")) continue;
  const source = read(`src/content/paper-radar/${filename}`);
  if (/^draft:\s*true\s*$/m.test(source.split("---")[1] || "")) continue;
  const slug = filename.replace(/\.md$/, "");
  const html = read(`dist/papers/${slug}/index.html`);
  assert.ok(html.includes(`rel="canonical" href="https://txtxx.me/papers/${slug}/"`), `Wrong canonical: ${slug}`);
  const legacyCount = [...source.matchAll(/<section class="paper-brief/g)].length;
  if (legacyCount) assert.equal([...html.matchAll(/<section class="paper-brief/g)].length, legacyCount, `Missing or duplicated full paper cards: ${slug}`);
  assert.ok(!html.includes('class="original-edition"'), `Daily content should be visible, not collapsed: ${slug}`);
  assert.ok(html.includes('class="edition-hero"') && html.includes('class="archive-strip"'), `Missing original edition layout: ${slug}`);
  const date = source.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
  publishedEditions.push({ slug, date, legacyCount });
  assert.ok(radar.includes(date), `Missing date archive entry: ${slug}`);
}
const latest = publishedEditions.sort((a, b) => b.date.localeCompare(a.date))[0];
assert.ok(radar.includes(`<time datetime="${latest.date}"`), "Index must display the newest published edition");
if (latest.legacyCount) assert.equal([...radar.matchAll(/<section class="paper-brief/g)].length, latest.legacyCount);

const guides = readdirSync(path.join(root, "src/content/paper-deep-dives")).filter(filename =>
  filename.endsWith(".md") && !/^draft:\s*true\s*$/m.test(read(`src/content/paper-deep-dives/${filename}`).split("---")[1] || "")
);
for (const filename of guides) {
  const slug = filename.replace(/\.md$/, "");
  const html = read(`dist/papers/deep-dive/${slug}/index.html`);
  const nav = html.match(/<nav[^>]*aria-label="主推导读目录"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || "";
  assert.ok(nav, `Missing guide navigation: ${slug}`);
  for (const [, id] of nav.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `Broken anchor: ${slug}#${id}`);
  for (const [, src] of html.matchAll(/<img[^>]+src="(\/[^"?#]+)"/g)) assert.ok(existsSync(path.join(root, "dist", src)), `Missing image: ${src}`);
}
for (const html of [radar, read("dist/index.html"), read("dist/about/index.html")]) {
  assert.ok(!html.includes('href="#"'), "Placeholder link remains on a primary page");
  for (const [, href] of html.matchAll(/href="(\/(?!\/)[^"?#]*)"/g)) {
    const target = path.join(root, "dist", href.endsWith("/") || !path.extname(href) ? `${href}/index.html` : href);
    assert.ok(existsSync(target), `Missing internal destination: ${href}`);
  }
}
// Samples may be rendered locally, but must never leak through an ordinary build.
const previewEdition = "dist/papers/2026-09-07-preview/index.html";
const previewGuide = "dist/papers/deep-dive/2026-09-07-co-training-preview/index.html";
if (process.env.PAPER_RADAR_PREVIEW === "1") {
  const sample = read(previewGuide);
  assert.ok(read(previewEdition).includes("图文样稿"));
  assert.equal([...sample.matchAll(/<figure class="paper-figure"/g)].length, 3);
  assert.equal([...sample.matchAll(/<img /g)].length, 3);
  for (const [, src] of sample.matchAll(/<img[^>]+src="(\/[^"?#]+)"/g)) assert.ok(existsSync(path.join(root, "dist", src)), `Missing sample image: ${src}`);
} else {
  assert.ok(!existsSync(path.join(root, previewEdition)) && !existsSync(path.join(root, previewGuide)), "Preview route leaked into ordinary build");
  assert.ok(!readdirSync(path.join(root, "dist/_astro")).some(name => /data-model-evaluation-figure-1|modality-ablation-figure-4|latent-action-data-scale-figure-8/.test(name)), "Preview image leaked into ordinary build");
}
assert.ok(!radar.includes("2026-09-07-preview"), "Draft sample must not appear in the public index");
console.log(`Verified ${personal.length} Obsidian papers, all Radar archives, ${guides.length} guide directories, images, primary links and sample publication boundaries.`);
