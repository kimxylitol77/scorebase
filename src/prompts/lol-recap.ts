// LCK / LoL 매치 RECAP(리뷰) 전용 프롬프트.
// 끝난 시리즈의 결과·세트 흐름·5라인 매치업 결과·시즌 영향 정리.

import type {
  PreviewPromptInput,
  LolRosterPlayer,
  LolPlayerStatsLite,
} from "./match-preview";
import { toKoreanTeamName } from "@/lib/team-names";
import { championKoreanName } from "@/lib/sports/leaguepedia";

const ROLE_KO: Record<string, string> = {
  Top: "TOP",
  Jungle: "JGL",
  Mid: "MID",
  Bot: "ADC",
  Support: "SUP",
};

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

function rosterLine(label: string, players: LolRosterPlayer[]): string {
  if (players.length === 0) return "";
  const order = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const sorted = [...players].sort(
    (a, b) => order.indexOf(a.role) - order.indexOf(b.role),
  );
  const items = sorted.map((p) => {
    const inner: string[] = [];
    if (p.nameEn) inner.push(p.nameEn);
    if (p.nameKo) inner.push(p.nameKo);
    const namePart = inner.length > 0 ? `(${inner.join(", ")})` : "";
    const champs =
      p.recentChampions && p.recentChampions.length > 0
        ? ` [최근: ${p.recentChampions.map(championKoreanName).join("·")}]`
        : "";
    return `${ROLE_KO[p.role] ?? p.role} ${p.id}${namePart}${champs}`;
  });
  return `- ${label}: ${items.join(" / ")}`;
}

function statsLine(
  playerId: string,
  stats: LolPlayerStatsLite | undefined,
): string {
  if (!stats) return "";
  const parts: string[] = [`${stats.games}경기 평균 KDA ${stats.kda.toFixed(2)}`];
  if (stats.avgCs != null) parts.push(`CS ${stats.avgCs.toFixed(0)}`);
  if (stats.avgDpm != null) parts.push(`DMG ${stats.avgDpm.toFixed(0)}`);
  if (stats.avgGpm != null) parts.push(`GPM ${stats.avgGpm.toFixed(0)}`);
  const champs = stats.topChampions
    .map((c) => `${championKoreanName(c.champion)}(${c.games})`)
    .join(", ");
  if (champs) parts.push(`챔피언풀: ${champs}`);
  return `  · ${playerId} ${parts.join(" · ")}`;
}

export function buildLolRecapPrompt(input: PreviewPromptInput): string {
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

  // 시리즈 결과 — 입력 match.raw 에 BDL 매치 객체. 또는 homeScore/awayScore.
  const home = (match as unknown as { homeScore?: number | null }).homeScore;
  const away = (match as unknown as { awayScore?: number | null }).awayScore;
  const homeSets = typeof home === "number" ? home : null;
  const awaySets = typeof away === "number" ? away : null;
  const winnerName =
    homeSets != null && awaySets != null
      ? homeSets > awaySets
        ? t1
        : awaySets > homeSets
          ? t2
          : null
      : null;
  const seriesScore =
    homeSets != null && awaySets != null
      ? `${homeSets}-${awaySets}`
      : "?";

  // 모델 적중 여부 — context.lolMeta.recap 에서 받음
  const predCorrect = context.lolMeta?.recap?.predCorrect;
  const predWinner = context.lolMeta?.recap?.predWinner;
  const modelHit =
    predCorrect === true
      ? "✓ 모델 적중"
      : predCorrect === false
        ? "✗ 모델 빗나감"
        : "";

  const ctxLines: string[] = [];
  ctxLines.push(
    `- match: 리그=${match.league}, ${t1} ${seriesScore} ${t2}, ${dateStr} (KST)${winnerName ? ` — 승자: ${winnerName}` : ""}`,
  );
  if (predWinner && predCorrect != null) {
    ctxLines.push(
      `- modelPrediction: 시리즈 예측 ${predWinner === "HOME" ? t1 : t2} ${modelHit}`,
    );
  }
  if (context.lolMeta?.patch) {
    ctxLines.push(`- patch: ${context.lolMeta.patch}`);
  }
  if (context.lolMeta?.standings) {
    const s = context.lolMeta.standings;
    ctxLines.push(
      `- standings (이 매치 결과 반영 전): ${t1} ${s.home.rank}위 (${s.home.wins}승 ${s.home.losses}패) / ${t2} ${s.away.rank}위 (${s.away.wins}승 ${s.away.losses}패) — 총 ${s.total}팀`,
    );
  }
  if (context.elo) {
    ctxLines.push(
      `- elo (매치 전 기준): ${t1} ${Math.round(context.elo.home)} / ${t2} ${Math.round(context.elo.away)}`,
    );
  }
  if (context.winProb) {
    ctxLines.push(
      `- 사전 모델 승률: ${t1} ${pct(context.winProb.home)} / ${t2} ${pct(context.winProb.away)}`,
    );
  }
  if (context.recentForm) {
    ctxLines.push(
      `- recent_form (이 매치 포함, 가장 최근부터): ${t1} ${context.recentForm.home.join("-") || "-"} / ${t2} ${context.recentForm.away.join("-") || "-"}`,
    );
  }
  if (context.h2h && context.h2h.total > 0) {
    ctxLines.push(
      `- h2h (이 매치 포함, 최근 ${context.h2h.total}회): ${t1} ${context.h2h.homeWins}승 / ${t2} ${context.h2h.awayWins}승`,
    );
  }
  if (context.lolMeta?.rosters) {
    const r = context.lolMeta.rosters;
    if (r.home.length > 0) ctxLines.push(rosterLine(`rosters ${t1}`, r.home));
    if (r.away.length > 0) ctxLines.push(rosterLine(`rosters ${t2}`, r.away));
  }
  if (context.lolMeta?.playerStats) {
    const ps = context.lolMeta.playerStats;
    const lines = Object.keys(ps)
      .map((id) => statsLine(id, ps[id]))
      .filter(Boolean);
    if (lines.length > 0) {
      ctxLines.push("- playerStats (BDL 시즌 집계 — 매치 포함 전체):");
      ctxLines.push(...lines);
    }
  }
  // 시장 odds 와 모델 비교 (사후 검증용 — 시장이 옳았나)
  if (context.marketProb) {
    ctxLines.push(
      `- 시장 평균 (베팅사 평균 vig-free): ${t1} ${pct(context.marketProb.home)} / ${t2} ${pct(context.marketProb.away)}`,
    );
  }

  const absentLines: string[] = [];
  if (!context.lolMeta?.rosters) {
    absentLines.push(
      "- rosters: (미수집 — 5라인 매치업 단락 통째로 생략, 선수 ID 언급 금지)",
    );
  }

  return `# ROLE
당신은 LoL e스포츠 데이터 분석가다. Esports Wikis · Leaguepedia · OP.GG 수준의 분석 톤으로 한국어 매치 리뷰를 작성한다.

# CONTEXT
스코어베이스(Scorebase) LCK / 롤드컵 카테고리의 매치 결과 리뷰. 도박·베팅 권유 아닌 데이터 미디어.

# MISSION
끝난 시리즈의 결과·세트 흐름·라인별 매치업·시즌 함의를 정리한다.

# WRITING DOCTRINE
1. 결과를 헤드라인 첫줄에서 명확히. 세트 카운트(2-0, 2-1, 3-0 등)는 정확히.
2. 5라인 매치업 결과 분석 (rosters 있을 때만, TOP/JGL/MID/ADC/SUP)
3. 선수 첫 등장 시 "ID(영문본명, 한국본명)" — 본명 데이터 없으면 ID 만
4. 챔피언명은 한국 공식 표기 (Aatrox → 아트록스, Kai'Sa → 카이사)
5. 모델 사전 예측 vs 실제 결과 비교 (적중/빗나감) — 있을 때만
6. 사후 평가는 데이터 기반. 감성적 미사여구 금지.

# OUTPUT STRUCTURE (900~1300자)

## [헤드라인]
패턴: "[승자]의 [핵심 변수], [패자]를 [세트 카운트]으로 [표현] — [매치 의미]"
예: "T1의 미드 장악, 농심을 2-0으로 정리 — 4위 굳히기"

## 도입
시리즈 결과와 시즌적 위치를 2~3문장. patch 정보 있으면 패치 환경 짧게 언급.

## 5라인 매치업 결과
입력 'rosters' 가 있을 때만 출력. 없으면 **통째로 생략.**
양 팀에 존재하는 모든 라인 순서대로 (TOP/JGL/MID/ADC/SUP):
- **TOP**: 양 팀 톱 라이너 비교. recentChampions·playerStats 활용해 1~2문장.
- **JGL**: 정글러 매치업 결과.
- **MID**: 미드 비교 — 임팩트가 가장 큰 라인.
- **ADC**: 봇 라이너.
- **SUP**: 서포터.
각 라인 1~2문장. 추측 금지. 데이터에 없는 선수 이름·KDA·챔피언 만들지 마라.

## 시리즈 흐름
세트별 흐름을 2~3문장으로 정리. 'recent_form'·'h2h'·streak 변화를 종합. **"홈/원정", "득점/실점", "강등권" 같은 비-LoL 용어 절대 금지.**

## 모델 검증
- 사전 모델 예측(${context.winProb ? `${t1} ${pct(context.winProb.home)} / ${t2} ${pct(context.winProb.away)}` : "데이터 없음"}) vs 실제 결과(${seriesScore})
- 모델 적중/빗나감 평가 1문장
- 시장 평균(${context.marketProb ? `${t1} ${pct(context.marketProb.home)} / ${t2} ${pct(context.marketProb.away)}` : "미수집"})과 비교 — 어느 쪽이 더 정확했나
- 추측·과장 금지. 데이터에 보이는 것만.

## 시즌 함의
- 이 결과가 standings · 플레이오프 시드 · 스플릿 경쟁에 어떤 영향
- 입력 'standings' 있으면 정확히 인용. "강등권" 표현 금지 (LCK 강등제 없음).

## 한 줄 마무리
경기의 통계적 핵심을 한 문장으로. 숫자 톤 유지.

# HARD RULES
- 데이터에 없는 사실 절대 추측 금지.
- 본명 환상 금지: nameKo 데이터 없으면 본명 표기 X. ID 만.
- 같은 라인에 양 팀 다른 선수만 매핑. 같은 ID 양쪽 사용 금지.
- "홈/원정", "득점/실점/골", "강등권", "xG", "xGA", "Net Rating", "Corsi" 등 비-LoL 용어 절대 금지.
- 세트 점수는 "2-0", "2-1" 정확한 카운트.
- 분량: 데이터 갭이 크면 600~900자, 풍부하면 1100~1400자. 추측해서 채우지 마라.
- 면책: 글 끝에 "본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다."

# INPUT DATA
[제공된 항목]
${ctxLines.join("\n")}

${absentLines.length > 0 ? `[부재 항목 — OUTPUT STRUCTURE 단락 생략 규칙 적용]\n${absentLines.join("\n")}` : ""}
`;
}
