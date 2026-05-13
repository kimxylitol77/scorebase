// KBO 공식 부상자 명단 — koreabaseball.com/ws/Player.asmx/GetTradeList
//
// POST /ws/Player.asmx/GetTradeList
//   x-www-form-urlencoded:
//     seasonId={yyyy}, monthId=0, teamName=, searchIf=, pageNo=1, listCount=200
//     bdSc=18 → 부상자 명단
//     bdSc=21 → 치료·재활명단
//
// 응답: { rows: [{ row: [{ Text }, ...] }, ...] }
//   row 5칸: [등록일, 항목명, 팀명(약칭), "선수명(포지션)", 기간(예: "10일")]

import axios from "axios";

const URL = "https://www.koreabaseball.com/ws/Player.asmx/GetTradeList";

const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://www.koreabaseball.com/Player/Trade.aspx",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
} as const;

export interface KboInjury {
  date: string; // "2026-05-12"
  type: "부상자 명단" | "치료·재활명단";
  teamAbbr: string; // "키움"
  teamFullName: string; // "키움 히어로즈" (변환됨)
  playerName: string; // "하영민"
  position: string; // "투수"
  duration: string; // "10일"
}

interface ApiCell {
  Text: string;
}
interface ApiRow {
  row: ApiCell[];
}
interface ApiResp {
  rows?: ApiRow[];
  totalCnt?: number;
  code?: string;
}

// koreabaseball.com 약칭 → 한국 정식명 (DB Team.name 과 일치)
const ABBR_TO_FULL: Record<string, string> = {
  삼성: "삼성 라이온즈",
  LG: "LG 트윈스",
  한화: "한화 이글스",
  키움: "키움 히어로즈",
  SSG: "SSG 랜더스",
  KT: "KT 위즈",
  두산: "두산 베어스",
  KIA: "KIA 타이거즈",
  기아: "KIA 타이거즈",
  NC: "NC 다이노스",
  롯데: "롯데 자이언츠",
};

function splitPlayerCell(raw: string): { name: string; position: string } {
  // "하영민(투수)" → name="하영민", position="투수"
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), position: m[2].trim() };
  return { name: raw.trim(), position: "" };
}

async function fetchOne(seasonId: number, bdSc: 18 | 21): Promise<KboInjury[]> {
  const params = new URLSearchParams({
    seasonId: String(seasonId),
    monthId: "0",
    bdSc: String(bdSc),
    teamName: "",
    searchIf: "",
    pageNo: "1",
    listCount: "200",
  });
  try {
    const r = await axios.post<ApiResp>(URL, params.toString(), {
      headers: HEADERS,
      timeout: 15000,
    });
    const rows = r.data?.rows ?? [];
    const typeLabel: "부상자 명단" | "치료·재활명단" =
      bdSc === 18 ? "부상자 명단" : "치료·재활명단";
    return rows
      .map((rw): KboInjury | null => {
        const c = rw.row;
        if (!c || c.length < 5) return null;
        const date = c[0]?.Text?.trim() ?? "";
        const teamAbbr = c[2]?.Text?.trim() ?? "";
        const playerCell = c[3]?.Text?.trim() ?? "";
        const duration = c[4]?.Text?.trim() ?? "";
        const { name, position } = splitPlayerCell(playerCell);
        if (!date || !name || !teamAbbr) return null;
        const teamFullName = ABBR_TO_FULL[teamAbbr] ?? teamAbbr;
        return {
          date,
          type: typeLabel,
          teamAbbr,
          teamFullName,
          playerName: name,
          position,
          duration,
        };
      })
      .filter((x): x is KboInjury => x !== null);
  } catch (e) {
    console.warn(
      `[kbo-injuries] bdSc=${bdSc} fetch 실패:`,
      (e as Error).message,
    );
    return [];
  }
}

/**
 * 시즌 KBO 부상자 명단 + 치료·재활명단 (병합, 등록일 desc).
 * 응답이 시즌 누적이라 한 번에 모두 받음.
 */
export async function fetchKboInjuries(seasonId?: number): Promise<KboInjury[]> {
  const season = seasonId ?? new Date().getUTCFullYear();
  const [il, rehab] = await Promise.all([fetchOne(season, 18), fetchOne(season, 21)]);
  const merged = [...il, ...rehab];
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged;
}

/**
 * 팀별 부상자 추출 — 같은 선수의 등록 이력 여러 건일 수 있어 최신 1건만 keep.
 */
export function getTeamKboInjuries(
  all: KboInjury[],
  teamFullName: string,
): KboInjury[] {
  const byPlayer = new Map<string, KboInjury>();
  for (const it of all) {
    if (it.teamFullName !== teamFullName) continue;
    const key = it.playerName;
    const prev = byPlayer.get(key);
    if (!prev || it.date > prev.date) byPlayer.set(key, it);
  }
  return [...byPlayer.values()].sort((a, b) => b.date.localeCompare(a.date));
}
