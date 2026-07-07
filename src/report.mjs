// Static HTML "scouting report" generator.
// Visual system matches tools.kitsunetechnologies.org/ideas.html (the "AI Ideas - Ranked"
// board): dark, green accent, podium + sticky re-weightable preset controls + a sortable
// table whose rows expand to a full per-dimension breakdown. Self-contained, theme-aware.
import { CATEGORIES, GROUPS, BANDS, applyCaps, grade, tier, slopRisk } from "./rubric.mjs";

// Re-apply AI subjective scores onto a heuristic result and recompute the total.
export function SUBJECTIVE_APPLY(result, aiScores) {
  for (const [id, v] of Object.entries(aiScores)) {
    const n = Number(v);
    if (Number.isFinite(n)) result.scores[id] = Math.max(0, Math.min(10, Math.round(n)));
  }
  let raw = 0;
  for (const c of CATEGORIES) raw += (result.scores[c.id] ?? 0) * c.weight;
  const { capped, caps } = applyCaps(result.scores, raw);
  result.raw = Math.round(raw);
  result.total = capped;
  result.caps = caps;
  result.grade = grade(capped);
  result.tier = tier(capped);
  result.slopRisk = slopRisk(result.scores);
  const rank = (high) => CATEGORIES.map(c => ({ name: c.name, v: result.scores[c.id] }))
    .sort((a, b) => high ? b.v - a.v : a.v - b.v).slice(0, 3);
  result.strengths = rank(true);
  result.weaknesses = rank(false);
}

export function buildReport(data) {
  const { owner, generated, repos } = data;

  // Dimension metadata (30 categories in id order).
  const DIM = CATEGORIES.map(c => c.name);
  const SHORT = CATEGORIES.map(c => shortName(c.name));
  const GRP = CATEGORIES.map(c => c.group);
  const GROUP_LABELS = Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, v.label]));
  const DEFAULT_W = CATEGORIES.map(c => c.weight);

  // Per-repo compact record. s[] = 30 dimension scores scaled to 0-1000 (id order).
  const D = repos.map(g => ({
    n: g.repo.name,
    u: g.repo.url,
    pv: g.repo.isPrivate ? 1 : 0,
    c: g.repo.primaryLanguage?.name || "-",
    st: g.repo.stargazerCount || 0,
    ts: g.repo.pushedAt ? new Date(g.repo.pushedAt).getTime() : 0,
    sl: g.slopRisk,
    ds: g.description || "",
    up: g.strengths.map(x => x.name),
    dn: g.weaknesses.map(x => x.name),
    cap: g.caps || [],
    lg: g.legal || { oss: "safe", legal: "clean", flags: [], reason: "", license: "" },
    s: CATEGORIES.map(c => (g.scores[c.id] ?? 0) * 100),
  }));

  const cats = [...new Set(D.map(d => d.c))].sort();
  const payload = JSON.stringify({ owner, generated, DIM, SHORT, GRP, GROUP_LABELS, DEFAULT_W, BANDS, cats, D });

  return HTML_HEAD + `<script>const PAYLOAD=${payload};</script>` + HTML_APP;
}

function shortName(n) {
  return n.replace("README first screen", "READMEtop").replace("Security/privacy optics", "Sec optics")
    .replace(/^Not AI-slop copy$/, "No slop").replace("Original, not template", "Original")
    .replace("Depth, not wrapper", "Depth").replace("Human craft signals", "Craft")
    .replace("Low setup friction", "Setup").replace("Presentation polish", "Polish")
    .replace("Docs completeness", "Docs").replace("License clarity", "License")
    .replace("Code-quality signals", "Codequal").replace("Feature completeness", "Complete")
    .replace("Uniqueness vs field", "Unique").replace("Actually works", "Works")
    .replace("Portfolio value", "Portfolio").replace("Virality potential", "Viral")
    .replace("Low flame risk", "Safe").replace("Low maintenance drag", "Lowmaint")
    .replace("Community fit", "Commfit").replace("Audience size", "Audience")
    .replace("Real problem", "Problem").replace("One-line pitch", "Pitch")
    .replace("Visual proof", "Visual").replace("5-second clarity", "Clarity")
    .replace("Name & hook", "Name").replace("Delight / wow", "Wow")
    .replace("Shareability", "Share").replace("Freshness", "Fresh")
    .slice(0, 9);
}

const HTML_HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Repo Scouting Report · Kitsune Repo Scanner</title>
<style>
  :root{
    --bg:#0e1013; --panel:#15181d; --panel2:#1b1f26; --line:#262b34; --line2:#333a45;
    --ink:#e8eaed; --ink2:#9aa2ad; --ink3:#6b7280;
    --accent:#5fd0a8; --accent2:#3a8f74; --gold:#e0b34a;
    --c1:#e2b33a; --c2:#c0c4cb; --c3:#c98a4b;
    --mono:ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
    --sans:ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;
    --slopgood:#5fd0a8; --slopbad:#d46a5a;
  }
  :root[data-theme="light"]{
    --bg:#f2f3f1; --panel:#ffffff; --panel2:#f7f8f6; --line:#e2e4e1; --line2:#d2d5d1;
    --ink:#14171b; --ink2:#565d66; --ink3:#8a909a;
    --accent:#1f8f6a; --accent2:#2f9c78; --gold:#a8781f;
  }
  @media(prefers-color-scheme:light){:root:not([data-theme="dark"]){
    --bg:#f2f3f1; --panel:#fff; --panel2:#f7f8f6; --line:#e2e4e1; --line2:#d2d5d1;
    --ink:#14171b; --ink2:#565d66; --ink3:#8a909a; --accent:#1f8f6a; --accent2:#2f9c78; --gold:#a8781f;
  }}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1300px;margin:0 auto;padding:0 22px}
  header{border-bottom:1px solid var(--line);padding:36px 0 26px}
  .kicker{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin:0 0 13px}
  h1{font-weight:800;letter-spacing:-.02em;font-size:clamp(28px,4.6vw,48px);line-height:1.03;margin:0;text-wrap:balance}
  h1 em{font-style:normal;color:var(--ink2);font-weight:500}
  .sub{color:var(--ink2);margin:15px 0 0;max-width:70ch}
  .meta{display:flex;gap:24px;flex-wrap:wrap;margin-top:20px;font-family:var(--mono);font-size:12px;color:var(--ink3)}
  .meta b{color:var(--ink);font-weight:600}
  .podium{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:26px 0 6px}
  .pod{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:20px;position:relative;overflow:hidden}
  .pod.p1{border-color:var(--c1)}.pod.p2{border-color:var(--line2)}.pod.p3{border-color:var(--c3)}
  .pod .medal{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
  .pod.p1 .medal{color:var(--c1)}.pod.p2 .medal{color:var(--c2)}.pod.p3 .medal{color:var(--c3)}
  .pod .pname{font-size:22px;font-weight:800;letter-spacing:-.01em;margin:8px 0 2px;word-break:break-word}
  .pod .pname a{color:inherit;text-decoration:none}.pod .pname a:hover{color:var(--accent)}
  .pod .pcat{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
  .pod .pscore{font-family:var(--mono);font-size:40px;font-weight:800;letter-spacing:-.02em;margin:12px 0 0;color:var(--accent);font-variant-numeric:tabular-nums}
  .pod .pscore .g{font-size:17px;color:var(--gold);margin-left:8px}
  .pod .pscore span.o{font-size:15px;color:var(--ink3)}
  .pod .pverd{color:var(--ink2);font-size:13px;margin-top:8px;line-height:1.4}
  .controls{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:13px 0;margin-top:22px}
  .controls .wrap{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .presets{display:flex;gap:5px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:4px}
  .pbtn{font-family:var(--mono);font-size:11.5px;background:transparent;border:0;color:var(--ink2);padding:7px 12px;border-radius:6px;cursor:pointer;transition:.12s;white-space:nowrap}
  .pbtn:hover{color:var(--ink)} .pbtn.on{background:var(--accent);color:#08110d;font-weight:700}
  #q{flex:1;min-width:160px;background:var(--panel);border:1px solid var(--line);color:var(--ink);font-family:var(--mono);font-size:13px;padding:9px 13px;border-radius:8px;outline:none}
  #q:focus{border-color:var(--accent)}
  select{background:var(--panel);border:1px solid var(--line);color:var(--ink);font-family:var(--mono);font-size:12px;padding:8px 10px;border-radius:8px;outline:none;cursor:pointer}
  .count{font-family:var(--mono);font-size:12px;color:var(--ink3);white-space:nowrap}
  .presetnote{font-family:var(--mono);font-size:11px;color:var(--ink3);padding:10px 0 0}
  .presetnote b{color:var(--accent)}
  main{padding:16px 0 70px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead th{position:sticky;top:56px;background:var(--bg);text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:600;padding:10px 8px;border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap;user-select:none}
  thead th:hover{color:var(--ink)} thead th.sorted{color:var(--accent)}
  th.rk,td.rk{text-align:center;width:44px}
  th.sc,td.sc{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr{border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s}
  tbody tr:hover{background:var(--panel)} tbody tr.open{background:var(--panel)}
  td{padding:11px 8px;vertical-align:middle}
  .rank{font-family:var(--mono);font-weight:700;color:var(--ink3);font-variant-numeric:tabular-nums}
  tr.top3 .rank{color:var(--gold)}
  .nm{font-weight:700;font-size:14.5px}
  .nm .pv{font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);border:1px solid var(--line);border-radius:10px;padding:1px 6px;margin-left:7px;vertical-align:1px}
  .ct{font-family:var(--mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);margin-top:1px;display:flex;gap:10px;align-items:center}
  .slopchip{color:var(--ink2)} .slopchip b{font-weight:700}
  .spark{display:flex;gap:2px;align-items:flex-end;height:26px}
  .spark i{width:4px;border-radius:1px;background:var(--accent);opacity:.5}
  .gradecell{display:flex;align-items:center;gap:9px;justify-content:flex-end}
  .gbadge{font-family:var(--mono);font-weight:800;font-size:13px;color:var(--gold);min-width:44px;text-align:right}
  .compbar{width:70px;height:7px;background:var(--panel2);border-radius:4px;overflow:hidden}
  .compbar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent2),var(--accent));border-radius:4px}
  .compval{font-family:var(--mono);font-weight:700;font-size:14px;color:var(--accent);min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
  .detail td{padding:0;border-bottom:1px solid var(--line)}
  .dbox{padding:6px 14px 22px 52px;display:grid;grid-template-columns:1.15fr .85fr;gap:26px}
  .dcol .gh{font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--accent);margin:12px 0 6px}
  .dcol .gh:first-child{margin-top:0}
  .dim{display:flex;align-items:center;gap:9px;margin:4px 0}
  .dim .dl{font-family:var(--mono);font-size:11px;color:var(--ink2);width:150px;flex-shrink:0}
  .dim .db{flex:1;height:8px;background:var(--panel2);border-radius:4px;overflow:hidden}
  .dim .db i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--accent2),var(--accent))}
  .dim .dv{font-family:var(--mono);font-size:11px;color:var(--ink);width:26px;text-align:right;font-variant-numeric:tabular-nums}
  .dside .dl2{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);margin:14px 0 5px}
  .dside .dl2:first-child{margin-top:0}
  .dside p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink)}
  .taglist{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
  .tag{font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:20px;border:1px solid var(--line);color:var(--ink2)}
  .tag.up{color:var(--accent);border-color:var(--accent2)} .tag.dn{color:var(--c3);border-color:var(--c3)}
  .slopmeter{display:flex;align-items:center;gap:9px;margin-top:5px}
  .slopmeter .sb{flex:1;height:8px;border-radius:4px;background:var(--panel2);overflow:hidden}
  .slopmeter .sb i{display:block;height:100%;border-radius:4px}
  .slopmeter .sv{font-family:var(--mono);font-size:12px;font-weight:700;width:26px;text-align:right}
  .capnote{font-family:var(--mono);font-size:10.5px;color:var(--c3);margin-top:8px}
  .oss{font-family:var(--mono);font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;border-radius:10px;padding:1px 7px}
  .oss.safe{color:#0c1a12;background:var(--accent)}
  .oss.border{color:#1c1405;background:var(--gold)}
  .oss.no{color:#fff;background:#c0483a}
  .legalbox{margin-top:6px;padding:11px 13px;border:1px solid var(--line);border-radius:9px;background:var(--panel2)}
  .legalbox .lh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}
  .legalbox .lv{font-family:var(--mono);font-size:11px;color:var(--ink2)}
  .legalbox .lv b{color:var(--ink)}
  .legalbox .lflags{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}
  .legalbox .lflag{font-family:var(--mono);font-size:10px;padding:2px 7px;border-radius:10px;border:1px solid var(--c3);color:var(--c3)}
  .legalbox .lr{font-size:12.5px;color:var(--ink);margin:5px 0 0;line-height:1.45}
  .legalbox .lic{font-family:var(--mono);font-size:11px;color:var(--ink2);margin-top:6px}
  .legalbox .sec{color:#e08a5a;font-weight:700}
  .aiflag{font-family:var(--mono);font-size:9px;color:var(--accent);border:1px solid var(--accent2);border-radius:8px;padding:0 5px;margin-left:5px}
  .glink{font-family:var(--mono);font-size:12px;color:var(--accent);text-decoration:none} .glink:hover{text-decoration:underline}
  footer{border-top:1px solid var(--line);padding:24px 0;color:var(--ink3);font-family:var(--mono);font-size:11px;text-align:center;line-height:1.7}
  .scrollx{overflow-x:auto}
  @media(max-width:820px){.podium{grid-template-columns:1fr}.dbox{grid-template-columns:1fr;padding-left:14px}.dim .dl{width:120px}}
</style>`;

// Client app - no template literals / backticks inside (kept plain to embed safely).
const HTML_APP = `
<header><div class="wrap">
  <p class="kicker" id="kicker"></p>
  <h1 id="h1"></h1>
  <p class="sub">Every repo scored across <b>30 market-reception dimensions</b> (hook, public sentiment, trust, AI-slop, substance, growth), 0&ndash;1000, F to S++++. The composite is a live weighted blend: switch the strategy to re-rank the whole board for what to <b>post first</b>, what's <b>least AI-slop</b>, or the <b>fastest wins</b>.</p>
  <div class="meta" id="meta"></div>
</div></header>
<div class="wrap"><div class="podium" id="podium"></div></div>
<div class="controls"><div class="wrap">
  <div class="presets" id="presets"></div>
  <input id="q" placeholder="search repos..." autocomplete="off">
  <select id="oss"></select>
  <select id="cat"></select>
  <select id="sort"></select>
  <span class="count" id="count"></span>
</div></div>
<div class="wrap"><div class="presetnote" id="pnote"></div></div>
<main><div class="wrap scrollx">
  <table><thead><tr id="head"></tr></thead><tbody id="body"></tbody></table>
</div></main>
<footer><div class="wrap" id="foot"></div></footer>
<script>
const P=PAYLOAD, D=P.D, DIM=P.DIM, SHORT=P.SHORT, GRP=P.GRP, GL=P.GROUP_LABELS, BANDS=P.BANDS;
const GORDER=["hook","sentiment","trust","slop","substance","growth"];
const PRESETS={
  balanced:{label:"Balanced",w:P.DEFAULT_W,d:"The full rubric weights: hook and public sentiment lead, trust and AI-slop next, substance and growth round it out."},
  postfirst:{label:"Post first",w:[10,10,10,10,10, 10,10,10,10,10, 3,3,4,4,5,4, 3,3,2,3, 1,2,2,1,2, 8,3,6,3,2],d:"What to release and post NOW: hook, public sentiment, shareability, and virality dominate; code substance barely counts."},
  antislop:{label:"Least slop",w:[2,3,2,4,3, 2,2,2,2,3, 3,3,2,3,4,3, 12,12,12,12, 3,8,3,4,3, 2,3,3,2,2],d:"Ranks by human craft: the four AI-slop axes plus originality and depth carry the weight. Top = least machine-generated."},
  fastwin:{label:"Fast wins",w:[7,7,6,7,6, 6,6,6,6,6, 6,7,8,7,7,5, 3,3,3,3, 7,4,5,3,5, 5,4,6,3,7],d:"Lowest effort to ship and post: freshness, low setup friction, docs, polish, and works-out-of-the-box weighted up."}
};
let preset="balanced", sortKey="score", sortDir=-1, openRow=null;

function composite(d,w){let s=0,tw=0;for(let i=0;i<30;i++){s+=d.s[i]*w[i];tw+=w[i];}return Math.round(s/tw);}
function grade(v){for(const b of BANDS)if(v>=b[0])return b[1];return "F-";}
function slopColor(v){const h=Math.round(150-(v/100)*150);return "hsl("+h+" 55% 52%)";}
const OSSCLS={safe:"safe",borderline:"border",no:"no"};
const OSSLBL={safe:"OSS-safe",borderline:"borderline",no:"no-OSS"};
function ageStr(ts){if(!ts)return "-";const d=(Date.now()-ts)/86400000;if(d<31)return Math.max(1,Math.round(d))+"d";if(d<365)return Math.round(d/30)+"mo";return (d/365).toFixed(1)+"y";}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function enrich(){const w=PRESETS[preset].w;D.forEach(d=>{d.comp=composite(d,w);d.gr=grade(d.comp);});}

function podium(rows){
  const box=document.getElementById("podium");box.innerHTML="";
  rows.slice(0,3).forEach((d,i)=>{
    const el=document.createElement("div");el.className="pod p"+(i+1);
    el.innerHTML='<div class="medal">'+["1st pick","2nd","3rd"][i]+'</div>'+
      '<div class="pname"><a href="'+esc(d.u)+'" target="_blank" rel="noopener">'+esc(d.n)+'</a></div>'+
      '<div class="pcat">'+esc(d.c)+(d.pv?" · private":" · public")+'</div>'+
      '<div class="pscore">'+d.comp+'<span class="o">/1000</span><span class="g">'+d.gr+'</span></div>'+
      '<div class="pverd">'+esc(d.ds).slice(0,150)+'</div>';
    box.appendChild(el);
  });
}

function sparkline(d){let h="";for(let i=0;i<30;i++){h+='<i style="height:'+Math.max(2,d.s[i]/1000*26)+'px"></i>';}return h;}

function detail(d){
  let grp="";let cur=null;
  for(let i=0;i<30;i++){
    if(GRP[i]!==cur){cur=GRP[i];grp+='<div class="gh">'+esc(GL[cur])+'</div>';}
    grp+='<div class="dim"><span class="dl">'+esc(DIM[i])+'</span><span class="db"><i style="width:'+(d.s[i]/1000*100)+'%"></i></span><span class="dv">'+Math.round(d.s[i]/100)+'</span></div>';
  }
  const up=d.up.map(t=>'<span class="tag up">'+esc(t)+'</span>').join("");
  const dn=d.dn.map(t=>'<span class="tag dn">'+esc(t)+'</span>').join("");
  const cap=d.cap&&d.cap.length?'<div class="capnote">caps at default weights: '+d.cap.map(esc).join(" · ")+'</div>':"";
  const L=d.lg||{oss:"safe",legal:"clean",flags:[],reason:"",license:""};
  const lflags=(L.flags||[]).map(f=>'<span class="lflag">'+esc(f)+'</span>').join("");
  const legalBox='<div class="dl2">legal &amp; open-source readiness</div>'+
    '<div class="legalbox"><div class="lh">'+
      '<span class="oss '+(OSSCLS[L.oss]||"safe")+'">'+(OSSLBL[L.oss]||L.oss)+'</span>'+
      '<span class="lv">legal status: <b>'+esc(L.legal)+'</b></span>'+
      '<span class="lv">route: <b>'+esc(L.route||(L.oss==="safe"?"kitsunetech1":"personal"))+'</b></span>'+
      (L.aiJudged?'<span class="aiflag">AI-judged</span>':'')+
    '</div>'+
    (lflags?'<div class="lflags">'+lflags+'</div>':'')+
    '<p class="lr">'+esc(L.reason||"")+'</p>'+
    (L.secrets?'<p class="lr"><span class="sec">! possible secret/key committed - scrub before publishing.</span></p>':'')+
    '<div class="lic">'+esc(L.license||"")+'</div>'+
    '</div>';
  return '<div class="dbox"><div class="dcol">'+grp+'</div>'+
    '<div class="dside">'+
      '<div class="dl2">what it is</div><p>'+esc(d.ds)+'</p>'+
      legalBox+
      '<div class="dl2">AI-slop risk</div><div class="slopmeter"><span class="sb"><i style="width:'+d.sl+'%;background:'+slopColor(d.sl)+'"></i></span><span class="sv" style="color:'+slopColor(d.sl)+'">'+d.sl+'</span></div>'+
      '<div class="dl2">sells it</div><div class="taglist">'+up+'</div>'+
      '<div class="dl2">holds it back</div><div class="taglist">'+dn+'</div>'+
      cap+
      '<div class="dl2">link</div><a class="glink" href="'+esc(d.u)+'" target="_blank" rel="noopener">'+esc(d.u.replace("https://github.com/",""))+' →</a>'+
    '</div></div>';
}

function render(){
  enrich();
  const term=document.getElementById("q").value.trim().toLowerCase();
  const catf=document.getElementById("cat").value;
  const ossf=document.getElementById("oss").value;
  let rows=D.filter(d=>(!term||d.n.toLowerCase().includes(term)||d.ds.toLowerCase().includes(term))&&(!catf||d.c===catf)&&(!ossf||d.lg.oss===ossf));
  // sort
  rows.sort((a,b)=>{
    if(sortKey==="name")return sortDir*a.n.localeCompare(b.n);
    const map={score:"comp",slop:"sl",stars:"st",fresh:"ts"};const f=map[sortKey]||"comp";
    return sortDir*(a[f]-b[f]);
  });
  podium([...rows].sort((a,b)=>b.comp-a.comp));
  const body=document.getElementById("body");body.innerHTML="";
  rows.forEach((d,idx)=>{
    const tr=document.createElement("tr");tr.className=idx<3&&sortKey==="score"&&sortDir<0?"top3":"";
    tr.innerHTML='<td class="rk"><span class="rank">'+(idx+1)+'</span></td>'+
      '<td><div class="nm">'+esc(d.n)+(d.pv?'<span class="pv">priv</span>':'')+'</div>'+
        '<div class="ct"><span class="oss '+(OSSCLS[d.lg.oss]||"safe")+'">'+(OSSLBL[d.lg.oss]||"")+'</span>'+
        '<span>'+esc(d.c)+'</span><span>★ '+d.st+'</span><span>'+ageStr(d.ts)+'</span>'+
        '<span class="slopchip">slop <b style="color:'+slopColor(d.sl)+'">'+d.sl+'</b></span></div></td>'+
      '<td><div class="spark">'+sparkline(d)+'</div></td>'+
      '<td class="sc"><div class="gradecell"><span class="gbadge">'+d.gr+'</span>'+
        '<span class="compbar"><i style="width:'+(d.comp/1000*100)+'%"></i></span>'+
        '<span class="compval">'+d.comp+'</span></div></td>';
    tr.addEventListener("click",()=>toggle(d,tr));
    body.appendChild(tr);
  });
  document.getElementById("count").textContent=rows.length+" repos";
  document.getElementById("pnote").innerHTML="<b>"+PRESETS[preset].label+".</b> "+PRESETS[preset].d;
}

function toggle(d,tr){
  const nx=tr.nextElementSibling;
  if(nx&&nx.classList.contains("detail")){nx.remove();tr.classList.remove("open");return;}
  document.querySelectorAll("tr.detail").forEach(e=>e.remove());
  document.querySelectorAll("tr.open").forEach(e=>e.classList.remove("open"));
  const dr=document.createElement("tr");dr.className="detail";
  dr.innerHTML='<td colspan="4">'+detail(d)+'</td>';
  tr.after(dr);tr.classList.add("open");
}

function boot(){
  document.getElementById("kicker").textContent="Kitsune Repo Scanner // "+P.owner+" · 30-dimension market-reception scoring";
  document.getElementById("h1").innerHTML=esc(P.owner)+", <em>every repo ranked</em>";
  const avg=Math.round(D.reduce((a,d)=>a+composite(d,P.DEFAULT_W),0)/D.length);
  const avgslop=Math.round(D.reduce((a,d)=>a+d.sl,0)/D.length);
  const oc={safe:0,borderline:0,no:0};D.forEach(d=>oc[d.lg.oss]=(oc[d.lg.oss]||0)+1);
  document.getElementById("meta").innerHTML=
    "<span><b>"+D.length+"</b> repos</span><span><b>30</b> dimensions each</span>"+
    "<span>avg <b>"+avg+"</b>/1000</span>"+
    "<span>avg slop <b>"+avgslop+"</b></span>"+
    "<span style='color:var(--accent)'><b>"+oc.safe+"</b> OSS-safe</span>"+
    "<span style='color:var(--gold)'><b>"+oc.borderline+"</b> borderline</span>"+
    "<span style='color:#d46a5a'><b>"+oc.no+"</b> do-not-OSS</span>";
  const pr=document.getElementById("presets");
  Object.keys(PRESETS).forEach(k=>{const b=document.createElement("button");b.className="pbtn"+(k===preset?" on":"");b.textContent=PRESETS[k].label;b.onclick=()=>{preset=k;[...pr.children].forEach(c=>c.classList.remove("on"));b.classList.add("on");render();};pr.appendChild(b);});
  const cat=document.getElementById("cat");cat.innerHTML='<option value="">all languages</option>'+P.cats.map(c=>'<option>'+esc(c)+'</option>').join("");
  cat.onchange=render;
  const oss=document.getElementById("oss");
  oss.innerHTML='<option value="">all OSS status</option>'+
    '<option value="safe">OSS-safe ('+oc.safe+')</option>'+
    '<option value="borderline">borderline ('+oc.borderline+')</option>'+
    '<option value="no">do-not-OSS ('+oc.no+')</option>';
  oss.onchange=render;
  const sort=document.getElementById("sort");
  [["score","sort: score"],["slop","sort: AI-slop"],["stars","sort: stars"],["fresh","sort: freshness"],["name","sort: A-Z"]].forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;sort.appendChild(o);});
  sort.onchange=()=>{sortKey=sort.value;sortDir=(sortKey==="name")?1:-1;render();};
  document.getElementById("q").addEventListener("input",render);
  document.getElementById("head").innerHTML='<th class="rk">#</th><th>Repo</th><th>30 dims</th><th class="sc">Grade · Score</th>';
  document.getElementById("foot").innerHTML="Weighted composite of 30 market-reception dimensions; strategy presets re-weight and re-rank live. Scores are heuristic signals of PUBLIC reception, not code-quality guarantees. AI-slop risk = inverse of the four craft/originality axes (higher = smells more machine-generated).";
  render();
}
boot();
</script>`;
