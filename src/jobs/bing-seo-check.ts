// 주간 빙 SEO 점검 — 빙 기회 검색어 신규/순위 변화를 운영자 텔레그램으로. (Vercel cron 월 아침)
// 빙 전체 검색어를 매주 스냅샷 저장 → 직전 스냅샷과 비교해 "순위 개선/하락·신규 기회"를 보고.
// 수정은 자동화하지 않는다(코드 판단 필요) — 알림 보고 사람이 지시하면 supervisor 흐름으로 처리.
import {
  fetchAllBingQueries,
  BING_OPP_MIN_IMPRESSIONS,
  BING_OPP_MIN_POSITION,
} from "@/lib/bing-webmaster";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";

// 변화 추적 임계 — 노출이 어느 정도 있는 검색어만(저노출은 노이즈).
const TRACK_MIN_IMPRESSIONS = 20;
// 순위 변화로 인정할 최소 폭(빙 position 은 1단위라 0.5 이상이면 유의).
const MIN_POS_DELTA = 0.5;

interface SnapRow {
  query: string;
  impressions: number;
  position: number;
  clicks: number;
}

function kstDate(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function runBingSeoCheck(
  opts: { dryRun?: boolean } = {},
): Promise<{ ok: boolean; skipped?: string; opportunities?: number; improved?: number; dropped?: number; fresh?: number; baseline?: boolean }> {
  const { dryRun = false } = opts;
  if (!process.env.BING_WEBMASTER_API_KEY) return { ok: false, skipped: "BING_WEBMASTER_API_KEY 미설정" };

  const all = await fetchAllBingQueries(); // 노출순
  const opportunities = all.filter(
    (r) => r.impressions >= BING_OPP_MIN_IMPRESSIONS && r.position >= BING_OPP_MIN_POSITION,
  );

  // 직전 스냅샷(가장 최근, 오늘 제외) 과 비교
  const today = kstDate();
  const prev = await prisma.bingSeoSnapshot.findFirst({
    where: { date: { not: today } },
    orderBy: { date: "desc" },
  });
  const prevMap = new Map<string, SnapRow>(
    prev ? (prev.data as unknown as SnapRow[]).map((r) => [r.query, r]) : [],
  );

  const improved: Array<{ query: string; from: number; to: number; impressions: number }> = [];
  const dropped: Array<{ query: string; from: number; to: number; impressions: number }> = [];
  for (const r of all) {
    if (r.impressions < TRACK_MIN_IMPRESSIONS) continue;
    const p = prevMap.get(r.query);
    if (!p) continue;
    const delta = p.position - r.position; // +면 순위 상승(숫자 감소)
    if (delta >= MIN_POS_DELTA) improved.push({ query: r.query, from: p.position, to: r.position, impressions: r.impressions });
    else if (delta <= -MIN_POS_DELTA) dropped.push({ query: r.query, from: p.position, to: r.position, impressions: r.impressions });
  }
  improved.sort((a, b) => b.from - b.to - (a.from - a.to));
  dropped.sort((a, b) => a.from - a.to - (b.from - b.to));

  // 신규 기회 — 이번 기회 검색어인데 직전 스냅샷에 없던 것(노출순 상위)
  const fresh = prev ? opportunities.filter((r) => !prevMap.has(r.query)).slice(0, 8) : [];

  // === 텔레그램 메시지 ===
  const lines: string[] = [`📊 <b>빙 SEO 주간 점검</b> (${today})`];
  if (!prev) {
    lines.push("\n기준 스냅샷을 저장했습니다. 다음 주부터 순위 변화를 추적합니다.");
  }
  lines.push(`\n🎯 <b>기회 검색어 TOP</b> (노출 많은데 ${BING_OPP_MIN_POSITION}위 밖)`);
  if (opportunities.length === 0) {
    lines.push("· 없음");
  } else {
    for (const r of opportunities.slice(0, 8)) {
      lines.push(`· ${esc(r.query)} — 노출 ${r.impressions} · ${r.position.toFixed(1)}위 · 클릭 ${r.clicks}`);
    }
  }
  if (improved.length) {
    lines.push("\n📈 <b>순위 개선</b> (지난주 대비)");
    for (const r of improved.slice(0, 8)) lines.push(`· ${esc(r.query)}: ${r.from.toFixed(1)}위 → ${r.to.toFixed(1)}위 (노출 ${r.impressions})`);
  }
  if (dropped.length) {
    lines.push("\n📉 <b>순위 하락</b>");
    for (const r of dropped.slice(0, 5)) lines.push(`· ${esc(r.query)}: ${r.from.toFixed(1)}위 → ${r.to.toFixed(1)}위 (노출 ${r.impressions})`);
  }
  if (fresh.length) {
    lines.push("\n🆕 <b>신규 기회</b> (이번 주 새로 진입)");
    for (const r of fresh) lines.push(`· ${esc(r.query)} — 노출 ${r.impressions} · ${r.position.toFixed(1)}위`);
  }
  lines.push("\n손볼 게 있으면 알려주세요 — 메타·콘텐츠 보강 후 감독관 채점→배포합니다.");

  if (!dryRun) await sendTelegram(lines.join("\n"), { parseMode: "HTML" });

  // 스냅샷 저장(가볍게 — query/impressions/position/clicks)
  const snap: SnapRow[] = all.map((r) => ({
    query: r.query,
    impressions: r.impressions,
    position: Number(r.position.toFixed(1)),
    clicks: r.clicks,
  }));
  if (!dryRun) {
    await prisma.bingSeoSnapshot.upsert({
      where: { date: today },
      create: { date: today, data: snap as unknown as object },
      update: { data: snap as unknown as object },
    });
  }

  return {
    ok: true,
    baseline: !prev,
    opportunities: opportunities.length,
    improved: improved.length,
    dropped: dropped.length,
    fresh: fresh.length,
  };
}
