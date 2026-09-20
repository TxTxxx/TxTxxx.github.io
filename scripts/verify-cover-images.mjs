import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const root = new URL("../dist/", import.meta.url);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".html") ? [path] : [];
  });
}
let images = 0;
for (const path of [new URL("index.html", root), ...files(new URL("blog/", root))]) {
  const html = readFileSync(path, "utf8");
  for (const match of html.matchAll(/<img\b[^>]*srcset="([^"]*\/images\/generated\/[^\"]+)"[^>]*>/g)) {
    images++;
    for (const item of match[1].split(",")) {
      const resource = item.trim().split(/\s+/)[0];
      assert.ok(existsSync(new URL(resource.slice(1), root)), `Missing published image: ${resource}`);
    }
  }
}
assert.ok(images > 40, "Expected covers and body images, not only featured covers");
console.log(`Verified ${images} responsive images and all generated files in the published output.`);
