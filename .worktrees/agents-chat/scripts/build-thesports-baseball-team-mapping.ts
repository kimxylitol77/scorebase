// KBO/NPB/MLB ts team → 우리 DB team 매핑 빌드.
//
// 흐름:
//   1) baseball/match/diary 7일 sweep → KBO/NPB/MLB unique_tournament_id 매치의 home/away_team_id 수집
//   2) 각 tsTeamId 별 baseball/team/list?uuid={tsId} → name/short_name/abbr 획득
//   3) 우리 DB team (52팀: KBO 10 + NPB 12 + MLB 30) 과 이름 매칭
//   4) src/lib/sports/thesports/baseball-team-id-mapping.json 저장
//
// IP whitelist 필수.

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import { toKoreanTeamName } from "../src/lib/team-names";

const TS_BASE = "https://api.thesports.com";
const env: Record<string, string> = {};
for (const line of readFileSync("/Users/kimss/scorebase/.env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const USER = env.THESPORTS_USER;
const SECRET = env.THESPORTS_SECRET;
if (!USER || !SECRET) throw new Error("THESPORTS env missing");

const UNIQUE_TOURNAMENT_TO_LEAGUE: Record<string, string> = {
  "56ypq36s0o9qd7o": "KBO",
  "9k82re4svpxqepz": "NPB",
  "z8yomoys7olq0j6": "MLB",
};

async function tsGet<T>(p: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(TS_BASE + p);
  url.searchParams.set("user", USER);
  url.searchParams.set("secret", SECRET);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

// NPB 12팀 inline 매핑 (team-names.ts 에 J리그 클럽만 있고 야구 NPB 클럽 없음)
const NPB_EN_TO_KO: Record<string, string> = {
  "Hanshin Tigers": "한신 타이거스",
  "Chunichi Dragons": "주니치 드래곤스",
  "Hiroshima Carp": "히로시마 도요 카프",
  "Hiroshima Toyo Carp": "히로시마 도요 카프",
  "Yokohama BayStars": "요코하마 디엔에이 베이스타스",
  "Yokohama DeNA BayStars": "요코하마 디엔에이 베이스타스",
  "Hokkaido Nippon-Ham Fighters": "홋카이도 닛폰햄 파이터즈",
  "Tohoku Rakuten Golden Eagles": "도호쿠 라쿠텐 골든이글스",
  "Orix Buffaloes": "오릭스 버팔로스",
  "Fukuoka SoftBank Hawks": "후쿠오카 소프트뱅크 호크스",
  "Fukuoka Softbank Hawks": "후쿠오카 소프트뱅크 호크스",
  "Saitama Seibu Lions": "사이타마 세이부 라이온스",
  "Seibu Lions": "사이타마 세이부 라이온스",
  "Chiba Lotte Marines": "지바 롯데 마린스",
  "Tokyo Yakult Swallows": "도쿄 야쿠르트 스왈로스",
  "Yakult Swallows": "도쿄 야쿠르트 스왈로스",
  "Yomiuri Giants": "요미우리 자이언츠",
};

function toKo(name: string): string {
  // NPB inline 우선, 다음 team-names.ts (축구 위주)
  return NPB_EN_TO_KO[name] ?? toKoreanTeamName(name) ?? "";
}

function norm(s: string): string {
  return s
    .toLowerCase()
    // NFC 로 한글 완성형 유지 (NFD 분해하면 가-힣 정규식이 자모 매치 못 함)
    .normalize("NFC")
    .replace(/[̀-ͯ]/g, "") // 라틴 악센트만 제거
    .replace(/[^\w가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface TsTeam {
  id: string;
  name?: string;
  short_name?: string;
  abbr?: string;
}

async function main() {
  // 1. 7일 sweep
  const tsTeams = new Map<string, string>(); // tsId → league
  const now = Math.floor(Date.now() / 1000);
  for (let offset = -3; offset <= 5; offset++) {
    const tsp = now + offset * 86400;
    try {
      const d = await tsGet<{ code: number; results: Array<Record<string, unknown>> }>(
        "/v1/baseball/match/diary",
        { tsp },
      );
      for (const m of d.results ?? []) {
        const uti = m.unique_tournament_id as string | undefined;
        const league = uti ? UNIQUE_TOURNAMENT_TO_LEAGUE[uti] : undefined;
        if (!league) continue;
        const h = m.home_team_id as string | undefined;
        const a = m.away_team_id as string | undefined;
        if (h) tsTeams.set(h, league);
        if (a) tsTeams.set(a, league);
      }
    } catch (e) {
      console.warn(`diary offset=${offset}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`수집: ${tsTeams.size}팀 (KBO=${[...tsTeams.values()].filter((v) => v === "KBO").length}, NPB=${[...tsTeams.values()].filter((v) => v === "NPB").length}, MLB=${[...tsTeams.values()].filter((v) => v === "MLB").length})`);

  // 2. 각 ts team 의 이름 fetch
  const tsInfo: Array<{ tsId: string; league: string; name: string; short: string; abbr: string }> = [];
  for (const [tsId, league] of tsTeams) {
    try {
      const d = await tsGet<{ code: number; results: TsTeam[] }>("/v1/baseball/team/list", { uuid: tsId });
      const t = d.results?.[0];
      if (!t) continue;
      tsInfo.push({ tsId, league, name: t.name ?? "", short: t.short_name ?? "", abbr: t.abbr ?? "" });
    } catch (e) {
      console.warn(`team ${tsId}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`ts team 이름 fetch: ${tsInfo.length}/${tsTeams.size}`);

  // 3. 우리 DB team
  const ourTeams = await prisma.team.findMany({
    where: { league: { in: ["KBO", "NPB", "MLB"] } },
    select: { id: true, league: true, externalId: true, name: true, shortName: true },
  });
  console.log(`DB team: ${ourTeams.length}`);

  // 4. 매칭 — name / short / abbr / 한국어 변환 다중 시도
  const mapped: Array<{ ourId: number; ourName: string; ourLeague: string; ourExternalId: string; tsId: string; tsName: string; tsKo?: string; matchType: string }> = [];
  const unmatched: typeof ourTeams = [];

  // 같은 ts team 이 여러 우리 team 에 중복 매칭되는 것 방지 — 한 번 사용된 tsId 는 풀에서 제외
  const usedTsIds = new Set<string>();

  for (const ot of ourTeams) {
    const candidates = tsInfo.filter((t) => t.league === ot.league && !usedTsIds.has(t.tsId));
    const ourNorm = norm(ot.name);
    const ourShort = ot.shortName ? norm(ot.shortName) : "";
    const ourKo = norm(toKoreanTeamName(ot.name) || "");

    // 빈 string vs 빈 string 매칭 방지 헬퍼 — 한쪽이라도 비어있으면 false
    const eqNonEmpty = (a: string, b: string) => a !== "" && b !== "" && a === b;

    let hit: typeof tsInfo[number] | undefined;
    let matchType = "exact";

    // 1) ts.name == our.name (영문 vs 영문)
    hit = candidates.find((t) => eqNonEmpty(norm(t.name), ourNorm));
    if (!hit) {
      hit = candidates.find((t) => eqNonEmpty(norm(t.short), ourNorm));
      if (hit) matchType = "exact-short";
    }
    if (!hit && ourShort) {
      hit = candidates.find((t) => eqNonEmpty(norm(t.name), ourShort) || eqNonEmpty(norm(t.short), ourShort));
      if (hit) matchType = "ourShort";
    }
    if (!hit && ourKo) {
      // ts 영문 → 한글 변환 후 우리 한글 (ourNorm) / ourKo 와 매칭
      hit = candidates.find((t) => {
        const tKo = norm(toKo(t.name));
        return eqNonEmpty(tKo, ourNorm) || eqNonEmpty(tKo, ourKo);
      });
      if (hit) matchType = "ko";
    }
    if (!hit && ourNorm) {
      // ts 영문 → 한글 변환 후 substring 양방향 (마지막 fallback)
      hit = candidates.find((t) => {
        const tKo = norm(toKo(t.name));
        if (!tKo) return false;
        return tKo.includes(ourNorm) || ourNorm.includes(tKo);
      });
      if (hit) matchType = "partial-ko";
    }
    if (!hit && ourNorm) {
      hit = candidates.find((t) => {
        const tn = norm(t.name);
        return tn !== "" && (tn.includes(ourNorm) || ourNorm.includes(tn));
      });
      if (hit) matchType = "partial";
    }

    if (hit) usedTsIds.add(hit.tsId);

    if (hit) {
      mapped.push({
        ourId: ot.id,
        ourName: ot.name,
        ourLeague: ot.league,
        ourExternalId: ot.externalId,
        tsId: hit.tsId,
        tsName: hit.name,
        matchType,
      });
    } else {
      unmatched.push(ot);
    }
  }

  console.log(`\n매핑: ${mapped.length}/${ourTeams.length}`);
  const byType: Record<string, number> = {};
  for (const m of mapped) byType[m.matchType] = (byType[m.matchType] ?? 0) + 1;
  console.log("matchType:", byType);
  if (unmatched.length) {
    console.log("\n미매핑:");
    for (const u of unmatched) {
      console.log(`  [${u.league}] ${u.name}`);
      const cand = tsInfo.filter((t) => t.league === u.league);
      console.log(`    후보 (${cand.length}):`, cand.slice(0, 5).map((c) => c.name).join(", "));
    }
  }

  const outFile = path.join(process.cwd(), "src/lib/sports/thesports/baseball-team-id-mapping.json");
  writeFileSync(outFile, JSON.stringify(mapped, null, 2));
  console.log(`\n저장: ${outFile}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
