// Heuristic scorer. Turns repo signals into 0-10 scores for all 30 categories.
// No network, no LLM: deterministic and explainable. The optional AI pass
// (src/ai.mjs) can override the subjective categories afterward.
import { CATEGORIES, applyCaps, grade, tier, slopRisk } from "./rubric.mjs";
import { assessLegal } from "./legal.mjs";

const clamp = (n) => Math.max(0, Math.min(10, Math.round(n)));

// AI-slop tells: Moo's own banned-copy list + common machine-generated giveaways.
const SLOP_PHRASES = [
  "seamless", "seamlessly", "elevate", "unlock", "delve", "robust", "effortless",
  "game-changer", "game changer", "cutting-edge", "cutting edge", "harness the power",
  "in today's", "in today's fast-paced", "look no further", "the world of",
  "revolutionize", "supercharge", "unleash", "empower", "leverage the power",
  "isn't just", "is not just", "more than just", "take your", "to the next level",
  "whether you're", "dive into", "embark", "realm of", "plethora",
];
const HOOK_EMOJI = /^[#\s>*-]*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function signals(repo, readme, tree, ci) {
  const desc = (repo.description || "").trim();
  const rm = readme || "";
  const rmLower = rm.toLowerCase();
  const files = (tree || []).map(f => f.name.toLowerCase());
  const now = Date.now();
  const ageDays = (d) => d ? (now - new Date(d).getTime()) / 86400000 : 9999;

  const imageHits = (rm.match(/!\[[^\]]*\]\([^)]+\)|<img\b|https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)/gi) || []).length;
  const gifHits = (rm.match(/\.gif|\bgif\b|asciinema|demo\.(mp4|webm)/gi) || []).length;
  const headings = (rm.match(/^#{1,6}\s/gm) || []).length;
  const emojiHeadings = (rm.match(/^#{1,6}\s*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gmu) || []).length;
  const codeBlocks = (rm.match(/```/g) || []).length / 2;
  const slopHits = SLOP_PHRASES.reduce((a, p) => a + (rmLower.split(p).length - 1), 0)
                 + SLOP_PHRASES.reduce((a, p) => a + ((desc.toLowerCase().split(p).length - 1)), 0);
  const boldRatio = (rm.match(/\*\*/g) || []).length / Math.max(1, rm.length / 400);

  // first meaningful README line (skip headings, badges, blank, html)
  const readmeFirst = (rm.split(/\r?\n/).map(l => l.trim()).find(l =>
    l && !l.startsWith("#") && !l.startsWith("![") && !l.startsWith("<") &&
    !l.startsWith(">") && !l.startsWith("[!") && !/^[-=*_]{2,}$/.test(l)
  ) || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").slice(0, 160);

  return {
    readmeFirst,
    hasDesc: desc.length > 0,
    descLen: desc.length,
    desc,
    readmeLen: rm.length,
    hasReadme: rm.length > 40,
    imageHits, gifHits, headings, emojiHeadings, codeBlocks,
    slopHits, boldRatio,
    hasLicense: !!repo.licenseInfo,
    topics: (repo.repositoryTopics || []).length,
    stars: repo.stargazerCount || 0,
    forks: repo.forkCount || 0,
    lang: repo.primaryLanguage?.name || "",
    ageDays: ageDays(repo.pushedAt),
    hasTests: files.some(f => /test|spec|__tests__|\.test\.|\.spec\./.test(f)),
    hasCI: !!ci,
    hasContributing: files.includes("contributing.md"),
    hasExamples: files.some(f => /example|demo|docs|samples?/.test(f)),
    fileCount: files.length,
    diskKB: repo.diskUsage || 0,
    isArchived: repo.isArchived,
    isFork: repo.isFork,
  };
}

// star-based confidence bump (real public sentiment). Small orgs mostly 0 stars,
// so this is a gentle additive, capped.
const starLift = (s) => s >= 500 ? 4 : s >= 100 ? 3 : s >= 20 ? 2 : s >= 5 ? 1 : 0;

export function scoreRepo(repo, readme, tree, ci) {
  const s = signals(repo, readme, tree, ci);
  const sc = {};

  // --- Hook (1-5) ---
  const nameQuality = repo.name.length <= 22 && !/[_]{2,}/.test(repo.name) ? 6 : 4;
  sc[1] = clamp(nameQuality + (/-/.test(repo.name) ? 1 : 0) + (repo.name.length < 6 ? -1 : 0));
  sc[2] = clamp(s.hasDesc ? (s.descLen > 30 && s.descLen < 130 ? 8 : 6) : 2);
  sc[3] = clamp(s.imageHits >= 2 ? 9 : s.imageHits === 1 ? 6 : s.gifHits ? 7 : 1);
  sc[4] = clamp((s.hasDesc ? 5 : 2) + (s.imageHits ? 2 : 0) + (s.descLen > 20 && s.descLen < 140 ? 2 : 0));
  sc[5] = clamp(s.hasReadme ? (s.readmeLen > 400 ? 7 : 4) + (s.imageHits ? 1 : 0) : 1);

  // --- Public sentiment (6-10) --- weak without stars, so heuristics + star lift.
  const broad = /monitor|backup|convert|download|remove|clean|self-host|selfhost|proxy|dashboard|bot|cli|tool|generator|viewer|sync|remap/i.test(repo.name + " " + s.desc);
  sc[6] = clamp((broad ? 6 : 4) + starLift(s.stars));
  sc[7] = clamp((broad ? 5 : 4) + (s.topics ? 1 : 0) + starLift(s.stars));
  sc[8] = clamp((s.topics >= 2 ? 6 : broad ? 5 : 3) + Math.min(2, starLift(s.stars)));
  sc[9] = clamp(3 + starLift(s.stars) * 1.5 + (s.forks ? 1 : 0) + (s.imageHits ? 1 : 0));
  sc[10] = clamp((s.imageHits >= 2 ? 6 : 3) + (s.gifHits ? 2 : 0) + Math.min(2, starLift(s.stars)));

  // --- Trust & polish (11-16) ---
  sc[11] = clamp(s.hasLicense ? 9 : 2);
  sc[12] = clamp(s.hasReadme ? (s.headings >= 4 ? 8 : 5) + (s.hasExamples ? 1 : 0) : 1);
  sc[13] = clamp((s.codeBlocks >= 1 ? 6 : 3) + (s.codeBlocks >= 3 ? 2 : 0) + (/npm i|pip install|docker|curl|clone/i.test(readme) ? 1 : 0));
  sc[14] = clamp(s.isArchived ? 2 : s.ageDays < 30 ? 9 : s.ageDays < 120 ? 7 : s.ageDays < 365 ? 5 : 2);
  sc[15] = clamp((s.hasReadme ? 5 : 2) + (s.imageHits ? 2 : 0) + (s.hasLicense ? 1 : 0) + (s.headings >= 3 ? 1 : 0));
  sc[16] = clamp(8 - (/(api[_-]?key|secret|password|token)\s*[:=]\s*[\w-]{8,}/i.test(readme) ? 6 : 0));

  // --- AI-slop signal (17-20) --- goodness (10 = human, 0 = pure slop) ---
  sc[17] = clamp(9 - Math.min(8, s.slopHits * 1.5) - (s.emojiHeadings >= 3 ? 1 : 0));
  sc[18] = clamp(7 - (s.emojiHeadings >= 3 ? 2 : 0) - (s.slopHits >= 4 ? 2 : 0) + (s.diskKB > 200 ? 1 : 0));
  sc[19] = clamp((s.diskKB > 500 ? 8 : s.diskKB > 100 ? 6 : s.fileCount > 8 ? 5 : 3) - (s.slopHits >= 5 ? 1 : 0));
  sc[20] = clamp((s.diskKB > 100 ? 6 : 4) + (s.hasTests ? 1 : 0) + (s.hasCI ? 1 : 0) - (s.emojiHeadings >= 4 ? 2 : 0));

  // --- Substance (21-25) ---
  sc[21] = clamp((s.codeBlocks >= 1 ? 6 : 4) + (s.hasCI ? 2 : 0) + (s.diskKB > 100 ? 1 : 0));
  sc[22] = clamp(broad ? 5 : 6); // generic categories are more crowded
  sc[23] = clamp(s.diskKB > 800 ? 8 : s.diskKB > 200 ? 6 : s.diskKB > 40 ? 5 : 3);
  sc[24] = clamp(3 + (s.hasTests ? 3 : 0) + (s.hasCI ? 3 : 0) + (s.hasContributing ? 1 : 0));
  sc[25] = clamp((s.hasReadme ? 5 : 3) + (s.hasLicense ? 2 : 0) + (s.hasExamples ? 1 : 0));

  // --- Growth & longevity (26-30) ---
  sc[26] = clamp(3 + (s.imageHits >= 2 ? 2 : 0) + starLift(s.stars) + (s.gifHits ? 1 : 0));
  sc[27] = clamp(broad ? 6 : 5);
  sc[28] = clamp((s.hasReadme ? 5 : 3) + (s.imageHits ? 2 : 0) + (s.hasLicense ? 1 : 0) + (s.diskKB > 200 ? 1 : 0));
  sc[29] = clamp(8); // reception-flame risk; sketchy repos handled by routing, not here
  sc[30] = clamp(s.diskKB > 2000 ? 4 : 7);

  // weighted sum
  let raw = 0;
  for (const c of CATEGORIES) raw += (sc[c.id] ?? 0) * c.weight;
  const { capped, caps } = applyCaps(sc, raw);

  return {
    scores: sc,
    signals: s,
    raw: Math.round(raw),
    total: capped,
    caps,
    grade: grade(capped),
    tier: tier(capped),
    slopRisk: slopRisk(sc),
    description: synthDescription(repo, s),
    strengths: topN(sc, 3, true),
    weaknesses: topN(sc, 3, false),
    legal: assessLegal(repo, readme, tree),
  };
}

function topN(sc, n, high) {
  return CATEGORIES
    .map(c => ({ name: c.name, v: sc[c.id] }))
    .sort((a, b) => high ? b.v - a.v : a.v - b.v)
    .slice(0, n);
}

// Build a one-line description when GitHub's is empty, from README/lang.
function synthDescription(repo, s) {
  if (s.hasDesc) return s.desc;
  if (s.readmeFirst) return s.readmeFirst;
  const lang = s.lang ? `${s.lang} ` : "";
  return `${lang}project (no description set)`.trim();
}
