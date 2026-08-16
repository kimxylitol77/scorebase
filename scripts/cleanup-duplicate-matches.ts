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
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

const APPLY = process.argv.includes("--apply");
const MERGE = process.argv.includes("--merge"); // MANUAL(양쪽 참조) 그룹을 병합 처리
const leagueArg = process.argv.find((a) => a.startsWith("--league="))?.split("=")[1];
const idsArg = process.argv.find((a) => a.startsWith("--ids="))?.split("=")[1];
const idFilter = idsArg ? new Set(idsArg.split(",").map((s) => Number(s.trim())).filter(Boolean)) : null;
// 탐지기 3 의 스캔 범위(오늘 기준 ±N일). 재고 정리는 넓게, 정기 실행은 좁게 쓴다.
const daysArg = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1]) || 60;

type Row = {
  id: number;
  league: string;
  externalId: string;
  status: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  createdAt: Date;
  updatedAt: Date;
  hasScore: boolean;
  hasMarket: boolean; // 시장 배당(marketHome) 보유 — 배당 파이프라인이 물고 있는 row
  tsMatchId: string | null;
  protectedRefs: number; // Article + Post + MatchVote + MemberBotPick + UserMatchFollow
};

async function loadRow(id: number): Promise<Row | null> {
  const m = await prisma.match.findUnique({
    where: { id },
    include: { theSportsCache: { select: { tsMatchId: true } } },
  });
  if (!m) return null;
  const [art, post, vote, pick, follow] = await Promise.all([
    prisma.article.count({ where: { matchId: id } }),
    prisma.post.count({ where: { matchId: id } }),
    prisma.matchVote.count({ where: { matchId: id } }),
    // FK 없는 manual join — Match 삭제 시 고아로 남으므로 보호 참조로 취급 (--merge 가 이전).
    prisma.memberBotPick.count({ where: { matchId: id } }),
    prisma.userMatchFollow.count({ where: { matchId: id } }),
  ]);
  // ESPN 은 예정 경기에도 0-0 을 실어 보낸다(pregame-score-zero-guard) — 가짜 0-0 은
  // "점수 보유" 로 치지 않는다 (SCORE-GUARD 와 keeper 판정이 유령을 결과 보유로 오인 방지).
  const fakeZero = m.status === "SCHEDULED" && m.homeScore === 0 && m.awayScore === 0;
  return {
    id: m.id,
    league: m.league,
    externalId: m.externalId,
    status: m.status,
    startTime: m.startTime,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    hasScore: !fakeZero && m.homeScore != null && m.awayScore != null,
    hasMarket: m.marketHome != null,
    tsMatchId: m.theSportsCache?.tsMatchId ?? null,
    protectedRefs: art + post + vote + pick + follow,
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
  // ESPN 은 예정 경기에 0-0 을 실어 보낸다(pregame-score-zero-guard). 그 row 를 남기면
  // 화면에 가짜 스코어가 그대로 남으므로, 예정인데 점수를 든 row 는 뒤로 민다.
  const fake = (r: Row) => (r.status === "SCHEDULED" && r.hasScore ? 1 : 0);
  // ESPN scoreboard 유령(^4\d{8}) 은 af API 로 일정 재검증이 불가능한 id 라 뒤로 민다
  // — af fixture id row 는 cleanup-stale-scheduled 의 af verify 가 시각·상태를 계속 교정한다.
  const espnStyle = (r: Row) => (/^4\d{8}$/.test(r.externalId) ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (fake(a) !== fake(b)) return fake(a) - fake(b);
    if (b.protectedRefs !== a.protectedRefs) return b.protectedRefs - a.protectedRefs;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (a.hasMarket !== b.hasMarket) return a.hasMarket ? -1 : 1;
    const aCanon = a.externalId.replace(/^ts-/, "") === a.tsMatchId ? 1 : 0;
    const bCanon = b.externalId.replace(/^ts-/, "") === b.tsMatchId ? 1 : 0;
    if (bCanon !== aCanon) return bCanon - aCanon;
    if (espnStyle(a) !== espnStyle(b)) return espnStyle(a) - espnStyle(b);
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

// 크로스소스 쌍(탐지기 3)의 KEEP.
//   ① 점수를 가진 row 최우선 — 끝난 경기의 결과를 잃지 않는 게 제일 중요하다.
//   ② 그다음 FINISHED.
//   ③ 마지막이 updatedAt 최신 — 미래 경기라 양쪽 다 점수가 없을 때, 갱신이 살아있는 쪽을
//      남긴다. 얼어붙은 placeholder 를 남기면 킥오프 시각이 틀린 카드가 대신 살아남는다.
// 어느 소스가 정본인지는 리그마다 다르다(대부분 ts, TS_COVERED_EXCEPTIONS 는 af) — 소스
// 이름 대신 "결과를 들고 있는가 / 갱신되고 있는가" 로 판정해야 양쪽을 다 맞춘다.
// 삭제 대상에 참조가 걸린 경우는 아래 blocked 검사가 MANUAL 로 돌리므로 여기선 안 따진다.
function pickKeepXs(rows: Row[]): Row {
  const rank = (s: string) => (s === "FINISHED" ? 0 : 1);
  return [...rows].sort((a, b) => {
    if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

// 병합 survivor 선정: 실제 결과를 보여주는 FINISHED 우선 → 참조 많은 순 → 정본 → 최초 생성.
// (POSTPONED row 를 남기면 종료된 경기가 사이트에서 '연기' 로 보이므로 FINISHED 를 최우선.)
function pickSurvivor(rows: Row[]): Row {
  const rank = (s: string) => (s === "FINISHED" ? 0 : 1);
  // pickKeep 과 같은 이유의 가드 2종 — 가짜 0-0 예정 row·ESPN 유령 id 는 뒤로.
  const fake = (r: Row) => (r.status === "SCHEDULED" && r.hasScore ? 1 : 0);
  const espnStyle = (r: Row) => (/^4\d{8}$/.test(r.externalId) ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (fake(a) !== fake(b)) return fake(a) - fake(b);
    if (a.hasMarket !== b.hasMarket) return a.hasMarket ? -1 : 1;
    if (b.protectedRefs !== a.protectedRefs) return b.protectedRefs - a.protectedRefs;
    const aCanon = a.externalId.replace(/^ts-/, "") === a.tsMatchId ? 1 : 0;
    const bCanon = b.externalId.replace(/^ts-/, "") === b.tsMatchId ? 1 : 0;
    if (bCanon !== aCanon) return bCanon - aCanon;
    if (espnStyle(a) !== espnStyle(b)) return espnStyle(a) - espnStyle(b);
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

// MANUAL 그룹 병합. survivor 유지, loser 의 참조를 이전/정리 후 loser row 삭제.
//   Article: survivor 에 같은 type 기사 있으면 loser 중복기사 삭제, 없으면 이전.
//   Post: 전부 survivor 로 이전(matchId unique 없음).
//   MatchVote: survivor 와 (userId 또는 sessionId) 충돌하면 loser 표 삭제, 아니면 이전.
//   MemberBotPick: (botId, market) 충돌하면 loser 픽 삭제(같은 봇의 중복 픽), 아니면 이전.
//   UserMatchFollow: (userId) 충돌하면 loser 즐겨찾기 삭제, 아니면 이전.
//   TheSportsMatchCache: survivor 가 없으면 loser 것을 이전(라이브 push 소유권 보존),
//     있으면 loser 것 삭제(cascade 로도 지워지지만 명시).
//   apply=false 면 계획만 반환.
async function mergeGroup(survivor: Row, losers: Row[], apply: boolean): Promise<string[]> {
  const plan: string[] = [];
  const survArts = await prisma.article.findMany({ where: { matchId: survivor.id }, select: { type: true } });
  const survTypes = new Set(survArts.map((a) => a.type));
  const survVotes = await prisma.matchVote.findMany({ where: { matchId: survivor.id }, select: { userId: true, sessionId: true } });
  const survUsers = new Set(survVotes.map((v) => v.userId).filter(Boolean) as string[]);
  const survSessions = new Set(survVotes.map((v) => v.sessionId).filter(Boolean) as string[]);
  const survPicks = await prisma.memberBotPick.findMany({ where: { matchId: survivor.id }, select: { botId: true, market: true } });
  const survPickKeys = new Set(survPicks.map((p) => `${p.botId}|${p.market}`));
  const survFollows = await prisma.userMatchFollow.findMany({ where: { matchId: survivor.id }, select: { userId: true } });
  const survFollowUsers = new Set(survFollows.map((f) => f.userId));
  let survHasCache = (await prisma.theSportsMatchCache.count({ where: { matchId: survivor.id } })) > 0;

  for (const L of losers) {
    const arts = await prisma.article.findMany({ where: { matchId: L.id }, select: { id: true, type: true, slug: true } });
    const posts = await prisma.post.findMany({ where: { matchId: L.id }, select: { id: true } });
    const votes = await prisma.matchVote.findMany({ where: { matchId: L.id }, select: { id: true, userId: true, sessionId: true } });
    const picks = await prisma.memberBotPick.findMany({ where: { matchId: L.id }, select: { id: true, botId: true, market: true } });
    const follows = await prisma.userMatchFollow.findMany({ where: { matchId: L.id }, select: { id: true, userId: true } });

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
    for (const p of picks) {
      const key = `${p.botId}|${p.market}`;
      if (survPickKeys.has(key)) {
        plan.push(`PICK삭제 #${p.id}(${p.botId},${p.market}) — survivor 에 동일 봇 픽 존재`);
        if (apply) await prisma.memberBotPick.delete({ where: { id: p.id } });
      } else {
        plan.push(`PICK이전 #${p.id}(${p.botId},${p.market}) → #${survivor.id}`);
        if (apply) await prisma.memberBotPick.update({ where: { id: p.id }, data: { matchId: survivor.id } });
        survPickKeys.add(key);
      }
    }
    for (const f of follows) {
      if (survFollowUsers.has(f.userId)) {
        plan.push(`FOLLOW삭제 #${f.id} — survivor 에 동일 유저 즐겨찾기 존재`);
        if (apply) await prisma.userMatchFollow.delete({ where: { id: f.id } });
      } else {
        plan.push(`FOLLOW이전 #${f.id} → #${survivor.id}`);
        if (apply) await prisma.userMatchFollow.update({ where: { id: f.id }, data: { matchId: survivor.id } });
        survFollowUsers.add(f.userId);
      }
    }
    const loserCache = await prisma.theSportsMatchCache.findUnique({ where: { matchId: L.id }, select: { tsMatchId: true } });
    if (loserCache && !survHasCache) {
      plan.push(`TSCACHE이전 ts=${loserCache.tsMatchId} → #${survivor.id}`);
      if (apply) {
        await prisma.theSportsMatchCache.update({ where: { matchId: L.id }, data: { matchId: survivor.id } });
      }
      survHasCache = true; // dry-run 에서도 다음 loser 계획이 일관되게
    } else if (loserCache) {
      plan.push(`TSCACHE삭제 ts=${loserCache.tsMatchId} — survivor 에 캐시 존재 (cascade)`);
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

  // 탐지기 3: 크로스소스 중복 — 같은 리그·같은 팀페어인데 ts- row 와 숫자(af) row 의 킥오프가
  // 며칠씩 벌어진 쌍. 탐지기 1 은 startTime 완전일치만 보므로 원리상 못 잡는다.
  // 2026-08-04 SLOVENIA_SNL: 한쪽 소스가 라운드 전체를 같은 시각 placeholder 로 실어 26시간씩
  // 어긋난 중복이 생겼고, 시각 기준 탐지가 전부 놓쳤다.
  // 축구 한정 — 야구 더블헤더, 하키·농구 플레이오프는 같은 팀페어가 며칠 안에 다시 붙는 게
  // 정상이라 같은 기준을 쓰면 멀쩡한 경기를 중복으로 지운다. CLUB_FRIENDLY 도 스플릿 스쿼드
  // 당일 2연전이 있어 제외(같은 ts id 중복은 data-sanity 의 friendly_dup 담당).
  const XS_WINDOW_MS = 4 * 86400_000;
  const xsIds = new Set<number>();
  const nnIds = new Set<number>(); // 탐지기 4 (숫자↔숫자) 가 잡은 id
  {
    const nowMs = Date.now();
    const soccer = [...SOCCER_LEAGUES].filter(
      (l) => l !== "CLUB_FRIENDLY" && (!leagueArg || l === leagueArg),
    );
    const xsRows = await prisma.match.findMany({
      where: {
        league: { in: soccer },
        startTime: {
          gte: new Date(nowMs - daysArg * 86400_000),
          lte: new Date(nowMs + daysArg * 86400_000),
        },
      },
      select: { id: true, league: true, externalId: true, startTime: true, homeTeamId: true, awayTeamId: true },
    });
    const byPair = new Map<string, typeof xsRows>();
    for (const m of xsRows) {
      const k = `${m.league}:${[m.homeTeamId, m.awayTeamId].sort((a, b) => a - b).join("-")}`;
      if (!byPair.has(k)) byPair.set(k, []);
      byPair.get(k)!.push(m);
    }
    for (const g of byPair.values()) {
      const tsRows = g.filter((r) => r.externalId.startsWith("ts-"));
      const numRows = g.filter((r) => !r.externalId.startsWith("ts-"));
      if (tsRows.length && numRows.length) {
        const cands: { t: (typeof xsRows)[number]; n: (typeof xsRows)[number]; d: number }[] = [];
        for (const t of tsRows) {
          for (const n of numRows) {
            // 홈/원정이 뒤집힌 쌍은 제외 — 2차전(홈앤어웨이)이 정확히 그 모양이라 오탐이 된다
            // (실측: UCL 예선 Hearts↔Sturm Graz 가 정확히 7일 간격 역방향).
            // 시각이 거의 같은 중립구장 뒤바뀜은 collect 의 생성 시점 가드가 이미 막는다.
            if (t.homeTeamId !== n.homeTeamId) continue;
            const d = Math.abs(t.startTime.getTime() - n.startTime.getTime());
            if (d > XS_WINDOW_MS) continue;
            cands.push({ t, n, d });
          }
        }
        // 가장 가까운 시각끼리 1:1 로만 묶는다 — ts 2건·af 2건 그룹이 4쌍으로 번지지 않게.
        cands.sort((a, b) => a.d - b.d);
        const usedT = new Set<number>();
        const usedN = new Set<number>();
        for (const c of cands) {
          if (usedT.has(c.t.id) || usedN.has(c.n.id)) continue;
          usedT.add(c.t.id);
          usedN.add(c.n.id);
          addGroup([c.t.id, c.n.id]);
          xsIds.add(c.t.id);
          xsIds.add(c.n.id);
        }
      }

      // 탐지기 4: 숫자↔숫자(ESPN↔af) 크로스소스 중복 — 동방향·±4일 (2026-08-16 신설).
      // ESPN scoreboard 와 af 백필이 미래 라운드를 서로 다른 placeholder 시각으로 실어
      // ±150분 생성 가드를 벗어난 쌍둥이 (LALIGA 66·BUNDESLIGA 35·LIGUE_1 42쌍 실측).
      // 둘 다 숫자 id 라 탐지기 1(시각 완전일치)·3(ts↔숫자)·data-sanity(ts 제외) 전부의 사각.
      // 같은 리그 동방향 팀쌍이 4일 내 두 번 붙을 수 없으므로 오탐 없음(역방향 2차전 제외).
      // 단 국대 친선은 같은 팀쌍 동방향 2연전이 실재해 제외 (실측: 에티오피아 v 말라위
      // 6/6·6/9 별개 A매치 — af fixture id 도 둘).
      if (numRows.length >= 2 && g[0].league !== "INTL_FRIENDLY") {
        const nnCands: { a: (typeof xsRows)[number]; b: (typeof xsRows)[number]; d: number }[] = [];
        for (let i = 0; i < numRows.length; i++) {
          for (let j = i + 1; j < numRows.length; j++) {
            const a = numRows[i];
            const b = numRows[j];
            if (a.homeTeamId !== b.homeTeamId) continue; // 동방향만 (byPair 키가 양방향 팀쌍)
            const d = Math.abs(a.startTime.getTime() - b.startTime.getTime());
            if (d > XS_WINDOW_MS) continue;
            nnCands.push({ a, b, d });
          }
        }
        nnCands.sort((x, y) => x.d - y.d);
        const used = new Set<number>();
        for (const c of nnCands) {
          if (used.has(c.a.id) || used.has(c.b.id)) continue;
          used.add(c.a.id);
          used.add(c.b.id);
          addGroup([c.a.id, c.b.id]);
          nnIds.add(c.a.id);
          nnIds.add(c.b.id);
        }
      }
    }
  }

  const groupsById = new Map<number, Set<number>>(); // root → matchId set
  for (const id of parent.keys()) {
    const r = find(id);
    if (!groupsById.has(r)) groupsById.set(r, new Set());
    groupsById.get(r)!.add(id);
  }

  const buckets = { SAFE: [] as string[], MANUAL: [] as string[], LIVE: [] as string[], PENDING: [] as string[], REVIEW: [] as string[], ANOMALY: [] as string[] };
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
    // 탐지기 3 이 잡은 크로스소스 쌍 중 "삭제될 쪽이 이미 얼어붙은" 경우는 위 보류에서 뺀다.
    // 근거. 이 유형은 한쪽 소스의 수집이 끊겨 placeholder 시각 그대로 남은 row 라 startTime 이
    // 더 움직이지 않는다(실측: 해당 리그 af 신규 생성 30일간 0건). 그리고 킥오프 전부터 이미
    // 카드 두 장으로 보이므로 종료를 기다릴 이유도 없다.
    const isXs =
      rows.length === 2 &&
      rows.some((r) => xsIds.has(r.id)) &&
      rows.filter((r) => r.externalId.startsWith("ts-")).length === 1;
    const stalest = Math.min(...rows.map((r) => r.updatedAt.getTime()));
    const xsFrozen = isXs && Date.now() - stalest >= 3 * 86400_000;

    // 킥오프가 초 단위까지 같고 전부 예정이면 같은 경기임이 명백하다 — 어느 쪽도 결과를
    // 들고 있지 않으므로 종료를 기다릴 이유가 없고, 기다리는 동안 화면에는 계속 두 장으로
    // 보인다. 2026-08-04: EPL·SERIE_A 새 시즌 일정이 af/ESPN 두 소스로 들어와 37쌍이
    // 이 상태로 쌓여 있었는데 전부 PENDING 으로 미뤄져 아무도 정리하지 않았다.
    const sameKickoff = new Set(rows.map((r) => r.startTime.getTime())).size === 1;
    const allScheduled = rows.every((r) => r.status === "SCHEDULED");
    const identicalFuture = sameKickoff && allScheduled;

    // 탐지기 4 쌍(숫자↔숫자 동방향 ±4일)은 킥오프가 달라도 같은 경기임이 확정이다 —
    // placeholder 시각 격차가 바로 중복의 원인이라, 시각 수렴을 기다리면 영영 안 온다
    // (한쪽 소스는 그 날짜를 더 안 서빙해 row 가 동결됨). 전부 예정이면 지금 정리한다.
    const isNn = rows.length === 2 && rows.every((r) => nnIds.has(r.id));
    const nnScheduled = isNn && allScheduled;

    const scheduledRows = rows.filter((r) => r.status === "SCHEDULED");
    if (scheduledRows.length > 0 && !xsFrozen && !identicalFuture && !nnScheduled) {
      const ghostCutoff = Date.now() - 6 * 3600 * 1000;
      const twinFinished = rows.some((r) => r.status === "FINISHED");
      const allGhost = scheduledRows.every((r) => r.startTime.getTime() < ghostCutoff);
      if (!(twinFinished && allGhost)) {
        buckets.PENDING.push(`[PENDING] ${base.league} ${base.startTime.toISOString()} ${rows.map((r) => `#${r.id}(${r.externalId},${r.status})`).join(" | ")} — 종료 후 재판정`);
        continue;
      }
    }

    const keep = isXs ? pickKeepXs(rows) : pickKeep(rows);
    const dels = rows.filter((r) => r.id !== keep.id);
    const blocked = dels.filter((r) => r.protectedRefs > 0);
    // 점수 소실 가드 — 지울 쪽만 점수를 들고 있으면 어떤 정렬 규칙이 그렇게 뽑았든 손대지
    // 않는다. 순서 규칙은 앞으로 바뀔 수 있지만 "결과를 지우지 않는다" 는 바뀌면 안 된다.
    if (dels.some((r) => r.hasScore) && !keep.hasScore) {
      buckets.ANOMALY.push(
        `[SCORE-GUARD] ${base.league} ${base.startTime.toISOString()} 삭제대상만 점수 보유 — 미처리. ` +
          rows.map((r) => `#${r.id}(${r.externalId},${r.status},score=${r.hasScore})`).join(" | "),
      );
      continue;
    }

    // XS 는 두 row 의 킥오프가 다른 게 핵심이라 각 row 의 시각을 같이 찍는다.
    const at = (r: Row) => r.startTime.toISOString().slice(5, 16);

    // XS 킥오프 시각 가드. 남길 row 가 "갱신이 끊긴 쪽"이면 결과는 지켜도 킥오프 시각이
    // placeholder 로 굳어 경기가 엉뚱한 날짜에 표시된다(af 가 라운드를 한 시각에 몰아넣는
    // 패턴). 결과 보존과 시각 정확성이 충돌하는 경우라 자동 삭제하지 않고 사람이 본다.
    if (isXs) {
      const live = [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (keep.id !== live.id && keep.startTime.getTime() !== live.startTime.getTime()) {
        buckets.REVIEW.push(
          `[REVIEW] ${base.league} 결과 보유 row 와 갱신 살아있는 row 가 다름 — ` +
            rows
              .map(
                (r) =>
                  `#${r.id}(${r.externalId},${at(r)},${r.status},score=${r.hasScore},upd=${r.updatedAt.toISOString().slice(5, 16)})`,
              )
              .join(" | "),
        );
        continue;
      }
    }
    const desc = `${isXs ? "XS " : isNn ? "NN " : ""}${base.league} ${base.startTime.toISOString()} KEEP #${keep.id}(${keep.externalId},${at(keep)},refs=${keep.protectedRefs},${keep.status}${keep.hasScore ? ",score" : ""}) DEL ${dels.map((r) => `#${r.id}(${r.externalId},${at(r)},refs=${r.protectedRefs},${r.status}${r.hasScore ? ",score" : ""})`).join(",")}`;

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
  out("REVIEW (결과 row 와 갱신 row 불일치 — 사람 판단)", buckets.REVIEW);
  out("LIVE-SKIP (라이브 — 미처리)", buckets.LIVE);
  out("ANOMALY (팀페어 불일치 오링크)", buckets.ANOMALY);
  console.log(
    `\n요약. SAFE=${buckets.SAFE.length} MANUAL=${buckets.MANUAL.length} PENDING=${buckets.PENDING.length} REVIEW=${buckets.REVIEW.length} LIVE=${buckets.LIVE.length} ANOMALY=${buckets.ANOMALY.length}` +
      (APPLY ? ` / SAFE삭제 ${deleted}건${MERGE ? ` / 병합 ${mergedGroups}그룹` : ""}` : " / dry-run (삭제 안 함, --apply 로 실행)"),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
