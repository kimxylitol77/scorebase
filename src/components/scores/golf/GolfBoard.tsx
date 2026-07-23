// /scores 골프 탭 — ESPN 리더보드(PGA·LPGA) 직접 fetch 표시 전용 (DB 수집 없음).
// 진행/최근 대회 카드 + 리더보드 top10 + 한국 선수 전원 강조. docs/tennis-golf-scores 참고.

import { unstable_cache } from "next/cache";

interface EspnGolfResp {
  events?: Array<{
    id: string;
    name: string;
    status?: { type?: { state?: string; description?: string; detail?: string } };
    competitions?: Array<{
      competitors?: Array<{
        order?: number;
        score?: string | number;
        athlete?: { displayName?: string; flag?: { href?: string; alt?: string } };
      }>;
    }>;
  }>;
}

interface GolfLeader {
  rank: number;
  name: string;
  flag: string | null;
  country: string | null;
  score: string;
  isKorean: boolean;
}
interface GolfEvent {
  id: string;
  tour: "PGA" | "LPGA";
  name: string;
  state: "pre" | "in" | "post";
  statusText: string;
  leaders: GolfLeader[];
  koreanCount: number;
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
        const all: GolfLeader[] = competitors
          .filter((c) => c.athlete?.displayName)
          .map((c) => {
            const country = c.athlete?.flag?.alt ?? null;
            return {
              rank: c.order ?? 0,
              name: c.athlete!.displayName!,
              flag: c.athlete?.flag?.href ?? null,
              country,
              score: String(c.score ?? "-"),
              isKorean: country === "South Korea",
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
          statusText: ev.status?.type?.detail ?? ev.status?.type?.description ?? "",
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
        지금 진행 중인 PGA·LPGA 대회가 없습니다.
        <p className="mt-1 text-xs text-neutral-400">대회 기간(보통 목~일)에 리더보드가 표시됩니다. 데이터 출처 ESPN.</p>
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
              {ev.state === "in" ? "진행 중" : ev.state === "post" ? "종료" : "예정"}
              {ev.koreanCount > 0 && <span className="ml-2 text-neutral-400">🇰🇷 {ev.koreanCount}명 출전</span>}
            </span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {ev.leaders.map((l) => (
              <li
                key={`${ev.id}-${l.rank}-${l.name}`}
                className={`flex items-center gap-3 px-4 py-2 text-[13px] ${l.isKorean ? "bg-amber-50/70 dark:bg-amber-500/[0.08]" : ""}`}
              >
                <span className="w-6 text-right font-bold tabular-nums text-neutral-500">{l.rank || "-"}</span>
                {l.flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.flag} alt={l.country ?? ""} className="w-4 h-3 object-cover rounded-[2px]" />
                )}
                <span className={`truncate ${l.isKorean ? "font-bold text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {l.name}
                </span>
                <span className={`ml-auto tabular-nums font-bold ${l.score.startsWith("-") ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {l.score}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-[11px] text-neutral-400 text-center">리더보드 top10 + 한국 선수 전원 · 5분 갱신 · 데이터 출처 ESPN</p>
    </div>
  );
}
