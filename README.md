# kitsune-repo-scanner

Point it at a GitHub org or user and it grades **every repo** on a 30-category
**market-reception rubric**: how the public would actually receive the project if you
open-sourced it and posted it to Reddit or Hacker News. It writes each repo a one-line
description, scores it 0-1000 (F to S++++), flags **AI-slop risk**, and drops a savable
HTML scouting report you can sort and filter.

Built to answer one question fast: *of everything I've made, what's worth releasing, and
in what order do I post it?*

![report](docs/report.png)

## What it measures

Not code quality. **Reception.** 30 categories in six groups (weights in parens):

| Group | What it asks |
|-------|--------------|
| Hook & first impression (25) | name, one-line pitch, visual proof, 5-second clarity, README top |
| Public sentiment & desire (25) | real problem, audience size, community fit, shareability, wow |
| Trust & polish (18) | license, docs, setup friction, freshness, presentation, security optics |
| **AI-slop signal (12)** | buzzword copy, template smell, wrapper-vs-depth, human craft |
| Substance (10) | actually works, uniqueness, completeness, code-quality signals, hackability |
| Growth & longevity (10) | virality, longevity, portfolio value, flame risk, maintenance drag |

Scores map to nonlinear letter bands (wide at the bottom, tight at the top; S-tier only
above 950 and gated behind every hook+sentiment axis at 9+). **AI-slop risk** is surfaced
as its own 0-100 headline: the inverse of the four craft/originality axes, so a high number
means it reads machine-generated.

## Usage

Needs the [`gh` CLI](https://cli.github.com/) authenticated (`gh auth status`) and Node 18+.

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

### AI refinement (optional)

Heuristics run with zero setup. To sharpen the subjective axes and descriptions, set an
Azure AI Foundry key and pass `--ai`:

```bash
export AZURE_FOUNDRY_KEY=...           # required for --ai
export AZURE_FOUNDRY_URL=...           # optional, defaults to the Foundry models path
export AI_MODEL=DeepSeek-V4-Pro        # optional
```

Any provider with an OpenAI-style `/chat/completions` works if you point `AZURE_FOUNDRY_URL`
at it. Without a key, `--ai` silently falls back to heuristics.

## MCP server

The scanner is also an MCP server, so an agent can grade repos on demand:

```bash
node mcp/server.mjs           # stdio JSON-RPC
```

Tools: `scan_org({ owner, includePrivate?, ai? })` and `score_repo({ owner, name, ai? })`.
Register it with any MCP client (e.g. `claude mcp add repo-scanner -- node /path/mcp/server.mjs`).

## How scoring works

`src/rubric.mjs` defines the categories, weights, grade bands, and kill-switch caps.
`src/score.mjs` turns repo signals (description, README, images, license, topics, stars,
recency, tests, CI, disk size, AI-slop phrase hits) into deterministic 0-10 scores. The
optional AI pass overrides only the categories a machine can't read from signals alone.
Everything is explainable: expand any card to see all 30 bars and any caps that fired.

Scores are a lens, not a verdict. A 0-star internal repo can't show public sentiment yet,
so treat the ranking as "what to polish and post first," which is exactly what it's for.

## License

MIT.
