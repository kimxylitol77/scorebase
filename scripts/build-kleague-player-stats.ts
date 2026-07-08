// K리그 선수 시즌 스탯 백필 — TheSports season player stat(1콜/리그)로 player-season-stats.json·player-photos.json 병합.
//   배경: /transfers/{tsPlayerId} 선수 페이지는 TheSportsPlayer(이미 356명 전원 존재·한글명 보유)로 렌더되지만,
//         시즌 스탯 JSON엔 K리그가 8명뿐이라 대부분 페이지가 스탯 없이 비어 보였다. TheSports가 리그 전체
//         선수 스탯을 1콜로 주므로(K리그1 356명) 이를 받아 병합 → 카드 연계 SEO 콘텐츠의 데이터 기반 확보.
//   TheSports 1순위 원칙. 재실행 멱등(TheSports 결과가 기존 af 항목을 덮어씀 — 동일 시즌·더 완전).
//   실행: npx tsx --env-file=.env.local scripts/build-kleague-player-stats.ts
import "../src/lib/env";
import * as fs from "fs";
import { fetchFootballSeasonPlayerStat } from "../src/lib/sports/thesports/football-collector";

// league-id-mapping.json 의 tsSeasonId. 카드 대상은 K리그1(top). 필요 시 K_LEAGUE_2·J1_LEAGUE 추가.
const LEAGUES: { code: string; seasonId: string; season: string }[] = [
  { code: "K_LEAGUE_1", seasonId: "jw2r09hl4xprz84", season: "2026" },
];

// TheSports season player row → SeasonStat (data/player-season-stats.json 스키마).
// passes_accuracy 는 '정확한 패스 개수'(퍼센트 아님) → passes 로 나눠 백분율화.
function toSeasonStat(code: string, season: string, r: any) {
  const passes = r.passes ?? 0;
  const passAcc = passes > 0 ? Math.round((r.passes_accuracy / passes) * 100) : null;
  return {
    lg: code,
    season,
    team: r.team?.name ?? null,
    pos: r.player?.position ?? null,
    matches: r.matches ?? null,
    starts: r.first ?? null,
    goals: r.goals ?? null,
    assists: r.assists ?? null,
    minutes: r.minutes_played ?? null,
    shots: r.shots ?? null,
    sot: r.shots_on_target ?? null,
    keyPasses: r.key_passes ?? null,
    passAcc,
    tackles: r.tackles ?? null,
    interceptions: r.interceptions ?? null,
    yellow: r.yellow_cards ?? null,
    red: r.red_cards ?? null,
    saves: r.saves ?? 0,
    cleanSheets: null,
    conceded: null,
  };
}

async function main() {
  const stats: Record<string, any> = JSON.parse(fs.readFileSync("data/player-season-stats.json", "utf8"));
  const photos: Record<string, string> = JSON.parse(fs.readFileSync("data/player-photos.json", "utf8"));

  let statAdded = 0, statUpdated = 0, photoAdded = 0;
  for (const { code, seasonId, season } of LEAGUES) {
    const res: any = await fetchFootballSeasonPlayerStat(seasonId);
    const rows: any[] = res?.results ?? [];
    console.log(`${code}: TheSports ${rows.length}명`);
    for (const r of rows) {
      const pid = r.player?.id;
      if (!pid) continue;
      if (stats[pid]) statUpdated++; else statAdded++;
      stats[pid] = toSeasonStat(code, season, r);
      const logo = r.player?.logo;
      if (logo && !photos[pid]) { photos[pid] = logo; photoAdded++; }
    }
  }

  fs.writeFileSync("data/player-season-stats.json", JSON.stringify(stats, null, 0));
  fs.writeFileSync("data/player-photos.json", JSON.stringify(photos, null, 0));
  console.log(`시즌스탯: 신규 ${statAdded} + 갱신 ${statUpdated} → 총 ${Object.keys(stats).length}`);
  console.log(`사진: 신규 ${photoAdded} → 총 ${Object.keys(photos).length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
