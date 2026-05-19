// 매핑 v4 follow-up: 미매핑 팀 ts dump grep
// CSL/UCL/AFC_CL/COPA_LIB 33팀 후보 발굴 — alias / 부분 매칭 / 같은 competition_id 후보 표시

import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";

interface TSTeam {
  id: string;
  name?: string;
  short_name?: string;
  competition_id?: string;
  country_id?: string;
  foundation_time?: number;
}
interface Unmatched {
  ourId: number; ourName: string; ourLeague: string; ourExternalId: string;
}
interface LeagueMap { code: string; ourLabel: string; tsId: string; tsEn: string; tsKo: string }

const TR_DIR = "/Users/kimss/scorebase/data/thesports-translations";
const BASE_DIR = path.join(TR_DIR, "base");

const tsTeams: TSTeam[] = [];
for (const f of readdirSync(BASE_DIR).filter((x) => x.startsWith("team_page"))) {
  const d = JSON.parse(readFileSync(path.join(BASE_DIR, f), "utf-8"));
  if (Array.isArray(d.results)) tsTeams.push(...d.results);
}
console.log(`ts 팀 dump 로드: ${tsTeams.length}`);

const unmatched: Unmatched[] = JSON.parse(
  readFileSync(path.join(TR_DIR, "_team-id-mapping-unmatched.json"), "utf-8"),
);
const priority = unmatched.filter((u) =>
  ["CSL", "UCL", "AFC_CL", "COPA_LIB"].includes(u.ourLeague),
);

const leagueMap: LeagueMap[] = JSON.parse(
  readFileSync(path.join(TR_DIR, "_our-leagues-thesports-ids.json"), "utf-8"),
);
const leagueToTsComp = new Map<string, string>();
for (const m of leagueMap) leagueToTsComp.set(m.code, m.tsId);

// 검색용 가벼운 normalize (build script v2 보다 관대)
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s가-힣]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length >= 2);
}

// rename / alias 후보 (구→신, 약어→풀네임)
const RENAME_HINTS: Record<string, string[]> = {
  // CSL
  "shanghai sipg": ["shanghai port"],
  "shandong luneng": ["shandong taishan"],
  "henan jianye": ["henan songshan", "henan", "songshan longmen"],
  "tianjin teda": ["tianjin jinmen tiger", "tianjin tigers"],
  "hangzhou greentown": ["zhejiang", "zhejiang professional", "zhejiang lvcheng"],
  "qingdao jonoon": ["qingdao hainiu", "qingdao manatee"],
  "chongqing tongliang long": ["chongqing tonglianglong"],
  "sichuan jiuniu": ["sichuan", "jiuniu"],
  "shenyang urban": ["shenyang"],
  "chengdu better city": ["chengdu rongcheng", "chengdu"],
  "dalian zhixing": ["dalian"],
  // UCL
  "ajax amsterdam": ["ajax"],
  "bodo glimt": ["bodo glimt", "bodo"],
  "fc kobenhavn": ["copenhagen", "fc copenhagen", "kobenhavn"],
  "f c kobenhavn": ["copenhagen", "fc copenhagen"],
  "union st gilloise": ["union saintgilloise", "union saint gilloise", "royale union"],
  "olympiacos": ["olympiakos", "olympiacos piraeus"],
  "fk qarabag": ["qarabag", "qarabag fk"],
  "slavia prague": ["slavia praha", "slavia"],
  // AFC_CL
  "tractor sazi": ["tractor"],
  "ulsan hyundai": ["ulsan hd", "ulsan"],
  "johor darul takzim": ["johor darul tazim", "jdt", "johor"],
  "shabab al ahli dubai": ["shabab al ahli", "shabab al-ahli"],
  "al ahli jeddah": ["al ahli saudi", "al-ahli", "al ahli"],
  "sharjah": ["sharjah"],
  "nasaf": ["nasaf qarshi", "nasaf karshi"],
  // COPA_LIB
  "ucv": ["universidad central", "central de venezuela", "u central venezuela"],
  "estudiantes l p": ["estudiantes", "estudiantes la plata"],
  "junior": ["junior fc", "atletico junior", "junior barranquilla"],
  "independiente medellin": ["independiente medellin", "deportivo independiente medellin", "dim"],
  "independ rivadavia": ["independiente rivadavia"],
  "lanus": ["lanus", "club lanus"],
  "u catolica": ["universidad catolica", "catolica"],
};

interface Candidate {
  tsId: string;
  tsName: string;
  short?: string;
  compId?: string;
  compMatch: boolean;
  source: string; // "name-eq" | "hint" | "token-overlap"
  score: number;
}

function findCandidates(u: Unmatched): Candidate[] {
  const targetComp = leagueToTsComp.get(u.ourLeague);
  const ourNorm = norm(u.ourName);
  const ourTokens = new Set(tokens(u.ourName));
  const hints = (RENAME_HINTS[ourNorm] ?? []).map(norm);

  const cands: Map<string, Candidate> = new Map();
  for (const t of tsTeams) {
    const nm = t.name ? norm(t.name) : "";
    const sn = t.short_name ? norm(t.short_name) : "";
    let source = "";
    let score = 0;

    if (nm === ourNorm || sn === ourNorm) { source = "name-eq"; score = 100; }
    else if (hints.some((h) => h === nm || h === sn)) { source = "hint-eq"; score = 90; }
    else if (hints.some((h) => h && (nm.includes(h) || sn.includes(h)))) { source = "hint-substr"; score = 70; }
    else {
      // token overlap (≥2 토큰 일치, 단 'fc'·'cf' 등 흔한 토큰 제외)
      const skipTok = new Set(["fc", "cf", "sc", "ac", "afc", "the", "de", "club", "city"]);
      const ovr = [...ourTokens].filter((x) => !skipTok.has(x) && (nm.includes(x) || sn.includes(x)));
      if (ovr.length >= 2) { source = `token-overlap:${ovr.join(",")}`; score = 50 + ovr.length; }
    }
    if (!source) continue;

    const compMatch = !!(targetComp && t.competition_id === targetComp);
    if (compMatch) score += 30;
    cands.set(t.id, {
      tsId: t.id, tsName: t.name ?? "", short: t.short_name, compId: t.competition_id,
      compMatch, source, score,
    });
  }
  return [...cands.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

const report: Record<string, Array<{ team: Unmatched; cands: Candidate[] }>> = {};
for (const u of priority) {
  const cands = findCandidates(u);
  if (!report[u.ourLeague]) report[u.ourLeague] = [];
  report[u.ourLeague].push({ team: u, cands });
}

// 출력
for (const lg of ["UCL", "AFC_CL", "CSL", "COPA_LIB"]) {
  console.log(`\n========== ${lg} (targetComp=${leagueToTsComp.get(lg)}) ==========`);
  for (const { team, cands } of report[lg] ?? []) {
    console.log(`\n  [${team.ourId}] ${team.ourName}  (extId=${team.ourExternalId})`);
    if (cands.length === 0) { console.log(`     ❌ 후보 없음`); continue; }
    for (const c of cands) {
      const compIcon = c.compMatch ? "✓comp" : "·comp" + (c.compId ? `=${c.compId.slice(0, 6)}…` : "");
      console.log(`     ${c.score}  ${c.tsId}  ${c.tsName}${c.short && c.short !== c.tsName ? ` (${c.short})` : ""}  [${compIcon}]  ${c.source}`);
    }
  }
}

writeFileSync(
  path.join(TR_DIR, "_v4-priority-candidates.json"),
  JSON.stringify(report, null, 2),
);
console.log(`\n저장: ${path.join(TR_DIR, "_v4-priority-candidates.json")}`);
