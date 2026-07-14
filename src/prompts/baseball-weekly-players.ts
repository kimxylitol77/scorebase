// MLB 주간 베스트 선수 프롬프트 — 주간 타자/투수 리더보드를 서사로.
// 결정론적 실측 데이터(statsapi byDateRange)를 주입하고 서사만 자유 생성. 수치·이름 창작/변형 금지.
import type { MlbWeeklyPlayersData } from "@/lib/sports/baseball/mlb-weekly-players";

// 심판관(article-judge)에 넘길 이 글 유형의 SEO/GEO·페르소나 체크 항목.
export const MLB_WEEKLY_PLAYERS_RUBRIC = `[구조]
- H1 제목 1개(맨 위). 이모지·클릭베이트 없이, 이번 주 핵심 활약을 담을 것.
- 제목 아래 굵은 한 줄 요약(> **한눈에 요약**) blockquote.
- markdown 표 2개 필수: '주간 베스트 타자' 표, '주간 베스트 투수' 표.
- 마지막 섹션은 '더 보기'. 별도 '결론' 헤딩 없음.
[AEO — 답변 우선]
- 각 ## 섹션은 첫 1~2문장에서 결론부터 제시(핵심 선수·수치를 앞에).
[GEO — 자체 데이터]
- 우리 집계(주간 타자/투수 리더보드) 수치가 본문에 실제로 인용되어 있을 것.
[페르소나·톤]
- Scorebase 분석 기자체(단정한 문어체). 데이터 저널리즘 톤.
- 이모지·말줄임표 남용·클릭베이트 어휘('충격'·'경악'·'대박') 금지.
- 베팅·도박·픽 추천·배당 언급 금지.
- 한국어 문장은 마침표로 끝냄(콜론 종결 금지).
[분량] 본문 2,500~3,500자(표 포함).`;

const pctStr = (p: number | null) => (p == null ? "-" : p.toFixed(3).replace(/^0/, "")); // .381
const opsStr = (p: number | null) => (p == null ? "-" : p.toFixed(3)); // 1.528
const eraStr = (p: number | null) => (p == null ? "-" : p.toFixed(2));

export function buildMlbWeeklyPlayersPrompt(d: MlbWeeklyPlayersData): string {
  const L: string[] = [];

  L.push(`[리그] MLB ${d.season} 시즌 — ${d.weekLabelKo} 주간 베스트 선수`);
  L.push(`[집계 기간] ${d.startDate} ~ ${d.endDate} (정규시즌 경기 한정)`);
  L.push("");

  L.push("[주간 베스트 타자 — OPS 순. 이 수치만 인용, 창작 금지]");
  for (const h of d.topHitters) {
    L.push(
      ` - ${h.name} (${h.team}) · ${h.games}경기 ${h.atBats}타수 · 타율 ${pctStr(h.avg)} · ${h.homeRuns}홈런 · ${h.rbi}타점 · OPS ${opsStr(h.ops)}`,
    );
  }
  L.push("");

  L.push("[주간 베스트 투수 — 평균자책점 낮은 순. 이 수치만 인용, 창작 금지]");
  for (const p of d.topPitchers) {
    L.push(
      ` - ${p.name} (${p.team}) · ${p.wins}승${p.losses}패 · ERA ${eraStr(p.era)} · ${p.inningsPitched}이닝 · ${p.strikeOuts}탈삼진 · WHIP ${p.whip == null ? "-" : p.whip.toFixed(2)}`,
    );
  }
  L.push("");

  const catLine = (label: string, arr: MlbWeeklyPlayersData["hrLeaders"], unit: string) =>
    arr.length
      ? ` - ${label}: ${arr.map((x, i) => `${i + 1}위 ${x.name}(${x.team}) ${x.value}${unit}`).join(" · ")}`
      : "";
  L.push("[부문별 리더 — 이 수치만 인용]");
  const cats = [
    catLine("홈런", d.hrLeaders, "개"),
    catLine("타점", d.rbiLeaders, "타점"),
    catLine("도루", d.sbLeaders, "개"),
    catLine("탈삼진", d.soLeaders, "K"),
    catLine("세이브", d.saveLeaders, "SV"),
  ].filter(Boolean);
  for (const c of cats) L.push(c);
  L.push("");

  const mvp = d.topHitters[0];
  const ace = d.topPitchers[0];

  // === 작성 가이드 ===
  L.push("---");
  L.push(`위 실측 데이터를 근거로 'MLB ${d.weekLabelKo} 주간 베스트 선수' 글을 한국 야구 팬 대상으로 작성하시오.`);
  L.push("렌더링: react-markdown + GitHub Flavored Markdown (표 / blockquote / 링크 지원).");
  L.push("");
  L.push("[필수 구조 — 이 순서·헤딩 그대로]");
  L.push("");
  L.push(
    `# (제목: 'MLB' + 주차 + 이번 주 최고 활약 선수를 결합. 예: "${mvp.name} OPS ${opsStr(mvp.ops)} 폭발 — MLB ${d.weekLabelKo} 주간 베스트". 이모지 없이 검색 친화적으로. 위 데이터의 사실만 제목에 반영)`,
  );
  L.push("");
  L.push("> **한눈에 요약** — 이번 주 핵심 4줄 (최고 타자 / 최고 투수 / 홈런·타점 리더 / 눈에 띈 활약). 각 줄 한 문장.");
  L.push("");
  L.push("## 이주의 MVP");
  L.push(
    `주간 베스트 타자 1위 ${mvp.name}(${mvp.team})의 이번 주 활약을 첫 문장에서 결론부터 제시하고(타율·홈런·타점·OPS 수치 인용), 왜 이번 주 최고였는지 2단락으로 풀어라. 이어서 주간 베스트 투수 1위 ${ace.name}(${ace.team})의 호투(ERA·이닝·탈삼진)를 1단락으로 덧붙여라. 위 수치만 사용하고 없는 경기 장면·발언은 지어내지 말 것.`,
  );
  L.push("");
  L.push("## 주간 베스트 타자");
  L.push(
    "먼저 주간 베스트 타자를 markdown 표(선수 | 팀 | 경기 | 타율 | 홈런 | 타점 | OPS)로 제시하라. 이어서 상위 타자들의 활약을 2단락 이상으로 해석 — OPS·장타력·꾸준함을 근거로. 위 표의 수치만 인용하고, 순위에 없는 선수나 없는 기록을 추가하지 말 것.",
  );
  L.push("");
  L.push("## 주간 베스트 투수");
  L.push(
    "먼저 주간 베스트 투수를 markdown 표(선수 | 팀 | 승-패 | ERA | 이닝 | 탈삼진 | WHIP)로 제시하라. 이어서 상위 투수들의 호투를 2단락 이상으로 해석 — 평균자책점·이닝 소화·탈삼진을 근거로. 위 표의 수치만 인용할 것.",
  );
  L.push("");
  L.push("## 부문별 리더");
  L.push(
    "홈런·타점·도루·탈삼진·세이브 부문 리더를 각 한 단락 또는 목록으로 정리하라. **각 부문마다 위 '부문별 리더' 데이터의 1위·2위·3위를 주어진 순서대로 모두 포함하고, 특히 각 부문 1위 선수를 절대 생략하지 말 것**(1위가 메인 표에 없는 선수여도 반드시 먼저 언급). 위 선수·수치를 그대로 인용하고, 데이터에 없는 부문만 건너뛴다.",
  );
  L.push("");
  L.push("## 더 보기");
  L.push("> [MLB 순위·일정](/leagues/MLB) · [실시간 스코어](/scores?sport=baseball) 도 함께 보세요.");
  L.push("");
  L.push("[규칙]");
  L.push("- [표 2개 필수] '주간 베스트 타자' 표와 '주간 베스트 투수' 표를 반드시 모두 포함하라. 표 누락은 실패로 간주한다.");
  L.push("- [섹션 분량 필수] 각 ## 섹션은 지정한 단락 수(MVP 3단락+, 타자 2단락+, 투수 2단락+)를 반드시 채운다. 표는 단락 수에 포함하지 않는다.");
  L.push("- 모든 타율·홈런·타점·OPS·ERA·이닝·탈삼진·WHIP·세이브 수치는 위 데이터를 그대로 인용. 창작·반올림 변형·없는 기록 추가 절대 금지.");
  L.push("- 주어진 수치만 인용하고 새로운 수치를 계산·파생하지 말 것 — K/9(이닝당 탈삼진)·이닝당 주자수·타율 대비 순위 같은 위 데이터에 없는 수치를 만들어내지 말 것. 해석은 주어진 수치의 의미를 말로 풀어 쓰되 새 숫자를 계산하지 않는다.");
  L.push("- 선수명·팀명은 위 데이터의 표기를 한 글자도 바꾸지 말 것(음역 변형 금지 — 예: '탬파베이'를 '탐바베이'로 쓰지 말 것).");
  L.push("- 위 데이터에 없는 사실(구체적 경기 장면·감독/선수 발언·부상·시즌 누적 성적·다음 상대)은 만들어내지 말 것. 이 글은 '이번 주' 성적만 다룬다.");
  L.push("- 특정 부문의 '리더/1위/최다/주도'라는 표현은 [부문별 리더]의 그 부문 1위 선수에게만 쓸 것. '주간 베스트 타자/투수' 표의 상위 선수(예: 타점 11인 선수)를 그 부문 전체 1위인 것처럼 서술하지 말 것 — 부문 1위는 [부문별 리더] 데이터에만 근거한다.");
  L.push("- 베팅·도박·픽 추천 어조 금지. 데이터 저널리즘 톤.");
  L.push("- 본문 2,500~3,500자 (표 포함). 분량은 같은 말 반복이 아니라 데이터 해석·맥락의 깊이로 채울 것. 표는 markdown 문법(`|`)으로만, ASCII art 금지.");
  L.push("- 마지막 섹션은 '더 보기'. 별도 '결론' 헤딩 추가 금지.");
  L.push("- 한국어 문장은 마침표로 끝낼 것. 콜론(:)으로 문장을 끝내지 말 것.");

  return L.join("\n");
}
