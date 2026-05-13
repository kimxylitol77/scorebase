// NPB 공식 사이트 (npb.jp) 선수 데이터 scraping.
//
// 1) 12팀 roster: /bis/teams/rst_{code}.html (code: g·t·db·c·d·s·h·f·m·b·e·l)
//    → <a href="/bis/players/{8자리pid}.html">姓　名</a> (한자 풀네임, 全角 공백 구분)
//
// 2) 개별 선수 상세: /bis/players/{pid}.html
//    - og:title: "戸郷　翔征（読売ジャイアンツ） | 個人年度別成績"
//    - #pc_v_name (이름 한자), #pc_v_kana (히라가나 읽기)
//    - 표 "投打 / 身長／体重 / 生年月日" 의 td
//    - 표 #tablefix_p (투수 시즌 stats — 마지막 row 가 최근 시즌)
//
// 시즌 stats 컬럼 (tablefix_p): 年度·所属球団·登板·勝利·敗北·セーブ·H·HP·完投·完封勝·無四球·
//   勝率·打者·投球回·安打·本塁打·四球·死球·三振·暴投·ボーク·失点·自責点·防御率
// 投球回 셀 안엔 nested `<table class="table_inning">` (th=정수이닝, td=".1"/".2" 또는 빈값)
// → "8.2" 식으로 합쳐 KBO `ipToInnings` 그대로 사용 (.1=1/3, .2=2/3)

import axios from "axios";
import * as cheerio from "cheerio";
import { ipToInnings } from "./kbo-official";

const BASE = "https://npb.jp";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
} as const;

/**
 * 12팀 NPB team code. 페이지 URL: /bis/teams/rst_{code}.html
 * 한국 풀네임은 npb-starters.ts 의 NPB_ABBR_TO_NAME 과 일치.
 */
const NPB_TEAMS: { code: string; abbr: string; korName: string }[] = [
  { code: "g", abbr: "巨人", korName: "요미우리 자이언츠" },
  { code: "t", abbr: "阪神", korName: "한신 타이거스" },
  { code: "db", abbr: "DeNA", korName: "요코하마 디엔에이 베이스타스" },
  { code: "c", abbr: "広島", korName: "히로시마 도요 카프" },
  { code: "d", abbr: "中日", korName: "주니치 드래곤스" },
  { code: "s", abbr: "ヤクルト", korName: "도쿄 야쿠르트 스왈로스" },
  { code: "h", abbr: "ソフトバンク", korName: "후쿠오카 소프트뱅크 호크스" },
  { code: "f", abbr: "日本ハム", korName: "홋카이도 닛폰햄 파이터즈" },
  { code: "m", abbr: "ロッテ", korName: "지바 롯데 마린스" },
  { code: "b", abbr: "オリックス", korName: "오릭스 버팔로스" },
  { code: "e", abbr: "楽天", korName: "도호쿠 라쿠텐 골든이글스" },
  { code: "l", abbr: "西武", korName: "사이타마 세이부 라이온스" },
];

export interface NpbPlayerIndexEntry {
  pid: string; // npb.jp 8자리 (예: "41045138")
  fullName: string; // 한자 풀네임 "戸郷　翔征" (全角 공백 그대로)
  surname: string; // 성만 "戸郷" — starter 매칭용
  teamAbbr: string; // 일본어 약칭 (예: "巨人")
  teamKor: string; // 한국 풀네임 (예: "요미우리 자이언츠")
}

/**
 * 12팀 roster 순회. 한 시즌에 한 번 (혹은 starter cron) 호출. ~수백명 추출.
 */
export async function fetchNpbPlayerIndex(): Promise<NpbPlayerIndexEntry[]> {
  const result: NpbPlayerIndexEntry[] = [];
  for (const team of NPB_TEAMS) {
    const url = `${BASE}/bis/teams/rst_${team.code}.html`;
    try {
      const r = await axios.get<string>(url, {
        headers: HEADERS,
        timeout: 12000,
        responseType: "text",
      });
      const $ = cheerio.load(r.data);
      $("a[href*='/bis/players/']").each((_, a) => {
        const href = $(a).attr("href") ?? "";
        const m = href.match(/\/bis\/players\/(\d{6,9})\.html/);
        if (!m) return;
        const pid = m[1];
        const fullName = $(a).text().trim();
        if (!fullName) return;
        // 성/이름 분리 — 全角 또는 半角 공백 (외국인 선수는 1토큰)
        const tokens = fullName.split(/[\s　]+/).filter(Boolean);
        const surname = tokens[0] ?? fullName;
        result.push({
          pid,
          fullName,
          surname,
          teamAbbr: team.abbr,
          teamKor: team.korName,
        });
      });
    } catch (e) {
      console.warn(`[npb-official] roster ${team.code} 실패:`, (e as Error).message);
    }
    // burst 회피
    await new Promise((r) => setTimeout(r, 250));
  }
  return result;
}

/**
 * 한자 성 (또는 풀네임) + 팀 hint 로 NPB pid 매칭.
 * starter 표기는 보통 성 1개 ("戸郷") — 동성이인 가능성은 팀 hint 로 좁힘.
 */
export function findNpbPidByName(
  index: NpbPlayerIndexEntry[],
  name: string,
  teamHint?: { abbr?: string; kor?: string },
): NpbPlayerIndexEntry | null {
  const norm = name.trim();
  if (!norm) return null;
  // 1) 정확히 fullName 일치 또는 surname 일치
  let candidates = index.filter(
    (e) => e.surname === norm || e.fullName === norm,
  );
  // 2) 외국인 가타카나 부분일치 fallback
  if (candidates.length === 0) {
    candidates = index.filter(
      (e) => e.surname.startsWith(norm) || e.fullName.includes(norm),
    );
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (teamHint) {
    const byTeam = candidates.find(
      (e) =>
        (teamHint.abbr && e.teamAbbr === teamHint.abbr) ||
        (teamHint.kor && e.teamKor === teamHint.kor),
    );
    if (byTeam) return byTeam;
  }
  return candidates[0];
}

export interface NpbPitcherStats {
  pid: string;
  season: number; // 가장 최근 시즌
  team?: string; // 일본어 약칭 (예: "読売")
  g?: number; // 登板
  wins?: number;
  losses?: number;
  saves?: number;
  holds?: number; // H (스탯에서 H 가 hold)
  hp?: number; // HP
  cg?: number; // 完投
  sho?: number; // 完封勝
  wpct?: number; // 勝率
  tbf?: number; // 打者
  ip?: string; // "55.2" 식 (KBO 표기 동일)
  hits?: number; // 安打
  hra?: number; // 本塁打
  bb?: number; // 四球
  hbp?: number; // 死球
  k?: number; // 三振
  wp?: number; // 暴投
  bk?: number; // ボーク
  r?: number; // 失点
  er?: number; // 自責点
  era?: number; // 防御率
  whip?: number; // 직접 계산 (NPB 표 없음)
  k9?: number; // 직접 계산
}

function toNum(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const t = s.trim().replace(/,/g, "");
  if (t === "" || t === "-" || t === "－") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 投球回 셀의 nested table 파싱 — "8.2" 식 문자열로 평탄화.
 */
function parseInningCell(
  $cell: cheerio.Cheerio<import("domhandler").AnyNode>,
): string | undefined {
  // nested table.table_inning 안에 <th>{int}</th><td>{".1"|".2"|""}</td>
  const inner = $cell.find("table.table_inning").first();
  if (inner.length > 0) {
    const whole = inner.find("th").first().text().trim();
    const frac = inner.find("td").first().text().trim(); // ".1" / ".2" / ""
    if (!whole) return undefined;
    return frac ? `${whole}${frac}` : whole; // "8.2" or "8"
  }
  const raw = $cell.text().trim();
  return raw || undefined;
}

/**
 * 개별 투수 상세 페이지에서 가장 최근 시즌 stats 추출 + 직접 WHIP/K9 계산.
 */
export async function fetchNpbPitcherStats(pid: string): Promise<NpbPitcherStats | null> {
  const url = `${BASE}/bis/players/${pid}.html`;
  let html: string;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 12000,
      responseType: "text",
    });
    html = r.data;
  } catch (e) {
    console.warn(`[npb-official] stats #${pid} 실패:`, (e as Error).message);
    return null;
  }
  const $ = cheerio.load(html);
  const table = $("#tablefix_p").first();
  if (table.length === 0) return null;
  const headers = table.find("thead th").map((_, th) => $(th).text().trim()).get();
  const ipIdx = headers.indexOf("投球回");
  if (ipIdx < 0) return null;
  // 가장 마지막 row = 최근 시즌
  const rows = table.find("tbody tr.registerStats");
  if (rows.length === 0) return null;
  const lastRow = rows.last();
  const cells = lastRow.find("> td");
  if (cells.length !== headers.length) return null;
  const get = (label: string): string | undefined => {
    const i = headers.indexOf(label);
    if (i < 0) return undefined;
    return cells.eq(i).text().trim() || undefined;
  };
  const season = Number(get("年度")) || new Date().getUTCFullYear();
  const teamRaw = get("所属球団")?.replace(/\s+/g, "") || undefined;
  const ip = parseInningCell(cells.eq(ipIdx));
  const innings = ipToInnings(ip);
  const bb = toNum(get("四球"));
  const hits = toNum(get("安打"));
  const k = toNum(get("三振"));
  const whip =
    innings && innings > 0 && bb != null && hits != null
      ? (bb + hits) / innings
      : undefined;
  const k9 =
    innings && innings > 0 && k != null ? (k * 9) / innings : undefined;
  return {
    pid,
    season,
    team: teamRaw,
    g: toNum(get("登板")),
    wins: toNum(get("勝利")),
    losses: toNum(get("敗北")),
    saves: toNum(get("セーブ")),
    holds: toNum(get("H")),
    hp: toNum(get("HP")),
    cg: toNum(get("完投")),
    sho: toNum(get("完封勝")),
    wpct: toNum(get("勝率")),
    tbf: toNum(get("打者")),
    ip,
    hits,
    hra: toNum(get("本塁打")),
    bb,
    hbp: toNum(get("死球")),
    k,
    wp: toNum(get("暴投")),
    bk: toNum(get("ボーク")),
    r: toNum(get("失点")),
    er: toNum(get("自責点")),
    era: toNum(get("防御率")),
    whip,
    k9,
  };
}

export interface NpbPitcherProfile {
  pid: string;
  name?: string; // 한자 풀네임 "戸郷　翔征"
  kana?: string; // "とごう・しょうせい"
  team?: string; // 일본어 풀명 "読売ジャイアンツ"
  hand?: "L" | "R"; // 投 (좌투/우투)
  bats?: "L" | "R"; // 打 (좌타/우타)
  height?: string; // "187cm"
  weight?: string; // "85kg"
  birthday?: string; // "2000年4月4日"
  age?: number;
}

function calcAgeJp(birthday: string | undefined): number | undefined {
  if (!birthday) return undefined;
  const m = birthday.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) return undefined;
  const by = Number(m[1]), bm = Number(m[2]), bd = Number(m[3]);
  const t = new Date();
  let age = t.getFullYear() - by;
  const md = (t.getMonth() + 1) * 100 + t.getDate();
  const bmd = bm * 100 + bd;
  if (md < bmd) age--;
  return age;
}

function parseHandJp(s: string | undefined): "L" | "R" | undefined {
  if (!s) return undefined;
  if (s.includes("左投")) return "L";
  if (s.includes("右投")) return "R";
  return undefined;
}

function parseBatsJp(s: string | undefined): "L" | "R" | undefined {
  if (!s) return undefined;
  if (s.includes("左打")) return "L";
  if (s.includes("右打")) return "R";
  return undefined;
}

/**
 * 선수 풀 프로필. og:title 의 (소속 팀) + 본문 표.
 */
export async function fetchNpbPitcherProfile(pid: string): Promise<NpbPitcherProfile> {
  const url = `${BASE}/bis/players/${pid}.html`;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 10000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    const name = $("#pc_v_name").text().trim() || undefined;
    const kana = $("#pc_v_kana").text().trim() || undefined;
    // og:title 에서 (소속팀) 추출
    const og = $('meta[property="og:title"]').attr("content") ?? "";
    const teamMatch = og.match(/（(.+?)）/);
    const team = teamMatch ? teamMatch[1] : undefined;
    // 표: 投打 / 身長／体重 / 生年月日 (단일 표, th-td 순)
    const fields = new Map<string, string>();
    $("th").each((_, th) => {
      const label = $(th).text().trim();
      const next = $(th).next("td");
      if (next.length > 0) fields.set(label, next.text().trim());
    });
    const tt = fields.get("投打");
    const hw = fields.get("身長／体重") ?? "";
    const [h, w] = hw.split(/[／/]/).map((s) => s.trim());
    const birthday = fields.get("生年月日");
    return {
      pid,
      name,
      kana,
      team,
      hand: parseHandJp(tt),
      bats: parseBatsJp(tt),
      height: h || undefined,
      weight: w || undefined,
      birthday,
      age: calcAgeJp(birthday),
    };
  } catch {
    return { pid };
  }
}
