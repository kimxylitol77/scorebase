// V-리그(KOVO) 현역 선수 사전 빌드 — user-api 팀 로스터 15팀 + 선수 프로필 → data/kovo-players.json
//   남 7팀·여 8팀(2026-27 SOOP 포함). 선수당 프로필 1콜(키·몸무게·학교), 150ms 간격 → 1분.
//   실행: npx tsx --env-file=.env.local scripts/build-kovo-players.ts   (weekly-static-refresh ⑪-e)
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchKovoTeamPlayers, fetchKovoPlayer, fetchKovoPlayerHistory, KOVO_TEAMS } from "../src/lib/sports/kovo-api";

const OUT = "data/kovo-players.json";
export interface KovoPlayerEntry {
  name: string; league: "V_LEAGUE" | "V_LEAGUE_W"; teamCode: string; teamId: number; team: string;
  no: number | null; pos: string; birth: string | null; height: number | null; weight: number | null;
  school: string | null; photo: string | null; foreign: boolean; history: string[];
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const players: Record<string, KovoPlayerEntry> = {};
  for (const [tcode, t] of Object.entries(KOVO_TEAMS)) {
    const roster = await fetchKovoTeamPlayers(tcode);
    await sleep(150);
    let n = 0;
    for (const p of roster) {
      const [prof, hist] = await Promise.all([fetchKovoPlayer(p.playerCode), fetchKovoPlayerHistory(p.playerCode)]);
      await sleep(150);
      const st = p.status ?? [];
      players[p.playerCode] = {
        name: p.name, league: t.league, teamCode: tcode, teamId: t.teamId, team: t.short,
        no: p.backNumber ?? null, pos: p.position,
        birth: p.birthDate ?? null,
        height: prof?.height ?? p.height ?? null, weight: prof?.weight ?? p.weight ?? null,
        school: prof?.school ?? null, photo: prof?.image ?? p.image ?? null,
        foreign: st.includes("FOREIGNER") || st.includes("ASIS_QUARTER"),
        history: hist,
      };
      n++;
    }
    console.log(`  ${t.short}: ${n}명`);
  }
  const total = Object.keys(players).length;
  if (total < 150) throw new Error(`선수 ${total}명 — 비정상 응답`);
  writeFileSync(resolve(OUT), JSON.stringify({ meta: { updatedAt: new Date().toISOString(), players: total }, players }, null, 1) + "\n");
  console.log(`✔ ${OUT} — ${total}명 (키 ${Object.values(players).filter((p) => p.height).length}, 사진 ${Object.values(players).filter((p) => p.photo).length})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
