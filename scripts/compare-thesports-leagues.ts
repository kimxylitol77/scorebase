// v2 — 영문 keyword 기반 매칭 (한국어 표기 차이 무시)
import { readFileSync, writeFileSync } from "fs";
import { SPORTS, LEAGUE_DISPLAY } from "../src/lib/sports/sport-leagues";
import { API_FOOTBALL_LEAGUE_ID } from "../src/lib/sports/api-football-pro";

interface Mapping { id: string; en: string; ko: string }

const mapping: Mapping[] = JSON.parse(
  readFileSync("/Users/kimss/scorebase/data/thesports-translations/_competition-mapping.json", "utf-8"),
);

// 우리 리그 코드 → 핵심 영문 keyword (TheSports en 에서 찾을 단어)
const LEAGUE_EN_KEYWORDS: Record<string, RegExp> = {
  EPL: /\bEnglish Premier League\b/i,
  LALIGA: /\bSpanish La Liga\b/i,
  LALIGA_2: /\b(Spanish.*LaLiga.*2|Segunda División|Spanish Second)\b/i,
  BUNDESLIGA: /\bGerman Bundesliga\b|\bBundesliga 1\b|^Bundesliga$/i,
  BUNDESLIGA_2: /\b(2\. Bundesliga|Bundesliga 2|German 2)\b/i,
  SERIE_A: /\bItalian Serie A\b|^Serie A$/i,
  SERIE_B: /\bItalian Serie B\b|^Serie B$/i,
  LIGUE_1: /\bFrench Ligue 1\b/i,
  LIGUE_2: /\bFrench Ligue 2\b|\bLigue 2 BKT\b/i,
  CHAMPIONSHIP: /\b(English Football League Championship|EFL Championship|Championship\b)/i,
  MLS: /\bMajor League Soccer\b/i,
  UCL: /\bUEFA Champions League\b/i,
  UEL: /\bUEFA Europa League\b/i,
  UECL: /\bUEFA Europa Conference League\b/i,
  WORLD_CUP: /^FIFA World Cup$/i,
  CLUB_WORLD_CUP: /\bFIFA Club World Cup\b/i,
  K_LEAGUE_1: /\bKorean K League 1\b/i,
  K_LEAGUE_2: /\bKorean K League 2\b/i,
  J1_LEAGUE: /\bJapanese J1 League\b|\bJ. League Division 1\b/i,
  J2_LEAGUE: /\bJapanese J2 League\b|\bJ. League Division 2\b/i,
  AFC_CL: /\b(AFC Champions League Elite|AFC Champions League)\b/i,
  AFC_CL_TWO: /\bAFC Champions League Two\b/i,
  AFC_U23: /\bAFC U23 Asian Cup\b|\bAFC U-23 Championship\b/i,
  SAUDI_PL: /\bSaudi Professional League\b/i,
  CSL: /\bChinese Football Super League\b/i,
  A_LEAGUE: /\bAustralian A-League\b/i,
  EREDIVISIE: /\bDutch Eredivisie\b/i,
  PRIMEIRA_LIGA: /\bPortuguese Primeira Liga\b/i,
  SUPER_LIG: /\bTurkish Super League\b/i,
  JUPILER_PL: /\bBelgian Pro League\b|\bJupiler Pro League\b/i,
  SPL: /\bScottish Premiership\b/i,
  GREEK_SL: /\bGreek Super League\b/i,
  EKSTRAKLASA: /\bPolish.*Ekstraklasa\b|\bPKO.*Ekstraklasa\b/i,
  POLAND_1L: /\bPoland Liga 1\b|\bPolish.*Liga 1\b/i,
  BULGARIA_PL: /\bBulgarian First League\b/i,
  LIGA_I: /\bRomanian Super Liga\b|\bRomanian Liga 1\b/i,
  SWISS_SL: /\bSwiss Super League\b/i,
  CHALLENGE_LEAGUE: /\bSwiss Challenge League\b/i,
  ARMENIA_PL: /\bArmenian Premier League\b/i,
  AUSTRIA_BL: /\bAustrian Bundesliga\b/i,
  CZECH_L: /\bCzech.*Chance Liga\b|\bCzech First League\b/i,
  HNL: /\bCroatian HNL\b|\bCroatian First Football League\b/i,
  UKRAINE_PL: /\bUkrainian Premier League\b/i,
  HUNGARY_NB1: /\bHungary Fizz Liga\b|\bHungarian NB I\b/i,
  SERBIA_SL: /\bSerbian Mozzart Bet Superliga\b|\bSerbian Super League\b/i,
  SLOVAKIA_SL: /\bSlovak Super Liga\b|\bSlovak Niké Liga\b/i,
  SLOVENIA_SNL: /\bSlovenian.*PrvaLiga\b|\bSlovenian Prva\b/i,
  CYPRUS_1D: /\bCypriot First Division\b/i,
  DENMARK_SL: /\bDanish Superliga\b/i,
  IRELAND_PD: /\bIreland.*Premier Division\b|\bLeague of Ireland\b/i,
  BOSNIA_PL: /\bBosnia and Herzegovina Premier League\b/i,
  ALBANIA_SL: /\bAlbanian Super league\b/i,
  MOLDOVA_SL: /\bMoldovan Super Liga\b/i,
  ELITESERIEN: /\bNorwegian Eliteserien\b/i,
  NORWAY_1L: /\bNorwegian 1\.?\s?Divisjon\b/i,
  ALLSVENSKAN: /\bSweden Allsvenskan\b/i,
  SUPERETTAN: /\bSweden Superettan\b/i,
  VEIKKAUSLIIGA: /\bFinnish Veikkausliiga\b/i,
  YKKONEN: /\bFinnish Ykkos?liiga\b|\bFinnish Ykkonen\b/i,
  URVALSDEILD: /\bIceland.*Besta-deild karla\b/i,
  ICELAND_1L: /\bIceland 1\. Deild Karla\b/i,
  LIGA_MX: /\bMexican Primera División\b|\bLiga MX\b/i,
  BRASILEIRAO: /\bBrazilian Série A\b|\bCampeonato Brasileiro Série A\b/i,
  COPA_LIB: /\bCopa Libertadores\b/i,
  COPA_SUD: /\bCopa Sudamericana\b/i,
  CHILE_PD: /\bCHI Liga de Primera\b|\bChilean Primera División\b/i,
  CHILE_PB: /\bCHI Liga de Ascenso\b|\bChilean Primera B\b/i,
  ECUADOR_LP: /\bLigaPro Serie A\b|\bEcuadorian Serie A\b/i,
  COLOMBIA_PA: /\bCategoría Primera A\b|\bColombia.*Primera A\b/i,
  PERU_PD: /\bPeruvian Liga 1\b/i,
  VENEZUELA_PD: /\bVenezuela Primera Division\b/i,
  EGYPT_PL: /\bEgyptian Premier League\b/i,
  ISRAEL_PL: /\bIsrael Premier League\b/i,
  INDIA_ISL: /\bIndian Super League\b/i,
  VIETNAM_VL1: /\bVietnamese V\.?League 1\b/i,
  INDONESIA_L1: /\bIndonesian Liga 1\b/i,
  SINGAPORE_PL: /\bSingapore Premier League\b/i,
  UAE_PL: /\bUAE Pro League\b|\bArabian Gulf League\b/i,
  QATAR_SL: /\bQatari Stars League\b/i,
  MOROCCO_BP: /\bBotola Pro\b/i,
  SOUTHAFRICA_PSL: /\b(South African Premier|Betway Premiership)\b/i,
  USA_USL_CH: /\bUSL Championship\b/i,
  CANADA_PL: /\bCanadian Premier League\b/i,
};

const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;

const matched: Array<{ code: string; ourLabel: string; tsId: string; tsEn: string; tsKo: string }> = [];
const unmatched: Array<{ code: string; ourLabel: string }> = [];

for (const code of soccerLeagues) {
  const ourLabel = LEAGUE_DISPLAY[code] ?? code;
  const re = LEAGUE_EN_KEYWORDS[code];
  if (!re) {
    unmatched.push({ code, ourLabel });
    continue;
  }
  const m = mapping.find((x) => re.test(x.en));
  if (m) {
    matched.push({ code, ourLabel, tsId: m.id, tsEn: m.en, tsKo: m.ko });
  } else {
    unmatched.push({ code, ourLabel });
  }
}

console.log(`우리 운영 축구 리그: ${soccerLeagues.length}개`);
console.log(`TheSports competition (영문): ${mapping.length}개\n`);
console.log(`✅ TheSports 에서 받을 수 있음: ${matched.length}/${soccerLeagues.length}`);
console.log(`❌ 못 받음 또는 keyword 미정의: ${unmatched.length}\n`);

if (unmatched.length > 0) {
  console.log("--- 미매칭 우리 리그 ---");
  for (const u of unmatched) console.log(`  ${u.code} (${u.ourLabel})`);
}

console.log("\n--- 매칭된 리그 (한국어) ---");
const byCode = matched.sort((a, b) => a.code.localeCompare(b.code));
for (const m of byCode) {
  console.log(`  ${m.code.padEnd(20)} → ${m.tsKo.padEnd(25)} | ts_id=${m.tsId}`);
}

writeFileSync(
  "/Users/kimss/scorebase/data/thesports-translations/_our-leagues-thesports-ids.json",
  JSON.stringify(matched, null, 2),
);
console.log(`\n저장: data/thesports-translations/_our-leagues-thesports-ids.json (${matched.length}개)`);

// API_FOOTBALL_LEAGUE_ID 와 비교 - 우리는 어떤 리그 운영 중인지 추가 검증
console.log("\n--- API_FOOTBALL_LEAGUE_ID 정의 vs SPORTS.soccer.leagues 정합성 ---");
const apf = Object.keys(API_FOOTBALL_LEAGUE_ID);
const inOursOnly = soccerLeagues.filter((l) => !apf.includes(l));
const inApfOnly = apf.filter((l) => !soccerLeagues.includes(l) && !["KBO", "NPB", "MLB", "NBA", "NHL", "LOL"].includes(l));
console.log(`SPORTS.soccer 만 있음 (API id 없음): ${inOursOnly.length}`);
for (const l of inOursOnly) console.log(`  ${l}`);
console.log(`API_FOOTBALL_LEAGUE_ID 에만 있음: ${inApfOnly.length}`);
for (const l of inApfOnly) console.log(`  ${l}`);
