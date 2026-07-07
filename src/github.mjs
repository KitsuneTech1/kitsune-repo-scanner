// Thin wrappers around the `gh` CLI (already authenticated on the host).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

const GH = process.platform === "win32" ? "gh.exe" : "gh";

async function gh(args, { json = true } = {}) {
  const { stdout } = await pexec(GH, args, { maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(stdout) : stdout;
}

// List every repo in an org or user account with the metadata the scorer needs.
export async function listRepos(owner, { limit = 500 } = {}) {
  const fields = [
    "name", "description", "primaryLanguage", "stargazerCount", "forkCount",
    "pushedAt", "createdAt", "isPrivate", "isArchived", "isFork",
    "licenseInfo", "repositoryTopics", "url", "diskUsage",
  ].join(",");
  return gh(["repo", "list", owner, "--limit", String(limit), "--json", fields]);
}

// Fetch README (decoded) for a repo. Returns "" if none.
export async function fetchReadme(owner, name) {
  try {
    const res = await gh(["api", `repos/${owner}/${name}/readme`]);
    if (res && res.content) return Buffer.from(res.content, "base64").toString("utf8");
  } catch { /* no readme */ }
  return "";
}

// List root-level file/dir names (for CI/tests/license detection). Returns [].
export async function fetchRootTree(owner, name) {
  try {
    const res = await gh(["api", `repos/${owner}/${name}/contents`]);
    if (Array.isArray(res)) return res.map(e => ({ name: e.name, type: e.type }));
  } catch { /* empty repo or no access */ }
  return [];
}

// Full recursive file tree (path + size) for hygiene checks. Returns [] on
// empty repos. GitHub truncates enormous trees; what we get is still useful.
export async function fetchFullTree(owner, name) {
  try {
    const res = await gh(["api", `repos/${owner}/${name}/git/trees/HEAD?recursive=1`]);
    if (res && Array.isArray(res.tree)) {
      return res.tree.filter(e => e.type === "blob").map(e => ({ path: e.path, size: e.size || 0 }));
    }
  } catch { /* empty repo or no access */ }
  return [];
}

// Fetch raw text of a single file (decoded). "" if missing/too big.
export async function fetchFileText(owner, name, path) {
  try {
    const res = await gh(["api", `repos/${owner}/${name}/contents/${path}`]);
    if (res && res.content && res.encoding === "base64") {
      return Buffer.from(res.content, "base64").toString("utf8");
    }
  } catch { /* missing / too large / binary */ }
  return "";
}

// Does the repo have any GitHub Actions workflow file?
export async function hasWorkflows(owner, name) {
  try {
    const res = await gh(["api", `repos/${owner}/${name}/contents/.github/workflows`]);
    return Array.isArray(res) && res.length > 0;
  } catch { return false; }
}
