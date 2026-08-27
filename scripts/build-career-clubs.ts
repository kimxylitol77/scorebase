// 커리어 시뮬레이터 구단 데이터 생성 — Team 테이블 → public/career-clubs.json
//   npx tsx --env-file=.env.local scripts/build-career-clubs.ts
//
// 런타임에는 DB 를 쓰지 않는다. 이 스크립트로 만든 정적 JSON 만 게임이 읽는다.
// 리그가 개편되거나 구단이 바뀌면 다시 돌리면 된다.

import { writeFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { LEAGUES } from "@/lib/career/leagues";
import { toKoreanTeamName } from "@/lib/team-names";

interface ClubOut {
  n: string; // 구단명 (한국어 우선)
  l: string; // 리그 코드
  c: string; // 국가 코드
  t: number; // 티어 1~6
  g: string; // 로고 URL
}

async function fetchTeams() {
  // DB 가 간헐적으로 끊겨 재시도한다 (Neon 슬립 관측)
  for (let i = 0; i < 5; i++) {
    try {
      return await prisma.team.findMany({
        where: { league: { in: Object.keys(LEAGUES) }, logoUrl: { not: null } },
        select: { league: true, name: true, nameKo: true, logoUrl: true },
      });
    } catch (err) {
      if (i === 4) throw err;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const teams = await fetchTeams();

  // 같은 구단이 여러 리그에 누적돼 있다(승강·과거 시즌). 이름 기준으로 합치고 가장 높은 티어를 남긴다.
  const best = new Map<string, ClubOut>();
  for (const t of teams) {
    const meta = LEAGUES[t.league];
    if (!meta || !t.logoUrl) continue;
    // 표기 교정은 team-names.ts 사전이 항상 우선(schema 주석 참조), 없으면 nameKo, 그다음 원문
    const name = (toKoreanTeamName(t.name, t.league) || t.nameKo || t.name).trim();
    if (!name) continue;
    const prev = best.get(name);
    if (prev && prev.t <= meta.tier) continue;
    best.set(name, { n: name, l: t.league, c: meta.country, t: meta.tier, g: t.logoUrl });
  }

  const clubs = [...best.values()].sort((a, b) => a.t - b.t || a.n.localeCompare(b.n, "ko"));
  const out = path.join(process.cwd(), "public/career-clubs.json");
  writeFileSync(out, JSON.stringify(clubs));

  // 요약 — 데이터가 비거나 한쪽으로 쏠렸는지 눈으로 확인한다
  const byTier: Record<number, number> = {};
  const byCountry: Record<string, number> = {};
  for (const c of clubs) {
    byTier[c.t] = (byTier[c.t] ?? 0) + 1;
    byCountry[c.c] = (byCountry[c.c] ?? 0) + 1;
  }
  console.log(`구단 ${clubs.length}개 저장 → public/career-clubs.json`);
  console.log("티어별:", Object.entries(byTier).map(([t, n]) => `T${t}=${n}`).join(" "));
  const thin = Object.entries(byCountry).filter(([, n]) => n < 6);
  console.log("국가 수:", Object.keys(byCountry).length, thin.length ? `| 구단 6개 미만: ${thin.map(([c, n]) => `${c}(${n})`).join(" ")}` : "");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
