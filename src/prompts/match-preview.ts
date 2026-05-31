// 예정된 경기에 대한 프리뷰(Preview) 글 프롬프트.

import type { NormalizedMatch } from "@/lib/sports/types";
import { toKoreanTeamName } from "@/lib/team-names";

/** LoL 로스터 1인 — BDL/Leaguepedia 양쪽 호환 */
export interface LolRosterPlayer {
  /** Leaguepedia ID (예: "Faker") 또는 BDL nickname */
  id: string;
  /** BDL player.id (정수) — playerStats 매핑용 */
  bdlId?: number;
  nameEn?: string; // 영문 본명 (예: "Lee Sang-hyeok")
  nameKo?: string; // 한국 본명 (예: "이상혁") — Leaguepedia 있을 때만
  role: string; // Top | Jungle | Mid | Bot | Support (대문자 첫글자)
  country?: string;
  /** 최근 등장 챔피언 (BDL match_maps 기반) */
  recentChampions?: string[];
}

/** 선수 시즌 통계 요약 — BDL player_match_map_stats 집계 */
export interface LolPlayerStatsLite {
  games: number;
  kda: number; // (K+A)/D (D=0 이면 K+A)
  /** 평균 CS (전체 게임 합계 / 게임 수) */
  avgCs?: number;
  /** 평균 챔피언 피해량 */
  avgDpm?: number;
  /** 평균 분당 골드 */
  avgGpm?: number;
  topChampions: Array<{ champion: string; games: number }>;
}

/** 챔피언 메타 — BDL champion_stats 의 글로벌 통계 */
export interface LolChampionMeta {
  name: string;
  picksRate: number; // 0~1
  banRate: number;
  winRate: number;
  kda: number;
}

export interface PreviewContext {
  /** Elo 레이팅 (양 팀) */
  elo?: { home: number; away: number };
  /** 통계 추정 승률 (%) */
  winProb?: { home: number; draw: number; away: number };
  /** OVER/UNDER 모델 확정값 (build-context, referenceTime=startTime 결정적 — 위젯과 동일 함수·동일 입력). */
  ouMarket?: { line: number; expectedTotal: number; pOver: number; pick: "OVER" | "UNDER" };
  /** 핸디캡 모델 확정값. pick=우세팀. 본문 표 방향 고정용(LLM 추측·반대표시 차단). */
  handicapMarket?: { pick: "HOME" | "AWAY"; line: number; prob: number };
  /** 더블찬스 모델 확정값(축구). pick: 1X=홈/무, X2=무/원정, 12=홈/원정. */
  doubleChance?: { pick: "1X" | "X2" | "12"; prob: number };
  /** BTTS(양 팀 모두 득점) 모델 확정값(축구·하키). */
  btts?: { pick: "YES" | "NO"; prob: number };
  /** 예측 신뢰도 — 코드 계산값 (LLM 추측 X). 위젯과 단일 소스. */
  confidence?: {
    /** 최고 확률 픽 (HOME/DRAW/AWAY) */
    pick: "HOME" | "DRAW" | "AWAY";
    /** 그 픽의 확률 0~1 */
    prob: number;
    /** 등급: high(65%+) / medium(50~65%) / low(<50%) */
    level: "high" | "medium" | "low";
  };
  /** 데이터 부족 경고 — 양 팀 직전 경기 표본이 MIN_PRIOR 미만이면 신뢰 낮음 */
  dataSparse?: {
    sparse: boolean;
    homePlayed: number;
    awayPlayed: number;
    /** 표본 충분 기준 (경기 수) */
    minRequired: number;
  };
  /** 일정 — 직전 경기로부터 휴식일 (적을수록 체력/로테이션 부담). null=직전 경기 없음 */
  restDays?: { home: number | null; away: number | null };
  /** 모델이 본 핵심 이유 TOP 3 — 신호 크기순 코드 산출 (LLM 자유해석 X) */
  keyReasons?: string[];
  /** 시즌 순위 */
  position?: { home: number; away: number; total: number };
  /** 시즌 승점 */
  points?: { home: number; away: number };
  /** 공격/수비 랭킹 (1-based) */
  attackDefense?: {
    home: { attack?: number; defense?: number };
    away: { attack?: number; defense?: number };
  };
  /** 홈/원정 split (홈팀의 홈 성적 / 원정팀의 원정 성적) */
  homeAway?: {
    home: { wins: number; draws: number; losses: number; ppg: number };
    away: { wins: number; draws: number; losses: number; ppg: number };
  };
  /** 최근 5경기 폼 (W/D/L 시퀀스) */
  recentForm?: { home: string[]; away: string[] };
  /** 흐름 (streak) */
  streak?: {
    home: { unbeaten: number; winning: number; losing: number };
    away: { unbeaten: number; winning: number; losing: number };
  };
  /** 최근 평균 득실점 */
  trend?: {
    home: { gf: number; ga: number; ppg: number };
    away: { gf: number; ga: number; ppg: number };
  };
  /** 상대 전적 */
  h2h?: { homeWins: number; draws: number; awayWins: number; total: number };
  /** TheSports analysis 기반 확장 history — 모든 대회 포함 H2H 매치별 detail
   *  + 양 팀 최근 경기 (모든 대회) + 시간대별 골 분포 (시즌 누적).
   *  우리 DB Match (cover 리그 한정) 보다 풍부 — 친선·컵·유로파 H2H 포함. */
  tsHistory?: {
    h2h: Array<{
      date: string;
      /** 그 경기에서 우리 home 팀이 home 으로 출전했나? */
      ourHomeWasHome: boolean;
      ourHomeScore: number;
      ourAwayScore: number;
      result: "W" | "D" | "L";
      season?: string;
    }>;
    homeRecent: Array<{
      date: string;
      wasHome: boolean;
      teamScore: number;
      opponentScore: number;
      result: "W" | "D" | "L";
      season?: string;
    }>;
    awayRecent: Array<{
      date: string;
      wasHome: boolean;
      teamScore: number;
      opponentScore: number;
      result: "W" | "D" | "L";
      season?: string;
    }>;
    goalBuckets?: {
      home: { scored: number[]; conceded: number[]; matches: number };
      away: { scored: number[]; conceded: number[]; matches: number };
    };
  };
  /** 부상자 명단 (api-football Pro 보강) */
  injuries?: {
    home: Array<{ name: string; reason?: string }>;
    away: Array<{ name: string; reason?: string }>;
  };
  /** 시즌 핵심 선수 (득점/어시스트) */
  keyPlayers?: {
    home: Array<{ name: string; goals: number; assists: number }>;
    away: Array<{ name: string; goals: number; assists: number }>;
  };
  /** 베팅사이트 평균 implied probability (vig 제거) — Value Bet 강조용 */
  marketProb?: {
    home: number;
    draw: number;
    away: number;
    bookmakers: number;
  };
  /** 확정 라인업 (api-football Pro, 매치 1시간 전 발표) */
  lineups?: {
    home: { formation?: string; startXI: string[]; coach?: string };
    away: { formation?: string; startXI: string[]; coach?: string };
  };
  /** API-Football 자체 예측 (third opinion) */
  apiPrediction?: {
    homePct: number;
    drawPct: number;
    awayPct: number;
    advice?: string;
  };
  /** MLB 선발 투수 (statsapi.mlb.com — MLB 만) */
  starters?: {
    home?: {
      name: string;
      hand?: string;
      era?: number;
      whip?: number;
      k9?: number;
      wins?: number;
      losses?: number;
      gs?: number;
      ip?: string;
    };
    away?: {
      name: string;
      hand?: string;
      era?: number;
      whip?: number;
      k9?: number;
      wins?: number;
      losses?: number;
      gs?: number;
      ip?: string;
    };
  };
  /** Poisson 결합 5,000회 시뮬과 동등한 스코어 분포 — top 3 (축구만) */
  topScores?: Array<{ home: number; away: number; prob: number }>;
  /** 야구(KBO/MLB/NPB) — 시즌 평균 RPG / RApg (calcStandings 기반) */
  baseballStats?: {
    home: { rpg: number; rapg: number; played: number };
    away: { rpg: number; rapg: number; played: number };
  };
  /** 야구 이닝별 득점 확률 (Poisson) — KBO/MLB/NPB + 양 팀 starter ERA 있을 때 */
  inningScoreProbs?: Array<{
    inning: number;
    team1RunProb: number[]; // [0, 1, 2, 3, 4+]
    team2RunProb: number[];
    team1ExpectedRuns: number;
    team2ExpectedRuns: number;
    pitcherFactor: "starter" | "bullpen";
  }>;
  /** 야구 누적 예상 득점 (9회 합계) */
  totalExpectedRuns?: { team1: number; team2: number };
  /** 야구 Poisson + Skellam 시뮬 승률 (team1=원정, team2=홈) */
  winProbPoisson?: { team1: number; team2: number };
  /** 베팅 라인 움직임 — 오프닝 odds vs 현재 odds 변화 (implied 확률) */
  lineMovement?: {
    home: { opening: number; current: number };
    draw: { opening: number; current: number };
    away: { opening: number; current: number };
    capturedAt?: Date;
  };
  /** LoL/LCK 전용 메타 (LOL 매치 전용) */
  lolMeta?: {
    /** Data Dragon 기준 현재 라이브 패치 (예: "16.9.1") */
    patch?: string;
    /** LCK 정규시즌 매치 결과 집계 standings */
    standings?: {
      home: { rank: number; wins: number; losses: number; setsWon: number; setsLost: number };
      away: { rank: number; wins: number; losses: number; setsWon: number; setsLost: number };
      total: number;
    };
    /** Leaguepedia Players 테이블 — 양 팀 5인 활성 로스터 */
    rosters?: {
      home: LolRosterPlayer[];
      away: LolRosterPlayer[];
    };
    /** 선수 시즌 통계 (ScoreboardPlayers 집계) — playerId → stats */
    playerStats?: Record<string, LolPlayerStatsLite>;
    /** Bo3 게임 수 OVER/UNDER 2.5 — 풀세트 갈 확률 (시리즈 결과 분포 기반) */
    gameCountMarket?: {
      line: 2.5;
      pOver: number; // 풀세트(3게임) 확률
      sample: number;
    };
    /** 1게임 총 킬 OVER/UNDER — BDL team_match_map_stats 기반 */
    oneGameKillsMarket?: {
      line: number;
      pOver: number;
      sample: number;
      expectedTotal: number;
    };
    /** 1게임 핸디캡 (킬 차이) — BDL 기반 */
    oneGameHandicapMarket?: {
      pick: "HOME" | "AWAY";
      line: number;
      prob: number;
    };
    /** 글로벌 챔피언 메타 top N (LCK 한정 X — BDL 미지원) */
    championMeta?: LolChampionMeta[];
    /** Total Maps OVER/UNDER 시장 (베팅사 평균 vig-free implied) — OddsPapi 응답 기반 */
    totalMapsMarket?: {
      line: number; // 보통 2.5
      overImplied: number; // 0~1
      underImplied: number;
    };
    /** RECAP 전용 — 모델 사전 예측 vs 실제 결과 */
    recap?: {
      predWinner?: string; // "HOME" | "AWAY"
      predCorrect?: boolean;
    };
  };
  /** NHL 시작 골리 (api-web.nhle.com — NHL 만) */
  goalies?: {
    home?: {
      name: string;
      gaa?: number;
      savePctg?: number;
      wins?: number;
      losses?: number;
      otLosses?: number;
      gamesPlayed?: number;
      shutouts?: number;
    };
    away?: {
      name: string;
      gaa?: number;
      savePctg?: number;
      wins?: number;
      losses?: number;
      otLosses?: number;
      gamesPlayed?: number;
      shutouts?: number;
    };
  };
  /** 양 팀 중 가장 최근 RECAP 글 slug — 본문 내부 링크용 */
  recentRecap?: {
    slug: string;
    title: string;
    teamSide: "home" | "away";
  };
}

export interface PreviewPromptInput {
  match: NormalizedMatch;
  context?: PreviewContext;
}

function lineIfExist(label: string, value: string | undefined | null): string {
  return value ? `- ${label}: ${value}` : "";
}

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function buildPreviewPrompt(input: PreviewPromptInput): string {
  const { match, context = {} } = input;
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  const dateStr = match.startTime.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });

  const ctxLines: string[] = [];

  if (context.position) {
    ctxLines.push(
      `- 시즌 순위: ${home} ${context.position.home}위 (${context.points?.home ?? "?"}점) / ${away} ${context.position.away}위 (${context.points?.away ?? "?"}점) — 총 ${context.position.total}팀`,
    );
  }
  if (context.elo) {
    ctxLines.push(
      `- Elo 레이팅: ${home} ${Math.round(context.elo.home)} / ${away} ${Math.round(context.elo.away)}`,
    );
  }
  if (context.winProb) {
    ctxLines.push(
      `- 통계 추정 승률: ${home} ${pct(context.winProb.home)} / 무 ${pct(context.winProb.draw)} / ${away} ${pct(context.winProb.away)}`,
    );
  }
  if (context.ouMarket) {
    const o = context.ouMarket;
    ctxLines.push(
      `- OVER/UNDER 예측(모델 확정값): 기준선 ${o.line} · 예상 총득점 ${o.expectedTotal.toFixed(1)} · 모델 픽 ${o.pick} ${pct(o.pick === "OVER" ? o.pOver : 1 - o.pOver)} — 표에 이 값 그대로, 임의 변경 금지`,
    );
  }
  if (context.handicapMarket) {
    const h = context.handicapMarket;
    const fav = h.pick === "HOME" ? home : away;
    ctxLines.push(
      `- 핸디캡 예측(모델 확정값): 우세팀 ${fav} -${h.line} cover ${pct(h.prob)} — 방향=${fav} 고정, 절대 반대 팀으로 쓰지 말 것`,
    );
  }
  if (context.doubleChance) {
    const d = context.doubleChance;
    const dcLabel =
      d.pick === "1X"
        ? `${home} 또는 무`
        : d.pick === "X2"
          ? `무 또는 ${away}`
          : `${home} 또는 ${away}`;
    ctxLines.push(
      `- 더블찬스 예측(모델 확정값): ${dcLabel} ${pct(d.prob)} — 표에 이 값 그대로, 임의 변경 금지`,
    );
  }
  if (context.btts) {
    const b = context.btts;
    ctxLines.push(
      `- BTTS(양 팀 모두 득점) 예측(모델 확정값): ${b.pick} ${pct(b.prob)} — 표에 이 값 그대로, 임의 변경 금지`,
    );
  }
  if (context.lineups) {
    const lh = context.lineups.home;
    const la = context.lineups.away;
    const lhStr = `${lh.formation ? `[${lh.formation}] ` : ""}${lh.startXI.join(", ")}${lh.coach ? ` (감독: ${lh.coach})` : ""}`;
    const laStr = `${la.formation ? `[${la.formation}] ` : ""}${la.startXI.join(", ")}${la.coach ? ` (감독: ${la.coach})` : ""}`;
    ctxLines.push(`- 확정 라인업 ${home}: ${lhStr}`);
    ctxLines.push(`- 확정 라인업 ${away}: ${laStr}`);
  }
  if (context.apiPrediction) {
    const ap = context.apiPrediction;
    ctxLines.push(
      `- API-Football 자체 예측 (외부 third opinion): ${home} ${pct(ap.homePct)} / 무 ${pct(ap.drawPct)} / ${away} ${pct(ap.awayPct)}${ap.advice ? ` · advice: ${ap.advice}` : ""}`,
    );
  }
  // 야구(KBO/MLB/NPB) — 시즌 평균 + Poisson 모델 결과. 본문에서 수치 중복
  // 나열 금지 (별도 InningScoreChart 카드로 노출됨).
  if (context.baseballStats) {
    ctxLines.push(
      `- 시즌 평균 득실: ${home} RPG ${context.baseballStats.home.rpg.toFixed(2)} · RApg ${context.baseballStats.home.rapg.toFixed(2)} (${context.baseballStats.home.played}경기) / ${away} RPG ${context.baseballStats.away.rpg.toFixed(2)} · RApg ${context.baseballStats.away.rapg.toFixed(2)} (${context.baseballStats.away.played}경기)`,
    );
  }
  if (context.totalExpectedRuns) {
    ctxLines.push(
      `- Poisson 모델 예상 득점: ${away}(원정) ${context.totalExpectedRuns.team1.toFixed(2)} · ${home}(홈) ${context.totalExpectedRuns.team2.toFixed(2)}`,
    );
  }
  if (context.winProbPoisson) {
    ctxLines.push(
      `- Poisson+Skellam 승률: ${away}(원정) ${pct(context.winProbPoisson.team1)} · ${home}(홈) ${pct(context.winProbPoisson.team2)}`,
    );
  }
  if (context.inningScoreProbs && context.inningScoreProbs.length === 9) {
    // 본문에서 카드와 같은 수치 나열 막기 위해 prompt 에는 요약 정보만.
    // 7회 이후 불펜 전환점이 핵심.
    const bullpenStart =
      context.inningScoreProbs.find((r) => r.pitcherFactor === "bullpen")
        ?.inning ?? 7;
    ctxLines.push(
      `- 이닝별 득점 확률 카드 별도 표시 (${bullpenStart}회부터 불펜 전환). 본문에서는 이닝별 % 수치 나열 금지 — 흐름 해석에 집중.`,
    );
  }
  if (context.starters?.home || context.starters?.away) {
    const s = context.starters;
    const fmt = (
      side: NonNullable<typeof s>["home"] | NonNullable<typeof s>["away"],
    ) => {
      if (!side) return "선발 미정";
      // hand 는 L/R 만 의미 — 없으면 표기 생략 (스위치 X)
      const handLabel =
        side.hand === "L" ? "좌완" : side.hand === "R" ? "우완" : "";
      const stats = [
        side.era != null ? `ERA ${side.era.toFixed(2)}` : null,
        side.whip != null ? `WHIP ${side.whip.toFixed(2)}` : null,
        side.k9 != null ? `K/9 ${side.k9.toFixed(1)}` : null,
        side.wins != null && side.losses != null
          ? `${side.wins}-${side.losses}`
          : null,
        side.ip != null ? `IP ${side.ip}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const meta = [handLabel, stats].filter(Boolean).join(", ");
      return meta ? `${side.name} (${meta})` : side.name;
    };
    ctxLines.push(`- 홈 선발: ${fmt(s?.home)}`);
    ctxLines.push(`- 원정 선발: ${fmt(s?.away)}`);
    // ERA 차이로 우세 한 줄 자동 코멘트
    if (s?.home?.era != null && s?.away?.era != null) {
      const diff = s.away.era - s.home.era;
      const absDiff = Math.abs(diff);
      const better = diff > 0 ? home : away;
      if (absDiff >= 0.5) {
        ctxLines.push(
          `- 선발 ERA 차이 ${absDiff.toFixed(2)} — ${better} 선발 우세. 선발 영향이 큰 야구의 핵심 변수.`,
        );
      } else {
        ctxLines.push(
          `- 양 선발 ERA 차이 ${absDiff.toFixed(2)} 로 비등 — 타선·불펜 결정적.`,
        );
      }
    }
  }
  if (context.goalies?.home || context.goalies?.away) {
    const g = context.goalies;
    const fmt = (
      side: NonNullable<typeof g>["home"] | NonNullable<typeof g>["away"],
    ) => {
      if (!side) return "골리 정보 없음";
      const stats = [
        side.gaa != null ? `GAA ${side.gaa.toFixed(2)}` : null,
        side.savePctg != null
          ? `SV% ${(side.savePctg * 100).toFixed(1)}`
          : null,
        side.wins != null && side.losses != null
          ? `${side.wins}-${side.losses}${side.otLosses != null ? `-${side.otLosses}` : ""}`
          : null,
        side.gamesPlayed != null ? `GP ${side.gamesPlayed}` : null,
        side.shutouts != null && side.shutouts > 0
          ? `완봉 ${side.shutouts}`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${side.name} (${stats})`;
    };
    ctxLines.push(`- 홈 골리: ${fmt(g?.home)}`);
    ctxLines.push(`- 원정 골리: ${fmt(g?.away)}`);
    if (g?.home?.gaa != null && g?.away?.gaa != null) {
      const diff = g.away.gaa - g.home.gaa;
      const absDiff = Math.abs(diff);
      const better = diff > 0 ? home : away;
      if (absDiff >= 0.4) {
        ctxLines.push(
          `- 골리 GAA 차이 ${absDiff.toFixed(2)} — ${better} 골리 우세. 하키 결과의 큰 변수.`,
        );
      } else {
        ctxLines.push(
          `- 양 골리 GAA 차이 ${absDiff.toFixed(2)} 로 비등 — 공격력 결정적.`,
        );
      }
    }
  }
  if (context.marketProb && context.winProb) {
    const mp = context.marketProb;
    const wp = context.winProb;
    const gaps = [
      { name: home, model: wp.home, market: mp.home },
      { name: away, model: wp.away, market: mp.away },
    ];
    const valueSide = gaps
      .filter((g) => g.model - g.market >= 0.05)
      .sort((a, b) => b.model - b.market - (a.model - a.market))[0];
    ctxLines.push(
      `- 베팅사이트 평균 odds (${mp.bookmakers}개사 implied, vig 제거): ${home} ${pct(mp.home)} / 무 ${pct(mp.draw)} / ${away} ${pct(mp.away)}`,
    );
    if (valueSide) {
      ctxLines.push(
        `  → AI 모델은 ${valueSide.name} 가 시장 평균보다 ${Math.round((valueSide.model - valueSide.market) * 100)}%p 더 유리하다고 평가 (Value Bet 후보 — 본문에서 자연스럽게 언급)`,
      );
    } else {
      ctxLines.push(`  → AI 모델과 시장 평균이 거의 일치 — 시장 합의 강함`);
    }
  }
  if (context.topScores && context.topScores.length > 0) {
    const line = context.topScores
      .map((s) => `${s.home}-${s.away}(${(s.prob * 100).toFixed(1)}%)`)
      .join(", ");
    ctxLines.push(
      `- 시뮬레이션 가장 흔한 스코어 TOP 3 (Poisson 결합 추정): ${line}`,
    );
  }
  if (context.lineMovement) {
    const lm = context.lineMovement;
    const fmtPair = (label: string, p: { opening: number; current: number }) => {
      const diff = Math.round((p.current - p.opening) * 1000) / 10; // %p, 소수 1자리
      const sign = diff > 0 ? "+" : "";
      return `${label} ${pct(p.opening)}→${pct(p.current)} (${sign}${diff}%p)`;
    };
    ctxLines.push(
      `- 베팅 라인 움직임: ${fmtPair(home, lm.home)} / 무 ${fmtPair("", lm.draw).slice(1)} / ${fmtPair(away, lm.away)}`,
    );
  }
  if (context.attackDefense) {
    const ad = context.attackDefense;
    if (ad.home.attack || ad.home.defense || ad.away.attack || ad.away.defense) {
      ctxLines.push(
        `- 공격/수비 랭킹: ${home} 공격${ad.home.attack ?? "-"}위·수비${ad.home.defense ?? "-"}위 / ${away} 공격${ad.away.attack ?? "-"}위·수비${ad.away.defense ?? "-"}위`,
      );
    }
  }
  if (context.homeAway) {
    const h = context.homeAway.home;
    const a = context.homeAway.away;
    ctxLines.push(
      `- 홈/원정 강도: ${home} 홈에서 ${h.wins}승${h.draws}무${h.losses}패 (경기당 ${h.ppg.toFixed(2)}점) / ${away} 원정에서 ${a.wins}승${a.draws}무${a.losses}패 (경기당 ${a.ppg.toFixed(2)}점)`,
    );
  }
  if (context.recentForm) {
    ctxLines.push(
      `- 최근 5경기 폼: ${home} ${context.recentForm.home.join("-") || "-"} / ${away} ${context.recentForm.away.join("-") || "-"}`,
    );
  }
  if (context.streak) {
    const hs = context.streak.home;
    const as = context.streak.away;
    const desc = (s: { unbeaten: number; winning: number; losing: number }) => {
      if (s.winning >= 2) return `${s.winning}연승 중`;
      if (s.unbeaten >= 3) return `${s.unbeaten}경기 무패`;
      if (s.losing >= 2) return `${s.losing}연패 중`;
      return "특이 흐름 없음";
    };
    ctxLines.push(`- 흐름: ${home} ${desc(hs)} / ${away} ${desc(as)}`);
  }
  if (context.trend) {
    ctxLines.push(
      `- 최근 5경기 평균 득실: ${home} ${context.trend.home.gf.toFixed(1)}득점/${context.trend.home.ga.toFixed(1)}실점 (경기당 ${context.trend.home.ppg.toFixed(2)}점) / ${away} ${context.trend.away.gf.toFixed(1)}득점/${context.trend.away.ga.toFixed(1)}실점 (경기당 ${context.trend.away.ppg.toFixed(2)}점)`,
    );
  }
  if (context.h2h && context.h2h.total > 0) {
    ctxLines.push(
      `- 상대 전적 (최근 ${context.h2h.total}경기): ${home} ${context.h2h.homeWins}승 · ${context.h2h.draws}무 · ${away} ${context.h2h.awayWins}승`,
    );
  }
  if (context.tsHistory) {
    const th = context.tsHistory;
    if (th.h2h.length > 0) {
      const items = th.h2h
        .map((mm) => {
          const venue = mm.ourHomeWasHome ? "H" : "A";
          const season = mm.season ? ` [${mm.season}]` : "";
          return `${mm.date}(${venue}) ${mm.ourHomeScore}-${mm.ourAwayScore} ${mm.result}${season}`;
        })
        .join(" / ");
      const w = th.h2h.filter((mm) => mm.result === "W").length;
      const d = th.h2h.filter((mm) => mm.result === "D").length;
      const l = th.h2h.filter((mm) => mm.result === "L").length;
      ctxLines.push(
        `- 확장 H2H (모든 대회 포함, ${home} 기준 ${w}승 ${d}무 ${l}패): ${items}`,
      );
    }
    const formatRecent = (list: typeof th.homeRecent) =>
      list
        .map((mm) => {
          const venue = mm.wasHome ? "H" : "A";
          return `${mm.date}(${venue}) ${mm.teamScore}-${mm.opponentScore} ${mm.result}`;
        })
        .join(" / ");
    if (th.homeRecent.length > 0) {
      const w = th.homeRecent.filter((mm) => mm.result === "W").length;
      const d = th.homeRecent.filter((mm) => mm.result === "D").length;
      const l = th.homeRecent.filter((mm) => mm.result === "L").length;
      ctxLines.push(
        `- ${home} 최근 ${th.homeRecent.length}경기 (모든 대회, ${w}승 ${d}무 ${l}패): ${formatRecent(th.homeRecent)}`,
      );
    }
    if (th.awayRecent.length > 0) {
      const w = th.awayRecent.filter((mm) => mm.result === "W").length;
      const d = th.awayRecent.filter((mm) => mm.result === "D").length;
      const l = th.awayRecent.filter((mm) => mm.result === "L").length;
      ctxLines.push(
        `- ${away} 최근 ${th.awayRecent.length}경기 (모든 대회, ${w}승 ${d}무 ${l}패): ${formatRecent(th.awayRecent)}`,
      );
    }
    if (th.goalBuckets) {
      const labels = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"];
      const fmt = (arr: number[]) =>
        labels.map((lb, i) => `${lb}분 ${arr[i] ?? 0}골`).join(", ");
      ctxLines.push(
        `- ${home} 시간대별 골 (시즌 ${th.goalBuckets.home.matches}경기): 득점 [${fmt(th.goalBuckets.home.scored)}] / 실점 [${fmt(th.goalBuckets.home.conceded)}]`,
      );
      ctxLines.push(
        `- ${away} 시간대별 골 (시즌 ${th.goalBuckets.away.matches}경기): 득점 [${fmt(th.goalBuckets.away.scored)}] / 실점 [${fmt(th.goalBuckets.away.conceded)}]`,
      );
    }
  }
  if (context.keyPlayers) {
    const fmt = (
      players: Array<{ name: string; goals: number; assists: number }>,
    ) =>
      players
        .map(
          (p) =>
            `${p.name}(${p.goals}골${p.assists ? "·" + p.assists + "도움" : ""})`,
        )
        .join(", ");
    if (context.keyPlayers.home.length > 0) {
      ctxLines.push(`- 핵심 선수 ${home}: ${fmt(context.keyPlayers.home)}`);
    }
    if (context.keyPlayers.away.length > 0) {
      ctxLines.push(`- 핵심 선수 ${away}: ${fmt(context.keyPlayers.away)}`);
    }
  }
  if (context.injuries) {
    const fmt = (list: Array<{ name: string; reason?: string }>) =>
      list
        .map((p) => (p.reason ? `${p.name}(${p.reason})` : p.name))
        .join(", ");
    if (context.injuries.home.length > 0) {
      ctxLines.push(`- 결장·부상 ${home}: ${fmt(context.injuries.home)}`);
    }
    if (context.injuries.away.length > 0) {
      ctxLines.push(`- 결장·부상 ${away}: ${fmt(context.injuries.away)}`);
    }
  }
  if (context.recentRecap) {
    const teamName = context.recentRecap.teamSide === "home" ? home : away;
    ctxLines.push(
      `- recentRecap (본문 내부 링크 1개 — 본문 마지막 마무리 직전에 자연스러운 한 문장으로 인용): ${teamName} 의 최근 매치 리뷰 "${context.recentRecap.title}" → /articles/${context.recentRecap.slug}`,
    );
  }

  return `# ROLE
당신은 글로벌 스포츠 데이터 분석가다. ESPN Stats & Info, FiveThirtyEight,
Opta Analyst 수준의 데이터 기반 분석을 한국어로 작성한다.

# CONTEXT
이 글은 "스코어베이스(Scorebase)" — 통계 기반 AI 스포츠 분석 미디어 — 에
게재된다. 도박·베팅 사이트가 아닌, 데이터 미디어다. 톤은 학술적 신중함 +
대중적 가독성이다.

# MISSION
입력으로 받은 매치 데이터(JSON) 전체를 활용해 전문 분석가 수준의
"매치 프리뷰"를 한국어로 작성한다. 단순 데이터 나열은 절대 금지.
모든 수치는 의미(왜 중요한가)와 함의(그래서 어떻게 되는가)까지 풀어쓴다.

# INPUT — 받게 될 데이터 (모든 필드를 활용할 것)
- match: 리그, 홈팀, 원정팀, 날짜, 킥오프(KST)
- standings: 양 팀 현재 순위·승점·득실차·잔여 경기
- elo: 양 팀 Elo 레이팅 + 격차 + 최근 추세
- form: 최근 5~10경기 폼 (승무패 패턴, 골 흐름)
- h2h: 최근 H2H 전적 (지난 5~10번 맞대결)
- attack_defense: 경기당 득점/실점, 리그 내 공·수 순위
- home_away_strength: 홈 강도 / 원정 강도 지표
- lineups: 예상 스타팅 라인업 + 결장 가능자
- injuries: 부상자 명단 + 결장 영향도 (key/secondary)
- model_prediction: 모델 추정 승률 1X2 + 더블 찬스 + OVER/UNDER + 핸디캡 + BTTS
- market_odds: 여러 베팅사이트 평균 implied 확률 (개수는 컨텍스트의 N개사 그대로)
- value_bet: 모델이 시장보다 5%p+ 자신 있는 시장 (있으면 표시)
- strong_pick: 모델 신뢰도 65%+ 여부 + 해당 시장
- season_impact: 이 경기 결과가 우승·강등·플레이오프 확률에 미칠 변동

# WRITING DOCTRINE — 반드시 지켜라
1. 사실 → 통계 → 해석 → 함의 순서.
2. 모든 핵심 수치는 출처 라벨과 함께. (예: "Elo 1637", "8개 사이트 평균 45%",
   "시즌 평균 대비 +0.4골")
3. 데이터의 비교 기준을 제시. ("리그 평균 1.4 대비 1.9", "지난 5경기 폼 vs 시즌 평균")
4. 인과 추정을 시도. ("수비 1순위 X 결장 → 평소 0.7실점이 1.3실점으로 추정")
5. 모델 vs 시장의 시각 차이가 있으면 반드시 짚는다.
   ("모델은 홈 48%, 시장은 41%. 7%p 차이 → Value Bet")
6. 라인업·부상은 단순 나열 X, 영향도를 평가한다.
   ("주전 센터백 결장 → 세트피스 실점 확률 상승")
7. "전망", "관전 포인트"는 데이터로 뒷받침된 것만 쓴다.
8. 도박 권유 표현 절대 금지: "베팅", "픽", "건다", "찍는다" 등의 단어 사용 X.
   대신 "추정", "예측", "기댓값", "통계적으로", "모델 관점에서".
9. 단정 X, 신중한 표현: "~할 가능성이 높다", "~로 추정된다", "데이터는 ~를 시사한다".
10. 팀명 첫 등장 시 한국어 + 영문 병기. 예: 아스널(Arsenal). 이후엔 한국어.
11. **데이터 활용 적극성**: 입력 ctxLines 의 standings·elo·form·h2h·attack_defense·
    home_away_strength·lineups·injuries·model_prediction·market_odds·fixtureStats·
    topScores·lineMovement 모든 항목을 본문에 적극 녹여라. 표 안 수치만으로 끝내지 말고
    "왜 그 숫자인지" 본문에서 한 문장씩 풀어준다. 단 데이터 없는 사실은 절대 만들지 마라.
12. **선수명도 한국 미디어 관행대로 한글 표기.** 첫 등장 시 한글(영문) 병기, 이후 한글만.
    예: "Erling Haaland" → "엘링 홀란(Erling Haaland)" → 이후 "홀란".
    "Bukayo Saka" → "부카요 사카(Bukayo Saka)" → 이후 "사카".
    "Vinicius Junior" → "비니시우스 주니오르(Vinicius Junior)" → 이후 "비니시우스".
    "Cristiano Ronaldo" → "크리스티아누 호날두" (한국에 너무 잘 알려져 영문 생략 가능).
    한국에 알려지지 않은 신인이거나 표기가 불확실하면 영문 그대로 두되 괄호로 한글 추정 표기.
    국립국어원 외래어 표기법을 기준으로 하되, 한국 스포츠 미디어에서 굳어진 표기가 있으면 그쪽 우선
    (예: "Heung-min Son" → "손흥민", "Shohei Ohtani" → "오타니 쇼헤이").
13. **일본 NPB 선수명도 일본어 한자/가타카나 그대로 두지 말고 한국 미디어 관행대로 한국 음역 표기.**
    첫 등장 시 한글(원문) 병기, 이후 한글만. 한자/가타카나 그대로 출력 금지.
    예: "松本晴" → "마쓰모토 하루(松本晴)" → 이후 "마쓰모토",
        "渡邉" → "와타나베(渡邉)" → 이후 "와타나베",
        "戸郷" → "도고(戸郷)", "床田" → "도코다(床田)",
        "吉村" → "요시무라(吉村)", "西勇" → "니시(西勇)",
        "ジャクソン" 같은 외국인 선수의 가타카나는 원어 영문 추정 + 한글
        (예: "Jackson 잭슨"). 외국 인명 영어 음차일 가능성이 있으면 그쪽 우선.

# DATA GAPS — 빈 필드 처리
- 입력 JSON에서 null, 빈 배열, 빈 객체인 필드는 해당 단락을 통째로 생략한다.
- 절대 "정보가 없다", "확정되지 않았다" 같은 문구로 단락을 채우지 마라.
- 라인업이 없으면 라인업 단락 생략. H2H가 없으면 H2H 문장 생략.
- 부상자 명단이 비면 "핵심 변수" 단락에서 라인업만 다룬다.

# SPORT-SPECIFIC HANDLING
- 축구(EPL/라리가/분데스/세리에A/리그1/UCL/MLS/월드컵): xG·점유율·BTTS·핸디캡 사용
- 농구(NBA): Pace·Net Rating·3P%·턴오버, 핸디캡 = Spread, OVER/UNDER 사용
- 야구(MLB/KBO): 선발투수 ERA·WHIP·팀 OPS, 핸디캡 = Run Line, OVER/UNDER 사용
- 하키(NHL): xG·PP%·PK%, 핸디캡 = Puck Line, OVER/UNDER 사용
- BTTS는 축구·하키에만 적용. 농구·야구는 BTTS 행을 표에서 생략.
- LoL/LCK 매치는 이 프롬프트가 아닌 별도 LoL 전용 프롬프트로 처리됨 — 이 프롬프트에서는 LoL 입력을 받지 않는다.

# ADVANCED STAT — 매치업 분석에 1줄 강제
"매치업 분석" 단락 안에 종목별 핵심 어드밴스드 스탯 1개를 비교하는
문장 1줄을 반드시 포함한다. 양 팀 수치 + 리그 평균 대비를 함께 적어
해석 가능하게 한다. 수치는 입력 데이터에 명시되지 않았어도 시즌 통계로
합리적 추정이 가능한 경우 신중한 표현으로 사용("시즌 평균 기준 ~로 추정").

- 축구: **xG / xGA** (기대득점·기대실점)
  ⚠ xG 단독 사용 절대 금지 — 반드시 xGA 와 함께. 양 팀 모두 xG·xGA 둘 다 표기.
  예) "맨시티 xG 1.9·xGA 1.0, 아스널 xG 1.7·xGA 0.9 (리그 평균 xG 1.4) —
       슛 퀄리티는 비등하지만 수비 안정성은 아스널이 약간 우세."
- 농구: **Net Rating** (100포제션당 득실점)
  예) "보스턴 Net Rating +8.4 (리그 6위), 마이애미 +1.2 — 효율성 차이가 핵심."
- 야구: **선발 투수 FIP** (수비 무관 평균자책점)
  예) "오타니 FIP 2.84, 콜 3.71 — DIPS 기준 오타니가 한 등급 위."
- 하키: **Corsi (CF%)** (5v5 슈팅 시도 점유율)
  예) "콜로라도 CF% 54.2% (리그 3위), 베이거스 49.8% — 슛 압박은 콜로라도 우세."

# WRITING DOCTRINE 보강 — ADVANCED STAT 사용 시
- 수치만 던지지 말고 "리그 평균 대비 / 상대 대비" 비교를 함께.
- 데이터 없으면 단락 생략(다른 비교 지표로 대체) — 추측 금지.

# OUTPUT STRUCTURE (마크다운)
분량 제한 없음 — 입력 데이터 풍부한 만큼 분석가 톤으로 충분히 풀어내라.
단 데이터에 없는 사실은 절대 만들지 마라.

## [헤드라인]
한 줄. 핵심 변수 1개를 명시한 분석가 톤. 다음 패턴 중 택 1:
- 패턴 A: "[A팀]의 [강점 지표] vs [B팀]의 [강점 지표] — [핵심 변수]가 좌우할 매치"
- 패턴 B: "[수치]가 보여주는 이번 경기의 진짜 변수 — [팀 vs 팀]"
- 패턴 C: "[중요 변수] 1개로 압축한 [팀 vs 팀] 매치업"

## 도입 (2~3문장)
이 경기의 시즌·리그적 위치 + 핵심 쟁점 1줄로 압축.

## 매치업 분석
- 양 팀 Elo·순위·폼을 한 단락으로 비교.
- 공수 지표 충돌(한 팀의 공격 vs 상대 수비) 분석.
- **종목별 어드밴스드 스탯 1줄 필수** (축구 xG/xGA · 농구 Net Rating · 야구 선발 FIP · 하키 Corsi).
  양 팀 수치 + 리그 평균 대비를 함께 적는다.
  · **별도 문단**으로 분리 (문장 안에 묻히지 말 것).
  · 라벨은 정확히 다음 형식으로 시작 (마크다운 볼드, 별표 2개로 감싸기):
    "📊 어드밴스드 스탯 — " 로 시작하고 같은 줄에 수치·해석 한 문장.
    예) **📊 어드밴스드 스탯** — 맨시티 xG 1.9·xGA 1.0, 아스널 xG 1.7·xGA 0.9 (리그 평균 xG 1.4) — 슛 퀄리티는 비등, 수비 안정성은 아스널 우세.
  · 매치업 분석 H2 헤딩과 라벨이 중복되지 않게 반드시 "📊 어드밴스드 스탯" 라벨만 사용.
  · 축구의 경우 xG 단독은 무효 — xGA 동반 필수, 양 팀 모두.
- **시뮬레이션 분포 1줄 — 축구 매치에만 필수.**
  · 입력 데이터의 'topScores' 가 비어 있지 않으면 별도 한 줄로 마크다운 볼드 처리해서 추가.
    형식 예시(별표 2개로 감싸기): 🎲 5,000회 시뮬 가장 흔한 스코어 — 2-1(8.2%), 1-1(7.8%), 2-0(7.1%)
  · 수치는 입력값 그대로 인용 (값 변형 금지). 라벨 이모지 🎲 유지.
- **베팅 라인 움직임 1줄 — 입력 'lineMovement' 가 있을 때만.**
  · 별도 한 줄로 마크다운 볼드 처리.
    형식 예시: 📈 라인 움직임 — 홈 38% → 41% (+3%p). 시장이 홈 쪽으로 이동 중.
  · 수치는 입력값 그대로. 가장 변화 큰 outcome 1개를 부각.
- H2H 패턴이 의미 있다면 짚는다. (없으면 생략)

## 핵심 변수 — 라인업·부상
- 결장자 1~3명 선정, 결장 영향도 평가.
- 예상 라인업의 전술적 의미 (있다면).

## 📊 스코어베이스 예측 — 5종 시장 동시 예측
표 형식. 모든 확률은 정수 %(반올림). 차이는 +/- %p. 0%는 "—"로 표기.
"차이" 컬럼 = 모델 - 시장 평균.

⚠️ 더블찬스·OVER/UNDER·핸디캡·BTTS는 위 컨텍스트의 "…예측(모델 확정값)" 을 표에 **그대로**
기입한다 — 픽·기준선·방향·확률 임의 변경 절대 금지(위젯과 단일 소스).
핸디캡 "모델 추정" 칸은 컨텍스트의 우세팀과 cover 확률을 쓴다 (예: "삼성 -1.5 / 62%").
방향을 반대 팀으로 뒤집지 마라. 컨텍스트에 해당 값이 없을 때만 종목 기준선으로 보수적 추정:
축구 2.5골 / 농구(NBA) 220.5점 / 하키(NHL) 5.5골 / 야구(MLB·NPB) 8.5런 / 야구(KBO) 9.5런.
"시장 평균" 컬럼 헤더의 개수는 위 "베팅사이트 평균 odds (N개사)" 의 N 을 그대로 쓸 것 (8 고정 금지).

| 시장 | 모델 추정 | 시장 평균 | 차이 |
|---|---|---|---|
| 1X2 (홈/무/원정) | 48% / 27% / 25% | 41% / 28% / 31% | +7%p (홈) |
| 더블 찬스 | ... | ... | ... |
| OVER/UNDER (종목 기준선) | ... | ... | ... |
| 핸디캡 (종목 라인) | ... | ... | ... |
| BTTS (축구·하키만) | ... | ... | ... |

- Value Bet이 있으면 ✨ 표시 + 한 줄 설명.
- AI Strong Pick(65%+)이 있으면 ⭐ 강조.
- **예측 신뢰도**: 입력의 "예측 신뢰도" 등급(높음/보통/낮음)을 표 아래 한 줄로 명시
  (예: "🎯 예측 신뢰도: 보통 — 최고확률 삼성 58%"). 입력값 그대로, 임의 변경 금지.
- **모델이 주목한 3가지**: 입력의 "모델이 본 핵심 이유" 항목을 불릿 3개로 풀어 쓴다.
  각 이유에 "왜 중요한지" 한 문장 해석 추가. 입력에 이유가 3개 미만이면 있는 것만.
- 입력에 "⚠️ 데이터 부족" 이 있으면 반드시 그 취지(표본 적어 신뢰도 낮음)를
  한 문장 경고로 본문에 포함한다. 없으면 언급하지 마라.

## 시즌 함의
이 경기 결과가 우승/강등/플레이오프 확률을 어떻게 흔드는지 1문단.

## 관전 포인트 (3개)
데이터 기반으로만. 감성적·미사여구 금지.
각 포인트는 "변수 + 근거" 형식.
예: "맨시티 홀란드의 박스 안 점유율 vs 아스널 PA 진입 차단율"

## 한 줄 마무리
경기의 통계적 핵심을 한 문장으로 압축. "감이 아니라, 숫자가 말한다" 톤.

(직후 — 입력 ctxLines 에 recentRecap 이 있을 때만)
한 줄 추가: 해당 팀의 직전 매치 분석을 자연스럽게 한 문장으로 인용 + 마크다운 링크 1개.
예) "${home} 의 직전 경기 분석은 [지난 매치 리뷰](/articles/{slug})에서 더 자세히 확인할 수 있다."
링크 텍스트는 입력 recentRecap.title 을 활용하되 자연스럽게 짧게 다듬어도 좋다.

# HARD RULES
- 데이터에 없는 사실 절대 추측 금지. 데이터에 없으면 그 단락 생략.
- 출처에 없는 선수 이름·기록 절대 만들어내지 마라(할루시네이션 금지).
- 분량 제한 없음 — 데이터 풍부한 만큼 충분히 풀어내라.
- 마지막에 면책: "본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다."

# INPUT JSON 시작 →
[match]
- 리그: ${match.league}
- 일시: ${dateStr} (KST)
- 홈: ${home}
- 원정: ${away}

[제공된 분석 데이터]
${ctxLines.length ? ctxLines.join("\n") : "(데이터 없음 — 위 HARD RULES 에 따라 추측 금지)"}
`;
}
