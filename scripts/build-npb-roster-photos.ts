// NPB 로스터 선수(공식 pid) → 사진 URL 사전.
//   사진 경로가 `p.npb.jp/players_photo/{연도}/180/{팀}/{일련번호}_{pid}.jpg` 인데
//   일련번호가 선수마다 달라 pid 로 URL 을 조립할 수 없다 → 상세 페이지에서 1회 수집해 사전화.
//   팀 페이지 로스터(팀당 60~80명)에서 런타임 조회하면 요청마다 수십 콜이라 불가.
//   ※ 기존 build-npb-player-photos.ts 는 "ts 선수 DB(photoUrl)" 용으로 목적이 다르다
//     (실측: 그 경로는 로스터 커버 15% 에 그쳐 별도 수집이 필요했다).
// 실행: npx tsx --env-file=.env.local scripts/build-npb-roster-photos.ts
import fs from "fs";
import { prisma } from "../src/lib/db";
import rosters from "../data/baseball-rosters.json";
import { fetchNpbPhotoUrl } from "../src/lib/sports/npb-official";

const OUT = "data/npb-player-photos.json";

async function main() {
  const R = rosters as Record<string, { id: string; name: string }[]>;
  const teams = await prisma.team.findMany({ where: { league: "NPB" }, select: { id: true } });
  const npbTeamIds = new Set(teams.map((t) => String(t.id)));
  const players: { id: string; name: string }[] = [];
  for (const [tid, arr] of Object.entries(R)) if (npbTeamIds.has(tid)) players.push(...arr);

  const prev: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = players.filter((p) => !prev[p.id]);
  console.log(`[npb-photo] 로스터 ${players.length}명 · 기존 ${Object.keys(prev).length} · 신규 ${todo.length}`);

  const out = { ...prev };
  let ok = 0;
  let done = 0;
  for (const p of todo) {
    const url = await fetchNpbPhotoUrl(p.id);
    if (url) {
      out[p.id] = url;
      ok++;
    }
    if (++done % 50 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(out));
      console.log(`  진행 ${done}/${todo.length} (사진 ${ok})`);
    }
    await new Promise((r) => setTimeout(r, 300)); // npb.jp burst 회피
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`[npb-photo] 완료 → ${Object.keys(out).length}명 사진 URL 저장 (${OUT})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
