// /transfers 피드 국기·국적 보강 — OVERRIDES(Wikidata) 에 없는 선수의 국기·국적(한국어)을
// ts season player/stat 의 country_id 로 수집해 data/player-overrides.json 에 merge.
//
// country 텍스트는 **한국어로 변환된 경우만** 추가 (fifaCountryKo + ts 표기 별칭) —
// 영문 그대로 넣으면 한국어 국가 필터(countryOptions) 오염되므로 변환 실패 시 flag 만.
// 기존 항목은 비어있을 때만 채움(Wikidata 우선 유지). whitelisted IP 필요 — 로컬 실행.
//
//   npx tsx --env-file=.env.local scripts/build-player-flags.ts
import { thesportsGet } from "../src/lib/sports/thesports/client";
import rawCountries from "../src/lib/sports/thesports/country-list.json";
import { fifaCountryKo } from "../src/lib/sports/fifa-rankings";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(__dirname, "..", "data", "player-overrides.json");

// ts country-list 영문명 ↔ FIFA canonical 표기 차이 보정 + FIFA 비회원 통칭
const TS_COUNTRY_KO: Record<string, string> = {
  "South Korea": "대한민국",
  "North Korea": "북한",
  "United States": "미국",
  "Iran": "이란",
  "Czech Republic": "체코",
  "Ivory Coast": "코트디부아르",
  "Cote d'Ivoire": "코트디부아르",
  "Cape Verde": "카보베르데",
  "DR Congo": "DR 콩고",
  "Congo DR": "DR 콩고",
  "Republic of Ireland": "아일랜드",
  "Bosnia and Herzegovina": "보스니아 헤르체고비나",
  "Trinidad and Tobago": "트리니다드 토바고",
  "United Arab Emirates": "아랍에미리트",
  "China": "중국",
  "China PR": "중국",
  "Chinese Taipei": "대만",
  "Taiwan": "대만",
  "Russia": "러시아",
  "Turkey": "튀르키예",
  "Türkiye": "튀르키예",
  "Guinea-Bissau": "기니비사우",
  "St. Kitts and Nevis": "세인트키츠 네비스",
  "Curacao": "퀴라소",
  "Curaçao": "퀴라소",
  "Kosovo": "코소보",
  "Democratic Republic of the Congo": "DR 콩고",
  "Burkina Faso": "부르키나파소",
  "Ireland": "아일랜드",
  "Haiti": "아이티",
  "Gambia": "감비아",
  "Suriname": "수리남",
  "Togo": "토고",
  "Comoros": "코모로",
  "Mauritania": "모리타니",
  "Gabon": "가봉",
  "Congo": "콩고",
  "Central African Republic": "중앙아프리카 공화국",
  "Benin": "베냉",
  "Madagascar": "마다가스카르",
  "Kenya": "케냐",
};

function countryKo(en: string): string | null {
  return TS_COUNTRY_KO[en] ?? fifaCountryKo(en);
}

async function main() {
  // league-id-mapping 에서 시즌 id 로드
  const mapping: Array<{ code: string; tsSeasonId?: string }> = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "lib", "sports", "thesports", "league-id-mapping.json"), "utf8"),
  );
  const wanted = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "LIGUE_2", "ALLSVENSKAN", "AUSTRIA_BL", "BRASILEIRAO", "ARGENTINA_PL", "SERBIA_SL", "KAZAKHSTAN_PL", "SWISS_SL", "K_LEAGUE_1", "SAUDI_PL", "MLS"];
  const seasons = wanted
    .map((code) => ({ code, sid: mapping.find((m) => m.code === code)?.tsSeasonId }))
    .filter((s): s is { code: string; sid: string } => !!s.sid);

  // ts country id → { 국기 URL, 한국어 국가명 }
  const countries = (rawCountries as { results: Array<{ id: string; name: string; logo?: string }> }).results || [];
  const countryInfo = new Map(countries.map((c) => [c.id, { logo: c.logo || null, ko: countryKo(c.name), en: c.name }]));

  // 시즌 순회 — player.id → country 수집 (먼저 잡힌 시즌 우선)
  const playerCountry = new Map<string, { flag: string | null; ko: string | null }>();
  const unresolved = new Map<string, number>(); // 한국어 변환 실패 영문명 → 빈도 (로그용)
  for (const { code, sid } of seasons) {
    try {
      const res = await thesportsGet<{ code: number; results: Array<{ player?: { id: string; country_id?: string } }> }>(
        "/v1/football/season/recent/player/stat",
        { uuid: sid },
      );
      let got = 0;
      for (const r of res.results || []) {
        const pid = r.player?.id, cid = r.player?.country_id;
        if (!pid || !cid || playerCountry.has(pid)) continue;
        const info = countryInfo.get(cid);
        if (!info || (!info.logo && !info.ko)) continue;
        if (!info.ko) unresolved.set(info.en, (unresolved.get(info.en) || 0) + 1);
        playerCountry.set(pid, { flag: info.logo, ko: info.ko });
        got++;
      }
      console.log(`📋 ${code}: +${got} (누적 ${playerCountry.size})`);
    } catch (e) {
      console.log(`❌ ${code} (${sid}) — ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  if (unresolved.size) {
    console.log("⚠ 한국어 변환 실패 (flag 만 기록):", [...unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
  }

  // overrides 에 merge — 비어있는 필드만 (Wikidata 우선 유지)
  const overrides: Record<string, { nameKo?: string; country?: string; flag?: string }> = JSON.parse(fs.readFileSync(OUT, "utf8"));
  let added = 0, flagFilled = 0, countryFilled = 0;
  for (const [pid, { flag, ko }] of playerCountry) {
    const cur = overrides[pid];
    if (!cur) {
      overrides[pid] = { ...(flag ? { flag } : {}), ...(ko ? { country: ko } : {}) };
      added++;
    } else {
      if (!cur.flag && flag) { cur.flag = flag; flagFilled++; }
      if (!cur.country && ko) { cur.country = ko; countryFilled++; }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(overrides));
  console.log(`신규 ${added} / flag 보충 ${flagFilled} / country 보충 ${countryFilled} → overrides 총 ${Object.keys(overrides).length}`);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
