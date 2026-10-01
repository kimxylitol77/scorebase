// 야구 스탯 표 열 메타 영어판 — 묶음 이름·용어 설명을 영어로 바꾼다(라벨 AVG·OPS 등은 원래 영어).
// 설명은 한국어 원문을 키로 둔다 — 같은 kPct 라도 타자·투수 설명이 달라서. 원문이 바뀌면 영어가 빠진 채 한국어로 남으니 테스트가 잡는다.
import type { StatColumn } from "./stats-table";

const GROUP_EN: Record<string, string> = { 프로필: "Profile", 타격: "Batting", 투구: "Pitching", 확장: "Advanced" };

export const DESC_EN: Record<string, string> = {
  "출장 경기 수": "Games played",
  "타율 = 안타 ÷ 타수": "Batting average = hits ÷ at-bats",
  "출루율 + 장타율": "On-base percentage + slugging",
  "안타": "Hits",
  "홈런": "Home runs",
  "타점": "Runs batted in",
  "가중 출루율 — 볼넷 .69 · 사구 .72 · 1루타 .89 · 2루타 1.27 · 3루타 1.62 · 홈런 2.10 가중 (FanGraphs)":
    "Weighted on-base average — BB .69 · HBP .72 · 1B .89 · 2B 1.27 · 3B 1.62 · HR 2.10 (FanGraphs weights)",
  "순장타율 = 장타율 − 타율 (2루타+2×3루타+3×홈런) ÷ 타수": "Isolated power = SLG − AVG, (2B + 2×3B + 3×HR) ÷ AB",
  "볼넷률 = 고의사구 제외 볼넷 ÷ 타석": "Walk rate = unintentional walks ÷ plate appearances",
  "삼진율 = 삼진 ÷ 타석": "Strikeout rate = strikeouts ÷ plate appearances",
  "수비 무관 평균자책 = (13×홈런 + 3×(볼넷+사구) − 2×삼진) ÷ 이닝 + 3.15":
    "Fielding independent pitching = (13×HR + 3×(BB+HBP) − 2×K) ÷ IP + 3.15",
  "삼진율 = 삼진 ÷ 상대 타자": "Strikeout rate = strikeouts ÷ batters faced",
  "볼넷률 = 볼넷 ÷ 상대 타자": "Walk rate = walks ÷ batters faced",
  "9이닝당 피홈런": "Home runs allowed per 9 innings",
  "등판 경기 수": "Games pitched",
  "평균자책점 = 자책점 × 9 ÷ 이닝": "Earned run average = earned runs × 9 ÷ innings",
  "이닝당 출루 허용 = (피안타 + 볼넷) ÷ 이닝": "Walks + hits per inning = (H + BB) ÷ IP",
  "투구 이닝": "Innings pitched",
  "탈삼진": "Strikeouts",
  "9이닝당 탈삼진": "Strikeouts per 9 innings",
  "승": "Wins",
  "패": "Losses",
  "세이브": "Saves",
};

export function enStatColumns(cols: StatColumn[]): StatColumn[] {
  return cols.map((c) => ({
    ...c,
    group: c.group ? GROUP_EN[c.group] ?? c.group : c.group,
    desc: c.desc ? DESC_EN[c.desc] ?? c.desc : c.desc,
  }));
}
