// 야구(KBO/NPB/MLB) 주간 리그 리뷰 프롬프트 — 순위·이번 주 결과·팀 지표를 서사로.
// 결정론적 실측 데이터(승률·게임차·팀 타율/ERA/홈런·연속기록)를 주입하고, 서사만 자유 생성.
// 수치 창작·변형 금지. 야구는 승률제(무승부 극소수) — 축구식 승점·강등·골득실 프레임 금지.
import type { BaseballWeeklyReviewData } from "@/lib/sports/baseball/weekly-review";

const pctStr = (p: number) => p.toFixed(3).replace(/^0/, ""); // 0.619 → .619 (야구 관례)

export function buildBaseballWeeklyReviewPrompt(d: BaseballWeeklyReviewData): string {
  const L: string[] = [];

  L.push(`[리그] ${d.league} ${d.season} 시즌 — ${d.weekLabelKo} 주간 리뷰`);
  L.push(`[이번 주 완료 경기] ${d.gamesThisWeek}경기`);
  L.push("");

  // --- 순위 (결정론적) ---
  L.push("[순위 — 승률 순. 이 수치만 인용, 창작 금지]");
  for (const s of d.standings) {
    const wk = s.weekW + s.weekL > 0 ? ` · 이번주 ${s.weekW}승${s.weekL}패` : "";
    const st = s.streak ? ` · ${s.streak}` : "";
    L.push(
      ` ${s.rank}. ${s.team} ${s.wins}승${s.losses}패${s.draws > 0 ? `${s.draws}무` : ""} (${s.games}경기) 승률 ${pctStr(s.pct)} · ${s.rank === 1 ? "선두" : `${s.gb}게임차`}${wk}${st}`,
    );
  }
  L.push("");

  // --- 팀 지표 리더 (결정론적) ---
  L.push("[팀 지표 리더 — 이 수치만 인용]");
  if (d.leaders.avg.length) L.push(` - 팀 타율: ${d.leaders.avg.map((x) => `${x.team} ${pctStr(x.value)}`).join(" · ")}`);
  if (d.leaders.homeRuns.length) L.push(` - 팀 홈런: ${d.leaders.homeRuns.map((x) => `${x.team} ${x.value}개`).join(" · ")}`);
  if (d.leaders.era.length) L.push(` - 팀 평균자책점(낮은 순): ${d.leaders.era.map((x) => `${x.team} ${x.value}`).join(" · ")}`);
  L.push("");

  // --- 이번 주 인상적 결과 (결정론적) ---
  if (d.notableResults.length) {
    L.push("[이번 주 인상적 결과 — 점수차 큰 경기]");
    for (const r of d.notableResults) L.push(` - ${r}`);
    L.push("");
  }

  // === 작성 가이드 ===
  L.push("---");
  L.push(`위 실측 데이터를 근거로 '${d.league} ${d.weekLabelKo}' 주간 리그 리뷰를 한국 야구 팬 대상으로 작성하시오.`);
  L.push("렌더링: react-markdown + GitHub Flavored Markdown (표 / blockquote / 링크 지원).");
  L.push("");
  L.push("[필수 구조 — 이 순서·헤딩 그대로]");
  L.push("");
  L.push(`# (제목: '${d.league}' + 주차 맥락 + 이번 주 핵심 흐름을 결합. 예: "선두 ${d.standings[0].team} 주춤·추격전 가열 — ${d.league} ${d.weekLabelKo} 판도". 이모지 없이, 검색 친화적으로. 순위·연속기록 등 위 데이터에 있는 사실만 제목에 반영)`);
  L.push("");
  L.push("> **한눈에 요약** — 이번 주 핵심 4줄 (선두 판도 / 가장 뜨거운 팀 / 부진한 팀 / 다음 주 관전 포인트). 각 줄 한 문장.");
  L.push("");
  L.push("## 순위 판도");
  L.push("먼저 전체 순위를 markdown 표(순위 | 팀 | 승-패 | 승률 | 게임차 | 이번주)로 제시하라. 이어서 선두 경쟁·중위권 5강 다툼·하위권 상황을 3단락 이상으로 해석. 게임차와 승률 수치를 근거로 순위 흐름을 서술하되, 위 데이터에 있는 숫자만 사용. 야구는 승률·게임차로 순위를 매기며 승점·골득실·강등 개념은 없다 — 이 용어들을 쓰지 말 것.");
  L.push("");
  L.push("## 이번 주 핫이슈");
  L.push("이번 주 전적·연속기록·인상적 결과를 근거로 가장 주목할 팀들의 흐름을 3단락 이상으로. 연승/연패 팀, 이번 주 성적이 좋았던·나빴던 팀, 큰 점수차 경기를 장면으로 풀어라. 위 '이번 주 인상적 결과'의 스코어는 그대로 인용하고, 없는 경기·선수 발언·부상은 지어내지 말 것.");
  L.push("");
  L.push("## 팀 타격·투구 지표");
  L.push("팀 지표 리더를 markdown 표(부문 | 1위 | 2위 | 3위)로 정리하고, 타격 강팀과 마운드 강팀을 2단락 이상으로 해석. 타율·홈런·평균자책점 수치를 그대로 인용하고, 이 지표가 순위와 어떻게 연결되는지 설명. 순위가 주어지지 않은 개별 선수 기록은 지어내지 말 것.");
  L.push("");
  L.push("## 다음 주 관전 포인트");
  L.push("현재 순위 흐름과 게임차를 근거로 다음 주에 주목할 순위 싸움을 2단락으로. 구체적 경기 일정·상대는 위 데이터에 없으므로 지어내지 말고, 순위·게임차·팀 폼만으로 관전 포인트를 서술. 승패 확률·구체 스코어 예측 금지.");
  L.push("");
  L.push("## 더 보기");
  L.push(`> [${d.league} 순위·일정](/leagues/${d.league}) · [실시간 스코어](/scores?sport=baseball) 도 함께 보세요.`);
  L.push("");
  L.push("[규칙]");
  L.push("- [표 2개 필수] '순위 판도'의 전체 순위 표와 '팀 타격·투구 지표'의 리더 표를 반드시 모두 포함하라. 표 누락은 실패로 간주한다.");
  L.push("- [섹션 분량 필수] 각 ## 섹션은 지정한 단락 수(순위 판도 3단락+, 핫이슈 3단락+, 지표 2단락+, 관전포인트 2단락)를 반드시 채운다. 표는 단락 수에 포함하지 않는다.");
  L.push("- 모든 승률·게임차·전적·타율·ERA·홈런 수치는 위 데이터를 그대로 인용. 창작·반올림 변형·없는 기록 추가 절대 금지.");
  L.push("- 위 데이터에 없는 사실(개별 선수 성적·감독/선수 발언·부상·트레이드·다음 주 구체 일정)은 만들어내지 말 것.");
  L.push("- 소화 경기수·승차 등은 위 순위 데이터에 주어진 각 팀의 값만 사용하고, 여러 팀을 하나의 수치로 뭉뚱그리지 말 것(팀마다 경기수가 다르다).");
  L.push("- 야구 용어를 지킬 것: 순위는 승률과 게임차로 매긴다. 승점·골득실·강등권 같은 축구 용어 금지. 무승부는 극소수이니 없으면 언급하지 말 것.");
  L.push("- 베팅·도박·픽 추천 어조 금지. 데이터 저널리즘 톤.");
  L.push("- 본문 3,000~4,500자 (표 포함). 분량은 같은 말 반복이 아니라 데이터 해석·맥락·서사의 깊이로 채울 것. 표는 markdown 문법(`|`)으로만, ASCII art 금지.");
  L.push("- 마지막 섹션은 '더 보기'. 별도 '결론' 헤딩 추가 금지.");
  L.push("- 한국어 문장은 마침표로 끝낼 것. 콜론(:)으로 문장을 끝내지 말 것.");

  return L.join("\n");
}
