// 클럽 리그 예상 라인업 빌드 → PredictedXiCache (리그당 1 row) — /api/cron/club-xi 가 하루 2회 실행.
// scripts/build-club-predicted-xi.ts(맥북 크론 산출물 → git 커밋)의 이식 — 빌더가 DB 만 읽는다는
// 점을 살려 산출물도 DB 로 옮겼다. 맥북 sleep 결손·push 경합(2026-08 실측 둘 다 발생)이 원천 제거된다.
//
// 방법론(원본과 동일): 팀별 최근 확정 XI(친선·컵 포함) 가중투표 = 최근 감쇠 × 대회 계수
// (자기 리그 1 / 컵 0.75 / 친선 0.5), 프리시즌엔 직전 시즌 리그 XI 를 0.8 가중으로 보강하되
// 현 로스터(최근 라인업 ∪ team-squads.json)에 없는 이적·방출 선수는 제외. 최신 InjurySnapshot
// 부상자는 후보에서 빼 백업이 자동 승격. 결정 근거: docs/club-predicted-xi/context-notes.md
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { CLUB_XI_LEAGUES, teamNameMatches } from "@/lib/predict/club-xi-leagues";

const TARGET_LEAGUES = [...CLUB_XI_LEAGUES];
/** 팀 처리 동시성 — Neon pool(29) 과 Vercel 300s 안에서 25리그 ~460팀을 소화하는 선. */
const TEAM_CONCURRENCY = 5;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");

interface LuPlayer { id?: string; first?: number; name?: string; position?: string; shirt_number?: number; rating?: string; logo?: string; x?: number; y?: number }
interface PredictedPlayer {
  id: string; name: string; nameKo?: string; position: string; shirtNumber?: number;
  /** 최근 선발 좌표의 가중평균 (ts 좌표계 0~100, y 는 자기 골문 쪽이 0). 재료에 좌표가 없으면 생략. */
  x?: number; y?: number;
  starts: number; games: number;
  /** 0~1 — 가중 투표 점유율 */
  confidence: number;
  photo?: string;
  avgRating?: number;
  lastRating?: number;
}
export interface ClubXiTeamOut { teamName: string; formation: string; basedOnGames: number; updatedAt: string; xi: PredictedPlayer[] }

const POS_SLOTS: Record<string, number> = { G: 1, D: 4, M: 4, F: 2 }; // fallback 4-4-2

function slotsFromFormation(f: string | undefined): Record<string, number> {
  if (!f) return POS_SLOTS;
  const parts = f.split("-").map((n) => parseInt(n, 10)).filter(Number.isFinite);
  if (parts.length < 2 || parts.reduce((a, b) => a + b, 0) !== 10) return POS_SLOTS;
  const d = parts[0];
  const fw = parts[parts.length - 1];
  return { G: 1, D: d, M: 10 - d - fw, F: fw };
}

/** af 축약형("A. Gonzalez") ↔ 풀네임 매칭 키 — 성(마지막 토큰) + 첫 이니셜 */
function lastInitialKey(name: string): string {
  const tokens = name.trim().split(/\s+/);
  const last = norm(tokens[tokens.length - 1] ?? "");
  const initial = norm(tokens[0] ?? "")[0] ?? "";
  return `${last}|${initial}`;
}

type TsLineup = {
  confirmed?: number;
  home_formation?: string;
  away_formation?: string;
  lineup?: { home?: LuPlayer[] | Record<string, LuPlayer>; away?: LuPlayer[] | Record<string, LuPlayer> };
} | null;

interface InjurySnapRow { teamName: string; playerTsId: string | null; playerName: string }

// export 는 단독 팀 진단용 (scripts 에서 직접 호출) — 운영 경로는 runBuildClubXi 뿐.
export async function buildTeam(
  league: string,
  teamId: number,
  /** 정본 + 유령 쌍둥이 row id — 친선 수집기가 같은 클럽을 별도 Team row 로 만들어
   *  (카디프 실측: 매치는 af row 600015, 친선 라인업은 ts row 610511) 재료가 갈라진다.
   *  sourceId 공유·정확 동명(CLUB_FRIENDLY 한정)으로 잇는다 — 8/17 실측 게이트 97팀 중 24팀 구제. */
  idGroup: number[],
  ctx: {
    leagueSnaps: InjurySnapRow[];
    tsIdByTeam: Map<number, string>;
    nameByTeam: Map<number, string>;
    squadByTsTeam: Record<string, { squad?: { id: string }[] }>;
  },
): Promise<ClubXiTeamOut | null> {
  // 최근 75일 확정 라인업 — 리그 무관(친선·컵·직전 시즌 타리그 포함), 트윈 row 포함.
  const rows = await prisma.theSportsMatchCache.findMany({
    where: {
      match: {
        OR: [{ homeTeamId: { in: idGroup } }, { awayTeamId: { in: idGroup } }],
        status: "FINISHED",
        startTime: { gte: new Date(Date.now() - 75 * 86400e3) },
      },
    },
    orderBy: { match: { startTime: "desc" } },
    select: {
      lineup: true,
      match: { select: { league: true, homeTeamId: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } },
    },
  });

  const xis: { players: LuPlayer[]; formation?: string; matchLeague: string }[] = [];
  // 최근 75일 라인업(선발+벤치)에 등장한 전원 — "현재 로스터" 근사.
  const rosterRecent = new Set<string>();
  let teamName = "";
  for (const r of rows) {
    const lu = r.lineup as TsLineup;
    if (!lu || lu.confirmed !== 1 || !lu.lineup) continue;
    const side = r.match.homeTeamId != null && idGroup.includes(r.match.homeTeamId) ? "home" : "away";
    const all = Object.values(lu.lineup[side] ?? {}).filter((p) => p?.id && p.name);
    for (const p of all) rosterRecent.add(p.id!);
    if (xis.length >= 5) continue;
    const starters = all.filter((p) => p.first === 1);
    if (starters.length < 10) continue;
    if (!teamName) teamName = side === "home" ? r.match.homeTeam?.name ?? "" : r.match.awayTeam?.name ?? "";
    xis.push({
      players: starters,
      formation: side === "home" ? lu.home_formation : lu.away_formation,
      matchLeague: r.match.league,
    });
  }
  const recentCount = xis.length;

  // 프리시즌 보강 — 이번 시즌 리그 경기가 아직 없고 **친선 재료도 얼마 없을 때만** 직전 시즌
  // 같은 리그 최근 XI 를 낮은 가중으로 섞는다. 현 로스터에 없는 선수는 제외.
  //
  // ⚠ 재료가 넉넉한데도 섞으면 여름 영입이 구조적으로 불리해진다 — 새로 온 선수는 직전 시즌
  //   그 리그에 없었으니 0 점인데, 남아 있던 선수는 prevXis 3경기(0.8×3=2.4)를 그냥 얻는다.
  //   맨유 실측: 틸레망스(8/15 마지막 친선 선발, 여름 영입)가 마이누에게 밀려 XI 에서 빠졌다.
  //   보강은 어디까지나 재료 부족을 메우는 장치지 과거 스쿼드를 고정하는 장치가 아니다.
  const hasCurrentLeagueGame = xis.some((x) => x.matchLeague === league);
  const tsTeamId = ctx.tsIdByTeam.get(teamId);
  const currentSquad = new Set(
    (tsTeamId ? ctx.squadByTsTeam[tsTeamId]?.squad ?? [] : []).map((s) => s.id),
  );
  const stillAtClub = (id: string) => rosterRecent.has(id) || currentSquad.has(id);
  const prevXis: { players: LuPlayer[]; formation?: string }[] = [];
  if (!hasCurrentLeagueGame && recentCount < 3) {
    const prevRows = await prisma.theSportsMatchCache.findMany({
      where: {
        match: {
          OR: [{ homeTeamId: { in: idGroup } }, { awayTeamId: { in: idGroup } }],
          league,
          status: "FINISHED",
          startTime: { lt: new Date(Date.now() - 75 * 86400e3) },
        },
      },
      orderBy: { match: { startTime: "desc" } },
      take: 6,
      select: { lineup: true, match: { select: { homeTeamId: true } } },
    });
    for (const r of prevRows) {
      if (prevXis.length >= 3) break;
      const lu = r.lineup as TsLineup;
      if (!lu || lu.confirmed !== 1 || !lu.lineup) continue;
      const side = r.match.homeTeamId != null && idGroup.includes(r.match.homeTeamId) ? "home" : "away";
      const starters = Object.values(lu.lineup[side] ?? {}).filter(
        (p) => p?.first === 1 && p.id && p.name && stillAtClub(p.id),
      );
      if (starters.length < 7) continue; // 로스터 게이트 후 7명 미만이면 물갈이가 커서 신호 없음
      prevXis.push({ players: starters, formation: side === "home" ? lu.home_formation : lu.away_formation });
    }
  }

  // 재료가 아예 없으면 스킵. 1경기만 있어도 낸다 — 개막 직전 승격팀은 프리시즌 친선 한 경기가
  //  가진 전부인데(코번트리 실측: 최근 75일 확정 XI 1건, 승격 전이라 과거 매치가 DB 에 아예 없어
  //  prevXis 도 0), 2경기 가드에 걸려 통째로 빠지면 **상대팀까지 안 보인다** — 블록은 양팀 다
  //  있어야 뜨기 때문에 아스널 개막전이 라인업 없이 나갔다(2026-08-21 사용자 제보).
  //  1경기짜리는 화면에 "최근 1경기 기반"으로 그대로 표기되니 판단은 독자가 한다.
  if (recentCount + prevXis.length < 1) return null;

  // 가중 투표 — 최근 감쇠 × 대회 계수. 직전 시즌 리그 경기는 고정 0.8.
  // 최근 감쇠 r=0.6. 예전 r≈0.8 은 3주 전 경기를 거의 같은 무게로 봐서, 프리시즌 초반
  //  로테이션이 개막 직전 리허설을 이겼다 — 맨유 실측: 8/08·8/01·7/24 에 선발이던 유스(레이시)가
  //  8/15 마지막 친선 선발이자 신입 주전(틸레망스)을 밀어냈다. 개막전 XI 에 가장 가까운 신호는
  //  마지막 경기다. r=0.6 이면 8/15 XI 의 미드필더 5명과 정확히 일치한다(0.5·0.45 도 같은 결과라
  //  더 극단으로 갈 이유는 없다). 시즌 중에도 최근 폼을 더 반영하는 쪽이고, 컵·친선 로테이션은
  //  대회 계수(컵 0.75·친선 0.5)가 따로 눌러준다.
  const RECENCY = [3, 1.8, 1.08, 0.65, 0.39];
  const compW = (l: string) => (l === league ? 1 : l === "CLUB_FRIENDLY" ? 0.5 : 0.75);
  const ourTeamName = teamName || ctx.nameByTeam.get(teamId) || "";
  const teamSnaps = ourTeamName
    ? ctx.leagueSnaps.filter((s) => teamNameMatches(s.teamName, ourTeamName))
    : [];
  const injured = teamSnaps.length
    ? {
        tsIds: new Set(teamSnaps.map((s) => s.playerTsId).filter((x): x is string => !!x)),
        nameKeys: new Set(teamSnaps.map((s) => lastInitialKey(s.playerName))),
      }
    : undefined;
  // 좌표(x/y)도 같은 가중치로 누계한다. ts 라인업은 선수마다 실제 선 자리를 주는데
  //  (실측: 아마드 x=22 y=70 = 오른쪽 윙, 도르구 x=78 y=70 = 왼쪽 윙, 브루노 x=50 y=70 = 중앙)
  //  이걸 버리고 대분류(G/D/M/F)만 쓰면 화면이 포메이션 틀에 점수순으로 꽂아 좌우까지 뒤집힌다
  //  (2026-08-21 사용자 제보: 맨유 백4 가 마즈라위↔매과이어 반대로, 윙어 둘이 더블 피봇에).
  const vote = new Map<string, VoteRec>();
  const blank = (p: LuPlayer): VoteRec => ({ p, score: 0, starts: 0, ratings: [], lastRating: undefined, pos: new Map() });
  // 벤치는 x=y=0 으로 오므로 선발(first=1)이면서 좌표가 실린 것만 누적한다.
  // 좌표는 **평균이 아니라 최빈 라인**으로 잡는다. 로테이션이 심한 선수를 평균 내면 여러 자리의
  //  중간값이 나와 실제로 서지 않는 곳에 놓이고, 다른 선수와 겹치기까지 한다(실측: 브루노 50,70 /
  //  레이시 51,72 가 포개짐). ts y 는 12·32·50·70·85 처럼 이산값이라 최빈이 잘 먹는다.
  //  x 는 고른 라인 안에서만 가중평균 — 좌우는 라인이 정해진 뒤에 의미가 있다.
  type PosBucket = { w: number; xw: number };
  type VoteRec = { p: LuPlayer; score: number; starts: number; ratings: number[]; lastRating?: number; pos: Map<number, PosBucket> };
  const addPos = (e: VoteRec, p: LuPlayer, w: number) => {
    const x = p.x ?? 0, y = p.y ?? 0;
    if (x <= 0 && y <= 0) return;
    const key = Math.round(y / 5) * 5; // 미세 차이 흡수
    const b = e.pos.get(key) ?? { w: 0, xw: 0 };
    b.w += w;
    b.xw += x * w;
    e.pos.set(key, b);
  };
  /** 최다 가중 라인의 (x, y). 관측이 없으면 null. */
  const restPos = (e: VoteRec): { x: number; y: number } | null => {
    let best: [number, PosBucket] | null = null;
    for (const entry of e.pos) if (!best || entry[1].w > best[1].w) best = entry;
    if (!best) return null;
    return { x: Math.round(best[1].xw / best[1].w), y: best[0] };
  };
  let totalW = 0;
  xis.forEach((xi, i) => {
    const w = (RECENCY[i] ?? 1) * compW(xi.matchLeague);
    totalW += w;
    for (const p of xi.players) {
      const e = vote.get(p.id!) ?? blank(p);
      e.score += w;
      e.starts += 1;
      addPos(e, p, w);
      const r = parseFloat(p.rating ?? "0") || 0;
      if (r > 0) {
        e.ratings.push(r);
        if (i === 0) e.lastRating = r;
      }
      if (p.logo && !e.p.logo) e.p.logo = p.logo;
      vote.set(p.id!, e);
    }
  });
  for (const xi of prevXis) {
    const w = 0.8;
    totalW += w;
    for (const p of xi.players) {
      const e = vote.get(p.id!) ?? blank(p);
      e.score += w;
      e.starts += 1;
      addPos(e, p, w);
      const r = parseFloat(p.rating ?? "0") || 0;
      if (r > 0) e.ratings.push(r);
      if (p.logo && !e.p.logo) e.p.logo = p.logo;
      vote.set(p.id!, e);
    }
  }

  // 부상 제외 — ts id 정확 매칭, 또는 성+이니셜이 후보 중 유일할 때만 (동성 오탐 방어)
  let ranked = [...vote.values()].sort((a, b) => b.score - a.score);
  if (injured) {
    const keyCount = new Map<string, number>();
    for (const e of ranked) {
      const k = lastInitialKey(e.p.name!);
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    const excluded: typeof ranked = [];
    ranked = ranked.filter((e) => {
      const k = lastInitialKey(e.p.name!);
      const out = injured.tsIds.has(e.p.id!) || (injured.nameKeys.has(k) && keyCount.get(k) === 1);
      if (out) excluded.push(e);
      return !out;
    });
    // 부상 제외가 XI 자체를 무너뜨리면 점수 높은 순으로 복귀 — af 계열 스냅샷은 "결장 의심"
    // 까지 담아 한 팀에서 십수 명을 걷어낸다(필라델피아 실측 16행, 선발 풀 22명 중 11명+).
    // 부상·결장 명단은 페이지가 따로 보여주므로 XI 를 비우는 것보다 채우는 게 정보량이 크다.
    if (ranked.length < 11 && excluded.length) {
      ranked = [...ranked, ...excluded.slice(0, 11 - ranked.length)].sort((a, b) => b.score - a.score);
    }
  }

  // 포메이션 = 가장 최근 경기 (리그 경기 우선, 최근 경기 없으면 직전 시즌)
  const formation =
    (xis.find((x) => x.matchLeague === league) ?? xis[0] ?? prevXis[0])?.formation || "4-4-2";
  const slots = slotsFromFormation(formation);
  type VoteEntry = (typeof ranked)[number];
  const toPlayer = (e: VoteEntry, pos: string): PredictedPlayer => ({
    id: e.p.id!, name: e.p.name!,
    position: pos, shirtNumber: e.p.shirt_number,
    // 최빈 라인 좌표 — 화면은 이게 있으면 포메이션 틀 대신 실제 선 자리를 쓴다.
    ...(restPos(e) ?? {}),
    starts: e.starts, games: recentCount + prevXis.length,
    confidence: +(e.score / totalW).toFixed(2),
    photo: e.p.logo,
    avgRating: e.ratings.length > 0
      ? +(e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length).toFixed(2)
      : undefined,
    lastRating: e.lastRating,
  });
  const xi: PredictedPlayer[] = [];
  for (const pos of ["G", "D", "M", "F"]) {
    const need = slots[pos];
    const picked = ranked
      .filter((e) => (e.p.position ?? "M") === pos && !xi.some((x) => x.id === e.p.id))
      .slice(0, need);
    for (const e of picked) xi.push(toPlayer(e, pos));
  }
  for (const e of ranked) {
    if (xi.length >= 11) break;
    if (!xi.some((x) => x.id === e.p.id)) xi.push(toPlayer(e, e.p.position ?? "M"));
  }
  if (xi.length !== 11) return null;
  return {
    teamName: teamName || ctx.nameByTeam.get(teamId) || "",
    formation, basedOnGames: recentCount + prevXis.length,
    updatedAt: new Date().toISOString(), xi,
  };
}

export async function runBuildClubXi(): Promise<{ leagues: number; teams: number; byLeague: Record<string, number> }> {
  // 현재 스쿼드 (data/team-squads.json, ts team id 키) — 직전 시즌 선발의 이적·방출 필터.
  let squadByTsTeam: Record<string, { squad?: { id: string }[] }> = {};
  try {
    squadByTsTeam = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
    );
  } catch {
    console.log("[club-xi] team-squads.json 없음 — 최근 라인업 로스터만으로 게이트");
  }

  const byLeague: Record<string, number> = {};
  let teamsTotal = 0;

  for (const league of TARGET_LEAGUES) {
    // 대상 팀 = 향후 14일 예정 매치의 양 팀 — Team.league 라벨(롤오버 수동)에 의존하지 않는다.
    const upcoming = await prisma.match.findMany({
      where: {
        league,
        status: "SCHEDULED",
        startTime: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400e3) },
      },
      select: { homeTeamId: true, awayTeamId: true },
    });
    const teamIds = [...new Set(upcoming.flatMap((m) => [m.homeTeamId, m.awayTeamId]))].filter(
      (id): id is number => id != null,
    );
    if (teamIds.length === 0) {
      console.log(`[club-xi] ${league}: 향후 14일 예정 매치 없음 — skip`);
      continue;
    }

    // 최신 부상 스냅샷 (3일 이내). ⚠️ 스냅샷 teamId 는 전부 null — teamName 정규화 매칭으로 간다.
    const latestSnap = await prisma.injurySnapshot.findFirst({
      where: { league, capturedAt: { gte: new Date(Date.now() - 3 * 86400e3) } },
      orderBy: { capturedAt: "desc" },
      select: { capturedOn: true },
    });
    const leagueSnaps: InjurySnapRow[] = latestSnap
      ? await prisma.injurySnapshot.findMany({
          where: { league, capturedOn: latestSnap.capturedOn },
          select: { teamName: true, playerTsId: true, playerName: true },
        })
      : [];

    const allSrc = await prisma.teamSourceId.findMany({
      where: { teamId: { in: teamIds } },
      select: { teamId: true, externalId: true, source: true },
    });
    const tsIdByTeam = new Map(
      allSrc.filter((r) => r.source === "thesports").map((r) => [r.teamId, r.externalId]),
    );
    const nameRows = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
    });
    const nameByTeam = new Map(nameRows.map((r) => [r.id, r.name]));

    // 유령 쌍둥이 브리지 — 같은 클럽이 별도 Team row 로 갈라진 경우 재료를 합친다.
    // 다리 1: sourceId 공유 row. 다리 2: 정확 동명 + CLUB_FRIENDLY row 한정
    // (부분일치 금지 — "UWIC Inter Cardiff" 가 "Cardiff" 에 붙는 오염 방지).
    //
    // ⚠ 다리 1 은 반드시 **(source, externalId) 쌍**으로 이어야 한다. externalId 만 비교하면
    //   소스가 다른데 문자열이 같은 남의 팀이 통째로 붙는다 — af·espn·football-data·npb·
    //   leaguepedia 가 전부 작은 정수 id 를 쓰기 때문에 충돌이 흔하다. 2026-08-21 실측:
    //   리버풀(espn=364) ← 유르고덴(af=364), 첼시(espn=363) ← 함마르뷔(af=363),
    //   맨시티(espn=382) ← FC 비쳅스크(af=382), 헐 시티(fd=322) ← 라나임(af=322).
    //   EPL 19팀 중 절반이 스웨덴·노르웨이·벨라루스 선수단으로 채워져 있었고 NPB 야구팀·
    //   LCK e스포츠팀까지 딸려왔다.
    const pairOf = (r: { source: string; externalId: string }) => `${r.source}:${r.externalId}`;
    const pairsByTeam = new Map<number, string[]>();
    for (const r of allSrc) pairsByTeam.set(r.teamId, [...(pairsByTeam.get(r.teamId) ?? []), pairOf(r)]);
    const ownPairs = new Set(allSrc.map(pairOf));
    const allExt = [...new Set(allSrc.map((r) => r.externalId))];
    const twinSrc = allExt.length
      ? await prisma.teamSourceId.findMany({
          where: { externalId: { in: allExt }, teamId: { notIn: teamIds } },
          select: { teamId: true, externalId: true, source: true },
        })
      : [];
    const twinsByPair = new Map<string, number[]>();
    for (const r of twinSrc) {
      const key = pairOf(r);
      if (!ownPairs.has(key)) continue; // 같은 문자열이어도 소스가 다르면 남의 팀이다
      twinsByPair.set(key, [...(twinsByPair.get(key) ?? []), r.teamId]);
    }
    const nameTwinRows = await prisma.team.findMany({
      where: { name: { in: [...nameByTeam.values()] }, league: "CLUB_FRIENDLY", id: { notIn: teamIds } },
      select: { id: true, name: true },
    });
    const twinsByName = new Map<string, number[]>();
    for (const r of nameTwinRows) twinsByName.set(r.name, [...(twinsByName.get(r.name) ?? []), r.id]);
    const groupOf = (id: number): number[] => [
      ...new Set([
        id,
        ...(pairsByTeam.get(id) ?? []).flatMap((key) => twinsByPair.get(key) ?? []),
        ...(twinsByName.get(nameByTeam.get(id) ?? "") ?? []),
      ]),
    ];

    const ctx = { leagueSnaps, tsIdByTeam, nameByTeam, squadByTsTeam };
    const leagueOut: Record<string, ClubXiTeamOut> = {};
    // 팀 단위 동시 처리 — 순차로는 25리그가 Vercel 300s 를 위협한다.
    for (let i = 0; i < teamIds.length; i += TEAM_CONCURRENCY) {
      const batch = teamIds.slice(i, i + TEAM_CONCURRENCY);
      const results = await Promise.all(
        batch.map((id) => buildTeam(league, id, groupOf(id), ctx).catch(() => null)),
      );
      batch.forEach((id, j) => {
        if (results[j]) leagueOut[String(id)] = results[j]!;
      });
    }

    // 한글명 주입 — 리그 단위 (전 리그 합산 1콜이던 원본과 결과 동일, 쿼리만 분할)
    const ids = [...new Set(Object.values(leagueOut).flatMap((t) => t.xi.map((p) => p.id)))];
    if (ids.length) {
      const koRows = await prisma.theSportsPlayer.findMany({
        where: { id: { in: ids }, nameKo: { not: null } },
        select: { id: true, nameKo: true },
      });
      const koById = new Map(koRows.map((r) => [r.id, r.nameKo!]));
      for (const t of Object.values(leagueOut)) for (const p of t.xi) {
        const ko = koById.get(p.id);
        if (ko) p.nameKo = ko;
      }
    }

    await prisma.predictedXiCache.upsert({
      where: { league },
      update: { payload: leagueOut },
      create: { league, payload: leagueOut },
    });
    byLeague[league] = Object.keys(leagueOut).length;
    teamsTotal += byLeague[league];
    console.log(`[club-xi] ${league}: 대상 ${teamIds.length}팀 중 ${byLeague[league]}팀 예상 XI 산출`);
  }

  // 지원 해제된 리그의 잔존 row 정리 — 낡은 예상 XI 가 화면에 남지 않게.
  await prisma.predictedXiCache.deleteMany({ where: { league: { notIn: TARGET_LEAGUES } } });

  return { leagues: Object.keys(byLeague).length, teams: teamsTotal, byLeague };
}
