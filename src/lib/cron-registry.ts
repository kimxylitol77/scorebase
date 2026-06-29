// 핵심 배치 cron 의 실행 기록·기대주기 레지스트리 — dead-man's switch 의 단일 출처.
import { prisma } from "@/lib/db";

/** 감시 대상 핵심 배치 cron. maxAgeH = 마지막 실행이 이보다 오래되면 누락 판정(기대주기 + 유예). */
export const CRON_REGISTRY: { name: string; label: string; maxAgeH: number }[] = [
  // 데일리 — 기대 24h + 유예 4h = 28h
  { name: "odds", label: "베팅 배당", maxAgeH: 28 },
  { name: "standings-collect", label: "축구 순위", maxAgeH: 28 },
  { name: "baseball-standings", label: "야구 순위", maxAgeH: 28 },
  { name: "baseball-season-stats", label: "야구 시즌스탯", maxAgeH: 28 },
  { name: "fetch-transactions", label: "이적 거래", maxAgeH: 28 },
  { name: "league-leaders", label: "리그 리더", maxAgeH: 28 },
  { name: "mlb-starters", label: "MLB 선발", maxAgeH: 28 },
  { name: "nhl-goalies", label: "NHL 골리", maxAgeH: 28 },
  { name: "wc-sim-snapshot", label: "WC 우승확률", maxAgeH: 28 },
  { name: "league-sim-snapshot", label: "시즌 시뮬", maxAgeH: 28 },
  { name: "evaluate", label: "적중률 평가", maxAgeH: 28 },
  { name: "gpt-predictions", label: "멀티 AI 성적표", maxAgeH: 28 },
  { name: "transfer-briefs", label: "AI 이적 브리핑", maxAgeH: 28 },
  // 6h 주기 — 기대 6h + 유예 4h = 10h
  { name: "lol-collect", label: "LOL(LCK·EWC) 수집", maxAgeH: 10 },
  // 위클리 — 기대 168h + 유예 12h = 180h
  { name: "fetch-salaries", label: "선수 연봉", maxAgeH: 180 },
  { name: "blog-weekly", label: "주간 블로그", maxAgeH: 180 },
  { name: "bing-seo", label: "빙 SEO 점검", maxAgeH: 180 },
  { name: "indexnow", label: "IndexNow 색인", maxAgeH: 28 },
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
  const data = {
    lastRunAt: new Date(),
    lastOk: opts?.ok ?? true,
    lastCount: opts?.count ?? null,
    lastError: opts?.error ?? null,
  };
  try {
    await prisma.cronRun.upsert({
      where: { name },
      create: { name, ...data },
      update: data,
    });
  } catch {
    // 모니터 기록 실패가 실제 배치 작업을 막지 않도록 무시
  }
}
