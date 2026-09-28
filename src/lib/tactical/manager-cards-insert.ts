// 이달의 감독 글 본문에 그림 카드 5장을 끼워 넣는다 — 포스터(맨 위)·덤벨(선정 이유)·피자(전술)·순위 흐름(결정적 경기)·선수 카드형(끝).
export const MANAGER_CARD_PATH = "/api/og/manager-card";

export function insertManagerCards(content: string, articleId: number, who: { coachKo: string; teamKo: string; monthLabel: string }): string {
  if (content.includes(MANAGER_CARD_PATH)) return content; // 이미 들어 있음
  const head = `${who.monthLabel} 이달의 감독 ${who.coachKo}(${who.teamKo})`;
  const img = (kind: string, alt: string) => `![${head} — ${alt}](${MANAGER_CARD_PATH}?id=${articleId}&kind=${kind})`;
  const poster = img("poster", "연승·이달 성적·리그 순위");
  const dumbbell = img("dumbbell", "전 구단 기대 승점 대비 실제 승점");
  const pizza = img("pizza", "리그 내 백분위 지표 6종");
  const bump = img("bump", "시즌 라운드별 순위 흐름");
  const fut = img("fut", "감독 카드, 능력치는 리그 내 백분위 환산");

  let out = content;
  /** 제목이 re 에 맞는 섹션의 끝(다음 ## 직전)에 넣는다 */
  const atSectionEnd = (re: RegExp, block: string) => {
    const m = out.match(re);
    if (!m || m.index == null) return false;
    const next = out.indexOf("\n## ", m.index + m[0].length);
    if (next < 0) return false;
    out = `${out.slice(0, next).trimEnd()}\n\n${block}\n${out.slice(next)}`;
    return true;
  };
  const okDumbbell = atSectionEnd(/^## 선정 이유[^\n]*$/m, dumbbell);
  const okPizza = atSectionEnd(/^## 이번 달의 전술[^\n]*$/m, pizza);
  const okBump = atSectionEnd(/^## 결정적 경기[^\n]*$/m, bump);

  const first = out.search(/^## /m);
  out = first >= 0 ? `${out.slice(0, first)}${poster}\n\n${out.slice(first)}` : `${poster}\n\n${out}`;

  const tail = [!okDumbbell && dumbbell, !okPizza && pizza, !okBump && bump, fut].filter(Boolean) as string[];
  return `${out.trimEnd()}\n\n${tail.join("\n\n")}\n`;
}
