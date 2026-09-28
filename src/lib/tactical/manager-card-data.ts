// 감독 기록 그림 카드용 데이터 — 이달의 감독 글(월말 기준)과 경기 전술 글(그 경기 종료 기준) 두 입구가 같은 집계를 쓴다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { selectionTable } from "@/lib/tactical/manager-select";
import type { TacticalManagerContext } from "@/lib/tactical/manager-aggregate";
import { coachById } from "@/lib/coach-photos";
import { toKoreanCoachName } from "@/lib/coach-names";

export interface CardRecord { played: number; w: number; d: number; l: number; gf: number; ga: number; points: number }

export interface ManagerCardData {
  /** 카드 꼬리표 — "이달의 감독" | "감독 기록" */
  tag: string;
  league: string;
  /** "2026-09" */
  month: string;
  monthLabel: string;
  team: { nameKo: string; logo: string | null };
  coach: { nameKo: string; photo: string | null; formation: string | null };
  monthRecord: CardRecord & { rank: number };
  season: CardRecord & { rank: number; teams: number };
  form: { date: string; opponentKo: string; opponentLogo: string | null; homeAway: "H" | "A"; gf: number; ga: number; result: "W" | "D" | "L" }[];
  /** 이달 리그 전 팀 — 기대 대비 초과 성과 내림차순 */
  leagueMonth: { nameKo: string; logo: string | null; ppg: number; expectedPpg: number | null; over: number; isWinner: boolean }[];
  /** 선정 팀의 이달 지표 백분위(0~1, 높을수록 좋음) */
  percentiles: { key: string; label: string; value: string; pct: number }[];
  /** 시즌 라운드별 순위 — 현재 상위 6팀. ranks[k] = 각 팀의 첫 k+1경기까지 집계한 순위 */
  bump: { rounds: number; teams: { nameKo: string; logo: string | null; isWinner: boolean; ranks: number[] }[] };
  /** 시즌 현재 연승 수(마지막 경기부터 거슬러) */
  winStreak: number;
  /** 선정 점수 상위 4팀. 첫 행이 선정 팀이 아닐 수 있어 isWinner 로 표시 */
  rivals: { nameKo: string; logo: string | null; ppg: number; expectedPpg: number | null; over: number; isWinner: boolean }[];
}

interface Base {
  tag: string;
  league: string;
  teamId: number;
  /** 강조할 팀 — 경기 글은 양 팀 */
  highlight: number[];
  /** 집계 상한(포함) */
  to: Date;
  coach: { nameKo: string; photo: string | null; formation: string | null };
}

/** 이달의 감독 글 — 그 달 말일까지 */
export async function loadManagerCard(articleId: number): Promise<ManagerCardData | null> {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { league: true, type: true, tacticalContext: true } });
  if (!article?.tacticalContext || article.type !== "TACTICAL" || !article.league) return null;
  const ctx = JSON.parse(article.tacticalContext) as TacticalManagerContext;
  if (!ctx.coach || !ctx.record || !ctx.matches?.length) return null; // 경기 전술 글(감독 집계 없음)
  const [y, m] = ctx.matches[ctx.matches.length - 1].date.slice(0, 7).split("-").map(Number);
  return build({
    tag: "이달의 감독", league: article.league, teamId: ctx.team.id, highlight: [ctx.team.id],
    to: new Date(Date.UTC(y, m, 0, 23, 59, 59)),
    coach: { nameKo: ctx.coach.nameKo, photo: ctx.coachPhoto ?? ctx.coach.logo ?? null, formation: ctx.coach.preferredFormation },
  });
}

/** 경기 전술 글 — 그 경기 종료 시점까지. 감독은 ts 라인업의 coach_id */
export async function loadMatchManagerCard(matchId: number, side: "home" | "away"): Promise<ManagerCardData | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { league: true, status: true, startTime: true, homeTeamId: true, awayTeamId: true, theSportsCache: { select: { lineup: true } } },
  });
  if (!match || match.status !== "FINISHED") return null;
  const lu = match.theSportsCache?.lineup as { coach_id?: { home?: string; away?: string }; home_formation?: string; away_formation?: string } | null | undefined;
  const c = coachById(lu?.coach_id?.[side]);
  const nameKo = c?.nameKo ?? toKoreanCoachName(c?.name);
  if (!c || !nameKo) return null;
  return build({
    tag: "감독 기록", league: match.league, teamId: side === "home" ? match.homeTeamId : match.awayTeamId,
    highlight: [match.homeTeamId, match.awayTeamId], to: match.startTime,
    coach: { nameKo, photo: c.logo, formation: (side === "home" ? lu?.home_formation : lu?.away_formation) ?? null },
  });
}

async function build(b: Base): Promise<ManagerCardData | null> {
  const { league } = b;
  const y = b.to.getUTCFullYear();
  const m = b.to.getUTCMonth() + 1;
  const month = `${y}-${String(m).padStart(2, "0")}`;
  const monthFrom = new Date(Date.UTC(y, m - 1, 1));
  const monthTo = b.to;
  const seasonFrom = new Date(Date.UTC(m >= 7 ? y : y - 1, 6, 1));

  const rows = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: seasonFrom, lte: monthTo }, homeScore: { not: null }, awayScore: { not: null } },
    select: {
      id: true, startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      predHome: true, predDraw: true, predAway: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
  });
  const teamInfo = new Map<number, { nameKo: string; logo: string | null }>();
  for (const r of rows) {
    teamInfo.set(r.homeTeamId, { nameKo: toKoreanTeamName(r.homeTeam.name, league), logo: r.homeTeam.logoUrl });
    teamInfo.set(r.awayTeamId, { nameKo: toKoreanTeamName(r.awayTeam.name, league), logo: r.awayTeam.logoUrl });
  }

  // 시즌 기록·순위 (승점 → 득실차 → 득점)
  const table = new Map<number, CardRecord>();
  const add = (id: number, gf: number, ga: number) => {
    const c = table.get(id) ?? { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0 };
    c.played++; c.gf += gf; c.ga += ga;
    if (gf > ga) { c.w++; c.points += 3; } else if (gf === ga) { c.d++; c.points += 1; } else c.l++;
    table.set(id, c);
  };
  for (const r of rows) {
    add(r.homeTeamId, r.homeScore!, r.awayScore!);
    add(r.awayTeamId, r.awayScore!, r.homeScore!);
  }
  const sorted = [...table.entries()].sort((a, b) => b[1].points - a[1].points || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga) || b[1].gf - a[1].gf);
  const seasonRec = table.get(b.teamId);
  if (!seasonRec) return null;

  const monthRows = rows.filter((r) => r.startTime >= monthFrom);
  const rivals = selectionTable(monthRows.map((r) => ({ ...r, homeScore: r.homeScore!, awayScore: r.awayScore! })))
    .filter((t) => t.played >= 3)
    .slice(0, 4)
    .map((t) => ({
      nameKo: teamInfo.get(t.teamId)?.nameKo ?? "",
      logo: teamInfo.get(t.teamId)?.logo ?? null,
      ppg: t.ppg, expectedPpg: t.expectedPpg, over: t.over,
      isWinner: b.highlight.includes(t.teamId),
    }));

  const monthTable = selectionTable(monthRows.map((r) => ({ ...r, homeScore: r.homeScore!, awayScore: r.awayScore! })));
  const leagueMonth = [...monthTable]
    .sort((x, y) => y.over - x.over)
    .map((t) => ({
      nameKo: teamInfo.get(t.teamId)?.nameKo ?? "", logo: teamInfo.get(t.teamId)?.logo ?? null,
      ppg: t.ppg, expectedPpg: t.expectedPpg, over: t.over, isWinner: b.highlight.includes(t.teamId),
    }));

  // 이달 팀별 득점·실점·무실점 → 백분위
  const mStat = new Map<number, { n: number; gf: number; ga: number; cs: number }>();
  const addM = (id: number, gf: number, ga: number) => {
    const c = mStat.get(id) ?? { n: 0, gf: 0, ga: 0, cs: 0 };
    c.n++; c.gf += gf; c.ga += ga; if (ga === 0) c.cs++;
    mStat.set(id, c);
  };
  for (const row of monthRows) {
    addM(row.homeTeamId, row.homeScore!, row.awayScore!);
    addM(row.awayTeamId, row.awayScore!, row.homeScore!);
  }
  const selById = new Map(monthTable.map((t) => [t.teamId, t]));
  const ids = [...mStat.keys()];
  const metric = (id: number) => {
    const c = mStat.get(id)!;
    const t = selById.get(id);
    return { ppg: t?.ppg ?? 0, gf: c.gf / c.n, ga: -c.ga / c.n, gd: (c.gf - c.ga) / c.n, cs: c.cs / c.n, over: t?.over ?? 0 };
  };
  const mine = metric(b.teamId);
  const pctOf = (k: keyof typeof mine) => ids.filter((id) => metric(id)[k] <= mine[k]).length / ids.length;
  const myM = mStat.get(b.teamId)!;
  const percentiles = [
    { key: "ppg", label: "경기당 승점", value: mine.ppg.toFixed(2), pct: pctOf("ppg") },
    { key: "gf", label: "경기당 득점", value: mine.gf.toFixed(1), pct: pctOf("gf") },
    { key: "ga", label: "경기당 실점", value: (myM.ga / myM.n).toFixed(1), pct: pctOf("ga") },
    { key: "gd", label: "경기당 득실차", value: `${mine.gd >= 0 ? "+" : ""}${mine.gd.toFixed(1)}`, pct: pctOf("gd") },
    { key: "cs", label: "무실점 경기", value: `${myM.cs}/${myM.n}`, pct: pctOf("cs") },
    { key: "over", label: "기대 대비", value: `${mine.over >= 0 ? "+" : ""}${mine.over.toFixed(2)}`, pct: pctOf("over") },
  ];

  // 라운드별 순위 — 팀마다 첫 k경기까지 집계
  const perTeam = new Map<number, { gf: number; ga: number }[]>();
  for (const row of [...rows].sort((x, y) => x.startTime.getTime() - y.startTime.getTime())) {
    (perTeam.get(row.homeTeamId) ?? perTeam.set(row.homeTeamId, []).get(row.homeTeamId)!).push({ gf: row.homeScore!, ga: row.awayScore! });
    (perTeam.get(row.awayTeamId) ?? perTeam.set(row.awayTeamId, []).get(row.awayTeamId)!).push({ gf: row.awayScore!, ga: row.homeScore! });
  }
  const rounds = seasonRec.played;
  const rankAt = (k: number) => {
    const t = [...perTeam.entries()].map(([id, g]) => {
      const part = g.slice(0, k);
      const pts = part.reduce((a2, x) => a2 + (x.gf > x.ga ? 3 : x.gf === x.ga ? 1 : 0), 0);
      const gf = part.reduce((a2, x) => a2 + x.gf, 0);
      const ga = part.reduce((a2, x) => a2 + x.ga, 0);
      return { id, pts, gd: gf - ga, gf };
    }).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
    return new Map(t.map((x, i) => [x.id, i + 1]));
  };
  const rankMaps = Array.from({ length: rounds }, (_, i) => rankAt(i + 1));
  const bump = {
    rounds,
    // 상위 6팀 + 강조 팀(6위 밖이어도)
    teams: sorted.filter(([id], i) => i < 6 || b.highlight.includes(id)).map(([id]) => ({
      nameKo: teamInfo.get(id)?.nameKo ?? "", logo: teamInfo.get(id)?.logo ?? null, isWinner: b.highlight.includes(id),
      ranks: rankMaps.map((mp) => mp.get(id) ?? sorted.length),
    })),
  };
  const mineGames = perTeam.get(b.teamId) ?? [];
  let winStreak = 0;
  for (let i = mineGames.length - 1; i >= 0 && mineGames[i].gf > mineGames[i].ga; i--) winStreak++;

  const monthSorted = [...mStat.entries()]
    .map(([id, c]) => ({ id, pts: selById.get(id)!.ppg * c.n, gd: c.gf - c.ga, gf: c.gf }))
    .sort((x, y2) => y2.pts - x.pts || y2.gd - x.gd || y2.gf - x.gf);
  const mineRows = monthRows
    .filter((row) => row.homeTeamId === b.teamId || row.awayTeamId === b.teamId)
    .sort((x, y2) => x.startTime.getTime() - y2.startTime.getTime());
  if (!mineRows.length) return null;
  const form = mineRows.map((row) => {
    const home = row.homeTeamId === b.teamId;
    const gf = home ? row.homeScore! : row.awayScore!;
    const ga = home ? row.awayScore! : row.homeScore!;
    const opp = teamInfo.get(home ? row.awayTeamId : row.homeTeamId);
    return {
      date: row.startTime.toISOString().slice(0, 10), opponentKo: opp?.nameKo ?? "", opponentLogo: opp?.logo ?? null,
      homeAway: (home ? "H" : "A") as "H" | "A", gf, ga, result: (gf > ga ? "W" : gf === ga ? "D" : "L") as "W" | "D" | "L",
    };
  });
  const w = form.filter((f) => f.result === "W").length;
  const dr = form.filter((f) => f.result === "D").length;

  return {
    leagueMonth, percentiles, bump, winStreak,
    tag: b.tag,
    league,
    month,
    monthLabel: `${y}년 ${m}월`,
    team: { nameKo: teamInfo.get(b.teamId)?.nameKo ?? "", logo: teamInfo.get(b.teamId)?.logo ?? null },
    coach: b.coach,
    monthRecord: {
      played: form.length, w, d: dr, l: form.length - w - dr, gf: myM.gf, ga: myM.ga, points: w * 3 + dr,
      rank: monthSorted.findIndex((x) => x.id === b.teamId) + 1,
    },
    season: { ...seasonRec, rank: sorted.findIndex(([id]) => id === b.teamId) + 1, teams: sorted.length },
    form,
    rivals,
  };
}

/** 경기 글 카드 삽입용 이름 — 양 팀 모두 감독·기록이 잡힐 때만 돌려준다(한쪽이라도 없으면 카드가 폴백 그림이 된다). */
export async function matchCardWho(matchId: number): Promise<{ homeKo: string; awayKo: string; homeCoachKo: string; awayCoachKo: string } | null> {
  const [h, a] = await Promise.all([loadMatchManagerCard(matchId, "home"), loadMatchManagerCard(matchId, "away")]);
  if (!h || !a) return null;
  return { homeKo: h.team.nameKo, awayKo: a.team.nameKo, homeCoachKo: h.coach.nameKo, awayCoachKo: a.coach.nameKo };
}
