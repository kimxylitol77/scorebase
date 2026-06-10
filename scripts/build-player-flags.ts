// /transfers 피드 국기 보강 — OVERRIDES(Wikidata) 에 없는 선수의 국기를 ts season player/stat
// 의 country_id 로 수집해 data/player-overrides.json 에 { flag } 만 merge.
//
// country(텍스트) 는 ts 가 영문이라 추가하지 않음 — 한국어 국가 필터(countryOptions) 오염 방지.
// 기존 항목은 flag 없을 때만 채움(Wikidata 우선 유지). whitelisted IP 필요 — 로컬 실행.
//
//   npx tsx --env-file=.env.local scripts/build-player-flags.ts
import { thesportsGet } from "../src/lib/sports/thesports/client";
import rawCountries from "../src/lib/sports/thesports/country-list.json";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(__dirname, "..", "data", "player-overrides.json");

async function main() {
  // league-id-mapping 에서 시즌 id 로드
  const mapping: Array<{ code: string; tsSeasonId?: string }> = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "lib", "sports", "thesports", "league-id-mapping.json"), "utf8"),
  );
  const wanted = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "LIGUE_2", "ALLSVENSKAN", "AUSTRIA_BL", "BRASILEIRAO", "ARGENTINA_PL", "SERBIA_SL", "KAZAKHSTAN_PL", "SWISS_SL"];
  const seasons = wanted
    .map((code) => ({ code, sid: mapping.find((m) => m.code === code)?.tsSeasonId }))
    .filter((s): s is { code: string; sid: string } => !!s.sid);

  // ts country id → 국기 URL
  const countries = (rawCountries as { results: Array<{ id: string; name: string; logo?: string }> }).results || [];
  const countryLogo = new Map(countries.filter((c) => c.logo).map((c) => [c.id, c.logo!]));

  // 시즌 순회 — player.id → country_id 수집 (먼저 잡힌 시즌 우선)
  const playerFlag = new Map<string, string>();
  for (const { code, sid } of seasons) {
    try {
      const res = await thesportsGet<{ code: number; results: Array<{ player?: { id: string; country_id?: string } }> }>(
        "/v1/football/season/recent/player/stat",
        { uuid: sid },
      );
      let got = 0;
      for (const r of res.results || []) {
        const pid = r.player?.id, cid = r.player?.country_id;
        if (!pid || !cid || playerFlag.has(pid)) continue;
        const logo = countryLogo.get(cid);
        if (logo) { playerFlag.set(pid, logo); got++; }
      }
      console.log(`📋 ${code}: +${got} (누적 ${playerFlag.size})`);
    } catch (e) {
      console.log(`❌ ${code} (${sid}) — ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  // overrides 에 merge — flag 없는 항목만
  const overrides: Record<string, { nameKo?: string; country?: string; flag?: string }> = JSON.parse(fs.readFileSync(OUT, "utf8"));
  let added = 0, filled = 0;
  for (const [pid, flag] of playerFlag) {
    const cur = overrides[pid];
    if (!cur) { overrides[pid] = { flag }; added++; }
    else if (!cur.flag) { cur.flag = flag; filled++; }
  }
  fs.writeFileSync(OUT, JSON.stringify(overrides));
  console.log(`신규 항목 ${added} / 기존 flag 보충 ${filled} → overrides 총 ${Object.keys(overrides).length}`);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
