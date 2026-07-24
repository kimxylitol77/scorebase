// ESPN 테니스 대회 드로우(대진표) — tour+eventId 로 메인 드로우 전 라운드를 모델링 (표시 전용).
// scoreboard 응답이 대회의 모든 라운드 매치를 통째로 주므로 추가 호출 없이 재구성한다.
// 예선(Qualifying) 제외, 단식만. 선수 한글명은 tennisNameKo 정적 사전 재사용.

import { unstable_cache } from "next/cache";
import { tennisNameKo } from "@/lib/sports/espn-tennis";

export type Tour = "atp" | "wta";

export interface DrawSet {
  games: number;
  tb: number | null; // 타이브레이크 포인트 (있으면)
}
export interface DrawPlayer {
  name: string; // 한글명 있으면 한글, 없으면 shortName
  flag: string | null;
  isKorean: boolean;
  winner: boolean;
  sets: DrawSet[];
  tbd: boolean; // 미정(TBD)
}
export interface DrawMatch {
  id: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  p1: DrawPlayer;
  p2: DrawPlayer;
}
export interface DrawRound {
  name: string; // 원문 라운드명
  nameKo: string;
  matches: DrawMatch[];
}
export interface TennisDraw {
  tour: "ATP" | "WTA";
  eventId: string;
  name: string;
  rounds: DrawRound[]; // 메인 드로우, 이른 라운드 → 결승 순
}

interface EspnResp {
  events?: Array<{
    id: string;
    name: string;
    groupings?: Array<{
      grouping?: { slug?: string };
      competitions?: Array<{
        id: string;
        round?: { id?: string; displayName?: string } | null;
        status?: { type?: { state?: string; shortDetail?: string } };
        competitors?: Array<{
          order?: number;
          winner?: boolean;
          linescores?: Array<{ value?: number; tiebreak?: number }>;
          athlete?: {
            displayName?: string;
            shortName?: string;
            flag?: { href?: string; alt?: string };
            links?: Array<{ href?: string }>;
          };
        }>;
      }>;
    }>;
  }>;
}

// "Round of 16" → "16강", "Round 2" → "2회전", "Quarterfinal" → "8강" …
function roundKo(name: string): string {
  const s = name.trim();
  if (/^final$/i.test(s)) return "결승";
  if (/semifinal/i.test(s)) return "준결승";
  if (/quarterfinal/i.test(s)) return "8강";
  let m = s.match(/round of (\d+)/i);
  if (m) return `${m[1]}강`;
  m = s.match(/round (\d+)/i);
  if (m) return `${m[1]}회전`;
  return s;
}

function idFromLinks(links?: Array<{ href?: string }>): string | null {
  for (const l of links ?? []) {
    const m = l.href?.match(/\/id\/(\d+)\//);
    if (m) return m[1];
  }
  return null;
}

async function fetchTour(tour: Tour): Promise<EspnResp> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`espn tennis ${tour} ${res.status}`);
  return res.json();
}

export interface DrawSummary {
  tour: "ATP" | "WTA";
  tourSlug: "atp" | "wta";
  eventId: string;
  name: string;
  matchCount: number; // 본선 단식 매치 수
  hasKorean: boolean;
  completed: boolean; // 결승 승자 확정
}

// 진행/최근 대회 목록 (드로우 허브용). ATP·WTA 단식 본선 기준.
export const listTennisDraws = unstable_cache(
  async (): Promise<DrawSummary[]> => {
    const tours: Tour[] = ["atp", "wta"];
    const settled = await Promise.allSettled(tours.map((t) => fetchTour(t)));
    const out: DrawSummary[] = [];
    settled.forEach((s, i) => {
      if (s.status !== "fulfilled") return;
      const tour = tours[i];
      for (const ev of s.value.events ?? []) {
        const grouping = (ev.groupings ?? []).find((g) => /singles/i.test(g.grouping?.slug ?? ""));
        if (!grouping) continue;
        const main = (grouping.competitions ?? []).filter((c) => {
          const rn = c.round?.displayName ?? "";
          return rn && !/qualif/i.test(rn);
        });
        if (main.length === 0) continue;
        const hasKorean = main.some((c) =>
          (c.competitors ?? []).some((p) => p.athlete?.flag?.alt === "South Korea"),
        );
        const final = main.find((c) => /^final$/i.test(c.round?.displayName ?? ""));
        const completed = !!final && (final.competitors ?? []).some((p) => p.winner === true);
        out.push({
          tour: tour === "atp" ? "ATP" : "WTA",
          tourSlug: tour,
          eventId: ev.id,
          name: ev.name,
          matchCount: main.length,
          hasKorean,
          completed,
        });
      }
    });
    return out;
  },
  ["tennis-draw-list"],
  { revalidate: 300, tags: ["live-scores"] },
);

// tour+eventId 의 단식 메인 드로우. 실패/없음 시 null.
export const getTennisDraw = unstable_cache(
  async (tour: Tour, eventId: string): Promise<TennisDraw | null> => {
    let data: EspnResp;
    try {
      data = await fetchTour(tour);
    } catch {
      return null;
    }
    const ev = (data.events ?? []).find((e) => e.id === eventId);
    if (!ev) return null;
    const grouping = (ev.groupings ?? []).find((g) => /singles/i.test(g.grouping?.slug ?? ""));
    if (!grouping) return null;

    // 라운드별로 묶고, 예선 제외 + round.id 오름차순(이른 라운드 → 결승).
    const byRound = new Map<string, { id: number; name: string; matches: DrawMatch[] }>();
    for (const c of grouping.competitions ?? []) {
      const rName = c.round?.displayName ?? "";
      if (!rName || /qualif/i.test(rName)) continue;
      const rId = Number(c.round?.id ?? 999);
      const [a, b] = c.competitors ?? [];
      if (!a?.athlete || !b?.athlete) continue;

      const mk = (comp: NonNullable<typeof a>): DrawPlayer => {
        const at = comp.athlete!;
        const short = at.shortName || at.displayName || "?";
        const tbd = /^TBD$/i.test(short);
        const pid = idFromLinks(at.links);
        const ko = pid ? tennisNameKo(pid) : null;
        return {
          name: tbd ? "미정" : ko ?? short,
          flag: at.flag?.href ?? null,
          isKorean: at.flag?.alt === "South Korea",
          winner: comp.winner === true,
          sets: (comp.linescores ?? []).map((l) => ({
            games: typeof l.value === "number" ? l.value : 0,
            tb: typeof l.tiebreak === "number" ? l.tiebreak : null,
          })),
          tbd,
        };
      };

      const bucket = byRound.get(rName) ?? { id: rId, name: rName, matches: [] };
      bucket.matches.push({
        id: c.id,
        state: (c.status?.type?.state ?? "pre") as DrawMatch["state"],
        statusDetail: c.status?.type?.shortDetail ?? "",
        p1: mk(a),
        p2: mk(b),
      });
      byRound.set(rName, bucket);
    }

    const rounds: DrawRound[] = [...byRound.values()]
      .sort((x, y) => x.id - y.id)
      .map((r) => ({ name: r.name, nameKo: roundKo(r.name), matches: r.matches }));

    if (rounds.length === 0) return null;
    return {
      tour: tour === "atp" ? "ATP" : "WTA",
      eventId,
      name: ev.name,
      rounds,
    };
  },
  ["tennis-draw"],
  { revalidate: 300, tags: ["live-scores"] },
);
