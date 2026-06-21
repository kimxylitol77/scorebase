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
import type { PitcherSeasonRow, HitterSeasonRow } from "./mlb-player-extras";

const BASE = "https://npb.jp";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
} as const;

// 일본어 팀 풀명 → 한국 정식명 (DB Team.name 과 일치).
// 카드 / 프로필 표시용. og:title 에서 추출되는 표기에 맞춤.
const NPB_TEAM_JP_TO_KOR: Record<string, string> = {
  読売ジャイアンツ: "요미우리 자이언츠",
  阪神タイガース: "한신 타이거스",
  横浜DeNAベイスターズ: "요코하마 디엔에이 베이스타스",
  広島東洋カープ: "히로시마 도요 카프",
  中日ドラゴンズ: "주니치 드래곤스",
  東京ヤクルトスワローズ: "도쿄 야쿠르트 스왈로스",
  福岡ソフトバンクホークス: "후쿠오카 소프트뱅크 호크스",
  北海道日本ハムファイターズ: "홋카이도 닛폰햄 파이터즈",
  千葉ロッテマリーンズ: "지바 롯데 마린스",
  "オリックス・バファローズ": "오릭스 버팔로스",
  東北楽天ゴールデンイーグルス: "도호쿠 라쿠텐 골든이글스",
  埼玉西武ライオンズ: "사이타마 세이부 라이온스",
  // 시즌 테이블 所属球団 약칭 표기 (year-by-year 팀 컬럼용)
  読売: "요미우리",
  阪神: "한신",
  中日: "주니치",
  広島: "히로시마",
  横浜: "요코하마",
  ＤｅＮＡ: "DeNA",
  ヤクルト: "야쿠르트",
  ソフトバンク: "소프트뱅크",
  日本ハム: "닛폰햄",
  ロッテ: "롯데",
  オリックス: "오릭스",
  楽天: "라쿠텐",
  西武: "세이부",
};

export function npbTeamJpToKor(jp: string | undefined): string | undefined {
  if (!jp) return undefined;
  return NPB_TEAM_JP_TO_KOR[jp.trim()] ?? jp;
}

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

export interface NpbRosterEntry {
  pid: string;
  fullName: string;
  group: "P" | "B"; // 投手=P, 捕手/内野手/外野手=B (야수)
  teamKor: string;
}

/**
 * 12팀 로스터 — rst_*.html 의 포지션 th(投手/捕手/内野手/外野手) 행을 추적해
 * 선수를 투수(P)/야수(B)로 분류. 監督/コーチ 는 제외. 주 1회 cron 으로 호출.
 */
export async function fetchNpbRoster(): Promise<NpbRosterEntry[]> {
  const result: NpbRosterEntry[] = [];
  const seen = new Set<string>();
  for (const team of NPB_TEAMS) {
    const url = `${BASE}/bis/teams/rst_${team.code}.html`;
    try {
      const r = await axios.get<string>(url, {
        headers: HEADERS,
        timeout: 12000,
        responseType: "text",
      });
      const $ = cheerio.load(r.data);
      $("table").each((_, t) => {
        let group: "P" | "B" | null = null;
        $(t)
          .find("tr")
          .each((_, tr) => {
            const thText = $(tr)
              .find("th")
              .map((_, e) => $(e).text().trim())
              .get()
              .join("");
            if (/投手/.test(thText)) group = "P";
            else if (/捕手|内野手|外野手/.test(thText)) group = "B";
            else if (/監督|コーチ/.test(thText)) group = null;
            const a = $(tr).find("a[href*='/bis/players/']").first();
            const g = group;
            if (!a.length || !g) return;
            // 등번호(첫 td) 3자리 이상 = 育成선수 → 제외 (支配下 1군 로스터만).
            // 支配下=1~99(1~2자리), 育成=0XX/1XX/2XX(3자리). rst probe 2026-06 확인.
            const shirtNo = $(tr).find("td").first().text().trim();
            if (shirtNo.length >= 3) return;
            const m = ($(a).attr("href") ?? "").match(
              /\/bis\/players\/(\d{6,9})\.html/,
            );
            if (!m) return;
            const pid = m[1];
            const fullName = $(a).text().trim();
            if (!fullName || seen.has(pid)) return;
            seen.add(pid);
            result.push({ pid, fullName, group: g, teamKor: team.korName });
          });
      });
    } catch (e) {
      console.warn(`[npb-official] roster ${team.code} 실패:`, (e as Error).message);
    }
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
  // 2) starter 가 풀네임 형태 ("髙橋宏") — surname 으로 시작 + 다음 글자가 이름 첫 글자
  if (candidates.length === 0) {
    candidates = index.filter(
      (e) => e.surname.length >= 2 && norm.startsWith(e.surname) &&
        e.fullName.replace(/[\s　]+/g, "").startsWith(norm.slice(0, Math.min(norm.length, e.fullName.replace(/[\s　]+/g, "").length))),
    );
  }
  // 3) 외국인 가타카나 부분일치 fallback
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
  kana?: string; // 히라가나 풀네임 ("とごう・しょうせい") — starter 자동 음역 fallback
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
 * Raw — 페이지에서는 unstable_cache wrapper (npb-cache.ts) 통해 호출.
 * cron 잡은 직접 호출 가능.
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
  const kana = $("li#pc_v_kana").text().trim() || undefined;
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
    kana,
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
 * 선수 풀 프로필. li#pc_v_name 등 4종 li + og:title (팀명) + 본문 표.
 *
 * 주의: 페이지에 `<div id="pc_v_name">` 컨테이너와 `<li id="pc_v_name">` 가
 * 같은 id 를 공유함. cheerio 의 `$("#pc_v_name")` 는 div 까지 매칭되어
 * 텍스트가 "11 中日ドラゴンズ 中西　聖輝 なかにし..." 통째로 들어옴.
 * → `li#pc_v_name` 로 정확히 한정.
 *
 * Raw — 페이지에서는 unstable_cache wrapper (npb-cache.ts) 통해 호출.
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
    const name = $("li#pc_v_name").text().trim() || undefined;
    const kana = $("li#pc_v_kana").text().trim() || undefined;
    // 팀명 — og:title 의 (소속팀) 우선, 못 찾으면 li#pc_v_team
    const og = $('meta[property="og:title"]').attr("content") ?? "";
    const teamMatch = og.match(/（(.+?)）/);
    const team =
      (teamMatch && teamMatch[1]) ||
      $("li#pc_v_team").text().trim() ||
      undefined;
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

/* ============================================================
 * 타자 (Hitter) — #tablefix_b · pid 페이지 동일
 * ==========================================================*/

export interface NpbHitterStats {
  pid: string;
  season: number;
  team?: string;
  g?: number; // 試合
  pa?: number; // 打席
  ab?: number; // 打数
  runs?: number; // 得点
  hits?: number; // 安打
  d2b?: number; // 二塁打
  d3b?: number; // 三塁打
  hr?: number; // 本塁打
  tb?: number; // 塁打
  rbi?: number; // 打点
  sb?: number; // 盗塁
  cs?: number; // 盗塁刺
  sh?: number; // 犠打
  sf?: number; // 犠飛
  bb?: number; // 四球
  ibb?: number; // 敬遠 / 故意四球
  hbp?: number; // 死球
  so?: number; // 三振
  gdp?: number; // 併殺打
  avg?: number; // 打率
  slg?: number; // 長打率
  obp?: number; // 出塁率
  ops?: number;
}

export async function fetchNpbHitterStats(pid: string): Promise<NpbHitterStats | null> {
  const url = `${BASE}/bis/players/${pid}.html`;
  try {
    const r = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 12000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    const table = $("#tablefix_b").first();
    if (table.length === 0) return null;
    const headers = table.find("thead th").map((_, th) => $(th).text().trim()).get();
    if (headers.length === 0) {
      // thead 가 없으면 첫 row 의 th 로 fallback
      table
        .find("tr").first().find("th")
        .each((_, th) => {
          headers.push($(th).text().trim());
        });
    }
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
    const team = get("所属球団")?.replace(/\s+/g, "");
    return {
      pid,
      season,
      team,
      g: toNum(get("試合")),
      pa: toNum(get("打席")),
      ab: toNum(get("打数")),
      runs: toNum(get("得点")),
      hits: toNum(get("安打")),
      d2b: toNum(get("二塁打")),
      d3b: toNum(get("三塁打")),
      hr: toNum(get("本塁打")),
      tb: toNum(get("塁打")),
      rbi: toNum(get("打点")),
      sb: toNum(get("盗塁")),
      cs: toNum(get("盗塁刺")),
      sh: toNum(get("犠打")),
      sf: toNum(get("犠飛")),
      bb: toNum(get("四球")),
      ibb: toNum(get("敬遠")) ?? toNum(get("故意四球")) ?? toNum(get("故意四")),
      hbp: toNum(get("死球")),
      so: toNum(get("三振")),
      gdp: toNum(get("併殺打")),
      avg: toNum(get("打率")),
      slg: toNum(get("長打率")),
      obp: toNum(get("出塁率")),
      ops: toNum(get("OPS")),
    };
  } catch {
    return null;
  }
}

/* ============================================================
 * 연도별(year-by-year) + 통산 — 같은 player 페이지가 곧 연도별 성적표.
 * 기존 fetchNpb*Stats 는 최근 1행만 쓰므로, 전체 행을 PitcherSeasonRow/
 * HitterSeasonRow 로 변환하는 별도 함수. (스플릿은 npb.jp 미제공.)
 * ==========================================================*/

const npbWhip = (h?: number, bb?: number, ip?: string): string | undefined => {
  const innings = ipToInnings(ip);
  if (!innings || innings <= 0 || h == null || bb == null) return undefined;
  return ((h + bb) / innings).toFixed(2);
};
const npbK9 = (k?: number, ip?: string): string | undefined => {
  const innings = ipToInnings(ip);
  if (!innings || innings <= 0 || k == null) return undefined;
  return ((k * 9) / innings).toFixed(1);
};

export async function fetchNpbPitcherYearlyRaw(
  pid: string,
): Promise<{ seasons: PitcherSeasonRow[]; career: PitcherSeasonRow | null }> {
  const url = `${BASE}/bis/players/${pid}.html`;
  let html: string;
  try {
    const r = await axios.get<string>(url, { headers: HEADERS, timeout: 12000, responseType: "text" });
    html = r.data;
  } catch {
    return { seasons: [], career: null };
  }
  const $ = cheerio.load(html);
  const table = $("#tablefix_p").first();
  if (table.length === 0) return { seasons: [], career: null };
  const headers = table.find("thead th").map((_, th) => $(th).text().trim()).get();
  if (headers.length === 0) return { seasons: [], career: null };
  const ipIdx = headers.indexOf("投球回");
  const seasons: PitcherSeasonRow[] = [];
  let career: PitcherSeasonRow | null = null;
  table.find("tbody tr.registerStats").each((_, tr) => {
    const cells = $(tr).find("> td");
    if (cells.length !== headers.length) return;
    const at = (k: string): string | undefined => {
      const i = headers.indexOf(k);
      return i >= 0 ? cells.eq(i).text().trim() || undefined : undefined;
    };
    const yr = at("年度") ?? "";
    const ip = ipIdx >= 0 ? parseInningCell(cells.eq(ipIdx)) : undefined;
    const h = toNum(at("安打"));
    const bb = toNum(at("四球"));
    const so = toNum(at("三振"));
    const row: PitcherSeasonRow = {
      season: yr,
      teamLabel: npbTeamJpToKor((at("所属球団") ?? "").replace(/\s+/g, "")) ?? "",
      g: toNum(at("登板")),
      w: toNum(at("勝利")),
      l: toNum(at("敗北")),
      sv: toNum(at("セーブ")),
      ip,
      era: at("防御率"),
      whip: npbWhip(h, bb, ip),
      so,
      bb,
      hr: toNum(at("本塁打")),
      k9: npbK9(so, ip),
    };
    if (yr === "通算") career = row;
    else if (/^\d{4}$/.test(yr)) seasons.push(row);
  });
  return { seasons, career };
}

export async function fetchNpbHitterYearlyRaw(
  pid: string,
): Promise<{ seasons: HitterSeasonRow[]; career: HitterSeasonRow | null }> {
  const url = `${BASE}/bis/players/${pid}.html`;
  let html: string;
  try {
    const r = await axios.get<string>(url, { headers: HEADERS, timeout: 12000, responseType: "text" });
    html = r.data;
  } catch {
    return { seasons: [], career: null };
  }
  const $ = cheerio.load(html);
  const table = $("#tablefix_b").first();
  if (table.length === 0) return { seasons: [], career: null };
  const headers = table.find("thead th").map((_, th) => $(th).text().trim()).get();
  if (headers.length === 0) return { seasons: [], career: null };
  const seasons: HitterSeasonRow[] = [];
  let career: HitterSeasonRow | null = null;
  table.find("tbody tr.registerStats").each((_, tr) => {
    const cells = $(tr).find("> td");
    if (cells.length !== headers.length) return;
    const at = (k: string): string | undefined => {
      const i = headers.indexOf(k);
      return i >= 0 ? cells.eq(i).text().trim() || undefined : undefined;
    };
    const yr = at("年度") ?? "";
    const obp = at("出塁率");
    const slg = at("長打率");
    const ops =
      obp && slg && Number.isFinite(parseFloat(obp)) && Number.isFinite(parseFloat(slg))
        ? (parseFloat(obp) + parseFloat(slg)).toFixed(3)
        : undefined;
    const row: HitterSeasonRow = {
      season: yr,
      teamLabel: npbTeamJpToKor((at("所属球団") ?? "").replace(/\s+/g, "")) ?? "",
      g: toNum(at("試合")),
      pa: toNum(at("打席")),
      avg: at("打率"),
      obp,
      slg,
      ops,
      hr: toNum(at("本塁打")),
      rbi: toNum(at("打点")),
      r: toNum(at("得点")),
      h: toNum(at("安打")),
      bb: toNum(at("四球")),
      so: toNum(at("三振")),
      sb: toNum(at("盗塁")),
    };
    if (yr === "通算") career = row;
    else if (/^\d{4}$/.test(yr)) seasons.push(row);
  });
  return { seasons, career };
}

/** NPB player photo URL — pid 매칭된 선수의 npb.jp profile page 에서 추출. */
export async function fetchNpbPhotoUrl(pid: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${BASE}/bis/players/${pid}.html`, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) return undefined;
    const html = await r.text();
    const m = html.match(/<img[^>]*src="(https?:\/\/p\.npb\.jp\/players_photo\/[^"]+)"/i);
    return m?.[1];
  } catch {
    return undefined;
  }
}
