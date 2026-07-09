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

/**
 * 대회 누적 수치에서 파생한 효율 지표 — 전부 순수 산술(주입값의 나눗셈)이라 창작 아님.
 * 분모 0 이거나 무의미한 항목은 생략. 서사는 이 계산값을 그대로 인용만 한다.
 */
function effMetrics(tq: StarReportData["tourney"]): string[] {
  const m: string[] = [];
  const per = (v: number) => (tq.games > 0 ? (v / tq.games).toFixed(1) : null);
  if (tq.games > 0) {
    m.push(`경기당 평점 ${tq.avgRating.toFixed(2)} · 경기당 ${Math.round(tq.minutes / tq.games)}분 출전`);
    if (tq.goals > 0) m.push(`경기당 ${per(tq.goals)}골`);
    if (tq.assists > 0) m.push(`경기당 ${per(tq.assists)}도움`);
    if (tq.keyPasses > 0) m.push(`경기당 키패스 ${per(tq.keyPasses)}회`);
    if (tq.shots > 0) m.push(`경기당 슛 ${per(tq.shots)}개`);
  }
  if (tq.shots > 0 && tq.goals > 0)
    m.push(`슛 결정력 ${Math.round((tq.goals / tq.shots) * 100)}% (슛 ${tq.shots}개 중 ${tq.goals}골)`);
  if (tq.minutes > 0 && tq.goals + tq.assists > 0)
    m.push(`90분당 공격포인트 ${((tq.goals + tq.assists) / (tq.minutes / 90)).toFixed(2)} (골+도움 ${tq.goals + tq.assists})`);
  if (tq.goals > 0)
    m.push(`골 1개당 평균 출전시간 ${Math.round(tq.minutes / tq.goals)}분 (출전 시간 대비 득점 빈도 — 경기 내 득점 시점과는 무관)`);
  if (tq.dribbleAtt > 0)
    m.push(`드리블 성공률 ${Math.round((tq.dribbleSucc / tq.dribbleAtt) * 100)}% (${tq.dribbleSucc}/${tq.dribbleAtt})`);
  return m;
}

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
  const eff = effMetrics(tq);
  if (eff.length > 0) {
    L.push("");
    L.push("[효율 지표 — 위 누적 수치에서 계산된 값. 그대로 인용, 재계산·변형 금지]");
    for (const e of eff) L.push(` - ${e}`);
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
  L.push("> **한눈에 요약** — 이 경기 핵심 4줄 (활약 요약 / 대회 위치 / 효율·기록의 의미 / 다음 관전 포인트). 각 줄 한 문장.");
  L.push("");
  L.push(`## ${d.name} 누구? — 프로필`);
  L.push("국적·포지션·나이·시장가치를 자연스러운 markdown 표로 정리하고, 표 아래에 이 선수가 이번 대회에서 맡은 역할을 한 단락으로 소개. 위 프로필 데이터만 사용.");
  L.push("");
  L.push(`## ${d.dateKo}, 무엇을 보여줬나`);
  L.push("이번 경기 활약을 서사 중심 3~4단락으로 깊이 있게. 평점과 상세 기록(위 '이번 경기' 데이터)을 근거로 팀 내 역할·경기 흐름 속 기여를 해석. 골/도움/키패스/슛/드리블 등 실제 스탯을 장면으로 풀어 설명하되, 위 데이터에 있는 수치만 사용. 이 섹션 안에 이번 경기 상세 기록을 담은 작은 markdown 표(지표 | 기록)를 하나 넣어라. 없는 장면·감독 발언·부상은 지어내지 말 것.");
  L.push("");
  L.push("## 숫자로 보는 " + d.name);
  L.push("대회 누적 기록·순위·효율 지표를 데이터 저널리즘 문체로 3단락 이상. 먼저 누적 기록과 순위를 담은 markdown 표(지표 | 값 | 대회 순위)를 제시하고, 이어서 '효율 지표' 데이터(경기당·90분당·결정력 등)를 인용해 이 선수의 생산성이 무엇을 의미하는지 해석하는 단락을 붙여라. '대회 득점 N위', '평점 N위' 같이 위 순위 데이터를 그대로 인용. 순위가 주어지지 않은 지표는 순위를 지어내지 말고 수치만 서술. 강조 수치는 굵게.");
  L.push("");
  if (d.market) {
    L.push(`## ${d.name} 몸값·시장가치`);
    L.push("시장가치(€)를 언급하고 이 대회 활약이 몸값 관점에서 갖는 의미를 2단락으로. 증감 데이터가 있으면 그 흐름과 배경(대회 퍼포먼스와의 연결)을 서술하고, 나이·포지션 맥락에서 시장가치가 어느 위치인지 해석. 증감 데이터가 없으면 현재 가치와 포지션 맥락만. 추측성 이적설·구체적 이적 행선지는 금지.");
    L.push("");
  }
  if (hasPred) {
    L.push("## AI가 본 다음 경기 전망");
    L.push(`위 '다음 경기' 모델 예측(승/무/패 %)을 인용해 ${d.countryKo}의 다음 경기와 이 선수의 관전 포인트를 2단락으로. 첫 단락은 예측 수치와 대진, 둘째 단락은 이 선수가 다음 경기에서 어떤 역할을 이어갈지 이번 대회 누적·효율 데이터에 근거해 전망. 예측은 Scorebase 데이터 모델 산출값임을 명시. 베팅·픽 추천 어조 금지.`);
    L.push("");
  } else if (d.nextMatch) {
    L.push("## 다음 경기 관전 포인트");
    L.push(`위 '다음 경기' 대진(${d.nextMatch.kstDate} vs ${d.nextMatch.oppKo})을 언급하고, 이 선수가 다음 경기에서 어떤 역할을 이어갈지 이번 대회 누적·효율 데이터에 근거해 2단락으로 전망. 모델 승률 예측은 아직 미산출이므로 승패 확률·구체 스코어를 지어내지 말 것 — 대진과 이 선수의 이번 대회 기록·폼만으로 관전 포인트를 서술. 베팅·픽 추천 어조 금지.`);
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
  L.push("- [표 3개 필수] 다음 markdown 표를 하나도 빠짐없이 모두 포함하라. 표 누락은 실패로 간주한다.");
  L.push("  ① '누구? — 프로필' 섹션: 프로필 표 (항목 | 정보)");
  L.push(`  ② '${d.dateKo}, 무엇을 보여줬나' 섹션: 이번 경기 기록 표 (지표 | 기록) — 위 '상세 기록'의 각 항목을 표 행으로.`);
  L.push("  ③ '숫자로 보는' 섹션: 대회 누적·순위 표 (지표 | 값 | 대회 순위) — 순위 없는 지표는 순위 칸을 '—' 로.");
  L.push("- [섹션 분량 필수] 각 ## 섹션은 위 구조에서 지정한 단락 수(무엇을 보여줬나 3~4단락, 숫자로 보는 3단락 이상, 나머지 2단락)를 반드시 채운다. 표는 단락 수에 포함하지 않는다.");
  L.push("- 모든 평점·스탯·순위·몸값 수치는 위 데이터를 그대로 인용. 창작·반올림 변형·없는 기록 추가 절대 금지.");
  L.push("- 위 데이터에 없는 사실(부상·교체 이유·감독/선수 발언·이적설·과거 시즌 기록)은 만들어내지 말 것.");
  L.push("- 상대팀(다음 경기 상대 포함)의 전술·수비 성향 등 주어지지 않은 특징은 서술하지 말 것.");
  L.push("- 지표 정의를 지킬 것: '피파울 N'은 이 선수가 상대에게 파울을 당해 얻어낸 횟수다(반칙을 범한 것이 아님). '드리블 성공 A(시도 B)'는 B회 시도 중 A회 성공이며 성공률은 A/B다 — 임의로 100%·다른 값으로 바꾸지 말 것.");
  L.push("- 효율 지표는 제시된 계산값의 의미만 서술. 경기 내 시점(초반·후반 득점 등)·시간에 따른 추세(점점 나아진다·상승세)·컨디션 변화는 경기별 데이터가 없으니 추론·단정 금지.");
  L.push("- 평점은 TheSports 종합 경기 평점임을 본문에서 한 번 명시.");
  L.push("- 베팅·도박·픽 추천 어조 금지. 데이터 저널리즘 톤.");
  L.push("- 본문 3,000~4,500자 (표 포함). 분량은 같은 말 반복이 아니라 데이터 해석·맥락·서사의 깊이로 채울 것. 표는 markdown 문법(`|`)으로만, ASCII art 금지.");
  L.push("- 마지막 섹션은 '더 보기'. 별도 '결론' 헤딩 추가 금지.");
  L.push("- 한국어 문장은 마침표로 끝낼 것. 콜론(:)으로 문장을 끝내지 말 것.");

  return L.join("\n");
}
