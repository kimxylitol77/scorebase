// health-check 자가치유 루프 — 반복 알림 중 치유법이 결정적인 것을 자동으로 고친다.
//
// 왜 필요한가. 60일 실측에서 evaluation-gap 36회·odds-coverage 76회·starter-coverage
// 86회 등 같은 알림이 수십 번 반복됐는데, 각각의 치유 액션(멱등 cron 재실행)은 이미
// 존재했다. 탐지 → 텔레그램 → 사람이 수동 처리하던 루프를 기계가 닫게 한다.
//
// 구조 (루프의 4요소).
//   행동   — REMEDIATIONS 에 등록된 멱등 cron 을 내부 호출 (cron-freshness retryCron 패턴).
//   판정   — 액션 후 "같은 탐지기"(runSingleHealthCheck)를 재실행해 finding 소멸 확인.
//            별도 검증 로직을 두면 탐지와 어긋나므로 반드시 탐지기를 재사용한다.
//   상태   — HealthCheck 테이블 자체 (category="self-heal", key=카테고리 row = 시도 기록).
//   안전장치 4겹 —
//     ① 재검증 통과(healed)만 성공 처리
//     ② 카테고리당 ATTEMPT_WINDOW_DAYS 내 maxAttempts 회 상한 (액션이 카테고리 단위라 집계도 동일 단위)
//     ③ 한 pass 당 MAX_HEALS_PER_PASS 건 + 액션별 타임아웃
//     ④ 상한 도달 시 "사람 개입 필요" 에스컬레이션 후 자동 시도 중단 (영원히 안 돈다)
//
// ⚠️ 등록 금지 — 삭제·병합류(duplicate-match 등). 잘못 고치면 되돌릴 수 없는 액션은
//    사람(맥미니 스크립트의 dry-run→--apply 절차)에 남긴다. 순수 fetch→upsert 멱등만 등록.

import { prisma } from "@/lib/db";
import { runSingleHealthCheck } from "./index";
import type { HealthFinding } from "./types";

interface Remediation {
  /** 재실행할 탐지기 이름 (index.ts CHECKS 의 name) — 판정 기준의 단일 출처 */
  checkName: string;
  /** 치유 액션 — /api/cron/{route} */
  cronRoute: string;
  /** 이 key 들만 치유 (미지정 = 전부). starter-coverage 는 MLB 만 소스가 있다. */
  keys?: string[];
  /** ATTEMPT_WINDOW_DAYS 내 최대 시도 횟수 — 넘으면 에스컬레이션 후 중단 */
  maxAttempts: number;
  /** 액션 대기 상한(ms). 초과해도 실패가 아니라 "트리거함" — 다음 일일 체크가 비동기 판정 */
  actionTimeoutMs: number;
}

/**
 * 카테고리 → 치유법. **결정적·멱등·비파괴인 것만** 등록한다.
 * odds 재수집은 이름 매칭 실패가 원인일 땐 효과가 없는데, 그 경우 시도 상한을 소진하고
 * "사람 개입 필요"로 넘어간다 — 그것이 이 루프의 올바른 동작이다(무한 재시도 금지).
 */
const REMEDIATIONS: Record<string, Remediation> = {
  "evaluation-gap": {
    checkName: "evaluation-gap",
    cronRoute: "evaluate",
    maxAttempts: 3,
    // evaluate 는 최대 180s — 기다리지 않고 트리거만, 판정은 다음 일일 체크가 한다
    actionTimeoutMs: 25_000,
  },
  "starter-coverage": {
    checkName: "starter-coverage",
    cronRoute: "mlb-starters",
    keys: ["MLB"], // KBO·NPB 는 무료 소스 없음(알려진 한계) — 재실행해도 못 고친다
    maxAttempts: 3,
    actionTimeoutMs: 25_000,
  },
  "goalie-coverage-nhl": {
    checkName: "nhl-goalie-coverage",
    cronRoute: "nhl-goalies",
    maxAttempts: 3,
    actionTimeoutMs: 25_000,
  },
  "odds-coverage": {
    checkName: "odds-coverage",
    cronRoute: "odds",
    // The Odds API 는 월 쿼터가 있다 — 시도를 더 짧게 끊는다
    maxAttempts: 2,
    actionTimeoutMs: 25_000,
  },
  "leaderboard-season": {
    checkName: "leaderboard-season",
    cronRoute: "league-leaders",
    // 잡이 리그를 순회해 오래 걸린다 — 트리거만 하고 판정은 다음 일일 체크가 한다.
    maxAttempts: 2,
    actionTimeoutMs: 25_000,
  },
  "club-xi": {
    checkName: "club-xi-quality",
    cronRoute: "club-xi",
    // stale(캐시 정지)·coords(좌표 결손)는 재실행으로 채워진다.
    // wrong-squad 는 빼둔다 — 브리지가 남의 팀을 끌어오는 건 코드·데이터 문제라 몇 번을
    // 다시 돌려도 같은 결과가 나온다. 시도 상한만 태우고 사람 개입을 늦출 뿐이다.
    keys: ["stale", "coords"],
    maxAttempts: 2,
    actionTimeoutMs: 25_000,
  },
  "player-log-freshness": {
    checkName: "player-log-freshness",
    cronRoute: "player-match-logs",
    // 잡이 60~120s 라 트리거만 하고 판정은 다음 일일 체크 — af 콜 ~수백이라 2회로 끊는다
    maxAttempts: 2,
    actionTimeoutMs: 25_000,
  },
};

const ATTEMPT_WINDOW_DAYS = 7;
const MAX_HEALS_PER_PASS = 2; // health-check maxDuration 안에서 안전한 개수

export type HealOutcome =
  | { kind: "healed" } // 액션 후 재검증에서 finding 소멸
  | { kind: "triggered" } // 액션 트리거함(장기 실행) — 다음 일일 체크가 판정
  | { kind: "failed"; attempts: number } // 액션은 돌았지만 finding 잔존
  | { kind: "exhausted"; attempts: number } // 시도 상한 도달 — 사람 개입 필요
  | { kind: "skipped" }; // pass 한도 초과 등으로 이번엔 안 함

/** finding 별 자가치유 결과. Map 키는 `${category}/${key}`. */
export type HealReport = Map<string, HealOutcome>;

export function healKey(f: Pick<HealthFinding, "category" | "key">): string {
  return `${f.category}/${f.key}`;
}

/** 카테고리 단위 시도 횟수 — 액션(cron)이 카테고리 단위이므로 집계도 같은 단위여야 일관된다. */
async function countRecentAttempts(category: string): Promise<number> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_DAYS * 86400_000);
  return prisma.healthCheck.count({
    where: { category: "self-heal", key: category, runAt: { gte: since } },
  });
}

/** 액션 시도 1회 기록 — HealthCheck 가 곧 상태 파일. 기록 실패가 본 흐름을 막지 않는다. */
async function recordAttempt(category: string, ok: boolean, message: string): Promise<void> {
  try {
    await prisma.healthCheck.create({
      data: { severity: ok ? "OK" : "LOW", category: "self-heal", key: category, message },
    });
  } catch {
    /* 기록 실패 무시 */
  }
}

async function callCron(route: string, timeoutMs: number): Promise<"ok" | "fail" | "timeout"> {
  // apex(scorebase.kr)는 www 로 리다이렉트되는데, Node fetch(undici)는 리다이렉트에서
  // Authorization 헤더를 떨어뜨려 401 이 된다 — env 가 apex 로 적혀 있어도 www 로 정규화.
  const site = (process.env.SITE_URL || "https://www.scorebase.kr").replace(
    "://scorebase.kr",
    "://www.scorebase.kr",
  );
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${site}/api/cron/${route}`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok ? "ok" : "fail";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "timeout" : "fail";
  } finally {
    clearTimeout(t);
  }
}

/**
 * HIGH·MED finding 중 치유법이 등록된 것을 자동 치유 시도.
 * 같은 카테고리에 finding 이 여럿이면(리그별 등) 액션은 1회만 돌리고
 * 재검증으로 각 key 의 소멸을 개별 판정한다.
 */
export async function runSelfHeal(findings: HealthFinding[]): Promise<HealReport> {
  const report: HealReport = new Map();

  // 치유 대상 추리기 — 등록됨 + HIGH/MED + keyFilter 통과
  const targets = findings.filter((f) => {
    const r = REMEDIATIONS[f.category];
    if (!r) return false;
    if (f.severity !== "HIGH" && f.severity !== "MED") return false;
    if (r.keys && !r.keys.includes(f.key)) return false;
    return true;
  });
  if (targets.length === 0) return report;

  // 카테고리 단위로 묶는다 — 액션(cron)은 카테고리당 1회면 충분
  const byCategory = new Map<string, HealthFinding[]>();
  for (const f of targets) {
    const g = byCategory.get(f.category);
    if (g) g.push(f);
    else byCategory.set(f.category, [f]);
  }

  let healsThisPass = 0;
  for (const [category, group] of byCategory) {
    const r = REMEDIATIONS[category];

    // ── 겹 ② 시도 상한
    const attempts = await countRecentAttempts(category);
    if (attempts >= r.maxAttempts) {
      for (const f of group) report.set(healKey(f), { kind: "exhausted", attempts });
      continue;
    }

    // ── 겹 ③ pass 당 한도
    if (healsThisPass >= MAX_HEALS_PER_PASS) {
      for (const f of group) report.set(healKey(f), { kind: "skipped" });
      continue;
    }
    healsThisPass++;

    const result = await callCron(r.cronRoute, r.actionTimeoutMs);

    if (result === "timeout") {
      // 장기 실행(evaluate 등) — 트리거는 됐다. 판정은 다음 일일 체크의 몫.
      await recordAttempt(category, true, `${r.cronRoute} 트리거(응답 초과) — 다음 일일 체크가 판정`);
      for (const f of group) report.set(healKey(f), { kind: "triggered" });
      continue;
    }
    if (result === "fail") {
      await recordAttempt(category, false, `${r.cronRoute} 호출 실패 (시도 ${attempts + 1}/${r.maxAttempts})`);
      for (const f of group) report.set(healKey(f), { kind: "failed", attempts: attempts + 1 });
      continue;
    }

    // ── 겹 ① 판정 — 같은 탐지기 재실행, key 별 finding 소멸 확인
    let after: HealthFinding[];
    try {
      after = await runSingleHealthCheck(r.checkName);
    } catch {
      after = group; // 재검증 자체가 실패하면 보수적으로 "잔존" 취급
    }
    const remaining = new Set(after.map((f) => healKey(f)));
    const healed = group.filter((f) => !remaining.has(healKey(f)));
    const still = group.filter((f) => remaining.has(healKey(f)));
    await recordAttempt(
      category,
      still.length === 0,
      `${r.cronRoute} 실행 — 해소 ${healed.length}/${group.length}` +
        (still.length ? ` (잔존: ${still.map((f) => f.key).join(",")} · 시도 ${attempts + 1}/${r.maxAttempts})` : ""),
    );
    for (const f of healed) report.set(healKey(f), { kind: "healed" });
    for (const f of still) report.set(healKey(f), { kind: "failed", attempts: attempts + 1 });
  }
  return report;
}

/** 텔레그램 본문에 붙일 결과 주석. 치유된 건 호출부에서 목록 제외를 판단한다. */
export function healAnnotation(o: HealOutcome | undefined): string {
  if (!o) return "";
  switch (o.kind) {
    case "healed":
      return " · 🩹 자가치유 완료";
    case "triggered":
      return " · 🩹 자가치유 트리거함(내일 재검)";
    case "failed":
      return ` · 자가치유 시도 ${o.attempts}회 실패`;
    case "exhausted":
      return ` · ⛔ 자가치유 ${o.attempts}회 실패 — 사람 개입 필요`;
    case "skipped":
      return "";
  }
}
