// /scores F1 탭 — ESPN 그랑프리 scoreboard 직접 fetch 표시 전용 (DB 수집 없음).
// 그랑프리 카드 = 세션 일정(FP1~레이스, KST) + 세션 결과 있으면 드라이버 top10.
// docs/tennis-golf-scores 참고 (테니스·골프와 동일 패턴).

import { unstable_cache } from "next/cache";
import Link from "next/link";
import DriverAvatar from "./DriverAvatar";
import driverNames from "../../../../data/f1-driver-names.json";

const DRIVER_KO = driverNames as Record<string, string>;

// athlete.links href(".../id/5752/...")에서 드라이버 id 추출.
function driverIdFromLinks(links?: Array<{ href?: string }>): string | null {
  for (const l of links ?? []) {
    const m = l.href?.match(/\/id\/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

interface EspnF1Resp {
  events?: Array<{
    id: string;
    name: string;
    date: string;
    endDate?: string;
    circuit?: { fullName?: string };
    status?: { type?: { state?: string } };
    competitions?: Array<{
      id: string;
      date: string;
      type?: { abbreviation?: string; text?: string };
      status?: { type?: { state?: string; shortDetail?: string; completed?: boolean } };
      competitors?: Array<{
        order?: number;
        winner?: boolean;
        athlete?: {
          displayName?: string;
          shortName?: string;
          flag?: { href?: string; alt?: string };
          links?: Array<{ href?: string }>;
        };
        vehicle?: { manufacturer?: string };
      }>;
    }>;
  }>;
}

interface F1Session {
  id: string;
  label: string;
  dateKst: string; // "7/24 (금) 20:30"
  state: "pre" | "in" | "post";
  results: Array<{
    rank: number;
    name: string;
    team: string | null;
    flag: string | null;
    country: string | null;
    photo: string | null;
  }>;
}
interface F1Event {
  id: string;
  name: string;
  circuit: string | null;
  state: "pre" | "in" | "post";
  sessions: F1Session[];
}

// ESPN 세션 약어 → 한국어 라벨
const SESSION_LABEL: Record<string, string> = {
  FP1: "연습 1",
  FP2: "연습 2",
  FP3: "연습 3",
  Qual: "퀄리파잉",
  Race: "레이스",
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function kstLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAY_KO[d.getUTCDay()]}) ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ESPN unofficial — 실패 시 빈 배열 graceful.
const fetchF1Cached = unstable_cache(
  async (): Promise<F1Event[]> => {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard",
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`espn f1 ${res.status}`);
    const json: EspnF1Resp = await res.json();
    return (json.events ?? []).map((ev) => ({
      id: ev.id,
      name: ev.name,
      circuit: ev.circuit?.fullName ?? null,
      state: (ev.status?.type?.state ?? "pre") as F1Event["state"],
      sessions: (ev.competitions ?? []).map((c) => {
        const abbr = c.type?.abbreviation ?? c.type?.text ?? "?";
        return {
          id: c.id,
          label: SESSION_LABEL[abbr] ?? abbr,
          dateKst: kstLabel(c.date),
          state: (c.status?.type?.state ?? "pre") as F1Session["state"],
          // 결과는 세션 진행/종료 후에만 옴 — top10 만
          results: (c.competitors ?? [])
            .filter((d) => d.athlete?.displayName)
            .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
            .slice(0, 10)
            .map((d) => {
              const did = driverIdFromLinks(d.athlete?.links);
              const en = d.athlete!.shortName || d.athlete!.displayName!;
              return {
                rank: d.order ?? 0,
                name: (did && DRIVER_KO[did]) || en,
                team: d.vehicle?.manufacturer ?? null,
                flag: d.athlete?.flag?.href ?? null,
                country: d.athlete?.flag?.alt ?? null,
                photo: did ? `https://a.espncdn.com/i/headshots/rpm/players/full/${did}.png` : null,
              };
            }),
        };
      }),
    }));
  },
  ["scores-f1-espn"],
  { revalidate: 120, tags: ["live-scores"] },
);

export default async function F1Board() {
  let events: F1Event[] = [];
  try {
    events = await fetchF1Cached();
  } catch {
    // graceful
  }

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        표시할 그랑프리 일정이 없습니다.
        <p className="mt-1 text-xs text-neutral-400">그랑프리 주간(보통 금~일)에 세션 일정·결과가 표시됩니다. 데이터 출처 ESPN.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((ev) => (
        <section key={ev.id} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-base" aria-hidden>🏎️</span>
            <h3 className="text-[13px] font-bold tracking-tight">{ev.name}</h3>
            {ev.circuit && <span className="hidden sm:inline text-[11px] text-neutral-400 truncate">{ev.circuit}</span>}
            <span className={`ml-auto shrink-0 text-[11px] ${ev.state === "in" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>
              {ev.state === "in" ? "진행 중" : ev.state === "post" ? "종료" : "예정"}
            </span>
            <Link
              href="/rankings/f1"
              className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
            >
              챔피언십
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {ev.sessions.map((s) => (
              <li key={s.id} className={`px-4 py-2.5 text-[13px] ${s.state === "in" ? "bg-rose-50/70 dark:bg-rose-500/[0.07]" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-16 shrink-0 font-semibold ${s.label === "레이스" ? "text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
                    {s.label}
                  </span>
                  <span className="text-neutral-500 tabular-nums">{s.dateKst}</span>
                  <span className={`ml-auto text-[11px] ${s.state === "in" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>
                    {s.state === "in" ? "LIVE" : s.state === "post" ? "종료" : "예정"}
                  </span>
                </div>
                {s.results.length > 0 && (
                  <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {s.results.map((r) => (
                      <li key={`${s.id}-${r.rank}`} className="flex items-center gap-2 text-[12px]">
                        <span
                          className={`w-5 text-right font-bold tabular-nums ${
                            r.rank === 1
                              ? "text-amber-500"
                              : r.rank === 2
                                ? "text-neutral-400"
                                : r.rank === 3
                                  ? "text-orange-400"
                                  : "text-neutral-500"
                          }`}
                        >
                          {r.rank}
                        </span>
                        <DriverAvatar photo={r.photo} flag={r.flag} country={r.country} name={r.name} />
                        <span className={`truncate ${r.rank <= 3 ? "font-bold text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-neutral-300"}`}>
                          {r.name}
                        </span>
                        {r.team && <span className="ml-auto text-[11px] text-neutral-400 truncate">{r.team}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-[11px] text-neutral-400 text-center">세션 시간 KST · 결과는 세션 종료 후 top10 · 2분 갱신 · 데이터 출처 ESPN</p>
    </div>
  );
}
