// /world-cup/best-xi/[group] — 월드컵 조별 통합 베스트11 (4-3-3) + SEO 본문.
// 데이터: data/world-cup-xi/{group}.json (worker cron 이 build-world-cup-xi.ts 로 매일 갱신).
import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const GROUPS = "ABCDEFGHIJKL".split("");
const COUNTRY_KO: Record<string, string> = {
  Mexico: "멕시코", "South Africa": "남아공", "South Korea": "대한민국", "Czech Republic": "체코",
  Canada: "캐나다", "Bosnia & Herzegovina": "보스니아", Qatar: "카타르", Switzerland: "스위스",
  Brazil: "브라질", Morocco: "모로코", Haiti: "아이티", Scotland: "스코틀랜드",
  USA: "미국", Paraguay: "파라과이", Australia: "호주", "Türkiye": "튀르키예",
  Germany: "독일", "Curaçao": "퀴라소", "Ivory Coast": "코트디부아르", Ecuador: "에콰도르",
  Netherlands: "네덜란드", Japan: "일본", Sweden: "스웨덴", Tunisia: "튀니지",
  Belgium: "벨기에", Egypt: "이집트", Iran: "이란", "New Zealand": "뉴질랜드",
  Spain: "스페인", "Cape Verde Islands": "카보베르데", "Saudi Arabia": "사우디아라비아", Uruguay: "우루과이",
  France: "프랑스", Senegal: "세네갈", Iraq: "이라크", Norway: "노르웨이",
  Argentina: "아르헨티나", Algeria: "알제리", Austria: "오스트리아", Jordan: "요르단",
  Portugal: "포르투갈", Colombia: "콜롬비아", Uzbekistan: "우즈베키스탄", "Congo DR": "콩고민주공화국",
  England: "잉글랜드", Croatia: "크로아티아", Ghana: "가나", Panama: "파나마",
};

interface XIPlayer { name: string; nameKo?: string; pos: string; country: string; flag: string; star: number; score: number; recentRating?: number; logo: string | null; x: number; y: number }
interface GroupData { group: string; countries: { name: string; flag: string }[]; teamRating: number; xi: XIPlayer[]; bench: XIPlayer[]; complete: boolean }

function load(g: string): GroupData | null {
  const f = path.join(process.cwd(), "data/world-cup-xi", `${g}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as GroupData; } catch { return null; }
}
const koOf = (p: XIPlayer) => p.nameKo || p.name;
const ctyKo = (en: string) => COUNTRY_KO[en] || en;

export function generateStaticParams() { return GROUPS.map((group) => ({ group: group.toLowerCase() })); }

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }): Promise<Metadata> {
  const { group } = await params;
  const g = group.toUpperCase();
  const d = load(g);
  if (!d) return { title: "월드컵 조별 베스트11 | Scorebase" };
  const cs = d.countries.map((c) => ctyKo(c.name)).join("·");
  const stars = d.xi.slice(0, 3).map((p) => koOf(p)).join(", ");
  return {
    title: `2026 월드컵 ${g}조 통합 베스트11 — ${cs} | Scorebase`,
    description: `2026 북중미 월드컵 ${g}조(${cs}) 통합 베스트 11. TheSports 경기 평점·시장가치 기반 4-3-3. ${stars} 등 ${g}조 최고의 11인 — 순위·평점 매일 갱신.`,
    keywords: ["2026 월드컵", `월드컵 ${g}조`, "통합 베스트11", "베스트XI", ...d.countries.map((c) => ctyKo(c.name) + " 대표팀"), "스코어베이스"],
    alternates: { canonical: `/world-cup/best-xi/${group.toLowerCase()}` },
  };
}

export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const g = group.toUpperCase();
  if (!GROUPS.includes(g)) notFound();
  const d = load(g);
  if (!d) notFound();
  const { countries, teamRating, xi, bench } = d;

  const fw = xi.filter((p) => p.pos === "F");
  const mf = xi.filter((p) => p.pos === "M");
  const df = xi.filter((p) => p.pos === "D");
  const gk = xi.filter((p) => p.pos === "G");
  const names = (arr: XIPlayer[]) => arr.map(koOf).join(", ");
  const top = [...xi].sort((a, b) => b.score - a.score)[0];
  const kr = xi.filter((p) => p.country === "South Korea");
  const csKo = countries.map((c) => ctyKo(c.name));

  return (
    <div className="min-h-screen bg-neutral-950 text-white py-8 px-4">
      <div className="max-w-md mx-auto">
        <nav className="text-xs text-neutral-500 mb-3">
          <Link href="/predictions/WORLD_CUP" className="hover:text-neutral-300">월드컵 예측</Link>
          <span className="mx-1">›</span><span className="text-neutral-300">{g}조 베스트11</span>
        </nav>

        <div className="text-center mb-2">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-sm font-bold tracking-[0.2em]">
            {g}조 {countries.map((c) => c.flag).join(" ")}
          </span>
        </div>
        <h1 className="text-center text-3xl font-black tracking-tight mb-1">통합 베스트 11</h1>
        <div className="text-center text-amber-400 font-bold text-sm mb-1">
          조 전력 평점 {"★".repeat(Math.round(teamRating))}{"☆".repeat(5 - Math.round(teamRating))} {teamRating.toFixed(1)}
        </div>
        <div className="text-center text-[11px] text-neutral-500 mb-3">📅 순위·선수 평점은 <span className="text-neutral-300 font-semibold">매일 자동 갱신</span>됩니다</div>

        {/* 조 네비게이션 */}
        <div className="flex flex-wrap justify-center gap-1 mb-4">
          {GROUPS.map((gg) => (
            <Link key={gg} href={`/world-cup/best-xi/${gg.toLowerCase()}`}
              className={`w-7 h-7 rounded-md text-xs font-bold inline-flex items-center justify-center ${gg === g ? "bg-amber-400 text-neutral-900" : "bg-white/10 text-neutral-300 hover:bg-white/20"}`}>
              {gg}
            </Link>
          ))}
        </div>

        <div className="relative w-full rounded-2xl overflow-hidden border border-emerald-700/40 shadow-2xl"
          style={{ aspectRatio: "3 / 4.2", background: "linear-gradient(to bottom, #0f5132 0%, #0c4429 50%, #0a3d27 100%)" }}>
          <div className="absolute inset-3 border-2 border-white/15 rounded-sm" />
          <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/15" />
          <div className="absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 border-2 border-white/15 rounded-full" />
          <div className="absolute left-1/2 bottom-3 w-32 h-12 -translate-x-1/2 border-2 border-t-0 border-white/15" />
          <div className="absolute left-1/2 top-3 w-32 h-12 -translate-x-1/2 border-2 border-b-0 border-white/15" />
          {xi.map((p, i) => (
            <div key={i} className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%`, width: "88px" }}>
              <div className="relative w-14 h-14 rounded-full ring-2 ring-white/80 overflow-hidden bg-neutral-800 flex items-center justify-center shadow-lg">
                {p.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo} alt={koOf(p)} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-neutral-300">{koOf(p).slice(0, 1)}</span>
                )}
              </div>
              <div className="mt-1 px-0.5 text-[11px] font-bold leading-tight text-center w-full break-keep drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                <span className="mr-0.5 align-middle">{p.flag}</span>{koOf(p)}
              </div>
              <div className="text-amber-400 text-[10px] leading-none tracking-tight">{"★".repeat(p.star)}<span className="text-white/25">{"★".repeat(5 - p.star)}</span></div>
              {p.recentRating ? (
                <div className="mt-0.5 inline-flex items-center rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300 leading-tight">최근 {p.recentRating.toFixed(1)}</div>
              ) : (
                <div className="mt-0.5 text-[9px] text-neutral-500 leading-tight">평점 —</div>
              )}
            </div>
          ))}
        </div>

        {bench && bench.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-bold text-neutral-400 mb-2">후보 선수 · 차순위</div>
            <div className="grid grid-cols-3 gap-2">
              {bench.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5">
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center ring-1 ring-white/15">
                    {p.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logo} alt="" className="w-full h-full object-cover" />
                    ) : (<span className="text-[10px] font-bold text-neutral-400">{koOf(p).slice(0, 1)}</span>)}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className="text-[10px] font-bold truncate">{p.flag} {koOf(p)}</div>
                    <div className="text-[9px] text-emerald-300">{p.recentRating ? `최근 ${p.recentRating.toFixed(1)}` : "평점 —"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <article className="mt-8 space-y-4 text-[15px] leading-relaxed text-neutral-300">
          <h2 className="text-xl font-black text-white">2026 FIFA 월드컵 {g}조 통합 베스트 11</h2>
          <p>2026 북중미 월드컵 {g}조에는 <strong className="text-white">{csKo.join(" · ")}</strong>가 편성됐다. 스코어베이스는 TheSports 실시간 경기 평점과 선수 시장가치를 종합해 {g}조 네 나라 선수를 아우르는 <strong className="text-white">통합 베스트 11</strong>을 4-3-3 포메이션으로 선정했다. 조 전체 전력은 별점 평균 <strong className="text-white">{teamRating.toFixed(1)}</strong>점이다.</p>
          <h3 className="text-lg font-bold text-white pt-1">최전방 스리톱</h3>
          <p>공격진에는 <strong className="text-white">{names(fw)}</strong>이(가) 선정됐다. {top ? `${koOf(top)}은 ${g}조 전체 최고 평점(${top.score})으로 조별리그 핵심 자원으로 꼽힌다.` : ""}</p>
          <h3 className="text-lg font-bold text-white pt-1">중원 미드필드</h3>
          <p>중원은 <strong className="text-white">{names(mf)}</strong>로 구성됐다.</p>
          <h3 className="text-lg font-bold text-white pt-1">포백 수비진</h3>
          <p>수비진에는 <strong className="text-white">{names(df)}</strong>가 자리했다.</p>
          <h3 className="text-lg font-bold text-white pt-1">골문</h3>
          <p>골키퍼는 <strong className="text-white">{names(gk)}</strong>가 지킨다.</p>
          {kr.length > 0 && (
            <>
              <h3 className="text-lg font-bold text-white pt-1">대한민국 주목 포인트</h3>
              <p>{g}조 통합 베스트 11에 대한민국 선수 <strong className="text-white">{kr.length}명</strong>({names(kr)})이 포함됐다. 손흥민·이강인·김민재 등 유럽파를 앞세운 한국은 조 2위 이상을 노린다.</p>
            </>
          )}
          <p className="text-xs text-neutral-500 pt-2">※ 통합 베스트 11은 TheSports 라인업 평점과 시장가치를 종합한 스코어베이스 자체 선정이며, 매일 최신 경기 데이터로 자동 갱신됩니다.</p>
        </article>

        <div className="mt-6 text-center">
          <Link href="/predictions/WORLD_CUP" className="text-sm text-amber-400 hover:underline">← 월드컵 예측·조별 순위 보기</Link>
        </div>
      </div>
    </div>
  );
}
