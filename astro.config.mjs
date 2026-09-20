import { defineConfig } from "astro/config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkAddenda from "./src/lib/remark-addenda.mjs";
import rehypeBlogTitle from "./src/lib/rehype-blog-title.mjs";
import rehypeBlogImages from "./src/lib/rehype-blog-images.mjs";
import { imageRevision } from "./src/lib/image-revision.mjs";
import { cp, access } from "node:fs/promises";

export default defineConfig({
  site: "https://txtxx.me",
  output: "static",
  integrations: [{
    name: "blog-image-assets",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        // Cover derivatives can be created during page rendering, after Astro's
        // initial public-directory copy. Include them in the final artifact.
        const generated = new URL("./public/images/generated/", import.meta.url);
        try { await access(generated); } catch { return; }
        await cp(generated, new URL("images/generated/", dir), { recursive: true });
      }
    }
  }],
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false
    },
    remarkPlugins: [remarkMath, remarkAddenda],
    rehypePlugins: [rehypeKatex, rehypeBlogTitle, [rehypeBlogImages, { revision: imageRevision() }]]
  }
});
