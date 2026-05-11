// LCK / LoL 매치 프리뷰 전용 프롬프트.
// 축구 패턴(xG·BTTS·홈/원정 등)이 적용되지 않도록 일반 PreviewPrompt 와 완전히 분리.
//
// 데이터 갭 정책: 부재 항목은 HARD RULES 에 따라 해당 단락을 통째로 생략 (추측 금지).
// 풍성한 데이터(rosters·playerStats)는 Leaguepedia 통합 — graceful 실패 시 자동 생략.

import type {
  PreviewPromptInput,
  LolRosterPlayer,
  LolPlayerStatsLite,
} from "./match-preview";
import { toKoreanTeamName } from "@/lib/team-names";
import { championKoreanName } from "@/lib/sports/leaguepedia";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

const ROLE_KO: Record<string, string> = {
  Top: "TOP",
  Jungle: "JGL",
  Mid: "MID",
  Bot: "ADC",
  Support: "SUP",
};

function rosterLine(label: string, players: LolRosterPlayer[]): string {
  if (players.length === 0) return "";
  const order = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const sorted = [...players].sort(
    (a, b) => order.indexOf(a.role) - order.indexOf(b.role),
  );
  const items = sorted.map((p) => {
    const koPart = p.nameKo ? `, ${p.nameKo}` : "";
    return `${ROLE_KO[p.role] ?? p.role} ${p.id}(${p.nameEn}${koPart})`;
  });
  return `- ${label}: ${items.join(" / ")}`;
}

function statsLine(
  playerId: string,
  stats: LolPlayerStatsLite | undefined,
): string {
  if (!stats) return "";
  const champs = stats.topChampions
    .map(
      (c) =>
        `${championKoreanName(c.champion)}(${c.games}경기)`,
    )
    .join(", ");
  return `  · ${playerId} 시즌 ${stats.games}경기 평균 KDA ${stats.kda.toFixed(2)}${champs ? ` · 챔피언풀: ${champs}` : ""}`;
}

export function buildLolPreviewPrompt(input: PreviewPromptInput): string {
  const { match, context = {} } = input;
  const t1 = toKoreanTeamName(match.homeTeam.name);
  const t2 = toKoreanTeamName(match.awayTeam.name);
  const dateStr = match.startTime.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });

  // 컨텍스트 라인 — 있는 것만 채움.
  const ctxLines: string[] = [];
  ctxLines.push(
    `- match: 리그=${match.league}, ${t1} vs ${t2}, ${dateStr} (KST)`,
  );

  if (context.lolMeta?.patch) {
    ctxLines.push(
      `- patch: ${context.lolMeta.patch} (Data Dragon 기준 현재 라이브 패치)`,
    );
  }
  if (context.lolMeta?.standings) {
    const s = context.lolMeta.standings;
    ctxLines.push(
      `- standings (LCK 정규시즌 매치 결과 집계): ${t1} ${s.home.rank}위 (${s.home.wins}승 ${s.home.losses}패, 세트 ${s.home.setsWon}-${s.home.setsLost}) / ${t2} ${s.away.rank}위 (${s.away.wins}승 ${s.away.losses}패, 세트 ${s.away.setsWon}-${s.away.setsLost}) — 총 ${s.total}팀`,
    );
  }
  if (context.elo) {
    ctxLines.push(
      `- elo: ${t1} ${Math.round(context.elo.home)} / ${t2} ${Math.round(context.elo.away)}`,
    );
  }
  if (context.winProb) {
    ctxLines.push(
      `- winProb (시리즈 승자, 모델 1X2): ${t1} ${pct(context.winProb.home)} / ${t2} ${pct(context.winProb.away)}`,
    );
  }
  if (context.recentForm) {
    ctxLines.push(
      `- recent_form (최근 5시리즈, W=승 시리즈 / L=패 시리즈): ${t1} ${context.recentForm.home.join("-") || "-"} / ${t2} ${context.recentForm.away.join("-") || "-"}`,
    );
  }
  if (context.streak) {
    ctxLines.push(
      `- streak: ${t1} ${context.streak.home.winning}연승·${context.streak.home.losing}연패 / ${t2} ${context.streak.away.winning}연승·${context.streak.away.losing}연패`,
    );
  }
  if (context.trend) {
    ctxLines.push(
      `- trend (시리즈당 평균 세트): ${t1} 획득 ${context.trend.home.gf.toFixed(2)} · 허용 ${context.trend.home.ga.toFixed(2)} / ${t2} 획득 ${context.trend.away.gf.toFixed(2)} · 허용 ${context.trend.away.ga.toFixed(2)}`,
    );
  }
  if (context.h2h && context.h2h.total > 0) {
    ctxLines.push(
      `- h2h (최근 맞대결 시리즈 ${context.h2h.total}회): ${t1} ${context.h2h.homeWins}승 / ${t2} ${context.h2h.awayWins}승`,
    );
  }
  // 게임 수 OVER/UNDER (Bo3 풀세트 확률)
  if (context.lolMeta?.gameCountMarket) {
    const g = context.lolMeta.gameCountMarket;
    ctxLines.push(
      `- gameCountMarket (Bo3 게임 수 OVER/UNDER ${g.line}): 풀세트(3게임) 확률 ${pct(g.pOver)} (정규시즌 ${g.sample}매치 빈도 기반)`,
    );
  }
  // 로스터
  if (context.lolMeta?.rosters) {
    const r = context.lolMeta.rosters;
    if (r.home.length > 0) ctxLines.push(rosterLine(`rosters ${t1}`, r.home));
    if (r.away.length > 0) ctxLines.push(rosterLine(`rosters ${t2}`, r.away));
  }
  // 선수 통계
  if (context.lolMeta?.playerStats) {
    const ps = context.lolMeta.playerStats;
    const lines = Object.keys(ps).map((id) => statsLine(id, ps[id])).filter(Boolean);
    if (lines.length > 0) {
      ctxLines.push("- playerStats (Leaguepedia ScoreboardPlayers 시즌 집계):");
      ctxLines.push(...lines);
    }
  }

  // 부재 데이터 명시 — GPT 가 할루시네이션 못 하도록.
  const absentLines: string[] = [];
  if (!context.lolMeta?.patch) {
    absentLines.push("- patch: (미수집)");
  }
  if (!context.lolMeta?.rosters) {
    absentLines.push(
      "- rosters: (미수집 — 5라인 매치업 단락 통째로 생략, 선수 ID/본명 언급 금지)",
    );
  }
  if (!context.lolMeta?.playerStats) {
    absentLines.push(
      "- player_stats (KDA·CS/min·DPM): (미수집 — 라인별 매치업에 통계 인용 금지)",
    );
  }
  absentLines.push(
    "- meta_context (1티어 챔피언 활용도·픽밴): (미수집 — '챔피언 픽·밴 예측' 단락 통째로 생략)",
    "- market_odds: (미수집 — 시장 평균 컬럼은 표에서 통째로 제거)",
  );

  return `# ROLE
당신은 LoL e스포츠 데이터 분석가다. Esports Wikis, Leaguepedia, OP.GG 수준의 데이터 분석을 한국어로 작성한다.

# CONTEXT
이 글은 "스코어베이스(Scorebase)" — 통계 기반 AI 스포츠 분석 미디어 — LCK / 롤드컵 카테고리에 게재된다. 도박·베팅과 무관, 데이터 미디어.

# MISSION
LoL 매치 프리뷰(시리즈 단위)를 작성한다.

# WRITING DOCTRINE
1. 패치 컨텍스트를 도입부에 명시. 헤드라인에 patch 가 등장하면 본문에서 반드시 영향을 풀어쓴다.
2. 라인별 매치업 분석 (TOP/JGL/MID/ADC/SUP 5라인 전부 — rosters 있을 때만)
3. 챔피언 픽·밴 예측 (meta_context 있을 때만)
4. 시리즈 단위 + 게임 단위 분리 (게임 수 OVER/UNDER 가 있으면 시리즈 길이 풀어쓰기)
5. 도박 권유 표현 절대 금지
6. 본문에 **최소 2명**의 선수를 "ID(영문ID, 본명)" 형식으로 표기 강제. 예: 페이커(Faker, 이상혁), 제우스(Zeus, 최우제). 단 rosters 가 미수집이면 이 규칙 면제 — 선수 이름 자체를 등장시키지 마라.
7. 챔피언명은 한국 공식 표기 (예: Aatrox → 아트록스, Kai'Sa → 카이사)

# OUTPUT STRUCTURE (900~1300자)

## 패치 컨텍스트
입력 'patch' 가 있을 때만 출력. 단락 제목 "## 패치 컨텍스트" 그대로 유지.
- 현재 패치 버전 명시 (예: ${context.lolMeta?.patch ?? "X.Y.Z"})
- **meta_context 가 없는 경우 — "여러 챔피언 밸런스 변화", "메타 변화", "전반적 메타 분석" 같은 추측성 일반 표현 금지.** 패치 핵심 변경점은 절대 만들어내지 마라. 대신 "현재 ${context.lolMeta?.patch ?? "X.Y.Z"} 패치 환경에서 치러지는 LCK 정규시즌 매치" 정도로 사실 진술 + 시리즈의 시즌적 위치(1위 경쟁, 플레이오프 시드 등)로 2~3문장만.
- 입력 'patch' 가 없으면 단락 제목을 "## 도입"으로 바꾸고 시즌적 위치만 2~3문장.

## 5라인 매치업
입력 'rosters' 가 있을 때만 출력. 없으면 **이 단락 통째로 생략.**
있을 때 정확히 다음 5라인 모두 출력 (생략 금지):
- **TOP**: 양 팀 톱 라이너 ID(영문ID, 본명). playerStats 가 있으면 KDA·챔피언풀 1~2문장 비교.
- **JGL**: 정글러 매치업.
- **MID**: 미드 라이너 비교 — 임팩트가 가장 큰 라인. playerStats 우선 인용.
- **ADC**: 봇 라이너.
- **SUP**: 서포터 매치업.
각 라인은 1~2문장. 선수 이름은 첫 등장만 풀 표기, 이후는 ID만.

## 챔피언 픽·밴 예측
입력 'meta_context' 가 있을 때만 출력. 없으면 **이 단락 통째로 생략** (1티어 챔피언·밴 우선순위 추측 금지).

## 시리즈 흐름 분석
'recent_form', 'streak', 'trend', 'h2h' 를 종합해 1문단. 최근 5시리즈 결과, 평균 세트 카운트(BO3 기준 2-0 vs 2-1 비율), 맞대결 전적 비교. **"홈/원정", "경기당 득점", "강등권" 같은 비-LoL 용어 절대 사용 금지.** LCK 는 한 스튜디오 진행이라 홈/원정 의미 없음.

## 모델 관점 — 시리즈 예측 표
**단락 제목 "## 모델 관점 — 시리즈 예측 표" 한 줄을 반드시 표 위에 출력**한다 (생략 금지).
**일반 마크다운 표 사용 — 절대 백틱 3개(\`\`\`) 코드 블록으로 감싸지 마라.** GitHub Flavored Markdown 표 그대로:

반드시 정확히 2컬럼 헤더로 시작 — 첫 줄: 파이프 시장 파이프 모델 추정 파이프, 둘째 줄: 파이프 --- 파이프 --- 파이프.

행 (입력 데이터 있을 때만):
- "시리즈 승자" 행 — 항상 출력. 형식: ${t1} XX% / ${t2} XX%
- "게임 수 OVER/UNDER 2.5 (Bo3)" 행 — 'gameCountMarket' 있을 때만. 형식: OVER XX% / UNDER YY% (XX는 입력 pOver를 정수 %로, YY = 100-XX)
- **1게임 핸디캡, 1게임 총 킬 OVER/UNDER** 행 — 입력 데이터에 없으면 **표에서 통째로 제거**. 추측해서 채우지 마라.

표 행 수와 헤더 컬럼 수(2)가 반드시 일치. 헤더 1컬럼인데 데이터 행 2컬럼 같은 깨진 표 절대 출력 금지.

## 시즌 함의
LCK 정규 시즌 컨텍스트 — 플레이오프 진출 가능성, 스플릿 1위 경쟁, MSI/Worlds 시드 영향. 강등 관련 표현 금지 (LCK 강등제 없음). standings 가 있으면 순위·승점을 인용.

## 관전 포인트 3가지
각 포인트는 "변수 + 근거" 형식. 데이터에 있는 항목만 사용.
선수 ID 가 있으면 적어도 한 포인트는 선수 매치업으로.

## 한 줄 마무리
경기의 통계적 핵심을 한 문장으로 압축. 숫자 톤 유지.

# HARD RULES
- 데이터에 없는 사실 절대 추측 금지. 입력에 없는 선수 이름·챔피언명·KDA·패치 변경점 만들어내지 마라.
- 부재 단락은 통째로 생략 — 빈 단락 제목 출력 금지, "정보가 없습니다" 같은 채움 문구 금지.
- "홈/원정", "득점/실점/골", "강등권", "xG", "xGA", "Net Rating", "Corsi", "선발 ERA" 등 비-LoL 용어 절대 금지.
- 세트 점수는 "2-0", "2-1" 카운트 표기. "2득점" 같은 표현 금지.
- 분량: 데이터 갭이 크면 600~900자, 풍부하면 1100~1300자. 채우려고 추측하지 마라.
- 면책: 글 끝에 "본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다."

# INPUT DATA
[제공된 항목]
${ctxLines.join("\n")}

[부재 항목 — 위 OUTPUT STRUCTURE 의 단락 생략 규칙 적용]
${absentLines.join("\n")}
`;
}
