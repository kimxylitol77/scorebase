// 예상 XI(좌표 없음) → 피치 좌표를 부여해 SoccerLineupSvg 입력 형식으로 변환.
// 확정 라인업은 TheSports 가 x/y 를 주지만, 예상 라인업은 formation 문자열 + position(G/D/M/F)만
// 있으므로 formation 라인 크기대로 선수를 배치해 좌표를 합성한다(윈도우 타원버그 방어는
// SoccerLineupSvg 재사용으로 자동 상속 — 좌표만 만들고 렌더는 검증된 컴포넌트에 위임).

import type { PredictedXiTeam } from "@/components/scores/soccer/SoccerNowBlock";

// SoccerLineupSvg 가 받는 Player / LineupData 형식(부분).
interface LineupPlayer {
  id?: string;
  first?: number;
  captain?: number;
  name?: string;
  logo?: string;
  shirt_number?: number;
  position?: string;
  x?: number;
  y?: number;
  rating?: string | number;
  /** 예상 XI 전용 — 가중 투표 점유율(0~1). 마커에 % 칩으로 표시. */
  confidence?: number;
}

export interface PredictedLineupData {
  confirmed: 0;
  home_formation?: string;
  away_formation?: string;
  lineup: { home?: LineupPlayer[]; away?: LineupPlayer[] };
}

const POS_ORDER: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

/**
 * 한 팀의 예상 XI → 좌표 부여한 Player[].
 * y 좌표계는 SoccerLineupSvg 규약(0=자기 골문 … 90=중앙선). 라인 간격을 벌려
 * TeamHalf 의 라인 그룹핑(인접 y≤8 동일 라인)이 formation 라인과 1:1 되게 한다.
 */
function teamToPlayers(team: PredictedXiTeam): LineupPlayer[] {
  const xi = team.xi ?? [];
  const gk = xi.filter((p) => p.position === "G");
  const outfield = xi
    .filter((p) => p.position !== "G")
    .sort((a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9));

  const toPlayer = (
    p: PredictedXiTeam["xi"][number],
    x: number,
    y: number,
  ): LineupPlayer => ({
    id: p.id,
    first: 1,
    name: p.name,
    logo: p.photo,
    shirt_number: p.shirtNumber,
    position: p.position,
    x,
    y,
    rating: p.avgRating,
    confidence: p.confidence,
  });

  const out: LineupPlayer[] = [];

  // GK — 골문 앞 중앙
  if (gk[0]) out.push(toPlayer(gk[0], 50, 4));

  // 아웃필드 — formation("4-2-3-1") 라인 크기대로 순서대로 배치
  const lines = (team.formation ?? "")
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  let idx = 0;
  const nLines = lines.length || 1;
  lines.forEach((count, li) => {
    const y = 16 + li * (72 / Math.max(1, nLines - 1 || 1));
    for (let j = 0; j < count && idx < outfield.length; j++, idx++) {
      const x = ((j + 1) / (count + 1)) * 100;
      out.push(toPlayer(outfield[idx], x, y));
    }
  });
  // formation 합이 아웃필드 수와 어긋나 남는 선수가 있으면 최전방 라인에 얹음(방어)
  for (; idx < outfield.length; idx++) {
    out.push(toPlayer(outfield[idx], 50, 88));
  }

  return out;
}

/** 예상 홈/원정 XI → SoccerLineupSvg 입력. 둘 다 없으면 null. */
export function predictedToLineupData(
  home: PredictedXiTeam | null | undefined,
  away: PredictedXiTeam | null | undefined,
): PredictedLineupData | null {
  if (!home && !away) return null;
  return {
    confirmed: 0,
    home_formation: home?.formation,
    away_formation: away?.formation,
    lineup: {
      home: home ? teamToPlayers(home) : [],
      away: away ? teamToPlayers(away) : [],
    },
  };
}
