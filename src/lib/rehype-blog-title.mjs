import { rehypeHeadingIds } from "@astrojs/markdown-remark";

const normalize = value => value.normalize("NFC").replace(/\s+/gu, " ").trim();
const inlineTags = new Set(["em", "strong", "a", "code", "del", "span"]);

function titleText(node) {
  if (node.type === "text") return node.value;
  // Do not discard images, raw HTML, or other non-text title content.
  if (node.type !== "element" || !inlineTags.has(node.tagName)) return null;
  return childrenText(node);
}

function childrenText(node) {
  const parts = node.children.map(titleText);
  return parts.includes(null) ? null : parts.join("");
}

const isEmpty = node => node.type === "comment"
  || (node.type === "text" && !node.value.trim())
  || (node.type === "raw" && /^(?:\s*<!--[\s\S]*?-->)+\s*$/.test(node.value));

// The article template already renders the frontmatter title. Keep the author's
// Markdown intact, merging only an identical opening H1 into an invisible anchor.
export default function rehypeBlogTitle() {
  const assignHeadingIds = rehypeHeadingIds();
  return (tree, file) => {
    if (!/(?:^|\/)src\/content\/blog\//.test(String(file.path ?? "").replace(/\\/g, "/"))) return;
    const title = file.data.astro?.frontmatter?.title;
    if (typeof title !== "string" || !normalize(title)) return;
    const heading = tree.children.find(node => !isEmpty(node));
    if (heading?.type !== "element" || heading.tagName !== "h1") return;
    const text = childrenText(heading);
    if (text === null || normalize(text) !== normalize(title)) return;

    // Assign IDs before removing the duplicate so existing links, including
    // repeated-heading suffixes, remain stable. Astro collects headings afterward.
    assignHeadingIds(tree, file);
    heading.tagName = "span";
    heading.properties = {
      ...heading.properties,
      className: ["post-title-anchor"],
      ariaHidden: "true"
    };
    heading.children = [];
  };
}
