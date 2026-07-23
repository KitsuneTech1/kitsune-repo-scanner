#!/usr/bin/env node
// Minimal MCP stdio server exposing the scanner as tools, so any MCP client
// (Claude Code, Cursor, etc.) can grade an org, audit a repo for exposure, or
// find the best thing to post, on demand.
//
// Tools:
//   scan_org({ owner, includePrivate?, ai? })   -> ranked per-repo grades + hygiene (JSON)
//   score_repo({ owner, name, ai? })             -> single-repo grade + hygiene (JSON)
//   audit_repo({ owner, name })                  -> exposure audit: leaked secrets, PII, junk, OSS readiness
//   best_to_post({ owner, top?, includePrivate?})-> repos ranked by Reddit/post-first weighting
//
// No SDK dependency: implements the JSON-RPC 2.0 / MCP handshake over stdio directly.
// GitHub access is via the `gh` CLI (must be authenticated). Owner-specific PII
// patterns are read from the SCAN_PII env var (comma-separated), never hardcoded.
import { listRepos, fetchReadme, fetchRootTree, hasWorkflows, fetchFullTree, fetchFileText } from "../src/github.mjs";
import { scoreRepo } from "../src/score.mjs";
import { pickScanTargets, scanContents } from "../src/hygiene.mjs";
import { refine, aiEnabled } from "../src/ai.mjs";
import { SUBJECTIVE_APPLY } from "../src/report.mjs";
import { CATEGORIES } from "../src/rubric.mjs";
import { auditLocalRepo } from "../src/local.mjs";

// "Post first" / Reddit weighting: hook, public sentiment, shareability and
// virality dominate; code substance barely counts. Same weights as the report's
// Best-to-post preset, in CATEGORIES id order.
const POST_WEIGHTS = [10,10,10,10,10, 10,10,10,10,10, 3,3,4,4,5,4, 3,3,2,3, 1,2,2,1,2, 8,3,6,3,2];
function postScore(scores) {
  let s = 0, tw = 0;
  CATEGORIES.forEach((c, i) => { s += (scores[c.id] ?? 0) * POST_WEIGHTS[i]; tw += POST_WEIGHTS[i]; });
  return Math.round((s / tw) * 100);
}

const TOOLS = [
  {
    name: "scan_org",
    description: "Grade every repo in a GitHub org/user on the Kitsune market-reception rubric (30 categories, 0-1000, F to S++++, AI-slop risk) plus a hygiene/exposure scan. Returns ranked JSON.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub org or username" },
        includePrivate: { type: "boolean", description: "include private repos (default false)" },
        ai: { type: "boolean", description: "refine subjective axes with the LLM (needs AZURE_FOUNDRY_KEY)" },
      },
      required: ["owner"],
    },
  },
  {
    name: "score_repo",
    description: "Grade a single GitHub repo (owner/name) on the market-reception rubric. Returns the 30-category breakdown, grade, description, AI-slop risk, and hygiene flags.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" }, name: { type: "string" },
        ai: { type: "boolean" },
      },
      required: ["owner", "name"],
    },
  },
  {
    name: "audit_repo",
    description: "Security/hygiene audit of one GitHub repo or an explicitly allowlisted local Git root before open-sourcing. Scans tracked files for leaked credentials, API keys, private LAN IPs, committed .env/key files, and build junk. Returns findings, exposure verdict, and OSS-readiness.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        repoPath: {
          type: "string",
          minLength: 1,
          description: "Absolute local Git root under REPO_SCANNER_LOCAL_ROOTS. Only tracked files are scanned.",
        },
      },
      oneOf: [
        {
          required: ["owner", "name"],
          not: { required: ["repoPath"] },
        },
        {
          required: ["repoPath"],
          not: {
            anyOf: [
              { required: ["owner"] },
              { required: ["name"] },
            ],
          },
        },
      ],
      additionalProperties: false,
    },
  },
  {
    name: "best_to_post",
    description: "Rank an org's repos by how well they would do posted to Reddit/HN right now (hook, shareability, public sentiment weighted up, code substance down). Defaults to public, OSS-safe repos only. Good for deciding what to promote.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub org or username" },
        top: { type: "number", description: "how many to return (default 10)" },
        includePrivate: { type: "boolean", description: "include private + non-OSS-safe repos (default false)" },
      },
      required: ["owner"],
    },
  },
];

// Fetch everything the scorer needs for one repo, including the bounded content
// scan that powers the hygiene/exposure checks.
async function analyze(owner, repo, useAI) {
  const [readme, tree, ci, full] = await Promise.all([
    fetchReadme(owner, repo.name), fetchRootTree(owner, repo.name),
    hasWorkflows(owner, repo.name), fetchFullTree(owner, repo.name),
  ]);
  const targets = pickScanTargets(full);
  const fileTexts = {};
  await Promise.all(targets.map(async p => { fileTexts[p] = await fetchFileText(owner, repo.name, p); }));
  const contentFlags = scanContents(fileTexts);
  const r = scoreRepo(repo, readme, tree, ci, full, contentFlags);
  if (useAI && aiEnabled()) {
    const ai = await refine(repo, readme);
    if (ai) { if (ai.description) r.description = ai.description; if (ai.scores) SUBJECTIVE_APPLY(r, ai.scores); }
  }
  return r;
}

function gradeSummary(repo, r) {
  return {
    name: repo.name, url: repo.url, private: repo.isPrivate,
    grade: r.grade, score: r.total, postScore: postScore(r.scores),
    slopRisk: r.slopRisk, ossReadiness: r.legal.oss,
    description: r.description,
    exposure: r.hygiene?.exposed || false,
    hygieneFlags: r.hygiene?.flags || [],
    strengths: r.strengths, weaknesses: r.weaknesses,
  };
}

async function callTool(name, args) {
  if (name === "scan_org") {
    let repos = await listRepos(args.owner, { limit: 500 });
    if (!args.includePrivate) repos = repos.filter(r => !r.isPrivate);
    const graded = [];
    for (const repo of repos) graded.push(gradeSummary(repo, await analyze(args.owner, repo, args.ai)));
    graded.sort((a, b) => b.score - a.score);
    const avg = Math.round(graded.reduce((a, g) => a + g.score, 0) / (graded.length || 1));
    const exposed = graded.filter(g => g.exposure).map(g => g.name);
    return { owner: args.owner, count: graded.length, avgScore: avg, exposedRepos: exposed, repos: graded };
  }
  if (name === "score_repo") {
    const [repo] = (await listRepos(args.owner, { limit: 500 })).filter(r => r.name === args.name);
    if (!repo) throw new Error(`repo not found: ${args.owner}/${args.name}`);
    const r = await analyze(args.owner, repo, args.ai);
    return { ...gradeSummary(repo, r), scores: r.scores };
  }
  if (name === "audit_repo") {
    if (args.repoPath !== undefined) {
      if (args.owner !== undefined || args.name !== undefined) {
        throw new Error("audit_repo accepts either owner/name or repoPath, not both");
      }
      return auditLocalRepo(args.repoPath);
    }
    if (!args.owner || !args.name) {
      throw new Error("audit_repo requires owner/name or repoPath");
    }
    const [repo] = (await listRepos(args.owner, { limit: 500 })).filter(r => r.name === args.name);
    if (!repo) throw new Error(`repo not found: ${args.owner}/${args.name}`);
    const r = await analyze(args.owner, repo, false);
    const flags = r.hygiene?.flags || [];
    const serious = flags.filter(f => /credential|private key|key format|authorization|env.key|PII|LAN IP/i.test(f));
    return {
      repo: `${args.owner}/${repo.name}`, url: repo.url, private: repo.isPrivate,
      exposed: r.hygiene?.exposed || false,
      ossReadiness: r.legal.oss, ossReason: r.legal.reason, legalFlags: r.legal.flags || [],
      seriousFindings: serious,
      allFindings: flags,
      verdict: serious.length ? "DO NOT open-source until scrubbed" :
               r.legal.oss === "safe" ? "clean, safe to open-source" : "review before open-sourcing",
    };
  }
  if (name === "best_to_post") {
    let repos = await listRepos(args.owner, { limit: 500 });
    if (!args.includePrivate) repos = repos.filter(r => !r.isPrivate);
    const graded = [];
    for (const repo of repos) {
      const r = await analyze(args.owner, repo, false);
      if (!args.includePrivate && r.legal.oss !== "safe") continue;
      graded.push({ name: repo.name, url: repo.url, postScore: postScore(r.scores), grade: r.grade, slopRisk: r.slopRisk, ossReadiness: r.legal.oss, description: r.description });
    }
    graded.sort((a, b) => b.postScore - a.postScore);
    return { owner: args.owner, ranking: "post-first (Reddit/HN reception)", top: graded.slice(0, args.top || 10) };
  }
  throw new Error(`unknown tool: ${name}`);
}

// --- tiny JSON-RPC over stdio ---
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (line) handle(JSON.parse(line));
  }
});
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }

async function handle(req) {
  const { id, method, params } = req;
  try {
    if (method === "initialize") {
      return send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "kitsune-repo-scanner", version: "0.3.0" } } });
    }
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const out = await callTool(params.name, params.arguments || {});
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] } });
    }
    if (id !== undefined) send({ jsonrpc: "2.0", id, result: {} });
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e.message || e) } });
  }
}
