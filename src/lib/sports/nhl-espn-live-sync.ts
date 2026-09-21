// NHL ESPN id 매치 라이브 동기화 — ESPN 스코어보드로 status·score 를 맞춘다.
// 왜: 프리시즌 등 ESPN id(숫자 externalId)로 만들어진 NHL 행은 TheSports 캐시가 없어 1분 폴러가 못 보고
//     수집 cron(하루 몇 번) 때만 갱신돼 LIVE 고착·틀린 점수 확정(BOS 0-1 → 실제 3-2, 2026-09-21)이 났다.
// 5분 refresh-live-baseball cron 이 호출한다. 단조 가드: FINISHED 를 되돌리지 않는다.
import { prisma } from "@/lib/db";

interface EspnEvent {
  id: string;
  competitions: Array<{
    status: { type: { name: string; detail?: string } };
    competitors: Array<{ homeAway: "home" | "away"; score?: string; team: { displayName: string } }>;
  }>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

export function espnStatusToOurs(name: string): "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | null {
  if (name === "STATUS_FINAL" || name === "STATUS_FULL_TIME") return "FINISHED";
  if (name === "STATUS_IN_PROGRESS" || name === "STATUS_END_PERIOD" || name === "STATUS_HALFTIME" || name === "STATUS_DELAYED") return "LIVE";
  if (name === "STATUS_SCHEDULED") return "SCHEDULED";
  if (name === "STATUS_POSTPONED" || name === "STATUS_CANCELED") return "POSTPONED";
  return null;
}

export async function syncNhlEspnLive(): Promise<{ candidates: number; updated: number; skipped: number }> {
  const now = new Date();
  // 창: 시작 1시간 전 ~ 시작 8시간 후. 이미 FINISHED 는 건드리지 않는다.
  const rows = await prisma.match.findMany({
    where: {
      league: "NHL",
      status: { in: ["SCHEDULED", "LIVE"] },
      startTime: { gte: new Date(now.getTime() - 8 * 3600_000), lte: new Date(now.getTime() + 3600_000) },
    },
    select: { id: true, externalId: true, status: true, homeScore: true, awayScore: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  const cands = rows.filter((m) => /^\d+$/.test(m.externalId ?? ""));
  if (cands.length === 0) return { candidates: 0, updated: 0, skipped: 0 };
  // ESPN 스코어보드는 미국 날짜 버킷 — 오늘·어제(KST 기준 이틀)를 합친다
  const dates = [...new Set([kstDate(new Date(now.getTime() - 86_400_000)), kstDate(now)])];
  const events = new Map<string, EspnEvent>();
  for (const d of dates) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${d}`, { cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as { events?: EspnEvent[] };
      for (const e of j.events ?? []) events.set(e.id, e);
    } catch { /* 다음 주기 */ }
  }
  let updated = 0, skipped = 0;
  for (const m of cands) {
    const e = events.get(m.externalId!);
    const c = e?.competitions?.[0];
    if (!c) { skipped++; continue; }
    const status = espnStatusToOurs(c.status.type.name);
    const home = c.competitors.find((x) => x.homeAway === "home");
    const away = c.competitors.find((x) => x.homeAway === "away");
    // 홈/원정 이름이 DB 와 어긋나면 점수를 뒤집어 쓸 수 있어 건너뛴다
    if (!status || !home || !away || norm(home.team.displayName) !== norm(m.homeTeam.name) || norm(away.team.displayName) !== norm(m.awayTeam.name)) { skipped++; continue; }
    const hs = status === "SCHEDULED" ? null : Number(home.score ?? 0);
    const as = status === "SCHEDULED" ? null : Number(away.score ?? 0);
    if (status === m.status && hs === m.homeScore && as === m.awayScore) continue;
    // 단조 가드 — LIVE 를 SCHEDULED 로 되돌리지 않는다(ESPN 일시 글리치 방어)
    if (status === "SCHEDULED" && m.status === "LIVE") { skipped++; continue; }
    await prisma.match.update({ where: { id: m.id }, data: { status, homeScore: hs, awayScore: as } });
    updated++;
  }
  return { candidates: cands.length, updated, skipped };
}
