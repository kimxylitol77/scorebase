// 핵심 배치 cron 의 실행 기록·기대주기 레지스트리 — dead-man's switch 의 단일 출처.
import { prisma } from "@/lib/db";

/**
 * 감시 대상 핵심 배치 cron. maxAgeH = 마지막 실행이 이보다 오래되면 누락 판정(기대주기 + 유예).
 *
 * zeroAlertAfter (옵션) = 처리 0건이 이 횟수만큼 연속되면 알림. **명시한 잡만 감시한다.**
 * 근거 — 2026-08-17 실측에서 CronRun 49건 중 20건 이상이 lastCount 를 아예 안 넘겼고,
 * 0 이 정상인 잡(백필 완료·비수기·정정 대상 없음)도 다수였다. 전면 적용은 오탐이 확실하다.
 */
export const CRON_REGISTRY: {
  name: string;
  label: string;
  maxAgeH: number;
  zeroAlertAfter?: number;
}[] = [
  // 데일리 — 기대 24h + 유예 4h = 28h
  { name: "odds", label: "베팅 배당", maxAgeH: 28 },
  { name: "af-odds", label: "확장 리그 배당 (api-football)", maxAgeH: 28 },
  // zeroAlertAfter 등록분 — 실측 마지막 처리량이 세 자리 이상이고, 비수기에도
  // 전 리그가 동시에 0 이 되기 어려운 잡만 넣었다. 운영하며 안전한 잡을 늘린다.
  { name: "closing-odds", label: "북메이커 클로징 아카이브", maxAgeH: 28, zeroAlertAfter: 4 },
  { name: "standings-collect", label: "축구 순위", maxAgeH: 28 },
  { name: "baseball-standings", label: "야구 순위", maxAgeH: 28 },
  { name: "archive-standings", label: "시즌 순위 아카이브", maxAgeH: 28 },
  { name: "baseball-season-stats", label: "야구 시즌스탯", maxAgeH: 28 },
  { name: "kbo-player-logs", label: "KBO 경기별 선수 로그", maxAgeH: 28 },
  { name: "npb-player-logs", label: "NPB 경기별 선수 로그", maxAgeH: 28 },
  { name: "verify-baseball-postponed", label: "야구 미래 POSTPONED 재대조", maxAgeH: 28 },
  { name: "fetch-transactions", label: "이적 거래", maxAgeH: 28 },
  { name: "league-leaders", label: "리그 리더", maxAgeH: 28 },
  { name: "mlb-starters", label: "MLB 선발", maxAgeH: 28 },
  { name: "nhl-goalies", label: "NHL 골리", maxAgeH: 28 },
  { name: "link-friendly-af", label: "클럽 친선 af 연결", maxAgeH: 28 },
  { name: "wc-sim-snapshot", label: "WC 우승확률", maxAgeH: 28 },
  { name: "sub-impact", label: "교체 임팩트 집계", maxAgeH: 28, zeroAlertAfter: 4 },
  // 하루 2회(10,22 UTC) — 기대 12h + 유예로 16h
  { name: "club-xi", label: "클럽 예상 라인업", maxAgeH: 16, zeroAlertAfter: 6 },
  { name: "player-photos", label: "선수 사진 백필", maxAgeH: 16 },
  { name: "league-sim-snapshot", label: "시즌 시뮬", maxAgeH: 28 },
  { name: "evaluate", label: "적중률 평가", maxAgeH: 28 },
  { name: "gpt-predictions", label: "멀티 AI 성적표", maxAgeH: 28 },
  { name: "transfer-briefs", label: "AI 이적 브리핑", maxAgeH: 28 },
  { name: "daily-thread", label: "오늘의 픽 스레드", maxAgeH: 28 },
  { name: "data-freshness", label: "선수 데이터 결손 감시", maxAgeH: 28 },
  // 6h 주기 — 기대 6h + 유예 4h = 10h
  { name: "football-season-watch", label: "축구 시즌 전환 감시", maxAgeH: 10 },
  // 2h 주기 — 기대 2h + 유예 4h = 6h
  { name: "news-briefing", label: "해외 브리핑", maxAgeH: 6 },
  { name: "llm-cost-watch", label: "LLM 비용 감시", maxAgeH: 6 },
  // 10분 주기 — 구독 0이어도 실행 기록은 남음. 유예 넉넉히
  { name: "push-alerts", label: "웹 푸시 킥오프 알림", maxAgeH: 2 },
  // 1h 주기 — env 미설정 no-op 도 실행 기록을 남기므로 오탐 없음 (broadcast-channel route)
  { name: "broadcast-channel", label: "텔레그램 채널 방송", maxAgeH: 6 },
  // 6h 주기 — 기대 6h + 유예 4h = 10h
  { name: "lol-collect", label: "LOL(LCK·EWC) 수집", maxAgeH: 10 },
  { name: "lol-ingame", label: "LOL 인게임 상세 수집", maxAgeH: 10 },
  // 하루 4회(UTC 22:30·08:00·08:30·14:00, 최대 공백 9.5h) + 유예 = 12h
  { name: "preview", label: "AI 프리뷰 발행", maxAgeH: 12 },
  // 위클리 — 기대 168h + 유예 12h = 180h
  { name: "fetch-salaries", label: "선수 연봉", maxAgeH: 180 },
  { name: "blog-weekly", label: "주간 블로그", maxAgeH: 180 },
  { name: "bing-seo", label: "빙 SEO 점검", maxAgeH: 180 },
  { name: "baseball-season-backfill", label: "야구 시즌 일정 백필", maxAgeH: 180 },
  // 주간 증분(최근 10일)이라 시즌 중 0건은 비정상 — from/to 누락 0건이 한 달 무감지였던 잡 (2026-08-19)
  { name: "player-match-logs", label: "선수 경기별 출전 로그", maxAgeH: 180, zeroAlertAfter: 2 },
  { name: "indexnow", label: "IndexNow 색인", maxAgeH: 28 },
  { name: "presence-cleanup", label: "실시간 접속 만료 정리", maxAgeH: 28 },
];

/**
 * 배치 cron 실행 기록 — 각 cron route 끝에서 호출. 실패해도 lastRunAt 은 갱신한다(실행은 됐으므로).
 * "실행 여부"를 기록해, dead-man's switch 가 시즌종료·비수기의 0건 처리와 진짜 미실행을 구분하게 한다.
 * 기록 실패가 본 작업을 막지 않도록 내부에서 swallow.
 */
export async function recordCronRun(
  name: string,
  opts?: { ok?: boolean; count?: number; error?: string },
): Promise<void> {
  const count = opts?.count;
  const data = {
    lastRunAt: new Date(),
    lastOk: opts?.ok ?? true,
    lastCount: count ?? null,
    lastError: opts?.error ?? null,
  };
  // 연속 0건 카운터 — count 를 넘긴 잡만 갱신한다. 안 넘기는 잡(전체의 절반)은
  // 0 과 "미보고"를 구분할 수 없으므로 손대지 않고 기존 값을 유지한다.
  const streak =
    count == null ? {} : count === 0 ? { zeroStreak: { increment: 1 } } : { zeroStreak: 0 };
  try {
    await prisma.cronRun.upsert({
      where: { name },
      create: { name, ...data, zeroStreak: count === 0 ? 1 : 0 },
      update: { ...data, ...streak },
    });
  } catch {
    // 모니터 기록 실패가 실제 배치 작업을 막지 않도록 무시
  }
}
