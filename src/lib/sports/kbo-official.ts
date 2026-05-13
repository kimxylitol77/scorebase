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

/**
 * 시즌 등재 투수 인덱스 — 한 번 호출로 시즌 전체 추출.
 *
 * 헤더 위치 기반으로 "선수명" / "팀명" 컬럼을 찾아 파싱한다. 컬럼 순서가
 * 바뀌어도 깨지지 않음. 기존엔 `td.eq(1)` 을 팀명으로 가정했는데 실제
 * 페이지 헤더는 ["순위","선수명","팀명",...] 라 td.eq(1) 이 선수명(a 태그
 * 텍스트) 이었음 → team 필드에 이름이 들어가서 findKboIdByName 의 팀
 * 힌트 매칭이 깨졌었다.
 */
export async function fetchKboPitcherIndex(): Promise<KboPitcherIndexEntry[]> {
  const url = `${BASE}/Record/Player/PitcherBasic/Basic1.aspx`;
  let html: string;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 15000,
      responseType: "text",
    });
    html = r.data;
  } catch (e) {
    console.warn("[kbo-official] index fetch 실패:", (e as Error).message);
    return [];
  }
  const $ = cheerio.load(html);
  const result: KboPitcherIndexEntry[] = [];
  const seen = new Set<string>();
  $("table").each((_, t) => {
    const headers = $(t).find("th").map((_, th) => $(th).text().trim()).get();
    const nameIdx = headers.indexOf("선수명");
    const teamIdx = headers.indexOf("팀명");
    if (nameIdx < 0) return; // 선수명 헤더 없는 테이블 skip
    $(t).find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      const a = tds.eq(nameIdx).find("a[href*='playerId=']").first();
      if (!a.length) return;
      const href = a.attr("href") ?? "";
      const m = href.match(/playerId=(\d+)/);
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
  hits?: number;
  hr?: number;
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
    hits: toNum(get("H")),
    hr: toNum(get("HR")),
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
