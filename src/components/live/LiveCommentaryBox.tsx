// 🤖 Ollama (Mac mini, Qwen 2.5 14B) 가 생성한 매치 상황 코멘터리 박스.
// matchSummary 가 없으면 null 반환 — 사이트에 미표시 (안전한 점진 노출).
//
// variant:
//   - "default": 라이브 페이지 어디든 사용 가능한 풀 박스 (border + padding).
//   - "inline":  다이아몬드 옆 등 기존 컨테이너 안에 끼워 넣는 가벼운 텍스트 블록.
//
// 데이터 source: prisma.LiveCommentary (matchId PK).
// 갱신 주기: Mac mini match-narrator worker (~5분).

import type { ReactElement } from "react";

export interface LiveCommentaryData {
  matchSummary: string | null;
  summaryAt: Date | string | null;
  scoreSnapshot: string | null;
  /** predictionEngine 결과 (Match.predHome/Away/Winner). UI chip 표시 + score 검증.
   *  predWinner=null + predHome 있음 → NO_PICK (LiveCommentaryBox 가 chip 생략).
   *  모든 값 null → prediction 미생성 (chip 안 보임). */
  prediction?: {
    pick: "HOME" | "AWAY" | "DRAW" | null;
    probHome: number | null;
    probDraw?: number | null;
    probAway: number | null;
    homeName?: string;
    awayName?: string;
  } | null;
  /** Match 현재 score (예측 vs LIVE score 격차 검증용) */
  homeScore?: number | null;
  awayScore?: number | null;
  sport?: "baseball" | "basketball" | "hockey" | "football" | "esports" | "other";
}

interface Props extends LiveCommentaryData {
  variant?: "default" | "inline" | "card";
}

/** 예측 chip 표시 여부 — LIVE score 격차가 pick 과 반대면 hide (사용자 신뢰도 보호).
 *  predictionEngine.validatePredictionDisplay 와 같은 원칙. */
function shouldShowPredictionChip(
  pick: "HOME" | "AWAY" | "DRAW" | null,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  sport: string | undefined,
): boolean {
  if (!pick || pick === "DRAW") return false;
  if (homeScore == null || awayScore == null) return true;
  const diff = homeScore - awayScore;
  let bigDiff = 2;
  if (sport === "baseball") bigDiff = 4;
  if (sport === "basketball") bigDiff = 10;
  if (sport === "hockey") bigDiff = 3;
  if (Math.abs(diff) < bigDiff) return true;
  if (diff > 0 && pick === "AWAY") return false;
  if (diff < 0 && pick === "HOME") return false;
  return true;
}

function timeAgoKo(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const diff = Math.max(0, Date.now() - date.getTime());
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  return `${hr}시간 전`;
}

/** Mac mini worker 가 멈춘 뒤 STALE_MS 이상 지나면 코멘터리를 숨김.
 * 사용자에게 옛날 상황 (예: 1시간 전 9회) 보여주는 걸 방지.
 * 기본 10분 — match-narrator worker 5분 주기 기준 2 사이클 누락 시 hide. */
const STALE_MS = 10 * 60 * 1000;

/** Qwen 한국어 한계 — 한자 (CJK) 5자 이상 들어가면 중국어 혼입으로 간주, hide. */
function hasChineseContamination(text: string): boolean {
  const cjk = text.match(/[一-鿿]/g);
  return (cjk?.length ?? 0) >= 5;
}

export default function LiveCommentaryBox({
  matchSummary,
  summaryAt,
  scoreSnapshot,
  prediction,
  homeScore,
  awayScore,
  sport,
  variant = "default",
}: Props): ReactElement | null {
  if (!matchSummary?.trim()) return null;

  // 중국어 혼입 차단 — Qwen 출력이 한자로 나오는 경우 무조건 숨김
  if (hasChineseContamination(matchSummary)) return null;

  // stale 자동 숨김 — Mac mini 다운/Wi-Fi 끊김 시 fault tolerance
  if (summaryAt) {
    const at = typeof summaryAt === "string" ? new Date(summaryAt) : summaryAt;
    // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
    // eslint-disable-next-line react-hooks/purity
    if (Date.now() - at.getTime() > STALE_MS) return null;
  }

  // 예측 chip — pick 있고 score 와 큰 충돌 없을 때만. predHome 있는데 pick=null 이면 NO_PICK 라 chip 숨김.
  const showChip = prediction
    ? shouldShowPredictionChip(prediction.pick, homeScore, awayScore, sport)
    : false;
  const chipTeam = prediction?.pick === "HOME"
    ? prediction.homeName
    : prediction?.pick === "AWAY"
      ? prediction.awayName
      : null;
  const chipPct = showChip && prediction
    ? Math.round(
        ((prediction.pick === "HOME"
          ? prediction.probHome
          : prediction.probAway) ?? 0) * 100,
      )
    : 0;
  const predChip = showChip && chipTeam && chipPct >= 58 ? (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-semibold"
      style={{ background: "rgba(59,130,246,.12)", color: "#93c5fd" }}
      title={`AI 승률 예측 — ${chipTeam} ${chipPct}%`}
    >
      🎯 {chipTeam} {chipPct}%
    </span>
  ) : null;

  const meta = (
    <div className="text-[10px] sm:text-xs text-neutral-500 flex items-center gap-1.5 flex-wrap">
      <span className="font-semibold">🤖 AI 코멘터리</span>
      {scoreSnapshot && <span className="text-neutral-600">· {scoreSnapshot}</span>}
      {predChip}
      {summaryAt && (
        <span className="text-neutral-600 ml-auto">{timeAgoKo(summaryAt)}</span>
      )}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="flex-1 min-w-0 max-w-md">
        {meta}
        <p className="mt-1 text-xs sm:text-sm text-neutral-300 leading-relaxed">
          {matchSummary}
        </p>
      </div>
    );
  }

  // /scores 야구 카드 — 다이아몬드 옆 빈 공간. chip + 본문 3줄 클램프.
  if (variant === "card") {
    return (
      <div className="flex-1 min-w-0">
        {predChip && <div className="mb-1">{predChip}</div>}
        <p className="text-[11px] sm:text-xs text-neutral-300 dark:text-neutral-300 leading-snug line-clamp-3">
          {matchSummary}
        </p>
      </div>
    );
  }

  // default
  return (
    <div
      className="rounded-xl p-3 sm:p-4"
      style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.06)",
      }}
    >
      {meta}
      <p className="mt-2 text-sm text-neutral-200 leading-relaxed">{matchSummary}</p>
    </div>
  );
}
