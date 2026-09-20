import { readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

// Astro caches rendered Markdown. Invalidate it when local images change or
// generated assets disappear, not only when the Markdown itself changes.
export function imageRevision() {
  const hash = createHash("sha256");
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) scan(path);
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) {
        const stat = statSync(path);
        hash.update(`${path.pathname}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  }
  scan(new URL("../../public/images/", import.meta.url));
  return hash.digest("hex");
}
