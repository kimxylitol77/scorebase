// WKBL 공식 사이트(wkbl.or.kr) 경기 단위 데이터 — 일정 목록 파서·선수 박스스코어·문자중계. 경기 상세가 KBL 과 같은 모양으로 쓴다.
// UA 에 "bot" 이 들어가면 403. 일정 목록 = /game/sch/inc_list_1_new.asp, 선수 기록 = /game/ajax/ajax_game_result_2.asp(POST),
// 문자중계 = /live11/path_live_sms.asp(XML, "쿼터|팀(1 홈·2 원정)|문구|홈점수|원정점수|남은시간"). 2026-10-03 실측.
import type { BasketballPlayerBox, MatchTeamStat } from "@/lib/sports/live-scores";
import type { KblPlay, KblPlayKind } from "@/lib/sports/kbl-game";

const BASE = "https://www.wkbl.or.kr";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";

/** WKBL 구단 코드 → 우리 Team.id */
export const WKBL_TEAM_ID: Record<string, number> = {
  "01": 607790, // KB스타즈
  "03": 607789, // 삼성생명
  "05": 607788, // 우리은행
  "07": 607786, // 신한은행
  "09": 607787, // 하나은행
  "11": 607785, // BNK 썸
};
export const WKBL_TEAM_CODE: Record<number, string> = Object.fromEntries(Object.entries(WKBL_TEAM_ID).map(([c, id]) => [id, c]));

export interface WkblListRow {
  externalId: string;
  seasonGu: string;
  date: string; // YYYYMMDD
  startTime: Date;
  homeCode: string;
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  venue: string;
  gameType: string | null;
  gameNo: number | null;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

/** 일정 목록 HTML → 경기 행. 먼저 적힌 팀이 홈. */
export function parseWkblScheduleList(html: string, seasonGu: string): WkblListRow[] {
  const out: WkblListRow[] = [];
  for (const m of html.matchAll(/<tr id="(\d{8})"\s*>([\s\S]*?)<\/tr>/g)) {
    const [, date, body] = m;
    const codes = [...body.matchAll(/teamlogo_(\d+)\.png/g)].map((x) => x[1]);
    if (codes.length < 2) continue;
    const scores = [...body.matchAll(/<em class="txt_score">([^<]*)<\/em>/g)].map((x) => Number(x[1]));
    const tds = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    const time = strip(tds[3] ?? "") || "19:00";
    const [hh, mm] = /^\d{1,2}:\d{2}$/.test(time) ? time.split(":").map(Number) : [19, 0];
    const g = body.match(/goLive\('(\d+)',\s*(\d+)\)/) ?? body.match(/game_type=(\d+)&game_no=(\d+)/);
    const finished = scores.length >= 2 && Number.isFinite(scores[0]) && Number.isFinite(scores[1]) && scores[0] + scores[1] > 0;
    out.push({
      externalId: `wkbl-${seasonGu}-${date}-${codes[0]}-${codes[1]}`,
      seasonGu,
      date,
      startTime: new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), hh - 9, mm)),
      homeCode: codes[0],
      awayCode: codes[1],
      homeScore: finished ? scores[0] : null,
      awayScore: finished ? scores[1] : null,
      finished,
      venue: strip(tds[2] ?? ""),
      gameType: g?.[1] ?? null,
      gameNo: g ? Number(g[2]) : null,
    });
  }
  return out;
}

async function wkblText(path: string, init: RequestInit & { revalidate: number }): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "User-Agent": UA, Referer: `${BASE}/game/result.asp`, ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      next: { revalidate: init.revalidate },
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** 경기 날짜 + 두 팀 → (시즌 코드, 경기 종류, 번호). 경기 번호는 일정이 확정되면 목록에 붙는다. */
export async function findWkblGame(startTime: Date, homeTeamId: number, awayTeamId: number): Promise<{ seasonGu: string; gameType: string; gameNo: number } | null> {
  const h = WKBL_TEAM_CODE[homeTeamId], a = WKBL_TEAM_CODE[awayTeamId];
  if (!h || !a) return null;
  const k = new Date(startTime.getTime() + 9 * 3600_000);
  const y = k.getUTCFullYear(), mo = k.getUTCMonth() + 1;
  const seasonGu = String((mo >= 8 ? y : y - 1) - 1979).padStart(3, "0");
  const ym = `${y}${String(mo).padStart(2, "0")}`;
  const html = await wkblText(`/game/sch/inc_list_1_new.asp?season_gu=${seasonGu}&ym=${ym}&viewType=1&gun=1`, { revalidate: 600 });
  const day = `${y}${String(mo).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
  const row = html ? parseWkblScheduleList(html, seasonGu).find((r) => r.date === day && ((r.homeCode === h && r.awayCode === a) || (r.homeCode === a && r.awayCode === h))) : null;
  return row?.gameType && row.gameNo ? { seasonGu, gameType: row.gameType, gameNo: row.gameNo } : null;
}

/* ── 선수 박스스코어 (/game/ajax/ajax_game_result_2.asp) ───────────────────────────────
 * 팀마다 <h4 class="tit_area" data-kr="구단명"> 다음 표 하나. 열 = 선수·POS·MIN·2PM-A·3PM-A·FTM-A·공리·수리·리바·AST·PF·ST·TO·BS·PTS,
 * tfoot 첫 줄이 팀 합계. 2점과 3점이 나뉘어 있어 야투 = 2점 + 3점(2025-12-01 하나은행-BNK 이이지마 14점 검산).
 */
const WKBL_NAME_CODE: Record<string, string> = { KB스타즈: "01", 삼성생명: "03", 우리은행: "05", 신한은행: "07", 하나은행: "09", "BNK 썸": "11" };
const pair = (s: string) => { const [m, a] = s.split("-").map(Number); return [m || 0, a || 0] as const; };

export interface WkblTeamBox { code: string; players: Array<BasketballPlayerBox & { pno: string | null }>; totals: string[] | null }

export function parseWkblBox(html: string): WkblTeamBox[] {
  const out: WkblTeamBox[] = [];
  const blocks = html.split(/<h4 class="tit_area[^"]*"[^>]*data-kr="/).slice(1);
  for (const b of blocks) {
    const name = b.slice(0, b.indexOf('"'));
    const code = WKBL_NAME_CODE[name];
    if (!code || !b.includes("2PM-A") && !b.includes("<tbody")) continue;
    const table = b.slice(0, b.indexOf("</table>"));
    const body = table.slice(table.indexOf("<tbody"), table.indexOf("</tbody>"));
    const cells = (row: string) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    const players = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((r) => {
      const c = cells(r[1]);
      if (c.length < 15) return [];
      const pno = c[0].match(/pno=(\d+)/)?.[1] ?? null;
      const [p2, a2] = pair(strip(c[3])), [p3, a3] = pair(strip(c[4])), [ft, fta] = pair(strip(c[5]));
      const n = (i: number) => Number(strip(c[i])) || 0;
      return [{
        pno, pid: pno, name: strip(c[0]), pos: strip(c[1]) || null, min: strip(c[2]),
        points: n(14), reb: n(8), oreb: n(6), assists: n(9), steals: n(11), blocks: n(13), to: n(12), pf: n(10),
        fgm: p2 + p3, fga: a2 + a3, tpm: p3, tpa: a3, ftm: ft, fta,
      }];
    });
    const foot = table.slice(table.indexOf("<tfoot"));
    const t = cells(foot.match(/<tr>([\s\S]*?)<\/tr>/)?.[1] ?? "").map(strip);
    out.push({ code, players, totals: t.length >= 14 ? t : null });
  }
  return out;
}

export async function fetchWkblBox(g: { seasonGu: string; gameType: string; gameNo: number }, homeCode: string, live: boolean): Promise<{
  homePlayers: BasketballPlayerBox[]; awayPlayers: BasketballPlayerBox[]; homeStats: MatchTeamStat[]; awayStats: MatchTeamStat[];
} | null> {
  const html = await wkblText("/game/ajax/ajax_game_result_2.asp", {
    method: "POST",
    body: `season_gu=${g.seasonGu}&game_type=${g.gameType}&game_no=${g.gameNo}&ym=&h_player=&a_player=`,
    revalidate: live ? 15 : 3600,
  });
  if (!html) return null;
  const teams = parseWkblBox(html);
  const home = teams.find((t) => t.code === homeCode), away = teams.find((t) => t.code !== homeCode);
  if (!home?.players.length && !away?.players.length) return null;
  // 팀 합계 줄: [팀합계, MIN, 2PM-A, 3PM-A, FTM-A, 공리, 수리, 리바, AST, PF, ST, TO, BS, PTS]
  const stats = (t: string[] | null): MatchTeamStat[] => {
    if (!t) return [];
    const [p2, a2] = pair(t[2]), [p3, a3] = pair(t[3]), [ft, fta] = pair(t[4]);
    const pct = (m: number, a: number) => (a > 0 ? `${m}-${a} (${Math.round((m / a) * 100)}%)` : `${m}-${a}`);
    const num = (i: number, label: string) => ({ label, value: t[i], raw: Number(t[i]) || 0 });
    return [
      { label: "야투", value: pct(p2 + p3, a2 + a3), raw: a2 + a3 ? (p2 + p3) / (a2 + a3) : -Infinity },
      { label: "3점슛", value: pct(p3, a3), raw: a3 ? p3 / a3 : -Infinity },
      { label: "자유투", value: pct(ft, fta), raw: fta ? ft / fta : -Infinity },
      num(7, "리바운드"), num(5, "공격 리바운드"), num(8, "어시스트"), num(10, "스틸"), num(12, "블록"), num(11, "턴오버"), num(9, "파울"),
    ];
  };
  const byPts = (ps: BasketballPlayerBox[]) => [...ps].filter((p) => p.min && p.min !== "00:00").sort((x, y) => y.points - x.points);
  return { homePlayers: byPts(home?.players ?? []), awayPlayers: byPts(away?.players ?? []), homeStats: stats(home?.totals ?? null), awayStats: stats(away?.totals ?? null) };
}

/* ── 문자중계 (/live11/path_live_sms.asp, 쿼터별 XML) ─────────────────────────────── */

const wkblKind = (text: string): KblPlayKind =>
  /성공/.test(text) && /(슛|자유투|덩크|레이업)/.test(text) ? "score"
  : /시도|실패/.test(text) ? "miss"
  : /리바운드/.test(text) ? "rebound"
  : /파울/.test(text) ? "foul"
  : /교체/.test(text) ? "sub"
  : /(시작|종료|작전타임|타임아웃|비디오)/.test(text) ? "stoppage"
  : /(어시스트|스틸|블록|굿디펜스)/.test(text) ? "defense"
  : "other";

/** 쿼터 XML 여러 개 → 시간순 장면. 점수는 득점 장면에만 오니 앞 값을 이어 쓴다. side 1 = 홈(먼저 적힌 팀). */
export function parseWkblPlays(xmls: string[]): KblPlay[] {
  const plays: KblPlay[] = [];
  let h = 0, a = 0, n = 0;
  for (const xml of xmls) {
    for (const m of xml.matchAll(/<playhistory>([\s\S]*?)<\/playhistory>/g)) {
      const f = m[1].split("|");
      if (f.length !== 6) continue;
      const [q, side, text, hs, as, clock] = f;
      const nh = hs !== "" ? Number(hs) : h, na = as !== "" ? Number(as) : a;
      const points = Math.max(0, nh - h) + Math.max(0, na - a);
      h = nh; a = na;
      plays.push({
        n: ++n,
        period: q.startsWith("X") ? `OT${q.slice(1)}` : `${q.slice(1)}Q`,
        clock: clock.replace(/^0(\d:)/, "$1"),
        side: side === "1" ? "home" : side === "2" ? "away" : null,
        player: null,
        text: text.trim(),
        kind: points > 0 ? "score" : wkblKind(text),
        points,
        homeScore: h,
        awayScore: a,
      });
    }
  }
  return plays;
}

export async function fetchWkblPlays(g: { seasonGu: string; gameType: string; gameNo: number }, live: boolean): Promise<KblPlay[]> {
  const quarters = ["Q1", "Q2", "Q3", "Q4", "X1", "X2", "X3", "X4"];
  const xmls: string[] = [];
  for (const q of quarters) {
    const x = await wkblText(`/live11/path_live_sms.asp?season_gu0=${g.seasonGu}&game_type0=${g.gameType}&game_no0=${g.gameNo}&quarter_gu0=${q}&seq0=0`, { revalidate: live ? 10 : 3600 });
    if (!x || !x.includes("<playhistory>")) { if (q.startsWith("X")) break; continue; }
    xmls.push(x);
  }
  return parseWkblPlays(xmls);
}
