import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultRoot = process.env.RESEARCH_VAULT_PATH || path.join(os.homedir(), "Documents", "Obsidian Vault");
const outputPath = path.join(projectRoot, "src/data/researchGraph.json");

const sources = [
  { folder: "10 领域", type: "field" },
  { folder: "20 论文", type: "paper" },
  { folder: "30 概念", type: "concept" },
  { folder: "embodied intelligence", type: "fragment" }
];

const statusProgress = {
  inbox: 16,
  skimmed: 38,
  reading: 66,
  digested: 100,
  archived: 28
};

const paperOverrides = {
  blackP05VisionLanguageActionModel: {
    year: 2025,
    doi: "10.48550/arXiv.2504.16054",
    sourceUrl: "https://arxiv.org/abs/2504.16054"
  }
};

const normalizeRel = (value) => value.replaceAll(path.sep, "/").replace(/\.md$/i, "");
const stableId = (type, rel) => `${type}-${createHash("sha1").update(rel).digest("hex").slice(0, 10)}`;

function parseScalar(value) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean === "[]") return [];
  if (clean === "true") return true;
  if (clean === "false") return false;
  if (/^\d+$/.test(clean)) return Number(clean);
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    return clean.slice(1, -1);
  }
  return clean;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return {};
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return {};

  const lines = markdown.slice(4, end).split("\n");
  const data = {};
  let activeKey = null;
  let blockMode = false;

  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z_][\w-]*):(?:\s*(.*))?$/);
    if (keyMatch) {
      activeKey = keyMatch[1];
      const raw = keyMatch[2] ?? "";
      blockMode = raw === ">-" || raw === ">" || raw === "|" || raw === "|-";
      data[activeKey] = blockMode ? "" : parseScalar(raw);
      continue;
    }

    if (!activeKey) continue;
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && !blockMode) {
      if (!Array.isArray(data[activeKey])) data[activeKey] = [];
      data[activeKey].push(parseScalar(listMatch[1]));
      continue;
    }

    if (blockMode && /^\s+/.test(line)) {
      data[activeKey] = `${data[activeKey]} ${line.trim()}`.trim();
    }
  }

  return data;
}

function getTitle(markdown, fallback) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

function getWikiLinks(markdown) {
  return [...markdown.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1].split("|")[0].split("#")[0].trim())
    .filter(Boolean);
}

function getNoteDensity(markdown) {
  const filledBullets = markdown
    .split("\n")
    .filter((line) => /^-\s+/.test(line) && !/:\s*$/.test(line) && !/^-\s+\[[ xX]\]/.test(line)).length;
  const evidenceQuotes = markdown.split("\n").filter((line) => /^>\s+/.test(line)).length;
  return { filledBullets, evidenceQuotes };
}

function normalizeYear(value) {
  if (typeof value === "number" && value > 1900 && value < 2100) return value;
  if (typeof value !== "string" || value.includes("Error")) return null;
  const match = value.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function normalizeTopics(value, type) {
  const topics = Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  if (topics.length) return topics;
  if (type === "paper") return ["vla"];
  if (type === "fragment") return ["embodied-ai"];
  return [];
}

async function collectMarkdown(folder) {
  const absolute = path.join(vaultRoot, folder);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const entryPath = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMarkdown(path.join(folder, entry.name));
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

const rawNodes = [];

for (const source of sources) {
  const files = await collectMarkdown(source.folder);
  for (const absolutePath of files) {
    const markdown = await fs.readFile(absolutePath, "utf8");
    const relativePath = normalizeRel(path.relative(vaultRoot, absolutePath));
    const metadata = parseFrontmatter(markdown);
    const fallbackTitle = path.basename(absolutePath, ".md");
    const density = getNoteDensity(markdown);
    const citekey = typeof metadata.citekey === "string" ? metadata.citekey : "";
    const override = paperOverrides[citekey] || {};
    const status = typeof metadata.status === "string" && metadata.status ? metadata.status : source.type === "fragment" ? "legacy" : "developing";
    const progressBase = statusProgress[status] ?? (source.type === "fragment" ? 22 : 44);
    const maturity = Math.min(
      100,
      Math.round(progressBase + density.filledBullets * 1.7 + density.evidenceQuotes * 1.2 + (metadata.reading_level === "deep" ? 12 : 0))
    );

    rawNodes.push({
      id: stableId(source.type, relativePath),
      path: relativePath,
      title: getTitle(markdown, fallbackTitle),
      type: source.type,
      citekey,
      status,
      readingLevel: metadata.reading_level || "",
      paperRole: metadata.paper_role || "",
      year: override.year || normalizeYear(metadata.year),
      authors: typeof metadata.authors === "string" ? metadata.authors : Array.isArray(metadata.authors) ? metadata.authors.join(", ") : "",
      topics: normalizeTopics(metadata.topics, source.type),
      created: typeof metadata.created === "string" ? metadata.created : "",
      readDate: typeof metadata.read_date === "string" ? metadata.read_date : "",
      doi: override.doi || metadata.doi || "",
      sourceUrl: override.sourceUrl || metadata.source_url || "",
      zoteroUri: metadata.zotero || "",
      noteDensity: density.filledBullets,
      evidenceCount: density.evidenceQuotes,
      maturity,
      links: getWikiLinks(markdown)
    });
  }
}

const pathToId = new Map(rawNodes.map((node) => [node.path, node.id]));
const basenameToIds = new Map();

for (const node of rawNodes) {
  const basename = path.posix.basename(node.path);
  const ids = basenameToIds.get(basename) || [];
  ids.push(node.id);
  basenameToIds.set(basename, ids);
}

function resolveLink(link) {
  const normalized = normalizeRel(link).replace(/^\.\//, "");
  if (pathToId.has(normalized)) return pathToId.get(normalized);
  const basenameMatches = basenameToIds.get(path.posix.basename(normalized));
  return basenameMatches?.length === 1 ? basenameMatches[0] : null;
}

const edgeKeys = new Set();
const edges = [];

for (const node of rawNodes) {
  for (const link of node.links) {
    const target = resolveLink(link);
    if (!target || target === node.id) continue;
    const edgeKey = [node.id, target].sort().join("::");
    if (edgeKeys.has(edgeKey)) continue;
    edgeKeys.add(edgeKey);
    edges.push({ source: node.id, target, kind: "manual" });
  }
}

const nodes = rawNodes.map(({ links, ...node }) => node);
const papers = nodes.filter((node) => node.type === "paper");
const graph = {
  generatedAt: new Date().toISOString(),
  source: "Obsidian Vault · privacy-filtered metadata snapshot",
  stats: {
    nodes: nodes.length,
    papers: papers.length,
    concepts: nodes.filter((node) => node.type === "concept").length,
    fields: nodes.filter((node) => node.type === "field").length,
    fragments: nodes.filter((node) => node.type === "fragment").length,
    connections: edges.length,
    evidenceSignals: papers.reduce((sum, node) => sum + node.evidenceCount, 0)
  },
  nodes,
  edges
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
console.log(`Research graph: ${nodes.length} nodes, ${edges.length} connections → ${outputPath}`);
