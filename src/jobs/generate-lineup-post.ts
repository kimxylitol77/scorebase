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
 * TS 좌표 → 전술판 versus 좌표 — 라인 군집화 후 균등 간격 재배치.
 * 원시 좌표를 0.46 로 접으면 최전방끼리 하프라인에서 만나고 라인 간격이 4~7%까지 좁아져
 * OG 카드에서 이름표가 아래 선수와 겹친다(첫 렌더 실측). 대신 TS y 로 라인만 추출하고
 * 좌표는 재구성한다 — 라인 y 균등(GK 92 ↔ 최전방 56, 원정 미러 8↔44 = 하프라인 완충 12%),
 * 라인 내 x 도 인원수 기준 균등 분산. 포메이션 형태는 라인 구조·선수 순서로 보존된다.
 * away 좌표 프레임이 문서상 모호해 GK y 로 자가 판별 — GK 가 y>50 이면 그 팀 좌표를 뒤집는다.
 */
function toVersusPlayers(
  xi: TSFootballLineupPlayer[],
  side: "home" | "away",
  names: Map<string, string | null>,
): Placed[] {
  const gk = xi.find((p) => p.position === "G");
  const flip = !!gk && gk.y > 50;
  const norm = xi.map((p) => ({
    p,
    yTs: flip ? 100 - p.y : p.y, // 자기 골문=작음 으로 통일
    xTs: flip ? 100 - p.x : p.x,
  }));

  const lines: (typeof norm)[] = [];
  if (norm.every((e) => !e.p.x && !e.p.y)) {
    // 좌표 부재 폴백 — TS 가 x/y 를 아예 안 주는 매치(K리그1 실측, post 1137)는 전원 yTs=0 이라
    // 아래 군집화가 한 줄로 붕괴해 골라인 일렬 보드가 된다. 포지션 문자로 GK→DF→MF→FW 라인 재구성.
    const order: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };
    const buckets = new Map<number, typeof norm>();
    for (const e of norm) {
      const key = order[e.p.position] ?? 2;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
    }
    lines.push(...[...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
  } else {
    // 라인 군집화 — y 오름차순(GK 부터), 직전 라인과 8 이상 벌어지면 새 라인.
    norm.sort((a, b) => a.yTs - b.yTs);
    for (const e of norm) {
      const cur = lines[lines.length - 1];
      if (cur && e.yTs - cur[cur.length - 1].yTs < 8) cur.push(e);
      else lines.push([e]);
    }
  }
  // 최대 5라인 — 6라인이면 간격이 7.2%로 좁아져 같은 x 의 이름표가 아랫라인 원에 겹친다(실측).
  // 가장 가까운 인접 라인 쌍부터 병합해 간격 9% 이상을 보장한다.
  while (lines.length > 5) {
    let best = 1, bestGap = Infinity;
    for (let i = 1; i < lines.length; i++) {
      const gapY = lines[i][0].yTs - lines[i - 1][lines[i - 1].length - 1].yTs;
      if (gapY < bestGap) { bestGap = gapY; best = i; }
    }
    lines[best - 1].push(...lines[best]);
    lines.splice(best, 1);
  }

  const placed: Placed[] = [];
  const n = lines.length;
  lines.forEach((line, i) => {
    // 라인 y — GK(i=0) 92 부터 최전방 56 까지 균등. 원정은 위쪽 절반 미러.
    const yHome = n > 1 ? 92 - (i * 36) / (n - 1) : 92;
    const y = side === "away" ? 100 - yHome : yHome;
    // 라인 내 x — TS x 순서 유지(원정은 미러), 중앙 기준 균등 분산.
    line.sort((a, b) => (side === "away" ? b.xTs - a.xTs : a.xTs - b.xTs));
    const k = line.length;
    const gap = k > 1 ? Math.min(24, 84 / (k - 1)) : 0;
    line.forEach((e, j) => {
      const x = 50 + (j - (k - 1) / 2) * gap;
      const known = names.has(e.p.id);
      placed.push({
        uid: newUid(),
        pid: known ? e.p.id : null,
        name: known ? null : playerKo(e.p.name),
        pos: posOf(e.p.position),
        x: clamp(Math.round(x), 3, 97),
        y: clamp(Math.round(y), 3, 97),
      });
    });
  });
  return placed;
}

// 선발 명단 텍스트 — 포지션 그룹별 (GK → DF → MF → FW), 주장은 (C) 표기.
// 포지션 미상(초기 도착분은 position 이 빈 값인 경우 실측 — 1136 김천 GK)은 "기타"로라도
// 반드시 표기 — 그룹 필터에서 조용히 탈락해 명단이 10명이 되던 문제 방지.
function xiLines(xi: TSFootballLineupPlayer[], names: Map<string, string | null>): string {
  const groups: [string, string][] = [["G", "GK"], ["D", "DF"], ["M", "MF"], ["F", "FW"], ["", "기타"]];
  const knownLetters = new Set(["G", "D", "M", "F"]);
  return groups
    .map(([letter, label]) => {
      const list = xi
        .filter((p) => (letter === "" ? !knownLetters.has(p.position) : p.position === letter))
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

export async function buildPost(c: Candidate) {
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
    const homeXi = pickXi(lu.lineup?.home);
    const awayXi = pickXi(lu.lineup?.away);
    if (homeXi.length !== 11 || awayXi.length !== 11) return [];
    // GK 도착 게이트 — 초기 도착분은 position 이 비어 있어(1136 김천 실측) 명단·보드가 깨진다.
    // 양팀 모두 G 가 잡힐 때까지 이번 런은 보류(다음 10분 런이 재시도).
    if (!homeXi.some((p) => p.position === "G") || !awayXi.some((p) => p.position === "G")) return [];
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
