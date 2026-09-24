// 박스스코어 선수(ts id) → 공식 선수 페이지 링크의 두 번째 경로 — 이름으로 못 이은 선수를 그 경기 공식 기록 줄로 잇는다.
// 공식 기록은 KboPlayerGameLog(05:30 KST 전날분 수집)·NpbPlayerGameLog(05:40 KST) — 라이브·당일 경기는 아직 없어 이름 경로만 쓴다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { PlayerStatRow } from "@/lib/sports/thesports/baseball-stats";
import { isDistinctiveExact, matchByStatLine, nameSimilarity, type OfficialLine } from "./baseball-statline-match";
import { npbPlayerKo } from "./npb-player-ko";

type League = "KBO" | "NPB";
export type OfficialLineNamed = OfficialLine & { name: string | null };

/** 그 날짜(현지 YYYY-MM-DD) 공식 경기 기록 전체. 날짜 인덱스가 없어 페이지에선 캐시 버전을 쓴다. */
export async function loadOfficialLines(league: League, date: string): Promise<OfficialLineNamed[]> {
  const d = new Date(`${date}T00:00:00Z`);
  const sel = { role: true, team: true, opponent: true, name: true, ab: true, h: true, rbi: true, r: true, hr: true, bb: true, so: true, ip: true, er: true } as const;
  const rows =
    league === "KBO"
      ? (await prisma.kboPlayerGameLog.findMany({ where: { date: d }, select: { ...sel, kboId: true } })).map(({ kboId, ...r }) => ({ ...r, pid: kboId }))
      : (await prisma.npbPlayerGameLog.findMany({ where: { date: d }, select: { ...sel, npbId: true } })).map(({ npbId, ...r }) => ({ ...r, pid: npbId }));
  return rows.map((r) => ({ ...r, role: r.role === "P" ? "P" : "B" }));
}

const loadOfficialLinesCached = unstable_cache(loadOfficialLines, ["baseball-official-lines"], { revalidate: 3600 });

/**
 * 이름 경로(rosterHrefs)가 못 이은 선수에 대해 기록 줄 매칭 결과를 돌려준다.
 * names 는 KBO 만 — 공식 등록명으로 표시를 바로잡는다(ts 한글 사전의 오기·"미확인 선수"). NPB 공식명은 일본어라 쓰지 않는다.
 */
export async function statLinePlayerLinks(opts: {
  league: League;
  date: string;
  sides: { home: PlayerStatRow[]; away: PlayerStatRow[] };
  rosterHrefs: Record<string, string>;
  /** ts id → 박스스코어 표시명 — 이름 관문용. 이름이 없는 선수는 잇지 않는다. */
  tsNames: Record<string, string>;
  load?: (league: League, date: string) => Promise<OfficialLineNamed[]>;
}): Promise<{ hrefs: Record<string, string>; names: Record<string, string> }> {
  const empty = { hrefs: {}, names: {} };
  if (opts.sides.home.length + opts.sides.away.length === 0) return empty;
  let official: OfficialLineNamed[];
  try {
    official = await (opts.load ?? loadOfficialLinesCached)(opts.league, opts.date);
  } catch {
    return empty;
  }
  if (official.length === 0) return empty;
  const taken = new Set(Object.values(opts.rosterHrefs).map((h) => h.match(/\/players\/([^?]+)/)?.[1]).filter((x): x is string => !!x));
  const nameByPid = new Map(official.map((o) => [o.pid, o.name]));
  // 공식 한글명 — KBO 는 로그의 등록명, NPB 는 번호→카나 음역(1군 로스터 밖이면 일본어가 남아 관문에서 탈락).
  const officialKoOf = (pid: string) => (opts.league === "KBO" ? nameByPid.get(pid) ?? null : npbPlayerKo(pid, ""));
  const nameScore = (tsId: string, pid: string) => nameSimilarity(opts.tsNames[tsId], officialKoOf(pid));
  const matched = matchByStatLine(opts.sides, official, new Set(Object.keys(opts.rosterHrefs)), taken, nameScore);
  const tsById = new Map([...opts.sides.home, ...opts.sides.away].map((r) => [r.playerId, r]));
  const hrefs: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const [tsId, pid] of Object.entries(matched)) {
    const officialKo = officialKoOf(pid);
    const ts = tsById.get(tsId);
    const distinctive = !!ts && official.some((o) => o.pid === pid && isDistinctiveExact(ts, o));
    if (nameScore(tsId, pid) < 0.5 && !distinctive) continue;
    hrefs[tsId] = `/players/${pid}?league=${opts.league}`;
    if (opts.league === "KBO" && officialKo) names[tsId] = officialKo;
  }
  return { hrefs, names };
}
