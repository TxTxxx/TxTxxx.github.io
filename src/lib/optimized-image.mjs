import sharp from "sharp";
import { readFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, extname } from "node:path";

// Astro bundles this module into dist during SSR; import.meta.url then moves.
const publicRoot = resolve(process.cwd(), "public");
const output = resolve(publicRoot, "images/generated");
const pending = new Map();

export async function optimizedImage(source) {
  if (typeof source !== "string" || !source.startsWith("/images/") || source.includes("?")) return null;
  let path;
  try { path = resolve(publicRoot, decodeURIComponent(source.slice(1))); } catch { return null; }
  if (!path.startsWith(`${publicRoot}/`) || !/\.(png|jpe?g|webp)$/i.test(path)) return null;
  let input;
  try { input = await readFile(path); } catch { return null; }
  // Content-based keys invalidate derivatives even when an author reuses a filename.
  const key = createHash("sha256").update("reading-v1").update(input).digest("hex").slice(0, 20);
  if (!pending.has(key)) pending.set(key, generate(input, key, extname(path).toLowerCase()));
  return pending.get(key);
}

async function generate(input, key, extension) {
  try {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) return null;
    const rotated = [5, 6, 7, 8].includes(metadata.orientation);
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    const widths = [...new Set([640, 960, 1600].map(size => Math.min(size, width)))];
    await mkdir(output, { recursive: true });
    const variants = [];
    for (const size of widths) {
      const name = `${key}-${size}.webp`;
      const destination = resolve(output, name);
      try { await access(destination); } catch {
        // PNG diagrams/screenshots use lossless encoding; photographs use high quality.
        await sharp(input).rotate().resize({ width: size, withoutEnlargement: true })
          .webp(extension === ".png" ? { lossless: true } : { quality: 88 })
          .toFile(destination);
      }
      variants.push(`/images/generated/${name} ${size}w`);
    }
    return { width, height, srcset: variants.join(", ") };
  } catch (error) {
    console.warn(`[images] Keeping original image: ${error.message}`);
    return null;
  }
}
