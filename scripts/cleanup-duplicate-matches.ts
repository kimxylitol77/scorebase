// 같은 실제 경기가 externalId 2개로 이중 저장된 Match 중복을 안전 병합/삭제하는 정리 잡.
//   npx tsx --env-file=.env.local scripts/cleanup-duplicate-matches.ts            # dry-run (기본, 보고만)
//   npx tsx --env-file=.env.local scripts/cleanup-duplicate-matches.ts --apply    # SAFE 그룹 실제 삭제
//   ... --league=CLUB_FRIENDLY   # 특정 리그만
//   ... --ids=1159634,2522421    # 해당 matchId 를 포함하는 그룹만 (특정 중복 겨냥)
//   ... --merge                  # MANUAL(양쪽 참조) 그룹 병합 계획 출력 (dry-run)
//   ... --merge --apply          # MANUAL 그룹 실제 병합 (기사/게시글/투표 이전·정리 후 loser 삭제)
//
// 배경. upsertMatch 의 dedup 가드(collect.ts)는 생성 시점에 (리그+팀페어+startTime±윈도우)로만
// 병합한다. TheSports 가 친선 등에서 임시 시각으로 먼저 올린 뒤 시각을 옮기면 신규 externalId 가
// 윈도우 밖에서 새 row 를 만들고, 이후 시각이 수렴해도 가드는 소급 병합을 못 한다(cross-source-dup-reschedule).
// 표시단 orphan-dedup 은 af카드 vs DB 만 보므로 ts-vs-ts DB 중복은 원리상 못 거른다.
// → 시각이 수렴한 뒤 주기적으로 DB 를 훑어 중복 row 를 정리한다.
//
// 안전 규칙.
//   - LIVE 가 하나라도 있는 그룹은 절대 건드리지 않는다.
//   - KEEP 은 참조(Article/Post/MatchVote) 가 많은 row, 동률이면 externalId 가 캐시 tsMatchId 와
//     일치하는(정본) row, 그 다음 최초 생성 row.
//   - 삭제 대상에 보호 참조(Article/Post/MatchVote)가 있으면 MANUAL 로 분류하고 건드리지 않는다
//     (FK 이전이 필요 — team-dedup 처럼 사람 판단).
//   - cascade 파생(캐시·배당·예측이력·라이브코멘터리)은 함께 삭제되어도 안전.
//   - 비-cascade 파생 MatchStats 는 삭제 전 명시적으로 제거(파생이라 안전).
import "@/lib/env";
import { prisma } from "@/lib/db";

const APPLY = process.argv.includes("--apply");
const MERGE = process.argv.includes("--merge"); // MANUAL(양쪽 참조) 그룹을 병합 처리
const leagueArg = process.argv.find((a) => a.startsWith("--league="))?.split("=")[1];
const idsArg = process.argv.find((a) => a.startsWith("--ids="))?.split("=")[1];
const idFilter = idsArg ? new Set(idsArg.split(",").map((s) => Number(s.trim())).filter(Boolean)) : null;

type Row = {
  id: number;
  league: string;
  externalId: string;
  status: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  createdAt: Date;
  tsMatchId: string | null;
  protectedRefs: number; // Article + Post + MatchVote
};

async function loadRow(id: number): Promise<Row | null> {
  const m = await prisma.match.findUnique({
    where: { id },
    include: { theSportsCache: { select: { tsMatchId: true } } },
  });
  if (!m) return null;
  const [art, post, vote] = await Promise.all([
    prisma.article.count({ where: { matchId: id } }),
    prisma.post.count({ where: { matchId: id } }),
    prisma.matchVote.count({ where: { matchId: id } }),
  ]);
  return {
    id: m.id,
    league: m.league,
    externalId: m.externalId,
    status: m.status,
    startTime: m.startTime,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    createdAt: m.createdAt,
    tsMatchId: m.theSportsCache?.tsMatchId ?? null,
    protectedRefs: art + post + vote,
  };
}

// 같은 실제 경기인지 — 팀페어가 같거나(정방향/역방향) 확인.
function sameFixture(a: Row, b: Row): boolean {
  const forward = a.homeTeamId === b.homeTeamId && a.awayTeamId === b.awayTeamId;
  const reverse = a.homeTeamId === b.awayTeamId && a.awayTeamId === b.homeTeamId;
  return forward || reverse;
}

// KEEP row 선정: 참조 많은 순 → FINISHED 우선 → 정본(externalId==ts) → 최초 생성.
// (유령 SCHEDULED 그룹이 SAFE 로 내려올 때 실제 결과를 가진 FINISHED 를 남기기 위함.)
function pickKeep(rows: Row[]): Row {
  const rank = (s: string) => (s === "FINISHED" ? 0 : 1);
  return [...rows].sort((a, b) => {
    if (b.protectedRefs !== a.protectedRefs) return b.protectedRefs - a.protectedRefs;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    const aCanon = a.externalId.replace(/^ts-/, "") === a.tsMatchId ? 1 : 0;
    const bCanon = b.externalId.replace(/^ts-/, "") === b.tsMatchId ? 1 : 0;
    if (bCanon !== aCanon) return bCanon - aCanon;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

// 병합 survivor 선정: 실제 결과를 보여주는 FINISHED 우선 → 참조 많은 순 → 정본 → 최초 생성.
// (POSTPONED row 를 남기면 종료된 경기가 사이트에서 '연기' 로 보이므로 FINISHED 를 최우선.)
function pickSurvivor(rows: Row[]): Row {
  const rank = (s: string) => (s === "FINISHED" ? 0 : 1);
  return [...rows].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (b.protectedRefs !== a.protectedRefs) return b.protectedRefs - a.protectedRefs;
    const aCanon = a.externalId.replace(/^ts-/, "") === a.tsMatchId ? 1 : 0;
    const bCanon = b.externalId.replace(/^ts-/, "") === b.tsMatchId ? 1 : 0;
    if (bCanon !== aCanon) return bCanon - aCanon;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

// MANUAL 그룹 병합. survivor 유지, loser 의 참조를 이전/정리 후 loser row 삭제.
//   Article: survivor 에 같은 type 기사 있으면 loser 중복기사 삭제, 없으면 이전.
//   Post: 전부 survivor 로 이전(matchId unique 없음).
//   MatchVote: survivor 와 (userId 또는 sessionId) 충돌하면 loser 표 삭제, 아니면 이전.
//   apply=false 면 계획만 반환.
async function mergeGroup(survivor: Row, losers: Row[], apply: boolean): Promise<string[]> {
  const plan: string[] = [];
  const survArts = await prisma.article.findMany({ where: { matchId: survivor.id }, select: { type: true } });
  const survTypes = new Set(survArts.map((a) => a.type));
  const survVotes = await prisma.matchVote.findMany({ where: { matchId: survivor.id }, select: { userId: true, sessionId: true } });
  const survUsers = new Set(survVotes.map((v) => v.userId).filter(Boolean) as string[]);
  const survSessions = new Set(survVotes.map((v) => v.sessionId).filter(Boolean) as string[]);

  for (const L of losers) {
    const arts = await prisma.article.findMany({ where: { matchId: L.id }, select: { id: true, type: true, slug: true } });
    const posts = await prisma.post.findMany({ where: { matchId: L.id }, select: { id: true } });
    const votes = await prisma.matchVote.findMany({ where: { matchId: L.id }, select: { id: true, userId: true, sessionId: true } });

    for (const a of arts) {
      if (survTypes.has(a.type)) {
        plan.push(`ART삭제 #${a.id}(${a.type},${a.slug}) — survivor 에 동일 type 존재`);
        if (apply) await prisma.article.delete({ where: { id: a.id } });
      } else {
        plan.push(`ART이전 #${a.id}(${a.type}) → #${survivor.id}`);
        if (apply) await prisma.article.update({ where: { id: a.id }, data: { matchId: survivor.id } });
        survTypes.add(a.type);
      }
    }
    for (const p of posts) {
      plan.push(`POST이전 #${p.id} → #${survivor.id}`);
      if (apply) await prisma.post.update({ where: { id: p.id }, data: { matchId: survivor.id } });
    }
    for (const v of votes) {
      const conflict = (v.userId && survUsers.has(v.userId)) || (v.sessionId && survSessions.has(v.sessionId));
      if (conflict) {
        plan.push(`VOTE삭제 #${v.id} — survivor 에 동일 유저/세션 표 존재`);
        if (apply) await prisma.matchVote.delete({ where: { id: v.id } });
      } else {
        plan.push(`VOTE이전 #${v.id} → #${survivor.id}`);
        if (apply) await prisma.matchVote.update({ where: { id: v.id }, data: { matchId: survivor.id } });
        if (v.userId) survUsers.add(v.userId);
        if (v.sessionId) survSessions.add(v.sessionId);
      }
    }
    plan.push(`ROW삭제 #${L.id}(${L.externalId},${L.status})`);
    if (apply) {
      await prisma.matchStats.deleteMany({ where: { matchId: L.id } });
      await prisma.match.delete({ where: { id: L.id } });
    }
  }
  return plan;
}

async function main() {
  console.log(`=== 중복 Match 정리 ${APPLY ? "[APPLY]" : "[DRY-RUN]"}${leagueArg ? ` league=${leagueArg}` : ""} ===\n`);

  // --- 후보 그룹 수집 (두 탐지기 → union-find 로 id 집합 병합) ---
  // 두 탐지기가 같은 그룹을 각각 잡으면(예: fixture 일치 + ts 이중링크) 이중 집계되므로,
  // id 하나라도 겹치는 그룹은 한 컴포넌트로 합친다.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: number, b: number) => { parent.set(find(a), find(b)); };
  const addGroup = (ids: number[]) => {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    for (const id of ids) find(id);
  };

  // 탐지기 1: 동일 (league, homeTeamId, awayTeamId, startTime) 다중 row
  const byFixture: Array<{ ids: number[] }> = await prisma.$queryRawUnsafe(`
    SELECT array_agg(id) AS ids
    FROM "Match"
    ${leagueArg ? `WHERE league = '${leagueArg}'` : ""}
    GROUP BY league, "homeTeamId", "awayTeamId", "startTime"
    HAVING COUNT(*) > 1
  `);
  for (const g of byFixture) addGroup(g.ids);

  // 탐지기 2: 같은 tsMatchId 를 여러 Match 에 링크한 캐시 (ts-vs-ts 이중저장 직접 신호)
  const byTs: Array<{ tsmatchid: string; ids: number[] }> = await prisma.$queryRawUnsafe(`
    SELECT c."tsMatchId" AS tsmatchid, array_agg(c."matchId") AS ids
    FROM "TheSportsMatchCache" c
    JOIN "Match" m ON m.id = c."matchId"
    ${leagueArg ? `WHERE m.league = '${leagueArg}'` : ""}
    GROUP BY c."tsMatchId"
    HAVING COUNT(*) > 1
  `);
  for (const g of byTs) addGroup(g.ids);

  const groupsById = new Map<number, Set<number>>(); // root → matchId set
  for (const id of parent.keys()) {
    const r = find(id);
    if (!groupsById.has(r)) groupsById.set(r, new Set());
    groupsById.get(r)!.add(id);
  }

  const buckets = { SAFE: [] as string[], MANUAL: [] as string[], LIVE: [] as string[], PENDING: [] as string[], ANOMALY: [] as string[] };
  let deleted = 0;
  let mergedGroups = 0;

  for (const [, idSet] of groupsById) {
    const ids = [...idSet];
    if (ids.length < 2) continue;
    if (idFilter && !ids.some((id) => idFilter.has(id))) continue; // 겨냥한 매치를 포함하는 그룹만
    const rows = (await Promise.all(ids.map(loadRow))).filter(Boolean) as Row[];
    if (rows.length < 2) continue;

    // 팀페어가 갈리면 진짜 중복이 아니라 mis-link — 손대지 않고 보고.
    const base = rows[0];
    if (!rows.every((r) => sameFixture(base, r))) {
      buckets.ANOMALY.push(
        `[ANOMALY] ${base.league} 팀페어 불일치(같은 tsMatchId 오링크?) ${rows.map((r) => `#${r.id}(${r.externalId} ${r.homeTeamId}v${r.awayTeamId})`).join(" | ")}`,
      );
      continue;
    }

    // LIVE 있으면 절대 건드리지 않음.
    if (rows.some((r) => r.status === "LIVE")) {
      buckets.LIVE.push(`[LIVE-SKIP] ${base.league} ${base.startTime.toISOString()} ${rows.map((r) => `#${r.id}(${r.status})`).join(" | ")}`);
      continue;
    }
    // SCHEDULED(아직 안 끝난 매치) 는 startTime 이 또 이동할 수 있어 정리 보류 — 종료 후 처리.
    // 예외: 쌍둥이가 이미 FINISHED 이고 SCHEDULED 쪽 시작시각이 6h+ 지났으면 경기는 실제로 끝난 것 —
    // startTime 이 더 움직일 일 없는 유령 row 이므로 정리 대상에 포함한다(stale-scheduled 알림 반복 차단).
    const scheduledRows = rows.filter((r) => r.status === "SCHEDULED");
    if (scheduledRows.length > 0) {
      const ghostCutoff = Date.now() - 6 * 3600 * 1000;
      const twinFinished = rows.some((r) => r.status === "FINISHED");
      const allGhost = scheduledRows.every((r) => r.startTime.getTime() < ghostCutoff);
      if (!(twinFinished && allGhost)) {
        buckets.PENDING.push(`[PENDING] ${base.league} ${base.startTime.toISOString()} ${rows.map((r) => `#${r.id}(${r.externalId},${r.status})`).join(" | ")} — 종료 후 재판정`);
        continue;
      }
    }

    const keep = pickKeep(rows);
    const dels = rows.filter((r) => r.id !== keep.id);
    const blocked = dels.filter((r) => r.protectedRefs > 0);
    const desc = `${base.league} ${base.startTime.toISOString()} KEEP #${keep.id}(${keep.externalId},refs=${keep.protectedRefs}) DEL ${dels.map((r) => `#${r.id}(${r.externalId},refs=${r.protectedRefs},${r.status})`).join(",")}`;

    if (blocked.length > 0) {
      if (MERGE) {
        // survivor 는 FINISHED 우선으로 다시 뽑는다(refs 최다가 POSTPONED 일 수 있음).
        const survivor = pickSurvivor(rows);
        const losers = rows.filter((r) => r.id !== survivor.id);
        const plan = await mergeGroup(survivor, losers, APPLY);
        buckets.MANUAL.push(
          `[MERGE${APPLY ? "-APPLY" : "-PLAN"}] ${base.league} ${base.startTime.toISOString()} SURV #${survivor.id}(${survivor.externalId},${survivor.status})\n      ` +
            plan.join("\n      "),
        );
        if (APPLY) mergedGroups++;
      } else {
        buckets.MANUAL.push(`[MANUAL] ${desc} — 삭제대상에 보호참조 존재, FK 이전 필요 (--merge 로 병합)`);
      }
      continue;
    }

    buckets.SAFE.push(`[SAFE] ${desc}`);
    if (APPLY) {
      for (const d of dels) {
        try {
          await prisma.$transaction([
            prisma.matchStats.deleteMany({ where: { matchId: d.id } }), // 비-cascade 파생 선제거
            prisma.match.delete({ where: { id: d.id } }),
          ]);
          deleted++;
          console.log(`  삭제 #${d.id}`);
        } catch (e) {
          console.log(`  [실패] #${d.id}: ${(e as Error).message}`);
        }
      }
      // 검증: 같은 fixture 남은 row 1건인지
      const remain = await prisma.match.count({
        where: { league: keep.league, homeTeamId: keep.homeTeamId, awayTeamId: keep.awayTeamId, startTime: keep.startTime },
      });
      console.log(`  검증: fixture 남은 row ${remain}건`);
    }
  }

  const out = (label: string, arr: string[]) => {
    console.log(`\n### ${label}: ${arr.length}그룹`);
    for (const l of arr) console.log("  " + l);
  };
  out("SAFE (자동 삭제 가능)", buckets.SAFE);
  out(MERGE ? "MANUAL 병합" : "MANUAL (보호참조 — --merge 로 병합)", buckets.MANUAL);
  out("PENDING (미종료 — 종료 후 재판정)", buckets.PENDING);
  out("LIVE-SKIP (라이브 — 미처리)", buckets.LIVE);
  out("ANOMALY (팀페어 불일치 오링크)", buckets.ANOMALY);
  console.log(
    `\n요약. SAFE=${buckets.SAFE.length} MANUAL=${buckets.MANUAL.length} PENDING=${buckets.PENDING.length} LIVE=${buckets.LIVE.length} ANOMALY=${buckets.ANOMALY.length}` +
      (APPLY ? ` / SAFE삭제 ${deleted}건${MERGE ? ` / 병합 ${mergedGroups}그룹` : ""}` : " / dry-run (삭제 안 함, --apply 로 실행)"),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
