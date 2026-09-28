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

/** 경기 전술 글 — 양 팀 감독 카드를 짝으로. pair=1 은 화면에서 두 장을 나란히 놓으라는 표시(Markdown.tsx). */
export function insertMatchManagerCards(content: string, matchId: number, who: { homeKo: string; awayKo: string; homeCoachKo: string; awayCoachKo: string }): string {
  if (content.includes(MANAGER_CARD_PATH)) return content;
  const one = (side: "home" | "away", kind: string, alt: string, pair: boolean) => {
    const team = side === "home" ? who.homeKo : who.awayKo;
    const coach = side === "home" ? who.homeCoachKo : who.awayCoachKo;
    return `![${team} ${coach} 감독 — ${alt}](${MANAGER_CARD_PATH}?match=${matchId}&side=${side}&kind=${kind}${pair ? "&pair=1" : ""})`;
  };
  const pair = (kind: string, alt: string) => `${one("home", kind, alt, true)} ${one("away", kind, alt, true)}`;
  const poster = pair("poster", "연승·이달 성적·리그 순위");
  const pizza = pair("pizza", "리그 내 백분위 지표 6종");
  const fut = pair("fut", "감독 카드, 능력치는 리그 내 백분위 환산");
  const both = `${who.homeKo}·${who.awayKo}`;
  const bump = `![${both} 시즌 라운드별 순위 흐름](${MANAGER_CARD_PATH}?match=${matchId}&side=home&kind=bump)`;
  const dumbbell = `![${both} 이달 기대 승점 대비 실제 승점 — 리그 전 구단 비교](${MANAGER_CARD_PATH}?match=${matchId}&side=home&kind=dumbbell)`;

  let out = content;
  const atSectionEnd = (re: RegExp, block: string) => {
    const m = out.match(re);
    if (!m || m.index == null) return false;
    const next = out.indexOf("\n## ", m.index + m[0].length);
    if (next < 0) return false;
    out = `${out.slice(0, next).trimEnd()}\n\n${block}\n${out.slice(next)}`;
    return true;
  };
  const okPoster = atSectionEnd(/^## 두 팀의 설계[^\n]*$/m, poster);
  const okPizza = atSectionEnd(/^## 숫자가 가리킨 선수[^\n]*$/m, pizza);
  const tail = [!okPoster && poster, !okPizza && pizza, bump, dumbbell, fut].filter(Boolean) as string[];
  return `${out.trimEnd()}\n\n${tail.join("\n\n")}\n`;
}
