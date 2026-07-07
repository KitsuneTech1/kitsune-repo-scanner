// Hygiene / exposure checks over the full file tree + README text.
// Catches what manual repo audits keep finding: committed dependency/build junk,
// env and key files, giant stray binaries, personal info in the README, and
// empty shell repos that make an org look abandoned.
//
// Extra owner-specific patterns (real IPs, usernames, domains) come from the
// SCAN_PII env var (comma-separated literals) so they never live in this source.

const JUNK_DIRS = [
  ["node_modules/", "node_modules committed"],
  ["__pycache__/", "__pycache__ committed"],
  ["dist/", "dist/ build output committed"],
  ["build/", "build/ output committed"],
  ["target/", "target/ build output committed"],
  [".venv/", "virtualenv committed"],
  ["vendor/", "vendor/ committed"],
];
const KEY_FILE = /(^|\/)(\.env(\.[\w.-]+)?|id_rsa[^/]*|[^/]*\.(pem|p12|pfx|keystore))$/i;
const ENV_OK = /\.env\.(example|sample|template|dist)$/i;
const BINARY_EXT = /\.(exe|msi|iso|dmg|dll|so|bin|zip|7z|rar|gz|jar|apk|pdb)$/i;
const BIG_BIN_MB = 8;
const HUGE_FILE_MB = 25;

const PRIVATE_IP = /\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}(\.\d{1,3})?\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;

// Secret patterns for scanning tracked source/config file CONTENT (not just READMEs).
// This is what catches a token hardcoded in index.html, a key in a config.json, etc.
const CONTENT_SECRET = [
  [/\b[a-z]*[_-]?(api[_-]?key|[_-]?key|token|secret|password|passwd|auth)\b['"]?\s*[:=]\s*['"][^'"\s]{8,}['"]/i, "hardcoded credential"],
  [/\b(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,})\b/, "known key format"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key block"],
  [/\b(basic|bearer)\s+[A-Za-z0-9+/=_-]{16,}/i, "authorization header value"],
];
// Files worth reading (small config / client code). Extensions + notable names.
const SCANNABLE = /\.(html?|js|mjs|ts|jsx|tsx|json|ya?ml|toml|ini|env|cfg|conf|sh|ps1|py|php|rb)$/i;
const SCAN_MAX_FILES = 12;
const SCAN_MAX_KB = 128;

// Pick a bounded set of small text files most likely to hold a leaked secret:
// prefer files at the repo root and obvious config names, skip vendored/build paths.
export function pickScanTargets(fullTree = []) {
  return (fullTree || [])
    .filter(e => e.path && SCANNABLE.test(e.path) && (e.size || 0) <= SCAN_MAX_KB * 1024)
    .filter(e => !/(^|\/)(node_modules|dist|build|target|vendor|\.venv)\//.test(e.path))
    .sort((a, b) => (a.path.split("/").length - b.path.split("/").length)
      || (/config|secret|env|auth|credential|\.js$|\.html?$/i.test(b.path) ? 1 : 0)
        - (/config|secret|env|auth|credential|\.js$|\.html?$/i.test(a.path) ? 1 : 0))
    .slice(0, SCAN_MAX_FILES)
    .map(e => e.path);
}

// Placeholder values that look like secrets but are not (docs/examples/templates).
const PLACEHOLDER = /your[_-]?|example|placeholder|changeme|change[_-]?this|xxxx|\*{3,}|<[^>]+>|dummy|sample|todo|redacted|insert[_-]?|abc123|000000|_here\b/i;

// Scan already-fetched file contents ({path: text}) for secrets. Returns flags[].
export function scanContents(files = {}) {
  const flags = [];
  for (const [path, text] of Object.entries(files)) {
    if (!text) continue;
    for (const [re, label] of CONTENT_SECRET) {
      const m = text.match(re);
      if (m && !PLACEHOLDER.test(m[0])) { flags.push(`${label} in ${path}`); break; }
    }
    if (PRIVATE_IP.test(text)) flags.push(`private LAN IP in ${path}`);
  }
  return flags;
}

export function assessHygiene(repo, readme = "", fullTree = [], contentFlags = []) {
  const flags = [];
  const paths = (fullTree || []).map(e => e.path || "");
  const text = [repo.description || "", readme].join("\n");

  // empty shell repo
  if (paths.length === 0 && !(readme || "").trim()) {
    flags.push("empty repo (no files, no readme)");
  }

  // committed junk dirs
  for (const [dir, msg] of JUNK_DIRS) {
    const n = paths.filter(p => p.startsWith(dir) || p.includes("/" + dir)).length;
    if (n > 0) flags.push(`${msg} (${n} files)`);
  }

  // env / key material tracked in git
  const keyFiles = paths.filter(p => KEY_FILE.test(p) && !ENV_OK.test(p));
  if (keyFiles.length) flags.push("env/key file tracked: " + keyFiles.slice(0, 3).join(", "));

  // large stray binaries
  for (const e of fullTree || []) {
    const mb = (e.size || 0) / 1048576;
    if (mb >= HUGE_FILE_MB || (mb >= BIG_BIN_MB && BINARY_EXT.test(e.path || ""))) {
      flags.push(`large binary: ${e.path} (${mb.toFixed(0)}MB)`);
    }
  }

  // personal / network info in readme or description
  if (PRIVATE_IP.test(text)) flags.push("private LAN IP in readme/description");
  const emails = [...new Set((text.match(EMAIL) || []).filter(m =>
    !/noreply|no-reply|example\.(com|org)|users\.noreply\.github/i.test(m)))];
  if (emails.length) flags.push("email address in readme: " + emails.slice(0, 2).join(", "));
  for (const pat of (process.env.SCAN_PII || "").split(",").map(s => s.trim()).filter(Boolean)) {
    if (text.toLowerCase().includes(pat.toLowerCase())) flags.push(`owner PII match: ${pat}`);
  }

  // secret hits found by scanning tracked file contents (fetched in the CLI layer)
  for (const cf of contentFlags) flags.push(cf);

  if (!(repo.description || "").trim()) flags.push("no GitHub description");

  return { flags, exposed: flags.some(f => /env\/key|PII|LAN IP|credential|private key|key format|authorization header/i.test(f)) };
}
