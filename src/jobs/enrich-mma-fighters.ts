// UFC(MMA) 파이터 프로필 enrichment — api-sports MMA /fighters?search 로
// 체급·신장·체중·리치·스탠스·별명·소속짐 수집 → MmaFighter upsert.
//   - 파이터는 Team(league="UFC")으로 존재. 그 1:1 확장 테이블(MmaFighter)을 채운다.
//   - api-sports Free 100req/day → rate limit(429) 시 중단하고 다음 실행에 이어서(점진 백필).
//   - 미수록 파이터도 name 만 row 생성(이름 한글화 대상 유지). fetchedAt 으로 재조회 주기 관리.
//   - 전적(W-L-D)은 이 endpoint 미제공 → 미수집(후속 별도 소스).
// 사용: npx tsx src/jobs/enrich-mma-fighters.ts
import "@/lib/env";
import { prisma } from "@/lib/db";

const FIGHTERS_API = "https://v1.mma.api-sports.io/fighters";
const REFETCH_DAYS = 30; // 기존 프로필 재조회 주기 (신체/소속짐 변동 대비)

interface ApiFighter {
  id?: number;
  name?: string;
  nickname?: string | null;
  photo?: string | null;
  gender?: string | null;
  height?: string | null;
  weight?: string | null;
  reach?: string | null;
  stance?: string | null;
  category?: string | null;
  team?: { name?: string | null } | null;
}

// api-sports /fighters?search 는 단일 토큰(성)에 최적 — "First Last" 풀네임은 매칭 실패가 잦다.
// (예: "Jon Jones" 0건 → "Jones" 검색 후 풀네임 exact 매칭). 동명이인 위험으로 성 검색은 exact 만 채택.
// "rate" = 429 → 중단. null = 미수록/에러. ApiFighter = 매칭.
async function trySearch(
  query: string,
  fullName: string,
  key: string,
  allowSingle: boolean,
): Promise<ApiFighter | null | "rate"> {
  try {
    const r = await fetch(`${FIGHTERS_API}?search=${encodeURIComponent(query)}`, {
      headers: { "x-apisports-key": key },
    });
    if (r.status === 429) return "rate";
    if (!r.ok) return null;
    const list = ((await r.json()) as { response?: ApiFighter[] }).response ?? [];
    const exact = list.find((f) => f.name?.toLowerCase() === fullName.toLowerCase());
    if (exact) return exact;
    // 풀네임 검색이고 결과가 단 1개면 그것으로 (성 검색은 동명이인 위험 → exact 만)
    return allowSingle && list.length === 1 ? list[0] : null;
  } catch {
    return null;
  }
}

// surnameOnly=true 면 성으로만(풀네임 이미 실패한 재시도 — 한도 절약).
async function searchFighter(
  name: string,
  key: string,
  surnameOnly: boolean,
): Promise<ApiFighter | null | "rate"> {
  // 접미사(Jr./Sr./II/III/IV) 제외하고 마지막 단어 = 성 (api-sports 는 성 검색에 최적)
  const parts = name.trim().split(/\s+/).filter((p) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(p));
  const surname = parts[parts.length - 1] ?? name;
  if (!surnameOnly) {
    const byFull = await trySearch(name, name, key, true);
    if (byFull === "rate" || byFull) return byFull;
    await new Promise((res) => setTimeout(res, 6000)); // 2차 호출 전 delay
  }
  if (surname.toLowerCase() === name.toLowerCase()) return null; // 단일 토큰이면 성 재시도 무의미
  return trySearch(surname, name, key, false);
}

export async function runEnrichMma(): Promise<{ enriched: number; rateLimited: boolean }> {
  const key = process.env.API_FOOTBALL_KEY ?? "";
  if (!key) {
    console.error("[mma-enrich] API_FOOTBALL_KEY 없음 — 중단");
    return { enriched: 0, rateLimited: false };
  }

  const teams = await prisma.team.findMany({
    where: { league: "UFC" },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      mmaFighter: { select: { id: true, fetchedAt: true, apiSportsId: true } },
    },
  });

  // 프로필 없는 파이터 먼저, 그다음 REFETCH_DAYS 초과한 오래된 것
  const cutoff = Date.now() - REFETCH_DAYS * 86400_000;
  const todo = teams
    .filter(
      (t) =>
        !t.mmaFighter ||
        t.mmaFighter.fetchedAt.getTime() < cutoff ||
        t.mmaFighter.apiSportsId == null, // 풀네임 검색 실패분 → 성으로 재시도
    )
    .sort((a, b) => {
      const aw = a.mmaFighter ? a.mmaFighter.fetchedAt.getTime() : 0;
      const bw = b.mmaFighter ? b.mmaFighter.fetchedAt.getTime() : 0;
      return aw - bw; // 미보유(0) 먼저, 그다음 오래된 순
    });

  console.log(`[mma-enrich] UFC 파이터 ${teams.length}명 중 ${todo.length}명 대상`);

  let enriched = 0;
  let rateLimited = false;
  for (const t of todo) {
    // 기존 row 인데 apiSportsId 없음 = 풀네임 검색 이미 실패 → 성으로만 재시도(한도 절약)
    const surnameOnly = !!t.mmaFighter && t.mmaFighter.apiSportsId == null;
    const f = await searchFighter(t.name, key, surnameOnly);
    if (f === "rate") {
      rateLimited = true;
      console.log(`[mma-enrich] rate limit(429) — ${enriched}명 처리 후 중단 (다음 실행에 이어서)`);
      break;
    }
    await new Promise((res) => setTimeout(res, 6000)); // api-sports 연속 호출 rate limit 회피

    await prisma.mmaFighter.upsert({
      where: { teamId: t.id },
      create: {
        teamId: t.id,
        name: t.name,
        apiSportsId: f?.id ?? null,
        nickname: f?.nickname || null,
        gender: f?.gender || null,
        category: f?.category || null,
        height: f?.height || null,
        weight: f?.weight || null,
        reach: f?.reach || null,
        stance: f?.stance || null,
        gym: f?.team?.name || null,
        photo: f?.photo || null,
      },
      update: {
        // 미매칭(f=null)·부분데이터면 빈값으로 덮지 않고 기존값 보존
        // (ESPN athlete 가 채운 신체/사진을 api-sports 빈값이 날리던 버그 수정 — athlete 우선).
        apiSportsId: f?.id ?? undefined,
        nickname: f?.nickname || undefined,
        gender: f?.gender || undefined,
        category: f?.category || undefined,
        height: f?.height || undefined,
        weight: f?.weight || undefined,
        reach: f?.reach || undefined,
        stance: f?.stance || undefined,
        gym: f?.team?.name || undefined,
        photo: f?.photo || undefined,
        fetchedAt: new Date(),
        // nameKo 는 건드리지 않음 (build-ufc-fighter-names-haiku.ts 가 채운 값 보존)
      },
    });

    // Team.logoUrl 비어있으면(null 또는 "") api-sports photo 로 보강
    if (f?.photo && (!t.logoUrl || t.logoUrl === "")) {
      await prisma.team.update({ where: { id: t.id }, data: { logoUrl: f.photo } });
    }
    enriched++;
  }

  console.log(`[mma-enrich] ${enriched}명 프로필 적재${rateLimited ? " (rate limit 중단)" : " 완료"}`);
  return { enriched, rateLimited };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEnrichMma()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
