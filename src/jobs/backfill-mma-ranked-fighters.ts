// UFC 랭킹에 올랐지만 경기 데이터가 없어 프로필이 없던 파이터를 ESPN 검색으로 백필.
//   - 랭킹(octagon-api)은 이름만 줌 → 기존 파이프라인(scoreboard 기반)은 경기 없는 랭커를 못 채움.
//   - 이름 → ESPN search/v2(mma) → 숫자 espnId → athlete API(신체·전적·이력) → Team+MmaFighter 생성.
// 사용: npx tsx src/jobs/backfill-mma-ranked-fighters.ts
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchUfcRankings } from "@/lib/sports/ufc-rankings";
import { norm } from "./enrich-mma-espn";

const SEARCH = (q: string) => `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&sport=mma&limit=6`;
const ATH = (id: string) => `https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// norm 보강 — NFD로 분해되지 않는 특수문자(ł/ø/đ/ı 등)를 라틴 기본자로. Błachowicz↔Blachowicz 매칭.
function normLoose(s: string): string {
  return norm(s.replace(/[łŁ]/g, "l").replace(/[øØ]/g, "o").replace(/[đĐ]/g, "d").replace(/[ıİ]/g, "i").replace(/[ß]/g, "ss"));
}

function fighterExternalId(name: string): string {
  return "ufc-" + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface SearchItem { sport?: string; displayName?: string; uid?: string; link?: { web?: string } }
interface SearchResultType { type?: string; contents?: SearchItem[] }

// 이름 → 숫자 espnId (mma player, displayName 정규화 정확 일치). uid("s:..~a:{id}") 또는 link(/id/{id}/) 에서 추출.
async function searchEspnId(name: string): Promise<string | null> {
  const r = await fetch(SEARCH(name), { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const d = (await r.json()) as { results?: SearchResultType[] };
  for (const rt of d.results ?? []) {
    if (rt.type !== "player") continue;
    for (const it of rt.contents ?? []) {
      if (it.sport !== "mma" || !it.displayName) continue;
      if (normLoose(it.displayName) !== normLoose(name)) continue; // 동명이인 오매칭 방지(특수문자 흡수)
      const m = (it.uid ?? "").match(/a:(\d+)/) ?? (it.link?.web ?? "").match(/\/id\/(\d+)\//);
      if (m) return m[1];
    }
  }
  return null;
}

interface EspnAthlete {
  weightClass?: { text?: string };
  displayHeight?: string; displayWeight?: string; displayReach?: string;
  stance?: { text?: string }; nickname?: string; association?: { name?: string };
  age?: number; citizenship?: string; flag?: { href?: string };
  statsSummary?: { statistics?: Array<{ name?: string; displayValue?: string }> };
}
interface EspnFightEvent {
  gameDate?: string; gameResult?: string; opponent?: { displayName?: string };
  status?: { period?: number; displayClock?: string; result?: { shortDisplayName?: string } };
}

async function fetchAthlete(espnId: string) {
  const res = await fetch(ATH(espnId), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { athlete?: EspnAthlete; events?: string[]; eventsMap?: Record<string, EspnFightEvent> };
  const a = data.athlete;
  if (!a) return null;
  const history = (data.events ?? [])
    .slice(0, 6)
    .map((id) => {
      const e = data.eventsMap?.[id];
      if (!e) return null;
      return {
        d: (e.gameDate ?? "").slice(0, 10),
        r: e.gameResult ?? null,
        o: e.opponent?.displayName ?? null,
        m: e.status?.result?.shortDisplayName ?? null,
        rd: e.status?.period ?? null,
        c: e.status?.displayClock ?? null,
      };
    })
    .filter((h): h is NonNullable<typeof h> => !!h && !!h.o);
  return { a, history };
}

export async function runBackfillMmaRankedFighters(): Promise<{ created: number; enriched: number; notFound: number }> {
  // 1) 랭킹 이름 수집 (octagon 원본)
  const snap = await fetchUfcRankings();
  const names = new Set<string>();
  for (const c of snap) {
    if (c.champion) names.add(c.champion.name);
    for (const f of c.ranks) names.add(f.name);
  }

  // 2) 이미 창고에 있는 파이터 제외
  const existing = await prisma.mmaFighter.findMany({ select: { name: true } });
  const have = new Set(existing.map((f) => normLoose(f.name)));
  const missing = [...names].filter((n) => !have.has(normLoose(n)));
  console.log(`[mma-backfill] 랭킹 ${names.size}명 중 미보유 ${missing.length}명 백필 시도`);

  let created = 0, enriched = 0, notFound = 0;
  for (const name of missing) {
    try {
      const espnId = await searchEspnId(name);
      await sleep(200);
      if (!espnId) { notFound++; console.log(`  · 미발견: ${name}`); continue; }

      const detail = await fetchAthlete(espnId);
      await sleep(200);
      const a = detail?.a;
      const history = detail?.history ?? [];
      const stat = (nm: string) => a?.statsSummary?.statistics?.find((s) => s.name === nm)?.displayValue ?? null;

      // 3) Team(UFC) + MmaFighter 생성
      const externalId = fighterExternalId(name);
      const team = await prisma.team.upsert({
        where: { league_externalId: { league: "UFC", externalId } },
        update: { name },
        create: { league: "UFC", externalId, name },
      });
      await prisma.mmaFighter.upsert({
        where: { teamId: team.id },
        update: {
          espnId,
          headshot: `https://a.espncdn.com/i/headshots/mma/players/full/${espnId}.png`,
        },
        create: {
          teamId: team.id,
          name,
          espnId,
          headshot: `https://a.espncdn.com/i/headshots/mma/players/full/${espnId}.png`,
          category: a?.weightClass?.text ?? null,
          height: a?.displayHeight ?? null,
          weight: a?.displayWeight ?? null,
          reach: a?.displayReach ?? null,
          stance: a?.stance?.text ?? null,
          nickname: a?.nickname ?? null,
          gym: a?.association?.name ?? null,
          age: typeof a?.age === "number" ? a.age : null,
          citizenship: a?.citizenship ?? null,
          record: stat("wins-losses-draws"),
          koRecord: stat("tkos-tkoLosses"),
          subRecord: stat("submissions-submissionLosses"),
          flagUrl: a?.flag?.href ?? null,
          fightHistory: history.length ? JSON.stringify(history) : null,
        },
      });
      created++;
      if (a) enriched++;
    } catch (e) {
      console.log(`  · 실패(${name}):`, (e as Error).message.slice(0, 60));
    }
  }
  console.log(`[mma-backfill] 완료: 생성 ${created} · 상세보강 ${enriched} · ESPN 미발견 ${notFound}`);
  return { created, enriched, notFound };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillMmaRankedFighters()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
