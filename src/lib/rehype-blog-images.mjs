import rehypeRaw from "rehype-raw";
import { optimizedImage } from "./optimized-image.mjs";

export default function rehypeBlogImages() {
  const parseRaw = rehypeRaw();
  return async (tree, file) => {
    if (!/(?:^|\/)src\/content\/blog\//.test(String(file.path ?? "").replace(/\\/g, "/"))) return;
    // Include handwritten HTML figures as well as Markdown images.
    const parsed = parseRaw(tree, file);
    async function visit(parent, insideLink = false) {
      for (let index = 0; index < (parent.children?.length ?? 0); index++) {
        const node = parent.children[index];
        if (node.type === "element" && node.tagName === "img") {
          const props = node.properties;
          const image = await optimizedImage(props.src);
          if (!image || props.srcSet) continue;
          Object.assign(props, {
            srcSet: image.srcset, sizes: "(max-width: 800px) calc(100vw - 32px), 736px",
            width: props.width ?? image.width, height: props.height ?? image.height,
            loading: props.loading ?? "lazy", decoding: "async"
          });
          if (!insideLink) parent.children[index] = {
            type: "element", tagName: "a",
            properties: { href: props.src, target: "_blank", rel: ["noopener"], title: "查看原图（新标签页）" },
            children: [node]
          };
        } else await visit(node, insideLink || node.tagName === "a");
      }
    }
    await visit(parsed);
    return parsed;
  };
}
