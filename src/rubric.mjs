// The Kitsune Market-Reception Rubric (0-1000, F to S++++)
// Adapted from the Kitsune Business Grading Rubric, re-pointed from "is this a good
// business" to "how will the public receive this repo if it is open-sourced and posted."
// 30 categories, weights sum to 100, each scored 0-10, max total 1000.

export const GROUPS = {
  hook:      { label: "Hook & First Impression", blurb: "the make-or-break of a Reddit/HN post" },
  sentiment: { label: "Public Sentiment & Desire", blurb: "will people actually want it" },
  trust:     { label: "Trust & Polish",            blurb: "does it look credible and safe" },
  slop:      { label: "AI-Slop Signal",            blurb: "does it smell machine-generated (lower is better)" },
  substance: { label: "Substance",                 blurb: "is there a real thing under the pitch" },
  growth:    { label: "Growth & Longevity",        blurb: "will it spread and last" },
};

// inverse: true means a HIGH raw signal is BAD; the scorer already emits the 0-10 as
// "goodness" (10 = best reception), so inverse is documentation for the slop axes.
export const CATEGORIES = [
  // --- Hook & first impression (weight 5) ---
  { id: 1,  group: "hook",      weight: 5, name: "Name & hook",            hi: "instantly gettable, memorable name" },
  { id: 2,  group: "hook",      weight: 5, name: "One-line pitch",         hi: "a single sentence sells it" },
  { id: 3,  group: "hook",      weight: 5, name: "Visual proof",           hi: "screenshot / gif / live demo up top" },
  { id: 4,  group: "hook",      weight: 5, name: "5-second clarity",       hi: "you understand it at a glance" },
  { id: 5,  group: "hook",      weight: 5, name: "README first screen",    hi: "the top of the README does the work" },
  // --- Public sentiment & desire (weight 5) ---
  { id: 6,  group: "sentiment", weight: 5, name: "Real problem",           hi: "solves a genuine, felt pain" },
  { id: 7,  group: "sentiment", weight: 5, name: "Audience size",          hi: "lots of people plausibly care" },
  { id: 8,  group: "sentiment", weight: 5, name: "Community fit",          hi: "an obvious subreddit/forum wants it" },
  { id: 9,  group: "sentiment", weight: 5, name: "Shareability",           hi: "people would star, fork, repost it" },
  { id: 10, group: "sentiment", weight: 5, name: "Delight / wow",          hi: "makes someone go 'oh nice'" },
  // --- Trust & polish (weight 3) ---
  { id: 11, group: "trust",     weight: 3, name: "License clarity",        hi: "clear OSS license present" },
  { id: 12, group: "trust",     weight: 3, name: "Docs completeness",      hi: "install/use/config all covered" },
  { id: 13, group: "trust",     weight: 3, name: "Low setup friction",     hi: "runs in a couple of commands" },
  { id: 14, group: "trust",     weight: 3, name: "Freshness",              hi: "recently touched, looks alive" },
  { id: 15, group: "trust",     weight: 3, name: "Presentation polish",    hi: "clean, professional look" },
  { id: 16, group: "trust",     weight: 3, name: "Security/privacy optics",hi: "no leaked keys, no sketchy asks" },
  // --- AI-slop signal (weight 3, inverse) ---
  { id: 17, group: "slop",      weight: 3, name: "Not AI-slop copy",       hi: "human voice, no buzzword sludge", inverse: true },
  { id: 18, group: "slop",      weight: 3, name: "Original, not template", hi: "not a generic scaffolded clone", inverse: true },
  { id: 19, group: "slop",      weight: 3, name: "Depth, not wrapper",     hi: "real logic, not a thin API shim", inverse: true },
  { id: 20, group: "slop",      weight: 3, name: "Human craft signals",    hi: "real commits, intent, personality", inverse: true },
  // --- Substance (weight 2) ---
  { id: 21, group: "substance", weight: 2, name: "Actually works",         hi: "a stranger can run it and it does the thing" },
  { id: 22, group: "substance", weight: 2, name: "Uniqueness vs field",    hi: "not the 50th of its kind" },
  { id: 23, group: "substance", weight: 2, name: "Feature completeness",   hi: "does enough to be useful, not a stub" },
  { id: 24, group: "substance", weight: 2, name: "Code-quality signals",   hi: "tests, CI, structure visible" },
  { id: 25, group: "substance", weight: 2, name: "Hackability",            hi: "easy to fork, extend, self-host" },
  // --- Growth & longevity (weight 2) ---
  { id: 26, group: "growth",    weight: 2, name: "Virality potential",     hi: "one good post could take off" },
  { id: 27, group: "growth",    weight: 2, name: "Longevity",              hi: "evergreen, not a dead-in-a-month fad" },
  { id: 28, group: "growth",    weight: 2, name: "Portfolio value",        hi: "makes the author look good to employers" },
  { id: 29, group: "growth",    weight: 2, name: "Low flame risk",         hi: "won't get roasted/DMCA'd/banned", inverse: true },
  { id: 30, group: "growth",    weight: 2, name: "Low maintenance drag",   hi: "cheap to keep alive after launch", inverse: true },
];

// Weights already sum to 100:  hook 5x5=25, sentiment 5x5=25, trust 6x3=18,
// slop 4x3=12, substance 5x2=10, growth 5x2=10  ->  100.  Max score = 1000.

// Nonlinear grade bands (same shape as the business rubric: wide low, tight high).
export const BANDS = [
  [995, "S++++"], [988, "S+++"], [980, "S++"], [970, "S+"], [960, "S"], [950, "S-"],
  [925, "A++++"], [900, "A+++"], [850, "A++"], [800, "A+"], [750, "A"], [700, "A-"],
  [680, "B++++"], [660, "B+++"], [640, "B++"], [620, "B+"], [600, "B"], [580, "B-"],
  [555, "C++++"], [530, "C+++"], [505, "C++"], [480, "C+"], [455, "C"], [430, "C-"],
  [400, "D++++"], [370, "D+++"], [340, "D++"], [310, "D+"], [280, "D"], [250, "D-"],
  [220, "F++++"], [190, "F+++"], [160, "F++"], [130, "F+"], [100, "F"], [1, "F-"],
];

export function grade(score) {
  for (const [min, g] of BANDS) if (score >= min) return g;
  return "F-";
}

// Tier family for coloring/summary.
export function tier(score) {
  const g = grade(score);
  return g[0]; // S / A / B / C / D / F
}

// Kill-switch caps (public-reception version):
//  - any Hook or Sentiment (weight-5) category at 0-1 caps at 579 (a broken hook or
//    a thing nobody wants can't be a great post no matter how clean the code).
//  - two+ weight-5 at 0-1 caps at 429.
//  - Security optics (#16) at 0-1 caps at 599 (leaked keys / sketch tanks reception).
//  - S-tier gated: needs all ten weight-5 at 9+.
export function applyCaps(scores, rawTotal) {
  const w5 = CATEGORIES.filter(c => c.weight === 5).map(c => scores[c.id]);
  const low5 = w5.filter(s => s <= 1).length;
  const caps = [];
  let capped = rawTotal;
  if (scores[16] <= 1) { caps.push("security optics 0-1 -> cap 599"); capped = Math.min(capped, 599); }
  if (low5 >= 2)       { caps.push("2+ hook/sentiment killers 0-1 -> cap 429"); capped = Math.min(capped, 429); }
  else if (low5 === 1) { caps.push("1 hook/sentiment killer 0-1 -> cap 579"); capped = Math.min(capped, 579); }
  if (!w5.every(s => s >= 9)) capped = Math.min(capped, 949); // S-tier gate
  if (!w5.every(s => s >= 10)) capped = Math.min(capped, 994);
  return { capped: Math.max(1, Math.round(capped)), caps };
}

// AI-Slop Risk is surfaced as its own 0-100 headline (100 = maximum slop).
// Built from the four inverse slop axes (#17-20): goodness 10 -> 0 risk.
export function slopRisk(scores) {
  const ids = [17, 18, 19, 20];
  const goodness = ids.reduce((a, id) => a + scores[id], 0) / ids.length; // 0-10
  return Math.round((10 - goodness) * 10); // 0-100
}
