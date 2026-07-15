// 확정 라인업 자동 발행 — TheSports 공식 선발(confirmed=1)이 캐시에 뜨면 두 팀 XI 를
// /lineup 전술판 versus 보드로 조립해 자유게시판(FREE)에 발행. LLM 호출 0, 전부 결정론.
// 설계·결정 근거: docs/lineup-post-bot/{plan,context-notes}.md
import "@/lib/env";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { encodeBoard, newUid, type BoardState, type Placed } from "@/lib/lineup/lineup-state";
import type { Pos } from "@/lib/lineup/formations";
import type {
  TSFootballLineupResponse,
  TSFootballLineupPlayer,
  TSFootballInjuryEntry,
} from "@/lib/sports/thesports/football-types";

// 대상 리그 — 마이너 도배 방지, 사용자 확정 범위 (2026-07-15).
const TARGET_LEAGUES = ["WORLD_CUP", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "K_LEAGUE_1"];
// 리그 한글 라벨 — analysis/matches.ts 의 leagueLabel 은 server-only 라 tsx 실행이 막혀 로컬 정의.
const LEAGUE_KO: Record<string, string> = {
  WORLD_CUP: "월드컵", EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에A", LIGUE_1: "리그1", UCL: "챔피언스리그", UEL: "유로파리그", K_LEAGUE_1: "K리그1",
};
const leagueLabel = (code: string): string => LEAGUE_KO[code] ?? code;
const TITLE_PREFIX = "[라인업]";
const MANAGER_EMAIL = "manager@scorebase.internal";
// 동시 킥오프 폭주 방어 — 초과분은 다음 10분 cron 이 집어간다.
const MAX_POSTS_PER_RUN = 4;

type TsLineup = TSFootballLineupResponse["results"];

// 선수 표기 — 교정 사전 최우선 → DB 공식 한글명(nameKo) → 영문 (OG 렌더러와 동일 우선순위).
function playerKo(name: string | null | undefined, dbKo?: string | null): string {
  if (!name) return "?";
  const fixed = toKoreanPlayerName(name);
  if (/[가-힣]/.test(fixed)) return fixed;
  if (dbKo && /[가-힣]/.test(dbKo)) return dbKo;
  return name;
}
function posOf(letter: string | null | undefined): Pos {
  if (letter === "G") return "GK";
  if (letter === "D") return "DF";
  if (letter === "M") return "MF";
  return "FW";
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function kstKickoff(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${hh}:${mm}`;
}

/**
 * TS 좌표 → 전술판 versus 좌표.
 * TS: y 자기 골문=작음(GK≈12)·공격 방향 증가 / 빌더: y 0=공격·100=GK (formations.ts).
 * away 좌표 프레임이 문서상 모호해 GK y 로 자가 판별 — GK 가 y>50 이면 그 팀 좌표를 뒤집는다.
 * versus 절반 배치는 transfer-daily 검증식(홈=아래 50+0.46y, 원정=위 미러 50-0.46y) 재사용.
 */
function toVersusPlayers(
  xi: TSFootballLineupPlayer[],
  side: "home" | "away",
  names: Map<string, string | null>,
): Placed[] {
  const gk = xi.find((p) => p.position === "G");
  const flip = !!gk && gk.y > 50;
  return xi.map((p) => {
    const yTs = flip ? 100 - p.y : p.y;
    const xTs = flip ? 100 - p.x : p.x;
    const yB = clamp(100 - yTs, 0, 100);
    const x = side === "away" ? 100 - xTs : xTs;
    const y = side === "away" ? 50 - yB * 0.46 : 50 + yB * 0.46;
    const known = names.has(p.id);
    return {
      uid: newUid(),
      pid: known ? p.id : null,
      name: known ? null : playerKo(p.name),
      pos: posOf(p.position),
      x: clamp(Math.round(x), 3, 97),
      y: clamp(Math.round(y), 3, 97),
    };
  });
}

// 선발 명단 텍스트 — 포지션 그룹별 (GK → DF → MF → FW), 주장은 (C) 표기.
function xiLines(xi: TSFootballLineupPlayer[], names: Map<string, string | null>): string {
  const groups: [string, string][] = [["G", "GK"], ["D", "DF"], ["M", "MF"], ["F", "FW"]];
  return groups
    .map(([letter, label]) => {
      const list = xi
        .filter((p) => p.position === letter)
        .map((p) => `${playerKo(p.name, names.get(p.id))}${p.captain === 1 ? " (C)" : ""}`);
      return list.length ? `- ${label}: ${list.join(", ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// 결장 명단 한 줄 — 부상/징계만 (0=unknown 은 소음이라 제외), 최대 6명.
const INJURY_TYPE_KO: Record<number, string> = { 1: "부상", 2: "징계", 3: "출전 불투명" };
function injuryLine(entries: TSFootballInjuryEntry[] | undefined, names: Map<string, string | null>): string {
  const list = (entries ?? [])
    .filter((e) => e.name && INJURY_TYPE_KO[e.type])
    .slice(0, 6)
    .map((e) => `${playerKo(e.name, names.get(e.id))}(${INJURY_TYPE_KO[e.type]})`);
  return list.join(", ");
}

interface Candidate {
  id: number;
  league: string;
  externalId: string;
  startTime: Date;
  homeName: string;
  awayName: string;
  lineup: TsLineup;
}

function pickXi(side: TSFootballLineupPlayer[] | undefined): TSFootballLineupPlayer[] {
  return (side ?? []).filter((p) => p.first === 1);
}

async function buildPost(c: Candidate) {
  const homeKo = toKoreanTeamName(c.homeName, c.league) || c.homeName;
  const awayKo = toKoreanTeamName(c.awayName, c.league) || c.awayName;
  const homeXi = pickXi(c.lineup.lineup?.home);
  const awayXi = pickXi(c.lineup.lineup?.away);

  // pid 게이트 겸 한글명 로드 — OG 렌더러는 TheSportsPlayer 로 이름·사진을 해석하므로
  // 존재하는 id 만 pid 로, nameKo 는 본문 표기에 사용. 부상 명단 id 도 함께.
  const allIds = [
    ...[...homeXi, ...awayXi].map((p) => p.id),
    ...[...(c.lineup.injury?.home ?? []), ...(c.lineup.injury?.away ?? [])].map((e) => e.id),
  ].filter(Boolean);
  const names = new Map<string, string | null>(
    (await prisma.theSportsPlayer.findMany({ where: { id: { in: allIds } }, select: { id: true, nameKo: true } }))
      .map((r) => [r.id, r.nameKo]),
  );

  const kickoff = kstKickoff(c.startTime);
  const lgKo = leagueLabel(c.league);
  // OG 카드가 versus 부제를 "원정 vs 홈" 클럽명으로 자동 생성하므로 제목엔 팀명 대신 대회명.
  const board: BoardState = {
    mode: "versus",
    displayMode: "photo",
    orientation: "portrait",
    title: `${lgKo} 공식 선발 라인업`,
    subtitle: `킥오프 ${kickoff}`,
    kit: "grass",
    home: { club: homeKo, formation: c.lineup.home_formation || null, players: toVersusPlayers(homeXi, "home", names) },
    away: { club: awayKo, formation: c.lineup.away_formation || null, players: toVersusPlayers(awayXi, "away", names) },
    bench: [],
    strokes: [],
  };

  const title = `${TITLE_PREFIX} ${homeKo} vs ${awayKo} 공식 선발 — ${lgKo}`;

  const homeInj = injuryLine(c.lineup.injury?.home, names);
  const awayInj = injuryLine(c.lineup.injury?.away, names);
  const injuryBlock = homeInj || awayInj
    ? ["**결장 명단**", homeInj ? `- ${homeKo}: ${homeInj}` : "", awayInj ? `- ${awayKo}: ${awayInj}` : ""].filter(Boolean).join("\n")
    : "";

  const content = [
    `${lgKo} ${homeKo} vs ${awayKo} 경기의 공식 선발 라인업이 발표됐습니다. 킥오프는 **${kickoff}**(한국시간)입니다.`,
    [`**${homeKo}** (${c.lineup.home_formation || "포메이션 미상"})`, xiLines(homeXi, names)].join("\n"),
    [`**${awayKo}** (${c.lineup.away_formation || "포메이션 미상"})`, xiLines(awayXi, names)].join("\n"),
    injuryBlock,
    `두 팀 선발을 아래 전술판에서 한눈에 비교할 수 있습니다. 여러분이 감독이라면 어디를 바꾸시겠습니까? [전술판에서 직접 수정](/lineup)해 보세요.`,
    `경기 라이브: [매치 페이지](/live/${c.league}/${c.externalId})`,
  ].filter((s) => s && s.trim()).join("\n\n");

  return { title, content, lineupCode: encodeBoard(board) };
}

export async function runGenerateLineupPost(opts?: { dryRun?: boolean }) {
  const manager = await prisma.user.findUnique({ where: { email: MANAGER_EMAIL }, select: { id: true } });
  if (!manager) throw new Error("분석팀 계정 없음 (manager@scorebase.internal)");

  // 임박 매치 — 킥오프 3h 전 ~ 45분 후(라인업이 킥오프 직전·직후 도착하는 리그 커버).
  const rows = await prisma.match.findMany({
    where: {
      league: { in: TARGET_LEAGUES },
      status: { in: ["SCHEDULED", "LIVE"] },
      startTime: { gte: new Date(Date.now() - 45 * 60e3), lte: new Date(Date.now() + 3 * 3600e3) },
      theSportsCache: { isNot: null },
    },
    select: {
      id: true, league: true, externalId: true, startTime: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      theSportsCache: { select: { lineup: true } },
    },
    orderBy: { startTime: "asc" },
  });

  let candidates: Candidate[] = rows.flatMap((r) => {
    const lu = r.theSportsCache?.lineup as TsLineup | null;
    if (!lu || lu.confirmed !== 1) return [];
    if (pickXi(lu.lineup?.home).length !== 11 || pickXi(lu.lineup?.away).length !== 11) return [];
    return [{ id: r.id, league: r.league, externalId: r.externalId, startTime: r.startTime, homeName: r.homeTeam.name, awayName: r.awayTeam.name, lineup: lu }];
  });

  // dry-run 인데 임박 매치가 없으면 최근 종료 매치로 폴백 — 좌표 변환·본문 검증용.
  if (opts?.dryRun && candidates.length === 0) {
    const fin = await prisma.match.findMany({
      where: { league: { in: TARGET_LEAGUES }, status: "FINISHED", theSportsCache: { isNot: null } },
      select: {
        id: true, league: true, externalId: true, startTime: true,
        homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
        theSportsCache: { select: { lineup: true } },
      },
      orderBy: { startTime: "desc" },
      take: 30,
    });
    candidates = fin.flatMap((r) => {
      const lu = r.theSportsCache?.lineup as TsLineup | null;
      if (!lu || lu.confirmed !== 1) return [];
      if (pickXi(lu.lineup?.home).length !== 11 || pickXi(lu.lineup?.away).length !== 11) return [];
      return [{ id: r.id, league: r.league, externalId: r.externalId, startTime: r.startTime, homeName: r.homeTeam.name, awayName: r.awayTeam.name, lineup: lu }];
    }).slice(0, 1);
  }

  if (candidates.length === 0) return { posted: 0, reason: "no-candidates" };

  // 중복 가드 — 매치당 1글.
  const already = new Set(
    (await prisma.post.findMany({
      where: { matchId: { in: candidates.map((c) => c.id) }, title: { startsWith: TITLE_PREFIX } },
      select: { matchId: true },
    })).map((p) => p.matchId),
  );
  const fresh = candidates.filter((c) => !already.has(c.id)).slice(0, MAX_POSTS_PER_RUN);
  if (fresh.length === 0) return { posted: 0, reason: "already" };

  const results: { matchId: number; postId?: number; title: string }[] = [];
  for (const c of fresh) {
    const built = await buildPost(c);
    if (opts?.dryRun) {
      results.push({ matchId: c.id, title: built.title });
      console.log(JSON.stringify({ dry: true, ...built }, null, 2));
      continue;
    }
    const post = await prisma.post.create({
      data: {
        authorId: manager.id,
        category: "FREE",
        sport: "soccer",
        matchId: c.id,
        title: built.title,
        content: built.content,
        lineupCode: built.lineupCode,
      },
      select: { id: true },
    });
    console.log(`[lineup-post] 발행: post ${post.id} — ${built.title}`);
    results.push({ matchId: c.id, postId: post.id, title: built.title });
  }
  return { posted: opts?.dryRun ? 0 : results.length, dryRun: !!opts?.dryRun, results };
}

// tsx 직접 실행 (npm run job:lineup-post) — `--dry` 로 발행 없이 미리보기.
if (import.meta.url === `file://${process.argv[1]}`) {
  runGenerateLineupPost({ dryRun: process.argv.includes("--dry") })
    .then((r) => console.log(JSON.stringify({ ...r, results: r.results?.map((x) => x.title) })))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
