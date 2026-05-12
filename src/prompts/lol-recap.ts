// LCK / LoL 매치 RECAP 전용 프롬프트 (v3 — #604 스타일 긴 본문).
// 사용자가 선호하는 형식: H1 헤드라인 + 굵은 도입부 + (선택) 5라인 매치업
// + 시리즈 흐름 + 모델 검증 + 시즌 함의 (총 1100~1500자, 카드 UI 없이 본문에 모든 정보).
//
// 환상 방지: rosters 양 팀 모두 채워졌을 때만 5라인 매치업 단락 출력.
// prompt 자체를 동적으로 빌드 — hasBothRosters=false 면 5라인 instruction 통째 제거.

import type { LolRecapContext } from "@/lib/sports/lol-recap-context";
import { championKoreanName } from "@/lib/sports/leaguepedia";
import { getKoreanStarBy } from "@/lib/sports/star-players";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

const ROLE_KO: Record<string, string> = {
  TOP: "TOP",
  JGL: "JGL",
  MID: "MID",
  ADC: "ADC",
  SUP: "SUP",
};

const ROLE_ORDER = ["TOP", "JGL", "MID", "ADC", "SUP"];

type PlayerEntry = { p: LolRecapContext["games"][0]["players"][0]; champs: Set<string> };

/** 게임 1·2 통합 → 라인별 양 팀 대표 선수 1명씩 + 시즌 stats 추출. */
function buildLineupTable(ctx: LolRecapContext): string {
  const team1Players = new Map<string, PlayerEntry>();
  const team2Players = new Map<string, PlayerEntry>();

  for (const g of ctx.games) {
    for (const p of g.players) {
      const tgt = p.team === "team1" ? team1Players : team2Players;
      const key = p.playerName;
      if (!tgt.has(key)) {
        tgt.set(key, { p, champs: new Set([p.champion]) });
      } else {
        tgt.get(key)!.champs.add(p.champion);
      }
    }
  }

  function describePlayer(info: PlayerEntry): string {
    const star = getKoreanStarBy(info.p.playerName);
    const idLabel = star
      ? `${star.koreanName}(${star.nickname}, ${star.realName})`
      : info.p.realName
        ? `${info.p.playerName}(${info.p.realName})`
        : info.p.playerName;
    const champs = [...info.champs]
      .filter(Boolean)
      .map((c) => championKoreanName(c))
      .join("·");
    return `${idLabel}${champs ? ` · ${champs}` : ""} · KDA ${info.p.kda.toFixed(2)}`;
  }

  function lineupOne(side: Map<string, PlayerEntry>): string[] {
    const byRole = new Map<string, PlayerEntry>();
    for (const info of side.values()) {
      const role = info.p.role;
      if (!ROLE_ORDER.includes(role)) continue;
      if (!byRole.has(role)) byRole.set(role, info);
    }
    return ROLE_ORDER.map((r) => {
      const info = byRole.get(r);
      if (!info) return `  - ${ROLE_KO[r]}: (데이터 없음)`;
      return `  - ${ROLE_KO[r]}: ${describePlayer(info)}`;
    });
  }

  const t1Lines = lineupOne(team1Players);
  const t2Lines = lineupOne(team2Players);
  return [
    `- ${ctx.match.team1NameKo} 라인업:`,
    ...t1Lines,
    `- ${ctx.match.team2NameKo} 라인업:`,
    ...t2Lines,
  ].join("\n");
}

function sideLabel(side: string | undefined): string {
  if (!side) return "";
  const s = side.toLowerCase();
  if (s.includes("blue")) return "블루";
  if (s.includes("red")) return "레드";
  return side;
}

function playerLine(p: LolRecapContext["games"][0]["players"][0]): string {
  const star = getKoreanStarBy(p.playerName);
  const idLabel = star
    ? `${star.koreanName}(${star.nickname}, ${star.realName})`
    : p.realName ? `${p.playerName}(${p.realName})` : p.playerName;
  const champ = championKoreanName(p.champion);
  const kp = p.kp != null ? `, KP ${Math.round(p.kp * 100)}%` : "";
  const dmg = p.dpm ? `, DPM ${Math.round(p.dpm)}` : "";
  return `${idLabel}·${p.role}(${champ}, ${p.kills}/${p.deaths}/${p.assists}${kp}${dmg})`;
}

function buildGameSummaries(ctx: LolRecapContext): string {
  if (ctx.games.length === 0) return "(게임 단위 데이터 미수집)";
  const lines: string[] = [];
  for (const g of ctx.games) {
    const winner = g.winner === "team1" ? ctx.match.team1NameKo : ctx.match.team2NameKo;
    const minutes = Math.round(g.durationSec / 60);
    const t1Side = sideLabel(g.team1.side);
    const t2Side = sideLabel(g.team2.side);
    const sideStr = t1Side && t2Side ? ` · 사이드: ${ctx.match.team1NameKo}=${t1Side}, ${ctx.match.team2NameKo}=${t2Side}` : "";

    // 골드 격차
    let goldStr = "";
    if (g.team1.goldEarned != null && g.team2.goldEarned != null) {
      const diff = g.team1.goldEarned - g.team2.goldEarned;
      const diffSide = diff >= 0 ? ctx.match.team1NameKo : ctx.match.team2NameKo;
      const diffK = (Math.abs(diff) / 1000).toFixed(1);
      goldStr = ` · 골드 ${(g.team1.goldEarned/1000).toFixed(1)}k-${(g.team2.goldEarned/1000).toFixed(1)}k (${diffSide} +${diffK}k)`;
    }

    // 오브젝트 우선권
    const firsts: string[] = [];
    if (g.team1.firstBlood) firsts.push(`퍼블=${ctx.match.team1NameKo}`);
    else if (g.team2.firstBlood) firsts.push(`퍼블=${ctx.match.team2NameKo}`);
    if (g.team1.firstTower) firsts.push(`퍼타=${ctx.match.team1NameKo}`);
    else if (g.team2.firstTower) firsts.push(`퍼타=${ctx.match.team2NameKo}`);
    if (g.team1.firstDragon) firsts.push(`퍼드=${ctx.match.team1NameKo}`);
    else if (g.team2.firstDragon) firsts.push(`퍼드=${ctx.match.team2NameKo}`);
    if (g.team1.firstBaron) firsts.push(`퍼바=${ctx.match.team1NameKo}`);
    else if (g.team2.firstBaron) firsts.push(`퍼바=${ctx.match.team2NameKo}`);
    const firstsStr = firsts.length > 0 ? ` · ${firsts.join(", ")}` : "";

    // 오브젝트 카운트
    const objCounts: string[] = [];
    if ((g.team1.dragonKills ?? 0) > 0 || (g.team2.dragonKills ?? 0) > 0) {
      objCounts.push(`드래곤 ${g.team1.dragonKills ?? 0}-${g.team2.dragonKills ?? 0}`);
    }
    if ((g.team1.heraldKills ?? 0) > 0 || (g.team2.heraldKills ?? 0) > 0) {
      objCounts.push(`전령 ${g.team1.heraldKills ?? 0}-${g.team2.heraldKills ?? 0}`);
    }
    if ((g.team1.baronKills ?? 0) > 0 || (g.team2.baronKills ?? 0) > 0) {
      objCounts.push(`바론 ${g.team1.baronKills ?? 0}-${g.team2.baronKills ?? 0}`);
    }
    const objCountStr = objCounts.length > 0 ? ` · ${objCounts.join(", ")}` : "";

    // MVP / LVP
    const mvp = g.players.find((p) => p.isMvp);
    const lvp = g.players.find((p) => p.isLvp);
    const mvpStr = mvp ? `\n    · MVP: ${playerLine(mvp)}` : "";
    const lvpStr = lvp ? `\n    · LVP: ${playerLine(lvp)}` : "";

    // 핵심 활약 선수 (MVP·LVP 외 양 팀 KDA 상위 1명씩)
    const top1 = g.players
      .filter((p) => p.team === "team1" && !p.isMvp && !p.isLvp)
      .sort((a, b) => b.kda - a.kda)[0];
    const top2 = g.players
      .filter((p) => p.team === "team2" && !p.isMvp && !p.isLvp)
      .sort((a, b) => b.kda - a.kda)[0];
    const topStr = [
      top1 ? `\n    · ${ctx.match.team1NameKo} 핵심: ${playerLine(top1)}` : "",
      top2 ? `\n    · ${ctx.match.team2NameKo} 핵심: ${playerLine(top2)}` : "",
    ].join("");

    // 타임라인 (핵심 이벤트 — 누가 가져갔는지 + 추정 시점)
    let timelineStr = "";
    if (g.timeline && g.timeline.length > 0) {
      const events = g.timeline
        .slice(0, 5)
        .map((e) => {
          const who = e.team === "team1" ? ctx.match.team1NameKo : ctx.match.team2NameKo;
          const t = e.estimatedMinute != null ? `${e.estimatedMinute}분 ` : "";
          return `${t}${e.labelKo}(${who})`;
        })
        .join(" → ");
      if (events) timelineStr = `\n    · 흐름: ${events}`;
    }

    lines.push(
      `  - 게임 ${g.gameNumber}: ${winner} 승 (킬 ${g.team1.kills}-${g.team2.kills}, ${minutes}분)${sideStr}${goldStr}${firstsStr}${objCountStr}${mvpStr}${lvpStr}${topStr}${timelineStr}`,
    );
  }
  return lines.join("\n");
}

export function buildLolRecapPromptV2(ctx: LolRecapContext): string {
  const m = ctx.match;
  const winnerNameKo = m.winnerNameKo;
  const loserNameKo = m.loserNameKo;

  const s1 = ctx.seasonContext.team1;
  const s2 = ctx.seasonContext.team2;
  const t1Streak =
    s1.winStreak > 0 ? `${s1.winStreak}연승` : s1.loseStreak > 0 ? `${s1.loseStreak}연패` : "—";
  const t2Streak =
    s2.winStreak > 0 ? `${s2.winStreak}연승` : s2.loseStreak > 0 ? `${s2.loseStreak}연패` : "—";

  const winnerSide = m.winnerNameKo === m.team1NameKo ? "team1" : "team2";
  const winnerStd = winnerSide === "team1" ? s1 : s2;
  const loserStd = winnerSide === "team1" ? s2 : s1;

  const lineupTable = ctx.games.length > 0 ? buildLineupTable(ctx) : null;
  const gameSummaries = buildGameSummaries(ctx);
  const hasBothRosters =
    lineupTable !== null && !lineupTable.includes("(데이터 없음)");

  const ctxLines: string[] = [];
  ctxLines.push(
    `- match: ${m.tournamentName} · ${m.team1NameKo} ${m.team1Score}-${m.team2Score} ${m.team2NameKo} · ${m.startDateIso.slice(0, 10)} · 승자=${winnerNameKo}`,
  );
  if (m.patch) ctxLines.push(`- patch: ${m.patch}`);
  ctxLines.push(`- quote_hint: ${ctx.quote.emoji} ${ctx.quote.body}`);
  ctxLines.push(`- season ${m.team1NameKo}: ${s1.wins}승 ${s1.losses}패 (${s1.rank}위/${s1.total}팀), 세트 ${s1.setsWon}-${s1.setsLost}, 2-0셧다운 ${s1.twoZeroCount}회 / 2-0당함 ${s1.twoZeroReceived}회, 최근 5시리즈 ${s1.recent5.join("-") || "—"}, 현재 ${t1Streak}`);
  ctxLines.push(`- season ${m.team2NameKo}: ${s2.wins}승 ${s2.losses}패 (${s2.rank}위/${s2.total}팀), 세트 ${s2.setsWon}-${s2.setsLost}, 2-0셧다운 ${s2.twoZeroCount}회 / 2-0당함 ${s2.twoZeroReceived}회, 최근 5시리즈 ${s2.recent5.join("-") || "—"}, 현재 ${t2Streak}`);
  ctxLines.push("- games:");
  ctxLines.push(gameSummaries);
  if (hasBothRosters && lineupTable) {
    ctxLines.push("- 5라인 라인업 (게임 1·2 통합, 라인별 대표):");
    ctxLines.push(lineupTable);
  }
  // 다음 매치 + (있다면) 발행된 PREVIEW slug — 본문 마무리에 마크다운 링크 1개 인용용
  let nextPreviewLink: { teamName: string; slug: string; opponent: string } | null = null;
  if (ctx.nextMatch.team1) {
    const nx = ctx.nextMatch.team1;
    ctxLines.push(
      `- next ${m.team1NameKo}: ${nx.startDateIso.slice(5, 10)} vs ${nx.opponentNameKo}${nx.modelWinProb ? ` (시장 ${pct(nx.modelWinProb.home)})` : ""}${nx.previewSlug ? ` · preview=/articles/${nx.previewSlug}` : ""}`,
    );
    if (nx.previewSlug && !nextPreviewLink) {
      nextPreviewLink = { teamName: m.team1NameKo, slug: nx.previewSlug, opponent: nx.opponentNameKo };
    }
  }
  if (ctx.nextMatch.team2) {
    const nx = ctx.nextMatch.team2;
    ctxLines.push(
      `- next ${m.team2NameKo}: ${nx.startDateIso.slice(5, 10)} vs ${nx.opponentNameKo}${nx.modelWinProb ? ` (시장 ${pct(nx.modelWinProb.home)})` : ""}${nx.previewSlug ? ` · preview=/articles/${nx.previewSlug}` : ""}`,
    );
    if (nx.previewSlug && !nextPreviewLink) {
      nextPreviewLink = { teamName: m.team2NameKo, slug: nx.previewSlug, opponent: nx.opponentNameKo };
    }
  }
  if (nextPreviewLink) {
    ctxLines.push(
      `- nextMatchPreviewLink (마무리 단락 안에 자연스러운 한 문장으로 인용 — 마크다운 링크 1개): ${nextPreviewLink.teamName} vs ${nextPreviewLink.opponent} 의 다음 매치 프리뷰 → /articles/${nextPreviewLink.slug}`,
    );
  }
  if (ctx.starPlayersInMatch.length > 0) {
    ctxLines.push(`- stars_in_match: ${ctx.starPlayersInMatch.join(", ")}`);
  }

  // 단락 list 동적 빌드 — hasBothRosters=false 면 5라인 instruction 자체가 prompt 에 없음
  const sections: string[] = [
    "1) **H1 헤드라인** — 첫 줄 `# {헤드라인}` 형식. WRITING DOCTRINE 1번 패턴 사용.",
    "2) **굵은 도입부 1줄** — 헤드라인 직후. `**...**` 형식. 결과 + 매치 의미. 패치 있으면 자연스럽게 한 번 언급.",
  ];
  if (hasBothRosters) {
    sections.push(
      "3) **`## 5라인 매치업 결과`** 헤더 + 양 팀 5라인 (TOP·JGL·MID·ADC·SUP) 각 1~2문장.\n   - INPUT DATA 의 5라인 라인업 그대로 인용 — 선수 ID(영문본명, 한국본명) + 사용한 챔피언 풀(한국 공식 표기) + KDA.\n   - 각 라인 비교 시 **챔피언 픽 영향** 한 마디 (예: \"아트록스로 라인전 안정 vs 케넨의 광역 카운터\").\n   - 추측·환상·가짜 ID 절대 금지. 수치는 INPUT 그대로.",
    );
  }
  const idx = (n: number) => (hasBothRosters ? n : n - 1);
  sections.push(
    `${idx(4)}) **\`## 세트별 흐름\`** 헤더 + INPUT DATA games 의 각 게임을 **순서대로 한 단락씩** 분석. 게임 수만큼 문단을 만들되, 각 게임당 2~4문장:
   - 사이드(블루/레드), 게임 시간, 킬 카운트, 골드 격차를 자연스럽게 본문에 녹임 (예: "블루 사이드 레드 사이드 ... 분 만에 골드 ...k 우위로")
   - 핵심 오브젝트 우선권(퍼블·퍼타·퍼드·퍼바) 중 의미 있는 것 인용
   - MVP / LVP / 핵심 활약 선수의 챔피언·KDA·KP·데미지 수치 적극 활용
   - 타임라인 '흐름' 있으면 게임 전개 순서 묘사에 활용
   - **추측·환상 금지** — INPUT 수치 그대로`,
    `${idx(5)}) **\`## 시리즈 종합\`** 헤더 + 시리즈 전체 흐름 2~3문장. 최근 5시리즈·streak·세트 누적·h2h 종합. 비-LoL 용어 ("홈/원정", "득점", "강등권") 절대 금지.`,
    `${idx(6)}) **\`## 스코어베이스\`** 헤더 + 사전 모델 예측 vs 실제 결과 1~2문장 (quote_hint 인용 가능). 시장 평균 가능하면 짧게. "스코어베이스 모델은…", "스코어베이스 예측이…" 식으로 본문에서 사이트 이름을 한 번 자연스럽게 언급.`,
    `${idx(7)}) **\`## 시즌 함의\`** 헤더 + ${winnerNameKo} ${winnerStd.wins}승 ${winnerStd.losses}패 ${winnerStd.rank}위, ${loserNameKo} ${loserStd.wins}승 ${loserStd.losses}패 ${loserStd.rank}위 인용. 세트 득실·2-0 셧다운 횟수도 활용. 플레이오프 시드 영향. "강등권" 금지 (LCK 강등제 없음).`,
    `${idx(8)}) **마무리 단락 (헤더 없음)** — 매치 통계적 핵심 1~2문장. 다음 매치 있으면 자연스럽게 언급. 숫자 톤. INPUT DATA 에 nextMatchPreviewLink 가 있으면 그 단락 안에 자연스러운 마크다운 링크 1개 인용 (예: "[T1의 다음 매치 프리뷰](/articles/{slug})").`,
    `${idx(9)}) **마지막 줄 면책** — 정확히: \`본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다.\``,
  );

  return `# ROLE
LoL e스포츠 데이터 분석가 (Esports Wikis · Leaguepedia · OP.GG 수준).

# CONTEXT
스코어베이스(Scorebase) LCK 리뷰. 도박·베팅과 무관, 데이터 미디어.

# MISSION
끝난 LCK 시리즈의 결과·세트 흐름·${hasBothRosters ? "라인별 매치업·" : ""}시즌 함의를 정리한 RECAP 본문 작성.

# WRITING DOCTRINE
1. **H1 헤드라인 첫 줄 출력 필수**. 패턴 중 택1:
   - "[승자]의 [핵심 변수], [패자]를 [세트 카운트]으로 [표현] — [매치 의미]"
   - 예: "T1의 미드 장악, 농심을 2-0으로 정리 — 4위 굳히기"
   - 예: "디플러스 기아의 정글 우위, BNK 피어엑스를 2-0으로 제압 — 플레이오프 경쟁 가속"
2. 헤드라인 직후 **굵은 도입부 1줄** (한 줄 요약 — 결과 + 의미)
3. 선수 첫 등장: ID(영문본명, 한국본명). 예: 페이커(Faker, 이상혁)
4. 챔피언명은 한국 공식 표기 (아트록스 · 카이사 · 리 신 · 야스오 등)
5. 모델 사전 예측 vs 실제 결과 비교 (quote_hint 활용)
6. 시즌 함의 — 정규시즌 순위·플레이오프 시드 (강등 표현 금지, LCK 강등제 없음)
7. 도박 권유 표현 절대 금지
8. 데이터에 없는 사실 추측 금지 — 본명·KDA·챔피언 만들지 마라
9. **데이터 활용 적극성**: INPUT DATA games 의 사이드(블루/레드), 골드 격차, 오브젝트 우선권(퍼블·퍼타·퍼드·퍼바), 추가 드래곤/전령/바론 카운트, MVP/LVP/핵심 활약 선수의 KDA·KP·데미지·챔피언 — 가능한 한 많이 본문에 녹여 분석가 톤으로 풀어낸다. 단순 나열 X, 흐름과 의미를 함께 설명.

# LoL 도메인 용어 매핑 (절대 준수)
축구·야구식 표현을 LoL 식으로 바꿔 쓴다. 다음 매핑 표 그대로 적용:

| 비-LoL (사용 금지) | LoL 표현 (이걸 써라) |
|---|---|
| 평균 득점 / 평균 실점 / 득실 | 세트당 평균 킬 / 평균 세트 득실 (2-1 → +1 세트 격차) |
| 클린시트 | (LoL 에서 사실상 불가 — 라벨·문장 자체 출력 금지) |
| 무득점 | 0킬 게임 (게임 단위 표현일 때만) |
| 원정 승 / 홈 승 / 홈 어드밴티지 | 블루 사이드 결과 / 레드 사이드 결과 (또는 사이드 무관 표기) |
| 골 / 득점 (점수) | 킬 (게임 단위) / 세트 (시리즈 단위) |
| 자책골 / 페널티킥 | 출력 금지 |
| 강등권 / 강등 위험 | (LCK 강등제 없음 — 출력 금지). 대신 "플레이오프 시드 경쟁", "스플릿 하위권" |
| xG · xGA · BTTS · OVER 2.5 골 | (축구 전용 — 출력 금지) |
| ERA · WHIP · 선발 투수 · OPS | (야구 전용 — 출력 금지) |
| Net Rating · Pace · 3P% | (농구 전용 — 출력 금지) |

# OUTPUT STRUCTURE
다음 단락을 **위에서 아래 순서로**, **빠뜨리지 말고**, **추가하지 말고** 출력.
분량 제한 없음 — INPUT DATA 에 있는 수치·선수·오브젝트·타임라인을 **전문 분석가 톤으로 충분히 풀어내라**.
단, 데이터에 없는 사실은 절대 만들지 마라 (수치 없는데 짐작 X · 본명 없는데 환상 X · 추측 형용사 X).

${sections.join("\n\n")}

# 절대 금지
- 위 OUTPUT STRUCTURE 목록에 명시되지 않은 단락·헤더 출력 금지
${!hasBothRosters ? "- '5라인' '매치업' '라인업' 단어가 들어간 헤더 출력 금지 (그 단락이 처음부터 없는 듯이 자연스럽게 진행)" : ""}
- 빈 단락·"데이터 없음"·"정보 없음" 같은 채움 문구 절대 금지
- "Unknown(언노운)" 같은 가짜 ID·존재하지 않는 본명 환상 절대 금지
- 본명 환상 금지: INPUT DATA 에 한국 본명 없으면 ID 만 사용

# INPUT DATA
${ctxLines.join("\n")}
`;
}
