// NPB 출장선수 등록말소 — npb.jp/announcement/roster/roster_MMDD.html (일자별 페이지)
//
// 일본 KBO 부상자 명단 같은 공식 시스템은 부재.
// 대안: "출장선수 登録抹消" = 1군에서 제외 (부상·강등 모두 포함).
// 지난 N일 일자별 페이지를 순회해 누적 list 생성.
//
// 일자별 페이지 구조 (확인 완료 2026-05):
//   <h5>出場選手登録抹消</h5> 아래 <table> rows:
//     <td class="team">{팀 일본어 풀명}</td>
//     <td class="pos">{投手|捕手|内野手|外野手}</td>
//     <td class="num">{등번호}</td>
//     <td><a href="/bis/players/{pid}.html">{한자 풀네임}</a></td>
//
// 시기 같은 페이지에 "出場選手登録" (1군 등록 추가) 도 있어서, 이걸로 "복귀" 판정 가능.

import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://npb.jp";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
} as const;

// 일본어 팀 풀명 → 한국 정식명 (DB Team.name 과 일치)
// JS 식별자 제약상 ・ 등 특수문자 포함 키는 문자열 리터럴로 작성.
const JP_TEAM_TO_KOR: Record<string, string> = {
  "読売ジャイアンツ": "요미우리 자이언츠",
  "阪神タイガース": "한신 타이거스",
  "横浜DeNAベイスターズ": "요코하마 디엔에이 베이스타스",
  "広島東洋カープ": "히로시마 도요 카프",
  "中日ドラゴンズ": "주니치 드래곤스",
  "東京ヤクルトスワローズ": "도쿄 야쿠르트 스왈로스",
  "福岡ソフトバンクホークス": "후쿠오카 소프트뱅크 호크스",
  "北海道日本ハムファイターズ": "홋카이도 닛폰햄 파이터즈",
  "千葉ロッテマリーンズ": "지바 롯데 마린스",
  "オリックス・バファローズ": "오릭스 버팔로스",
  "東北楽天ゴールデンイーグルス": "도호쿠 라쿠텐 골든이글스",
  "埼玉西武ライオンズ": "사이타마 세이부 라이온스",
};

export interface NpbInjuryEntry {
  date: string; // "2026-05-12" (해당 발표일)
  /** 'demote' = 1군 등록말소 (부상/강등), 'promote' = 1군 등록 (복귀) */
  kind: "demote" | "promote";
  teamJp: string;
  teamKor: string;
  position: string; // "投手" 등 일본어
  positionKo: string; // "투수" 등 한국어
  number: string; // 등번호
  pid?: string; // npb.jp 8자리
  playerName: string; // 한자 풀네임 "戸郷　翔征"
}

const POS_KO: Record<string, string> = {
  投手: "투수",
  捕手: "포수",
  内野手: "내야수",
  外野手: "외야수",
};

function parseRosterPage(html: string, dateStr: string): NpbInjuryEntry[] {
  const $ = cheerio.load(html);
  const result: NpbInjuryEntry[] = [];
  // 페이지 안에 <h5>出場選手登録</h5> 또는 <h5>出場選手登録抹消</h5> 마커 다음 table
  $("h5").each((_, h5) => {
    const label = $(h5).text().trim();
    const kind: "demote" | "promote" | null =
      label === "出場選手登録抹消"
        ? "demote"
        : label === "出場選手登録"
          ? "promote"
          : null;
    if (!kind) return;
    // 같은 .half_inner_wrap (h5 의 부모 형제) 안의 table tr 추출
    const wrap = $(h5).closest(".half_inner_wrap");
    const trs = wrap.length > 0 ? wrap.find("table tr") : $(h5).nextAll("div").first().find("table tr");
    trs.each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 4) return;
      const teamJp = $(tds[0]).text().trim();
      const positionJp = $(tds[1]).text().trim();
      const number = $(tds[2]).text().trim();
      const link = $(tds[3]).find("a").first();
      const pidMatch = (link.attr("href") ?? "").match(/\/bis\/players\/(\d+)\.html/);
      const playerName = link.text().trim() || $(tds[3]).text().trim();
      if (!teamJp || !playerName) return;
      result.push({
        date: dateStr,
        kind,
        teamJp,
        teamKor: JP_TEAM_TO_KOR[teamJp] ?? teamJp,
        position: positionJp,
        positionKo: POS_KO[positionJp] ?? positionJp,
        number,
        pid: pidMatch ? pidMatch[1] : undefined,
        playerName,
      });
    });
  });
  return result;
}

/**
 * 지난 N일 NPB roster 등록말소 / 등록 누적. 동일 선수가 demote 후 promote 시
 * "활성 결장자" 에서 제거.
 */
export async function fetchNpbInjuries(daysBack: number = 30): Promise<NpbInjuryEntry[]> {
  const today = new Date();
  const collected: NpbInjuryEntry[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(today.getTime() - i * 86400 * 1000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const url =
      i === 0
        ? `${BASE}/announcement/roster/` // 오늘은 index (최신 일자)
        : `${BASE}/announcement/roster/roster_${mm}${dd}.html`;
    try {
      const r = await axios.get<string>(url, {
        headers: HEADERS,
        timeout: 10000,
        responseType: "text",
        validateStatus: (s) => s < 500,
      });
      if (r.status !== 200) continue;
      const items = parseRosterPage(r.data, dateStr);
      collected.push(...items);
    } catch {
      // 404 또는 timeout 일자는 skip (해당일 등록·말소 없음)
    }
    // burst 회피
    await new Promise((r) => setTimeout(r, 200));
  }
  return collected;
}

/**
 * 누적 list 에서 "현재 결장 중" 선수만 — demote 이후 promote 되지 않은 선수.
 * 같은 선수 여러 demote 가 있을 수 있으니 최신 demote 만 keep.
 */
export function activeNpbInjuries(all: NpbInjuryEntry[]): NpbInjuryEntry[] {
  // 일자 desc 정렬 (이미 호출자가 그렇게 모음)
  const sorted = [...all].sort((a, b) => b.date.localeCompare(a.date));
  const status = new Map<string, NpbInjuryEntry>(); // playerKey → 최신 demote (있으면)
  const promoted = new Set<string>();
  // 오래된 → 최신 순으로 traverse: demote 이후 같은 선수 promote 가 나오면 status 제거.
  for (const it of [...sorted].reverse()) {
    const key = `${it.teamJp}|${it.playerName}`;
    if (it.kind === "demote") {
      status.set(key, it);
      promoted.delete(key);
    } else {
      // promote
      status.delete(key);
      promoted.add(key);
    }
  }
  return [...status.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function getTeamNpbInjuries(
  active: NpbInjuryEntry[],
  teamKor: string,
): NpbInjuryEntry[] {
  return active.filter((x) => x.teamKor === teamKor);
}
