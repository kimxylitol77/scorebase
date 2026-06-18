// ts↔af 선수 매핑 + af 시즌스탯 동시 빌드
//   → data/ts-af-player-map.json (tsToAf/afToTs, 기존과 병합)
//   → data/player-season-stats.json (SeasonStat, 기존과 병합 — af 응답이 더 최신이면 덮어씀)
//
// 배경: 축구 선수 페이지 통합 (2026-06-10) — /transfers/{tsId} 단일 페이지.
//   af 대회별 스탯(CompetitionStatsSection 런타임 호출)은 이 매핑이 있어야 뜬다.
//   2026-06-10 sync-thesports-players 로 TheSportsPlayer.name 영문 복구 완료 →
//   이름 매칭(성+이니셜)을 전 리그로 확장 (이전엔 시즌스탯 지문 매칭만, 빅4 한정).
// 유니버스: playerMarketValue.league 별 전체 (= 선수 페이지가 존재하는 선수)
//   + 기존 player-season-stats.json 항목 (지문 매칭 폴백용).
// af: /teams?league&season (리그당 1콜) + /players?team&season (팀당 ~3-6페이지)
//   — 같은 응답의 statistics 로 SeasonStat 도 생성하므로 추가 콜 없음. 총 ~1,100콜.
// 재실행: 멱등. 이적시장/시즌 중 갱신 시 재실행 (영문명 동기화 이후일 것).
//   npx tsx --env-file=.env.local scripts/build-ts-af-player-map.ts
import "../src/lib/env";
import rawStats from "../data/player-season-stats.json";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import { toKoreanTeamName } from "../src/lib/team-names";

const prisma = new PrismaClient();

const KEY = process.env.API_FOOTBALL_KEY!;
// season: 유럽 시즌제 = 2025(25-26) / 캘린더제(MLS·K·J·브라질) = 2026
const LEAGUES: Record<string, { afId: number; season: number; calendar?: boolean }> = {
  EPL: { afId: 39, season: 2025 },
  LALIGA: { afId: 140, season: 2025 },
  BUNDESLIGA: { afId: 78, season: 2025 },
  LIGUE_1: { afId: 61, season: 2025 },
  SERIE_A: { afId: 135, season: 2025 },
  CHAMPIONSHIP: { afId: 40, season: 2025 },
  LALIGA_2: { afId: 141, season: 2025 },
  BUNDESLIGA_2: { afId: 79, season: 2025 },
  SERIE_B: { afId: 136, season: 2025 },
  LIGUE_2: { afId: 62, season: 2025 },
  EREDIVISIE: { afId: 88, season: 2025 },
  PRIMEIRA_LIGA: { afId: 94, season: 2025 },
  SUPER_LIG: { afId: 203, season: 2025 },
  SAUDI_PL: { afId: 307, season: 2025 },
  MLS: { afId: 253, season: 2026, calendar: true },
  K_LEAGUE_1: { afId: 292, season: 2026, calendar: true },
  J1_LEAGUE: { afId: 98, season: 2026, calendar: true },
  BRASILEIRAO: { afId: 71, season: 2026, calendar: true },
};
interface TsStat {
  lg: string; team: string | null; pos: string | null;
  matches: number | null; goals: number | null; assists: number | null;
  minutes: number | null; yellow: number | null;
}
const TS = rawStats as unknown as Record<string, TsStat>;
// NFD 로 분해 안 되는 특수문자 → ASCII 폴딩 (af "Ødegaard" ↔ DB "Odegaard" 처럼
//  한쪽만 특수문자면 norm 키가 갈려 이름 매칭 실패 — 북유럽·동유럽 선수 다수 영향)
const FOLD: Record<string, string> = { "ø": "o", "å": "a", "ł": "l", "ß": "ss", "æ": "ae", "ð": "d", "þ": "th", "đ": "d", "ı": "i", "ŧ": "t", "ħ": "h" };
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[øåłßæðþđıŧħ]/g, (c) => FOLD[c] || c)
    .replace(/\b(fc|cf|afc|club|de|cd|ud|rcd|ac|as|sc|ssc|rc|stade|olympique)\b/g, "")
    .replace(/[\s.&·'-]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// af 호출 — 일시적 네트워크 에러(ECONNRESET 등)는 백오프 재시도.
//  1,100콜 중 1회 끊김에 전체가 죽으면 JSON 미저장(끝에 1회 write)이라 전부 날아감.
async function af(path: string, retry = 3): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`https://v3.football.api-sports.io${path}`, {
        headers: { "x-apisports-key": KEY },
      });
      await sleep(280);
      return res.json();
    } catch (e) {
      if (i >= retry) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

// af "L. Yamal" 축약·풀네임 모두 대응 — 성(마지막 토큰) + 첫 이니셜
function nameKey(full: string): string | null {
  // "·" 구분자도 토큰 분리 (ts 일부 이름이 "Khvicha·Kvaratskhelia" 형태로 옴)
  const tokens = full.trim().split(/[\s·]+/);
  if (tokens.length === 0) return null;
  const last = norm(tokens[tokens.length - 1]);
  const initial = norm(tokens[0])[0] ?? "";
  return last ? `${initial}.${last}` : null;
}

// 풀네임 토큰 집합 (af firstname+lastname+name ↔ DB 이름) — af 등록명이 DB 성과 다른
//  단일명·복성 선수(페르민 "Fermín"↔"Fermín López", 쿠바르시 복성) 부분집합 매칭용.
const TOK_STOP = new Set(["de", "da", "do", "dos", "del", "la", "le", "van", "von", "di", "el", "al", "bin", "ben", "the", "jr"]);
function tokset(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[øåłßæðþđıŧħ]/g, (c) => FOLD[c] || c)
      .split(/[\s·.\-']+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length >= 2 && !TOK_STOP.has(t)),
  );
}

// 팀명 매칭 키 셋 — 영문 norm + 한글명(별칭 사전 = team-names.ts) + 약어.
// "Los Angeles FC"(af) vs "LAFC"(우리): norm 으론 불일치 → 약어 "lafc" 로 연결.
// 한글명: 양쪽 변형 영문이 같은 한글로 수렴하면 매칭 ("Al Hilal"/"Al-Hilal Saudi FC"→알힐랄).
function teamKeys(name: string): string[] {
  const keys = new Set<string>();
  const n = norm(name);
  if (n) keys.add(n);
  const ko = toKoreanTeamName(name);
  if (ko && /[가-힣]/.test(ko)) keys.add(`ko:${ko.replace(/\s/g, "")}`);
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    // 대문자 토큰(FC·SC·CF·HD 등)은 통째로 — "Los Angeles FC" → "lafc" (laf 아님)
    const acr = words
      .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w[0]))
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (acr.length >= 3) keys.add(`acr:${acr}`);
  } else if (/^[A-Z]{3,5}$/.test(name.trim())) {
    // "LAFC" 같은 약어 팀명 자체도 acr 키로 — af 풀네임의 약어와 연결
    keys.add(`acr:${name.trim().toLowerCase()}`);
  }
  return [...keys];
}

interface AfPlayerRow {
  id: number; name: string; photo: string | null;
  apps: number; goals: number; assists: number; minutes: number;
  fullTok: Set<string>; // firstname+lastname+name 토큰 — 부분집합 폴백용
  st: any; // 해당 리그 statistics row (SeasonStat 생성용)
}

function toSeasonStat(lg: string, seasonLabel: string, teamName: string, p: AfPlayerRow) {
  const st = p.st ?? {};
  return {
    lg,
    season: seasonLabel,
    team: teamName,
    pos: (st.games?.position?.[0] as string | undefined) ?? null,
    matches: st.games?.appearences ?? null,
    starts: st.games?.lineups ?? null,
    goals: st.goals?.total ?? null,
    assists: st.goals?.assists ?? null,
    minutes: st.games?.minutes ?? null,
    shots: st.shots?.total ?? null,
    sot: st.shots?.on ?? null,
    keyPasses: st.passes?.key ?? null,
    passAcc: st.passes?.accuracy ?? null,
    tackles: st.tackles?.total ?? null,
    interceptions: st.tackles?.interceptions ?? null,
    yellow: st.cards?.yellow ?? null,
    red: st.cards?.red ?? null,
    saves: st.goals?.saves ?? 0,
    cleanSheets: null,
    conceded: st.goals?.conceded ?? null,
  };
}

async function main() {
  // 기존 매핑에 병합 (재실행 시 기존 결과 보존, 새 결과가 우선)
  let prevMap: { tsToAf?: Record<string, number> } = {};
  try { prevMap = JSON.parse(fs.readFileSync("data/ts-af-player-map.json", "utf8")); } catch {}
  const tsToAf: Record<string, number> = { ...(prevMap.tsToAf ?? {}) };
  const afName: Record<number, string> = {};
  const newSeasons: Record<string, ReturnType<typeof toSeasonStat>> = {};
  let byName = 0, byTok = 0, exact = 0, loose = 0, conflict = 0, noTeam = 0;

  // 인자로 리그 코드 주면 해당 리그만 재실행 (af quota 절약): ... MLS SAUDI_PL
  const ONLY = new Set(process.argv.slice(2));

  // === 전역 preload ===
  const allMv = await prisma.playerMarketValue.findMany({
    select: { id: true, teamId: true, league: true },
  });
  const tsMapsAll = await prisma.teamSourceId.findMany({
    where: { source: "thesports" },
    select: { externalId: true, teamId: true },
  });
  const teamRowsAll = await prisma.team.findMany({ select: { id: true, name: true, league: true } });
  const teamById = new Map(teamRowsAll.map((t) => [t.id, t]));
  // ts team id → { 영문명, 리그 } (mv.league 가 null 인 선수를 팀 리그로 귀속)
  const teamInfoByTs = new Map<string, { name: string; league: string }>();
  for (const m of tsMapsAll) {
    const t = teamById.get(m.teamId);
    if (t) teamInfoByTs.set(m.externalId, { name: t.name, league: t.league });
  }
  const nameRowsAll = await prisma.theSportsPlayer.findMany({
    where: { id: { in: allMv.map((p) => p.id) } },
    select: { id: true, name: true },
  });
  // 영문명 (한글 잔존자는 이름 매칭 제외 — 지문 폴백만)
  const tsEnName = new Map(nameRowsAll.filter((t) => !/[가-힣]/.test(t.name)).map((t) => [t.id, t.name]));

  for (const [lg, { afId, season, calendar }] of Object.entries(LEAGUES)) {
    if (ONLY.size && !ONLY.has(lg)) continue;
    const seasonLabel = calendar ? String(season) : `${season}-${String((season + 1) % 100).padStart(2, "0")}`;

    // === ts 후보 유니버스: mv.league = lg ∪ 팀 리그 = lg (league null 선수 구제) ===
    const players = allMv.filter(
      (p) => p.league === lg || (p.teamId && teamInfoByTs.get(p.teamId)?.league === lg),
    );

    // 팀 키(영문 norm·한글·약어) → ts 후보들. 같은 키가 서로 다른 팀이면 무효화.
    // owner 는 한글 정규명으로 — DB "LAFC" 와 TS json "Los Angeles FC" 가 같은 팀으로 수렴.
    const tsByKey = new Map<string, { id: string; fp: TsStat | null }[]>();
    const keyOwner = new Map<string, string>();
    const ambiguous = new Set<string>();
    const canonical = (name: string) => toKoreanTeamName(name) || norm(name);
    const addTeam = (teamName: string, entry: { id: string; fp: TsStat | null }) => {
      const owner = canonical(teamName);
      for (const k of teamKeys(teamName)) {
        if (ambiguous.has(k)) continue;
        const cur = keyOwner.get(k);
        if (cur && cur !== owner) { ambiguous.add(k); tsByKey.delete(k); continue; }
        keyOwner.set(k, owner);
        const arr = tsByKey.get(k) ?? [];
        if (!arr.some((x) => x.id === entry.id)) arr.push(entry);
        tsByKey.set(k, arr);
      }
    };
    for (const p of players) {
      const info = p.teamId ? teamInfoByTs.get(p.teamId) : null;
      if (!info) continue;
      addTeam(info.name, { id: p.id, fp: TS[p.id] ?? null });
    }
    for (const [id, s] of Object.entries(TS)) {
      if (s.lg !== lg || !s.team) continue;
      addTeam(s.team, { id, fp: s });
    }
    if (tsByKey.size === 0) { console.log(`${lg}: ts 후보 없음 — 스킵`); continue; }

    const teams = await af(`/teams?league=${afId}&season=${season}`);
    for (const t of teams.response ?? []) {
      // af 팀명의 모든 키(norm·한글·약어)에 걸린 ts 후보 합집합.
      //  첫 hit 에서 break 하면 af norm 키(예 "bayernmunchen")가 ts 일부 선수와 먼저
      //  매칭되며, 한글 키("ko:바이에른뮌헨")에만 걸린 선수(케인 등 — af "München" vs
      //  우리 "Munich" 로 norm 키가 갈리는 클럽)를 놓침 → 합집합으로 교정.
      const tsMerged = new Map<string, { id: string; fp: TsStat | null }>();
      for (const k of teamKeys(t.team.name)) {
        for (const e of tsByKey.get(k) ?? []) tsMerged.set(e.id, e);
      }
      if (tsMerged.size === 0) { noTeam++; continue; }
      const tsPlayers = [...tsMerged.values()];

      // af 로스터 + 시즌스탯 (페이지네이션)
      const afPlayers: AfPlayerRow[] = [];
      for (let page = 1; page <= 6; page++) {
        const d = await af(`/players?team=${t.team.id}&season=${season}&page=${page}`);
        for (const r of d.response ?? []) {
          const st = (r.statistics ?? []).find((x: any) => x.league?.id === afId) ?? r.statistics?.[0];
          if (!st) continue;
          afPlayers.push({
            id: r.player.id, name: r.player.name, photo: r.player.photo ?? null,
            apps: st.games?.appearences ?? 0, goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0, minutes: st.games?.minutes ?? 0,
            fullTok: tokset(`${r.player.firstname ?? ""} ${r.player.lastname ?? ""} ${r.player.name}`),
            st,
          });
        }
        if ((d.paging?.current ?? 1) >= (d.paging?.total ?? 1)) break;
      }

      const recordMatch = (tsId: string, p: AfPlayerRow) => {
        tsToAf[tsId] = p.id;
        afName[p.id] = p.name;
        newSeasons[tsId] = toSeasonStat(lg, seasonLabel, t.team.name, p);
      };

      // ① 이름 매칭 (영문명 보유자) — 같은 팀 내 성+이니셜 유일 시
      const afByName = new Map<string, AfPlayerRow[]>();
      for (const p of afPlayers) {
        const k = nameKey(p.name);
        if (k) afByName.set(k, [...(afByName.get(k) ?? []), p]);
      }
      const unresolved: { id: string; fp: TsStat | null }[] = [];
      for (const tp of tsPlayers) {
        const en = tsEnName.get(tp.id);
        const k = en ? nameKey(en) : null;
        const cands = k ? afByName.get(k) ?? [] : [];
        if (cands.length === 1) { recordMatch(tp.id, cands[0]); byName++; }
        else unresolved.push(tp);
      }

      // ①b 토큰 부분집합 폴백 — af 등록명이 DB 성과 달라 nameKey 가 어긋난 케이스
      //  (페르민 af "Fermín"↔DB "Fermín López", 쿠바르시 복성). DB 토큰(2개+)이 af
      //  풀네임 토큰의 부분집합이고 같은 팀에서 유일하면 매칭 (단일토큰은 오매칭 우려로 제외).
      const takenTok = new Set(Object.values(tsToAf));
      const unresolved2: typeof unresolved = [];
      for (const tp of unresolved) {
        const en = tsEnName.get(tp.id);
        const dbTok = en ? tokset(en) : null;
        if (!dbTok || dbTok.size < 2) { unresolved2.push(tp); continue; }
        const hits = afPlayers.filter((p) => !takenTok.has(p.id) && [...dbTok].every((tk) => p.fullTok.has(tk)));
        if (hits.length === 1) { recordMatch(tp.id, hits[0]); takenTok.add(hits[0].id); byTok++; }
        else unresolved2.push(tp);
      }

      // ② 지문 매칭 (기존 시즌스탯 보유자) — 정확 일치 → ③ 완화
      const taken = new Set(Object.values(tsToAf));
      const byFp = new Map<string, AfPlayerRow[]>();
      for (const p of afPlayers) {
        if (taken.has(p.id)) continue;
        const k = `${p.apps}|${p.goals}|${p.assists}`;
        byFp.set(k, [...(byFp.get(k) ?? []), p]);
      }
      const still: typeof unresolved = [];
      for (const { id, fp } of unresolved2) {
        if (!fp || fp.matches == null) continue;
        const k = `${fp.matches}|${fp.goals ?? 0}|${fp.assists ?? 0}`;
        const cands = (byFp.get(k) ?? []).filter((p) => !taken.has(p.id));
        if (cands.length === 1) { recordMatch(id, cands[0]); taken.add(cands[0].id); exact++; }
        else if (cands.length > 1) conflict++;
        else still.push({ id, fp });
      }
      for (const { id, fp } of still) {
        if (!fp || fp.matches == null || fp.minutes == null) continue;
        // af 최종 ≥ ts 스냅샷 (차이 cap 8경기) + 골·도움 단조
        const cands = afPlayers.filter(
          (p) =>
            !taken.has(p.id) &&
            p.apps >= fp.matches! && p.apps - fp.matches! <= 8 &&
            p.goals >= (fp.goals ?? 0) && p.goals - (fp.goals ?? 0) <= 4 &&
            p.assists >= (fp.assists ?? 0) && p.assists - (fp.assists ?? 0) <= 4 &&
            p.minutes >= (fp.minutes ?? 0) - 30,
        );
        if (cands.length === 1) { recordMatch(id, cands[0]); taken.add(cands[0].id); loose++; }
        else if (cands.length > 1) conflict++;
      }
    }
    console.log(`${lg}: 누적 매칭 ${Object.keys(tsToAf).length} · 시즌스탯 신규 ${Object.keys(newSeasons).length}`);
  }
  await prisma.$disconnect();

  const afToTs: Record<number, string> = {};
  for (const [ts, a] of Object.entries(tsToAf)) afToTs[a] = ts;
  fs.writeFileSync("data/ts-af-player-map.json", JSON.stringify({ tsToAf, afToTs }, null, 0));

  // 시즌스탯 병합 — 새 af 수집분이 기존(과거 스냅샷)을 덮어씀
  const mergedSeasons = { ...TS, ...newSeasons };
  fs.writeFileSync("data/player-season-stats.json", JSON.stringify(mergedSeasons, null, 0));

  console.log(
    `완료: 매핑 ${Object.keys(tsToAf).length} — 이름 ${byName} · 토큰 ${byTok} · 지문 ${exact} · 완화 ${loose} · 충돌skip ${conflict} · 팀미매칭 ${noTeam}`,
  );
  console.log(`시즌스탯: 기존 ${Object.keys(TS).length} + 신규/갱신 ${Object.keys(newSeasons).length} = ${Object.keys(mergedSeasons).length}`);
  console.log("손흥민 검증:", tsToAf["y39mp1h5yjwmojx"] ?? "미매칭", "| 야말:", tsToAf["4jwq2ghxjzkvm0v"] ?? "미매칭");
}

main().catch((e) => { console.error(e); process.exit(1); });
