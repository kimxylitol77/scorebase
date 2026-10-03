// KBL 과거 시즌 경기 결과 백필 — KBL 공식 API(api.kbl.or.kr /match/list)로 2020-21~지난 시즌 정규·PO·챔프전을 Match 로 넣는다.
// ts 는 지난 시즌 match/season/recent 가 405(현재 시즌만)라 Elo·예측·상대전적에 쓸 이력이 없었다(2026-10-03, DB 에 4/30 이후 6경기뿐).
// 사용: npx tsx --env-file=.env.local scripts/backfill-kbl-history.ts [--apply] [--from=2020]
import "@/lib/env";
import { prisma } from "@/lib/db";

const H = {
  Origin: "https://kbl.or.kr", Referer: "https://kbl.or.kr/", "User-Agent": "Mozilla/5.0",
  Channel: "WEB", TeamCode: "XX", lang: "ko", "X-Requested-With": "XMLHttpRequest",
};
/** KBL 구단 코드 → 현재 구단 Team.id (구단 이름이 바뀌어도 같은 프랜차이즈로 잇는다) */
const TEAM: Record<string, number> = {
  "35": 607775, // 서울 삼성
  "60": 607776, // 전주→부산 KCC
  "50": 607777, // 창원 LG
  "55": 607778, // 서울 SK
  "10": 607779, // 울산 현대모비스
  "16": 607780, // 원주 DB
  "06": 607781, // 부산→수원 KT
  "64": 607782, "65": 607782, // 인천 전자랜드 → 대구 한국가스공사
  "70": 607783, // 안양 KGC → 정관장
  "30": 607784, "73": 607784, "66": 607784, // 고양 오리온 → 캐롯 → 소노
};
/** 정규시즌·플레이오프·챔피언결정전만 (D리그·컵·올스타·EASL 제외) */
const KEEP = new Set(["R", "PO", "CP"]);

interface KblGame {
  gmkey: string; gameDate: string; gameStart: string; seasonName1: string; seasonCategory: string; seasonCategoryName: string;
  tcodeH: string; tcodeA: string; scoreH: number; scoreA: number; isEnded: number; stadiumname?: string;
}

async function list(from: string, to: string): Promise<KblGame[]> {
  const r = await fetch(`https://api.kbl.or.kr/match/list?fromDate=${from}&toDate=${to}&tcodeList=all`, { headers: H });
  if (!r.ok) throw new Error(`KBL match/list ${from}~${to} ${r.status}`);
  return (await r.json()) as KblGame[];
}

/** "20251003" + "1400" (KST) → UTC Date */
export function kblStartTime(date: string, hhmm: string): Date {
  const h = hhmm && hhmm.length >= 3 ? hhmm.padStart(4, "0") : "1900";
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +h.slice(0, 2) - 9, +h.slice(2, 4)));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fromYear = Number(process.argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? 2020);
  const thisSeasonStart = new Date(Date.UTC(2026, 7, 1)); // 이번 시즌(2026-27)은 ts 가 이미 싣는다
  const games: KblGame[] = [];
  for (let y = fromYear; y <= 2025; y++) {
    for (const [a, b] of [[`${y}0901`, `${y}1231`], [`${y + 1}0101`, `${y + 1}0630`]]) {
      games.push(...(await list(a, b)));
      await new Promise((x) => setTimeout(x, 500));
    }
  }
  // 1군 시즌만 — D리그도 PO·CP 분류를 같이 써서 시즌 이름("2020 KBL D리그")으로 거른다
  const keep = games.filter((g) => KEEP.has(g.seasonCategory) && g.isEnded === 1 && /^\d{4}-\d{4}$/.test(g.seasonName1));
  const unmapped = keep.filter((g) => !TEAM[g.tcodeH] || !TEAM[g.tcodeA]);
  const rows = keep
    .filter((g) => TEAM[g.tcodeH] && TEAM[g.tcodeA])
    .map((g) => ({ g, startTime: kblStartTime(g.gameDate, g.gameStart) }))
    .filter((x) => x.startTime < thisSeasonStart);

  // 이미 있는 경기(ts 행 — 2026-04-30 이후 플레이오프 등)와 겹치면 건너뛴다: 같은 두 팀 + 6시간 이내
  const existing = await prisma.match.findMany({
    where: { league: "KBL", startTime: { lt: thisSeasonStart } },
    select: { externalId: true, startTime: true, homeTeamId: true, awayTeamId: true },
  });
  const dup = (h: number, a: number, t: Date) =>
    existing.some((e) => ((e.homeTeamId === h && e.awayTeamId === a) || (e.homeTeamId === a && e.awayTeamId === h)) && Math.abs(e.startTime.getTime() - t.getTime()) < 6 * 3600_000);
  const fresh = rows.filter(({ g, startTime }) => !existing.some((e) => e.externalId === `kbl-${g.gmkey}`) && !dup(TEAM[g.tcodeH], TEAM[g.tcodeA], startTime));

  const bySeason = new Map<string, number>();
  for (const { g } of fresh) bySeason.set(`${g.seasonName1} ${g.seasonCategoryName}`, (bySeason.get(`${g.seasonName1} ${g.seasonCategoryName}`) ?? 0) + 1);
  console.log(`받은 경기 ${games.length} · 대상(정규·PO·챔프 종료) ${keep.length} · 팀 매핑 실패 ${unmapped.length} · 기존과 겹침 ${rows.length - fresh.length} · 새로 넣을 ${fresh.length}`);
  for (const [k, v] of [...bySeason].sort()) console.log(`  ${k} ${v}`);
  if (unmapped.length) console.log("  매핑 실패 예:", unmapped.slice(0, 5).map((g) => `${g.gmkey} ${g.tcodeH}/${g.tcodeA}`).join(", "));
  if (!apply) { console.log("(dry-run — --apply 로 저장)"); return; }

  const res = await prisma.match.createMany({
    skipDuplicates: true,
    data: fresh.map(({ g, startTime }) => ({
      league: "KBL",
      externalId: `kbl-${g.gmkey}`,
      homeTeamId: TEAM[g.tcodeH],
      awayTeamId: TEAM[g.tcodeA],
      homeScore: g.scoreH,
      awayScore: g.scoreA,
      status: "FINISHED",
      startTime,
      raw: JSON.stringify({ kbl: { gmkey: g.gmkey, season: g.seasonName1, category: g.seasonCategory, categoryName: g.seasonCategoryName, stadium: g.stadiumname ?? null } }),
      playoffRound: g.seasonCategory === "R" ? null : g.seasonCategoryName,
    })),
  });
  console.log(`저장 ${res.count}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
