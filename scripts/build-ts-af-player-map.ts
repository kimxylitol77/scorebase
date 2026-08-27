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
const LEAGUES: Record<string, { afId: number; calendar?: boolean }> = {
  EPL: { afId: 39 },
  LALIGA: { afId: 140 },
  BUNDESLIGA: { afId: 78 },
  LIGUE_1: { afId: 61 },
  SERIE_A: { afId: 135 },
  CHAMPIONSHIP: { afId: 40 },
  LALIGA_2: { afId: 141 },
  BUNDESLIGA_2: { afId: 79 },
  SERIE_B: { afId: 136 },
  LIGUE_2: { afId: 62 },
  EREDIVISIE: { afId: 88 },
  PRIMEIRA_LIGA: { afId: 94 },
  SUPER_LIG: { afId: 203 },
  SAUDI_PL: { afId: 307 },
  MLS: { afId: 253, calendar: true },
  K_LEAGUE_1: { afId: 292, calendar: true },
  J1_LEAGUE: { afId: 98, calendar: true },
  BRASILEIRAO: { afId: 71, calendar: true },
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
/**
 * af 응답 한 행 — /teams · /players 등 엔드포인트마다 모양이 달라 공통 최소만 적고
 * 나머지는 unknown 으로 둔다. 쓰는 쪽에서 좁혀 쓴다.
 */
interface AfApiRow {
  team?: { id?: number; name?: string };
  player?: { id?: number; name?: string; photo?: string | null; firstname?: string; lastname?: string; age?: number | null };
  statistics?: AfStatisticsRow[];
  [key: string]: unknown;
}
interface AfPagedResponse {
  response?: AfApiRow[];
  paging?: { current?: number; total?: number };
}
async function af(path: string, retry = 3): Promise<AfPagedResponse> {
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

// af 시즌 자동 해석 — 하드코딩(2025)은 롤오버 때 안 올라가고, 날짜 자동계산은 반대로
//  개막 전 새 시즌을 집어 /players 가 전부 0을 반환한다(2026-08 실측: 빅5 current=2026
//  이지만 coverage.players=false → 매핑이 조용히 한 건도 안 늘어남). 선수 커버가 켜진
//  최신 시즌을 쓴다 — 개막 전이면 직전 시즌, 개막 후엔 자동으로 새 시즌.
async function resolveSeason(afId: number): Promise<number | null> {
  const d = await af(`/leagues?id=${afId}`);
  const row = d.response?.[0] as { seasons?: { year: number; coverage?: { players?: boolean } }[] } | undefined;
  const covered = (row?.seasons ?? []).filter((s) => s.coverage?.players).map((s) => s.year);
  return covered.length ? Math.max(...covered) : null;
}

/** af 선수 프로필 (/players/profiles) — 소속팀이 없고 나이·이름만 온다. */
interface AfProfile { id: number; name: string; firstname?: string; lastname?: string; age?: number | null }
const profileCache = new Map<string, AfProfile[]>();
/** 성으로 af 전체 선수 검색. 같은 성은 캐시 재사용 (검색어당 1~3콜). */
async function searchProfiles(surname: string): Promise<AfProfile[]> {
  const key = surname.toLowerCase();
  const hit = profileCache.get(key);
  if (hit) return hit;
  const out: AfProfile[] = [];
  for (let page = 1; page <= 3; page++) {
    const d = await af(`/players/profiles?search=${encodeURIComponent(key)}&page=${page}`);
    for (const r of d.response ?? []) {
      const p = r.player;
      if (p?.id != null && p.name) out.push({ id: p.id, name: p.name, firstname: p.firstname, lastname: p.lastname, age: p.age });
    }
    if ((d.paging?.current ?? 1) >= (d.paging?.total ?? 1)) break;
  }
  profileCache.set(key, out);
  return out;
}

/** DB 이름의 첫 토큰과 af 프로필의 첫 토큰이 같은가 (af 축약 "G. Guerra" 는 이니셜로 인정). */
function firstNameMatches(dbName: string, p: AfProfile): boolean {
  const first = (s: string) => [...tokset(s)][0] ?? "";
  const db = first(dbName);
  if (!db) return false;
  for (const cand of [p.firstname, p.name]) {
    if (!cand) continue;
    const raw = cand.trim().split(/[\s·]+/)[0] ?? "";
    const af = first(raw);
    if (af && af === db) return true;
    if (/^[A-Za-z]\.$/.test(raw) && raw[0].toLowerCase() === db[0]) return true; // "G." ↔ Gage
  }
  return false;
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

/** api-football /players 응답의 statistics 한 행 — 우리가 읽는 필드만. */
/** af 키 시즌스탯에 담는 최소 필드 — 부상자 주전도 판정에 쓰는 것만 (번들 크기 방어) */
interface AfSlimStat {
  lg: string;
  season: string;
  team: string;
  matches: number | null;
  starts: number | null;
  minutes: number | null;
}

interface AfStatisticsRow {
  league?: { id?: number };
  games?: { position?: string; appearences?: number | null; lineups?: number | null; minutes?: number | null; rating?: string | number | null };
  goals?: { total?: number | null; assists?: number | null; saves?: number | null; conceded?: number | null };
  shots?: { total?: number | null; on?: number | null };
  passes?: { key?: number | null; accuracy?: number | null };
  tackles?: { total?: number | null; interceptions?: number | null; blocks?: number | null };
  dribbles?: { success?: number | null; attempts?: number | null; past?: number | null };
  duels?: { won?: number | null; total?: number | null };
  fouls?: { drawn?: number | null; committed?: number | null };
  penalty?: { scored?: number | null; won?: number | null; missed?: number | null };
  cards?: { yellow?: number | null; red?: number | null };
}

interface AfPlayerRow {
  id: number; name: string; photo: string | null;
  teamName: string; // af 소속 팀명 — 리그풀 폴백 매칭 시 시즌스탯 팀명용
  apps: number; goals: number; assists: number; minutes: number;
  fullTok: Set<string>; // firstname+lastname+name 토큰 — 부분집합 폴백용
  st: AfStatisticsRow | undefined; // 해당 리그 statistics row (SeasonStat 생성용)
}

function toSeasonStat(lg: string, seasonLabel: string, teamName: string, p: AfPlayerRow) {
  const st: AfStatisticsRow = p.st ?? {};
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
    blocks: st.tackles?.blocks ?? null,
    // FotMob식 상세 스탯 (펼치기 패널용) — af 무료 제공분. xG/xA/터치류는 af 미제공.
    dribbles: st.dribbles?.success ?? null,
    dribbleAtt: st.dribbles?.attempts ?? null,
    dribbledPast: st.dribbles?.past ?? null,
    duelsWon: st.duels?.won ?? null,
    duelsTotal: st.duels?.total ?? null,
    foulsDrawn: st.fouls?.drawn ?? null,
    foulsCommitted: st.fouls?.committed ?? null,
    penScored: st.penalty?.scored ?? null,
    penWon: st.penalty?.won ?? null,
    penMissed: st.penalty?.missed ?? null,
    rating: st.games?.rating != null ? Number(st.games.rating) : null,
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
  // af id 를 키로 한 시즌스탯 — ts 매칭 성패와 무관하게 **수집한 선수를 전부** 담는다.
  //   player-season-stats.json 은 키가 ts id 라 ts 와 매칭된 선수만 남는다. 그래서 ts 쪽
  //   선수 데이터가 얕은 리그는 통째로 비어 보였다(MLS 92명, 부상자 주전도 산출률 1%).
  //   부상자는 af id 로 조회하므로 이 파일이 있으면 매칭을 거치지 않고 바로 붙는다.
  //
  // ⚠️ 필드를 최소로 유지할 것. 이 파일은 서버 번들에 import 되므로 전체 스탯을 담으면
  //   6MB 가 된다(실측). 주전도 판정에 쓰는 6개만 남겨 1MB 대로 줄였다.
  const afSeasons: Record<number, AfSlimStat> = {};
  let byName = 0, byTok = 0, byLeague = 0, exact = 0, loose = 0, conflict = 0, noTeam = 0;

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
  // 이름 유니버스는 매칭 후보 전체를 덮어야 한다 — mv 선수만 로드하면 몸값 행이 없는
  // 선수(K리그 다수)는 게이트가 판정 불가(통과)가 되어 지문 오매칭이 그대로 실린다
  // (2026-08-26 실측: 재빌드가 K리그 58건을 새로 오염시켰다. 게이트가 있었는데도).
  const nameUniverse = [...new Set([...allMv.map((p) => p.id), ...Object.keys(TS)])];
  const nameRowsAll = await prisma.theSportsPlayer.findMany({
    where: { id: { in: nameUniverse } },
    select: { id: true, name: true },
  });
  // 영문명 (한글 잔존자는 이름 매칭 제외 — 지문 폴백만)
  const tsEnName = new Map(nameRowsAll.filter((t) => !/[가-힣]/.test(t.name)).map((t) => [t.id, t.name]));

  for (const [lg, { afId, calendar }] of Object.entries(LEAGUES)) {
    if (ONLY.size && !ONLY.has(lg)) continue;
    const season = await resolveSeason(afId);
    if (season == null) { console.log(`${lg}: af 선수 커버 시즌 없음 — 스킵`); continue; }
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
    const allAfPlayers: AfPlayerRow[] = []; // 리그 전체 af 풀 — 팀매핑 누락 선수 폴백용
    // 이름 그럴듯함 게이트 — 스탯 지문 경로가 이름을 안 보고 매칭해 딴사람이 붙는 사고 방지.
    // 2026-08-26 실측: 사비뉴↔니코 오라일리(같은 맨시티, 지문 일치)가 붙어 포지션(LB)·생일·
    // 출전로그 58행까지 통째로 오염됐다. 같은 스캔에서 마린↔Beraldo·웨슬리↔Zubeldia 도 나왔다.
    // 브라질식 애칭(Savinho↔Sávio)은 접두 일치(4자+)로 통과시키고, 토큰이 하나도 안 겹치는
    // 완전 딴이름만 거른다. ts 영문명이 없으면 판정 불가 — 기존 동작 유지(통과).
    const nameGateRejects: string[] = [];
    const namesPlausiblySame = (tsId: string, p: AfPlayerRow): boolean => {
      const en = tsEnName.get(tsId);
      if (!en) return true;
      const a = tokset(en);
      if (a.size === 0 || p.fullTok.size === 0) return true;
      for (const t of a) {
        for (const u of p.fullTok) {
          if (t === u) return true;
          // 공통 접두 4자+ — 브라질식 애칭은 어간을 바꾼다(Sávio→Savi+nho 라 startsWith 불성립).
          if (t.length >= 4 && u.length >= 4 && t.slice(0, 4) === u.slice(0, 4)) return true;
          if ((t.length === 1 || u.length === 1) && t[0] === u[0]) return true;
        }
      }
      return false;
    };
    const recordMatch = (tsId: string, p: AfPlayerRow) => {
      if (!namesPlausiblySame(tsId, p)) {
        nameGateRejects.push(`${tsEnName.get(tsId) ?? tsId} ↔ af ${p.name}`);
        return;
      }
      tsToAf[tsId] = p.id;
      afName[p.id] = p.name;
      newSeasons[tsId] = toSeasonStat(lg, seasonLabel, p.teamName, p);
    };
    for (const t of teams.response ?? []) {
      if (!t.team?.name) continue; // 팀명 없는 행은 매핑 불가
      // af 로스터 + 시즌스탯 (페이지네이션) — 팀매칭 성패와 무관하게 항상 수집해 리그
      //  전체 풀에 누적(팀 매핑 누락 팀[사우디 알나스르 등]의 로스터도 폴백에 쓰기 위함).
      const afPlayers: AfPlayerRow[] = [];
      for (let page = 1; page <= 6; page++) {
        const d = await af(`/players?team=${t.team?.id}&season=${season}&page=${page}`);
        for (const r of d.response ?? []) {
          const st = (r.statistics ?? []).find((x) => x.league?.id === afId) ?? r.statistics?.[0];
          // id·name 없는 행은 매핑 키를 만들 수 없어 버린다.
          if (!st || r.player?.id == null || !r.player.name) continue;
          afPlayers.push({
            id: r.player.id, name: r.player.name, photo: r.player.photo ?? null,
            teamName: t.team?.name ?? "",
            apps: st.games?.appearences ?? 0, goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0, minutes: st.games?.minutes ?? 0,
            fullTok: tokset(`${r.player.firstname ?? ""} ${r.player.lastname ?? ""} ${r.player.name}`),
            st,
          });
        }
        if ((d.paging?.current ?? 1) >= (d.paging?.total ?? 1)) break;
      }
      // ts 매칭과 무관하게 af id 키로 먼저 담는다 — 아래 recordMatch 는 매칭된 선수만 남긴다
      for (const p of afPlayers) {
        const full = toSeasonStat(lg, seasonLabel, p.teamName, p);
        afSeasons[p.id] = {
          lg: full.lg, season: full.season, team: full.team,
          matches: full.matches, starts: full.starts, minutes: full.minutes,
        };
      }
      allAfPlayers.push(...afPlayers);

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

    // 리그풀 폴백 — 팀매핑(mv.teamId→Team) 누락으로 팀별 후보에 못 든 선수(사우디·MLS·K리그
    //  처럼 TeamSourceId 매핑이 빈 리그)를 리그 전체 af 풀에서 이름/토큰 유일 매칭.
    //  빅5는 팀매핑이 완벽해 이미 다 잡혀(takenL) 폴백이 건드릴 게 없음.
    {
      const takenL = new Set(Object.values(tsToAf));
      const afByNameL = new Map<string, AfPlayerRow[]>();
      for (const p of allAfPlayers) { const k = nameKey(p.name); if (k) afByNameL.set(k, [...(afByNameL.get(k) ?? []), p]); }
      for (const p of players) {
        if (tsToAf[p.id]) continue;
        const en = tsEnName.get(p.id);
        if (!en) continue;
        let cands = (afByNameL.get(nameKey(en) ?? "") ?? []).filter((c) => !takenL.has(c.id));
        if (cands.length !== 1) {
          const dbTok = tokset(en);
          if (dbTok.size >= 2) cands = allAfPlayers.filter((c) => !takenL.has(c.id) && [...dbTok].every((tk) => c.fullTok.has(tk)));
        }
        if (cands.length === 1) { recordMatch(p.id, cands[0]); takenL.add(cands[0].id); byLeague++; }
      }
    }
    if (nameGateRejects.length > 0) {
      console.log(`  ${lg} 이름 게이트 거부 ${nameGateRejects.length}건: ${nameGateRejects.slice(0, 5).join(" · ")}`);
    }
    console.log(`${lg}: 누적 매칭 ${Object.keys(tsToAf).length} · 시즌스탯 신규 ${Object.keys(newSeasons).length}`);
  }

  // === 이름 검색 폴백 ===
  // 팀 스쿼드를 아무리 훑어도 안 잡히는 선수가 남는다 — 장기 부상·시즌 중 이적으로 af 가
  //  어느 팀 로스터에도 안 넣어주는 경우(2026-08 실측: 쿨루셰프스키는 af 선수 등록[30435]
  //  자체는 있는데 토트넘 스쿼드 응답엔 없어 스쿼드만 훑는 위 단계로는 영영 못 찾는다).
  //  /players/profiles?search={성} 으로 직접 찾아 보완한다.
  //  이 응답엔 소속팀이 없어 동명이인 오매칭 위험이 크므로 나이(±2)와 이름 토큰이 모두
  //  맞고 후보가 유일할 때만 채택한다 — 애매하면 매칭하지 않는다.
  //  대상은 LEAGUES 소속 + 18개월 내 몸값 갱신분 (= /transfers 노출 대상)만. 은퇴·과거
  //  선수가 몸값 테이블의 30% 를 차지해 전수 검색은 낭비다.
  let bySearch = 0, searchAmbiguous = 0;
  {
    const lgSet = new Set(Object.keys(LEAGUES));
    const targetIds = allMv
      .filter((p) => {
        if (tsToAf[p.id]) return false;
        const lg = p.league ?? (p.teamId ? teamInfoByTs.get(p.teamId)?.league : null);
        return lg != null && lgSet.has(lg);
      })
      .map((p) => p.id);
    const rows = await prisma.playerMarketValue.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, age: true, history: true },
    });
    const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // /transfers 활성 기준과 동일
    const taken = new Set(Object.values(tsToAf));
    let scanned = 0;
    for (const r of rows) {
      const hist = r.history as { market_time?: number }[] | null;
      const last = Array.isArray(hist) ? hist[hist.length - 1] : null;
      if ((last?.market_time ?? 0) < cutoff) continue; // 은퇴·과거 선수 — 검색해도 못 찾는다
      const en = tsEnName.get(r.id);
      if (!en) continue;
      const dbTok = tokset(en);
      if (dbTok.size === 0) continue;
      const surname = (en.trim().split(/[\s·]+/).pop() ?? "").replace(/[^A-Za-z]/g, "");
      if (surname.length < 4) continue; // af search 는 4자 이상만 받는다
      scanned++;
      const fit = (await searchProfiles(surname)).filter((h) => {
        if (taken.has(h.id)) return false;
        const afTok = tokset(`${h.firstname ?? ""} ${h.lastname ?? ""} ${h.name}`);
        if (![...dbTok].every((t) => afTok.has(t))) return false;
        // 첫 이름 대조 — 토큰 부분집합만 보면 아랍식처럼 토큰이 짧게 남는 이름이 남의
        //  긴 풀네임에 통째로 들어가 오매칭된다(실측: "Hussain Al Issa" ↔ 수단인
        //  "Ahmed Issa Hussain Gomah" — "Al" 이 불용어라 {hussain,issa} 만 남았다).
        //  af 가 "G. Guerra" 처럼 축약해 오는 경우가 있어 이니셜 일치도 인정한다.
        if (dbTok.size >= 2 && !firstNameMatches(en, h)) return false;
        if (r.age == null || h.age == null) return dbTok.size >= 2; // 나이 대조 불가 — 복수토큰만 허용
        // 단일토큰 등록명(브라질·포르투갈식)은 판별력이 약해 나이를 좁게 본다
        return Math.abs(h.age - r.age) <= (dbTok.size >= 2 ? 2 : 1);
      });
      if (fit.length === 1) { tsToAf[r.id] = fit[0].id; afName[fit[0].id] = fit[0].name; taken.add(fit[0].id); bySearch++; }
      else if (fit.length > 1) searchAmbiguous++;
    }
    console.log(`이름 검색 폴백: 대상 ${scanned}명 (검색어 ${profileCache.size}종) — 신규 ${bySearch} · 후보 다중 skip ${searchAmbiguous}`);
  }

  await prisma.$disconnect();

  const afToTs: Record<number, string> = {};
  for (const [ts, a] of Object.entries(tsToAf)) afToTs[a] = ts;
  fs.writeFileSync("data/ts-af-player-map.json", JSON.stringify({ tsToAf, afToTs }, null, 0));

  // 시즌스탯 병합 — 새 af 수집분이 기존(과거 스냅샷)을 덮어씀
  const mergedSeasons = { ...TS, ...newSeasons };
  fs.writeFileSync("data/player-season-stats.json", JSON.stringify(mergedSeasons, null, 0));

  // af id 키 시즌스탯 — 부상자 주전도가 ts 매칭 없이 붙게 한다 (리그 단위 재실행이면 병합)
  let prevAf: Record<number, unknown> = {};
  try { prevAf = JSON.parse(fs.readFileSync("data/af-player-season-stats.json", "utf8")); } catch {}
  const mergedAf = { ...prevAf, ...afSeasons };
  fs.writeFileSync("data/af-player-season-stats.json", JSON.stringify(mergedAf, null, 0));
  console.log(`af키 시즌스탯: 기존 ${Object.keys(prevAf).length} + 신규 ${Object.keys(afSeasons).length} = ${Object.keys(mergedAf).length}`);

  console.log(
    `완료: 매핑 ${Object.keys(tsToAf).length} — 이름 ${byName} · 토큰 ${byTok} · 리그풀 ${byLeague} · 지문 ${exact} · 완화 ${loose} · 이름검색 ${bySearch} · 충돌skip ${conflict} · 팀미매칭 ${noTeam}`,
  );
  console.log(`시즌스탯: 기존 ${Object.keys(TS).length} + 신규/갱신 ${Object.keys(newSeasons).length} = ${Object.keys(mergedSeasons).length}`);
  console.log("손흥민 검증:", tsToAf["y39mp1h5yjwmojx"] ?? "미매칭", "| 야말:", tsToAf["4jwq2ghxjzkvm0v"] ?? "미매칭");
}

main().catch((e) => { console.error(e); process.exit(1); });
