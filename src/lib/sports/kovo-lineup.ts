// V-리그 경기의 양 팀 선발 6인 + 리베로 — 종료 경기는 KOVO 기록지의 실제 선발, 예정 경기는 직전 경기 선발 또는 로스터 기반 예상.
// 근거·실측은 reports/plans/volleyball-lineup/context-notes.md.
import { KOVO_TEAMS, kovoGet, fetchKovoTeamPlayers, fetchKovoPlayerSeasonRecords } from "@/lib/sports/kovo-api";

export type LineupSlot = "OP" | "MB1" | "OH1" | "OH2" | "MB2" | "S" | "L";
export interface LineupPlayer { name: string; position: string; backNumber: number | null; image: string | null; captain: boolean }
export interface TeamLineup {
  kind: "confirmed" | "lastGame" | "predicted";
  /** lastGame 일 때 기준 경기 (KST 날짜·상대 팀 약칭) */
  basis?: { date: string; opponent: string };
  /** 빈 자리(개막 전 외국인 미등록 등)는 null */
  slots: Record<LineupSlot, LineupPlayer | null>;
}

interface KovoGame {
  gnum: number; round: number; gdate: string; hcode: string; acode: string;
  hsname: string; asname: string; result: string;
}
interface KovoGamePlayer {
  tcode: string; pcode: string; pname: string; position: string; bnum: number;
  ynCaptain: string; ynS1: string; point: number;
}

const LEAGUE_REGULAR = "201";
const tcodeByTeamId = new Map(Object.entries(KOVO_TEAMS).map(([code, t]) => [t.teamId, code]));

/** 시즌 코드 — 8월 이후 경기는 그해 시작 시즌. 2025-26 = "022". */
function seasonCodeOf(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const startYear = kst.getUTCMonth() >= 7 ? kst.getUTCFullYear() : kst.getUTCFullYear() - 1;
  return String(startYear - 2003).padStart(3, "0");
}
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

async function fetchSeasonGames(seasonCode: string, gender: string): Promise<KovoGame[]> {
  const p = await kovoGet<{ content?: KovoGame[] }>(
    `/stat/game-schedule?seasonCode=${seasonCode}&gender=${gender}&leagueCode=${LEAGUE_REGULAR}&page=0&size=500`,
    1800,
  );
  return p?.content ?? [];
}

/** 경기 기록지의 세트1 선발(ynS1 "-1") — 팀코드별. ynS 코드: -1 선발 · -2 결장 · 숫자 = 그 등번호와 교체. */
async function fetchGameStarters(seasonCode: string, g: KovoGame): Promise<Map<string, KovoGamePlayer[]>> {
  const p = await kovoGet<{ player?: KovoGamePlayer[] }>(
    `/stat/game-schedule/${g.gnum}?gcode=001&seasonCode=${seasonCode}&leagueCode=${LEAGUE_REGULAR}&round=${g.round}`,
    24 * 3600,
  );
  const out = new Map<string, KovoGamePlayer[]>();
  for (const pl of p?.player ?? []) {
    if (pl.ynS1 !== "-1") continue;
    out.set(pl.tcode, [...(out.get(pl.tcode) ?? []), pl]);
  }
  return out;
}

const isLibero = (pos: string) => pos === "L" || pos === "Li";

/** 포지션별 후보(우선순위 순)를 코트 자리에 채운다. OH·MB 는 2자리. */
function toSlots(ordered: LineupPlayer[]): Record<LineupSlot, LineupPlayer | null> {
  const by = (pos: string) => ordered.filter((p) => (pos === "L" ? isLibero(p.position) : p.position === pos));
  const oh = by("OH");
  const mb = by("MB");
  return {
    OP: by("OP")[0] ?? null, MB1: mb[0] ?? null, OH1: oh[0] ?? null,
    OH2: oh[1] ?? null, MB2: mb[1] ?? null, S: by("S")[0] ?? null, L: by("L")[0] ?? null,
  };
}

function fromGame(players: KovoGamePlayer[], images: Map<string, string | null>): Record<LineupSlot, LineupPlayer | null> {
  // 같은 포지션 2명(OH·MB)은 득점 순으로 앞자리
  const ordered = [...players].sort((a, b) => b.point - a.point).map((p) => ({
    name: p.pname, position: p.position, backNumber: p.bnum, image: images.get(p.pcode) ?? null, captain: p.ynCaptain === "1",
  }));
  return toSlots(ordered);
}

/** 개막 전 — 현 로스터를 직전 정규시즌 출전 세트 수(동점이면 그 이전 최신 정규시즌)로 포지션별 정렬. */
async function predictFromRoster(tcode: string, seasonCode: string): Promise<Record<LineupSlot, LineupPlayer | null>> {
  const roster = await fetchKovoTeamPlayers(tcode);
  const startYear = Number(seasonCode) + 2003;
  const prevSeason = `${startYear - 1}-${startYear} [정]`;
  const scored = await Promise.all(
    roster.map(async (p) => {
      const recs = (await fetchKovoPlayerSeasonRecords(p.playerCode)).filter(
        (r) => r.leagueDivision === "V리그" && r.seasonDivision.endsWith("[정]"),
      );
      const prev = recs.filter((r) => r.seasonDivision === prevSeason).reduce((s, r) => s + r.setCount, 0);
      const older = recs.find((r) => r.seasonDivision !== prevSeason)?.setCount ?? 0;
      return { p, prev, older };
    }),
  );
  scored.sort((a, b) => b.prev - a.prev || b.older - a.older || (a.p.backNumber ?? 99) - (b.p.backNumber ?? 99));
  return toSlots(scored.map(({ p }) => ({ name: p.name, position: p.position, backNumber: p.backNumber, image: p.image, captain: false })));
}

/** 우리 Match 의 양 팀 라인업. KOVO 팀이 아니면 null. */
export async function getKovoMatchLineup(match: {
  homeTeamId: number; awayTeamId: number; startTime: Date;
}): Promise<{ home: TeamLineup; away: TeamLineup } | null> {
  const hcode = tcodeByTeamId.get(match.homeTeamId);
  const acode = tcodeByTeamId.get(match.awayTeamId);
  if (!hcode || !acode) return null;
  const seasonCode = seasonCodeOf(match.startTime);
  const date = kstDate(match.startTime);
  const [games, hRoster, aRoster] = await Promise.all([
    fetchSeasonGames(seasonCode, hcode[0] === "1" ? "1" : "2"),
    fetchKovoTeamPlayers(hcode),
    fetchKovoTeamPlayers(acode),
  ]);
  // 사진은 그 팀 현재 로스터에 있을 때만 — 이적 선수에게 새 팀 유니폼 사진이 붙는 것을 막는다
  const imagesOf = (roster: typeof hRoster) => new Map(roster.map((p) => [p.playerCode, p.image]));
  const images = new Map([[hcode, imagesOf(hRoster)], [acode, imagesOf(aRoster)]]);

  // 1) 이 경기가 끝났으면 기록지의 실제 선발
  const self = games.find((g) => g.gdate === date && g.hcode === hcode && g.acode === acode);
  if (self?.result) {
    const starters = await fetchGameStarters(seasonCode, self);
    const h = starters.get(hcode);
    const a = starters.get(acode);
    if (h?.length && a?.length) {
      return {
        home: { kind: "confirmed", slots: fromGame(h, images.get(hcode)!) },
        away: { kind: "confirmed", slots: fromGame(a, images.get(acode)!) },
      };
    }
  }

  // 2) 팀별 이번 시즌 직전 종료 경기 선발 → 3) 없으면 로스터 기반 예상
  const forTeam = async (tcode: string): Promise<TeamLineup> => {
    const last = games
      .filter((g) => g.result && g.gdate < date && (g.hcode === tcode || g.acode === tcode))
      .sort((x, y) => y.gdate.localeCompare(x.gdate))[0];
    if (last) {
      const players = (await fetchGameStarters(seasonCode, last)).get(tcode);
      if (players?.length) {
        return {
          kind: "lastGame",
          basis: { date: last.gdate, opponent: last.hcode === tcode ? last.asname : last.hsname },
          slots: fromGame(players, images.get(tcode)!),
        };
      }
    }
    return { kind: "predicted", slots: await predictFromRoster(tcode, seasonCode) };
  };
  const [home, away] = await Promise.all([forTeam(hcode), forTeam(acode)]);
  return { home, away };
}
