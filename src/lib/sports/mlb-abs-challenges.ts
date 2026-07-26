// Baseball Savant ABS 챌린지 리더보드 CSV 를 가져와 MLB ANALYSIS 글용 마크다운 섹션을 만든다.
// 비공식 endpoint 라 실패 시 null 반환 — 글 발행 자체는 계속돼야 한다 (섹션만 생략).
// 수치는 LLM 에 맡기지 않고 여기서 결정적으로 표를 조립한다 (사실 짐작 게시 금지 원칙).

import mlbPlayers from "../../../data/mlb-players.json";

const BASE = "https://baseballsavant.mlb.com/leaderboard/abs-challenges";

export type AbsChallengeRow = {
  name: string;
  team: string;
  challenges: number; // n_challenges
  overturns: number; // n_overturns (챌린지 성공 = 판정 뒤집기)
  rate: number; // rate_overturns 0~1
};

// 따옴표 필드를 처리하는 최소 CSV 파서 (Savant 는 전 필드 쌍따옴표 감쌈)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (cur !== "" || row.length) { row.push(cur); rows.push(row); row = []; cur = ""; }
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export async function fetchAbsChallengeLeaders(opts: {
  year: number;
  challengeType: "batter" | "pitcher" | "catcher";
  minChal: number;
  top: number;
}): Promise<AbsChallengeRow[] | null> {
  const url =
    `${BASE}?gameType=regular&year=${opts.year}&challengeType=${opts.challengeType}` +
    `&level=mlb&minChal=${opts.minChal}&page=0&pageSize=200&csv=true`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (scorebase.kr analysis bot)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const rows = parseCsv((await res.text()).replace(/^\uFEFF/, ""));
    if (rows.length < 2) return null;
    const header = rows[0];
    const idx = (col: string) => header.indexOf(col);
    const iName = idx("entity_name");
    const iTeam = idx("team_abbr");
    const iChal = idx("n_challenges");
    const iOver = idx("n_overturns");
    const iRate = idx("rate_overturns");
    if ([iName, iTeam, iChal, iOver, iRate].some((i) => i < 0)) return null;

    return rows
      .slice(1)
      .map((r) => ({
        name: r[iName],
        team: r[iTeam],
        challenges: Number(r[iChal]),
        overturns: Number(r[iOver]),
        rate: Number(r[iRate]),
      }))
      .filter((r) => r.name && Number.isFinite(r.rate) && r.challenges >= opts.minChal)
      .sort((a, b) => b.rate - a.rate || b.challenges - a.challenges)
      .slice(0, opts.top);
  } catch {
    return null;
  }
}

// 이름 한글화 — data/mlb-players.json (영문명 → ko) 역인덱스. 미등재는 영문 유지.
const KO_BY_NAME: Map<string, string> = new Map(
  Object.values(mlbPlayers as Record<string, { name?: string; ko?: string }>)
    .filter((p) => p.name && p.ko)
    .map((p) => [p.name as string, p.ko as string]),
);

function displayName(en: string): string {
  const ko = KO_BY_NAME.get(en);
  return ko ? `${ko}(${en})` : en;
}

function table(rows: AbsChallengeRow[]): string {
  const lines = [
    "| 순위 | 선수 | 팀 | 챌린지 | 성공 | 성공률 |",
    "|---|---|---|---|---|---|",
  ];
  rows.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${displayName(r.name)} | ${r.team} | ${r.challenges} | ${r.overturns} | ${(r.rate * 100).toFixed(1)}% |`,
    );
  });
  return lines.join("\n");
}

// ANALYSIS 글에 덧붙일 완성 섹션. 타자·투수 어느 한쪽이라도 실패하면 null.
export async function buildAbsChallengeSection(year: number): Promise<string | null> {
  // 투수는 타자보다 챌린지 기회가 훨씬 적어(2026-07 실측 최다 6회) 최소 기준을 낮춘다.
  const MIN_CHAL_BATTER = 10;
  const MIN_CHAL_PITCHER = 3;
  const TOP = 5;
  const [batters, pitchers] = await Promise.all([
    fetchAbsChallengeLeaders({ year, challengeType: "batter", minChal: MIN_CHAL_BATTER, top: TOP }),
    fetchAbsChallengeLeaders({ year, challengeType: "pitcher", minChal: MIN_CHAL_PITCHER, top: TOP }),
  ]);
  if (!batters?.length || !pitchers?.length) return null;

  return [
    "## ABS 챌린지 성공률 리더보드",
    "",
    `ABS(자동 볼-스트라이크 판정) 챌린지는 심판 판정에 선수가 재검토를 요청하는 제도로, 성공률이 높을수록 스트라이크존을 정확히 읽고 있다는 뜻이다. ${year} 시즌 기준 상위 ${TOP}명이다 (타자 ${MIN_CHAL_BATTER}회·투수 ${MIN_CHAL_PITCHER}회 이상 챌린지).`,
    "",
    "### 타자 부문",
    "",
    table(batters),
    "",
    "### 투수 부문",
    "",
    table(pitchers),
    "",
    "*자료: Baseball Savant ABS Challenge Leaderboard (수집 시점 기준). 성공 = 챌린지로 판정이 뒤집힌 횟수.*",
  ].join("\n");
}
