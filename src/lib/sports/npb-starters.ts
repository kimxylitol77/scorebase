// NPB 선발 투수 — npb.jp 공식 일정 페이지 scraping.
// URL: /games/{year}/schedule_{MM}_detail.html — 한 달치 일정 + 미래 매치엔 先発 명시.
//
// HTML 구조 (확인 완료, 2026-05 시점):
//   <tr>
//     <th>5/12（火）</th>  ← 그 날 첫 매치에만 (rowspan)
//     <td>巨人 - 広島</td>  ← 팀A - 팀B (日本어 약칭)
//     <td>岐 阜 18:00</td>  ← 구장 시간
//     <td></td>            ← 備考 (대개 빈 값)
//     <td>先発：戸郷 先発：床田</td>  ← 양 팀 선발 (한자, 띄어쓰기 1번)
//   </tr>
//
// 과거 매치 (5/10, 5/11 등) 는 td 3 에 "勝：{투수A} 敗：{투수B}" 형식 — 무시.

import axios from "axios";
import * as cheerio from "cheerio";

export interface NpbStarter {
  date: Date; // KST 0시 기준 (npb.jp 는 JST = KST 와 동일 시간대)
  teamA: string; // 일본어 약칭 (예: "巨人")
  teamB: string;
  pitcherA: string; // 일본어 (예: "戸郷")
  pitcherB: string;
}

// 일본어 약칭 → 우리 DB Team.name (한국명) 매핑. npb.ts 의 한국명과 일치.
const NPB_ABBR_TO_NAME: Record<string, string> = {
  // 센트럴 리그
  "巨人": "요미우리 자이언츠",
  "阪神": "한신 타이거스",
  "DeNA": "요코하마 디엔에이 베이스타스",
  "横浜": "요코하마 디엔에이 베이스타스",
  "広島": "히로시마 도요 카프",
  "中日": "주니치 드래곤스",
  "ヤクルト": "도쿄 야쿠르트 스왈로스",
  // 퍼시픽 리그
  "ソフトバンク": "후쿠오카 소프트뱅크 호크스",
  "日本ハム": "홋카이도 닛폰햄 파이터즈",
  "ロッテ": "지바 롯데 마린스",
  "オリックス": "오릭스 버팔로스",
  "楽天": "도호쿠 라쿠텐 골든이글스",
  "西武": "사이타마 세이부 라이온스",
};

export function npbAbbrToFullName(abbr: string): string | null {
  return NPB_ABBR_TO_NAME[abbr.trim()] ?? null;
}

function parseDateLabel(th: string, year: number): Date | null {
  // "5/12（火）" → 2026-05-12 (UTC 0시 — ISO date 비교 안정성)
  const m = th.match(/^(\d+)\/(\d+)/);
  if (!m) return null;
  return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
}

function parseMatchup(td0: string): { teamA: string; teamB: string } | null {
  // "巨人 - 広島" — 가운데 "-" (전각 또는 반각, 공백 포함)
  const m = td0.match(/^(.+?)\s*[-－]\s*(.+?)$/);
  if (!m) return null;
  return { teamA: m[1].trim(), teamB: m[2].trim() };
}

function parsePitchers(td3: string): { pitcherA: string; pitcherB: string } | null {
  // "先発：戸郷 先発：床田" — 先発： 2번 (과거 결과 row 는 "勝：" / "敗：" 라 skip)
  if (!td3.startsWith("先発")) return null;
  const parts = td3.split("先発：").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { pitcherA: parts[0], pitcherB: parts[1] };
}

/**
 * 월별 NPB 일정 페이지에서 미래 매치들의 선발 투수 추출.
 * @param yearMonth 0-padded (예: 2026, 5)
 */
export async function fetchNpbStartersForMonth(year: number, month: number): Promise<NpbStarter[]> {
  const mm = String(month).padStart(2, "0");
  const url = `https://npb.jp/games/${year}/schedule_${mm}_detail.html`;
  let html: string;
  try {
    const r = await axios.get<string>(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
      },
      timeout: 12000,
      responseType: "text",
    });
    html = r.data;
  } catch (e) {
    console.warn("[npb-starters] fetch 실패:", (e as Error).message);
    return [];
  }

  const $ = cheerio.load(html);
  const result: NpbStarter[] = [];
  let currentDate: Date | null = null;

  $("tr").each((_, tr) => {
    const thText = $(tr).find("th").first().text().trim();
    if (thText) {
      const d = parseDateLabel(thText, year);
      if (d) currentDate = d;
    }
    if (!currentDate) return;
    const tds = $(tr).find("td").map((_, td) => $(td).text().trim().replace(/\s+/g, " ")).get();
    if (tds.length < 4) return;
    const pitchers = parsePitchers(tds[3]);
    if (!pitchers) return; // 결과 row 또는 빈 row
    const matchup = parseMatchup(tds[0]);
    if (!matchup) return;
    result.push({
      date: currentDate,
      teamA: matchup.teamA,
      teamB: matchup.teamB,
      pitcherA: pitchers.pitcherA,
      pitcherB: pitchers.pitcherB,
    });
  });

  return result;
}

/**
 * 매치의 양 팀 한국 풀네임 + 날짜로 NPB 선발 투수 매칭.
 * npb.jp 의 teamA/teamB 순서는 home/away 보장 안 함 — 양 방향 매칭.
 */
export function pickNpbStartersForMatch(
  starters: NpbStarter[],
  homeName: string,
  awayName: string,
  matchDateKst: Date,
): { home: { name: string }; away: { name: string } } | null {
  // KST 매치 시각 → KST 날짜 (yyyy-mm-dd) 로 정규화. s.date 는 UTC 0시 = 그 날 KST.
  const kstMs = matchDateKst.getTime() + 9 * 3600 * 1000;
  const dateStr = new Date(kstMs).toISOString().slice(0, 10);
  for (const s of starters) {
    const sDateStr = s.date.toISOString().slice(0, 10);
    if (sDateStr !== dateStr) continue;
    const fullA = npbAbbrToFullName(s.teamA);
    const fullB = npbAbbrToFullName(s.teamB);
    if (!fullA || !fullB) continue;
    if (fullA === homeName && fullB === awayName) {
      return { home: { name: s.pitcherA }, away: { name: s.pitcherB } };
    }
    if (fullA === awayName && fullB === homeName) {
      return { home: { name: s.pitcherB }, away: { name: s.pitcherA } };
    }
  }
  return null;
}
