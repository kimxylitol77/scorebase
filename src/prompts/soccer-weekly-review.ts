// 축구 빅5 주간 리뷰 프롬프트 — 결과·팀 주간 성적·MVP 선수/감독·이변을 서사로.
// 결정론적 실측 데이터만 주입하고 서사만 자유 생성. 수치 창작·변형 금지.
import type { SoccerWeeklyReviewData } from "@/lib/soccer/weekly-review";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export function buildSoccerWeeklyReviewPrompt(d: SoccerWeeklyReviewData): string {
  const leagueKo = LEAGUE_DISPLAY[d.league] ?? d.league;
  const L: string[] = [];

  L.push(`[리그] ${leagueKo} 주간 리뷰 — ${d.from} ~ ${d.to} (완료 ${d.matchCount}경기)`);
  L.push("");

  L.push("[이번 주 결과 — 이 스코어만 인용, 창작 금지]");
  for (const m of d.matches) L.push(` ${m.homeKo} ${m.homeScore}:${m.awayScore} ${m.awayKo}`);
  L.push("");

  L.push("[팀 주간 성적 — 승점 순. '기대 승점'은 베팅 시장 확률로 환산한 값]");
  for (const t of d.teams.slice(0, 8)) {
    const exp = t.expectedPoints != null ? ` · 기대 ${t.expectedPoints}점 (${t.overPerf! >= 0 ? "+" : ""}${t.overPerf})` : "";
    const coach = t.coachKo ? ` · 감독 ${t.coachKo}` : "";
    L.push(` ${t.teamKo} ${t.won}승${t.drawn}무${t.lost}패 ${t.goalsFor}득${t.goalsAgainst}실 승점 ${t.points}${exp}${coach}`);
  }
  L.push("");

  if (d.mvpCoach) {
    const r = d.mvpCoach.row;
    L.push(`[주간 MVP 감독] ${d.mvpCoach.coachKo} (${d.mvpCoach.teamKo}) — 주간 ${r.won}승${r.drawn}무${r.lost}패 승점 ${r.points}${r.overPerf != null ? `, 시장 기대 대비 +${r.overPerf}점` : ""}`);
    L.push("");
  }

  if (d.mvpPlayer) {
    L.push(`[주간 MVP 선수] ${d.mvpPlayer.name} (${d.mvpPlayer.countryKo || d.mvpPlayer.country}) — 평점 ${d.mvpPlayer.rating.toFixed(2)}, ${d.mvpPlayer.goals}골 ${d.mvpPlayer.assists}도움`);
  }
  if (d.xiBrief.length > 0) {
    L.push("[주간 활약 상위 — 평점 순]");
    for (const p of d.xiBrief) L.push(` ${p.name} (${p.teamKo}) 평점 ${p.rating.toFixed(2)} · ${p.goals}골 ${p.assists}도움`);
    L.push("");
  }

  if (d.upsets.length > 0) {
    L.push("[이변 — 시장 승리 확률 35% 미만이었던 승리]");
    for (const u of d.upsets.slice(0, 3)) {
      L.push(` ${u.homeKo} ${u.homeScore}:${u.awayScore} ${u.awayKo} — ${u.upsetWinnerKo} 승리 (시장 확률 ${Math.round(u.upsetProb! * 100)}%)`);
    }
    L.push("");
  }

  L.push(
    [
      "위 데이터로 한국어 주간 리뷰 기사를 작성하라.",
      "형식: 첫 줄 `# 제목` (리그명 + 이번 주 흐름을 담은 구체적 제목, 낚시 금지).",
      "섹션: ## 이번 주 흐름(리그 전체 서사 2~3문단) → ## 주간 MVP" +
        (d.mvpCoach ? " → ## 주간 MVP 감독" : "") +
        (d.upsets.length ? " → ## 이번 주 이변" : "") +
        " → ## 다음 주 관전 포인트(짧게).",
      "주간 MVP 섹션은 선수의 평점·골·도움 수치를 근거로, MVP 감독 섹션은 승점과 시장 기대 대비 초과성과를 근거로 서술하라.",
      "규칙: 위에 주입된 수치만 사용(스코어·승점·평점·확률). 없는 수치·순위·부상·이적 언급 금지.",
      "문장은 마침표로 끝낸다(콜론 종결 금지). 이모지 금지. 2,000자 이상.",
    ].join("\n"),
  );

  return L.join("\n");
}
