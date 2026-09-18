// 위장 스크레이퍼 급증 판정 — daily-traffic cron 이 어제분 저장 직후 호출해 텔레그램으로 알린다.
//
// 기준은 2026-08-19~09-17 실측 위로 잡았다. 평소 의심 세션은 하루 200~360(9/2 한 번 777),
// 자동화 UA 하나의 최대 세션은 348(매일 오는 윈도우 Chrome/99). 9/17 알리바바 대역 Mac Chrome/145 는
// 첫날 1,026세션·다음날 9,740세션. 이 기준이면 한 달 동안 9/2·9/17·9/18 세 번만 울리고 셋 다 실제 이상이다.
import type { TopAutomated } from "@/lib/admin/daily-traffic";

/** 자동화 UA 하나가 하루에 만든 세션이 이 이상이면 알린다(평소 최대 348). */
export const SURGE_UA_SESSIONS = 600;
/** 의심 세션 합계 — 이 이상이면서 직전 중앙값의 SURGE_RATIO 배를 넘으면 알린다(평소 200~360). */
export const SURGE_SUSPICIOUS_FLOOR = 600;
export const SURGE_RATIO = 3;
/** 중앙값을 낼 최소 표본 — 이보다 적으면 배수 규칙은 쉰다(첫 주 오탐 방지). */
const MIN_BASELINE_DAYS = 7;

export type SurgeInput = { suspicious: number; topAutomated: TopAutomated | null };
export type SurgeResult = { alert: boolean; reasons: string[]; baselineMedian: number | null };

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** prevSuspicious = 판정 대상일 직전 날들의 의심 세션 수(대상일 제외). */
export function detectScraperSurge(day: SurgeInput, prevSuspicious: number[]): SurgeResult {
  const reasons: string[] = [];
  const baselineMedian = prevSuspicious.length >= MIN_BASELINE_DAYS ? median(prevSuspicious) : null;
  if (day.topAutomated && day.topAutomated.sessions >= SURGE_UA_SESSIONS) {
    reasons.push(`브라우저 정보 하나가 ${day.topAutomated.sessions.toLocaleString()}세션(기준 ${SURGE_UA_SESSIONS})`);
  }
  if (baselineMedian != null && day.suspicious >= SURGE_SUSPICIOUS_FLOOR && day.suspicious >= baselineMedian * SURGE_RATIO) {
    reasons.push(`의심 세션 ${day.suspicious.toLocaleString()}개 — 직전 중앙값 ${Math.round(baselineMedian)}의 ${(day.suspicious / Math.max(1, baselineMedian)).toFixed(1)}배`);
  }
  return { alert: reasons.length > 0, reasons, baselineMedian };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 운영 알림 표준(📍 무엇·⏰ 언제·💥 영향·➡️ 확인) 형식의 텔레그램 HTML. */
export function surgeMessage(dayKey: string, day: SurgeInput & { visitors: number }, r: SurgeResult): string {
  const t = day.topAutomated;
  return [
    `🚨 <b>위장 스크레이퍼 급증 (${dayKey})</b>`,
    ``,
    `📍 <b>무엇</b>: ${esc(r.reasons.join(" · "))}`,
    `⏰ <b>언제</b>: ${dayKey} 하루 (KST)`,
    `💥 <b>영향</b>: 방문자 통계는 이미 제외돼 사람 ${day.visitors.toLocaleString()}명으로 집계. 서버 부하·데이터 수집 가능성.`,
    ...(t
      ? [
          `🔍 <b>최다 UA</b>: ${esc(t.ua.slice(0, 160))}`,
          `   주로 긁은 페이지: ${esc(t.topPaths.map((p) => `${p.path} ${p.pv}`).join(" · "))}`,
        ]
      : []),
    ``,
    `➡️ <b>확인</b>: Claude 에 "스크레이퍼 확인해줘" — IP 대역 확인 후 middleware BLOCKED_IP_PREFIXES 추가 여부 판단.`,
  ].join("\n");
}
