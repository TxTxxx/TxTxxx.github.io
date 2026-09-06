import { defineConfig } from "astro/config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export default defineConfig({
  site: "https://txtxx.me",
  output: "static",
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false
    },
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex]
  }
});
