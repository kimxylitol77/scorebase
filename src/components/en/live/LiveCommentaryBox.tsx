// live__LiveCommentaryBox (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import type { ReactElement } from "react";
import { useClientValue } from "@/lib/use-client-value";

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
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
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
  // Date.now() 의존 렌더(stale 숨김·"n분 전")는 SSR 과 하이드레이션 시각이 달라
  // mismatch → React 19 루트 재렌더 → 테마(html.dark) 리셋 사고가 났다.
  // 마운트 후에만 시간 의존 분기를 적용한다 (SSR·하이드레이션은 항상 동일 출력).
  const mounted = useClientValue(() => true, false);

  if (!matchSummary?.trim()) return null;
  if (/[가-힣]/.test(matchSummary)) return null; // 한국어 코멘터리는 영어판에 내보내지 않는다

  // 중국어 혼입 차단 — Qwen 출력이 한자로 나오는 경우 무조건 숨김
  if (hasChineseContamination(matchSummary)) return null;

  // stale 자동 숨김 — Mac mini 다운/Wi-Fi 끊김 시 fault tolerance.
  // 마운트 후에만 판정 — SSR/하이드레이션 사이 10분 경계를 넘으면 mismatch 가 나므로
  // SSR 은 항상 렌더하고, 마운트 직후 stale 이면 사라진다 (깜빡임 최대 1프레임).
  if (mounted && summaryAt) {
    const at = typeof summaryAt === "string" ? new Date(summaryAt) : summaryAt;
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
      title={`AI win probability — ${chipTeam} ${chipPct}%`}
    >
      🎯 {chipTeam} {chipPct}%
    </span>
  ) : null;

  const meta = (
    <div className="text-[10px] sm:text-xs text-neutral-500 flex items-center gap-1.5 flex-wrap">
      <span className="font-semibold">🤖 AI commentary</span>
      {scoreSnapshot && <span className="text-neutral-600">· {scoreSnapshot}</span>}
      {predChip}
      {summaryAt && (
        <span className="text-neutral-600 ml-auto">
          {mounted ? timeAgoKo(summaryAt) : ""}
        </span>
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
