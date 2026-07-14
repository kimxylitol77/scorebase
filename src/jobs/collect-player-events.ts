// 선수 근황 이벤트 수집 — 이적·몸값·부상을 규칙 기반으로 추출해 PlayerEvent 테이블에 멱등 적재.
// LLM 창작 없이 데이터 조립형 문장. 소스: FootballTransfer / PlayerMarketValue.history /
// TheSportsMatchCache.lineup.injury (전부 ts player id 키). cron: /api/cron/player-events.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { koTeam } from "@/app/transfers/transfer-display";
import { tsInjuryReasonKo } from "@/lib/sports/thesports/injuries";

// ts transfer_type → 한국어. 실이동만(1 임대·2 임대복귀·3 완전이적·6 방출·7 자유계약). 4·8 무시.
const MOVE_TYPE_KO: Record<number, string> = { 1: "임대", 2: "임대 복귀", 3: "완전이적", 6: "방출", 7: "자유계약" };
// 몸값 변동 이벤트 최소 변화율(%) — 잔여 소음(±1~2%) 제외, 커리어 섹션이 전체 이력은 이미 표시.
const VALUE_MIN_CHG = 5;
const CRON_WINDOW_DAYS = 14; // 주간 cron 스캔 창 (backfill 은 전체/장기)
const INJURY_BACKFILL_DAYS = 120; // 부상은 lineup 잔존분만 → backfill 도 장기창 한정

interface HistPt { market_time?: number; market_value?: number }
interface TSInj { id?: string; name?: string; reason?: string; start_time?: number; end_time?: number; missed_matches?: number }
interface PEvent { id: string; playerId: string; type: string; occurredAt: Date; title: string; detail?: unknown; matchId?: number }

export async function runCollectPlayerEvents({ backfill = false }: { backfill?: boolean } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const sinceSec = backfill ? 0 : nowSec - CRON_WINDOW_DAYS * 86400;
  const events: PEvent[] = [];

  // 타깃 = 몸값(PlayerMarketValue) 보유 선수 전체. history 는 몸값 이벤트에 재사용.
  const mvs = await prisma.playerMarketValue.findMany({ select: { id: true, history: true } });
  const mvSet = new Set(mvs.map((m) => m.id));

  // 1) 이적/임대 이벤트 — FootballTransfer
  const transfers = await prisma.footballTransfer.findMany({
    where: { transferTime: { gte: sinceSec }, playerId: { in: [...mvSet] } },
    select: { playerId: true, fromTeamId: true, fromTeamName: true, toTeamId: true, toTeamName: true, transferType: true, transferTime: true, transferFee: true },
  });
  // 팀명 한글화 — ts team_id → 우리 Team 한글명 우선(피드 영문 접미사 "Saf - RJ" 등 회피),
  //  매핑 없으면 koTeam(피드 영문) fallback. 커리어 섹션 링크와 동일한 team_id 기반 해소.
  const tTeamIds = [...new Set(transfers.flatMap((t) => [t.fromTeamId, t.toTeamId]).filter((x): x is string => !!x))];
  const tsTeamKo = new Map<string, string>();
  if (tTeamIds.length) {
    const tss = await prisma.teamSourceId.findMany({ where: { source: "thesports", externalId: { in: tTeamIds } }, select: { externalId: true, teamId: true } });
    const teams = await prisma.team.findMany({ where: { id: { in: tss.map((s) => s.teamId) } }, select: { id: true, name: true } });
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    for (const s of tss) { const nm = nameById.get(s.teamId); if (nm && !tsTeamKo.has(s.externalId)) tsTeamKo.set(s.externalId, koTeam(nm)); }
  }
  const teamKo = (id: string | null, name: string | null) => (id && tsTeamKo.get(id)) || koTeam(name);
  for (const t of transfers) {
    if (!t.transferTime || t.transferType == null || !(t.transferType in MOVE_TYPE_KO)) continue;
    const typeKo = MOVE_TYPE_KO[t.transferType];
    const feeM = t.transferFee && t.transferFee > 0 ? Math.round(t.transferFee / 1e6) : 0;
    const feeStr = feeM > 0 ? ` (€${feeM}M)` : "";
    events.push({
      id: `transfer:${t.playerId}:${t.transferTime}`,
      playerId: t.playerId,
      type: t.transferType === 1 ? "LOAN" : "TRANSFER",
      occurredAt: new Date(t.transferTime * 1000),
      title: `${teamKo(t.fromTeamId, t.fromTeamName)} → ${teamKo(t.toTeamId, t.toTeamName)} ${typeKo}${feeStr}`,
      detail: { fromTeamId: t.fromTeamId, toTeamId: t.toTeamId, transferType: t.transferType, feeM },
    });
  }

  // 2) 몸값 변동 이벤트 — PlayerMarketValue.history (직전 대비 ±VALUE_MIN_CHG% 이상만)
  for (const m of mvs) {
    const hist = (Array.isArray(m.history) ? (m.history as HistPt[]) : [])
      .filter((h) => (h?.market_value || 0) > 0 && h?.market_time)
      .sort((a, b) => (a.market_time || 0) - (b.market_time || 0));
    for (let i = 1; i < hist.length; i++) {
      const t = hist[i].market_time!;
      if (t < sinceSec) continue;
      const v = Math.round((hist[i].market_value || 0) / 1e6);
      const pv = Math.round((hist[i - 1].market_value || 0) / 1e6);
      if (pv <= 0 || v === pv) continue;
      const chg = Math.round(((v - pv) / pv) * 100);
      if (Math.abs(chg) < VALUE_MIN_CHG) continue;
      events.push({
        id: `value:${m.id}:${t}`,
        playerId: m.id,
        type: chg > 0 ? "VALUE_UP" : "VALUE_DOWN",
        occurredAt: new Date(t * 1000),
        title: `몸값 €${pv}M → €${v}M (${chg > 0 ? "▲" : "▼"}${Math.abs(chg)}%)`,
        detail: { from: pv, to: v, chg },
      });
    }
  }

  // 3) 부상/복귀 이벤트 — TheSportsMatchCache.lineup.injury (ts player id 키, 퍼지매칭 없음)
  //    injury entry = 완결 레코드(start_time·end_time·reason). 같은 부상이 여러 매치 lineup 에
  //    반복 등장하지만 start_time 동일 → dedupeKey 동일 → 멱등.
  const injSinceSec = backfill ? nowSec - INJURY_BACKFILL_DAYS * 86400 : sinceSec;
  const recentMatches = await prisma.match.findMany({
    where: { startTime: { gte: new Date(injSinceSec * 1000) } },
    select: { id: true },
  });
  const mIds = recentMatches.map((m) => m.id);
  for (let i = 0; i < mIds.length; i += 500) {
    const caches = await prisma.theSportsMatchCache.findMany({
      where: { matchId: { in: mIds.slice(i, i + 500) } },
      select: { matchId: true, lineup: true },
    });
    for (const c of caches) {
      const lu = c.lineup as Record<string, unknown> | null;
      if (!lu) continue;
      const inj = (lu.injury ?? (lu.lineup as Record<string, unknown>)?.injury) as
        | { home?: TSInj[]; away?: TSInj[] } | undefined;
      if (!inj) continue;
      for (const side of ["home", "away"] as const) {
        for (const x of inj[side] ?? []) {
          if (!x?.id || !mvSet.has(x.id) || !x.start_time) continue;
          const reasonKo = tsInjuryReasonKo(x.reason ?? "") || "부상";
          events.push({
            id: `injury:${x.id}:${x.start_time}`,
            playerId: x.id,
            type: "INJURY",
            occurredAt: new Date(x.start_time * 1000),
            title: `부상 — ${reasonKo}`,
            detail: { reason: reasonKo, missedMatches: x.missed_matches ?? null },
            matchId: c.matchId,
          });
          if (x.end_time && x.end_time > 0) {
            events.push({
              id: `return:${x.id}:${x.start_time}`,
              playerId: x.id,
              type: "RETURN",
              occurredAt: new Date(x.end_time * 1000),
              title: `부상 복귀 (${reasonKo})`,
              detail: { reason: reasonKo },
            });
          }
        }
      }
    }
  }

  // 메모리 dedup (같은 부상이 여러 매치에 등장) → id 유일화
  const byId = new Map<string, PEvent>();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  const unique = [...byId.values()];

  // 멱등 적재 — id = dedupeKey, createMany skipDuplicates. 이벤트는 불변 사실이라 update 불요.
  let created = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const r = await prisma.playerEvent.createMany({
      data: unique.slice(i, i + 1000).map((e) => ({
        id: e.id, playerId: e.playerId, type: e.type, occurredAt: e.occurredAt,
        title: e.title, detail: (e.detail ?? undefined) as never, matchId: e.matchId ?? null,
      })),
      skipDuplicates: true,
    });
    created += r.count;
  }
  return { scanned: unique.length, created };
}
