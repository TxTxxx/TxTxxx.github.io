import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMarkdownProcessor, parseFrontmatter } from "@astrojs/markdown-remark";
import config from "../astro.config.mjs";
import remarkAddenda from "../src/lib/remark-addenda.mjs";

const root = new URL("../", import.meta.url);
const read = name => readFileSync(new URL(name, root), "utf8");
const blogURL = new URL("src/content/blog/blog/authoring-test.md", root);
const processor = await createMarkdownProcessor(config.markdown);
const render = async (text, fileURL = blogURL) => (await processor.render(text, { fileURL })).code;

const fixture = [
  "原文保持不变。", "",
  "> [!update] 2026-09-07",
  "> 手写补充 **强调**，公式 $x^2$ 和 [链接](/about/)。",
  ">", "> - 第一条", "> - 第二条",
  ">", "> ![图的说明](/images/example.svg)",
  ">", "> ```js", "> const value = 1;", "> ```", "",
  "> [!update] 2026-09-08", "> 另一条补记。"
].join("\n");
const html = await render(fixture);
assert.equal((html.match(/<aside\b/g) || []).length, 2);
assert.ok(html.startsWith("<p>原文保持不变。</p>"));
assert.ok(html.includes('class="post-addendum"'));
assert.ok(html.includes('aria-label="补记，2026-09-07"'));
assert.ok(html.includes('<time datetime="2026-09-07">2026-09-07</time>'));
assert.ok(html.includes('<header class="addendum-header"><span>补记</span>'));
assert.ok(html.includes("<strong>强调</strong>") && html.includes('class="katex"'));
assert.ok(html.includes("<ul>") && html.includes('href="/about/"'));
assert.ok(html.includes('alt="图的说明"') && html.includes('class="astro-code'));
assert.ok(html.indexOf("2026-09-07") < html.indexOf("2026-09-08"));
assert.ok(!html.includes("[!update]"));
assert.ok((await render("> [!update] 2024-02-29\n> 闰日补记。")).includes("<aside"));
// Astro logs parse failures before rejecting; keep expected negative cases quiet.
const originalError = console.error;
try {
  console.error = () => {};
  for (const marker of ["2026-02-30", "2026-13-01", "昨天", ""]) {
    await assert.rejects(() => render(`> [!update] ${marker}\n> 补充。`), /补记首行/);
  }
  await assert.rejects(() => render("> [!update] 2026-09-07"), /填写你自己的补充内容/);
} finally {
  console.error = originalError;
}
assert.ok(!(await render("```markdown\n> [!update] 2026-09-07\n> 只是代码示例。\n```")).includes("<aside"));
const radarURL = new URL("src/content/paper-radar/authoring-test.md", root);
assert.ok(!(await render(fixture, radarURL)).includes("<aside"));

// Existing writing without the explicit marker must render exactly as before.
const baseline = await createMarkdownProcessor({
  ...config.markdown,
  remarkPlugins: config.markdown.remarkPlugins.filter(plugin => plugin !== remarkAddenda)
});
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
  return entry.isDirectory() ? files(child) : entry.name.endsWith(".md") ? [child] : [];
});
let unchanged = 0;
for (const fileURL of files(new URL("src/content/blog/", root))) {
  const source = parseFrontmatter(readFileSync(fileURL, "utf8")).content;
  if (/^>\s*\[!update\]/im.test(source)) continue;
  const previous = (await baseline.render(source, { fileURL })).code;
  assert.ok(await render(source, fileURL) === previous, `Unexpected prose change: ${fileURLToPath(fileURL)}`);
  unchanged++;
}

const now = parseFrontmatter(read("src/content/now.md"));
const home = read("dist/index.html");
const shouldShow = now.frontmatter.draft === false && Boolean(now.content.replace(/<!--[\s\S]*?-->/g, "").trim());
assert.equal(home.includes("data-now-note"), shouldShow, "Only explicitly published, nonempty Now content is visible");
if (shouldShow) {
  assert.ok(home.includes('id="now-heading"'));
  const body = await render(now.content, new URL("src/content/now.md", root));
  const compact = value => value.replace(/>\s+</g, "><").trim();
  assert.ok(compact(home).includes(compact(body)), "Now text must match the author's Markdown");
}
assert.ok(!existsSync(new URL("dist/now/index.html", root)), "Now is a homepage note, not an extra route");
console.log(`Verified handwritten addenda, dates, rich Markdown, scope, ${unchanged} unchanged articles and the homepage Now note.`);
