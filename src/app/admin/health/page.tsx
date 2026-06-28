// /admin/health — Health-check 봇 결과 대시보드.
// 오늘 issue 카드 + 최근 7일 추세 + 카테고리별 분포.

import { prisma } from "@/lib/db";
import { BOT_REGISTRY as BOT_META } from "@/lib/bot-registry";
import BotHeartbeatTable, { type BotRow } from "./BotHeartbeatTable";
import HealthChatStream, { type ChatMessage } from "./HealthChatStream";

const AI_NAME = "스코어베이스 AI";

// 30초 ISR — 헬스 데이터는 봇 주기(분 단위)라 실시간 불필요. 매 방문 DB 전체 재실행(force-dynamic) 회피
// → 캐시 HTML 응답으로 체감 속도·DB 풀 부하 해소(2026-06-28). /admin 인증은 미들웨어가 담당.
export const revalidate = 30;

const SEVERITY_COLOR: Record<string, { bg: string; text: string; emoji: string; label: string }> = {
  HIGH: {
    bg: "bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/30",
    text: "text-rose-700 dark:text-rose-300",
    emoji: "🚨",
    label: "HIGH",
  },
  MED: {
    bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30",
    text: "text-amber-700 dark:text-amber-300",
    emoji: "⚠️",
    label: "MED",
  },
  LOW: {
    bg: "bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/30",
    text: "text-sky-700 dark:text-sky-300",
    emoji: "ℹ️",
    label: "LOW",
  },
  OK: {
    bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
    emoji: "✅",
    label: "OK",
  },
};

// 봇별 예상 주기/한글명/역할 = 단일 레지스트리 (@/lib/bot-registry).
// lastAt 이 intervalMs × 2 넘으면 지연, × 4 넘으면 다운. 봇 추가/주기변경은 레지스트리에서.

function botStatus(ageMs: number, intervalMs: number) {
  if (ageMs <= intervalMs * 2) return { label: "정상", color: "emerald" };
  if (ageMs <= intervalMs * 4) return { label: "지연", color: "amber" };
  return { label: "다운", color: "rose" };
}

function fmtAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}초 전`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}분 전`;
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}시간 전`;
  return `${Math.round(ms / 86400_000)}일 전`;
}

function formatRelativeAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}초`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}분`;
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}시간`;
  return `${Math.round(ms / 86400_000)}일`;
}

function formatInterval(ms: number): string {
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}분`;
  if (ms < 86400_000) return `${Math.round(ms / 3600_000)}시간`;
  return `${Math.round(ms / 86400_000)}일`;
}

// 카테고리별 한 줄 진단 — recentCritical 의 category/message 를 사람이 읽을 문장으로
function categoryInsight(
  category: string,
  message: string,
  metadata: Record<string, unknown> | null | undefined,
): { headline: string; action: string } {
  const md = metadata ?? {};
  switch (category) {
    case "route-guardian": {
      const bad404 = (md as { bad404?: number }).bad404 ?? 0;
      const samples = ((md as { sample404?: string[] }).sample404 ?? []).slice(0, 3);
      const headline = bad404 > 0
        ? `사이트에 ${bad404}개 깨진 URL 발견 — 방문자/검색엔진 영향`
        : message;
      const sampleHint = samples.length > 0 ? `\n   예: ${samples.join(", ")}` : "";
      return {
        headline: `🔗 ${headline}${sampleHint}`,
        action: bad404 > 0 ? "→ sitemap 또는 라우트 정리 필요 (가장 많은 prefix 부터)" : "",
      };
    }
    case "stale-cleanup": {
      const marked = (md as { marked?: number }).marked ?? 0;
      return {
        headline: `🧹 stale 매치 ${marked}건 자동 정리`,
        action: marked > 5 ? "→ collector 누락 여부 점검 권장" : "",
      };
    }
    case "match-count":
    case "match_count":
      return { headline: `📉 매치 수 이상 — ${message}`, action: "→ collector 로그 점검" };
    case "season-label":
      return { headline: `🏷️ 시즌 라벨 불일치 — ${message}`, action: "→ league 메타데이터 확인" };
    case "accuracy":
      return { headline: `🎯 예측 정확도 이상 — ${message}`, action: "→ 모델 재훈련 또는 데이터 점검" };
    case "ai-review":
      return { headline: `🤖 AI 리뷰 — ${message}`, action: "→ 발행 검수" };
    default:
      return { headline: `📌 ${category}: ${message}`, action: "" };
  }
}

function buildAiVerdict(s: {
  okCount: number;
  lagCount: number;
  downCount: number;
  staleMarked: number;
  staleByLeague: Record<string, number> | null;
  criticalSeverity: string | null;
  criticalCategory: string | null;
  criticalMessage: string | null;
  criticalMetadata: Record<string, unknown> | null;
  totalBots: number;
}): { text: string; tone: "ok" | "warn" | "down" } {
  const lines: string[] = [];
  let tone: "ok" | "warn" | "down" = "ok";

  // 1) 봇 상태 — 다양한 표현
  if (s.downCount > 0) {
    tone = "down";
    lines.push(`⚠️ 봇 ${s.downCount}/${s.totalBots} 다운 — Mac mini launchctl + 로그 확인 필요`);
  } else if (s.lagCount > 0) {
    tone = "warn";
    lines.push(`⏰ 봇 ${s.lagCount}/${s.totalBots} 지연 응답 — 봇 로그에서 timeout/예외 확인`);
  } else if (s.okCount > 0) {
    lines.push(`✅ 운영 봇 ${s.okCount}대 전부 정상 ping (Mac mini 자동 시작 OK)`);
  } else {
    lines.push(`⚠️ 등록된 봇 없음 — heartbeat 시스템 점검 필요`);
    tone = "warn";
  }

  // 2) stale 매치
  if (s.staleMarked > 0) {
    if (tone === "ok") tone = "warn";
    const leaguePart = s.staleByLeague
      ? " (" +
        Object.entries(s.staleByLeague)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([l, n]) => `${l} ${n}`)
          .join(", ") +
        ")"
      : "";
    lines.push(`🧹 stale SCHEDULED ${s.staleMarked}건 자동 정리됨${leaguePart}`);
  }

  // 3) 가장 시급한 finding — 카테고리별 맞춤
  if (s.criticalSeverity && s.criticalCategory && s.criticalMessage) {
    const insight = categoryInsight(s.criticalCategory, s.criticalMessage, s.criticalMetadata);
    if (s.criticalSeverity === "HIGH") {
      tone = "down";
      lines.push(`\n🚨 즉시 점검 [HIGH]`);
    } else {
      if (tone === "ok") tone = "warn";
      lines.push(`\n📋 검토 권장 [MED]`);
    }
    lines.push(insight.headline);
    if (insight.action) lines.push(insight.action);
  } else {
    // 시급 finding 없음 — 한 줄로 안심 메시지
    lines.push(`\n✨ 시급한 finding 없음 — 사이트 상태 양호`);
  }

  return { text: lines.join("\n"), tone };
}

function fmtKstDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}
function fmtKstDateTime(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(kst.getUTCMonth() + 1).padStart(2, "0")}/${String(kst.getUTCDate()).padStart(2, "0")} ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function HealthPage() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  // 최신 1회 run 의 시각 (한 run = 같은 분 안에 insert 된 row 들)
  const latest = await prisma.healthCheck.findFirst({
    orderBy: { runAt: "desc" },
    select: { runAt: true },
  });
  const runLo = latest ? new Date(latest.runAt.getTime() - 60 * 1000) : null;
  const runHi = latest ? new Date(latest.runAt.getTime() + 60 * 1000) : null;

  // 독립 쿼리는 병렬로 — 직렬 6회 round-trip 이 Neon 콜드 커넥션과 겹쳐 응답 16s+ 유발(2026-06-28 fix).
  const [latestFindings, recent30, staleCleanups, bots, latestStale, recentCritical] = await Promise.all([
    // 최신 run 의 모든 finding (insert 시각 1분 이내)
    latest
      ? prisma.healthCheck.findMany({
          where: { runAt: { gte: runLo!, lte: runHi! } },
          orderBy: [{ severity: "asc" }, { category: "asc" }],
        })
      : Promise.resolve([]),
    // 최근 30일 모든 row — 일별·심각도별 집계
    prisma.healthCheck.findMany({
      where: { runAt: { gte: since30 } },
      select: { runAt: true, severity: true, category: true },
      take: 5000,
    }),
    // stale-cleanup 최근 10건 — 봇이 자동 정리한 매치 + Haiku 진단
    prisma.healthCheck.findMany({ where: { category: "stale-cleanup" }, orderBy: { runAt: "desc" }, take: 10 }),
    // 봇 heartbeat — 모든 워커
    prisma.botHeartbeat.findMany({ orderBy: { lastAt: "desc" } }),
    // 최근 stale-cleanup 1건 (요약 메시지 + Haiku 진단)
    prisma.healthCheck.findFirst({ where: { category: "stale-cleanup" }, orderBy: { runAt: "desc" } }),
    // 최근 HIGH/MED finding 1건 — 최신 run 으로 한정(과거 1회성 HIGH 가 AI 종합 카드에 영구 잔존 방지).
    latest
      ? prisma.healthCheck.findFirst({
          where: {
            severity: { in: ["HIGH", "MED"] },
            category: { not: "stale-cleanup" },
            runAt: { gte: runLo! },
          },
          orderBy: [{ severity: "asc" }, { runAt: "desc" }], // HIGH(H) < MED(M) → HIGH 우선
        })
      : Promise.resolve(null),
  ]);

  // 일별 카운트 (KST 일자 키)
  const byDay = new Map<string, { HIGH: number; MED: number; LOW: number; OK: number }>();
  for (const r of recent30) {
    const k = fmtKstDate(r.runAt);
    const e = byDay.get(k) ?? { HIGH: 0, MED: 0, LOW: 0, OK: 0 };
    e[(r.severity as "HIGH" | "MED" | "LOW" | "OK") ?? "LOW"]++;
    byDay.set(k, e);
  }
  const days = Array.from(byDay.keys()).sort().reverse().slice(0, 14);

  // 카테고리 분포 (최근 30일)
  const byCategory = new Map<string, number>();
  for (const r of recent30) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }
  const topCategories = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // 봇 상태 통계 (채팅 요약용)
  let okCount = 0;
  let lagCount = 0;
  let downCount = 0;
  for (const b of bots) {
    const meta = BOT_META[b.name] ?? { intervalMs: 60 * 60 * 1000 };
    const age = Date.now() - b.lastAt.getTime();
    const s = botStatus(age, meta.intervalMs);
    if (s.label === "정상") okCount++;
    else if (s.label === "지연") lagCount++;
    else downCount++;
  }

  // 채팅 messages 생성 — 좌측 = 봇 보고, 우측 = AI 종합
  const chat: ChatMessage[] = [];

  // 1) 각 봇이 한 줄씩 보고 (정상은 묶어서 요약). BOT_META 누락 봇도 fallback 표시.
  const metaOf = (name: string) =>
    BOT_META[name] ?? { ko: name, intervalMs: 60 * 60 * 1000, role: "(미등록)" };
  if (downCount > 0 || lagCount > 0) {
    for (const b of bots) {
      const meta = metaOf(b.name);
      const age = Date.now() - b.lastAt.getTime();
      const s = botStatus(age, meta.intervalMs);
      if (s.label === "정상") continue;
      const tone: ChatMessage["tone"] = s.label === "다운" ? "down" : "warn";
      chat.push({
        side: "bot",
        name: meta.ko,
        text: `마지막 ping ${fmtKstDateTime(b.lastAt)} KST (${formatRelativeAge(age)} 전). 예상 주기 ${formatInterval(meta.intervalMs)}.\n→ ${s.label}`,
        tone,
        at: b.lastAt.toISOString(),
      });
    }
  }
  if (okCount > 0) {
    const okBots = bots
      .map((b) => {
        const meta = metaOf(b.name);
        const age = Date.now() - b.lastAt.getTime();
        const s = botStatus(age, meta.intervalMs);
        return s.label === "정상" ? meta.ko : null;
      })
      .filter(Boolean);
    chat.push({
      side: "bot",
      name: `정상 작동 ${okCount}봇`,
      text: okBots.length > 0 ? okBots.join(" · ") : `${okCount}개 봇 정상`,
      tone: "ok",
      at: new Date().toISOString(),
    });
  }
  // 봇 자체가 0개면 fallback 안내
  if (bots.length === 0) {
    chat.push({
      side: "bot",
      name: "heartbeat 시스템",
      text: "등록된 봇이 없습니다. Mac mini launchd 또는 internal heartbeat 호출 확인 필요.",
      tone: "warn",
      at: new Date().toISOString(),
    });
  }

  // 2) stale-cleanup 최근 보고
  if (latestStale) {
    const md = (latestStale.metadata ?? {}) as {
      marked?: number;
      diagnosis?: string;
      byLeague?: Record<string, number>;
    };
    if ((md.marked ?? 0) > 0) {
      const byLeague = md.byLeague
        ? Object.entries(md.byLeague)
            .map(([l, n]) => `${l} ${n}`)
            .join(" · ")
        : "";
      chat.push({
        side: "bot",
        name: "stale-cleanup",
        text: `stale SCHEDULED ${md.marked}건 자동 POSTPONED 처리.\n리그: ${byLeague}${md.diagnosis ? "\n\n🤖 진단:\n" + md.diagnosis : ""}`,
        tone: "warn",
        at: latestStale.runAt.toISOString(),
      });
    }
  }

  // 3) 최근 HIGH/MED finding 1건
  if (recentCritical) {
    chat.push({
      side: "bot",
      name: `health-check (${recentCritical.category})`,
      text: `[${recentCritical.severity}] ${recentCritical.message}`,
      tone: recentCritical.severity === "HIGH" ? "down" : "warn",
      at: recentCritical.runAt.toISOString(),
    });
  }

  // 4) 스코어베이스 AI 종합 (우측, 마지막)
  const staleMd = (latestStale?.metadata ?? null) as
    | { marked?: number; byLeague?: Record<string, number> }
    | null;
  const aiVerdict = buildAiVerdict({
    okCount,
    lagCount,
    downCount,
    totalBots: bots.length,
    staleMarked: staleMd?.marked ?? 0,
    staleByLeague: staleMd?.byLeague ?? null,
    criticalSeverity: recentCritical?.severity ?? null,
    criticalCategory: recentCritical?.category ?? null,
    criticalMessage: recentCritical?.message ?? null,
    criticalMetadata:
      (recentCritical?.metadata as Record<string, unknown> | null | undefined) ?? null,
  });
  chat.push({
    side: "ai",
    name: AI_NAME,
    text: aiVerdict.text,
    tone: aiVerdict.tone,
    at: new Date().toISOString(),
  });

  // table 용 정규화 row
  const botRows: BotRow[] = bots.map((b) => {
    const meta = BOT_META[b.name] ?? {
      ko: b.name,
      intervalMs: 60 * 60 * 1000,
      role: "(미등록 봇)",
    };
    const ageMs = Date.now() - b.lastAt.getTime();
    const status = botStatus(ageMs, meta.intervalMs);
    const md = (b.metadata ?? {}) as {
      host?: string;
      provider?: string;
      model?: string;
    };
    return {
      name: b.name,
      ko: meta.ko,
      role: meta.role,
      status: status.label as BotRow["status"],
      statusColor: status.color as BotRow["statusColor"],
      lastAtIso: b.lastAt.toISOString(),
      ageMs,
      intervalMs: meta.intervalMs,
      provider: md.provider ?? null,
      model: md.model ?? null,
      host: md.host ?? null,
    };
  });

  // 그룹화 — severity 순
  type FindingRow = (typeof latestFindings)[number];
  const findingsBySev: Record<string, FindingRow[]> = { HIGH: [], MED: [], LOW: [], OK: [] };
  for (const f of latestFindings) {
    (findingsBySev[f.severity as keyof typeof findingsBySev] ??= []).push(f);
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* 헤더 */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">사이트 상태 보드</h1>
          <p className="text-sm text-neutral-500 mt-1">
            매일 06:30 KST 자동 체크 · {latest ? `마지막 실행 ${fmtKstDateTime(latest.runAt)} KST` : "아직 실행 안 됨"}
          </p>
        </div>
        <form action="/api/cron/health-check" method="post" className="shrink-0">
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition font-semibold"
          >
            지금 실행
          </button>
        </form>
      </header>

      {/* 채팅 흐름 — 봇 보고 + AI 종합 (페이지 최상단 우선 노출) */}
      <section>
        <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
          💬 오늘의 점검 보고
        </h2>
        <HealthChatStream messages={chat} />
      </section>

      {/* 요약 카드 4개 */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["HIGH", "MED", "LOW", "OK"] as const).map((sev) => {
          const meta = SEVERITY_COLOR[sev];
          const cnt = findingsBySev[sev]?.length ?? 0;
          return (
            <div
              key={sev}
              className={`rounded-xl border ${meta.bg} px-4 py-3`}
            >
              <div className={`text-xs font-bold tracking-wider uppercase ${meta.text}`}>
                {meta.emoji} {meta.label}
              </div>
              <div className="text-3xl font-black mt-1 tabular-nums">{cnt}</div>
            </div>
          );
        })}
      </section>

      {/* 최신 run 의 issue 카드 */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2">
          최신 체크 결과
        </h2>
        {latestFindings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
            아직 데이터가 없습니다. "지금 실행" 을 눌러 첫 체크를 돌려보세요.
          </div>
        ) : (
          (["HIGH", "MED", "LOW"] as const).map((sev) => {
            const list = findingsBySev[sev] ?? [];
            if (list.length === 0) return null;
            const meta = SEVERITY_COLOR[sev];
            return (
              <div key={sev} className="space-y-2">
                <h3 className={`text-sm font-bold ${meta.text}`}>
                  {meta.emoji} {meta.label} ({list.length})
                </h3>
                <div className="space-y-2">
                  {list.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded-lg border ${meta.bg} px-4 py-3`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold tracking-wider uppercase opacity-70">
                            {f.category}
                          </span>
                          <span className="text-xs font-bold">{f.key}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 tabular-nums">
                          {fmtKstDateTime(f.runAt)}
                        </span>
                      </div>
                      <div className="text-sm mt-1">{f.message}</div>
                      {f.metadata && (
                        <details className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                          <summary className="cursor-pointer hover:text-neutral-900 dark:hover:text-white">
                            메타데이터
                          </summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap bg-white/40 dark:bg-black/30 p-2 rounded text-[10px]">
                            {JSON.stringify(f.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 일별 추세 — 14일 */}
      <section>
        <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
          최근 14일 추세
        </h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">날짜</th>
                <th className="text-right px-3 py-2 font-medium text-rose-600 dark:text-rose-400">HIGH</th>
                <th className="text-right px-3 py-2 font-medium text-amber-600 dark:text-amber-400">MED</th>
                <th className="text-right px-3 py-2 font-medium text-sky-600 dark:text-sky-400">LOW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {days.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-neutral-500 text-xs">
                    데이터 없음
                  </td>
                </tr>
              )}
              {days.map((day) => {
                const e = byDay.get(day)!;
                return (
                  <tr key={day} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-3 py-2 tabular-nums">{day}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {e.HIGH > 0 ? <span className="text-rose-600 dark:text-rose-400">{e.HIGH}</span> : <span className="text-neutral-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.MED > 0 ? <span className="text-amber-600 dark:text-amber-400">{e.MED}</span> : <span className="text-neutral-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.LOW > 0 ? <span className="text-sky-600 dark:text-sky-400">{e.LOW}</span> : <span className="text-neutral-400">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 봇 heartbeat 카드 grid + sortable table */}
      {bots.length > 0 && (
        <section>
          <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
            🤖 봇 heartbeat
          </h2>
          <p className="text-xs text-neutral-500 mb-3">
            각 워커의 마지막 ping 시각. 예상 주기 × 2 초과 시 지연, × 4 초과 시 다운.
            아래 표 헤더 클릭해서 정렬.
          </p>

          <div className="mb-4">
            <BotHeartbeatTable rows={botRows} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bots.map((b) => {
              const meta = BOT_META[b.name] ?? {
                ko: b.name,
                intervalMs: 60 * 60 * 1000,
                role: "(미등록 봇)",
              };
              const ageMs = Date.now() - b.lastAt.getTime();
              const status = botStatus(ageMs, meta.intervalMs);
              const colorMap: Record<string, { bg: string; text: string; border: string }> = {
                emerald: {
                  bg: "bg-emerald-50 dark:bg-emerald-500/10",
                  text: "text-emerald-700 dark:text-emerald-400",
                  border: "border-emerald-200 dark:border-emerald-500/30",
                },
                amber: {
                  bg: "bg-amber-50 dark:bg-amber-500/10",
                  text: "text-amber-700 dark:text-amber-400",
                  border: "border-amber-200 dark:border-amber-500/30",
                },
                rose: {
                  bg: "bg-rose-50 dark:bg-rose-500/10",
                  text: "text-rose-700 dark:text-rose-400",
                  border: "border-rose-200 dark:border-rose-500/30",
                },
              };
              const c = colorMap[status.color];
              const md = (b.metadata ?? {}) as {
                host?: string;
                provider?: string;
                model?: string;
                leagues?: string[];
              };
              return (
                <div
                  key={b.name}
                  className={`rounded-lg border ${c.border} ${c.bg} p-3 space-y-1.5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold truncate">{meta.ko}</h3>
                    <span className={`text-[11px] font-bold ${c.text} shrink-0`}>
                      ● {status.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                    {meta.role}
                  </div>
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {fmtAge(ageMs)}
                    </span>
                    <span className="text-neutral-500">
                      주기 {fmtAge(meta.intervalMs)}
                    </span>
                  </div>
                  {(md.provider || md.model) && (
                    <div className="text-[10px] text-neutral-500 truncate">
                      {md.provider && <span>{md.provider}</span>}
                      {md.model && <span> · {md.model}</span>}
                    </div>
                  )}
                  <div className="text-[10px] text-neutral-400 font-mono truncate">
                    {b.name}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* stale 매치 자동 정리 이력 */}
      {staleCleanups.length > 0 && (
        <section>
          <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
            🧹 stale 매치 자동 정리 (cleanup-stale-scheduled)
          </h2>
          <p className="text-xs text-neutral-500 mb-3">
            시작 + 12h 지났는데 SCHEDULED 인 매치를 자동 POSTPONED 처리. 4시간 주기.
            처리 시 Haiku 가 원인 진단.
          </p>
          <div className="space-y-3">
            {staleCleanups.map((c) => {
              // sample 스키마는 경로별로 다름 (live-summary 는 startTime/source 없이 기록된 이력 존재)
              // → 전 필드 optional 렌더. 필수 가정 시 과거 row 하나로 페이지 전체 500.
              const md = (c.metadata ?? {}) as {
                marked?: number;
                byLeague?: Record<string, number>;
                diagnosis?: string | null;
                sample?: Array<{ league?: string; source?: string; teams?: string; startTime?: string }>;
              };
              const sevColor =
                c.severity === "HIGH"
                  ? "text-rose-600"
                  : c.severity === "MED"
                    ? "text-amber-600"
                    : c.severity === "LOW"
                      ? "text-neutral-600"
                      : "text-emerald-600";
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className={`font-bold ${sevColor}`}>[{c.severity}]</span>
                    <span className="font-medium flex-1 truncate">{c.message}</span>
                    <span className="text-xs text-neutral-500 tabular-nums shrink-0">
                      {fmtKstDateTime(c.runAt)} KST
                    </span>
                  </div>
                  {md.byLeague && Object.keys(md.byLeague).length > 0 && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-semibold">리그별:</span>{" "}
                      {Object.entries(md.byLeague)
                        .sort((a, b) => b[1] - a[1])
                        .map(([l, n]) => `${l} ${n}`)
                        .join(" · ")}
                    </div>
                  )}
                  {md.sample && md.sample.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700">
                        sample {md.sample.length}건 보기
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 pl-3 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {md.sample.map((s, i) => (
                          <li key={i}>
                            {[
                              s.startTime?.slice(5, 16),
                              s.source ? `${s.league} (${s.source})` : s.league,
                              s.teams,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {md.diagnosis && (
                    <div className="rounded bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200 dark:border-white/10 p-2 text-xs leading-relaxed">
                      <div className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        🤖 Haiku 진단
                      </div>
                      <pre className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400 font-sans">
                        {md.diagnosis}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 카테고리 분포 */}
      {topCategories.length > 0 && (
        <section>
          <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
            카테고리 분포 (30일)
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {topCategories.map(([cat, cnt]) => (
              <div
                key={cat}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm"
              >
                <span className="font-medium truncate">{cat}</span>
                <span className="tabular-nums font-semibold text-neutral-500">{cnt}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
