// ESPN F1 — 드라이버·컨스트럭터 챔피언십 순위 (DB 수집 없음, 표시 전용).
// core API standings(items[0]=Driver, [1]=constructor) 기반. 배경은 docs/f1-championship.
// 드라이버 한글명은 data/f1-driver-names.json(위키+Haiku), 팀명은 아래 고정 매핑.

import { unstable_cache } from "next/cache";
import { fifaCountryKo } from "@/lib/sports/fifa-rankings";
import driverNames from "../../../data/f1-driver-names.json";

const NAMES = driverNames as Record<string, string>;

// F1 팀은 11개 고정 — 위키는 스폰서까지 붙어("맥라렌 마스터카드 포뮬러 원 팀") 길어서 직접 매핑.
export const F1_TEAM_KO: Record<string, string> = {
  Mercedes: "메르세데스",
  Ferrari: "페라리",
  McLaren: "맥라렌",
  "Red Bull": "레드불",
  Alpine: "알핀",
  "Racing Bulls": "레이싱 불스",
  Haas: "하스",
  Williams: "윌리엄스",
  Audi: "아우디",
  "Aston Martin": "애스턴 마틴",
  Cadillac: "캐딜락",
};

// 팀 컬러 — 순위표 가독성(팀 식별). Tailwind 클래스 대신 hex(동적 클래스 purge 회피).
export const F1_TEAM_COLOR: Record<string, string> = {
  Mercedes: "#00D2BE",
  Ferrari: "#DC0000",
  McLaren: "#FF8700",
  "Red Bull": "#1E41FF",
  Alpine: "#0090FF",
  "Racing Bulls": "#6692FF",
  Haas: "#B6BABD",
  Williams: "#005AFF",
  Audi: "#009639",
  "Aston Martin": "#006F62",
  Cadillac: "#B4975A",
};

export interface F1Driver {
  rank: number;
  athleteId: string;
  name: string;
  nameKo: string | null;
  countryEn: string | null;
  countryKo: string | null;
  flag: string | null;
  team: string | null;
  teamKo: string | null;
  teamColor: string | null;
  carNumber: string | null;
  points: number;
  wins: number;
  /** 선두와의 점수차 (1위는 0) */
  behind: number;
  dnf: number;
}

export interface F1Constructor {
  rank: number;
  name: string;
  nameKo: string | null;
  color: string | null;
  points: number;
  wins: number;
  poles: number;
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

interface Ref {
  $ref?: string;
}
interface StatRow {
  name?: string;
  value?: number;
  displayValue?: string;
}
interface StandingRow {
  athlete?: Ref;
  manufacturer?: Ref;
  records?: Array<{ stats?: StatRow[] }>;
}
interface Group {
  standings?: StandingRow[];
}

function statNum(stats: StatRow[] | undefined, key: string): number {
  const s = stats?.find((x) => x.name === key);
  if (!s) return 0;
  if (typeof s.value === "number") return s.value;
  const n = Number((s.displayValue ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 시즌 챔피언십 — 22+11행이라 가벼움(골프와 달리 정적 빌드 불필요). 30분 캐시.
export const fetchF1Championship = unstable_cache(
  async (
    year: string,
  ): Promise<{ drivers: F1Driver[]; constructors: F1Constructor[] }> => {
    const root = await getJson<{ items?: Ref[] }>(
      `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${year}/types/2/standings`,
    );
    const items = root?.items ?? [];
    const [drvGrp, conGrp] = await Promise.all([
      items[0]?.$ref ? getJson<Group>(items[0].$ref) : null,
      items[1]?.$ref ? getJson<Group>(items[1].$ref) : null,
    ]);

    // 드라이버 — athlete 는 $ref 라 개별 fetch (22건, 병렬)
    const drvRows = drvGrp?.standings ?? [];
    const drivers: F1Driver[] = (
      await Promise.all(
        drvRows.map(async (row, i): Promise<F1Driver | null> => {
          if (!row.athlete?.$ref) return null;
          const a = await getJson<{
            id?: string;
            displayName?: string;
            flag?: { href?: string; alt?: string };
            vehicles?: Array<{ team?: string; number?: string }>;
          }>(row.athlete.$ref);
          if (!a?.id || !a.displayName) return null;
          const stats = row.records?.[0]?.stats;
          // citizenship 이 비는 경우가 많아 flag.alt 를 국적으로 사용(노트 참고)
          const countryEn = a.flag?.alt ?? null;
          const team = a.vehicles?.[0]?.team ?? null;
          return {
            rank: i + 1,
            athleteId: a.id,
            name: a.displayName,
            nameKo: NAMES[a.id] ?? null,
            countryEn,
            countryKo: countryEn ? fifaCountryKo(countryEn) : null,
            flag: a.flag?.href ?? null,
            team,
            teamKo: team ? (F1_TEAM_KO[team] ?? team) : null,
            teamColor: team ? (F1_TEAM_COLOR[team] ?? null) : null,
            carNumber: a.vehicles?.[0]?.number ?? null,
            points: statNum(stats, "championshipPts"),
            wins: statNum(stats, "wins"),
            behind: statNum(stats, "behind"),
            dnf: statNum(stats, "dnf"),
          };
        }),
      )
    ).filter((d): d is F1Driver => d !== null);

    // 컨스트럭터 — team/athlete 없이 manufacturer.$ref 만 있음(노트 참고)
    const conRows = conGrp?.standings ?? [];
    const constructors: F1Constructor[] = (
      await Promise.all(
        conRows.map(async (row, i): Promise<F1Constructor | null> => {
          if (!row.manufacturer?.$ref) return null;
          const m = await getJson<{ displayName?: string; name?: string }>(row.manufacturer.$ref);
          const name = m?.displayName ?? m?.name;
          if (!name) return null;
          const stats = row.records?.[0]?.stats;
          return {
            rank: statNum(stats, "rank") || i + 1,
            name,
            nameKo: F1_TEAM_KO[name] ?? null,
            color: F1_TEAM_COLOR[name] ?? null,
            points: statNum(stats, "points"),
            wins: statNum(stats, "wins"),
            poles: statNum(stats, "poles"),
          };
        }),
      )
    ).filter((c): c is F1Constructor => c !== null);

    return { drivers, constructors };
  },
  ["espn-f1-championship"],
  { revalidate: 1800, tags: ["f1-championship"] },
);
