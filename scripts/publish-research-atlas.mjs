import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graphPath = "src/data/researchGraph.json";
const imagePath = "public/images/atlas-cards";
const publishPaths = [graphPath, ...(existsSync(path.join(projectRoot, imagePath)) ? [imagePath] : [])];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: options.encoding,
    stdio: options.stdio ?? (options.encoding ? ["ignore", "pipe", "pipe"] : "inherit"),
    env: process.env
  });
}

run(process.execPath, ["scripts/export-research-vault.mjs"]);
run("/opt/homebrew/bin/npm", ["run", "build"]);
run("git", ["add", "-A", "--", ...publishPaths]);

const stagedFiles = run("git", ["diff", "--cached", "--name-only", "--", ...publishPaths], { encoding: "utf8" }).trim();
if (stagedFiles) {
  const timestamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  run("git", ["commit", "--only", "-m", `Update research atlas ${timestamp}`, "--", ...publishPaths]);
}

let ahead = 0;
try {
  ahead = Number(run("git", ["rev-list", "--count", "@{upstream}..HEAD"], { encoding: "utf8" }).trim());
} catch {
  ahead = 1;
}

if (ahead > 0) {
  run("git", ["push", "origin", "main"]);
  console.log("ATLAS_PUBLISHED");
} else {
  console.log("ATLAS_NO_CHANGES");
}
