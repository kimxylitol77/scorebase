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
import {
  fetchNpbPlayerIndex,
  fetchNpbPitcherStats,
  findNpbPidByName,
  type NpbPitcherStats,
  type NpbPlayerIndexEntry,
} from "./npb-official";
import { kanaToKorean } from "./kana-to-korean";

export interface NpbStarterPitcher {
  name: string; // 한글 음역 (UI 표시용)
  nameJp: string; // 원어 한자/가타카나 (npb.jp 매칭용)
  pid?: string; // npb.jp 8자리 pid (enrich 시 채워짐)
  stats?: {
    era?: number;
    whip?: number;
    k9?: number;
    wins?: number;
    losses?: number;
    ip?: string;
    k?: number;
    bb?: number;
    hra?: number;
  };
}

export interface NpbStarter {
  date: Date; // KST 0시 기준 (npb.jp 는 JST = KST 와 동일 시간대)
  teamA: string; // 일본어 약칭 (예: "巨人")
  teamB: string;
  pitcherA: NpbStarterPitcher;
  pitcherB: NpbStarterPitcher;
}

/**
 * 일본 선수명 한글 음역 매핑 — NPB 선발 투수 자주 등장 선수.
 * 매핑 없으면 원어 한자/가타카나 그대로 (모델이 본문에서 음역 시도).
 * 한국 미디어 관행 표기 우선.
 */
const PITCHER_NAME_KO: Record<string, string> = {
  // 5/12, 5/13 현재 등판 선수
  "松本晴": "마쓰모토 하루",
  "渡邉": "와타나베",
  "戸郷": "도고",
  "床田": "토코다",
  "吉村": "요시무라",
  "西勇": "니시",
  "東": "아즈마",
  "金丸": "카나마루",
  "荘司": "쇼지",
  "九里": "쿠리",
  "伊藤": "이토",
  "ジャクソン": "잭슨",
  "則本": "노리모토",
  "玉村": "타마무라",
  "山野": "야마노",
  "髙橋": "타카하시",
  "島田": "시마다",
  "中西": "나카니시",
  "小島": "코지마",
  "福島": "후쿠시마",
  "藤原": "후지와라",
  "髙橋光成": "타카하시 코나",
  // 자주 등판하는 다른 에이스/주축 (운영 중 보강 가능)
  "山本": "야마모토",
  "山本由伸": "야마모토 요시노부",
  "千賀": "센가",
  "佐々木": "사사키",
  "山田": "야마다",
  "今永": "이마나가",
  "森下": "모리시타",
  "大瀬良": "오세라",
  "西": "니시",
  "石川": "이시카와",
  "サイスニード": "사이스니드",
  "メルセデス": "메르세데스",
  "アンダーソン": "앤더슨",
  "バウマン": "바우만",
  "オースティン": "오스틴",
  "ボー": "보",
  "宮城": "미야기",
  "山﨑福": "야마자키 후쿠",
  "山﨑": "야마자키",
  "上沢": "카미사와",
  "種市": "타네이치",
  "佐藤": "사토",
  "美馬": "미마",
  "石井": "이시이",
  "高橋": "타카하시",
  "今井": "이마이",
  "平良": "타이라",
  "森": "모리",
  "村上": "무라카미",
  "和田": "와다",
  "石川柊太": "이시카와 슈타",
  "東浜": "히가시하마",
  "笠谷": "카사야",
  "有原": "아리하라",
  "モイネロ": "모이넬로",
  // 5/14 이후 등판 보강 (사용자 매치 페이지 누락 발견)
  "細野": "호소노",
  "西野": "니시노",
  "細野晴稀": "호소노 하루키",
  "西野勇士": "니시노 유우지",
  "入江": "이리에",
  // 외국인 (카타카나)
  "ウレーニャ": "우레냐",
  "ジェリー": "제리",
  "マラー": "마라",
  // 5/15 라이브 스코어 누락 보강
  "早川": "하야카와",
  "髙島": "타카시마",
  "井上": "이노우에",
  "達": "타쓰",
  "ロング": "롱",
};

/**
 * 일본어 선발 투수명 → 한글 음역.
 *   1) PITCHER_NAME_KO 직접 매핑 (한자 성 우선)
 *   2) 카타카나만 있는 외국인은 kanaToKorean 자동 음역
 *   3) 그래도 일본어 잔존하면 원어 그대로 (UI 에서 fallback 표시용)
 */
export function jpPitcherToKorean(name: string): string {
  const trimmed = name.trim();
  const direct = PITCHER_NAME_KO[trimmed];
  if (direct) return direct;
  // 카타카나/히라가나만 있으면 자동 음역 (외국인 선수)
  if (/^[぀-ゟ゠-ヿー・\s]+$/.test(trimmed)) {
    const ko = kanaToKorean(trimmed);
    if (ko && ko !== trimmed) return ko;
  }
  return trimmed;
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
      pitcherA: {
        name: jpPitcherToKorean(pitchers.pitcherA),
        nameJp: pitchers.pitcherA,
      },
      pitcherB: {
        name: jpPitcherToKorean(pitchers.pitcherB),
        nameJp: pitchers.pitcherB,
      },
    });
  });

  return result;
}

/**
 * 위 starters 에 npb.jp 의 pid + 시즌 stats 보강.
 * roster 한 번 fetch (12팀 ~수백명) 후 각 선발 stats fetch.
 * 한자 성으로 인덱스 매칭 — 동성이인 시 팀 hint 우선.
 */
export async function enrichNpbStartersWithStats(
  starters: NpbStarter[],
): Promise<NpbStarter[]> {
  if (starters.length === 0) return starters;
  let index: NpbPlayerIndexEntry[];
  try {
    index = await fetchNpbPlayerIndex();
  } catch (e) {
    console.warn("[npb-starters] roster index 실패:", (e as Error).message);
    return starters;
  }
  if (index.length === 0) return starters;

  // 같은 매치에 등장하는 선발 stats 캐시 (중복 fetch 회피)
  const statsCache = new Map<string, NpbPitcherStats | null>();
  const fetchStatsOnce = async (pid: string): Promise<NpbPitcherStats | null> => {
    if (statsCache.has(pid)) return statsCache.get(pid) ?? null;
    const s = await fetchNpbPitcherStats(pid);
    statsCache.set(pid, s);
    return s;
  };

  const enrichOne = async (
    p: NpbStarterPitcher,
    teamAbbr: string,
  ): Promise<NpbStarterPitcher> => {
    const hit = findNpbPidByName(index, p.nameJp, { abbr: teamAbbr });
    if (!hit) return p;
    const st = await fetchStatsOnce(hit.pid);
    if (!st) return { ...p, pid: hit.pid };
    return {
      ...p,
      pid: hit.pid,
      stats: {
        era: st.era,
        whip: st.whip,
        k9: st.k9,
        wins: st.wins,
        losses: st.losses,
        ip: st.ip,
        k: st.k,
        bb: st.bb,
        hra: st.hra,
      },
    };
  };

  const enriched: NpbStarter[] = [];
  for (const s of starters) {
    try {
      const a = await enrichOne(s.pitcherA, s.teamA);
      await new Promise((r) => setTimeout(r, 350));
      const b = await enrichOne(s.pitcherB, s.teamB);
      enriched.push({ ...s, pitcherA: a, pitcherB: b });
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      console.warn(`[npb-starters] enrich 실패 ${s.teamA}-${s.teamB}:`, (e as Error).message);
      enriched.push(s);
    }
  }
  return enriched;
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
): { home: NpbStarterPitcher; away: NpbStarterPitcher } | null {
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
      return { home: s.pitcherA, away: s.pitcherB };
    }
    if (fullA === awayName && fullB === homeName) {
      return { home: s.pitcherB, away: s.pitcherA };
    }
  }
  return null;
}
