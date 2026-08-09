// npb.jp 박스스코어 스크래핑 — 일정 페이지에서 경기 링크 수집 + box.html 타격/투구 라인 파싱.
// NpbPlayerGameLog 수집(collect-npb-player-logs.ts)의 소스 계층. 2016~ 시즌 공통 구조:
// 테이블 id/클래스가 연도별로 달라 thead 텍스트(打数/投球回)로 분류하고, h4(팀명) 문서순으로 팀을 연계한다.
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

const BASE = "https://npb.jp";
// npb.jp 는 기본 curl UA 를 403 처리 — npb-official.ts 와 동일한 브라우저 UA 필수.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
} as const;

// 1군 12구단 코드 (URL {home}-{away}-{회차}) — 올스타(cl/pl) 등 비정규 코드는 제외.
// "bs" = 오릭스의 2016~2018 구코드 (2019 부터 "b") — 빼먹으면 그 시즌 오릭스 경기가 통째로 빠진다.
const TEAM_CODES = new Set(["g", "t", "db", "c", "d", "s", "h", "f", "m", "b", "bs", "e", "l"]);

// box.html h4 의 일본어 풀명 → 한국어 약칭 (표 셀 표시용).
const NPB_TEAM_FULL_TO_SHORT_KO: Record<string, string> = {
  読売ジャイアンツ: "요미우리",
  阪神タイガース: "한신",
  横浜DeNAベイスターズ: "DeNA",
  広島東洋カープ: "히로시마",
  中日ドラゴンズ: "주니치",
  東京ヤクルトスワローズ: "야쿠르트",
  福岡ソフトバンクホークス: "소프트뱅크",
  北海道日本ハムファイターズ: "닛폰햄",
  千葉ロッテマリーンズ: "롯데",
  "オリックス・バファローズ": "오릭스",
  東北楽天ゴールデンイーグルス: "라쿠텐",
  埼玉西武ライオンズ: "세이부",
};

export interface NpbGameLink {
  /** "/scores/2026/0801/g-db-15/" */
  path: string;
  /** "0801" */
  mmdd: string;
}

export interface NpbBoxPitcherLine {
  pid: string;
  name: string;
  team: string; // 한국어 약칭
  opponent: string;
  result: "W" | "L" | "S" | "H" | null;
  roleDetail: "선발" | "구원";
  ip: string | null;
  pitches: number | null;
  tbf: number | null;
  h: number | null;
  hr: number | null;
  bb: number | null;
  hbp: number | null;
  so: number | null;
  r: number | null;
  er: number | null;
}

export interface NpbBoxHitterLine {
  pid: string;
  name: string;
  team: string;
  opponent: string;
  ab: number | null;
  r: number | null;
  h: number | null;
  rbi: number | null;
  sb: number | null;
  d2b: number;
  d3b: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
}

export interface NpbBoxScore {
  pitchers: NpbBoxPitcherLine[];
  hitters: NpbBoxHitterLine[];
}

// 404(미게시·취소)는 즉시 null, 그 외 실패는 1회 재시도 — 일정 페이지 한 달치가 조용히 빠지는 것 방지.
async function fetchHtml(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;
      if (res.ok) return res.text();
    } catch {
      // 네트워크 오류 — 재시도
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** 월별 일정 페이지에서 1군 경기 링크 추출. 페이지 없거나(404) 경기 없으면 []. */
export async function fetchNpbScheduleLinks(season: number, month: number): Promise<NpbGameLink[]> {
  const mm = String(month).padStart(2, "0");
  const html = await fetchHtml(`${BASE}/games/${season}/schedule_${mm}_detail.html`);
  if (!html) return [];
  const seen = new Set<string>();
  const out: NpbGameLink[] = [];
  const re = new RegExp(`href="(/scores/${season}/(\\d{4})/([a-z0-9]+)-([a-z0-9]+)-\\d+/)"`, "g");
  for (const m of html.matchAll(re)) {
    const [, path, mmdd, homeCode, awayCode] = m;
    if (seen.has(path)) continue;
    seen.add(path);
    if (!TEAM_CODES.has(homeCode) || !TEAM_CODES.has(awayCode)) continue;
    out.push({ path, mmdd });
  }
  // 날짜 → 경로 순 (더블헤더 seq 결정이 결정적이도록)
  out.sort((a, b) => (a.mmdd === b.mmdd ? a.path.localeCompare(b.path) : a.mmdd.localeCompare(b.mmdd)));
  return out;
}

const toInt = (s: string): number | null => {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) ? n : null;
};

// 이름 앞 좌타/양타 마커 방어 스트립 (메모리 npb-handedness-marker-trap — 박스에는 없지만 재발 방어).
const stripMarkers = (s: string) => s.replace(/^[*+＊＋]+\s*/, "").replace(/[\s　]+/g, " ").trim();

/** 이닝별 타석결과 셀(한자 표기)에서 파생 스탯 집계. 공백·타점 원문자(①~⑳) 제거 후 판정. */
function tallyInningCells(cells: string[]) {
  let d2b = 0, d3b = 0, hr = 0, bb = 0, hbp = 0, so = 0;
  for (const raw of cells) {
    const c = raw.replace(/[\s　]/g, "").replace(/[①-⑳]/g, "");
    if (!c || c === "-") continue;
    if (c === "三振" || c === "振逃") so++;
    else if (c === "四球" || c === "敬遠") bb++;
    else if (c === "死球") hbp++;
    else if (c.endsWith("本")) hr++;
    else if (c.endsWith("三")) d3b++;
    else if (c.endsWith("二")) d2b++;
  }
  return { d2b, d3b, hr, bb, hbp, so };
}

/**
 * box.html 파싱. 경기 미종료·박스 미게시 등으로 양 팀 타격표가 없으면 null.
 * 팀 연계: h4(팀명)·table 을 문서순으로 걸으며 "마지막 h4 = 현재 팀" — 연도별 마크업 차이에 무관.
 */
export async function fetchNpbBoxScore(gamePath: string): Promise<NpbBoxScore | null> {
  const html = await fetchHtml(`${BASE}${gamePath}box.html`);
  if (!html) return null;
  const $ = cheerio.load(html);

  const teamsJp: string[] = [];
  const perTeam: { team: string; bat?: cheerio.Cheerio<AnyNode>; pitch?: cheerio.Cheerio<AnyNode> }[] = [];
  let cur: (typeof perTeam)[number] | null = null;

  $("h4, table").each((_, el) => {
    const $el = $(el);
    if (el.type === "tag" && el.name === "h4") {
      const jp = $el.text().trim();
      const ko = NPB_TEAM_FULL_TO_SHORT_KO[jp];
      if (ko) {
        teamsJp.push(jp);
        cur = { team: ko };
        perTeam.push(cur);
      }
      return;
    }
    if (!cur || $el.hasClass("table_inning")) return;
    const heads = $el.find("thead th").map((_, th) => $(th).text().trim()).get();
    if (heads.includes("打数")) cur.bat = $el;
    else if (heads.includes("投球回")) cur.pitch = $el;
  });

  if (perTeam.length !== 2 || !perTeam[0].bat || !perTeam[1].bat) return null;

  const pitchers: NpbBoxPitcherLine[] = [];
  const hitters: NpbBoxHitterLine[] = [];

  for (let side = 0; side < 2; side++) {
    const { team, bat, pitch } = perTeam[side];
    const opponent = perTeam[1 - side].team;

    bat?.find("> tbody > tr").each((_, tr) => {
      const tds = $(tr).children("td");
      const a = $(tr).find('a[href*="/bis/players/"]').first();
      const pid = (a.attr("href") ?? "").match(/(\d+)\.html/)?.[1];
      if (!pid) return; // 합계 행 등
      const innings = tds.slice(8).map((_, td) => $(td).text()).get();
      hitters.push({
        pid,
        name: stripMarkers(a.text()),
        team,
        opponent,
        ab: toInt(tds.eq(3).text()),
        r: toInt(tds.eq(4).text()),
        h: toInt(tds.eq(5).text()),
        rbi: toInt(tds.eq(6).text()),
        sb: toInt(tds.eq(7).text()),
        ...tallyInningCells(innings),
      });
    });

    let pitcherIdx = 0;
    pitch?.find("> tbody > tr").each((_, tr) => {
      const tds = $(tr).children("td");
      const a = $(tr).find('a[href*="/bis/players/"]').first();
      const pid = (a.attr("href") ?? "").match(/(\d+)\.html/)?.[1];
      if (!pid) return;
      const marker = tds.eq(0).text().trim();
      const result =
        marker === "○" ? "W" : marker === "●" ? "L" : marker === "S" ? "S" : marker === "H" ? "H" : null;
      // 投球回 — 중첩 table_inning: th=정수부, td=분수부.
      const ipInt = tds.eq(4).find("table.table_inning th").text().trim();
      const ipFrac = tds.eq(4).find("table.table_inning td").text().replace(/[\s 　]/g, "");
      // 분수는 ".1"(=1/3)·".2"(=2/3) 소수 표기 실측 — 정수부에 붙여 "7.1" 로. "+"는 아웃 없이 강판 표식.
      const frac = ipFrac && ipFrac !== "+" ? ipFrac : "";
      const ip = ipInt || frac
        ? frac.startsWith(".") ? `${ipInt || "0"}${frac}` : [ipInt, frac].filter(Boolean).join(" ")
        : null;
      pitchers.push({
        pid,
        name: stripMarkers(a.text()),
        team,
        opponent,
        result,
        roleDetail: pitcherIdx === 0 ? "선발" : "구원",
        ip,
        pitches: toInt(tds.eq(2).text()),
        tbf: toInt(tds.eq(3).text()),
        h: toInt(tds.eq(5).text()),
        hr: toInt(tds.eq(6).text()),
        bb: toInt(tds.eq(7).text()),
        hbp: toInt(tds.eq(8).text()),
        so: toInt(tds.eq(9).text()),
        r: toInt(tds.eq(12).text()),
        er: toInt(tds.eq(13).text()),
      });
      pitcherIdx++;
    });
  }

  return { pitchers, hitters };
}
