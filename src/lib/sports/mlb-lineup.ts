// MLB 경기 라인업 — MLB Stats API 박스스코어(타순·포지션·벤치·불펜)와 선수 투타로 네이버형 2열 라인업 데이터를 만든다.
// 발표 전에는 팀별 직전 종료 경기의 선발 타순을 예상 라인업으로 쓴다.
import { unstable_cache } from "next/cache";
import { findMlbGamePk, mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import { toKoreanPlayerName } from "@/lib/player-names";
import { shortDate, type GameLineup, type LineupPlayer, type TeamLineup } from "@/lib/sports/baseball-lineup";

const API = "https://statsapi.mlb.com/api/v1";

interface BoxTeam {
  team: { id: number };
  battingOrder?: number[];
  bench?: number[];
  bullpen?: number[];
  pitchers?: number[];
  players: Record<string, { person: { id: number; fullName: string }; position?: { abbreviation?: string } }>;
}
type Box = { home: BoxTeam; away: BoxTeam };
interface SchedGame {
  gamePk: number; officialDate: string; status: { abstractGameState: string; detailedState?: string };
  teams: Record<"home" | "away", { team: { id: number }; probablePitcher?: { id: number; fullName: string } }>;
}

const POS_KO: Record<string, string> = {
  C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", SS: "유격수",
  LF: "좌익수", CF: "중견수", RF: "우익수", DH: "지명타자", P: "투수",
  IF: "내야수", OF: "외야수", PH: "대타", PR: "대주자", TWP: "투타겸업",
};

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!r.ok) throw new Error(`mlb ${path} http ${r.status}`);
  return (await r.json()) as T;
}
const fetchBox = async (pk: number) => (await getJson<{ teams: Box }>(`/game/${pk}/boxscore`)).teams;

/** 팀의 기준일 이전 종료 경기들, 최근 순 (포스트시즌 포함). 취소·연기도 abstractGameState 가 Final 이라 뺀다(9/27 NYY 실측). */
async function recentFinalGames(teamId: number, beforeYmd: string): Promise<SchedGame[]> {
  const end = new Date(`${beforeYmd}T00:00:00Z`);
  const start = new Date(end.getTime() - 14 * 86400_000).toISOString().slice(0, 10);
  const prev = new Date(end.getTime() - 86400_000).toISOString().slice(0, 10);
  const d = await getJson<{ dates?: { games?: SchedGame[] }[] }>(
    `/schedule?sportId=1&teamId=${teamId}&startDate=${start}&endDate=${prev}`,
  );
  return (d.dates ?? [])
    .flatMap((x) => x.games ?? [])
    .filter((g) => g.status.abstractGameState === "Final" && !/cancel|postpone|suspend/i.test(g.status.detailedState ?? ""))
    .reverse();
}

async function loadMlbGameLineup(homeName: string, awayName: string, startIso: string): Promise<GameLineup | null> {
  const pk = await findMlbGamePk(startIso, homeName, awayName);
  if (!pk) return null;
  const [sched, box] = await Promise.all([
    getJson<{ dates?: { games?: SchedGame[] }[] }>(`/schedule?gamePk=${pk}&hydrate=probablePitcher`),
    fetchBox(pk),
  ]);
  const game = sched.dates?.[0]?.games?.[0];
  if (!game) return null;

  // 타순 — 오늘 박스에 9명이면 확정, 아니면 그 팀 직전 종료 경기 박스의 선발 타순
  const orderFor = async (side: "home" | "away") => {
    const t = box[side];
    if ((t.battingOrder?.length ?? 0) >= 9) return { ids: t.battingOrder!, players: t.players, basis: null as string | null };
    for (const last of (await recentFinalGames(t.team.id, game.officialDate)).slice(0, 3)) {
      const lb = await fetchBox(last.gamePk);
      const lt = lb.home.team.id === t.team.id ? lb.home : lb.away;
      if ((lt.battingOrder?.length ?? 0) >= 9) return { ids: lt.battingOrder!, players: lt.players, basis: last.officialDate as string | null };
    }
    return { ids: [] as number[], players: t.players, basis: null };
  };
  const [ho, ao] = await Promise.all([orderFor("home"), orderFor("away")]);

  const starterOf = (side: "home" | "away") => {
    const started = box[side].pitchers?.[0];
    if (started) return { id: started, name: box[side].players[`ID${started}`]?.person.fullName ?? "" };
    const pp = game.teams[side].probablePitcher;
    return pp ? { id: pp.id, name: pp.fullName } : null;
  };
  const hs = starterOf("home");
  const as = starterOf("away");

  const allIds = new Set<number>([...ho.ids, ...ao.ids]);
  for (const side of ["home", "away"] as const) {
    for (const id of [...(box[side].bench ?? []), ...(box[side].bullpen ?? [])]) allIds.add(id);
  }
  for (const s of [hs, as]) if (s) allIds.add(s.id);
  const people = allIds.size
    ? (await getJson<{ people?: { id: number; batSide?: { code: string }; pitchHand?: { code: string } }[] }>(
        `/people?personIds=${[...allIds].join(",")}&fields=people,id,batSide,pitchHand,code`,
      )).people ?? []
    : [];
  const hand = new Map(people.map((p) => [p.id, p]));
  const bat = (id: number) => ({ L: "좌타", R: "우타", S: "양타" })[hand.get(id)?.batSide?.code ?? ""] ?? null;
  const thr = (id: number) => ({ L: "좌투", R: "우투" })[hand.get(id)?.pitchHand?.code ?? ""] ?? null;

  const mk = (id: number, fullName: string, position: string, h: string | null, order?: number): LineupPlayer => ({
    name: toKoreanPlayerName(fullName) || fullName, position, hand: h, order,
    photo: mlbHeadshotUrl(id), href: `/players/${id}`,
  });
  const posKo = (abbr?: string) => (abbr ? POS_KO[abbr] ?? abbr : "");

  const team = (side: "home" | "away", o: typeof ho, s: typeof hs): TeamLineup => {
    const t = box[side];
    const batters = o.ids.map((id, i) => {
      const p = o.players[`ID${id}`];
      return mk(id, p?.person.fullName ?? "", posKo(p?.position?.abbreviation), bat(id), i + 1);
    });
    const inLineup = new Set(o.ids);
    const bench = (t.bench ?? []).filter((id) => !inLineup.has(id)).map((id) => {
      const p = t.players[`ID${id}`];
      return mk(id, p?.person.fullName ?? "", posKo(p?.position?.abbreviation), bat(id));
    });
    const bullpen = (t.bullpen ?? []).filter((id) => id !== s?.id).map((id) => {
      const th = thr(id);
      return mk(id, t.players[`ID${id}`]?.person.fullName ?? "", th === "좌투" ? "좌완투수" : th === "우투" ? "우완투수" : "투수", null);
    });
    return { starter: s ? mk(s.id, s.name, "선발", thr(s.id)) : null, batters, bench, bullpen };
  };

  const home = team("home", ho, hs);
  const away = team("away", ao, as);
  if (home.batters.length === 0 && away.batters.length === 0) return null;
  const confirmed = ho.basis == null && ao.basis == null;
  // 양 팀 기준 경기일이 같을 때만 날짜를 적는다
  const bases = [...new Set([ho.basis, ao.basis].filter((b): b is string => !!b))];
  const basis = bases.length === 1 ? bases[0] : null;
  return {
    confirmed,
    note: confirmed ? "MLB 공식 · 오늘 라인업" : `발표 전 · 직전 경기${basis ? `(${shortDate(basis)})` : ""} 선발 기준`,
    home, away,
  };
}

/** 우리 MLB Match(영문 팀명·시작 시각) → 네이버형 라인업. 발표 전이면 confirmed=false(직전 경기 기준). 10분 캐시. */
export async function getMlbGameLineup(homeName: string, awayName: string, startTime: Date): Promise<GameLineup | null> {
  return unstable_cache(loadMlbGameLineup, ["mlb-game-lineup-v1"], { revalidate: 600 })(homeName, awayName, startTime.toISOString())
    .catch(() => null);
}
