// Legal + open-source-readiness assessment for a repo.
// Heuristic red-flag detection over name/description/README/file tree. The optional
// AI pass (src/ai.mjs) can override with a deeper read. Output is advisory, not legal advice.

// Red-flag lexicons. Each hit carries a category + severity.
const FLAGS = [
  // category, severity (illegal|gray), regex
  ["game-cheat", "gray", /\b(aimbot|wallhack|\besp\b|triggerbot|no[- ]?recoil|mod ?menu|unlock ?all|game ?hack|cheat|injector|dll ?inject|memory ?(hack|edit)|offset ?finder|autoclick)/i],
  ["piracy-crack", "illegal", /\b(crack(ed|er)?|keygen|warez|nulled|pirat(e|ed|ing)|drm ?bypass|license ?bypass|activation ?bypass|serial ?key gen)/i],
  ["private-server", "gray", /\b(private ?server|server ?emulat|revive.{0,12}server|reverse[- ]?engineer.{0,20}(server|protocol))/i],
  ["gambling", "gray", /\b(casino|gambl|roulette|blackjack ?bet|slot ?machine|wager|betting|skins? ?gambl|provably ?fair|rake)/i],
  ["spoofing-fraud", "illegal", /\b(mail ?spoof|email ?spoof|spoof(er|ing)|phish(ing)?|carding|otp ?bypass|sms ?bomb|fake ?identity|caller ?id ?spoof)/i],
  ["attack-malware", "illegal", /\b(ddos|dos ?attack|botnet|\brat\b|keylog(ger)?|ransomware|infostealer|stealer|c2 ?server|command ?and ?control|backdoor|rootkit|payload ?generat)/i],
  ["ai-tos-proxy", "gray", /\b(chatgpt ?proxy|claude ?proxy|openai ?proxy|subscription ?to ?api|reverse ?proxy.{0,15}(gpt|claude|openai)|cli ?to ?api ?bridge)/i],
  ["scraping-tos", "gray", /\b(mass ?account|account ?generat|bulk ?scrap|credential ?stuff|proxy ?rotat|bypass ?(captcha|rate ?limit)|device ?farm|multibox|automation.{0,10}(bot|farm))/i],
  ["disinfo", "gray", /\b(disinfo|disinformation|astroturf|sockpuppet|fake ?news ?generat|propaganda ?bot)/i],
  ["data-leak", "gray", /\b(breach ?(db|database|dump)|leaked ?(creds|password|database)|combolist|dox(x|xing)?)/i],
];

// leaked-secret patterns (in README/config text).
const SECRET_RE = /\b(api[_-]?key|secret[_-]?key|access[_-]?token|password|passwd|bearer|private[_-]?key)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-]{12,}/i;

export function assessLegal(repo, readme = "", tree = []) {
  const hay = [repo.name, repo.description || "", readme,
    (tree || []).map(f => f.name).join(" ")].join("\n");
  const hits = [];
  for (const [cat, sev, re] of FLAGS) if (re.test(hay)) hits.push({ cat, sev });

  const hasIllegal = hits.some(h => h.sev === "illegal");
  const hasGray = hits.some(h => h.sev === "gray");
  const secrets = SECRET_RE.test(readme);

  let legal, oss, reason;
  if (hasIllegal) {
    legal = "illegal-risk"; oss = "no";
    reason = "Contains tooling that is likely illegal or ToS-breaking to publish (" +
      [...new Set(hits.filter(h => h.sev === "illegal").map(h => h.cat))].join(", ") + ").";
  } else if (hasGray) {
    legal = "gray"; oss = "borderline";
    reason = "Legally gray or reputationally risky to open-source under a company name (" +
      [...new Set(hits.filter(h => h.sev === "gray").map(h => h.cat))].join(", ") + ").";
  } else {
    legal = "clean"; oss = "safe";
    reason = "No red flags detected; content looks safe to open-source.";
  }
  if (secrets && oss === "safe") { oss = "borderline"; reason = "Looks safe BUT possible secret/key committed - scrub before publishing."; }

  // license recommendation
  let license;
  if (repo.licenseInfo) license = `Already licensed (${repo.licenseInfo.spdxId || repo.licenseInfo.name || "present"}).`;
  else if (oss === "safe") license = "No license file. Add MIT (permissive) or Apache-2.0 (patent grant) before release.";
  else license = "Do not add an OSS license until the legal question is resolved.";

  return {
    legal, oss, reason, license,
    flags: [...new Set(hits.map(h => h.cat))],
    secrets,
    route: oss === "no" || oss === "borderline" ? "personal" : "kitsunetech1",
  };
}

// counts for the report header
export function legalSummary(items) {
  const c = { safe: 0, borderline: 0, no: 0, secrets: 0 };
  for (const it of items) { c[it.legal.oss]++; if (it.legal.secrets) c.secrets++; }
  return c;
}
