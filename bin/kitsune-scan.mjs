#!/usr/bin/env node
// kitsune-scan — grade every repo in a GitHub org/user on the market-reception rubric.
//
//   kitsune-scan <owner> [--ai] [--include-private] [--out DIR] [--limit N] [--open]
//
// Requires the `gh` CLI, authenticated (`gh auth status`).
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { listRepos, fetchReadme, fetchRootTree, hasWorkflows } from "../src/github.mjs";
import { scoreRepo } from "../src/score.mjs";
import { refine, aiEnabled } from "../src/ai.mjs";
import { buildReport } from "../src/report.mjs";
import { SUBJECTIVE_APPLY } from "../src/report.mjs";

const args = process.argv.slice(2);
const owner = args.find(a => !a.startsWith("-"));
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

if (!owner) {
  console.error("usage: kitsune-scan <owner> [--ai] [--include-private] [--out DIR] [--limit N] [--open]");
  process.exit(1);
}

const useAI = flag("--ai");
const includePrivate = flag("--include-private");
const outDir = resolve(opt("--out", "./report"));
const limit = Number(opt("--limit", 500));

const CONCURRENCY = 6;
async function mapPool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

console.log(`\n  kitsune-repo-scanner  ·  scanning ${owner}${useAI ? "  [AI refine ON]" : ""}\n`);
if (useAI && !aiEnabled()) console.log("  ! --ai set but AZURE_FOUNDRY_KEY missing; using heuristics only\n");

let repos = await listRepos(owner, { limit });
if (!includePrivate) repos = repos.filter(r => !r.isPrivate);
console.log(`  ${repos.length} repos to grade\n`);

let done = 0;
const graded = await mapPool(repos, async (repo) => {
  const [readme, tree, ci] = await Promise.all([
    fetchReadme(owner, repo.name),
    fetchRootTree(owner, repo.name),
    hasWorkflows(owner, repo.name),
  ]);
  const result = scoreRepo(repo, readme, tree, ci);

  if (useAI && aiEnabled()) {
    const ai = await refine(repo, readme);
    if (ai) {
      if (ai.description) result.description = ai.description;
      if (ai.scores) SUBJECTIVE_APPLY(result, ai.scores);
      if (ai.slop_note) result.slopNote = ai.slop_note;
    }
  }

  done++;
  process.stdout.write(`\r  graded ${done}/${repos.length}  ${repo.name.padEnd(30).slice(0, 30)}`);
  return { repo, ...result };
});

graded.sort((a, b) => b.total - a.total);
process.stdout.write("\n\n");

await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const json = { owner, generated: new Date().toISOString(), count: graded.length, repos: graded };
await writeFile(resolve(outDir, "report.json"), JSON.stringify(json, null, 2));
const html = buildReport(json);
const htmlPath = resolve(outDir, "index.html");
await writeFile(htmlPath, html);

const avg = Math.round(graded.reduce((a, g) => a + g.total, 0) / graded.length);
const topSlop = [...graded].sort((a, b) => b.slopRisk - a.slopRisk)[0];
console.log(`  done. avg grade ${avg}/1000  ·  top pick: ${graded[0].repo.name} (${graded[0].grade})`);
console.log(`  highest slop risk: ${topSlop.repo.name} (${topSlop.slopRisk}/100)`);
console.log(`\n  report: ${htmlPath}\n`);

if (flag("--open")) {
  const { exec } = await import("node:child_process");
  const cmd = process.platform === "win32" ? `start "" "${htmlPath}"`
            : process.platform === "darwin" ? `open "${htmlPath}"` : `xdg-open "${htmlPath}"`;
  exec(cmd);
}
