// 픽을 낼 준비가 됐는지 판정하는 단일 기준 — 픽을 저장·발행하는 모든 경로가 이걸 통과해야 한다.
//
// **원칙 (2026-08-03, 사용자 확정): 야구 픽은 선발 투수가 확정됐을 때만 발행한다.**
//   선발은 야구 승률을 크게 흔드는 신호다(computeStarterAdjustment). 픽은 한 번 내면
//   고정이라(본 픽이 바뀌면 신뢰를 잃는다) 선발 전에 내면 그 신호를 영영 못 싣는다.
//   첫 배포 때 이 게이트가 없어 야구 예정경기 85건 중 82건(96%)이 선발 없이 박혔다.
//
//   축구 — 라인업이 대체로 고정이라 발표를 기다릴 필요는 없다. 대신 부상자 명단이
//     확정되는 킥오프 하루 전에 낸다.
//   그 외(농구·LOL 등) — 기다릴 선발 정보가 없어 그대로 낸다.
//   ⚠️ NHL 골리는 야구 선발과 같은 성격이다. 시즌 시작(10월) 전에 같은 게이트를 검토할 것.
import { BASEBALL_LEAGUES, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

/** 축구는 킥오프 이만큼 앞에서부터 픽을 낸다 (부상자 명단 확정 시점) */
export const SOCCER_LEAD_HOURS = 24;

export interface PickReadinessInput {
  league: string;
  startTime: Date;
  homeStarter: string | null;
  awayStarter: string | null;
}

export interface PickReadiness {
  ready: boolean;
  /** 아직이면 왜 — 로그·집계용 */
  reason?: "선발 미확정" | "하루 이상 남음";
}

/**
 * `opts.baseballOnly` — 야구 원칙만 본다. PREVIEW 글 경로에서 쓴다.
 *   축구 24시간 규칙은 "사전 픽을 언제 낼까"에 대한 것이라, 향후 3일치를 미리 쓰는
 *   PREVIEW 글까지 하루 전으로 미루면 콘텐츠만 줄고 얻는 게 없다.
 */
export function pickReadiness(
  m: PickReadinessInput,
  now: Date = new Date(),
  opts?: { baseballOnly?: boolean },
): PickReadiness {
  if (BASEBALL_LEAGUES.has(m.league)) {
    if (!m.homeStarter || !m.awayStarter) return { ready: false, reason: "선발 미확정" };
    return { ready: true };
  }
  if (!opts?.baseballOnly && SOCCER_LEAGUES.has(m.league)) {
    const leadH = (m.startTime.getTime() - now.getTime()) / 3600_000;
    if (leadH > SOCCER_LEAD_HOURS) return { ready: false, reason: "하루 이상 남음" };
    return { ready: true };
  }
  return { ready: true };
}
