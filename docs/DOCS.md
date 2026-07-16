# Technical Reference

## Architecture

kitsune-repo-scanner is a Node.js CLI and MCP server that grades GitHub repos on a market-reception rubric. It has no runtime dependencies beyond Node 18+ and the `gh` CLI.

### File map and data flow

```
bin/kitsune-scan.mjs          CLI entry point: parses flags, orchestrates scan, writes report
mcp/server.mjs                MCP server: JSON-RPC 2.0 over stdio, exposes four tools
src/github.mjs                GitHub data fetching via `gh` CLI (list repos, readme, tree, workflows, file text)
src/rubric.mjs                Category definitions, weights, grade bands, kill-switch caps
src/score.mjs                 Deterministic scoring engine: turns repo signals into 0-10 scores per category
src/ai.mjs                    Optional LLM refinement pass for subjective categories and descriptions
src/hygiene.mjs               Exposure scanner: secrets, PII, junk files, empty repos
src/legal.mjs                 License detection and open-source readiness analysis
src/report.mjs                HTML report generator with sortable, filterable grade cards
```

**Scan flow (CLI):**
1. `bin/kitsune-scan.mjs` calls `src/github.mjs` to list repos for the given owner.
2. For each repo, `src/score.mjs` gathers signals (description, README, images, license, topics, stars, recency, tests, CI, disk size, AI-slop phrase hits) and produces deterministic 0-10 scores per category.
3. If `--ai` is passed and `AZURE_FOUNDRY_KEY` is set, `src/ai.mjs` calls the configured LLM to refine subjective categories and rewrite descriptions.
4. `src/hygiene.mjs` scans tracked files for leaked credentials, API keys, private LAN IPs, committed .env/key files, build junk, and empty repos.
5. `src/legal.mjs` checks for license files and flags OSS-readiness issues.
6. `src/report.mjs` assembles the HTML report and writes it alongside `report.json`.

**MCP flow:**
1. `mcp/server.mjs` listens on stdio for JSON-RPC 2.0 requests.
2. On `tools/list`, it returns the four tool definitions.
3. On `tools/call`, it dispatches to the same scoring, hygiene, and legal modules used by the CLI, returning JSON results.

## CLI

### `node bin/kitsune-scan.mjs <owner> [flags]`

Scans every public repo in a GitHub org or user and writes a scouting report.

**Inputs:**
- `owner` (positional, required): GitHub org or username.

**Flags:**
- `--ai`: Enable LLM refinement pass (requires `AZURE_FOUNDRY_KEY`).
- `--include-private`: Include private repos in the scan.
- `--out DIR`: Output directory (default `./report`).
- `--limit N`: Cap the number of repos scanned.
- `--open`: Open the HTML report in the default browser when done.

**Outputs:**
- `report/index.html`: Sortable, filterable HTML scouting report.
- `report/report.json`: Raw scores and hygiene data as JSON.

## MCP Tools

The MCP server exposes four tools over JSON-RPC 2.0 on stdio. All tools require the `gh` CLI to be authenticated on the host.

### `scan_org`

Grade every repo in a GitHub org/user on the full 30-category rubric plus hygiene/exposure scan.

**Inputs:**
- `owner` (string, required): GitHub org or username.
- `includePrivate` (boolean, optional): Include private repos. Default false.
- `ai` (boolean, optional): Refine subjective axes with the LLM. Requires `AZURE_FOUNDRY_KEY`.

**Output:** Ranked JSON array of per-repo grades, scores, AI-slop risk, and hygiene flags.

### `score_repo`

Grade a single GitHub repo on the full rubric.

**Inputs:**
- `owner` (string, required): GitHub org or username.
- `name` (string, required): Repo name.
- `ai` (boolean, optional): Enable LLM refinement.

**Output:** JSON object with the 30-category breakdown, overall grade, description, AI-slop risk, and hygiene flags.

### `audit_repo`

Security and hygiene audit of one repo before open-sourcing. Scans tracked files for leaked credentials, API keys, private LAN IPs, committed .env/key files, build junk, and empty-repo/no-description issues.

**Inputs:**
- `owner` (string, required): GitHub org or username.
- `name` (string, required): Repo name.

**Output:** JSON object with findings list, exposure verdict, and OSS-readiness rating (safe, borderline, or no).

### `best_to_post`

Rank an org's repos by how well they would do posted to Reddit or HN right now. Hook, shareability, and public sentiment are weighted up; code substance is weighted down. Defaults to public, OSS-safe repos only.

**Inputs:**
- `owner` (string, required): GitHub org or username.
- `top` (number, optional): How many repos to return. Default 10.
- `includePrivate` (boolean, optional): Include private and non-OSS-safe repos. Default false.

**Output:** Ranked JSON array of repos with post scores.

## Configuration

All configuration is done through environment variables. No config files.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AZURE_FOUNDRY_KEY` | Only with `--ai` or `ai: true` | None | API key for the LLM refinement pass. Without it, AI refinement silently falls back to heuristics. |
| `AZURE_FOUNDRY_URL` | No | Azure AI Foundry models path | Base URL for an OpenAI-compatible `/chat/completions` endpoint. Point this at any compatible provider. |
| `AI_MODEL` | No | DeepSeek-V4-Pro | Model name sent in the API request. |
| `SCAN_PII` | No | None | Comma-separated list of your own IPs, handles, or domains. Added to the exposure scan so you can catch accidental leaks of your own identifiers. |

## Data Model

### Rubric categories

Defined in `src/rubric.mjs`. 30 categories across six groups, each scored 0-10:

| Group (weight) | Categories |
|----------------|------------|
| Hook & first impression (25) | name, one-line pitch, visual proof, 5-second clarity, README top |
| Public sentiment & desire (25) | real problem, audience size, community fit, shareability, wow |
| Trust & polish (18) | license, docs, setup friction, freshness, presentation, security optics |
| AI-slop signal (12) | buzzword copy, template smell, wrapper-vs-depth, human craft |
| Substance (10) | actually works, uniqueness, completeness, code-quality signals, hackability |
| Growth & longevity (10) | virality, longevity, portfolio value, flame risk, maintenance drag |

### Grade bands

Nonlinear letter bands, wide at the bottom and tight at the top. S-tier only above 950 and gated behind every hook and sentiment axis at 9+.

### AI-slop risk

A 0-100 headline score computed as the inverse of the four craft/originality axes. A high number means the repo reads machine-generated.

### Hygiene findings

Per-repo flags for: leaked credentials, API keys, private LAN IPs, committed .env files, committed key files, build junk, empty repos, missing descriptions, and big binaries.

## Deploy

No build step. The project runs directly with Node 18+.

1. Clone the repo.
2. Ensure `gh` is installed and authenticated (`gh auth status`).
3. Run the CLI or register the MCP server with your agent.

For the MCP server, register it in your client's `mcpServers` config:

```json
{
  "mcpServers": {
    "repo-scanner": {
      "command": "node",
      "args": ["/absolute/path/to/kitsune-repo-scanner/mcp/server.mjs"],
      "env": { "SCAN_PII": "your-lan-ip,your-handle,your-domain" }
    }
  }
}
```

## Gotchas

- The `gh` CLI must be authenticated on the host. The scanner shells out to `gh` for all GitHub data; there is no direct API integration.
- Without `AZURE_FOUNDRY_KEY`, the `--ai` flag and `ai: true` tool parameter silently fall back to heuristics. No error is thrown.
- Private repos require the `--include-private` flag or `includePrivate: true` tool parameter. They are excluded by default.
- The hygiene scanner skips lockfiles and minified vendor code to reduce false positives. It uses entropy gating for credential detection and full-quad IP matching to avoid semver false positives.
- Scores are a lens, not a verdict. A 0-star internal repo cannot show public sentiment yet, so treat the ranking as a prioritization aid for polishing and posting.
- The HTML report uses sticky table headers measured against the controls bar. If the controls bar height changes (e.g., due to window resize or preset changes), the sticky offset may need a refresh.