import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createMarkdownProcessor, parseFrontmatter } from "@astrojs/markdown-remark";
import config from "../astro.config.mjs";
import rehypeBlogTitle from "../src/lib/rehype-blog-title.mjs";

const root = new URL("../", import.meta.url);
const processor = await createMarkdownProcessor(config.markdown);
const baseline = await createMarkdownProcessor({
  ...config.markdown,
  rehypePlugins: config.markdown.rehypePlugins.filter(plugin => plugin !== rehypeBlogTitle)
});
const options = {
  fileURL: new URL("src/content/blog/test.md", root),
  frontmatter: { title: "Flow Matching 原理" }
};
const anchorFor = id => `<span id="${id}" class="post-title-anchor" aria-hidden="true"></span>`;
const duplicate = /^([\s\S]*?)<h1 id="([^"]*)">[\s\S]*?<\/h1>/;

for (const content of [
  "# Flow Matching 原理\n\nOriginal paragraph.\n\n## Next section",
  "<!-- Author comment -->\n\n# **Flow Matching** 原理\n\nOriginal paragraph.",
  "# Flow `Matching` 原理\n\n## Flow Matching 原理\n\n# Flow Matching 原理\n\n[Original anchor](#flow-matching-原理-1)",
  "# Flow   Matching 原理\n\n> Quoted text.\n\n```python\n# Flow Matching 原理\n```"
]) {
  const before = await baseline.render(content, options);
  const after = await processor.render(content, options);
  const expected = before.code.replace(duplicate, (_, prefix, id) => prefix + anchorFor(id));
  assert.notEqual(expected, before.code, "Fixture must have a duplicate heading");
  assert.equal(after.code, expected, "Only the duplicate title should change");
  assert.deepEqual(after.metadata.headings, before.metadata.headings.slice(1), "Section anchors must stay unchanged");
}

for (const [content, renderOptions = options] of [
  ["# A different title\n\nBody."],
  ["## Flow Matching 原理\n\nBody."],
  ["Introduction.\n\n# Flow Matching 原理"],
  ["> # Flow Matching 原理"],
  ["```markdown\n# Flow Matching 原理\n```"],
  ["# Flow Matching 原理 ![Diagram](/images/diagram.png)"],
  ["# Flow Matching 原理\n\nBody.", { ...options, frontmatter: {} }],
  ["# Flow Matching 原理\n\nBody.", { ...options, fileURL: new URL("src/content/paper-radar/test.md", root) }]
]) {
  const before = await baseline.render(content, renderOptions);
  const after = await processor.render(content, renderOptions);
  assert.equal(after.code, before.code, "Nonduplicate content must remain untouched");
  assert.deepEqual(after.metadata.headings, before.metadata.headings);
}

const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
  return entry.isDirectory() ? files(child) : entry.name.endsWith(".md") ? [child] : [];
});
let count = 0;
let merged = 0;
for (const file of files(new URL("src/content/blog/", root))) {
  const { frontmatter, content } = parseFrontmatter(readFileSync(file, "utf8"));
  if (frontmatter.draft) continue;
  const before = await baseline.render(content, { fileURL: file, frontmatter });
  const after = await processor.render(content, { fileURL: file, frontmatter });
  if (after.code !== before.code) {
    assert.equal(after.code, before.code.replace(duplicate, (_, prefix, id) => prefix + anchorFor(id)), "Other article content must not change");
    assert.deepEqual(after.metadata.headings, before.metadata.headings.slice(1));
    merged++;
  }
  const id = decodeURIComponent(file.pathname.split("/src/content/blog/")[1]).replace(/\.md$/, "");
  const html = readFileSync(new URL(`dist/blog/${id}/index.html`, root), "utf8");
  assert.equal((html.match(/<h1(?:\s|>)/g) ?? []).length, 1, `Expected one article title: ${id}`);
  count++;
}
console.log(`Verified ${count} published articles have one H1; ${merged} duplicate titles merged with original anchors and all other content preserved.`);
