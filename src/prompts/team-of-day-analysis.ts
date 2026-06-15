// 월드컵 '오늘의 베스트 XI' 경기 평점 데이터를 분석 글 프롬프트로 변환.
// 각 선수의 실측 스탯(골·도움·키패스·태클·드리블·세이브 등)을 결정론적으로 주입해
// "왜 이 평점인지"를 근거 있게 서술하게 한다. 수치 창작·변형 금지가 핵심.

export interface TodRawStats {
  goals?: number;
  assists?: number;
  shots?: number;
  shots_on_target?: number;
  key_passes?: number;
  big_chance_created?: number;
  big_chance_missed?: number;
  passes?: number;
  passes_accuracy?: number;
  crosses?: number;
  crosses_accuracy?: number;
  long_balls?: number;
  dribble?: number;
  dribble_succ?: number;
  dispossessed?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  blocked_shots?: number;
  duel_won?: number;
  duel_lost?: number;
  aerial_won?: number;
  saves?: number;
  punches?: number;
  fouls?: number;
  was_fouled?: number;
  yellow_cards?: number;
  red_cards?: number;
  minutes_played?: number;
}

export interface TodAnalysisPlayer {
  name: string; // 한글 우선
  countryKo: string;
  flag: string;
  pos: string; // G | D | M | F
  rating: number;
  captain: boolean;
  goals: number;
  assists: number;
  stats: TodRawStats | null;
}

interface BuildInput {
  date: string; // 2026-06-15
  dateKo: string; // 6월 15일
  matchCount: number;
  matches: {
    homeKo: string;
    awayKo: string;
    homeScore: number | null;
    awayScore: number | null;
  }[];
  xi: TodAnalysisPlayer[]; // 11명 (호출부에서 평점 내림차순 정렬)
  bench: TodAnalysisPlayer[];
  topRating: number;
}

const POS_KO: Record<string, string> = {
  G: "골키퍼",
  D: "수비수",
  M: "미드필더",
  F: "공격수",
};

const pct = (succ: number, total: number) =>
  total > 0 ? Math.round((succ / total) * 100) : 0;

/** 포지션 맞춤 핵심 스탯 한 줄. 0 인 항목은 생략해 노이즈 제거. */
function statLine(pos: string, s: TodRawStats | null): string {
  if (!s) return "기록 미집계";
  const p: string[] = [];
  if (s.goals) p.push(`골 ${s.goals}`);
  if (s.assists) p.push(`도움 ${s.assists}`);

  if (pos === "G") {
    p.push(`선방 ${s.saves ?? 0}`);
    if (s.punches) p.push(`펀칭 ${s.punches}`);
    if (s.passes) p.push(`패스 ${pct(s.passes_accuracy ?? 0, s.passes)}%(${s.passes_accuracy ?? 0}/${s.passes})`);
  } else if (pos === "D") {
    if (s.clearances) p.push(`클리어 ${s.clearances}`);
    if (s.interceptions) p.push(`인터셉트 ${s.interceptions}`);
    if (s.tackles) p.push(`태클 ${s.tackles}`);
    if (s.blocked_shots) p.push(`슛블록 ${s.blocked_shots}`);
    if (s.aerial_won) p.push(`공중볼 ${s.aerial_won}승`);
    if (s.passes) p.push(`패스 ${pct(s.passes_accuracy ?? 0, s.passes)}%(${s.passes_accuracy ?? 0}/${s.passes})`);
  } else if (pos === "M") {
    if (s.key_passes) p.push(`키패스 ${s.key_passes}`);
    if (s.big_chance_created) p.push(`결정적기회 ${s.big_chance_created}`);
    if (s.passes) p.push(`패스 ${pct(s.passes_accuracy ?? 0, s.passes)}%(${s.passes_accuracy ?? 0}/${s.passes})`);
    if (s.dribble_succ) p.push(`드리블 성공 ${s.dribble_succ}회(시도 ${s.dribble ?? 0})`);
    if (s.tackles) p.push(`태클 ${s.tackles}`);
    if (s.duel_won) p.push(`경합 ${s.duel_won}승`);
  } else {
    // F
    if (s.shots) p.push(`슛 ${s.shots}(유효 ${s.shots_on_target ?? 0})`);
    if (s.key_passes) p.push(`키패스 ${s.key_passes}`);
    if (s.big_chance_created) p.push(`결정적기회 ${s.big_chance_created}`);
    if (s.dribble_succ) p.push(`드리블 성공 ${s.dribble_succ}회(시도 ${s.dribble ?? 0})`);
    if (s.duel_won) p.push(`경합 ${s.duel_won}승`);
  }
  if (s.was_fouled) p.push(`피파울 ${s.was_fouled}`);
  if (s.yellow_cards) p.push(`경고`);
  if (s.minutes_played != null) p.push(`${s.minutes_played}분`);
  return p.join(" · ");
}

const playerBlock = (rank: number, pl: TodAnalysisPlayer): string => {
  const cap = pl.captain ? " ©주장" : "";
  return ` ${rank}. ${pl.name} (${pl.countryKo}, ${POS_KO[pl.pos] ?? pl.pos}${cap}) — 평점 ${pl.rating.toFixed(1)} | ${statLine(pl.pos, pl.stats)}`;
};

export function buildTeamOfDayAnalysisPrompt(input: BuildInput): string {
  const { dateKo, matchCount, matches, xi, bench, topRating } = input;
  const mvp = xi[0]; // 호출부에서 평점 내림차순 → 첫 번째가 MVP
  const korea = xi.filter((p) => p.countryKo === "대한민국" || p.countryKo === "한국");

  const lines: string[] = [];
  lines.push(`[대회] 2026 FIFA 북중미 월드컵 — ${dateKo} 베스트 XI`);
  lines.push(`[집계] 이날 완료된 ${matchCount}경기 출전 선수 중 TheSports 경기 평점 상위 11인을 4-2-3-1 포메이션으로 선정`);
  lines.push("");

  lines.push("[이날 경기 결과]");
  for (const m of matches) {
    lines.push(` - ${m.homeKo} ${m.homeScore ?? "-"} : ${m.awayScore ?? "-"} ${m.awayKo}`);
  }
  lines.push("");

  lines.push(`[베스트 11 — 평점 내림차순 · 실측 기록] (최고 평점 ${topRating.toFixed(1)})`);
  xi.forEach((p, i) => lines.push(playerBlock(i + 1, p)));
  lines.push("");

  if (bench.length > 0) {
    lines.push("[후보 — 차순위 평점]");
    bench.forEach((p, i) => lines.push(playerBlock(i + 1, p)));
    lines.push("");
  }

  if (korea.length > 0) {
    lines.push(`[대한민국 선수] ${korea.map((p) => `${p.name}(평점 ${p.rating.toFixed(1)})`).join(", ")}`);
  } else {
    lines.push("[대한민국 선수] 이날 베스트 11에는 없음");
  }
  lines.push("");

  // === 글 작성 가이드 ===
  lines.push("---");
  lines.push("위 실측 데이터를 근거로 한국 독자를 위한 '오늘의 베스트 11' 심층 분석 글을 작성하시오.");
  lines.push("렌더링: react-markdown + GitHub Flavored Markdown (표 / blockquote / 링크 지원).");
  lines.push("");
  lines.push("[필수 구조 — 이 순서·헤딩 그대로]");
  lines.push("");
  lines.push(`# (이모지 1개 + '${dateKo} 월드컵 베스트 11' 이 들어간 후크 제목)`);
  lines.push("");
  lines.push("> **TL;DR**");
  lines.push("> 이날 베스트 11의 핵심 3가지를 한 줄씩 (최고 평점 선수, 경기 결과와의 연결, 눈에 띈 활약). 각 줄 앞 이모지(🥇·⚽·🇰🇷 등).");
  lines.push("");
  lines.push("## 📋 오늘의 베스트 11");
  lines.push("도입 한 단락(2~3문장) 후 다음 형식의 markdown 표 — 평점 내림차순 11명 전원:");
  lines.push("");
  lines.push("| 평점 | 선수 | 국가 | 포지션 | 핵심 기록 |");
  lines.push("|---|---|---|---|---|");
  lines.push("(각 선수: 평점·이름·국가·포지션·핵심기록 한 줄. 핵심 기록은 위 데이터의 스탯을 간결히)");
  lines.push("");
  lines.push("## 🔥 평점의 근거 — 포지션별 리뷰");
  lines.push("최전방·중원·수비진·골문 순으로 소제목 없이 단락을 나눠, **각 선수가 왜 그 평점을 받았는지** 위 스탯을 인용해 설명. 예: '키패스 5개와 도움 2개로 공격 전개를 도맡았다', '클리어 8회·공중볼 3승으로 뒷문을 닫았다'. 골키퍼는 실점에도 선방 수를 함께 짚어 균형 있게.");
  lines.push("");
  lines.push("## 🥇 이날의 MVP");
  lines.push(`최고 평점 ${mvp ? `${mvp.name}(평점 ${mvp.rating.toFixed(1)})` : ""} 를 한 단락으로 심층 조명 — 어떤 기록이 평점을 끌어올렸는지 구체적으로.`);
  lines.push("");
  if (korea.length > 0) {
    lines.push("## 🇰🇷 대한민국 선수");
    lines.push("베스트 11에 든 한국 선수의 활약을 스탯과 함께 한 단락.");
    lines.push("");
  }
  lines.push("## 📊 더 보기");
  lines.push("마지막 단락에 자연스럽게 링크 삽입:");
  lines.push("> 평점은 매일 자동 갱신됩니다. [월드컵 오늘의 베스트 XI](/world-cup/team-of-day) 와 [월드컵 예측·조별 순위](/predictions/WORLD_CUP) 도 함께 보세요.");
  lines.push("");
  lines.push("[규칙]");
  lines.push("- 모든 평점·스탯 수치는 위 데이터를 그대로 인용. 창작·반올림 변형·없는 기록 추가 절대 금지.");
  lines.push("- 위 데이터에 없는 사실(부상·교체 이유·감독 발언·이적설)은 만들어내지 말 것.");
  lines.push("- 평점은 TheSports 가 산출한 종합 경기 평점임을 한 번 명시. 우리가 임의로 매긴 점수가 아님.");
  lines.push("- 베팅·도박·픽 추천 어조 금지. 데이터 저널리즘 톤.");
  lines.push("- 본문 1,500~2,500자 (표 포함). 표는 markdown 문법(`|`)으로만, ASCII art 금지.");
  lines.push("- 마지막 섹션은 '더 보기'. 별도 '결론' 헤딩 추가 금지.");

  return lines.join("\n");
}
