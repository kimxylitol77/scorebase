// WKBL 등록 선수 사전 빌드 — wkbl.or.kr 선수 목록 + 상세(프로필) → data/wkbl-players.json (86명, 300ms 간격 → 30초)
// 팀명 → 우리 Team.id 는 basketball-standings WKBL_TEAM_IDS(정규식). 사진은 사이트 정적 경로.
//   실행: npx tsx --env-file=.env.local scripts/build-wkbl-players.ts   (weekly-static-refresh ⑪-d)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchWkblRegisteredPlayers, fetchWkblPlayerDetail, wkblPhotoUrl } from "../src/lib/sports/wkbl-api";
import { WKBL_TEAM_IDS } from "../src/lib/sports/basketball-standings";

const OUT = "data/wkbl-players.json";
export interface WkblPlayerEntry {
  name: string; ename: string;
  team: string; // 목록의 짧은 팀명 ("우리은행")
  teamFull: string | null; // 상세의 정식명 ("우리은행 우리WON")
  teamId: number | null;
  no: number | null; pos: string | null; height: number | null;
  birth: string | null; school: string | null; draft: string | null;
  photo: string;
}
interface OutFile { meta: { updatedAt: string; players: number }; players: Record<string, WkblPlayerEntry> }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const outPath = resolve(OUT);
  let existing: Record<string, WkblPlayerEntry> = {};
  if (existsSync(outPath)) { try { existing = (JSON.parse(readFileSync(outPath, "utf8")) as OutFile).players ?? {}; } catch { existing = {}; } }
  const list = await fetchWkblRegisteredPlayers();
  if (list.length < 40) throw new Error(`등록 선수 ${list.length}명 — 비정상 응답, 기존 파일 유지`);
  console.log(`▶ 등록 선수 ${list.length}명 · 기존 ${Object.keys(existing).length}명`);
  const players: Record<string, WkblPlayerEntry> = {};
  let fetched = 0, miss = 0;
  for (const p of list) {
    const prev = existing[p.pno];
    let d = prev ? { no: prev.no, pos: prev.pos, height: prev.height, birth: prev.birth, school: prev.school, draft: prev.draft, teamFull: prev.teamFull } : null;
    // 프로필은 매 실행 재조회(팀 이적·등번호 변경 반영). 실패 시 기존 값 유지.
    const det = await fetchWkblPlayerDetail(p.pno);
    await sleep(300);
    if (det) { fetched++; d = { no: det.no, pos: det.pos, height: det.height, birth: det.birth, school: det.school, draft: det.draft, teamFull: det.teamFull || null }; }
    else miss++;
    players[p.pno] = {
      name: p.name, ename: p.ename, team: p.team,
      teamFull: d?.teamFull ?? null,
      teamId: WKBL_TEAM_IDS.find(([re]) => re.test(p.team) || (d?.teamFull ? re.test(d.teamFull) : false))?.[1] ?? null,
      no: d?.no ?? null, pos: d?.pos ?? null, height: d?.height ?? null,
      birth: d?.birth ?? null, school: d?.school ?? null, draft: d?.draft ?? null,
      photo: wkblPhotoUrl(p.pno),
    };
  }
  const unmapped = [...new Set(Object.values(players).filter((x) => x.teamId == null).map((x) => x.team))];
  if (unmapped.length) console.warn(`! 팀 미매핑: ${unmapped.join(", ")}`);
  const out: OutFile = { meta: { updatedAt: new Date().toISOString(), players: Object.keys(players).length }, players };
  writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
  console.log(`✔ ${OUT} — ${out.meta.players}명 (상세 ${fetched}, 실패 ${miss}, 생년월일 ${Object.values(players).filter((x) => x.birth).length})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
