// UFC(MMA) ESPN athlete 풀보강 — espnId 있는 파이터를 ESPN athlete API 로 개별 호출해
// 신체·체급·별명·소속·나이·국적 + 전적통계(W-L-D, (T)KO, 서브미션)를 채운다.
//   - ESPN athlete 는 api-sports 가 주는 것 전부 + 추가(나이·국적·피니시 분포)를 무제한으로 줌
//     → 신체/체급은 athlete 값으로 일관 갱신(api-sports 분당 한도 회피).
//   - espnId 는 enrich-mma-espn(scoreboard) 이 먼저 채움. espnId 없는 파이터는 api-sports 만.
// 사용: npx tsx src/jobs/enrich-mma-athlete.ts
import "@/lib/env";
import { prisma } from "@/lib/db";

const ATH = (id: string) => `https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`;

interface EspnAthlete {
  weightClass?: { text?: string };
  displayHeight?: string;
  displayWeight?: string;
  displayReach?: string;
  stance?: { text?: string };
  nickname?: string;
  association?: { name?: string };
  age?: number;
  citizenship?: string;
  headshot?: { href?: string };
  flag?: { href?: string };
  statsSummary?: { statistics?: Array<{ name?: string; displayValue?: string }> };
}

export async function runEnrichMmaAthlete(): Promise<{ enriched: number }> {
  const rows = await prisma.mmaFighter.findMany({
    where: { espnId: { not: null } },
    select: { teamId: true, espnId: true },
  });
  let n = 0;
  for (const r of rows) {
    try {
      const res = await fetch(ATH(r.espnId as string));
      if (!res.ok) continue;
      const a = ((await res.json()) as { athlete?: EspnAthlete }).athlete;
      if (!a) continue;
      const stats = a.statsSummary?.statistics ?? [];
      const stat = (name: string) => stats.find((s) => s.name === name)?.displayValue ?? null;
      await prisma.mmaFighter.update({
        where: { teamId: r.teamId },
        data: {
          // null 은 undefined 로 → 기존값 유지 (다른 소스가 채운 값 보존)
          category: a.weightClass?.text ?? undefined,
          height: a.displayHeight ?? undefined,
          weight: a.displayWeight ?? undefined,
          reach: a.displayReach ?? undefined,
          stance: a.stance?.text ?? undefined,
          nickname: a.nickname ?? undefined,
          gym: a.association?.name ?? undefined,
          age: typeof a.age === "number" ? a.age : undefined,
          citizenship: a.citizenship ?? undefined,
          record: stat("wins-losses-draws") ?? undefined,
          koRecord: stat("tkos-tkoLosses") ?? undefined,
          subRecord: stat("submissions-submissionLosses") ?? undefined,
          headshot: a.headshot?.href ?? undefined,
          flagUrl: a.flag?.href ?? undefined,
        },
      });
      n++;
      await new Promise((res2) => setTimeout(res2, 150)); // ESPN 예의상 약간 delay
    } catch {
      // 개별 실패는 skip (다음 cron 재시도)
    }
  }
  console.log(`[mma-athlete] espnId ${rows.length}명 중 ${n}명 ESPN athlete 풀보강(신체/나이/국적/통계)`);
  return { enriched: n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEnrichMmaAthlete()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
