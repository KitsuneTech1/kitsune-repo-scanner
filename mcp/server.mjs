#!/usr/bin/env node
// Minimal MCP stdio server exposing the scanner as tools, so any MCP client
// (Claude Code, etc.) can grade an org or a single repo on demand.
//
// Tools:
//   scan_org({ owner, includePrivate?, ai? })  -> summary + per-repo grades (JSON)
//   score_repo({ owner, name, ai? })            -> single-repo grade (JSON)
//
// No SDK dependency: implements the JSON-RPC 2.0 / MCP handshake over stdio directly.
import { listRepos, fetchReadme, fetchRootTree, hasWorkflows } from "../src/github.mjs";
import { scoreRepo } from "../src/score.mjs";
import { refine, aiEnabled } from "../src/ai.mjs";
import { SUBJECTIVE_APPLY } from "../src/report.mjs";

const TOOLS = [
  {
    name: "scan_org",
    description: "Grade every repo in a GitHub org/user on the Kitsune market-reception rubric (30 categories, 0-1000, F to S++++, AI-slop risk). Returns ranked JSON.",
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
    description: "Grade a single GitHub repo (owner/name) on the market-reception rubric. Returns the full 30-category breakdown, grade, description, and AI-slop risk.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" }, name: { type: "string" },
        ai: { type: "boolean" },
      },
      required: ["owner", "name"],
    },
  },
];

async function gradeOne(owner, repo, useAI) {
  const [readme, tree, ci] = await Promise.all([
    fetchReadme(owner, repo.name), fetchRootTree(owner, repo.name), hasWorkflows(owner, repo.name),
  ]);
  const r = scoreRepo(repo, readme, tree, ci);
  if (useAI && aiEnabled()) {
    const ai = await refine(repo, readme);
    if (ai) { if (ai.description) r.description = ai.description; if (ai.scores) SUBJECTIVE_APPLY(r, ai.scores); }
  }
  return { name: repo.name, url: repo.url, private: repo.isPrivate, grade: r.grade, score: r.total, slopRisk: r.slopRisk, description: r.description, strengths: r.strengths, weaknesses: r.weaknesses, scores: r.scores };
}

async function callTool(name, args) {
  if (name === "scan_org") {
    let repos = await listRepos(args.owner, { limit: 500 });
    if (!args.includePrivate) repos = repos.filter(r => !r.isPrivate);
    const graded = [];
    for (const repo of repos) graded.push(await gradeOne(args.owner, repo, args.ai));
    graded.sort((a, b) => b.score - a.score);
    const avg = Math.round(graded.reduce((a, g) => a + g.score, 0) / (graded.length || 1));
    return { owner: args.owner, count: graded.length, avgScore: avg, repos: graded };
  }
  if (name === "score_repo") {
    const [repo] = (await listRepos(args.owner, { limit: 500 })).filter(r => r.name === args.name);
    if (!repo) throw new Error(`repo not found: ${args.owner}/${args.name}`);
    return await gradeOne(args.owner, repo, args.ai);
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
      return send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "kitsune-repo-scanner", version: "0.1.0" } } });
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
