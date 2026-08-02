// 시즌 리더보드 행에 팀 로고(클럽)/국기(국가대항)를 붙이는 서버 헬퍼.
// LeagueLeaderBoard 는 클라이언트 컴포넌트라 DB 매칭은 여기서 — 각 페이지가 rows 조립 후 1회 호출.
// 로고 해석은 이름 매칭(B 경로): 한글 정확일치 → 영문 정확 → 영문 부분(unique·최장). 미스는 로고 없이(정상).

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { isNationalTeamLeague, fifaFlag } from "@/lib/sports/fifa-rankings";
import type { LeaderRow } from "@/components/LeagueLeaderBoard";

const FOOTBALL_TOKENS = new Set(["fc", "afc", "cf", "sc", "ac", "cd", "ud", "as", "rcd", "sd", "ssc", "ss", "uc", "acf", "cfc", "fbc", "vfl", "vfb", "sv", "club"]);
const NAME_ALIAS: [RegExp, string][] = [[/munchen/g, "munich"], [/koln/g, "cologne"], [/nurnberg/g, "nuremberg"], [/monchengladbach/g, "gladbach"]];
const normEn = (s: string) => {
  let r = s.toLowerCase().normalize("NFD").replace(/\./g, "").split(/[^a-z0-9]+/).filter((w) => w && !FOOTBALL_TOKENS.has(w) && !/^\d+$/.test(w)).join("");
  for (const [re, to] of NAME_ALIAS) r = r.replace(re, to);
  return r;
};
const normKo = (s: string) => s.replace(/[a-zA-Z0-9.()]+/g, " ").replace(/\s+/g, "").trim();

/** rowsByCategory 의 각 행에 teamLogo(클럽) 또는 teamFlag(국가대항 이모지)를 채운다. 실패해도 원본 그대로. */
export async function attachLeaderTeamLogos(
  league: string,
  rowsByCategory: Record<string, LeaderRow[]>,
): Promise<void> {
  try {
    const allRows = Object.values(rowsByCategory).flat();
    if (allRows.length === 0) return;

    if (isNationalTeamLeague(league) || league === "WORLD_CUP") {
      for (const r of allRows) r.teamFlag = fifaFlag(r.teamName, r.teamName) || null;
      return;
    }

    const teams = await prisma.team.findMany({ where: { league }, select: { name: true, logoUrl: true } });
    const koMap = new Map<string, string>();
    const enList: { norm: string; logo: string }[] = [];
    for (const t of teams) {
      if (!t.logoUrl) continue;
      koMap.set(normKo(toKoreanTeamName(t.name, league)), t.logoUrl);
      enList.push({ norm: normEn(t.name), logo: t.logoUrl });
    }
    const cache = new Map<string, string | null>();
    const logoOf = (name: string): string | null => {
      if (cache.has(name)) return cache.get(name)!;
      let out: string | null = koMap.get(normKo(name)) ?? null;
      if (!out) {
        const q = normEn(name);
        if (q) {
          const ex = enList.find((t) => t.norm === q);
          if (ex) out = ex.logo;
          else {
            let best: { norm: string; logo: string } | null = null;
            for (const t of enList)
              if (t.norm.length >= 4 && q.length >= 4 && (q.includes(t.norm) || t.norm.includes(q)) && (!best || t.norm.length > best.norm.length)) best = t;
            out = best?.logo ?? null;
          }
        }
      }
      cache.set(name, out);
      return out;
    };
    for (const r of allRows) r.teamLogo = logoOf(r.teamName);
  } catch {
    // 로고는 장식 — 조회 실패 시 로고 없이 렌더 (페이지를 죽이지 않는다)
  }
}
