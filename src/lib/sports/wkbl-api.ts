// WKBL 공식 사이트(wkbl.or.kr, 서버 렌더 ASP) 파서 — 등록 선수 목록·선수 상세(프로필·최근 시즌·시즌 랭킹)·통산 시즌별·개인 최고·부문별 순위.
// 인증·IP 제한 없음(2026-09-18 실측). 탭 데이터는 /player/ajax/ajax_detail_{sumUp|personal}.asp POST (season_gu·player_no·active_yn).
// 시즌 코드 season_gu 는 3자리("046" = 2025-26, 1979 + code = 시작 연도). 경기별 기록 endpoint 는 없다(사이트 미제공).
// ⚠️ no-store 금지 — ISR 페이지에서 불리면 500. next.revalidate 로 캐시(1h).
import { load } from "cheerio";

const BASE = "https://www.wkbl.or.kr";
// ⚠️ "bot" 이 들어간 UA 는 403 (2026-09-18 실측) — 일반 브라우저 UA 로. 순위표(basketball-standings)도 같은 사이트를 UA 없이 읽는다.
const UA = "Mozilla/5.0";

async function getHtml(path: string, revalidate = 3600): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA }, next: { revalidate }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}
async function postHtml(path: string, body: Record<string, string>, revalidate = 3600): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "User-Agent": UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body: new URLSearchParams(body),
      next: { revalidate },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const num = (s: string) => { const n = Number(clean(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };

export function wkblPhotoUrl(pno: string): string {
  return `${BASE}/static/images/player/pimg/np_${pno}.png`;
}
/** "046" → "2025-26" (1979 + code = 시작 연도) */
export function wkblSeasonLabel(seasonGu: string): string {
  const y = 1979 + Number(seasonGu);
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
export const WKBL_POS_KO: Record<string, string> = { G: "가드", F: "포워드", C: "센터" };

export interface WkblRegisteredPlayer { pno: string; name: string; ename: string; team: string }

/** 등록 선수 전체 (player_group=12, 2026-27 기준 86명) */
export async function fetchWkblRegisteredPlayers(): Promise<WkblRegisteredPlayer[]> {
  const html = await getHtml("/player/player_list.asp?player_group=12", 6 * 3600);
  if (!html) return [];
  const $ = load(html);
  const out: WkblRegisteredPlayer[] = [];
  $("a.link_detail").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const pno = /pno=(\d+)/.exec(href)?.[1];
    if (!pno) return;
    const spans = $(a).find("span");
    const nameEl = $(a).find("span.txt_name");
    out.push({
      pno,
      name: clean(nameEl.attr("data-kr") ?? nameEl.text()),
      ename: clean(nameEl.attr("data-en") ?? ""),
      team: clean(spans.last().attr("data-kr") ?? spans.last().text()),
    });
  });
  return out;
}

export interface WkblSeasonRow {
  label: string; // 팀명 또는 "PlayOff" (시즌 탭) / 시즌 라벨 (통산 탭)
  team?: string;
  g: number | null; mpg: string;
  fg2: string; fg2Pct: number | null; fg3: string; fg3Pct: number | null; ft: string; ftPct: number | null;
  off: number | null; def: number | null; reb: number | null;
  apg: number | null; spg: number | null; bpg: number | null; to: number | null; pf: number | null; ppg: number | null;
}
export interface WkblRank { label: string; value: number | null; rank: number | null }
export interface WkblPlayerDetail {
  pno: string;
  name: string; ename: string;
  no: number | null;
  teamFull: string; // "우리은행 우리WON"
  pos: string | null; height: number | null; birth: string | null; school: string | null; draft: string | null;
  seasonGu: string | null; // 상세 페이지가 보여주는 시즌
  season: WkblSeasonRow[]; // 정규 + PlayOff 행
  ranks: WkblRank[];
}

/** 선수 상세 — 프로필 + 최근 시즌 평균 + 시즌 랭킹(부문별 값·순위) */
export async function fetchWkblPlayerDetail(pno: string): Promise<WkblPlayerDetail | null> {
  const html = await getHtml(`/player/detail.asp?player_group=12&tcode=&pno=${pno}`);
  if (!html) return null;
  const $ = load(html);
  const nameEl = $("h3.tit_name span.language").first();
  const name = clean(nameEl.attr("data-kr") ?? nameEl.text());
  if (!name) return null;
  const no = num(/No\.\s*(\d+)/.exec(clean($("h3.tit_name").text()))?.[1] ?? "");
  const teamFull = clean(($("h3.tit_name span.txt_team").attr("data-kr") ?? $("h3.tit_name span.txt_team").text()).replace(/[\[\]]/g, ""));
  const prof: Record<string, string> = {};
  $("ul.list_text li").each((_, li) => {
    const key = clean($(li).find("span.language").first().attr("data-kr") ?? "");
    const val = clean($(li).text()).replace(new RegExp(`^${key}\\s*-?\\s*`), "");
    if (key) prof[key] = val;
  });
  const birthRaw = prof["생년월일"] ?? "";
  const birth = /(\d{4})\.(\d{2})\.(\d{2})/.exec(birthRaw) ? birthRaw.replace(/(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3").slice(0, 10) : null;
  const seasonGu = /var season_gu = "(\d{3})"/.exec(html)?.[1] ?? null;

  const season: WkblSeasonRow[] = [];
  $("table").first().find("tr").each((_, tr) => {
    const c = $(tr).find("td").map((__, td) => clean($(td).text())).get();
    if (c.length < 18) return;
    season.push(rowFrom(c[0], c.slice(1), false));
  });
  const ranks: WkblRank[] = [];
  $(".ratio_area").each((_, d) => {
    const a = $(d).find("a").first();
    ranks.push({ label: clean(a.attr("data-kr") ?? a.text()), value: num($(d).find(".data").text()), rank: num($(d).find("em").text()) });
  });
  return {
    pno, name, ename: clean(nameEl.attr("data-en") ?? ""), no, teamFull,
    pos: prof["포지션"] ? clean(prof["포지션"]).charAt(0).toUpperCase() : null,
    height: num(prof["신장"] ?? ""),
    birth, school: prof["출신학교"] || null, draft: prof["드래프트"] || null,
    seasonGu, season, ranks,
  };
}

/* 표 행 → WkblSeasonRow. 시즌 탭(팀명 G MPG 2PM-A 2P% 3PM-A 3P% FTM-A FT% OFF DEF TOT APG SPG BPG TO PF PPG)
 * 통산 탭(시즌 팀명 G MPG 2P% 3P% FT% OFF DEF TOT APG SPG BPG TO PF PPG) — 성공-시도 열이 없다. */
function rowFrom(label: string, c: string[], career: boolean, team?: string): WkblSeasonRow {
  if (career) {
    const [g, mpg, p2, p3, pft, off, def, reb, apg, spg, bpg, to, pf, ppg] = c;
    return { label, team, g: num(g), mpg, fg2: "", fg2Pct: num(p2), fg3: "", fg3Pct: num(p3), ft: "", ftPct: num(pft),
      off: num(off), def: num(def), reb: num(reb), apg: num(apg), spg: num(spg), bpg: num(bpg), to: num(to), pf: num(pf), ppg: num(ppg) };
  }
  const [g, mpg, fg2, p2, fg3, p3, ft, pft, off, def, reb, apg, spg, bpg, to, pf, ppg] = c;
  return { label, team, g: num(g), mpg, fg2, fg2Pct: num(p2), fg3, fg3Pct: num(p3), ft, ftPct: num(pft),
    off: num(off), def: num(def), reb: num(reb), apg: num(apg), spg: num(spg), bpg: num(bpg), to: num(to), pf: num(pf), ppg: num(ppg) };
}

/** 통산 시즌별 평균 (최신 시즌 먼저). 사이트 "통산기록" 탭 첫 표. */
export async function fetchWkblCareer(pno: string, seasonGu: string): Promise<WkblSeasonRow[]> {
  const html = await postHtml("/player/ajax/ajax_detail_sumUp.asp", { season_gu: seasonGu, player_no: pno, active_yn: "0" });
  if (!html) return [];
  const $ = load(html);
  const out: WkblSeasonRow[] = [];
  $("table").first().find("tr").each((_, tr) => {
    const c = $(tr).find("td").map((__, td) => clean($(td).text())).get();
    if (c.length < 16) return;
    out.push(rowFrom(c[0].replace(/^(\d{4})-(\d{2})(\d{2})$/, "$1-$3"), c.slice(2), true, c[1]));
  });
  return out;
}

export interface WkblCareerHigh { label: string; season: string; career: string }
/** 개인 최고 기록 (시즌 최고 · 통산 최고) */
export async function fetchWkblCareerHighs(pno: string, seasonGu: string): Promise<WkblCareerHigh[]> {
  const html = await postHtml("/player/ajax/ajax_detail_personal.asp", { season_gu: seasonGu, player_no: pno, active_yn: "0" });
  if (!html) return [];
  const $ = load(html);
  const out: WkblCareerHigh[] = [];
  $("tr").each((_, tr) => {
    const th = clean($(tr).find("th").first().text());
    const c = $(tr).find("td").map((__, td) => clean($(td).text())).get();
    if (!th || c.length < 1) return;
    out.push({ label: th, season: c[0] ?? "", career: c[1] ?? "" });
  });
  return out;
}

export interface WkblPartRow { rank: number; playerName: string; teamName: string; games: number | null; value: number }
/** 부문별 선수 순위 (point·rebound·assist·steal·block). 표 마지막 셀 = 평균값, 4번째 = 경기수 */
export async function fetchWkblPartRank(seasonGu: string, part: string): Promise<WkblPartRow[]> {
  const html = await postHtml("/game/ajax/ajax_player_record.asp", { season_gu: seasonGu, game_type: "01", part }, 3600);
  if (!html) return [];
  const $ = load(html);
  const out: WkblPartRow[] = [];
  $("tr").each((_, tr) => {
    const c = $(tr).find("td").map((__, td) => clean($(td).text())).get();
    if (c.length < 6) return;
    const rank = Number(c[0]); const value = Number(c[c.length - 1]);
    if (!Number.isFinite(rank) || !Number.isFinite(value)) return;
    out.push({ rank, playerName: c[1], teamName: c[2], games: num(c[3]), value });
  });
  return out;
}

/** 현재 시즌 코드 — 메인 nav 의 scheduleb1.asp?season_gu=NNN 중 최댓값 (개막 전에도 새 시즌 코드가 잡힌다) */
export async function fetchWkblCurrentSeasonGu(): Promise<string | null> {
  const html = await getHtml("/main/", 6 * 3600);
  if (!html) return null;
  const codes = [...html.matchAll(/season_gu=(\d{3})/g)].map((m) => m[1]);
  return codes.length ? codes.sort().at(-1)! : null;
}
