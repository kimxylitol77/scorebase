// KBL 등록 선수 사전 빌드 — kbl-api.sports2i.com 선수 목록 + 프로필 → data/kbl-players.json
//   목록(170명): playerNo·이름·팀코드·등번호·포지션·키·몸무게·드래프트
//   프로필: 생년월일·국적·학교 (선수당 1콜, 200ms 간격 → 1분)
//   팀코드 → 우리 Team.id 는 basketball-standings KBL_TEAM_IDS.
// 소비처: 팀 페이지 로스터 · 선수 페이지 헤더/메타 · 리더보드 사진. 주간 갱신(weekly-static-refresh).
//   실행: npx tsx --env-file=.env.local scripts/build-kbl-players.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchKblRegisteredPlayers, fetchKblPlayerProfile, fetchKblRecentSeason, fetchKblTeamNames, kblPlayerPhotoUrl } from "../src/lib/sports/kbl-api";
import { KBL_TEAM_IDS } from "../src/lib/sports/basketball-standings";

const OUT = "data/kbl-players.json";

export interface KblPlayerEntry {
  name: string;
  ename: string;
  teamCode: string;
  teamId: number | null;
  team: string | null; // 공식 한글 팀명 (Common/team, 예 "원주 DB")
  no: number | null;
  pos: string; // GD / FD / C
  height: number | null;
  weight: number | null;
  draft: string | null; // "2016 1R 3순위"
  birth: string | null; // YYYY-MM-DD
  country: string | null;
  school: string | null;
  photo: string;
}
interface OutFile {
  meta: { updatedAt: string; players: number };
  players: Record<string, KblPlayerEntry>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const outPath = resolve(OUT);
  let existing: Record<string, KblPlayerEntry> = {};
  if (existsSync(outPath)) {
    try { existing = (JSON.parse(readFileSync(outPath, "utf8")) as OutFile).players ?? {}; } catch { existing = {}; }
  }
  const recent = await fetchKblRecentSeason();
  const teamNames = recent ? await fetchKblTeamNames(recent.seasonCode) : new Map<string, string>();
  const list = await fetchKblRegisteredPlayers();
  if (list.length < 100) throw new Error(`등록 선수 ${list.length}명 — 비정상 응답, 기존 파일 유지`);
  console.log(`▶ 등록 선수 ${list.length}명 · 기존 ${Object.keys(existing).length}명`);

  const players: Record<string, KblPlayerEntry> = {};
  let fetched = 0;
  for (const p of list) {
    const id = String(p.playerNo);
    const prev = existing[id];
    let birth = prev?.birth ?? null, country = prev?.country ?? null, school = prev?.school ?? null;
    if (!prev?.birth) {
      const { info } = await fetchKblPlayerProfile(id, 0);
      await sleep(200);
      fetched++;
      if (info) {
        birth = info.birthday && /^\d{8}$/.test(info.birthday) ? `${info.birthday.slice(0, 4)}-${info.birthday.slice(4, 6)}-${info.birthday.slice(6, 8)}` : null;
        country = info.country || null;
        school = info.univSch && info.univSch !== "0" ? info.univSch : null;
      }
    }
    const draft = p.yearNo?.trim()
      ? `${p.yearNo.trim()} ${p.roundNo?.trim() ? `${p.roundNo.trim()}R ` : ""}${p.rankNo?.trim() ? `${p.rankNo.trim()}순위` : ""}`.trim()
      : null;
    players[id] = {
      name: p.kname,
      ename: p.ename,
      teamCode: p.teamCode,
      teamId: KBL_TEAM_IDS[p.teamCode] ?? null,
      team: teamNames.get(p.teamCode) ?? null,
      no: p.backNum?.trim() ? Number(p.backNum) : null,
      pos: p.pos,
      height: p.pHeight || null,
      weight: p.pWeight || null,
      draft,
      birth, country, school,
      photo: kblPlayerPhotoUrl(id),
    };
  }
  const unmappedTeams = [...new Set(Object.values(players).filter((p) => p.teamId == null).map((p) => p.teamCode))];
  if (unmappedTeams.length) console.warn(`! 팀코드 미매핑: ${unmappedTeams.join(", ")} (KBL_TEAM_IDS 갱신 필요)`);
  const out: OutFile = { meta: { updatedAt: new Date().toISOString(), players: Object.keys(players).length }, players };
  writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
  console.log(`✔ ${OUT} — ${out.meta.players}명 (프로필 신규 ${fetched}, 생년월일 ${Object.values(players).filter((p) => p.birth).length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
