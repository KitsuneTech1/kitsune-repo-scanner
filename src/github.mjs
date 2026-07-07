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

// Does the repo have any GitHub Actions workflow file?
export async function hasWorkflows(owner, name) {
  try {
    const res = await gh(["api", `repos/${owner}/${name}/contents/.github/workflows`]);
    return Array.isArray(res) && res.length > 0;
  } catch { return false; }
}
