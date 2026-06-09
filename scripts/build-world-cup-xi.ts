// 월드컵 12조 통합 베스트11 빌드 → data/world-cup-xi/{A..L}.json
// TheSports 친선(+추후 본선) 라인업 → 국가별 선수·포지션·평점 → 조별 4-3-3 베스트11.
// IP 화이트리스트 필요 → worker/mac-mini cron 에서 실행 (Vercel 동적 IP 불가).
import { thesportsGet } from "../src/lib/sports/thesports/client";
import { WORLD_CUP_GROUPS } from "../src/lib/predict/world-cup-elos";
import { PrismaClient } from "@prisma/client";
import rawOv from "../data/player-overrides.json";
import * as fs from "fs";

const INTL = "jednm9whk0ryox8"; // INTL_FRIENDLY competition_id
const p = new PrismaClient();
const OV = rawOv as Record<string, { nameKo?: string }>;

const ISO2: Record<string, string> = {
  Mexico: "MX", "South Africa": "ZA", "South Korea": "KR", "Czech Republic": "CZ",
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
const koName = (id: string, en: string) => OV[id]?.nameKo || KO[en] || en;
const isWomenOrYouth = (n: string) => /women|\(w\)|girls|U1[5-9]|U2[0-3]/i.test(n);
const norm = (s: string) => s.toLowerCase().replace(/[\s.&·-]/g, "");

interface Pl { id: string; name: string; pos: string; rating: number; logo: string | null; ratings: { d: string; r: number }[] }

async function main() {
  const byCountry: Record<string, Map<string, Pl>> = {};
  const normToCountry = new Map(Object.values(WORLD_CUP_GROUPS).flat().map((c) => [norm(c), c]));
  let calls = 0;

  for (let d = 1; d <= 12; d++) {
    const date = `2026-06-${String(d).padStart(2, "0")}`;
    const tsp = Math.floor((new Date(`${date}T00:00:00Z`).getTime() - 9 * 3600000) / 1000);
    let diary: any;
    try { diary = await thesportsGet<any>("/v1/football/match/diary", { tsp }); } catch { continue; }
    const tm = new Map((diary.results_extra?.team ?? []).map((t: any) => [t.id, t.name]));
    for (const m of (diary.results ?? []).filter((x: any) => x.competition_id === INTL)) {
      for (const [side, tid] of [["home", m.home_team_id], ["away", m.away_team_id]] as const) {
        const tn = tm.get(tid) as string | undefined;
        if (!tn || isWomenOrYouth(tn)) continue;
        const country = normToCountry.get(norm(tn));
        if (!country) continue; // 본선 진출국만
        try {
          const lu = await thesportsGet<any>("/v1/football/match/lineup/detail", { uuid: m.id });
          calls++;
          byCountry[country] ??= new Map();
          for (const pl of (lu.results?.lineup?.[side] ?? [])) {
            const rating = parseFloat(pl.rating) || 0;
            const prev = byCountry[country].get(pl.id);
            const ratings = prev?.ratings ?? [];
            if (rating > 0) ratings.push({ d: date, r: rating });
            byCountry[country].set(pl.id, { id: pl.id, name: pl.name, pos: pl.position, rating: Math.max(prev?.rating ?? 0, rating), logo: pl.logo || prev?.logo || null, ratings });
          }
        } catch { /* skip */ }
      }
    }
  }

  const allIds = Object.values(byCountry).flatMap((m) => [...m.keys()]);
  const mv = await p.playerMarketValue.findMany({ where: { id: { in: allIds } }, select: { id: true, currentValue: true } });
  const valById = new Map(mv.map((m) => [m.id, m.currentValue ?? 0]));

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
          id: pl.id, name: pl.name, nameKo: koName(pl.id, pl.name), pos: pl.pos, country, flag: flagOf(country),
          logo: pl.logo, score: +score.toFixed(2), star: Math.max(1, Math.min(5, Math.floor(score / 2))),
          recentRating: valid[0]?.r ?? 0, avgRating: valid.length ? +(valid.reduce((s, x) => s + x.r, 0) / valid.length).toFixed(2) : 0, games: valid.length,
        });
      }
    }
    const pick = (pos: string, n: number) => pool.filter((x) => x.pos === pos).sort((a, b) => b.score - a.score).slice(0, n);
    const layout = [
      ...pick("G", 1).map((x) => ({ ...x, x: 50, y: 90 })),
      ...pick("D", 4).map((x, i) => ({ ...x, x: [16, 39, 61, 84][i], y: 68 })),
      ...pick("M", 3).map((x, i) => ({ ...x, x: [28, 50, 72][i], y: 44 })),
      ...pick("F", 3).map((x, i) => ({ ...x, x: [26, 50, 74][i], y: 20 })),
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
main().then(() => p.$disconnect()).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(0); });
