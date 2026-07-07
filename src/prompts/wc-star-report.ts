// 월드컵 STAR 리포트 — 선수 1인 '스토리텔링 + 데이터' 글 프롬프트.
// 결정론적 실측 데이터(평점·기록·대회 순위·몸값·다음경기 예측)를 주입하고,
// 서사는 자유 생성하되 수치 창작·변형은 금지. 데이터 없는 섹션은 skip 게이트로 생략 지시.
import type { StarReportData } from "@/lib/sports/thesports/wc-star-report";

/** 대회 순위를 한국어 프레임으로 — "대회 득점 공동 2위(4골)". 동률 판정은 total 이 아닌 값으로. */
function rankPhrase(label: string, r: { rank: number; total: number; value: number } | null, unit: string): string | null {
  if (!r) return null;
  return `${label} 대회 ${r.rank}위 (${r.value}${unit}, 자격 ${r.total}명 중)`;
}

const euroM = (v: number) => {
  const m = v / 1e6;
  return m >= 10 ? `${Math.round(m)}` : m.toFixed(1);
};

export function buildStarReportPrompt(d: StarReportData): string {
  const L: string[] = [];
  const reasonKo =
    d.reason === "MOM"
      ? "이날 완료 경기 출전 선수 중 TheSports 경기 평점 1위(MOM)"
      : "이날 멀티골(2골 이상)을 기록한 주인공";

  L.push(`[대회] 2026 FIFA 북중미 월드컵 — ${d.dateKo} STAR 리포트`);
  L.push(`[선정] ${reasonKo}`);
  L.push("");

  // --- 프로필 (결정론적) ---
  L.push("[선수 프로필]");
  L.push(` - 이름: ${d.name}${d.nameEn ? ` (${d.nameEn})` : ""}`);
  L.push(` - 국가: ${d.flag} ${d.countryKo}`);
  L.push(` - 포지션: ${d.posKo}`);
  if (d.age != null) L.push(` - 나이: 만 ${d.age}세`);
  if (d.market) L.push(` - 시장가치: €${euroM(d.market.euro)}M${d.market.deltaEuro ? ` (최근 ${d.market.deltaEuro > 0 ? "▲" : "▼"} €${euroM(Math.abs(d.market.deltaEuro))}M)` : ""}`);
  L.push("");

  // --- 이번 경기 (결정론적) ---
  L.push("[이번 경기]");
  if (d.match.oppKo) {
    const score =
      d.match.teamScore != null && d.match.oppScore != null
        ? ` ${d.match.teamScore}-${d.match.oppScore}${d.match.result ? ` (${d.match.result})` : ""}`
        : "";
    L.push(` - vs ${d.match.oppKo}${score}`);
  }
  L.push(` - 경기 평점: ${d.rating.toFixed(1)} (TheSports 종합 평점, 우리가 매긴 점수 아님)`);
  L.push(` - 상세 기록: ${d.todayStatLine}`);
  L.push("");

  // --- 대회 누적 + 순위 (결정론적) ---
  L.push("[대회 누적 (본선 전체)]");
  const tq = d.tourney;
  L.push(` - 출전 ${tq.games}경기 ${tq.minutes}분 · 평균 평점 ${tq.avgRating.toFixed(2)}`);
  L.push(` - 골 ${tq.goals} · 도움 ${tq.assists} · 키패스 ${tq.keyPasses} · 슛 ${tq.shots}`);
  if (tq.dribbleAtt > 0) L.push(` - 드리블 성공 ${tq.dribbleSucc}/${tq.dribbleAtt}`);
  if (tq.defActions > 0) L.push(` - 수비 액션(태클+인터셉트+클리어) ${tq.defActions}`);
  if (tq.saves > 0) L.push(` - 선방 ${tq.saves}`);
  const ranks = [
    rankPhrase("득점", d.ranks.goals, "골"),
    rankPhrase("도움", d.ranks.assists, "도움"),
    rankPhrase("키패스", d.ranks.keyPasses, "회"),
    rankPhrase("평점", d.ranks.rating, ""),
  ].filter(Boolean);
  if (ranks.length > 0) {
    L.push("");
    L.push("[대회 순위 — 이 수치만 인용, 임의 순위 창작 금지]");
    for (const r of ranks) L.push(` - ${r}`);
  }
  L.push("");

  // --- 다음 경기 (있을 때만) — 모델 예측 %는 있을 때만 붙는다. ---
  const hasPred = !!d.nextMatch && d.nextMatch.predTeamPct != null;
  if (d.nextMatch) {
    const n = d.nextMatch;
    const parts: string[] = [];
    if (n.predTeamPct != null) parts.push(`${d.countryKo} 승 ${n.predTeamPct}%`);
    if (n.predDrawPct != null) parts.push(`무 ${n.predDrawPct}%`);
    if (n.predOppPct != null) parts.push(`${n.oppKo} 승 ${n.predOppPct}%`);
    L.push(hasPred ? "[다음 경기 — Scorebase 모델 예측]" : "[다음 경기]");
    L.push(` - ${n.kstDate} vs ${n.oppKo}${parts.length ? ` — 모델 승률 ${parts.join(" · ")}` : " (모델 예측 미산출)"}`);
    L.push("");
  }

  // === 작성 가이드 ===
  L.push("---");
  L.push(`위 실측 데이터를 근거로 '${d.name}' 한 명을 주인공으로 한 한국 독자용 STAR 리포트를 작성하시오.`);
  L.push("렌더링: react-markdown + GitHub Flavored Markdown (표 / blockquote / 링크 지원).");
  L.push("");
  L.push("[필수 구조 — 이 순서·헤딩 그대로]");
  L.push("");
  L.push(`# (제목: 선수명 + '${d.countryKo}' + 대회 맥락 + 숫자 기록을 결합. 예: "'${d.countryKo}의 심장' ${d.name}, 16강 평점 ${d.rating.toFixed(1)}로 토너먼트를 지배하다". 이모지 없이, 검색 친화적으로)`);
  L.push("");
  L.push("> **한눈에 요약** — 이 경기 핵심 3줄 (활약 요약 / 대회 위치 / 다음 관전 포인트). 각 줄 한 문장.");
  L.push("");
  L.push(`## ${d.name} 누구? — 프로필`);
  L.push("국적·포지션·나이·시장가치를 자연스러운 markdown 표 또는 리스트로. 위 프로필 데이터만 사용.");
  L.push("");
  L.push(`## ${d.dateKo}, 무엇을 보여줬나`);
  L.push("이번 경기 활약을 서사 중심 2~3단락으로. 평점과 상세 기록(위 '이번 경기' 데이터)을 근거로 팀 내 역할을 해석. 골/도움/키패스 등 실제 장면을 스탯으로 설명. 없는 장면·감독 발언·부상은 지어내지 말 것.");
  L.push("");
  L.push("## 숫자로 보는 " + d.name);
  L.push("대회 누적 기록과 순위를 데이터 저널리즘 문체로. '대회 득점 N위', '평점 N위' 같이 위 순위 데이터를 그대로 인용. 순위가 주어지지 않은 지표는 순위를 지어내지 말고 수치만 서술. 강조 수치는 굵게.");
  L.push("");
  if (d.market) {
    L.push(`## ${d.name} 몸값·시장가치`);
    L.push("시장가치(€)를 언급하고, 증감 데이터가 있으면 그 흐름을 한 단락으로. 증감 데이터가 없으면 현재 가치와 포지션 맥락만. 추측성 이적설은 금지.");
    L.push("");
  }
  if (hasPred) {
    L.push("## AI가 본 다음 경기 전망");
    L.push(`위 '다음 경기' 모델 예측(승/무/패 %)을 인용해 ${d.countryKo}의 다음 경기와 이 선수의 관전 포인트를 한 단락. 예측은 Scorebase 데이터 모델 산출값임을 명시. 베팅·픽 추천 어조 금지.`);
    L.push("");
  }
  L.push("## 더 보기");
  L.push("마지막 단락에 자연스럽게 링크 삽입:");
  if (d.hasMv) {
    L.push(`> [${d.name} 선수 상세·시장가치 추이](/transfers/${d.playerId}) · [월드컵 오늘의 베스트 XI](/world-cup/team-of-day) · [월드컵 예측·조별 순위](/predictions/WORLD_CUP)`);
  } else {
    L.push("> [월드컵 오늘의 베스트 XI](/world-cup/team-of-day) 와 [월드컵 예측·조별 순위](/predictions/WORLD_CUP) 도 함께 보세요.");
  }
  L.push("");
  L.push("[규칙]");
  L.push("- 모든 평점·스탯·순위·몸값 수치는 위 데이터를 그대로 인용. 창작·반올림 변형·없는 기록 추가 절대 금지.");
  L.push("- 위 데이터에 없는 사실(부상·교체 이유·감독/선수 발언·이적설·과거 시즌 기록)은 만들어내지 말 것.");
  L.push("- 평점은 TheSports 종합 경기 평점임을 본문에서 한 번 명시.");
  L.push("- 베팅·도박·픽 추천 어조 금지. 데이터 저널리즘 톤.");
  L.push("- 본문 1,500~2,500자 (표 포함). 표는 markdown 문법(`|`)으로만, ASCII art 금지.");
  L.push("- 마지막 섹션은 '더 보기'. 별도 '결론' 헤딩 추가 금지.");
  L.push("- 한국어 문장은 마침표로 끝낼 것. 콜론(:)으로 문장을 끝내지 말 것.");

  return L.join("\n");
}
