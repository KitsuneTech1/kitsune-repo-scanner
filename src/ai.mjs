// Optional LLM refinement for the subjective categories + a sharper description.
// Env-gated: set AZURE_FOUNDRY_KEY (and optionally AZURE_FOUNDRY_URL / AI_MODEL) and
// pass --ai to the CLI. Falls back silently to heuristics if unset or on error.
// Uses the Azure AI Foundry inference path (services.ai), DeepSeek-V4-Pro by default.

const BASE = process.env.AZURE_FOUNDRY_URL || "https://kitsunetechnologies.services.ai.azure.com/models";
const MODEL = process.env.AI_MODEL || "DeepSeek-V4-Pro";
const KEY = process.env.AZURE_FOUNDRY_KEY || "";

export const aiEnabled = () => !!KEY;

// Ask the model to (a) write a crisp one-line description and (b) re-score the
// subjective axes 0-10. We only trust it for hard-to-heuristic categories.
const SUBJECTIVE = [2, 4, 6, 7, 8, 9, 10, 17, 18, 19, 22, 27, 28];

export async function refine(repo, readme) {
  if (!KEY) return null;
  const sys = "You are a blunt open-source scout. You judge how the public would receive a GitHub repo if it were posted to Reddit/HN. No hype, no sycophancy. Score the axes 0-10 (10 = best possible reception). Output ONLY compact JSON.";
  const axes = SUBJECTIVE.map(id => `"${id}"`).join(", ");
  const user = `Repo: ${repo.name}
GitHub description: ${repo.description || "(none)"}
Primary language: ${repo.primaryLanguage?.name || "?"}  Stars: ${repo.stargazerCount || 0}
README (truncated):
"""
${(readme || "(empty)").slice(0, 4000)}
"""

Return JSON: {"description":"one plain sentence, no buzzwords, <=140 chars","scores":{${axes}: <0-10>...},"slop_note":"one line on AI-slop smell"}`;

  try {
    const res = await fetch(`${BASE}/chat/completions?api-version=2024-05-01-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": KEY },
      body: JSON.stringify({
        model: MODEL, temperature: 0.2, max_tokens: 700,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content || "";
    const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    return json;
  } catch { return null; }
}
