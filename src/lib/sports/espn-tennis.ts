// ESPN 테니스 — ATP·WTA 랭킹 / 선수 상세 fetch (DB 수집 없음, 표시 전용).
// 선수 한글명은 data/tennis-player-names.json 정적 사전(위키+Haiku, weekly 갱신) 사용.
// 배경·한계는 docs/tennis-rankings/context-notes.md 참고.

import { unstable_cache } from "next/cache";
import { fifaCountryKo } from "@/lib/sports/fifa-rankings";
import nameDict from "../../../data/tennis-player-names.json";

const NAMES = nameDict as Record<string, string>;

export type Tour = "ATP" | "WTA";

export interface TennisRank {
  rank: number;
  previous: number | null;
  /** 순위 등락 (+2 / -1 / null=변동없음) */
  delta: number | null;
  points: number;
  athleteId: string;
  name: string;
  /** 한글명 (사전에 있으면) */
  nameKo: string | null;
  countryEn: string | null;
  countryKo: string | null;
  flag: string | null;
  headshot: string | null;
  age: number | null;
}

export interface TennisPlayer {
  id: string;
  name: string;
  nameKo: string | null;
  countryEn: string | null;
  countryKo: string | null;
  flag: string | null;
  age: number | null;
  heightDisplay: string | null;
  weightDisplay: string | null;
  /** 주손 — "Right" | "Left" */
  hand: string | null;
  debutYear: number | null;
  birthPlace: string | null;
  headshot: string | null;
  /** 시즌 통계 (없을 수 있음) */
  stats: { label: string; value: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** 선수 한글명 — 정적 사전 우선, 없으면 null (호출측에서 영문 fallback) */
export function tennisNameKo(athleteId: string): string | null {
  return NAMES[athleteId] ?? null;
}

interface RankingsResp {
  rankings?: Array<{
    ranks?: Array<{
      current?: number;
      previous?: number;
      points?: number;
      athlete?: {
        id?: string;
        displayName?: string;
        /** 랭킹 API 는 문자열 URL, 일부 응답은 {href} 객체 — 둘 다 처리 */
        flag?: string | { href?: string; alt?: string };
        flagAltText?: string;
        headshot?: string;
        age?: number;
      };
    }>;
  }>;
}

// 랭킹은 주 1회(월요일) 갱신 데이터 — 1시간 캐시로 충분.
export const fetchTennisRankings = unstable_cache(
  async (tour: Tour): Promise<TennisRank[]> => {
    const slug = tour.toLowerCase();
    const j = await getJson<RankingsResp>(
      `https://site.api.espn.com/apis/site/v2/sports/tennis/${slug}/rankings`,
    );
    const ranks = j?.rankings?.[0]?.ranks ?? [];
    return ranks
      .filter((r) => r.athlete?.id && r.athlete?.displayName)
      .map((r) => {
        const cur = r.current ?? 0;
        const prev = r.previous ?? null;
        // previous=0 은 신규 진입 — 등락 계산 제외
        const delta = prev && prev > 0 && cur > 0 ? prev - cur : null;
        const flagRaw = r.athlete?.flag;
        const countryEn =
          r.athlete?.flagAltText ?? (typeof flagRaw === "object" ? flagRaw?.alt ?? null : null);
        return {
          rank: cur,
          previous: prev,
          delta: delta === 0 ? null : delta,
          points: r.points ?? 0,
          athleteId: r.athlete!.id!,
          name: r.athlete!.displayName!,
          nameKo: tennisNameKo(r.athlete!.id!),
          countryEn,
          countryKo: countryEn ? fifaCountryKo(countryEn) : null,
          flag: typeof flagRaw === "string" ? flagRaw : flagRaw?.href ?? null,
          headshot: r.athlete?.headshot ?? null,
          age: r.athlete?.age ?? null,
        };
      });
  },
  ["espn-tennis-rankings"],
  { revalidate: 3600, tags: ["tennis-rankings"] },
);

interface AthleteResp {
  id?: string;
  displayName?: string;
  age?: number;
  /** 인치 — 한국 표기는 cm 로 변환해서 노출 */
  height?: number;
  /** 파운드 — kg 로 변환 */
  weight?: number;
  displayHeight?: string;
  displayWeight?: string;
  hand?: { displayValue?: string; type?: string };
  debutYear?: number;
  birthPlace?: { city?: string; country?: string };
  citizenshipCountry?: { name?: string; alternateId?: string };
  flag?: { href?: string; alt?: string };
  headshot?: { href?: string };
  statistics?: { $ref?: string };
}
interface StatsResp {
  splits?: {
    categories?: Array<{ stats?: Array<{ displayName?: string; displayValue?: string; name?: string }> }>;
  };
}

// 선수 상세 — core API. 프로필 + 시즌 통계.
export const fetchTennisPlayer = unstable_cache(
  async (athleteId: string): Promise<TennisPlayer | null> => {
    const a = await getJson<AthleteResp>(
      `https://sports.core.api.espn.com/v2/sports/tennis/athletes/${athleteId}`,
    );
    if (!a?.displayName) return null;

    const stats: TennisPlayer["stats"] = [];
    if (a.statistics?.$ref) {
      const s = await getJson<StatsResp>(a.statistics.$ref);
      for (const c of s?.splits?.categories ?? []) {
        for (const st of c.stats ?? []) {
          if (!st.displayName || st.displayValue == null) continue;
          // 상금은 통화 포맷이 길어 별도 처리
          const label =
            st.name === "prize"
              ? "시즌 상금"
              : st.displayName
                  .replace("Singles Won", "단식 승")
                  .replace("Singles Lost", "단식 패")
                  .replace("Singles Titles", "단식 타이틀")
                  .replace("Doubles Titles", "복식 타이틀");
          const value =
            st.name === "prize"
              ? `$${Number(st.displayValue.replace(/[^0-9.]/g, "")).toLocaleString("en-US")}`
              : st.displayValue;
          stats.push({ label, value });
        }
      }
    }

    const countryEn = a.citizenshipCountry?.name ?? a.flag?.alt ?? a.birthPlace?.country ?? null;
    return {
      id: a.id ?? athleteId,
      name: a.displayName,
      nameKo: tennisNameKo(athleteId),
      countryEn,
      countryKo: countryEn ? fifaCountryKo(countryEn) : null,
      flag: a.flag?.href ?? null,
      age: a.age ?? null,
      // 한국 표기 — 인치/파운드를 cm/kg 로 변환 (원본 displayHeight 는 6' 3" 형식)
      heightDisplay: a.height ? `${Math.round(a.height * 2.54)}cm` : (a.displayHeight ?? null),
      weightDisplay: a.weight ? `${Math.round(a.weight * 0.4536)}kg` : (a.displayWeight ?? null),
      hand: a.hand?.displayValue ?? null,
      debutYear: a.debutYear ?? null,
      birthPlace: [a.birthPlace?.city, a.birthPlace?.country].filter(Boolean).join(", ") || null,
      headshot: a.headshot?.href ?? null,
      stats,
    };
  },
  ["espn-tennis-player"],
  { revalidate: 86400, tags: ["tennis-rankings"] },
);
