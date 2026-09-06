import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { Color } from "three";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(`${root}${path}`, "utf8");
const head = read("src/components/ThemeHead.astro");
const script = head.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const key = "txtxx-theme";

// Execute the actual head script with browser primitives mocked, without browser UI QA.
function page({ dark = false, storage = new Map(), blocked = false } = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const mediaListeners = new Map();
  const changes = [];
  let ready = false;
  class Element {
    attributes = new Map();
    setAttribute(name, value) { this.attributes.set(name, value); }
    closest() { return this.isToggle ? button : null; }
  }
  const button = new Element();
  button.isToggle = true;
  const icon = new Element();
  icon.isToggle = true;
  const meta = new Element();
  const document = {
    documentElement: { dataset: {} },
    querySelector: () => meta,
    querySelectorAll: () => ready ? [button] : [],
    addEventListener: (type, fn) => documentListeners.set(type, fn),
    dispatchEvent: event => changes.push(event.detail.theme)
  };
  const media = {
    matches: dark,
    addEventListener: (type, fn) => mediaListeners.set(type, fn)
  };
  const localStorage = {
    getItem: name => { if (blocked) throw new Error("Storage unavailable"); return storage.get(name); },
    setItem: (name, value) => { if (blocked) throw new Error("Storage unavailable"); storage.set(name, value); }
  };
  vm.runInNewContext(script, {
    document, Element, localStorage,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    window: { matchMedia: () => media, addEventListener: (type, fn) => windowListeners.set(type, fn) }
  });
  // The preference is applied before body content becomes available.
  assert.ok(["light", "dark"].includes(document.documentElement.dataset.theme));
  ready = true;
  documentListeners.get("DOMContentLoaded")();
  return {
    get theme() { return document.documentElement.dataset.theme; },
    get label() { return button.attributes.get("aria-label"); },
    get meta() { return meta.attributes.get("content"); },
    changes,
    click: () => documentListeners.get("click")({ target: icon }),
    clickOutside: () => documentListeners.get("click")({ target: new Element() }),
    system: value => { media.matches = value; mediaListeners.get("change")(); },
    storageEvent: (eventKey, newValue) => windowListeners.get("storage")({ key: eventKey, newValue })
  };
}

const storage = new Map();
const first = page({ storage });
assert.equal(first.theme, "light");
assert.equal(first.label, "切换至深色模式");
first.system(true);
assert.equal(first.theme, "dark");
assert.equal(first.meta, "#171b20");
assert.equal(first.label, "切换至浅色模式");
first.clickOutside();
assert.equal(first.theme, "dark");
first.click();
assert.equal(first.theme, "light");
assert.equal(storage.get(key), "light");
first.system(true);
assert.equal(first.theme, "light", "Explicit preference must override system changes");
assert.equal(page({ storage, dark: true }).theme, "light", "Preference survives reload and navigation");
first.storageEvent("unrelated", "dark");
assert.equal(first.theme, "light");
first.storageEvent(key, "dark");
assert.equal(first.theme, "dark", "Tabs share theme changes");
first.system(false);
first.storageEvent(null, null);
assert.equal(first.theme, "light", "Cleared storage restores system preference");
const invalid = page({ dark: true, storage: new Map([[key, "invalid"]]) });
assert.equal(invalid.theme, "dark");
invalid.system(false);
assert.equal(invalid.theme, "light");
const unavailable = page({ dark: true, blocked: true });
unavailable.click();
assert.equal(unavailable.theme, "light", "Storage restrictions must not break switching");
assert.deepEqual(unavailable.changes, ["dark", "light"]);

const themeCSS = read("src/styles/theme.css");
const palettes = [...themeCSS.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/g)]
  .map(match => new Map([...match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(item => [item[1], item[2]])));
assert.equal(palettes.length, 2);
assert.deepEqual([...palettes[0].keys()], [...palettes[1].keys()], "Both themes define the same tokens");

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).slice(0, 3).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
for (const palette of palettes) {
  const textTokens = ["--text", "--muted", "--accent", "--atlas-ink", "--atlas-muted",
    ...["vla", "world", "action", "reasoning", "data", "evaluation"].map(field => `--atlas-${field}`)];
  for (const token of textTokens) {
    const foreground = luminance(palette.get(token));
    const background = luminance(palette.get(token.startsWith("--atlas-") ? "--atlas-bg" : "--bg"));
    const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    assert.ok(contrast >= 4.5, `${token}: text contrast ${contrast.toFixed(2)} must meet 4.5:1`);
  }
}

const atlasSource = read("src/pages/atlas/index.astro");
const atlasHTML = read("dist/atlas/index.html");
const data = JSON.parse(atlasHTML.match(/<script[^>]*id="atlas-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
const originalData = JSON.stringify(data);
const themeStart = atlasSource.indexOf("const applyAtlasTheme = () => {");
const themeEnd = atlasSource.indexOf("const paperLabelElements", themeStart);
assert.ok(themeStart > 0 && themeEnd > themeStart);
const colorMaterial = () => ({ material: { color: new Color(), opacity: 0.37 } });
const sprites = data.nodes.map(node => ({
  ...colorMaterial(),
  userData: { ...node, labelSprite: colorMaterial(), ring: colorMaterial(), fieldRing: colorMaterial() }
}));
const selected = data.nodes.find(node => node.kind === "personal").id;
const scene = { fog: { color: new Color() } };
const highlightedLines = colorMaterial();
const edgeFields = new Map([["personal", colorMaterial()], ["demo", colorMaterial()]]);
const context = {
  data, sprites, selected, scene, highlightedLines, edgeFields,
  colorByCluster: new Map(),
  dataById: new Map(data.nodes.map(node => [node.id, node])),
  document: { documentElement: {} },
  renderer: { setClearColor(color, alpha) { assert.ok(color); assert.equal(alpha, 0); } }
};
for (const palette of palettes) {
  vm.runInNewContext(`${atlasSource.slice(themeStart, themeEnd)}\napplyAtlasTheme();`, {
    ...context,
    getComputedStyle: () => ({ getPropertyValue: name => palette.get(name) })
  });
  for (const sprite of sprites) {
    assert.equal(sprite.material.color.getHexString(), new Color(palette.get(`--atlas-${sprite.userData.cluster}`)).getHexString());
    assert.equal(sprite.material.opacity, 0.37, "Theme changes do not alter visibility or selection");
    assert.equal(sprite.userData.ring.material.color.getHexString(), sprite.material.color.getHexString());
  }
  assert.equal(JSON.stringify(data), originalData, "Theme updates must not mutate exported Atlas data");
  assert.equal(scene.fog.color.getHexString(), new Color(palette.get("--atlas-bg")).getHexString());
  assert.equal(highlightedLines.material.color.getHexString(), context.colorByCluster.get(context.dataById.get(selected).cluster).slice(1));
}

function htmlFiles(directory) {
  return readdirSync(`${root}${directory}`, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}
let pages = 0;
let highlightedPages = 0;
for (const path of htmlFiles("dist")) {
  const html = read(path);
  if (/<meta[^>]+http-equiv="refresh"/i.test(html)) continue;
  pages++;
  assert.equal((html.match(/<button\b[^>]*data-theme-toggle/g) || []).length, 1, `${path}: one accessible theme control`);
  const preferenceStart = html.indexOf("const key = \"txtxx-theme\"");
  assert.ok(preferenceStart >= 0 && preferenceStart < html.indexOf("<body"), `${path}: initialize preference before paint`);
  assert.equal((html.match(/<meta\b[^>]*name="theme-color"/g) || []).length, 1, `${path}: one browser theme-color meta`);
  if (html.includes('class="astro-code')) {
    highlightedPages++;
    assert.ok(html.includes("--shiki-light:"), `${path}: light syntax tokens`);
    assert.ok(html.includes("--shiki-dark:"), `${path}: dark syntax tokens`);
  }
}
assert.ok(pages > 30);
assert.ok(highlightedPages > 0);
console.log(`Verified theme preference behavior, Atlas materials/data preservation, ${pages} pages and ${highlightedPages} syntax-highlighted pages.`);
