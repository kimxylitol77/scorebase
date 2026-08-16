// ESPN injuries JSON API — NBA/MLB/NHL 통합. 키 불필요.
// 응답: { injuries: [{ displayName(팀), injuries: [{ athlete, status, shortComment, date }] }] }

export interface EspnInjuryEntry {
  playerId: number;
  playerName: string;
  /** 한 줄 라벨 — UI 표시·심각도 매핑용 */
  reason: string;
  /** 원본 status — "Day-To-Day" | "Out" | "Injured Reserve" 등 */
  status: string;
  teamName: string;
  fixtureDate?: string;
}

const ENDPOINT: Record<string, string> = {
  NBA: "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
  MLB: "https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries",
  NHL: "https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
  // 2026-08 추가 — 실측 13팀·부상자 44명. 대만 CPBL·멕시코 LMB·호주 AIHL 은 ESPN 에
  //  해당 경로가 없다(400) — 야구/농구/하키는 ts lineup.injury 도 전혀 안 오므로 소스가 없다.
  WNBA: "https://site.web.api.espn.com/apis/site/v2/sports/basketball/wnba/injuries",
};

interface EspnRaw {
  injuries?: Array<{
    displayName?: string;
    injuries?: Array<{
      status?: string;
      shortComment?: string;
      longComment?: string;
      date?: string;
      athlete?: {
        id?: string | number;
        displayName?: string;
        shortName?: string;
        links?: Array<{ href?: string }>;
      };
    }>;
  }>;
}

type EspnAthlete = {
  id?: string | number;
  displayName?: string;
  shortName?: string;
  links?: Array<{ href?: string }>;
};

function extractAthleteId(athlete: EspnAthlete | undefined): number {
  // ESPN id 가 athlete.id 또는 links의 URL 끝 segment 에 있음
  if (athlete?.id) {
    const n = Number(athlete.id);
    if (Number.isFinite(n)) return n;
  }
  for (const l of athlete?.links ?? []) {
    const m = l.href?.match(/\/id\/(\d+)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** longComment 에서 부상 부위 키워드 추출 (BALLDONTLIE 없을 때 fallback 보강) */
const BODY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(?:lower body|lower-body)\b/i, label: "하체" },
  { re: /\b(?:upper body|upper-body)\b/i, label: "상체" },
  { re: /\b(?:torn (?:acl|mcl|pcl)|acl|mcl|pcl)\b/i, label: "무릎 인대" },
  { re: /\b(?:knee)\b/i, label: "무릎" },
  { re: /\b(?:hamstring)\b/i, label: "햄스트링" },
  { re: /\b(?:ankle)\b/i, label: "발목" },
  { re: /\b(?:groin)\b/i, label: "사타구니" },
  { re: /\b(?:calf)\b/i, label: "종아리" },
  { re: /\b(?:thigh|quadriceps?|quad)\b/i, label: "허벅지" },
  { re: /\b(?:shoulder)\b/i, label: "어깨" },
  { re: /\b(?:back)\b/i, label: "허리" },
  { re: /\b(?:wrist)\b/i, label: "손목" },
  { re: /\b(?:elbow)\b/i, label: "팔꿈치" },
  { re: /\b(?:foot)\b/i, label: "발" },
  { re: /\b(?:hand|finger)\b/i, label: "손" },
  { re: /\b(?:hip)\b/i, label: "고관절" },
  { re: /\b(?:achilles)\b/i, label: "아킬레스" },
  { re: /\b(?:concussion|head)\b/i, label: "뇌진탕" },
  { re: /\b(?:oblique)\b/i, label: "복사근" },
  { re: /\b(?:abdom)/i, label: "복부" },
  { re: /\b(?:rib)\b/i, label: "갈비뼈" },
  { re: /\b(?:neck)\b/i, label: "목" },
  { re: /\b(?:illness|sick|flu)\b/i, label: "질병" },
];

function extractBodyPart(text: string | undefined): string | null {
  if (!text) return null;
  for (const p of BODY_PATTERNS) {
    if (p.re.test(text)) return p.label;
  }
  return null;
}

export async function fetchEspnInjuries(
  league: "NBA" | "MLB" | "NHL" | "WNBA",
): Promise<EspnInjuryEntry[]> {
  const url = ENDPOINT[league];
  if (!url) return [];
  const res = await fetch(url, {
    headers: { "user-agent": "scorebase/1.0" },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    console.warn(`[espn-injuries] ${league} fetch 실패: HTTP ${res.status}`);
    return [];
  }
  const raw = (await res.json()) as EspnRaw;
  const out: EspnInjuryEntry[] = [];
  for (const teamBlock of raw.injuries ?? []) {
    const teamName = teamBlock.displayName ?? "";
    for (const inj of teamBlock.injuries ?? []) {
      const athlete = inj.athlete;
      const name = athlete?.displayName ?? athlete?.shortName ?? "";
      if (!name) continue;
      // longComment / shortComment 에서 부위 추출 시도
      const bodyPart = extractBodyPart(
        `${inj.longComment ?? ""} ${inj.shortComment ?? ""}`,
      );
      const status = inj.status ?? "Injured";
      // reason 우선순위: 부위 영문(번역 매핑 통과 가능) > status
      // 단 우리는 한글로 추출했으므로 reason 에 한글 부위가 들어가도록
      const reason = bodyPart ?? status;
      out.push({
        playerId: extractAthleteId(athlete),
        playerName: name,
        reason,
        status,
        teamName,
        fixtureDate: inj.date,
      });
    }
  }
  return out;
}

/** 팀명으로 부상자 필터 (api-football getTeamInjuries 와 동일 시그니처) */
export function getTeamEspnInjuries<T extends EspnInjuryEntry>(
  all: T[],
  teamName: string,
  _beforeIso?: string,
  limit = 30,
): T[] {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(teamName);
  const filtered = all.filter((i) => {
    const t = norm(i.teamName);
    return t.includes(target) || target.includes(t);
  });
  return filtered.slice(0, limit);
}
