// 월드컵 12조 통합 베스트11 빌드 → data/world-cup-xi/{A..L}.json
// TheSports 친선+월드컵 본선 라인업 → 국가별 선수·포지션·평점 → 조별 4-2-3-1 베스트11.
// IP 화이트리스트 필요 → worker/mac-mini cron 에서 실행 (Vercel 동적 IP 불가).
import { thesportsGet } from "../src/lib/sports/thesports/client";
import { WORLD_CUP_GROUPS } from "../src/lib/predict/world-cup-elos";
import { PrismaClient } from "@prisma/client";
import rawOv from "../data/player-overrides.json";
import * as fs from "fs";

const INTL = "jednm9whk0ryox8"; // INTL_FRIENDLY competition_id
const WC = "kp3glrw7hwqdyjv"; // FIFA World Cup competition_id (2026-06-12 KST diary 개막전 멕시코-남아공 실측)
const COMPS = new Set([INTL, WC]);
const p = new PrismaClient();
const OV = rawOv as Record<string, { nameKo?: string }>;

const ISO2: Record<string, string> = {
  Mexico: "MX", "South Africa": "ZA", "South Korea": "KR", "Czech Republic": "CZ", Czechia: "CZ",
  Canada: "CA", "Bosnia & Herzegovina": "BA", Qatar: "QA", Switzerland: "CH",
  Brazil: "BR", Morocco: "MA", Haiti: "HT", Scotland: "GB-SCT",
  USA: "US", Paraguay: "PY", Australia: "AU", "Türkiye": "TR",
  Germany: "DE", "Curaçao": "CW", "Ivory Coast": "CI", Ecuador: "EC",
  Netherlands: "NL", Japan: "JP", Sweden: "SE", Tunisia: "TN",
  Belgium: "BE", Egypt: "EG", Iran: "IR", "New Zealand": "NZ",
  Spain: "ES", "Cape Verde Islands": "CV", "Saudi Arabia": "SA", Uruguay: "UY",
  France: "FR", Senegal: "SN", Iraq: "IQ", Norway: "NO",
  Argentina: "AR", Algeria: "DZ", Austria: "AT", Jordan: "JO",
  Portugal: "PT", Colombia: "CO", Uzbekistan: "UZ", "Congo DR": "CD",
  England: "GB-ENG", Croatia: "HR", Ghana: "GH", Panama: "PA",
};
const flagOf = (c: string) => {
  const iso = ISO2[c];
  if (!iso) return "🏳️";
  if (iso === "GB-SCT") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
  if (iso === "GB-ENG") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  return String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};

// 한글명 — A조·한국·주요 스타 (전체는 build-football-player-names-haiku AI 음역으로 확장 예정)
const KO: Record<string, string> = {
  "Raúl Jiménez": "라울 히메네스", "Patrik Schick": "파트릭 시크", "Santiago Giménez": "산티아고 히메네스",
  "Brian Gutierrez": "브라이언 구티에레스", "Pavel Šulc": "파벨 슐츠", "Ladislav Krejčí": "라디슬라프 크레이치",
  "Johan Vásquez": "요한 바스케스", "Matěj Kovář": "마테이 코바르", "Roberto Alvarado": "로베르토 알바라도",
  "Edson Álvarez": "에드손 알바레스", "Álvaro Fidalgo": "알바로 피달고", "Guillermo Ochoa": "기예르모 오초아",
  "Tomáš Souček": "토마시 소우체크", "Vladimír Coufal": "블라디미르 초우팔", "Adam Hložek": "아담 흘로제크",
  "Lee Dong-gyeong": "이동경", "Kim Min-Jae": "김민재", "Lee Gi-Hyuk": "이기혁", "Son Heung-min": "손흥민",
  "Lee Kang-In": "이강인", "Hwang In-Beom": "황인범", "Cho Gue-sung": "조규성", "Kim Seung-Gyu": "김승규",
  "Jo Hyeon-woo": "조현우", "Oh Hyeon-gyu": "오현규", "Hwang Hee-chan": "황희찬", "Lee Jae-Sung": "이재성",
  "Lee Han-beom": "이한범", "Paik Seung-Ho": "백승호", "Seol Young-woo": "설영우", "Kim Moon-Hwan": "김문환",
  "Lionel Messi": "리오넬 메시", "Kylian Mbappé": "킬리안 음바페", "Cristiano Ronaldo": "크리스티아누 호날두",
  "Harry Kane": "해리 케인", "Jude Bellingham": "주드 벨링엄", "Vinicius Junior": "비니시우스 주니오르",
  "Lamine Yamal": "라민 야말", "Erling Haaland": "엘링 홀란", "Virgil van Dijk": "버질 반 다이크",
};
const isWomenOrYouth = (n: string) => /women|\(w\)|girls|U1[5-9]|U2[0-3]/i.test(n);
const norm = (s: string) => s.toLowerCase().replace(/[\s.&·-]/g, "");

interface Pl { id: string; name: string; pos: string; rating: number; logo: string | null; ratings: { d: string; r: number }[] }

async function main() {
  const byCountry: Record<string, Map<string, Pl>> = {};
  const normToCountry = new Map(Object.values(WORLD_CUP_GROUPS).flat().map((c) => [norm(c), c]));
  let calls = 0;

  // 수집 범위: 2026-06-01(6월 친선 시작) ~ 오늘 KST, 상한 2026-07-21(결승 7/19 = KST 7/20 +버퍼).
  // 시작을 고정하는 이유: 조별 베스트11은 탈락국도 포함해야 하므로 롤링 윈도우를 쓰면
  // 대회 후반에 조별리그·탈락국 경기가 범위 밖으로 빠져 조 풀이 깨진다.
  // 상한은 대회 종료 후 친선 평점이 recentRating 을 덮어쓰는 것을 막는다.
  const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const endDate = todayKst < "2026-07-21" ? todayKst : "2026-07-21";
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  for (let t = Date.parse("2026-06-01T00:00:00Z"); t <= endMs; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const tsp = Math.floor((new Date(`${date}T00:00:00Z`).getTime() - 9 * 3600000) / 1000);
    let diary: any;
    try { diary = await thesportsGet<any>("/v1/football/match/diary", { tsp }); } catch { continue; }
    const tm = new Map((diary.results_extra?.team ?? []).map((t: any) => [t.id, t.name]));
    for (const m of (diary.results ?? []).filter((x: any) => COMPS.has(x.competition_id))) {
      // 본선 진출국이 속한 side 만 수집 — 라인업은 매치당 1회 호출(양 side 동일 응답)
      const sides: ["home" | "away", string][] = [];
      for (const [side, tid] of [["home", m.home_team_id], ["away", m.away_team_id]] as const) {
        const tn = tm.get(tid) as string | undefined;
        if (!tn || isWomenOrYouth(tn)) continue;
        const country = normToCountry.get(norm(tn));
        if (country) sides.push([side, country]);
      }
      if (!sides.length) continue;
      let lu: any;
      try { lu = await thesportsGet<any>("/v1/football/match/lineup/detail", { uuid: m.id }); calls++; } catch { continue; }
      for (const [side, country] of sides) {
        byCountry[country] ??= new Map();
        for (const pl of (lu.results?.lineup?.[side] ?? [])) {
          const rating = parseFloat(pl.rating) || 0;
          const prev = byCountry[country].get(pl.id);
          const ratings = prev?.ratings ?? [];
          if (rating > 0) ratings.push({ d: date, r: rating });
          byCountry[country].set(pl.id, { id: pl.id, name: pl.name, pos: pl.position, rating: Math.max(prev?.rating ?? 0, rating), logo: pl.logo || prev?.logo || null, ratings });
        }
      }
    }
  }

  // 수집 0건 가드 — API 일시 장애 시 빈 데이터로 기존 파일을 덮어쓰지 않음 (2026-06-12 빈 커밋 사고)
  if (calls === 0 || Object.keys(byCountry).length === 0) {
    console.error(`수집 실패(lineup ${calls}회, 국가 ${Object.keys(byCountry).length}개) — 기존 데이터 유지, 파일 미작성`);
    process.exit(1);
  }

  const allIds = Object.values(byCountry).flatMap((m) => [...m.keys()]);
  const mv = await p.playerMarketValue.findMany({ where: { id: { in: allIds } }, select: { id: true, currentValue: true } });
  const valById = new Map(mv.map((m) => [m.id, m.currentValue ?? 0]));
  // 한글명 — TheSportsPlayer.nameKo (haiku/OpenAI 음역 백필분)
  const tspRows = await p.theSportsPlayer.findMany({ where: { id: { in: allIds }, nameKo: { not: null } }, select: { id: true, nameKo: true } });
  const tspKo = new Map(tspRows.map((t) => [t.id, t.nameKo!]));

  fs.mkdirSync("data/world-cup-xi", { recursive: true });
  const summary: { group: string; xi: number; pool: number }[] = [];
  for (const [group, countries] of Object.entries(WORLD_CUP_GROUPS)) {
    const pool: any[] = [];
    for (const country of countries) {
      const mp = byCountry[country];
      if (!mp) continue;
      for (const pl of mp.values()) {
        const v = valById.get(pl.id) ?? 0;
        const valuePart = v > 0 ? Math.min(9.5, 5.5 + Math.log10(v / 1e6 + 1) * 1.6) : 0;
        const score = pl.rating > 0 ? (valuePart > 0 ? pl.rating * 0.5 + valuePart * 0.5 : pl.rating) : (valuePart || 5.0);
        const valid = pl.ratings.filter((x) => x.r > 0).sort((a, b) => b.d.localeCompare(a.d));
        pool.push({
          id: pl.id, name: pl.name, nameKo: OV[pl.id]?.nameKo || KO[pl.name] || tspKo.get(pl.id) || pl.name,
          hasMv: (valById.get(pl.id) ?? 0) > 0, pos: pl.pos, country, flag: flagOf(country),
          logo: pl.logo, score: +score.toFixed(2), star: Math.max(1, Math.min(5, Math.floor(score / 2))),
          recentRating: valid[0]?.r ?? 0, avgRating: valid.length ? +(valid.reduce((s, x) => s + x.r, 0) / valid.length).toFixed(2) : 0, games: valid.length,
        });
      }
    }
    const pick = (pos: string, n: number) => pool.filter((x) => x.pos === pos).sort((a, b) => b.score - a.score).slice(0, n);
    // 4-2-3-1 (2026-06-10 사용자 확정, 기존 4-3-3) — 미드필더 5명 중 점수 상위 3명을
    // 공격형(AM) 라인, 하위 2명을 수비형(DM) 라인에 배치.
    const layout = [
      ...pick("G", 1).map((x) => ({ ...x, x: 50, y: 90 })),
      ...pick("D", 4).map((x, i) => ({ ...x, x: [16, 39, 61, 84][i], y: 70 })),
      ...pick("M", 5).map((x, i) => ({ ...x, x: [22, 50, 78, 35, 65][i], y: [32, 32, 32, 52, 52][i] })),
      ...pick("F", 1).map((x) => ({ ...x, x: 50, y: 14 })),
    ].filter((x) => x.name);
    const xiIds = new Set(layout.map((x) => x.id));
    const bench = pool.filter((x) => !xiIds.has(x.id)).sort((a, b) => b.score - a.score).slice(0, 6);
    const teamRating = layout.length ? +(layout.reduce((s, x) => s + x.star, 0) / layout.length).toFixed(1) : 0;
    const out = { group, countries: countries.map((c) => ({ name: c, flag: flagOf(c) })), teamRating, xi: layout, bench, complete: layout.length === 11 };
    fs.writeFileSync(`data/world-cup-xi/${group}.json`, JSON.stringify(out, null, 2));
    summary.push({ group, xi: layout.length, pool: pool.length });
  }
  fs.writeFileSync("data/world-cup-xi/_summary.json", JSON.stringify({ builtAt: null, groups: summary }, null, 2));
  console.log(`lineup 호출 ${calls}회`);
  console.log("조별:", summary.map((s) => `${s.group}:${s.xi}/11(${s.pool})`).join("  "));
}
main().then(() => p.$disconnect()).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
