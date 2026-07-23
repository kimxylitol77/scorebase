// /scores 테니스 탭 — ESPN scoreboard(ATP·WTA) 직접 fetch 표시 전용 (DB 수집 없음).
// 대회별 그룹 → 매치 rows (선수·세트 스코어·상태). 단식만 1차. docs/tennis-golf-scores 참고.

import { unstable_cache } from "next/cache";

interface EspnTennisResp {
  events?: Array<{
    id: string;
    name: string;
    groupings?: Array<{
      grouping?: { slug?: string; displayName?: string };
      competitions?: Array<{
        id: string;
        date: string;
        round?: { displayName?: string } | null;
        status?: {
          type?: { state?: string; shortDetail?: string; completed?: boolean };
        };
        competitors?: Array<{
          winner?: boolean;
          linescores?: Array<{ value?: number }>;
          athlete?: { displayName?: string; shortName?: string; flag?: { href?: string; alt?: string } };
        }>;
      }>;
    }>;
  }>;
}

interface TennisRow {
  id: string;
  tour: "ATP" | "WTA";
  tournament: string;
  round: string | null;
  state: "pre" | "in" | "post";
  statusDetail: string;
  date: string;
  p1: { name: string; flag: string | null; winner: boolean; sets: number[] };
  p2: { name: string; flag: string | null; winner: boolean; sets: number[] };
}

async function fetchTourUncached(tour: "ATP" | "WTA"): Promise<EspnTennisResp> {
  const slug = tour === "ATP" ? "atp" : "wta";
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/tennis/${slug}/scoreboard`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`espn tennis ${tour} ${res.status}`);
  return res.json();
}

// ESPN unofficial — 스키마 변동·실패 시 빈 배열 graceful (라이브스코어 페이지가 죽으면 안 됨).
const fetchTennisCached = unstable_cache(
  async (): Promise<TennisRow[]> => {
    const tours: Array<"ATP" | "WTA"> = ["ATP", "WTA"];
    const settled = await Promise.allSettled(tours.map((t) => fetchTourUncached(t)));
    const rows: TennisRow[] = [];
    settled.forEach((s, i) => {
      if (s.status !== "fulfilled") return;
      const tour = tours[i];
      for (const ev of s.value.events ?? []) {
        for (const g of ev.groupings ?? []) {
          // 1차는 단식만 — 복식은 팀명 조합이 길어 rows 가 난잡해짐
          if (!/singles/i.test(g.grouping?.slug ?? "")) continue;
          for (const c of g.competitions ?? []) {
            const [a, b] = c.competitors ?? [];
            if (!a?.athlete || !b?.athlete) continue;
            const state = (c.status?.type?.state ?? "pre") as TennisRow["state"];
            rows.push({
              id: `${tour}-${c.id}`,
              tour,
              tournament: ev.name,
              round: c.round?.displayName ?? null,
              state,
              statusDetail: c.status?.type?.shortDetail ?? "",
              date: c.date,
              p1: {
                name: a.athlete.shortName || a.athlete.displayName || "?",
                flag: a.athlete.flag?.href ?? null,
                winner: a.winner === true,
                sets: (a.linescores ?? []).map((l) => l.value ?? 0),
              },
              p2: {
                name: b.athlete.shortName || b.athlete.displayName || "?",
                flag: b.athlete.flag?.href ?? null,
                winner: b.winner === true,
                sets: (b.linescores ?? []).map((l) => l.value ?? 0),
              },
            });
          }
        }
      }
    });
    return rows;
  },
  ["scores-tennis-espn"],
  { revalidate: 60, tags: ["live-scores"] },
);

export default async function TennisBoard({ kstDateStr }: { kstDateStr: string }) {
  let rows: TennisRow[] = [];
  try {
    rows = await fetchTennisCached();
  } catch {
    // graceful — 아래 빈 상태 렌더
  }
  // KST 해당 일자 매치만 (ESPN 은 대회 전 라운드를 통째로 줌)
  const dayRows = rows.filter(
    (r) => new Date(new Date(r.date).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) === kstDateStr,
  );
  // LIVE → 예정 → 종료
  const order = { in: 0, pre: 1, post: 2 } as const;
  dayRows.sort((x, y) => order[x.state] - order[y.state] || x.date.localeCompare(y.date));

  if (dayRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        이 날짜에 표시할 ATP·WTA 단식 경기가 없습니다.
        <p className="mt-1 text-xs text-neutral-400">진행 중인 투어 대회 기간에 경기가 표시됩니다. 데이터 출처 ESPN.</p>
      </div>
    );
  }

  // 대회별 그룹
  const byTournament = new Map<string, TennisRow[]>();
  for (const r of dayRows) {
    const key = `${r.tour}|${r.tournament}`;
    const arr = byTournament.get(key) ?? [];
    arr.push(r);
    byTournament.set(key, arr);
  }

  return (
    <div className="space-y-4">
      {[...byTournament.entries()].map(([key, list]) => {
        const [tour, name] = key.split("|");
        return (
          <section key={key} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
              <span className="text-base" aria-hidden>🎾</span>
              <h3 className="text-[13px] font-bold tracking-tight">{name}</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{tour}</span>
              <span className="ml-auto text-[11px] text-neutral-400 tabular-nums">{list.length}경기</span>
            </div>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {list.map((m) => (
                <li key={m.id} className={`px-4 py-2.5 text-[13px] ${m.state === "in" ? "bg-rose-50/70 dark:bg-rose-500/[0.07]" : ""}`}>
                  <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
                    <span className={`text-[11px] leading-tight ${m.state === "in" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>
                      {m.state === "in" ? "LIVE" : m.state === "post" ? "종료" : new Date(new Date(m.date).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16)}
                      {m.round && <span className="block text-[10px] font-normal text-neutral-400">{m.round}</span>}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      {[m.p1, m.p2].map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          {p.flag && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.flag} alt="" className="w-4 h-3 object-cover rounded-[2px]" />
                          )}
                          <span className={`truncate ${p.winner ? "font-bold text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-neutral-300"}`}>
                            {p.name}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 tabular-nums text-right">
                      {[m.p1, m.p2].some((p) => p.sets.length > 0) ? (
                        <div className="space-y-0.5">
                          {[m.p1, m.p2].map((p, i) => (
                            <div key={i} className="flex gap-1.5 justify-end">
                              {p.sets.map((s, si) => (
                                <span key={si} className={`w-4 text-center ${p.winner ? "font-bold" : "text-neutral-500"}`}>{s}</span>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">vs</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-[11px] text-neutral-400 text-center">단식 기준 · 60초 갱신 · 데이터 출처 ESPN</p>
    </div>
  );
}
