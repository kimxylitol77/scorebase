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
  $("a[href*='playerId=']").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = href.match(/playerId=(\d+)/);
    if (!m) return;
    const kboId = m[1];
    const name = $(a).text().trim();
    if (!name || seen.has(kboId)) return;
    seen.add(kboId);
    // 팀명 — 같은 row 의 두 번째 td 시도
    const team = $(a).closest("tr").find("td").eq(1).text().trim() || undefined;
    result.push({ kboId, name, team });
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
