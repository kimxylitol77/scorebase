// NHL 선수목록 빌드 — 32팀 로스터(NHL 공개 API)를 data/nhl-players.json 으로. 선수 비교 피커 검색용.
// 실행: (메인 repo) npx tsx <path>/scripts/build-nhl-players.ts  — 공개 API라 키 불필요.
import { fetchNhlRoster } from "@/lib/sports/nhl-api";
import { toKoreanPlayerName } from "@/lib/player-names";
import fs from "fs";
import path from "path";

const ABBRS = [
  "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ", "DAL", "DET", "EDM", "FLA",
  "LAK", "MIN", "MTL", "NSH", "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SJS", "SEA",
  "STL", "TBL", "TOR", "VAN", "VGK", "WSH", "WPG", "UTA",
];

async function main() {
  const now = new Date();
  // 6월=비시즌 → 직전 완료 시즌. fetchNhlRoster 가 빈 응답 시 한 시즌 더 전으로 fallback.
  const startYear = now.getUTCMonth() + 1 >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const season = `${startYear}${startYear + 1}`;

  const out: Record<string, { name: string; ko: string; pos: string; photo: string; team: string; group: string }> = {};

  for (const abbr of ABBRS) {
    try {
      const roster = await fetchNhlRoster(abbr, season);
      for (const p of roster) {
        out[String(p.id)] = {
          name: p.name,
          ko: toKoreanPlayerName(p.name) || p.name,
          pos: p.position,
          photo: p.headshot ?? "",
          team: abbr,
          group: p.group,
        };
      }
      console.log(`${abbr}: ${roster.length}`);
    } catch (e) {
      console.error(`${abbr} 실패:`, (e as Error).message);
    }
  }

  const outPath = path.resolve(__dirname, "../data/nhl-players.json");
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`\n총 ${Object.keys(out).length}명 → ${outPath}`);
}

main().then(() => process.exit(0));
