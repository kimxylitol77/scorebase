// UFC(MMA) ESPN 보강 — ESPN scoreboard 로 이벤트 전체(파이트카드)의
// 전적(W-L-D)·국기·헤드샷을 수집해 MmaFighter 에 채운다 (api-sports 가 못 주는 전적 + 안정적 헤드샷).
//   - 파이터 매칭: ESPN athlete.displayName === Team.name (둘 다 영문 풀네임, The Odds/ESPN 동일 표기).
//   - scoreboard.leagues[].calendar 의 최근~미래 UFC 이벤트 날짜를 전부 순회 → 먼 미래 매치까지 커버.
//   - 헤드샷 URL = a.espncdn.com/i/headshots/mma/players/full/{competitor.id}.png (200 확인).
// 사용: npx tsx src/jobs/enrich-mma-espn.ts
import "@/lib/env";
import { prisma } from "@/lib/db";

const ESPN_SB = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";

interface EspnCompetitor {
  id?: string;
  winner?: boolean;
  athlete?: { displayName?: string; flag?: { href?: string } };
  records?: Array<{ summary?: string }>;
}
interface EspnCompetition {
  competitors?: EspnCompetitor[];
  status?: { type?: { state?: string; completed?: boolean } }; // state: pre|in|post
}
interface EspnEvent {
  name?: string;
  competitions?: EspnCompetition[];
}

async function fetchEspn(dates?: string): Promise<EspnEvent[]> {
  try {
    const r = await fetch(dates ? `${ESPN_SB}?dates=${dates}` : ESPN_SB);
    if (!r.ok) return [];
    return ((await r.json()) as { events?: EspnEvent[] }).events ?? [];
  } catch {
    return [];
  }
}

function ymd(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 이름 정규화 — 악센트·접미사(Jr.)·특수문자 제거 (ESPN displayName ↔ Team.name 매칭률 ↑)
export function norm(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // 악센트: Procházka→Prochazka, Benoît→Benoit
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")           // 접미사: Rountree Jr→Rountree
    .replace(/[^a-z0-9 ]/gi, " ")                      // 특수문자(하이픈/아포스트로피)→공백
    .toLowerCase().replace(/\s+/g, " ").trim();
}
// 토큰 정렬 키 — 이름 순서 차이(Weili Zhang ↔ Zhang Weili) 흡수
export function sortedKey(s: string): string {
  return norm(s).split(" ").filter(Boolean).sort().join(" ");
}

// 두 파이터명 → 순서 무관 페어 키 (확정 경기 매칭용)
export function ufcPairKey(a: string, b: string): string {
  return [sortedKey(a), sortedKey(b)].sort().join("|");
}

// ESPN scoreboard(임박 + calendar 미래 순회)의 확정 경기 페어 키 집합.
// collect-mma 가 "ESPN 에 실제 카드로 있는 경기"만 등록하도록 필터 기준 제공.
export async function collectUfcEventPairs(): Promise<Set<string>> {
  const dates = await collectEventDates();
  const pairs = new Set<string>();
  const processed = new Set<string>();
  for (const date of [undefined, ...dates] as (string | undefined)[]) {
    for (const ev of await fetchEspn(date)) {
      const key = ev.name ?? `d${date}`;
      if (processed.has(key)) continue;
      processed.add(key);
      for (const comp of ev.competitions ?? []) {
        const cs = comp.competitors ?? [];
        if (cs.length < 2) continue;
        const a = cs[0].athlete?.displayName, b = cs[1].athlete?.displayName;
        if (a && b) pairs.add(ufcPairKey(a, b));
      }
    }
  }
  return pairs;
}

// scoreboard calendar 에서 최근~미래 UFC 이벤트 날짜(UTC YYYYMMDD) 수집 (이벤트 날짜+전날 경계 보정).
async function collectEventDates(): Promise<string[]> {
  try {
    const r = await fetch(ESPN_SB);
    if (!r.ok) return [];
    const cal =
      ((await r.json()) as { leagues?: Array<{ calendar?: Array<{ startDate?: string }> }> }).leagues?.[0]?.calendar ?? [];
    const cutoff = Date.now() - 3 * 86400_000; // 최근 3일 ~ 미래만 (지난 이벤트 제외)
    const set = new Set<string>();
    for (const c of cal) {
      const sd = typeof c === "object" ? c.startDate : undefined;
      const t = sd ? Date.parse(sd) : NaN;
      if (isNaN(t) || t < cutoff) continue;
      set.add(ymd(t));
      set.add(ymd(t - 86400_000)); // UTC 자정 경계 — 이벤트가 전날 dates 로 잡히는 경우 대비
    }
    return [...set];
  } catch {
    return [];
  }
}

export async function runEnrichMmaEspn(): Promise<{ matched: number; events: number }> {
  // UFC Team name(영문) → teamId 맵 (ESPN displayName 매칭용)
  const teams = await prisma.team.findMany({ where: { league: "UFC" }, select: { id: true, name: true } });
  const byName = new Map<string, number>();
  const bySorted = new Map<string, number>();
  for (const t of teams) {
    byName.set(norm(t.name), t.id);
    bySorted.set(sortedKey(t.name), t.id);
  }

  // 임박(기본 scoreboard) + calendar 미래 이벤트 날짜 순회 → 모든 예정 이벤트 파이트카드 커버
  const dates = await collectEventDates();
  const sources: Array<string | undefined> = [undefined, ...dates];
  const processed = new Set<string>();
  let matched = 0;
  let events = 0;
  for (const date of sources) {
    for (const ev of await fetchEspn(date)) {
      const key = ev.name ?? `d${date}`;
      if (processed.has(key)) continue; // 같은 이벤트가 날짜+전날 둘 다 잡힘 → 1회만
      processed.add(key);
      events++;
      for (const comp of ev.competitions ?? []) {
        for (const c of comp.competitors ?? []) {
          const name = c.athlete?.displayName;
          if (!name) continue;
          const teamId = byName.get(norm(name)) ?? bySorted.get(sortedKey(name));
          if (teamId == null) continue; // 우리 매치에 없는 파이터 → skip
          const record = c.records?.find((r) => r.summary)?.summary ?? null;
          const espnId = c.id ?? null;
          const headshot = espnId
            ? `https://a.espncdn.com/i/headshots/mma/players/full/${espnId}.png`
            : null;
          const flagUrl = c.athlete?.flag?.href ?? null;
          // null 은 기존값 유지(undefined) — 다른 이벤트/소스가 채운 값 보존.
          await prisma.mmaFighter
            .update({
              where: { teamId },
              data: {
                record: record ?? undefined,
                espnId: espnId ?? undefined,
                headshot: headshot ?? undefined,
                flagUrl: flagUrl ?? undefined,
              },
            })
            .then(() => {
              matched++;
            })
            .catch(() => {}); // MmaFighter row 없으면 skip
        }
      }
    }
  }
  console.log(`[mma-espn] ${events}이벤트(${dates.length}날짜 순회) → ${matched}명 ESPN 보강(전적/국기/헤드샷)`);
  return { matched, events };
}

/**
 * UFC 라이브 status — ESPN scoreboard 의 competition.status(pre/in/post)로
 * Match 를 SCHEDULED→LIVE→FINISHED 전환(+종료 시 승자 1/0). The Odds 는 완료 경기만 줘서
 * 라이브 상태가 없던 공백을 메운다. 빠름(현재/임박 scoreboard 1콜) → cron 경기 시간대 자주 호출.
 */
export async function runEnrichMmaLive(): Promise<{ live: number; finished: number }> {
  const teams = await prisma.team.findMany({ where: { league: "UFC" }, select: { id: true, name: true } });
  const byName = new Map<string, number>();
  const bySorted = new Map<string, number>();
  for (const t of teams) {
    byName.set(norm(t.name), t.id);
    bySorted.set(sortedKey(t.name), t.id);
  }
  const tid = (name?: string): number | null =>
    name ? (byName.get(norm(name)) ?? bySorted.get(sortedKey(name)) ?? null) : null;

  const events = await fetchEspn(); // 현재/임박 이벤트 (라이브는 calendar 순회 불필요)
  let live = 0;
  let finished = 0;
  for (const ev of events) {
    for (const comp of ev.competitions ?? []) {
      const state = comp.status?.type?.state;
      if (!state || state === "pre") continue; // 예정 → SCHEDULED 유지
      const cs = comp.competitors ?? [];
      if (cs.length < 2) continue;
      const tA = tid(cs[0].athlete?.displayName);
      const tB = tid(cs[1].athlete?.displayName);
      if (tA == null || tB == null) continue;
      const m = await prisma.match.findFirst({
        where: {
          league: "UFC",
          OR: [
            { homeTeamId: tA, awayTeamId: tB },
            { homeTeamId: tB, awayTeamId: tA },
          ],
        },
        select: { id: true, homeTeamId: true, status: true },
      });
      if (!m) continue;

      if (state === "in") {
        // 단조 가드 — FINISHED 는 LIVE 로 되돌리지 않음.
        if (m.status !== "FINISHED" && m.status !== "LIVE") {
          await prisma.match.update({ where: { id: m.id }, data: { status: "LIVE" } });
        }
        live++;
      } else if (state === "post") {
        const winnerTid = tid(cs.find((c) => c.winner)?.athlete?.displayName);
        const homeWon = winnerTid != null && winnerTid === m.homeTeamId;
        await prisma.match.update({
          where: { id: m.id },
          data: {
            status: "FINISHED",
            // MMA 는 점수 없음 → 승자 1 / 패자 0. 무승부·노컨테스트(winner 없음)면 null.
            homeScore: winnerTid == null ? null : homeWon ? 1 : 0,
            awayScore: winnerTid == null ? null : homeWon ? 0 : 1,
          },
        });
        finished++;
      }
    }
  }
  console.log(`[mma-live] LIVE ${live} · FINISHED ${finished}`);
  return { live, finished };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEnrichMmaEspn()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
