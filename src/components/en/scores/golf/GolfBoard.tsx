// scores__golf__GolfBoard (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { unstable_cache } from "next/cache";
import GolfLeaderboard, { type GolfLeaderData, type GolfRound, type HoleScore } from "./GolfLeaderboard";
import golfKoreaSeason from "../../../../../data/golf-korea-season.json";

// 한국 선수 영문명 → 한글명 (시즌 트래커 JSON 재사용).
const KO_NAME: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const p of (golfKoreaSeason as { players: Array<{ name: string; nameKo: string | null }> }).players) {
    if (p.nameKo) m[p.name] = p.nameKo;
  }
  return m;
})();

interface EspnHole {
  value?: number;
  period?: number; // 홀 번호
  scoreType?: { displayValue?: string }; // 홀별 대par ("E" / "-1" / "+1" …)
}
interface EspnRound {
  value?: number;
  displayValue?: string;
  period?: number; // 라운드 번호
  linescores?: EspnHole[]; // 홀 배열 (미시작 라운드는 없음)
}
interface EspnGolfResp {
  events?: Array<{
    id: string;
    name: string;
    status?: { type?: { state?: string; description?: string; detail?: string } };
    competitions?: Array<{
      competitors?: Array<{
        order?: number;
        score?: string | number;
        linescores?: EspnRound[];
        athlete?: {
          displayName?: string;
          flag?: { href?: string; alt?: string };
          links?: Array<{ href?: string }>;
        };
      }>;
    }>;
  }>;
}

interface GolfEvent {
  id: string;
  tour: "PGA" | "LPGA";
  name: string;
  state: "pre" | "in" | "post";
  leaders: GolfLeaderData[];
  koreanCount: number;
}

// athlete.links href(".../id/6922/ben-kohles")에서 ESPN 선수 id → 헤드샷 URL.
function photoFromAthlete(links?: Array<{ href?: string }>): string | null {
  for (const l of links ?? []) {
    const m = l.href?.match(/\/id\/(\d+)\//);
    if (m) return `https://a.espncdn.com/i/headshots/golf/players/full/${m[1]}.png`;
  }
  return null;
}

// "E" → 0, "-1" → -1, "+2" → 2, 없으면 null.
function relFromDisplay(s?: string): number | null {
  if (s == null || s === "") return null;
  if (s === "E") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function fmtRel(n: number | null): string {
  if (n == null) return "-";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

function parseRounds(raw: EspnRound[]): GolfRound[] {
  const rounds: GolfRound[] = [];
  for (const r of raw) {
    const rawHoles = r.linescores ?? [];
    const roundStrokes = typeof r.value === "number" ? r.value : null;
    const roundRel = relFromDisplay(r.displayValue);
    // 홀도 없고 라운드 총점도 없으면 미시작 → 스킵 (일부 대회는 홀 없이 라운드 총점만 제공)
    if (rawHoles.length === 0 && roundStrokes == null) continue;
    const holes: HoleScore[] = rawHoles
      .map((h) => {
        const strokes = typeof h.value === "number" ? h.value : null;
        const rel = relFromDisplay(h.scoreType?.displayValue);
        const par = strokes != null && rel != null ? strokes - rel : null;
        return { hole: h.period ?? 0, strokes, rel, par };
      })
      .sort((a, b) => a.hole - b.hole);
    rounds.push({ round: r.period ?? 0, holes, strokes: roundStrokes, rel: roundRel });
  }
  return rounds.sort((a, b) => a.round - b.round);
}

// 현재 라운드의 진행 홀 수(thru) + 오늘 대par 계산.
// 홀 데이터가 있으면 진행 홀로, 없으면 라운드 총점(rel)으로 오늘만 채운다(thru 불명).
function todayAndThru(rounds: GolfRound[]): { today: string; thru: string } {
  if (rounds.length === 0) return { today: "-", thru: "-" };
  const last = rounds[rounds.length - 1];
  const played = last.holes.filter((h) => h.strokes != null);
  if (played.length > 0) {
    const thru = played.length >= 18 ? "F" : String(played.length);
    const rel = played.reduce((s, h) => s + (h.rel ?? 0), 0);
    return { today: fmtRel(rel), thru };
  }
  if (last.rel != null) return { today: fmtRel(last.rel), thru: "-" };
  return { today: "-", thru: "-" };
}

async function fetchTourUncached(tour: "PGA" | "LPGA"): Promise<EspnGolfResp> {
  const slug = tour === "PGA" ? "pga" : "lpga";
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/golf/${slug}/scoreboard`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`espn golf ${tour} ${res.status}`);
  return res.json();
}

// ESPN unofficial — 실패 시 빈 배열 graceful.
const fetchGolfCached = unstable_cache(
  async (): Promise<GolfEvent[]> => {
    const tours: Array<"PGA" | "LPGA"> = ["PGA", "LPGA"];
    const settled = await Promise.allSettled(tours.map((t) => fetchTourUncached(t)));
    const out: GolfEvent[] = [];
    settled.forEach((s, i) => {
      if (s.status !== "fulfilled") return;
      const tour = tours[i];
      for (const ev of s.value.events ?? []) {
        const competitors = ev.competitions?.[0]?.competitors ?? [];
        const all: GolfLeaderData[] = competitors
          .filter((c) => c.athlete?.displayName)
          .map((c) => {
            const country = c.athlete?.flag?.alt ?? null;
            const isKorean = country === "South Korea";
            const rounds = parseRounds(c.linescores ?? []);
            const { today, thru } = todayAndThru(rounds);
            const enName = c.athlete!.displayName!;
            return {
              key: `${tour}-${ev.id}-${c.order ?? 0}-${enName}`,
              rank: c.order ?? 0,
              name: KO_NAME[enName] ?? enName,
              flag: c.athlete?.flag?.href ?? null,
              photo: photoFromAthlete(c.athlete?.links),
              country,
              isKorean,
              total: String(c.score ?? "-"),
              today,
              thru,
              rounds,
            };
          })
          .sort((a, b) => a.rank - b.rank);
        // top10 + (10위 밖) 한국 선수 전원
        const top = all.slice(0, 10);
        const koreansOutside = all.slice(10).filter((l) => l.isKorean);
        out.push({
          id: `${tour}-${ev.id}`,
          tour,
          name: ev.name,
          state: (ev.status?.type?.state ?? "pre") as GolfEvent["state"],
          leaders: [...top, ...koreansOutside],
          koreanCount: all.filter((l) => l.isKorean).length,
        });
      }
    });
    return out;
  },
  ["scores-golf-espn"],
  { revalidate: 300, tags: ["live-scores"] },
);

export default async function GolfBoard() {
  let events: GolfEvent[] = [];
  try {
    events = await fetchGolfCached();
  } catch {
    // graceful
  }

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        No PGA or LPGA event is currently running.
        <p className="mt-1 text-xs text-neutral-400">The leaderboard appears during tournament days (usually Thursday to Sunday). Data from ESPN.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((ev) => (
        <section key={ev.id} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-base" aria-hidden>⛳</span>
            <h3 className="text-[13px] font-bold tracking-tight">{ev.name}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{ev.tour}</span>
            <span className={`ml-auto text-[11px] tabular-nums ${ev.state === "in" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>
              {ev.state === "in" ? "Live" : ev.state === "post" ? "Final" : "Upcoming"}
              {ev.koreanCount > 0 && <span className="ml-2 text-neutral-400">🇰🇷 {ev.koreanCount} in the field</span>}
            </span>
          </div>
          <GolfLeaderboard leaders={ev.leaders} />
        </section>
      ))}
      <p className="text-[11px] text-neutral-400 text-center">Top 10 leaderboard · tap a player for the hole-by-hole card · refreshed every 5 min · data from ESPN</p>
    </div>
  );
}
