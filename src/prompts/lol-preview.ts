// LCK / LoL 매치 프리뷰 전용 프롬프트.
// 축구 패턴(xG·BTTS·홈/원정 등)이 적용되지 않도록 일반 PreviewPrompt 와 완전히 분리.
//
// 데이터 갭 정책: 부재 항목은 HARD RULES 에 따라 해당 단락을 통째로 생략 (추측 금지).
// 풍성한 데이터(rosters·playerStats)는 Leaguepedia 통합 — graceful 실패 시 자동 생략.

import type {
  PreviewPromptInput,
  LolRosterPlayer,
  LolPlayerStatsLite,
  LolChampionMeta,
} from "./match-preview";
import { toKoreanTeamName } from "@/lib/team-names";
import { championKoreanName } from "@/lib/sports/leaguepedia";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

const ROLE_KO: Record<string, string> = {
  Top: "TOP",
  Jungle: "JGL",
  Mid: "MID",
  Bot: "ADC",
  Support: "SUP",
};

function rosterLine(label: string, players: LolRosterPlayer[]): string {
  if (players.length === 0) return "";
  const order = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const sorted = [...players].sort(
    (a, b) => order.indexOf(a.role) - order.indexOf(b.role),
  );
  const items = sorted.map((p) => {
    // 표기: ID(영문본명, 한국본명) — 본명 없으면 ID 만
    const inner: string[] = [];
    if (p.nameEn) inner.push(p.nameEn);
    if (p.nameKo) inner.push(p.nameKo);
    const namePart = inner.length > 0 ? `(${inner.join(", ")})` : "";
    const champs = p.recentChampions && p.recentChampions.length > 0
      ? ` [최근: ${p.recentChampions.map(championKoreanName).join("·")}]`
      : "";
    return `${ROLE_KO[p.role] ?? p.role} ${p.id}${namePart}${champs}`;
  });
  return `- ${label}: ${items.join(" / ")}`;
}

function statsLine(
  playerId: string,
  stats: LolPlayerStatsLite | undefined,
): string {
  if (!stats) return "";
  const parts: string[] = [`${stats.games}경기 평균 KDA ${stats.kda.toFixed(2)}`];
  if (stats.avgCs != null) parts.push(`CS ${stats.avgCs.toFixed(0)}`);
  if (stats.avgDpm != null) parts.push(`DMG ${stats.avgDpm.toFixed(0)}`);
  if (stats.avgGpm != null) parts.push(`GPM ${stats.avgGpm.toFixed(0)}`);
  const champs = stats.topChampions
    .map((c) => `${championKoreanName(c.champion)}(${c.games})`)
    .join(", ");
  if (champs) parts.push(`챔피언풀: ${champs}`);
  return `  · ${playerId} ${parts.join(" · ")}`;
}

function championMetaLine(meta: LolChampionMeta[]): string {
  const top = meta
    .slice(0, 6)
    .map((c) => {
      const pick = (c.picksRate * 100).toFixed(1);
      const ban = (c.banRate * 100).toFixed(1);
      const win = (c.winRate * 100).toFixed(1);
      return `${championKoreanName(c.name)}(픽 ${pick}%·밴 ${ban}%·승률 ${win}%)`;
    })
    .join(", ");
  return `- championMeta (글로벌 LoL 시즌 통계 top): ${top}`;
}

/**
 * 모델 표 마크다운 직접 생성 (GPT 가 깨먹지 않게 prompt 에 그대로 박음).
 * marketProb 있으면 4컬럼, 없으면 2컬럼.
 */
function buildPredictionTable(input: {
  t1: string;
  t2: string;
  winProb?: { home: number; away: number };
  marketProb?: { home: number; away: number };
  gameCountMarket?: { line: number; pOver: number };
  oneGameKillsMarket?: { line: number; pOver: number };
  totalMapsMarket?: { line: number; overImplied: number; underImplied: number };
}): string {
  const { t1, t2, winProb, marketProb, gameCountMarket, oneGameKillsMarket, totalMapsMarket } = input;
  if (!winProb) return "";
  const pct100 = (p: number) => `${Math.round(p * 100)}%`;
  const pctSigned = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n * 100)}%p`;

  const has4Col = !!marketProb;
  const header = has4Col
    ? "| 시장 | 모델 추정 | 시장 평균 | 차이 |\n| --- | --- | --- | --- |"
    : "| 시장 | 모델 추정 |\n| --- | --- |";

  const rows: string[] = [];

  // 시리즈 승자 — 항상 출력
  if (has4Col) {
    const gapHome = winProb.home - marketProb!.home;
    const gapAway = winProb.away - marketProb!.away;
    const dominantGap = Math.abs(gapHome) >= Math.abs(gapAway) ? gapHome : gapAway;
    const dominantSide = Math.abs(gapHome) >= Math.abs(gapAway) ? t1 : t2;
    rows.push(
      `| 시리즈 승자 | ${t1} ${pct100(winProb.home)} / ${t2} ${pct100(winProb.away)} | ${t1} ${pct100(marketProb!.home)} / ${t2} ${pct100(marketProb!.away)} | ${pctSigned(dominantGap)} (${dominantSide}) |`,
    );
  } else {
    rows.push(`| 시리즈 승자 | ${t1} ${pct100(winProb.home)} / ${t2} ${pct100(winProb.away)} |`);
  }

  // Bo3 게임 수 OU 2.5 — 모델 (가장 단순)
  if (gameCountMarket) {
    const over = gameCountMarket.pOver;
    if (has4Col && totalMapsMarket) {
      const gapOver = over - totalMapsMarket.overImplied;
      rows.push(
        `| 게임 수 OVER/UNDER ${gameCountMarket.line} (Bo3) | OVER ${pct100(over)} / UNDER ${pct100(1 - over)} | OVER ${pct100(totalMapsMarket.overImplied)} / UNDER ${pct100(totalMapsMarket.underImplied)} | ${pctSigned(gapOver)} (OVER) |`,
      );
    } else if (has4Col) {
      rows.push(
        `| 게임 수 OVER/UNDER ${gameCountMarket.line} (Bo3) | OVER ${pct100(over)} / UNDER ${pct100(1 - over)} | — | — |`,
      );
    } else {
      rows.push(
        `| 게임 수 OVER/UNDER ${gameCountMarket.line} (Bo3) | OVER ${pct100(over)} / UNDER ${pct100(1 - over)} |`,
      );
    }
  } else if (has4Col && totalMapsMarket) {
    // 모델 없어도 시장만 표기
    rows.push(
      `| 게임 수 OVER/UNDER ${totalMapsMarket.line} (Bo3) | — | OVER ${pct100(totalMapsMarket.overImplied)} / UNDER ${pct100(totalMapsMarket.underImplied)} | — |`,
    );
  }

  // 1게임 총 킬 OU — 모델 있을 때만
  if (oneGameKillsMarket) {
    const cols = has4Col ? 4 : 2;
    const cells = [
      `1게임 총 킬 OVER/UNDER ${oneGameKillsMarket.line}`,
      `OVER ${pct100(oneGameKillsMarket.pOver)} / UNDER ${pct100(1 - oneGameKillsMarket.pOver)}`,
    ];
    if (cols === 4) cells.push("—", "—");
    rows.push(`| ${cells.join(" | ")} |`);
  }

  return `${header}\n${rows.join("\n")}`;
}

function buildValueBetLine(
  t1: string,
  t2: string,
  winProb: { home: number; away: number },
  marketProb: { home: number; away: number },
): string | null {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const gapHome = winProb.home - marketProb.home;
  const gapAway = winProb.away - marketProb.away;
  const THRESH = 0.05;
  if (gapHome >= THRESH) {
    return `✨ Value Bet — ${t1} 모델 ${pct(winProb.home)} vs 시장 평균 ${pct(marketProb.home)} (+${Math.round(gapHome * 100)}%p). 모델이 시장보다 자신감 큰 라인.`;
  }
  if (gapAway >= THRESH) {
    return `✨ Value Bet — ${t2} 모델 ${pct(winProb.away)} vs 시장 평균 ${pct(marketProb.away)} (+${Math.round(gapAway * 100)}%p). 모델이 시장보다 자신감 큰 라인.`;
  }
  return null;
}

export function buildLolPreviewPrompt(input: PreviewPromptInput): string {
  const { match, context = {} } = input;
  const t1 = toKoreanTeamName(match.homeTeam.name);
  const t2 = toKoreanTeamName(match.awayTeam.name);
  const dateStr = match.startTime.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });

  // 컨텍스트 라인 — 있는 것만 채움.
  const ctxLines: string[] = [];
  ctxLines.push(
    `- match: 리그=${match.league}, ${t1} vs ${t2}, ${dateStr} (KST)`,
  );

  if (context.lolMeta?.patch) {
    ctxLines.push(
      `- patch: ${context.lolMeta.patch} (Data Dragon 기준 현재 라이브 패치)`,
    );
  }
  if (context.lolMeta?.standings) {
    const s = context.lolMeta.standings;
    ctxLines.push(
      `- standings (LCK 정규시즌 매치 결과 집계): ${t1} ${s.home.rank}위 (${s.home.wins}승 ${s.home.losses}패, 세트 ${s.home.setsWon}-${s.home.setsLost}) / ${t2} ${s.away.rank}위 (${s.away.wins}승 ${s.away.losses}패, 세트 ${s.away.setsWon}-${s.away.setsLost}) — 총 ${s.total}팀`,
    );
  }
  if (context.elo) {
    ctxLines.push(
      `- elo: ${t1} ${Math.round(context.elo.home)} / ${t2} ${Math.round(context.elo.away)}`,
    );
  }
  if (context.winProb) {
    ctxLines.push(
      `- winProb (시리즈 승자, 모델 1X2): ${t1} ${pct(context.winProb.home)} / ${t2} ${pct(context.winProb.away)}`,
    );
  }
  if (context.recentForm) {
    ctxLines.push(
      `- recent_form (최근 5시리즈, W=승 시리즈 / L=패 시리즈): ${t1} ${context.recentForm.home.join("-") || "-"} / ${t2} ${context.recentForm.away.join("-") || "-"}`,
    );
  }
  if (context.streak) {
    ctxLines.push(
      `- streak: ${t1} ${context.streak.home.winning}연승·${context.streak.home.losing}연패 / ${t2} ${context.streak.away.winning}연승·${context.streak.away.losing}연패`,
    );
  }
  if (context.trend) {
    ctxLines.push(
      `- trend (시리즈당 평균 세트): ${t1} 획득 ${context.trend.home.gf.toFixed(2)} · 허용 ${context.trend.home.ga.toFixed(2)} / ${t2} 획득 ${context.trend.away.gf.toFixed(2)} · 허용 ${context.trend.away.ga.toFixed(2)}`,
    );
  }
  if (context.h2h && context.h2h.total > 0) {
    ctxLines.push(
      `- h2h (최근 맞대결 시리즈 ${context.h2h.total}회): ${t1} ${context.h2h.homeWins}승 / ${t2} ${context.h2h.awayWins}승`,
    );
  }
  // 게임 수 OVER/UNDER (Bo3 풀세트 확률)
  if (context.lolMeta?.gameCountMarket) {
    const g = context.lolMeta.gameCountMarket;
    ctxLines.push(
      `- gameCountMarket (Bo3 게임 수 OVER/UNDER ${g.line}): 풀세트(3게임) 확률 ${pct(g.pOver)} (정규시즌 ${g.sample}매치 빈도 기반)`,
    );
  }
  // 1게임 총 킬 OVER/UNDER (BDL team_match_map_stats 분포 기반)
  if (context.lolMeta?.oneGameKillsMarket) {
    const k = context.lolMeta.oneGameKillsMarket;
    ctxLines.push(
      `- oneGameKillsMarket (1게임 총 킬 OVER/UNDER ${k.line}): OVER ${pct(k.pOver)} · 양 팀 평균 합 ${k.expectedTotal.toFixed(1)} 킬 (양 팀 ${k.sample}게임 분포 기반)`,
    );
  }
  // 1게임 핸디캡 (킬 차이)
  if (context.lolMeta?.oneGameHandicapMarket) {
    const h = context.lolMeta.oneGameHandicapMarket;
    const side = h.pick === "HOME" ? t1 : t2;
    ctxLines.push(
      `- oneGameHandicapMarket (1게임 킬 핸디캡 ${h.line}): ${side} -${h.line}킬 커버 확률 ${pct(h.prob)}`,
    );
  }
  // 로스터 (BDL discoverRoster — 최근 출전 게임에서 추출)
  if (context.lolMeta?.rosters) {
    const r = context.lolMeta.rosters;
    if (r.home.length > 0) ctxLines.push(rosterLine(`rosters ${t1}`, r.home));
    if (r.away.length > 0) ctxLines.push(rosterLine(`rosters ${t2}`, r.away));
  }
  // 선수 시즌 통계 (BDL player_match_map_stats 집계 — 양 팀 미드)
  if (context.lolMeta?.playerStats) {
    const ps = context.lolMeta.playerStats;
    const lines = Object.keys(ps).map((id) => statsLine(id, ps[id])).filter(Boolean);
    if (lines.length > 0) {
      ctxLines.push("- playerStats (BDL 시즌 집계, KDA·CS·DPM·GPM·챔피언풀):");
      ctxLines.push(...lines);
    }
  }
  // 챔피언 메타 (글로벌 BDL champion_stats)
  if (context.lolMeta?.championMeta && context.lolMeta.championMeta.length > 0) {
    ctxLines.push(championMetaLine(context.lolMeta.championMeta));
  }

  // 모델 표 미리 생성 — GPT 가 표 깨먹지 않게 prompt 에 그대로 박는다.
  const predictionTable = buildPredictionTable({
    t1,
    t2,
    winProb: context.winProb
      ? { home: context.winProb.home, away: context.winProb.away }
      : undefined,
    marketProb: context.marketProb
      ? { home: context.marketProb.home, away: context.marketProb.away }
      : undefined,
    gameCountMarket: context.lolMeta?.gameCountMarket
      ? {
          line: context.lolMeta.gameCountMarket.line,
          pOver: context.lolMeta.gameCountMarket.pOver,
        }
      : undefined,
    oneGameKillsMarket: context.lolMeta?.oneGameKillsMarket
      ? {
          line: context.lolMeta.oneGameKillsMarket.line,
          pOver: context.lolMeta.oneGameKillsMarket.pOver,
        }
      : undefined,
    totalMapsMarket: context.lolMeta?.totalMapsMarket
      ? {
          line: context.lolMeta.totalMapsMarket.line,
          overImplied: context.lolMeta.totalMapsMarket.overImplied,
          underImplied: context.lolMeta.totalMapsMarket.underImplied,
        }
      : undefined,
  });

  // Value Bet 한 줄 (marketProb 와 winProb 모두 있을 때, 5%p+ gap 있을 때만)
  const valueBetLine =
    context.marketProb && context.winProb
      ? buildValueBetLine(t1, t2, context.winProb, context.marketProb)
      : null;

  // 부재 데이터 명시 — GPT 가 할루시네이션 못 하도록.
  const absentLines: string[] = [];
  if (!context.lolMeta?.patch) {
    absentLines.push("- patch: (미수집)");
  }
  if (!context.lolMeta?.rosters) {
    absentLines.push(
      "- rosters: (미수집 — 5라인 매치업 단락 통째로 생략, 선수 ID/본명 언급 금지)",
    );
  }
  if (!context.lolMeta?.playerStats) {
    absentLines.push(
      "- player_stats (KDA·CS·DPM·GPM): (미수집 — 라인별 매치업에 통계 인용 금지)",
    );
  }
  if (!context.lolMeta?.championMeta) {
    absentLines.push(
      "- championMeta (글로벌 픽률·승률): (미수집 — '챔피언 픽·밴 예측' 단락 통째로 생략)",
    );
  }
  if (!context.lolMeta?.oneGameKillsMarket) {
    absentLines.push(
      "- oneGameKillsMarket / oneGameHandicapMarket: (미수집 — 1게임 단위 시장 행 표에서 생략)",
    );
  }
  absentLines.push(
    "- market_odds (베팅 사이트 implied): (미수집 — 시장 평균/차이 컬럼은 표에서 통째로 제거)",
  );

  return `# ROLE
당신은 LoL e스포츠 데이터 분석가다. Esports Wikis, Leaguepedia, OP.GG 수준의 데이터 분석을 한국어로 작성한다.

# CONTEXT
이 글은 "스코어베이스(Scorebase)" — 통계 기반 AI 스포츠 분석 미디어 — LCK / 롤드컵 카테고리에 게재된다. 도박·베팅과 무관, 데이터 미디어.

# MISSION
LoL 매치 프리뷰(시리즈 단위)를 작성한다.

# WRITING DOCTRINE
1. 패치 컨텍스트를 도입부에 명시. 헤드라인에 patch 가 등장하면 본문에서 반드시 영향을 풀어쓴다.
2. 라인별 매치업 분석 (TOP/JGL/MID/ADC/SUP 5라인 전부 — rosters 있을 때만)
3. 챔피언 픽·밴 예측 (meta_context 있을 때만)
4. 시리즈 단위 + 게임 단위 분리 (게임 수 OVER/UNDER 가 있으면 시리즈 길이 풀어쓰기)
5. 도박 권유 표현 절대 금지
6. 본문에 **최소 2명**의 선수를 "ID(영문ID, 본명)" 형식으로 표기 강제. 예: 페이커(Faker, 이상혁), 제우스(Zeus, 최우제). 단 rosters 가 미수집이면 이 규칙 면제 — 선수 이름 자체를 등장시키지 마라.
7. 챔피언명은 한국 공식 표기 (예: Aatrox → 아트록스, Kai'Sa → 카이사)

# OUTPUT STRUCTURE (900~1300자)

## 패치 컨텍스트
입력 'patch' 가 있을 때만 출력. 단락 제목 "## 패치 컨텍스트" 그대로 유지.
- 현재 패치 버전 명시 (예: ${context.lolMeta?.patch ?? "X.Y.Z"})
- **meta_context 가 없는 경우 — "여러 챔피언 밸런스 변화", "메타 변화", "전반적 메타 분석" 같은 추측성 일반 표현 금지.** 패치 핵심 변경점은 절대 만들어내지 마라. 대신 "현재 ${context.lolMeta?.patch ?? "X.Y.Z"} 패치 환경에서 치러지는 LCK 정규시즌 매치" 정도로 사실 진술 + 시리즈의 시즌적 위치(1위 경쟁, 플레이오프 시드 등)로 2~3문장만.
- 입력 'patch' 가 없으면 단락 제목을 "## 도입"으로 바꾸고 시즌적 위치만 2~3문장.

## 5라인 매치업
입력 'rosters' 가 있을 때만 출력. 없으면 **이 단락 통째로 생략.**
있을 때 양 팀에 존재하는 모든 라인(TOP/JGL/MID/ADC/SUP)을 굵게 라벨링하고 한 라인당 1~2문장:
- **TOP**: 양 팀 톱 라이너 ID(영문본명, 한국본명). recentChampions 가 있으면 자주 사용한 챔피언 1~2개 한국 공식 표기로 인용.
- **JGL**: 정글러 매치업. recentChampions 활용.
- **MID**: 미드 라이너 비교 — 임팩트가 가장 큰 라인. playerStats 가 있으면 KDA·CS·DPM·GPM·챔피언풀을 비교해 한 라인 우세를 진단.
- **ADC**: 봇 라이너. recentChampions 비교.
- **SUP**: 서포터. recentChampions 비교.
선수 이름 첫 등장 시 "ID(영문본명, 한국본명)" 형식. 본명이 입력에 없으면 ID만. 이후 등장은 ID만. **본문 전체에 최소 2명의 선수 ID(영문본명, 한국본명) 표기를 강제** — 단 본명 없으면 ID 자체로 1회씩 자연스럽게 호명.

## 챔피언 픽·밴 예측
입력 'championMeta' 가 있을 때만 출력. 없으면 **이 단락 통째로 생략.**
championMeta 의 top 4~6 챔피언을 인용해:
- 양 팀이 자주 픽하는 챔피언(recentChampions 와 교집합) → 양 팀 1티어 챔피언 풀
- 픽률·밴률 높은 챔피언 1~2개 짚어 양 팀의 밴 우선순위 예측 (예: "양 팀 모두 X 챔피언이 1티어로 분류 — 밴 페이즈 초반 등장 가능성")
- 챔피언명은 한국 공식 표기. 입력 메타에 없는 챔피언 만들어내지 마라.

## 시리즈 흐름 분석
'recent_form', 'streak', 'trend', 'h2h' 를 종합해 1문단. 최근 5시리즈 결과, 평균 세트 카운트(BO3 기준 2-0 vs 2-1 비율), 맞대결 전적 비교. **"홈/원정", "경기당 득점", "강등권" 같은 비-LoL 용어 절대 사용 금지.** LCK 는 한 스튜디오 진행이라 홈/원정 의미 없음.

## 모델 관점 — 시리즈 예측 표
**아래 표를 정확히 그대로 이 단락 본문에 출력**하라 (한 글자도 수정 금지, 행 분리 금지, 코드 블록 \`\`\` 으로 감싸지 마라).

${predictionTable || "(모델 데이터 없음 — 단락 통째로 생략)"}

${valueBetLine ? `\n표 바로 아래에 다음 한 줄을 그대로 출력:\n\n${valueBetLine}` : ""}

## 시즌 함의
LCK 정규 시즌 컨텍스트 — 플레이오프 진출 가능성, 스플릿 1위 경쟁, MSI/Worlds 시드 영향. 강등 관련 표현 금지 (LCK 강등제 없음). standings 가 있으면 순위·승점을 인용.

## 관전 포인트 3가지
각 포인트는 "변수 + 근거" 형식. 데이터에 있는 항목만 사용.
선수 ID 가 있으면 적어도 한 포인트는 선수 매치업으로.

## 한 줄 마무리
경기의 통계적 핵심을 한 문장으로 압축. 숫자 톤 유지.

# HARD RULES
- 데이터에 없는 사실 절대 추측 금지. 입력에 없는 선수 이름·챔피언명·KDA·패치 변경점 만들어내지 마라.
- **본명 환상 금지**: rosters 데이터에서 선수의 "nameKo" 가 비어 있으면 본명 절대 만들어내지 마라. 예: "Kingen(김형주)" 같은 본명은 입력 rosters 의 nameKo 필드에 있을 때만 표기. 없으면 "Kingen" ID 만 적는다.
- **한 라인에 한 선수**: rosters 의 같은 role 에 한 명만 존재. 양 팀의 같은 라인 선수가 같은 ID 면 데이터 오류 — 그 라인은 단락에서 생략. 양 팀에 다른 ID 만 매핑.
- **rosters 한 쪽만 있을 때**: 한 팀의 rosters 만 있고 상대 팀은 없으면 5라인 매치업 단락 통째로 생략 (한 쪽만 분석하면 매치업 의미 없음).
- **챔피언 픽·밴 단락**: championMeta 가 입력에 있으면 **반드시 출력**한다 (생략 금지). 단 양 팀 recentChampions 와 교차로 분석. 없는 챔피언 추가하지 마라.
- 부재 단락은 통째로 생략 — 빈 단락 제목 출력 금지, "정보가 없습니다" 같은 채움 문구 금지.
- "홈/원정", "득점/실점/골", "강등권", "xG", "xGA", "Net Rating", "Corsi", "선발 ERA" 등 비-LoL 용어 절대 금지.
- 세트 점수는 "2-0", "2-1" 카운트 표기. "2득점" 같은 표현 금지.
- 분량: **반드시 1100~1500자 이내** (헤드라인·면책 제외). 데이터 갭이 크면 700~1000자로 짧게 가도 됨.
  · 1500자를 넘으면 GPT/Claude 토큰 한도에서 글이 잘려 면책 문구가 누락된다. 절대 초과 금지.
  · 관전 포인트는 최대 3개, 각 1~2문장으로 압축.
- 면책: 글 끝에 "본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다."

# INPUT DATA
[제공된 항목]
${ctxLines.join("\n")}

[부재 항목 — 위 OUTPUT STRUCTURE 의 단락 생략 규칙 적용]
${absentLines.join("\n")}
`;
}
