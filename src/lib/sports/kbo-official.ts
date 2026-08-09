// KBO 공식 사이트 (koreabaseball.com) 선수 데이터 scraping.
//
// 1) 시즌 투수 인덱스: /Record/Player/PitcherBasic/Basic1.aspx
//    → <a href="/Record/Player/PitcherDetail/Basic.aspx?playerId={id}">{한글이름}</a>
//    한 페이지에 시즌 전체 등재 투수 (수십~수백명) 추출 가능.
//
// 2) 개별 투수 상세: /Record/Player/PitcherDetail/Basic.aspx?playerId={id}
//    → table headers: 팀명 | ERA | G | CG | SHO | W | L | SV | HLD | WPCT |
//                     TBF | NP | IP | H | 2B | 3B | HR | SAC | SF | BB | IBB |
//                     HBP | SO | WP | BK | R | ER | BSV | WHIP | AVG | QS

import axios from "axios";
import * as cheerio from "cheerio";
import type {
  PitcherSeasonRow,
  HitterSeasonRow,
  PlayerSplits,
  SplitRow,
} from "./mlb-player-extras";

const BASE = "https://www.koreabaseball.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
} as const;

export interface KboPitcherIndexEntry {
  kboId: string; // KBO 공식 playerId (예: "55633")
  name: string; // 한글 이름 (예: "올러")
  team?: string; // 팀명 (있으면)
}

// KBO 10팀 코드 (PitcherBasic.aspx ddlTeam form value)
export const KBO_TEAM_CODES = [
  "KT", "LG", "SS", "SK", "OB", "HT", "HH", "NC", "LT", "WO",
] as const;
const SEASON_DEFAULT = String(new Date().getFullYear());

/** GET 응답 HTML 에서 ASP.NET hidden state 추출 */
function extractHidden(html: string): {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
} {
  const $ = cheerio.load(html);
  return {
    viewState: $('input[name="__VIEWSTATE"]').attr("value") ?? "",
    viewStateGenerator:
      $('input[name="__VIEWSTATEGENERATOR"]').attr("value") ?? "",
    eventValidation:
      $('input[name="__EVENTVALIDATION"]').attr("value") ?? "",
  };
}

/** 테이블에서 선수 list 파싱 — 헤더 위치 기반 (선수명/팀명 컬럼 안전 추출) */
function parseKboPitcherTable(html: string): KboPitcherIndexEntry[] {
  const $ = cheerio.load(html);
  const result: KboPitcherIndexEntry[] = [];
  const seen = new Set<string>();
  $("table").each((_, t) => {
    const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
    const nameIdx = headers.indexOf("선수명");
    const teamIdx = headers.indexOf("팀명");
    if (nameIdx < 0) return;
    $(t).find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      const a = tds.eq(nameIdx).find("a[href*='playerId=']").first();
      if (!a.length) return;
      const m = (a.attr("href") ?? "").match(/playerId=(\d+)/);
      if (!m) return;
      const kboId = m[1];
      const name = a.text().trim();
      if (!name || seen.has(kboId)) return;
      seen.add(kboId);
      const team =
        teamIdx >= 0 ? tds.eq(teamIdx).text().trim() || undefined : undefined;
      result.push({ kboId, name, team });
    });
  });
  return result;
}

// ASP.NET 컨트롤 prefix — Record/Player/* 기록 페이지 공통.
const KBO_CTL_PREFIX = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$";

/** 기록 페이지 dropdown 변경 이벤트 POST — 응답 HTML 반환. */
async function postKboDropdown(
  url: string,
  cookie: string,
  hidden: ReturnType<typeof extractHidden>,
  eventTarget: string,
  fields: Record<string, string>,
): Promise<string> {
  const body = new URLSearchParams({
    __EVENTTARGET: eventTarget,
    __EVENTARGUMENT: "",
    __LASTFOCUS: "",
    __VIEWSTATE: hidden.viewState,
    __VIEWSTATEGENERATOR: hidden.viewStateGenerator,
    __EVENTVALIDATION: hidden.eventValidation,
    ...fields,
  });
  const res = await axios.post<string>(url, body.toString(), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: url,
      Origin: BASE,
      Cookie: cookie,
    },
    timeout: 15000,
    responseType: "text",
  });
  return res.data;
}

/**
 * 팀 필터 결과의 2페이지 이후 수집 — ucPager LinkButton(__doPostBack) 순회.
 * 대부분 1페이지(30행 이하)로 끝나지만, 투수를 많이 쓴 시즌·팀은 2페이지가 생겨
 * 조용히 잘린다 → 페이저 버튼이 있는 동안 이어 받는다 (안전 상한 5페이지).
 */
async function fetchKboIndexRestPages(
  url: string,
  cookie: string,
  firstHtml: string,
  fields: Record<string, string>,
): Promise<string[]> {
  const pages: string[] = [];
  let html = firstHtml;
  for (let n = 2; n <= 5; n++) {
    const $ = cheerio.load(html);
    if (!$(`[id$="ucPager_btnNo${n}"]`).length) break;
    const hidden = extractHidden(html);
    html = await postKboDropdown(url, cookie, hidden, `${KBO_CTL_PREFIX}ucPager$btnNo${n}`, {
      ...fields,
      [`${KBO_CTL_PREFIX}hfPage`]: String(n),
    });
    pages.push(html);
  }
  return pages;
}

/** 한 팀의 등재 투수 — ASP.NET POST + ddlTeam 변경 이벤트로 규정이닝 무관 전체 추출 */
async function fetchKboPitcherIndexForTeam(
  team: string,
  season = SEASON_DEFAULT,
): Promise<KboPitcherIndexEntry[]> {
  const url = `${BASE}/Record/Player/PitcherBasic/Basic1.aspx`;
  // 1) GET — 세션 쿠키 + viewstate 확보
  const getRes = await axios.get<string>(url, {
    headers: HEADERS,
    timeout: 15000,
    responseType: "text",
  });
  const setCookie = (getRes.headers["set-cookie"] ?? []).join("; ");
  const cookie = setCookie
    .split(/,\s*(?=[^;]+=)/)
    .map((c) => c.split(";")[0])
    .join("; ");
  let hidden = extractHidden(getRes.data);

  const P = KBO_CTL_PREFIX;
  const fields = (t: string): Record<string, string> => ({
    [`${P}ddlSeason$ddlSeason`]: season,
    [`${P}ddlSeries$ddlSeries`]: "0",
    [`${P}ddlTeam$ddlTeam`]: t,
    [`${P}ddlSituation$ddlSituation`]: "",
    [`${P}ddlSituationDetail$ddlSituationDetail`]: "",
    [`${P}hfPage`]: "1",
    [`${P}hfOrderByCol`]: "ERA_RT",
    [`${P}hfOrderBy`]: "ASC",
  });

  // 2) 과거 시즌은 시즌 변경 이벤트를 먼저 보내야 팀 필터가 그 시즌에 적용된다.
  //    (건너뛰면 리그 규정 상위 30 페이지가 그대로 돌아옴 — 2026-08-09 실측)
  if (season !== SEASON_DEFAULT) {
    const seasonHtml = await postKboDropdown(url, cookie, hidden, `${P}ddlSeason$ddlSeason`, fields(""));
    hidden = extractHidden(seasonHtml);
  }

  // 3) POST — ddlTeam 변경 이벤트 시뮬레이션 (+ 2페이지 이후 병합)
  const html = await postKboDropdown(url, cookie, hidden, `${P}ddlTeam$ddlTeam`, fields(team));
  const rest = await fetchKboIndexRestPages(url, cookie, html, fields(team));
  return [html, ...rest].flatMap((h) => parseKboPitcherTable(h));
}

export interface KboRecordRow {
  cells: Record<string, string>;
  playerId: string | null;
}

/** 기록 페이지 통계 테이블 파싱 — 헤더명→셀 매핑 (행 3+ 인 첫 테이블) */
function parseKboRecordTable(html: string): KboRecordRow[] {
  const $ = cheerio.load(html);
  const table = $("table").filter((_, t) => $(t).find("tr").length > 3).first();
  if (table.length === 0) return [];
  const headers = table
    .find("tr")
    .first()
    .find("th")
    .map((_, th) => $(th).text().trim())
    .get();
  const rows: KboRecordRow[] = [];
  table
    .find("tr")
    .slice(1)
    .each((_, tr) => {
      const tds = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (tds.length < 3) return;
      const cells: Record<string, string> = {};
      for (let i = 0; i < headers.length && i < tds.length; i++) {
        cells[headers[i]] = tds[i];
      }
      const href = $(tr).find("a[href*='playerId=']").first().attr("href") ?? "";
      const m = href.match(/playerId=(\d+)/);
      rows.push({ cells, playerId: m ? m[1] : null });
    });
  return rows;
}

/**
 * Record/Player/* 기록 페이지를 팀 선택 POST 로 조회 — GET 단독의
 * "규정 충족 상위 30" 제한 우회. 폼 구조는 PitcherBasic 과 동일한 기록
 * 페이지 템플릿. hfOrderBy* 초기값은 GET 응답에서 그대로 echo.
 */
export async function fetchKboRecordTableForTeam(
  pagePath: string, // 예: "/Record/Player/HitterBasic/Basic1.aspx"
  teamCode: string, // KBO_TEAM_CODES 값
  season = SEASON_DEFAULT,
): Promise<KboRecordRow[]> {
  const url = `${BASE}${pagePath}`;
  const getRes = await axios.get<string>(url, {
    headers: HEADERS,
    timeout: 15000,
    responseType: "text",
  });
  const setCookie = (getRes.headers["set-cookie"] ?? []).join("; ");
  const cookie = setCookie
    .split(/,\s*(?=[^;]+=)/)
    .map((c) => c.split(";")[0])
    .join("; ");
  const hidden = extractHidden(getRes.data);
  const $get = cheerio.load(getRes.data);
  const hfVal = (suffix: string) =>
    $get(`input[name$='${suffix}']`).attr("value") ?? "";
  const P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents";
  const body = new URLSearchParams({
    __EVENTTARGET: `${P}$ddlTeam$ddlTeam`,
    __EVENTARGUMENT: "",
    __LASTFOCUS: "",
    __VIEWSTATE: hidden.viewState,
    __VIEWSTATEGENERATOR: hidden.viewStateGenerator,
    __EVENTVALIDATION: hidden.eventValidation,
    [`${P}$ddlSeason$ddlSeason`]: season,
    [`${P}$ddlSeries$ddlSeries`]: "0",
    [`${P}$ddlTeam$ddlTeam`]: teamCode,
    [`${P}$ddlSituation$ddlSituation`]: "",
    [`${P}$ddlSituationDetail$ddlSituationDetail`]: "",
    [`${P}$hfPage`]: "1",
    [`${P}$hfOrderByCol`]: hfVal("hfOrderByCol"),
    [`${P}$hfOrderBy`]: hfVal("hfOrderBy"),
  });
  const postRes = await axios.post<string>(url, body.toString(), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: url,
      Origin: BASE,
      Cookie: cookie,
    },
    timeout: 15000,
    responseType: "text",
  });
  return parseKboRecordTable(postRes.data);
}

/**
 * 시즌 등재 투수 전체 인덱스 — 10팀 순회 합산.
 *
 * KBO 공식 사이트의 PitcherBasic.aspx 는 GET 단독으로는 규정이닝 충족
 * 24명만 반환. ASP.NET POST + ddlTeam=<팀코드> 이벤트로 변경하면 그 팀
 * 등재 투수 전체 (외국인/신예 포함, 보통 17~27명) 반환. 10팀 순회로 약
 * 200명+ 추출 (직렬 호출 ~13초, KBO 서버 부담 회피).
 */
export async function fetchKboPitcherIndex(
  season = SEASON_DEFAULT,
): Promise<KboPitcherIndexEntry[]> {
  const merged: KboPitcherIndexEntry[] = [];
  const seen = new Set<string>();
  for (const team of KBO_TEAM_CODES) {
    try {
      const list = await fetchKboPitcherIndexForTeam(team, season);
      for (const p of list) {
        if (seen.has(p.kboId)) continue;
        seen.add(p.kboId);
        merged.push(p);
      }
    } catch (e) {
      console.warn(
        `[kbo-official] team=${team} index 실패:`,
        (e as Error).message,
      );
    }
  }
  return merged;
}

// ============================================================
// 타자 인덱스 — HitterBasic.aspx (투수 패턴 복제 + ddlPos 추가)
// ============================================================

/** 한 팀 등재 타자 — HitterBasic.aspx, GET viewstate → POST ddlTeam (투수와 동일 ASP.NET). */
async function fetchKboHitterIndexForTeam(
  team: string,
  season = SEASON_DEFAULT,
): Promise<KboPitcherIndexEntry[]> {
  const url = `${BASE}/Record/Player/HitterBasic/Basic1.aspx`;
  const getRes = await axios.get<string>(url, {
    headers: HEADERS,
    timeout: 15000,
    responseType: "text",
  });
  const setCookie = (getRes.headers["set-cookie"] ?? []).join("; ");
  const cookie = setCookie
    .split(/,\s*(?=[^;]+=)/)
    .map((c) => c.split(";")[0])
    .join("; ");
  let hidden = extractHidden(getRes.data);

  // 타자 페이지는 투수와 동일 prefix + ddlPos 추가. 정렬만 HRA_RT/DESC (명단엔 무관).
  const P = KBO_CTL_PREFIX;
  const fields = (t: string): Record<string, string> => ({
    [`${P}ddlSeason$ddlSeason`]: season,
    [`${P}ddlSeries$ddlSeries`]: "0",
    [`${P}ddlTeam$ddlTeam`]: t,
    [`${P}ddlPos$ddlPos`]: "", // 전체 포지션 (타자 페이지 추가 필드)
    [`${P}ddlSituation$ddlSituation`]: "",
    [`${P}ddlSituationDetail$ddlSituationDetail`]: "",
    [`${P}hfPage`]: "1",
    [`${P}hfOrderByCol`]: "HRA_RT",
    [`${P}hfOrderBy`]: "DESC",
  });

  // 과거 시즌은 시즌 변경 이벤트 선행 (투수 인덱스와 동일한 이유).
  if (season !== SEASON_DEFAULT) {
    const seasonHtml = await postKboDropdown(url, cookie, hidden, `${P}ddlSeason$ddlSeason`, fields(""));
    hidden = extractHidden(seasonHtml);
  }

  const html = await postKboDropdown(url, cookie, hidden, `${P}ddlTeam$ddlTeam`, fields(team));
  const rest = await fetchKboIndexRestPages(url, cookie, html, fields(team));
  // 선수명/팀명 헤더가 투수 테이블과 동일 → parseKboPitcherTable 재사용.
  return [html, ...rest].flatMap((h) => parseKboPitcherTable(h));
}

/** 시즌 등재 타자 전체 인덱스 — 10팀 순회 (fetchKboPitcherIndex 와 동일 구조). */
export async function fetchKboHitterIndex(
  season = SEASON_DEFAULT,
): Promise<KboPitcherIndexEntry[]> {
  const merged: KboPitcherIndexEntry[] = [];
  const seen = new Set<string>();
  for (const team of KBO_TEAM_CODES) {
    try {
      const list = await fetchKboHitterIndexForTeam(team, season);
      for (const p of list) {
        if (seen.has(p.kboId)) continue;
        seen.add(p.kboId);
        merged.push(p);
      }
    } catch (e) {
      console.warn(
        `[kbo-official] team=${team} 타자 index 실패:`,
        (e as Error).message,
      );
    }
  }
  return merged;
}

export interface KboPitcherStats {
  kboId: string;
  team?: string;
  era?: number;
  ip?: string; // "55.1" 식 (이닝.3분 표기)
  wins?: number;
  losses?: number;
  saves?: number;
  holds?: number;
  k?: number;
  bb?: number;
  hbp?: number;
  hits?: number;
  hr?: number;
  r?: number; // 실점 (LOB% 계산용)
  whip?: number;
  avg?: number; // 피안타율
  qs?: number;
  gs?: number; // CG 가 아닌 G(등판), GS 별도 추정 어려움 — G 그대로
  g?: number;
}

function toNum(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const t = s.trim().replace(/,/g, "");
  if (t === "" || t === "-") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 개별 투수 시즌 stats. table 의 첫 데이터 row 가 현재 시즌.
 */
export async function fetchKboPitcherStats(
  kboId: string,
): Promise<KboPitcherStats | null> {
  const url = `${BASE}/Record/Player/PitcherDetail/Basic.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 12000,
      responseType: "text",
    });
    html = r.data;
  } catch (e) {
    console.warn(`[kbo-official] stats #${kboId} fetch 실패:`, (e as Error).message);
    return null;
  }
  return parseKboPitcherStatsHtml(html, kboId);
}

/** PitcherDetail HTML → 시즌 stats 파싱 (fetch 분리 — detail 통합 fetch 재사용용) */
function parseKboPitcherStatsHtml(
  html: string,
  kboId: string,
): KboPitcherStats | null {
  const $ = cheerio.load(html);
  // PitcherDetail 페이지: stats 가 2개 테이블에 분리.
  //   table 0: 팀명 | ERA | G | CG | SHO | W | L | SV | HLD | WPCT | TBF | NP | IP | H | 2B | 3B | HR
  //   table 1: SAC | SF | BB | IBB | SO | WP | BK | R | ER | BSV | WHIP | AVG | QS
  // 두 테이블 header→cell 매핑 합쳐 lookup.
  const merged = new Map<string, string>();
  $("table").each((_, t) => {
    const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
    if (headers.length === 0) return;
    // ERA 또는 WHIP 가 있는 테이블만 (stats 테이블)
    if (!headers.includes("ERA") && !headers.includes("WHIP")) return;
    const cells = $(t).find("tbody tr").first().find("td").map((_, td) => $(td).text().trim()).get();
    if (cells.length !== headers.length) return;
    headers.forEach((h, i) => merged.set(h, cells[i]));
  });
  if (merged.size === 0) return null;
  const get = (key: string) => merged.get(key);
  return {
    kboId,
    team: get("팀명"),
    era: toNum(get("ERA")),
    ip: get("IP"),
    wins: toNum(get("W")),
    losses: toNum(get("L")),
    saves: toNum(get("SV")),
    holds: toNum(get("HLD")),
    k: toNum(get("SO")),
    bb: toNum(get("BB")),
    hbp: toNum(get("HBP")),
    hits: toNum(get("H")),
    hr: toNum(get("HR")),
    r: toNum(get("R")),
    whip: toNum(get("WHIP")),
    avg: toNum(get("AVG")),
    qs: toNum(get("QS")),
    g: toNum(get("G")),
    gs: toNum(get("CG")), // KBO 페이지에 GS 컬럼 없음 — CG 로 fallback
  };
}

/**
 * 이름 + 팀(옵션) 으로 KBO playerId lookup.
 * 동명이인 가능성 — 팀명 일치 우선.
 */
export function findKboIdByName(
  index: KboPitcherIndexEntry[],
  name: string,
  teamHint?: string,
): string | null {
  const normName = name.trim();
  const candidates = index.filter((e) => e.name === normName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].kboId;
  if (teamHint) {
    const tHint = teamHint.replace(/\s+/g, "").toLowerCase();
    const byTeam = candidates.find((e) =>
      (e.team ?? "").replace(/\s+/g, "").toLowerCase().includes(tHint),
    );
    if (byTeam) return byTeam.kboId;
  }
  return candidates[0].kboId;
}

/**
 * KBO 표기 ip → 정확한 이닝.
 *   "55"      → 55
 *   "55.1"    → 55 + 1/3 (KBO 의 dot 표기 — .1=1/3, .2=2/3)
 *   "55 1/3"  → 55 + 1/3 (분수 표기)
 *   "55 2/3"  → 55 + 2/3
 */
export function ipToInnings(ip: string | undefined): number | undefined {
  if (!ip) return undefined;
  const s = ip.trim();
  // 분수 표기 "55 1/3" 우선
  const frac = s.match(/^(\d+)\s+([12])\/3$/);
  if (frac) return Number(frac[1]) + Number(frac[2]) / 3;
  // dot 표기 "55", "55.1", "55.2"
  const dot = s.match(/^(\d+)(?:\.(\d))?$/);
  if (dot) {
    const whole = Number(dot[1]);
    const f = dot[2] ? Number(dot[2]) : 0;
    return whole + f / 3;
  }
  return undefined;
}

/** K/9 계산 (KBO 페이지엔 직접 안 나옴) */
export function calcK9(k: number | undefined, ipStr: string | undefined): number | undefined {
  const innings = ipToInnings(ipStr);
  if (k == null || innings == null || innings === 0) return undefined;
  return (k * 9) / innings;
}

export interface KboPitcherRecentGame {
  date: string; // "05.06"
  opponent: string; // "한화"
  result?: "W" | "L" | "ND"; // 승/패/노디시즌
  era?: number;
  tbf?: number;
  ip?: string;
  h?: number;
  hr?: number;
  bb?: number;
  hbp?: number;
  k?: number;
  r?: number;
  er?: number;
  avg?: number;
}

/**
 * 최근 등판 game-by-game 추출. PitcherDetail.aspx 의 table 2.
 * 시즌 합계 row 는 header 에 흡수되어 tbody 에 안 들어옴 — 그대로 잡힘.
 */
export async function fetchKboPitcherRecent(kboId: string): Promise<KboPitcherRecentGame[]> {
  const url = `${BASE}/Record/Player/PitcherDetail/Basic.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 12000,
      responseType: "text",
    });
    html = r.data;
  } catch {
    return [];
  }
  return parseKboPitcherRecentHtml(html);
}

/** PitcherDetail HTML → 최근 등판 로그 파싱 (fetch 분리) */
function parseKboPitcherRecentHtml(html: string): KboPitcherRecentGame[] {
  const $ = cheerio.load(html);
  const result: KboPitcherRecentGame[] = [];
  $("table").each((_, t) => {
    const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
    if (!headers.includes("일자")) return;
    $(t).find("tbody tr").each((_, tr) => {
      const c = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (c.length < 14) return;
      const resultMap: Record<string, "W" | "L" | "ND"> = { 승: "W", 패: "L" };
      result.push({
        date: c[0],
        opponent: c[1],
        result: resultMap[c[2]] ?? "ND",
        era: toNum(c[3]),
        tbf: toNum(c[4]),
        ip: c[5] || undefined,
        h: toNum(c[6]),
        hr: toNum(c[7]),
        bb: toNum(c[8]),
        hbp: toNum(c[9]),
        k: toNum(c[10]),
        r: toNum(c[11]),
        er: toNum(c[12]),
        avg: toNum(c[13]),
      });
    });
  });
  return result;
}

/**
 * PitcherDetail 1회 fetch 로 시즌 stats + 최근 등판 로그 동시 파싱.
 * (fetchKboPitcherStats + fetchKboPitcherRecent 를 따로 부르면 같은 페이지 2회 fetch)
 */
export async function fetchKboPitcherDetail(kboId: string): Promise<{
  stats: KboPitcherStats | null;
  recent: KboPitcherRecentGame[];
}> {
  const url = `${BASE}/Record/Player/PitcherDetail/Basic.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 12000,
      responseType: "text",
    });
    html = r.data;
  } catch (e) {
    console.warn(`[kbo-official] detail #${kboId} fetch 실패:`, (e as Error).message);
    return { stats: null, recent: [] };
  }
  return {
    stats: parseKboPitcherStatsHtml(html, kboId),
    recent: parseKboPitcherRecentHtml(html),
  };
}

export interface KboRecentForm {
  recentEra: number;
  recentIp: number;
  /** 집계에 쓴 등판 수 (2~lastN) */
  starts: number;
}

/**
 * KBO 등판 로그 → 최근 N등판 폼 (ER·IP 합산 ERA + 평균 이닝).
 * 페이지가 최근 10경기만 노출 — beforeDate("MM.DD", exclusive)는 그 범위 내 walk-forward 용.
 * 등판 2회 미만 또는 합산 IP 2 미만이면 null (표본 부족 — ERA 왜곡 방지).
 */
export function computeKboRecentForm(
  recent: KboPitcherRecentGame[],
  opts?: { lastN?: number; beforeDate?: string },
): KboRecentForm | null {
  const lastN = opts?.lastN ?? 3;
  const games = recent
    .filter((g) => g.er != null && ipToInnings(g.ip) != null)
    .filter((g) => !opts?.beforeDate || g.date < opts.beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, lastN);
  if (games.length < 2) return null;
  const sumIp = games.reduce((s, g) => s + (ipToInnings(g.ip) ?? 0), 0);
  const sumEr = games.reduce((s, g) => s + (g.er ?? 0), 0);
  if (sumIp < 2) return null;
  return {
    recentEra: Math.min(27, (sumEr * 9) / sumIp),
    recentIp: sumIp / games.length,
    starts: games.length,
  };
}

export interface KboPitcherDailyGame {
  date: string; // "03.28"
  opponent: string;
  role?: string; // 선발 | 구원
  result?: "W" | "L" | "S" | "H";
  gameEra?: number; // 그 경기 방어율
  cumEra?: number; // 그 시점 누적 시즌 방어율
  ip?: string;
  tbf?: number;
  h?: number;
  hr?: number;
  bb?: number;
  so?: number;
  r?: number;
  er?: number;
}

/**
 * 시즌 전체 등판 로그 — PitcherDetail/Daily.aspx.
 *
 * Basic.aspx 의 최근 10경기와 달리 개막부터 전 경기를 담고, 그 시점 **누적 ERA** 컬럼이 있어
 * 시즌 방어율 추이를 그릴 수 있다. 표가 월별로 쪼개져 있어(3월표·4월표…) 순회 합산한다.
 *
 * ⚠️ 합계 row 가 th 로 섞여 들어와 headers 가 15개를 넘는다 → 컬럼 수 15인 tbody 행만 채택.
 *    ("기록이 없습니다" 안내 행도 이 조건에서 자연히 걸러진다)
 */
export async function fetchKboPitcherDaily(kboId: string): Promise<KboPitcherDailyGame[]> {
  const url = `${BASE}/Record/Player/PitcherDetail/Daily.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, { headers: HEADERS, timeout: 12000, responseType: "text" });
    html = r.data;
  } catch {
    return [];
  }
  return parsePitcherDailyHtml(html);
}

function parsePitcherDailyHtml(html: string): KboPitcherDailyGame[] {
  const $ = cheerio.load(html);
  const games: KboPitcherDailyGame[] = [];
  const resultMap: Record<string, "W" | "L" | "S" | "H"> = { 승: "W", 패: "L", 세: "S", 홀: "H" };
  $("table").each((_, t) => {
    const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
    // 월별 로그 표 — 첫 헤더가 "3월"·"4월" 이라 이름 대신 위치로 식별.
    if (headers[1] !== "상대" || !headers.includes("IP")) return;
    $(t).find("tbody tr").each((_, tr) => {
      const c = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (c.length !== 15) return;
      games.push({
        date: c[0],
        opponent: c[1],
        role: c[2] || undefined,
        result: resultMap[c[3]],
        gameEra: toNum(c[4]),
        tbf: toNum(c[5]),
        ip: c[6] || undefined,
        h: toNum(c[7]),
        hr: toNum(c[8]),
        bb: toNum(c[9]),
        so: toNum(c[11]),
        r: toNum(c[12]),
        er: toNum(c[13]),
        cumEra: toNum(c[14]),
      });
    });
  });
  return games;
}

export interface KboHitterDailyGame {
  date: string; // "03.28"
  opponent: string;
  gameAvg?: number; // 그 경기 타율
  cumAvg?: number; // 그 시점 누적 시즌 타율
  pa?: number;
  ab?: number;
  r?: number;
  h?: number;
  d2b?: number;
  d3b?: number;
  hr?: number;
  rbi?: number;
  sb?: number;
  bb?: number;
  so?: number;
}

/**
 * 타자 시즌 전체 출장 로그 — HitterDetail/Daily.aspx.
 * 투수 Daily 와 같은 월별 표 구조이고, 컬럼만 18개(AVG1=그 경기 타율, AVG2=누적 타율)로 다르다.
 */
export async function fetchKboHitterDaily(kboId: string): Promise<KboHitterDailyGame[]> {
  const url = `${BASE}/Record/Player/HitterDetail/Daily.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, { headers: HEADERS, timeout: 12000, responseType: "text" });
    html = r.data;
  } catch {
    return [];
  }
  return parseHitterDailyHtml(html);
}

function parseHitterDailyHtml(html: string): KboHitterDailyGame[] {
  const $ = cheerio.load(html);
  const games: KboHitterDailyGame[] = [];
  $("table").each((_, t) => {
    const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
    if (headers[1] !== "상대" || !headers.includes("PA")) return;
    $(t).find("tbody tr").each((_, tr) => {
      const c = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (c.length !== 18) return;
      games.push({
        date: c[0],
        opponent: c[1],
        gameAvg: toNum(c[2]),
        pa: toNum(c[3]),
        ab: toNum(c[4]),
        r: toNum(c[5]),
        h: toNum(c[6]),
        d2b: toNum(c[7]),
        d3b: toNum(c[8]),
        hr: toNum(c[9]),
        rbi: toNum(c[10]),
        sb: toNum(c[11]),
        bb: toNum(c[13]),
        so: toNum(c[15]),
        cumAvg: toNum(c[17]),
      });
    });
  });
  return games;
}

/**
 * 시즌 지정 Daily HTML — 현재 시즌은 단순 GET, 과거 시즌은 ddlYear 변경 이벤트 POST.
 * (Daily.aspx 는 ddlYear 드롭다운으로 과거 시즌 로그를 그대로 제공 — 2026-08-09 실측)
 */
async function fetchKboDailyHtmlForSeason(
  kind: "Pitcher" | "Hitter",
  kboId: string,
  season: string,
): Promise<string | null> {
  const url = `${BASE}/Record/Player/${kind}Detail/Daily.aspx?playerId=${kboId}`;
  try {
    const getRes = await axios.get<string>(url, { headers: HEADERS, timeout: 15000, responseType: "text" });
    if (season === SEASON_DEFAULT) return getRes.data;
    const setCookie = (getRes.headers["set-cookie"] ?? []).join("; ");
    const cookie = setCookie
      .split(/,\s*(?=[^;]+=)/)
      .map((c) => c.split(";")[0])
      .join("; ");
    const hidden = extractHidden(getRes.data);
    // Daily.aspx 의 연도 드롭다운은 인덱스 페이지들과 달리 "ddlYear" 단일 이름 (중첩 없음).
    const P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$";
    const body = new URLSearchParams({
      __EVENTTARGET: `${P}ddlYear`,
      __EVENTARGUMENT: "",
      __LASTFOCUS: "",
      __VIEWSTATE: hidden.viewState,
      __VIEWSTATEGENERATOR: hidden.viewStateGenerator,
      __EVENTVALIDATION: hidden.eventValidation,
      [`${P}ddlYear`]: season,
      [`${P}ddlSeries`]: "0",
    });
    const postRes = await axios.post<string>(url, body.toString(), {
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: url,
        Origin: BASE,
        Cookie: cookie,
      },
      timeout: 15000,
      responseType: "text",
    });
    return postRes.data;
  } catch {
    return null;
  }
}

/** 시즌 지정 투수 Daily — 과거 시즌 백필용 (season 이 현재 연도면 GET 과 동일). */
export async function fetchKboPitcherDailySeason(
  kboId: string,
  season = SEASON_DEFAULT,
): Promise<KboPitcherDailyGame[]> {
  const html = await fetchKboDailyHtmlForSeason("Pitcher", kboId, season);
  return html ? parsePitcherDailyHtml(html) : [];
}

/** 시즌 지정 타자 Daily — 과거 시즌 백필용. */
export async function fetchKboHitterDailySeason(
  kboId: string,
  season = SEASON_DEFAULT,
): Promise<KboHitterDailyGame[]> {
  const html = await fetchKboDailyHtmlForSeason("Hitter", kboId, season);
  return html ? parseHitterDailyHtml(html) : [];
}

export interface KboPitcherProfile {
  name?: string;
  team?: string;
  number?: string;
  birthday?: string; // "1999년 01월 21일"
  age?: number;
  position?: string; // "투수(우투우타)"
  hand?: "L" | "R";
  bats?: "L" | "R";
  height?: string; // "193cm"
  weight?: string; // "104kg"
  career?: string;
  // KBO 공식 프로필 추가 항목 (선수 페이지 노출용)
  salary?: string; // 연봉 "3300만원"
  signingBonus?: string; // 입단 계약금 "20000만원"
  draft?: string; // 지명순위 "22 한화 2차 1라운드 1순위"
  debutYear?: string; // 입단년도 "22한화"
}

function calcAge(birthday: string | undefined): number | undefined {
  if (!birthday) return undefined;
  const m = birthday.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})/);
  if (!m) return undefined;
  const by = Number(m[1]), bm = Number(m[2]), bd = Number(m[3]);
  const today = new Date();
  let age = today.getFullYear() - by;
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  const bmd = bm * 100 + bd;
  if (md < bmd) age--;
  return age;
}

function parseHand(pos: string | undefined): "L" | "R" | undefined {
  if (!pos) return undefined;
  if (pos.includes("좌투")) return "L";
  if (pos.includes("우투")) return "R";
  return undefined;
}

function parseBats(pos: string | undefined): "L" | "R" | undefined {
  if (!pos) return undefined;
  if (pos.includes("좌타")) return "L";
  if (pos.includes("우타")) return "R";
  return undefined;
}

/**
 * 선수 풀 프로필 — PitcherDetail .player_basic 영역 추출.
 * 이름·팀·등번호·생년월일·나이·포지션(투/타)·신장·체중·경력.
 */
export async function fetchKboPitcherProfile(kboId: string): Promise<KboPitcherProfile> {
  const url = `${BASE}/Record/Player/PitcherDetail/Basic.aspx?playerId=${kboId}`;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 10000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    const fields = new Map<string, string>();
    $(".player_basic li").each((_, li) => {
      const label = $(li).find("strong").text().replace(/[:：]/g, "").trim();
      const value = $(li).find("span").text().trim();
      if (label) fields.set(label, value);
    });
    const hw = fields.get("신장/체중") ?? "";
    const [h, w] = hw.split("/").map((s) => s.trim());
    // 팀명 — .player_basic 내부에 단독 노출 아니어서 stats table 의 팀명 cell fallback
    let team: string | undefined;
    $("table").each((_, t) => {
      const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
      if (!headers.includes("ERA")) return;
      const cells = $(t).find("tbody tr").first().find("td").map((_, td) => $(td).text().trim()).get();
      if (cells.length === headers.length) {
        const i = headers.indexOf("팀명");
        if (i >= 0) team = cells[i] || undefined;
      }
    });
    const position = fields.get("포지션");
    const birthday = fields.get("생년월일");
    return {
      name: fields.get("선수명") || undefined,
      salary: fields.get("연봉") || undefined,
      signingBonus: fields.get("입단 계약금") || undefined,
      draft: fields.get("지명순위") || undefined,
      debutYear: fields.get("입단년도") || undefined,
      team,
      number: fields.get("등번호") || undefined,
      birthday,
      age: calcAge(birthday),
      position,
      hand: parseHand(position),
      bats: parseBats(position),
      height: h || undefined,
      weight: w || undefined,
      career: fields.get("경력") || undefined,
    };
  } catch {
    return {};
  }
}

/** 하위 호환 alias — fetchKboPitcherName 으로 import 한 곳이 있어서. */
export const fetchKboPitcherName = fetchKboPitcherProfile;

/* ============================================================
 * 타자 (Hitter) — /Record/Player/HitterDetail/Basic.aspx
 * ==========================================================*/

// 같은 .player_basic 구조 — KBO 페이지가 hitter/pitcher 동일 layout
export type KboHitterProfile = KboPitcherProfile;

export interface KboHitterStats {
  team?: string;
  avg?: string; // 타율
  g?: number;
  pa?: number;
  ab?: number;
  r?: number;
  h?: number;
  d2b?: number; // 2루타
  d3b?: number;
  hr?: number;
  tb?: number;
  rbi?: number;
  sac?: number;
  sf?: number;
  bb?: number;
  ibb?: number;
  hbp?: number;
  so?: number;
  gdp?: number;
  slg?: string;
  obp?: string;
  e?: number;
  sb?: number;
}

/** KBO 선수 사진 URL (네이버 CDN). pitcher/hitter 공통. */
export function kboPhotoUrl(playerId: string | number): string {
  const y = new Date().getUTCFullYear();
  return `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${y}/${playerId}.jpg`;
}

/** HitterDetail/Basic + Basic2 의 시즌 누적 합쳐서 반환. */
export async function fetchKboHitterStats(
  kboId: string,
): Promise<KboHitterStats | null> {
  const url = `${BASE}/Record/Player/HitterDetail/Basic.aspx?playerId=${kboId}`;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 10000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    // 페이지 상단 2 개 표 (table[0]·table[1]) 가 시즌 누적
    const out: KboHitterStats = {};
    const tables = $("#tabAvg, .tData, table").toArray();
    // 휴리스틱 — 헤더에 AVG/HR/RBI 같은 hitter 컬럼이 있는 표 찾기
    for (const t of tables) {
      const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
      if (headers.length < 4) continue;
      if (!headers.some((h) => /AVG|HR|RBI|OBP|SLG|H$|^G$|^AB$/.test(h))) continue;
      const cells = $(t).find("tbody tr").first().find("td").map((_, td) => $(td).text().trim()).get();
      if (cells.length !== headers.length) continue;
      const get = (h: string) => {
        const idx = headers.indexOf(h);
        return idx >= 0 ? cells[idx] : undefined;
      };
      const num = (v: string | undefined) => {
        if (!v) return undefined;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const map: Record<string, keyof KboHitterStats> = {
        팀명: "team", AVG: "avg", G: "g", PA: "pa", AB: "ab", R: "r", H: "h",
        "2B": "d2b", "3B": "d3b", HR: "hr", TB: "tb", RBI: "rbi", SAC: "sac",
        SF: "sf", BB: "bb", IBB: "ibb", HBP: "hbp", SO: "so", GDP: "gdp",
        SLG: "slg", OBP: "obp", E: "e", SB: "sb",
      };
      for (const [h, key] of Object.entries(map)) {
        const v = get(h);
        if (v == null) continue;
        // 문자열로 둘 항목 (team / avg / slg / obp)
        if (key === "team" || key === "avg" || key === "slg" || key === "obp") {
          (out as Record<string, string | undefined>)[key as string] = v;
        } else {
          (out as Record<string, number | undefined>)[key as string] = num(v);
        }
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * 연도별(year-by-year) + 통산 — Total.aspx
 * 스플릿 — Situation.aspx(vs 좌우) + Game.aspx(홈/원정·월별)
 * 선수 페이지 4탭 강화용. MLB 와 동일 타입(PitcherSeasonRow 등) 재사용.
 * ==========================================================*/

// Total/Situation/Game 공통 — 지정 헤더를 모두 가진 테이블의 헤더 + tbody 행 추출.
// KBO 표는 행 첫 셀(연도/통산/구분)이 <th> 라서 헤더는 thead 로 한정하고,
// 행은 th+td 를 모두 모은다. 통산행은 팀명 칸이 생략돼 1칸 짧으므로 보정.
function parseKboStatTable(
  html: string,
  keyHeaders: string[],
): { header: string[]; rows: string[][] } {
  const $ = cheerio.load(html);
  let header: string[] = [];
  const rows: string[][] = [];
  $("table").each((_, t) => {
    let ths = $(t).find("thead th").map((_, e) => $(e).text().trim()).get();
    if (ths.length === 0)
      ths = $(t).find("tr").first().find("th").map((_, e) => $(e).text().trim()).get();
    if (ths.length === 0 || !keyHeaders.every((k) => ths.includes(k))) return;
    if (header.length === 0) header = ths;
    $(t).find("tbody tr").each((_, tr) => {
      let cells = $(tr).find("th, td").map((_, c) => $(c).text().trim()).get();
      if (cells.length === ths.length - 1 && cells[0] === "통산") {
        cells = [cells[0], "", ...cells.slice(1)];
      }
      if (cells.length === ths.length && cells[0]) rows.push(cells);
    });
  });
  return { header, rows };
}

const kboWhip = (h?: number, bb?: number, ip?: string): string | undefined => {
  const innings = ipToInnings(ip);
  if (!innings || innings <= 0 || h == null || bb == null) return undefined;
  return ((h + bb) / innings).toFixed(2);
};
const kboK9 = (k?: number, ip?: string): string | undefined => {
  const innings = ipToInnings(ip);
  if (!innings || innings <= 0 || k == null) return undefined;
  return ((k * 9) / innings).toFixed(1);
};

/** 투수 연도별 + 통산 (Total.aspx). 첫 데이터행=통산, 이후 연도. */
export async function fetchKboPitcherYearlyRaw(
  kboId: string,
): Promise<{ seasons: PitcherSeasonRow[]; career: PitcherSeasonRow | null }> {
  const url = `${BASE}/Record/Player/PitcherDetail/Total.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, { headers: HEADERS, timeout: 12000, responseType: "text" });
    html = r.data;
  } catch {
    return { seasons: [], career: null };
  }
  const { header, rows } = parseKboStatTable(html, ["연도", "ERA"]);
  if (header.length === 0) return { seasons: [], career: null };
  const at = (tds: string[], k: string) => {
    const i = header.indexOf(k);
    return i >= 0 ? tds[i] : undefined;
  };
  const map = (tds: string[]): PitcherSeasonRow => {
    const ip = at(tds, "IP") || undefined;
    const h = toNum(at(tds, "H"));
    const bb = toNum(at(tds, "BB"));
    const so = toNum(at(tds, "SO"));
    return {
      season: at(tds, "연도") ?? "",
      teamLabel: at(tds, "팀명") ?? "",
      g: toNum(at(tds, "G")),
      w: toNum(at(tds, "W")),
      l: toNum(at(tds, "L")),
      sv: toNum(at(tds, "SV")),
      ip,
      era: at(tds, "ERA") || undefined,
      whip: kboWhip(h, bb, ip),
      so,
      bb,
      hr: toNum(at(tds, "HR")),
      k9: kboK9(so, ip),
    };
  };
  let career: PitcherSeasonRow | null = null;
  const seasons: PitcherSeasonRow[] = [];
  for (const tds of rows) {
    const yr = at(tds, "연도") ?? "";
    if (yr === "통산") career = map(tds);
    else if (/^\d{4}$/.test(yr)) seasons.push(map(tds));
  }
  return { seasons, career };
}

/** 타자 연도별 + 통산 (Total.aspx). */
export async function fetchKboHitterYearlyRaw(
  kboId: string,
): Promise<{ seasons: HitterSeasonRow[]; career: HitterSeasonRow | null }> {
  const url = `${BASE}/Record/Player/HitterDetail/Total.aspx?playerId=${kboId}`;
  let html: string;
  try {
    const r = await axios.get<string>(url, { headers: HEADERS, timeout: 12000, responseType: "text" });
    html = r.data;
  } catch {
    return { seasons: [], career: null };
  }
  const { header, rows } = parseKboStatTable(html, ["연도", "AVG"]);
  if (header.length === 0) return { seasons: [], career: null };
  const at = (tds: string[], k: string) => {
    const i = header.indexOf(k);
    return i >= 0 ? tds[i] : undefined;
  };
  const map = (tds: string[]): HitterSeasonRow => {
    const obp = at(tds, "OBP");
    const slg = at(tds, "SLG");
    const ops =
      obp && slg && Number.isFinite(parseFloat(obp)) && Number.isFinite(parseFloat(slg))
        ? (parseFloat(obp) + parseFloat(slg)).toFixed(3)
        : undefined;
    return {
      season: at(tds, "연도") ?? "",
      teamLabel: at(tds, "팀명") ?? "",
      g: toNum(at(tds, "G")),
      pa: toNum(at(tds, "PA")),
      avg: at(tds, "AVG") || undefined,
      obp: obp || undefined,
      slg: slg || undefined,
      ops,
      hr: toNum(at(tds, "HR")),
      rbi: toNum(at(tds, "RBI")),
      r: toNum(at(tds, "R")),
      h: toNum(at(tds, "H")),
      bb: toNum(at(tds, "BB")),
      so: toNum(at(tds, "SO")),
      sb: toNum(at(tds, "SB")),
    };
  };
  let career: HitterSeasonRow | null = null;
  const seasons: HitterSeasonRow[] = [];
  for (const tds of rows) {
    const yr = at(tds, "연도") ?? "";
    if (yr === "통산") career = map(tds);
    else if (/^\d{4}$/.test(yr)) seasons.push(map(tds));
  }
  return { seasons, career };
}

/** 스플릿 — Situation(vs 좌우) + Game(홈/원정·월별). 없으면 빈 값. */
export async function fetchKboSplitsRaw(
  kboId: string,
  group: "hitting" | "pitching",
): Promise<PlayerSplits> {
  const detail = group === "pitching" ? "PitcherDetail" : "HitterDetail";
  const opt = { headers: HEADERS, timeout: 12000, responseType: "text" as const };
  const [sit, game] = await Promise.all([
    axios
      .get<string>(`${BASE}/Record/Player/${detail}/Situation.aspx?playerId=${kboId}`, opt)
      .then((r) => r.data)
      .catch(() => null),
    axios
      .get<string>(`${BASE}/Record/Player/${detail}/Game.aspx?playerId=${kboId}`, opt)
      .then((r) => r.data)
      .catch(() => null),
  ]);
  const res: PlayerSplits = { byMonth: [] };

  if (sit) {
    const { header, rows } = parseKboStatTable(sit, ["구분", "AVG"]);
    const at = (tds: string[], k: string) => {
      const i = header.indexOf(k);
      return i >= 0 ? tds[i] : undefined;
    };
    const byLabel = new Map(rows.map((tds) => [tds[0], tds] as const));
    const mk = (tds: string[], label: string): SplitRow =>
      group === "pitching"
        ? { label, avg: at(tds, "AVG") || undefined }
        : { label, avg: at(tds, "AVG") || undefined, hr: toNum(at(tds, "HR")) };
    if (group === "pitching") {
      const l = byLabel.get("좌타자");
      const r = byLabel.get("우타자");
      if (l) res.vsLeft = mk(l, "vs 좌타");
      if (r) res.vsRight = mk(r, "vs 우타");
    } else {
      const l = byLabel.get("좌투수");
      const r = byLabel.get("우투수");
      if (l) res.vsLeft = mk(l, "vs 좌투");
      if (r) res.vsRight = mk(r, "vs 우투");
    }
    // 상황별 세부 스플릿 — Situation.aspx 는 좌우 외에도 주자·볼카운트·이닝·타순·아웃 표를 담는다.
    //  parseKboStatTable 이 같은 헤더의 표를 모두 모으므로 라벨 패턴으로 그룹만 나누면 된다.
    const SIT_GROUPS: { group: string; test: (l: string) => boolean }[] = [
      { group: "주자 상황", test: (l) => l === "주자없음" || /^[1-3](,[1-3])*루$/.test(l) || l === "만루" },
      { group: "볼카운트", test: (l) => /^\d-\d$/.test(l) },
      { group: "이닝", test: (l) => /^\d+회$/.test(l) },
      { group: "타순", test: (l) => /^\d번타자$/.test(l) },
      { group: "아웃카운트", test: (l) => /^\d아웃$/.test(l) },
    ];
    const situational: { group: string; rows: SplitRow[] }[] = [];
    for (const g of SIT_GROUPS) {
      const items = rows.filter((tds) => g.test(tds[0])).map((tds) => mk(tds, tds[0]));
      if (items.length) situational.push({ group: g.group, rows: items });
    }
    if (situational.length) res.situational = situational;
  }

  if (game) {
    const { header, rows } = parseKboStatTable(game, ["구분", "AVG"]);
    const at = (tds: string[], k: string) => {
      const i = header.indexOf(k);
      return i >= 0 ? tds[i] : undefined;
    };
    const byLabel = new Map(rows.map((tds) => [tds[0], tds] as const));
    const mk = (tds: string[], label: string): SplitRow =>
      group === "pitching"
        ? {
            label,
            era: at(tds, "ERA") || undefined,
            ip: at(tds, "IP") || undefined,
            avg: at(tds, "AVG") || undefined,
          }
        : { label, avg: at(tds, "AVG") || undefined, hr: toNum(at(tds, "HR")) };
    const home = byLabel.get("홈");
    const away = byLabel.get("방문");
    if (home) res.home = mk(home, "홈");
    if (away) res.away = mk(away, "원정");
    for (const ml of ["3월", "3~4월", "4월", "5월", "6월", "7월", "8월", "9월", "10월"]) {
      const row = byLabel.get(ml);
      if (row) res.byMonth.push(mk(row, ml));
    }
  }
  return res;
}

/** Hitter profile (.player_basic li) — pitcher 와 동일 layout. */
export async function fetchKboHitterProfile(
  kboId: string,
): Promise<KboHitterProfile> {
  const url = `${BASE}/Record/Player/HitterDetail/Basic.aspx?playerId=${kboId}`;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 10000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    const fields = new Map<string, string>();
    $(".player_basic li").each((_, li) => {
      const label = $(li).find("strong").text().replace(/[:：]/g, "").trim();
      const value = $(li).find("span").text().trim();
      if (label) fields.set(label, value);
    });
    const hw = fields.get("신장/체중") ?? "";
    const [h, w] = hw.split("/").map((s) => s.trim());
    let team: string | undefined;
    $("table").each((_, t) => {
      const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
      if (!headers.some((x) => /AVG|H$|HR|RBI/.test(x))) return;
      const cells = $(t).find("tbody tr").first().find("td").map((_, td) => $(td).text().trim()).get();
      if (cells.length === headers.length) {
        const i = headers.indexOf("팀명");
        if (i >= 0) team = cells[i] || undefined;
      }
    });
    const position = fields.get("포지션");
    const birthday = fields.get("생년월일");
    return {
      name: fields.get("선수명") || undefined,
      salary: fields.get("연봉") || undefined,
      signingBonus: fields.get("입단 계약금") || undefined,
      draft: fields.get("지명순위") || undefined,
      debutYear: fields.get("입단년도") || undefined,
      team,
      number: fields.get("등번호") || undefined,
      birthday,
      age: calcAge(birthday),
      position,
      hand: parseHand(position),
      bats: parseBats(position),
      height: h || undefined,
      weight: w || undefined,
      career: fields.get("경력") || undefined,
    };
  } catch {
    return {};
  }
}
