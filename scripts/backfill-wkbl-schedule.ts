// WKBL 경기 백필 — 공식 일정 목록(wkbl.or.kr inc_list_1_new.asp)으로 2020-21~지난 시즌 정규리그 결과와 이번 시즌 일정을 Match 로 넣는다.
// ts 는 WKBL 지난 시즌을 안 주고 이번 시즌 일정도 아직 없어 DB 에 WKBL 경기가 2건뿐이었다(2026-10-03).
// externalId = "wkbl-{season_gu}-{YYYYMMDD}-{홈코드}-{원정코드}" — 미래 경기는 경기 번호가 없어 날짜·팀으로 키를 만든다.
// 목록의 먼저 적힌 팀이 홈이다(경기장으로 확인: 청주체육관 = KB 가 먼저). 플레이오프는 이 목록에 없다.
// 사용: npx tsx --env-file=.env.local scripts/backfill-wkbl-schedule.ts [--apply] [--from=41] [--to=47]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { WKBL_TEAM_ID, parseWkblScheduleList, type WkblListRow } from "@/lib/sports/wkbl-game";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function list(gu: string, ym: string): Promise<WkblListRow[]> {
  const r = await fetch(`https://www.wkbl.or.kr/game/sch/inc_list_1_new.asp?season_gu=${gu}&ym=${ym}&viewType=1&gun=1`, {
    headers: { "User-Agent": UA, Referer: "https://www.wkbl.or.kr/game/sch/schedule1.asp" },
  });
  if (!r.ok) throw new Error(`WKBL ${gu} ${ym} ${r.status}`);
  return parseWkblScheduleList(await r.text(), gu);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
  const rows: WkblListRow[] = [];
  for (let gu = arg("from", 41); gu <= arg("to", 47); gu++) {
    const y = 1979 + gu;
    for (const ym of [`${y}10`, `${y}11`, `${y}12`, `${y + 1}01`, `${y + 1}02`, `${y + 1}03`, `${y + 1}04`]) {
      rows.push(...(await list(String(gu).padStart(3, "0"), ym)));
      await new Promise((x) => setTimeout(x, 300));
    }
  }
  const mapped = rows.filter((r) => WKBL_TEAM_ID[r.homeCode] && WKBL_TEAM_ID[r.awayCode]);
  const existing = await prisma.match.findMany({ where: { league: "WKBL" }, select: { externalId: true, startTime: true, homeTeamId: true, awayTeamId: true } });
  const have = new Set(existing.map((e) => e.externalId));
  const near = (h: number, a: number, t: Date) =>
    existing.some((e) => !e.externalId.startsWith("wkbl-") && ((e.homeTeamId === h && e.awayTeamId === a) || (e.homeTeamId === a && e.awayTeamId === h)) && Math.abs(e.startTime.getTime() - t.getTime()) < 6 * 3600_000);
  const fresh = mapped.filter((r) => !have.has(r.externalId) && !near(WKBL_TEAM_ID[r.homeCode], WKBL_TEAM_ID[r.awayCode], r.startTime));
  const by = new Map<string, number>();
  for (const r of fresh) by.set(`${r.seasonGu} ${r.finished ? "종료" : "예정"}`, (by.get(`${r.seasonGu} ${r.finished ? "종료" : "예정"}`) ?? 0) + 1);
  console.log(`목록 ${rows.length} · 팀 매핑 ${mapped.length}(올스타 등 제외 ${rows.length - mapped.length}) · 기존 ${mapped.length - fresh.length} · 새로 ${fresh.length}`);
  for (const [k, v] of [...by].sort()) console.log(`  ${k} ${v}`);
  if (!apply) { console.log("(dry-run — --apply 로 저장)"); return; }
  const res = await prisma.match.createMany({
    skipDuplicates: true,
    data: fresh.map((r) => ({
      league: "WKBL",
      externalId: r.externalId,
      homeTeamId: WKBL_TEAM_ID[r.homeCode],
      awayTeamId: WKBL_TEAM_ID[r.awayCode],
      homeScore: r.finished ? r.homeScore : null,
      awayScore: r.finished ? r.awayScore : null,
      status: r.finished ? "FINISHED" : "SCHEDULED",
      startTime: r.startTime,
      raw: JSON.stringify({ wkbl: { seasonGu: r.seasonGu, gameType: r.gameType, gameNo: r.gameNo, venue: r.venue } }),
    })),
  });
  console.log(`저장 ${res.count}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
