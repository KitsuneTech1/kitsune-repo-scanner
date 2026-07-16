# Agent Orientation

## What this project is

kitsune-repo-scanner is a Node.js CLI and MCP server that grades GitHub repos on a 30-category market-reception rubric. It scores repos 0-1000, flags AI-slop risk, runs hygiene/exposure scans, and generates an HTML scouting report. It also exposes itself as an MCP server so AI agents can call its tools directly.

## How to run and test

### Prerequisites

- Node 18+
- `gh` CLI installed and authenticated (`gh auth status` must succeed)
- No `npm install` needed (zero dependencies)

### CLI

```bash
# Grade an org, open the report
node bin/kitsune-scan.mjs <org> --open

# With AI refinement (needs AZURE_FOUNDRY_KEY set)
node bin/kitsune-scan.mjs <org> --ai --open

# Include private repos, limit to 5
node bin/kitsune-scan.mjs <org> --include-private --limit 5
```

Output lands in `./report/` by default (overridable with `--out`).

### MCP server

```bash
# Start the server on stdio
node mcp/server.mjs
```

The server speaks JSON-RPC 2.0. Send a `tools/list` request to confirm it is alive, then call tools by name.

## Key things an agent must know

### 1. All GitHub access goes through the `gh` CLI

There is no direct GitHub API integration. The project shells out to `gh` for everything: listing repos, fetching READMEs, reading file trees, checking workflows, and pulling file contents. If `gh` is not authenticated or not installed, nothing works. Always check `gh auth status` first.

### 2. AI refinement is optional and silently degrades

Passing `--ai` or `ai: true` enables an LLM pass over subjective categories and descriptions. This requires `AZURE_FOUNDRY_KEY` to be set. If the key is missing, the system silently falls back to heuristics with no error. Do not assume the AI pass ran unless you verified the key is present.

### 3. The scoring engine is deterministic except for the AI pass

`src/score.mjs` produces deterministic 0-10 scores from repo signals (description, README, images, license, topics, stars, recency, tests, CI, disk size, AI-slop phrase hits). Only the optional AI pass introduces variability. If you need reproducible results, omit `--ai`.

### 4. Hygiene scanning has deliberate false-positive suppression

The hygiene scanner in `src/hygiene.mjs` skips lockfiles and minified vendor code. It uses entropy gating for credential detection and full-quad IP matching to avoid flagging semver strings as IPs. It is tuned for precision over recall. A clean audit does not guarantee the repo is free of secrets; it means the scanner found nothing matching its patterns.

### 5. The MCP server has no SDK dependency

`mcp/server.mjs` implements JSON-RPC 2.0 and the MCP handshake over stdio directly. There is no `@modelcontextprotocol/sdk` import. The server reads one JSON-RPC message per line, dispatches to the tool handler, and writes one JSON-RPC response per line. Keep this constraint in mind if extending the server.

### 6. Environment variables are the only configuration surface

There are no config files. Everything is driven by `AZURE_FOUNDRY_KEY`, `AZURE_FOUNDRY_URL`, `AI_MODEL`, and `SCAN_PII`. Never hardcode values; always read from `process.env`.

### 7. The HTML report has sticky-header offset logic

The report in `src/report.mjs` uses JavaScript to pin the table header below the controls bar. The offset is measured at render time. If you change the controls bar height, the sticky offset may break. The report also includes a preset selector (defaults to Best-to-post weighting) that changes column visibility and sorting.

### 8. Private repos are excluded by default

Both the CLI and MCP tools default to public repos only. Pass `--include-private` or `includePrivate: true` to include private repos. The `best_to_post` tool also defaults to OSS-safe repos only; private and non-OSS-safe repos are excluded unless `includePrivate: true` is set.

## Common call shapes

### MCP tool invocations (JSON-RPC 2.0)

**List tools:**
```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

**Scan an org:**
```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"scan_org","arguments":{"owner":"my-org"}}}
```

**Score one repo:**
```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"score_repo","arguments":{"owner":"my-org","name":"my-repo"}}}
```

**Audit a repo before open-sourcing:**
```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"audit_repo","arguments":{"owner":"my-org","name":"my-repo"}}}
```

**Get best repos to post:**
```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"best_to_post","arguments":{"owner":"my-org","top":5}}}
```

### CLI invocation

```bash
node bin/kitsune-scan.mjs <owner> [--ai] [--include-private] [--out DIR] [--limit N] [--open]
```

## Safe modification boundaries

- **Adding a rubric category:** Add the definition in `src/rubric.mjs`, add scoring logic in `src/score.mjs`, and update the report card rendering in `src/report.mjs`. If it is subjective, add it to the AI refinement pass in `src/ai.mjs`.
- **Adding an MCP tool:** Define the tool object in the `TOOLS` array in `mcp/server.mjs`, add a handler in the `tools/call` dispatch, and ensure it uses the existing `src/*` modules rather than duplicating logic.
- **Changing the hygiene scanner:** Work in `src/hygiene.mjs`. Be conservative with new patterns; the scanner prioritizes low false positives. Always test against lockfiles and semver strings.
- **Changing the report HTML:** Work in `src/report.mjs`. The report is a single self-contained HTML file with inline CSS and JS. Keep it that way. Test sticky header behavior after any changes to the controls bar.