# kitsune-repo-scanner

Point it at a GitHub org or user and it grades every repo on a 30-category market-reception rubric: how the public would actually receive the project if you open-sourced it and posted it to Reddit or Hacker News. It writes each repo a one-line description, scores it 0-1000 (F to S++++), flags AI-slop risk, and drops a savable HTML scouting report you can sort and filter.

Built to answer one question fast: of everything I've made, what's worth releasing, and in what order do I post it?

![report](docs/report.jpeg)

## Features

- Grades every public repo in a GitHub org or user on a 30-category rubric across six groups: Hook & first impression, Public sentiment & desire, Trust & polish, AI-slop signal, Substance, and Growth & longevity.
- Generates a sortable, filterable HTML scouting report with per-repo grade cards, expandable 30-bar breakdowns, and hygiene flags.
- Exposes an MCP server so AI agents can grade orgs, score single repos, audit repos for leaked secrets before open-sourcing, and rank repos by Reddit/HN post-readiness.
- Optional AI refinement pass over subjective categories and descriptions using any OpenAI-compatible chat completions endpoint.
- Hygiene scanner detects committed secrets, API keys, private LAN IPs, committed .env/key files, build junk, and empty repos.
- Legal/open-source readiness analysis flags license issues and OSS safety.
- Best-to-post ranking weights hook, shareability, and public sentiment over code substance to surface what would perform well on social platforms.

## Quickstart

Requires the `gh` CLI authenticated (`gh auth status`) and Node 18+.

```bash
git clone https://github.com/KitsuneTech1/kitsune-repo-scanner
cd kitsune-repo-scanner

# grade every public repo in an org, open the report
node bin/kitsune-scan.mjs <org> --open

# include private repos, refine subjective axes + descriptions with an LLM
node bin/kitsune-scan.mjs <org> --include-private --ai --open
```

Flags:

| Flag | Effect |
|------|--------|
| `--ai` | LLM pass over the subjective categories + a cleaner description (needs `AZURE_FOUNDRY_KEY`) |
| `--include-private` | grade private repos too |
| `--out DIR` | output directory (default `./report`) |
| `--limit N` | cap repos scanned |
| `--open` | open the HTML report when done |

Output: `report/index.html` (the scouting report) and `report/report.json` (raw scores).

## Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `AZURE_FOUNDRY_KEY` | Only with `--ai` | API key for the LLM refinement pass |
| `AZURE_FOUNDRY_URL` | No | Base URL for an OpenAI-compatible chat completions endpoint (defaults to Azure AI Foundry models path) |
| `AI_MODEL` | No | Model name to use for refinement (defaults to DeepSeek-V4-Pro) |
| `SCAN_PII` | No | Comma-separated list of your own IPs, handles, or domains to add to the exposure scan |

## License

MIT.