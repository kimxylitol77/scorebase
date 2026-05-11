// LCK / LoL 매치 RECAP 전용 프롬프트 (v2 — 카드 + 본문 역할 분리).
// UI 카드 컴포넌트가 정량 데이터 (MVP/LVP·타임라인·시즌·다음 매치) 렌더링 담당.
// 본문은 카드와 카드 사이를 잇는 "왜" 분석 단락만.

import type { LolRecapContext } from "@/lib/sports/lol-recap-context";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

/**
 * lolContext 를 prompt 친화적 JSON 으로 직렬화 (큰 데이터는 축약).
 */
function summarizeContext(ctx: LolRecapContext): string {
  const games = ctx.games.map((g) => {
    const t1 = g.team1;
    const t2 = g.team2;
    const mvp = g.players.find((p) => p.isMvp);
    const lvp = g.players.find((p) => p.isLvp);
    return {
      game: g.gameNumber,
      duration_min: Math.round(g.durationSec / 60),
      winner: g.winner === "team1" ? ctx.match.team1NameKo : ctx.match.team2NameKo,
      kills: { team1: t1.kills, team2: t2.kills },
      objectives_team1: {
        first_blood: t1.firstBlood,
        first_dragon: t1.firstDragon,
        first_baron: t1.firstBaron,
        dragons: t1.dragonKills ?? 0,
        barons: t1.baronKills ?? 0,
      },
      objectives_team2: {
        first_blood: t2.firstBlood,
        first_dragon: t2.firstDragon,
        first_baron: t2.firstBaron,
        dragons: t2.dragonKills ?? 0,
        barons: t2.baronKills ?? 0,
      },
      mvp: mvp
        ? {
            player: mvp.koreanName ?? mvp.playerName,
            role: mvp.role,
            champion: mvp.champion,
            kda: mvp.kda,
            kills: mvp.kills,
            deaths: mvp.deaths,
            assists: mvp.assists,
            highlight: mvp.highlight,
          }
        : null,
      lvp: lvp
        ? {
            player: lvp.koreanName ?? lvp.playerName,
            role: lvp.role,
            champion: lvp.champion,
            kda: lvp.kda,
            highlight: lvp.highlight,
          }
        : null,
      timeline_summary: g.timeline
        .filter((t) => t.type !== "game_end")
        .map(
          (t) =>
            `${t.labelKo}=${
              t.team === "team1" ? ctx.match.team1NameKo : ctx.match.team2NameKo
            }`,
        )
        .slice(0, 6)
        .join(", "),
    };
  });

  const s1 = ctx.seasonContext.team1;
  const s2 = ctx.seasonContext.team2;

  return JSON.stringify(
    {
      match: {
        ...ctx.match,
        patch: ctx.match.patch,
      },
      quote: ctx.quote.body,
      games,
      season: {
        team1: {
          name: ctx.match.team1NameKo,
          wl: `${s1.wins}-${s1.losses}`,
          rank: `${s1.rank}/${s1.total}`,
          shutouts_won: s1.twoZeroCount,
          shutouts_lost: s1.twoZeroReceived,
          streak: s1.winStreak > 0 ? `${s1.winStreak}연승` : s1.loseStreak > 0 ? `${s1.loseStreak}연패` : "—",
          recent5: s1.recent5.join("-") || "—",
        },
        team2: {
          name: ctx.match.team2NameKo,
          wl: `${s2.wins}-${s2.losses}`,
          rank: `${s2.rank}/${s2.total}`,
          shutouts_won: s2.twoZeroCount,
          shutouts_lost: s2.twoZeroReceived,
          streak: s2.winStreak > 0 ? `${s2.winStreak}연승` : s2.loseStreak > 0 ? `${s2.loseStreak}연패` : "—",
          recent5: s2.recent5.join("-") || "—",
        },
      },
      next_match: {
        team1: ctx.nextMatch.team1
          ? `${ctx.match.team1NameKo} 다음: ${ctx.nextMatch.team1.startDateIso.slice(5, 10)} vs ${ctx.nextMatch.team1.opponentNameKo}${
              ctx.nextMatch.team1.modelWinProb
                ? ` (시장 ${pct(ctx.nextMatch.team1.modelWinProb.home)})`
                : ""
            }`
          : null,
        team2: ctx.nextMatch.team2
          ? `${ctx.match.team2NameKo} 다음: ${ctx.nextMatch.team2.startDateIso.slice(5, 10)} vs ${ctx.nextMatch.team2.opponentNameKo}${
              ctx.nextMatch.team2.modelWinProb
                ? ` (시장 ${pct(ctx.nextMatch.team2.modelWinProb.home)})`
                : ""
            }`
          : null,
      },
      stars_in_match: ctx.starPlayersInMatch,
    },
    null,
    2,
  );
}

export function buildLolRecapPromptV2(ctx: LolRecapContext): string {
  const ctxJson = summarizeContext(ctx);

  return `# ROLE
LoL e스포츠 데이터 분석가 (Esports Wikis · Leaguepedia · OP.GG 수준).

# CONTEXT
이 글은 스코어베이스(Scorebase) LCK 리뷰. 도박·베팅과 무관, 데이터 미디어.
UI 카드 (Quote · GameCard · Timeline · MVP/LVP · PlayerStats · SeasonContext · NextMatch) 가
정량 데이터를 모두 보여주므로 **본문은 카드 사이를 잇는 짧은 분석 단락만** 작성.

# MISSION
LoL 매치 리뷰 (recap) 본문 작성. 단 카드와 겹치는 수치 나열 금지.

# INPUT_JSON
\`\`\`json
${ctxJson}
\`\`\`

# WRITING DOCTRINE
1. 본문 단락은 정확히 5개. 각 단락은 카드와 카드 사이를 잇는 "왜" 분석.
   - "## 종합" 1단락 (Quote 카드 다음): 매치 흐름 2~3문장
   - "## 게임 1 분석" 1단락 (게임 1 카드 다음): 결정 변수 · 챔피언 픽 영향 · 결정적 순간 의미 2~3문장
   - "## 게임 2 분석" 1단락 (게임 2 카드 다음): 게임 1과 차이점 · 픽밴 조정 영향 2~3문장 (게임 2가 없으면 단락 통째 생략)
   - "## 시즌 함의" 1단락 (시즌 카드 다음): 양 팀 시즌 위치 · 플레이오프 시드 영향 2~3문장
   - "## 관전 포인트" 1단락 (다음 매치 카드 직전): 다음 경기에서 주목할 변수 1문장
2. 선수 첫 등장: 한국명(영문 ID, 본명). 예: 페이커(Faker, 이상혁)
3. 챔피언명은 한국 공식 표기 (야스오 · 르블랑 · 리 신 · 벨베스 등)
4. **카드와 겹치는 정량 수치 나열 금지** (KDA · 골드 · 킬·CS 등은 카드가 보여준다)
5. 단락마다 "왜?"에 답하는 분석 (수치 단순 나열 X)
6. 도박 권유 표현 절대 금지
7. 데이터에 없는 사실 추측 금지 (할루시네이션). input_json 에 없는 KDA·챔피언·패치 변경점 만들지 마라.
8. **비-LoL 용어 금지**: "홈/원정" · "득점/실점/골" · "강등권" · "xG" · "FIP" · "Corsi" 등 절대 사용 금지

# OUTPUT STRUCTURE — 정확히 다음 5단락만 출력 (헤드라인은 시스템이 별도 부착)

## 종합
{Quote 카드 받은 후 매치 종합 흐름 2~3문장. 시리즈가 어떻게 흘러갔는지 큰 그림.}

## 게임 1 분석
{게임 1 카드 다음 — 라인별 결정 변수 · 챔피언 픽 영향 · 결정적 순간 의미 2~3문장.}

## 게임 2 분석
{게임 2 카드 다음 — 게임 1 과의 차이점 · 픽밴 조정 영향 2~3문장. games[1] 이 없으면 이 단락 통째로 생략.}

## 시즌 함의
{시즌 카드 다음 — 양 팀 시즌 위치 · 플레이오프 시드 · MSI/Worlds 시드 영향 2~3문장. 강등 표현 금지.}

## 관전 포인트
{다음 매치 카드 직전 — 다음 경기에서 주목할 변수 1문장. next_match 데이터 기반.}

# HARD RULES
- 분량: 정확히 600~900자 (카드가 정량 정보 담당, 본문은 분석 집중)
- 면책 문구 자동 부착 (시스템이 부착하므로 본문에 넣지 마라)
- 카드와 겹치는 수치 나열 금지 — 카드에 이미 있는 KDA·CS·골드·이벤트 순서 등은 본문에서 단순 반복 X
- 본문은 정확히 5개 H2 단락. 헤드라인(H1) 출력 금지.
`;
}
