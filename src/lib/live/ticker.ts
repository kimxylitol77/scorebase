// 라이브 한국어 텍스트 티커 — 이벤트/이닝 데이터를 반응 문장으로 바꾸는 순수 변환 (LLM 0, 클라이언트 안전).

export interface TickerLine {
  key: string;
  /** 시점 배지 — "45+2'" | "5회말" | "종료" */
  tag: string;
  kind: "goal" | "card" | "subst" | "var" | "score" | "info";
  text: string;
}

/** SportLiveDetail 의 SoccerEventItem / live-scores 의 SoccerEvent 공통 부분집합 */
interface SoccerEventLite {
  minute: number;
  extra?: number;
  type: "goal" | "card" | "subst" | "var";
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

/** 득점 후 상황 꼬리말 — 누적 스코어 연산으로 결정론 생성 */
function goalSituation(
  prevFor: number,
  prevAgainst: number,
  newFor: number,
  newAgainst: number,
): string {
  if (prevFor === 0 && prevAgainst === 0 && newAgainst === 0) return "선취골입니다";
  if (newFor === newAgainst) return "승부는 다시 원점";
  if (newFor > newAgainst && prevFor < prevAgainst) return "역전입니다";
  if (newFor > newAgainst && prevFor === prevAgainst) return "균형을 깨고 앞서갑니다";
  if (newFor > newAgainst) return "리드를 벌립니다";
  if (newAgainst - newFor === 1) return "한 골 차 추격";
  return "추격을 시작합니다";
}

function minuteTag(minute: number, extra?: number): string {
  return extra && extra > 0 ? `${minute}+${extra}'` : `${minute}'`;
}

/**
 * 축구 이벤트 → 티커 라인 (시간순). 피드는 최신순으로 뒤집어 렌더.
 * 누적 스코어는 incident 원본(homeScore/awayScore) 우선, 없으면(af fallback) 순차 카운트.
 */
export function soccerTickerLines(
  events: SoccerEventLite[],
  homeName: string,
  awayName: string,
  opts?: { finished?: boolean; finalHome?: number | null; finalAway?: number | null },
): TickerLine[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) => a.minute * 100 + (a.extra ?? 0) - (b.minute * 100 + (b.extra ?? 0)),
  );
  const lines: TickerLine[] = [
    { key: "start", tag: "시작", kind: "info", text: "경기 시작 — 킥오프." },
  ];
  let h = 0;
  let a = 0;
  sorted.forEach((e, idx) => {
    const teamName = e.side === "home" ? homeName : awayName;
    const tag = minuteTag(e.minute, e.extra);
    const key = `${e.type}-${e.minute}-${e.extra ?? 0}-${e.side}-${e.playerName ?? idx}`;
    if (e.type === "goal") {
      if (e.detail === "Penalty Shootout") {
        lines.push({
          key,
          tag: "PK",
          kind: "goal",
          text: `승부차기 — ${teamName} ${e.playerName ?? "키커"} 성공.`,
        });
        return;
      }
      const prevH = h;
      const prevA = a;
      if (typeof e.homeScore === "number" && typeof e.awayScore === "number") {
        h = e.homeScore;
        a = e.awayScore;
      } else if (e.side === "home") {
        h += 1;
      } else {
        a += 1;
      }
      const situation =
        e.side === "home"
          ? goalSituation(prevH, prevA, h, a)
          : goalSituation(prevA, prevH, a, h);
      const kindLabel =
        e.detail === "Penalty"
          ? "페널티킥 득점"
          : e.detail === "Extra Time Goal"
            ? "연장 득점"
            : "득점";
      const who = e.playerName ? ` ${e.playerName}` : "";
      const assist = e.assistName ? ` (도움 ${e.assistName})` : "";
      lines.push({
        key,
        tag,
        kind: "goal",
        text: `${teamName}${who} ${kindLabel}!${assist} ${situation} — ${homeName} ${h}:${a} ${awayName}.`,
      });
    } else if (e.type === "card") {
      const red = e.detail === "Red Card";
      lines.push({
        key,
        tag,
        kind: "card",
        text: red
          ? `${teamName} ${e.playerName ?? "선수"} 퇴장! 수적 열세에 놓입니다.`
          : `${teamName} ${e.playerName ?? "선수"} 경고.`,
      });
    } else if (e.type === "subst") {
      // tsIncidentsToEvents 계약 — playerName=실제 IN, assistName=실제 OUT
      const inP = e.playerName ?? "선수";
      const outP = e.assistName;
      lines.push({
        key,
        tag,
        kind: "subst",
        text: outP
          ? `${teamName} 교체 — ${inP} 투입, ${outP} 아웃.`
          : `${teamName} 교체 — ${inP} 투입.`,
      });
    } else {
      lines.push({
        key,
        tag,
        kind: "var",
        text: `VAR 판독 진행 — 잠시 흐름이 끊깁니다.`,
      });
    }
  });
  if (opts?.finished) {
    const fh = opts.finalHome ?? h;
    const fa = opts.finalAway ?? a;
    lines.push({
      key: "end",
      tag: "종료",
      kind: "info",
      text: `경기 종료 — 최종 ${homeName} ${fh}:${fa} ${awayName}.`,
    });
  }
  return lines;
}

/**
 * 야구 linescore → 티커 라인 (시간순). 득점 있는 하프이닝만 문장 생성.
 * linescore 배열이 전체 히스토리라 무상태 재구성 가능.
 */
export function baseballTickerLines(args: {
  awayInnings: (number | null)[];
  homeInnings: (number | null)[];
  awayName: string;
  homeName: string;
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  awayTotal?: number;
  homeTotal?: number;
}): TickerLine[] {
  const { awayInnings, homeInnings, awayName, homeName, status } = args;
  const n = Math.max(awayInnings.length, homeInnings.length);
  const started =
    status !== "PRE" ||
    awayInnings.some((v) => v != null) ||
    homeInnings.some((v) => v != null);
  if (!started) return [];

  const lines: TickerLine[] = [
    { key: "start", tag: "시작", kind: "info", text: "플레이볼 — 경기 시작." },
  ];
  let a = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const halves: Array<{ side: "away" | "home"; runs: number | null }> = [
      { side: "away", runs: awayInnings[i] ?? null },
      { side: "home", runs: homeInnings[i] ?? null },
    ];
    for (const half of halves) {
      if (half.runs == null || half.runs <= 0) continue;
      const prevFor = half.side === "away" ? a : h;
      const prevAgainst = half.side === "away" ? h : a;
      if (half.side === "away") a += half.runs;
      else h += half.runs;
      const newFor = half.side === "away" ? a : h;
      const newAgainst = half.side === "away" ? h : a;
      const teamName = half.side === "away" ? awayName : homeName;
      const situation = goalSituation(prevFor, prevAgainst, newFor, newAgainst)
        .replace("선취골입니다", "선취점입니다")
        .replace("역전입니다", "역전에 성공합니다")
        .replace("한 골 차 추격", "한 점 차 추격");
      lines.push({
        key: `inn-${i + 1}-${half.side}-${newFor}`,
        tag: `${i + 1}회${half.side === "away" ? "초" : "말"}`,
        kind: "score",
        text: `${teamName} ${half.runs}득점! ${situation} — ${awayName} ${a}:${h} ${homeName}.`,
      });
    }
  }
  if (status === "FINAL") {
    const fa = args.awayTotal ?? a;
    const fh = args.homeTotal ?? h;
    lines.push({
      key: "end",
      tag: "종료",
      kind: "info",
      text: `경기 종료 — 최종 ${awayName} ${fa}:${fh} ${homeName}.`,
    });
  } else if (status === "DELAY") {
    lines.push({
      key: "delay",
      tag: "중단",
      kind: "info",
      text: "경기 일시 중단 — 재개를 기다립니다.",
    });
  }
  return lines;
}
