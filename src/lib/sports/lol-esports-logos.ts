// 외국 LoL 팀(LPL/LEC/LCS/LCK_CL) 로고 채움 — 공식 LoL Esports API (lolesports.com).
//
// 배경: 매치 소스 BALLDONTLIE 는 팀 로고 미제공, LCK 는 lol.ts 하드코딩(Liquipedia).
// 외국 리그는 소스가 없어 빈 로고였음. Leaguepedia(lol.fandom)는 rate-limit 가혹 + FilePath
// 핫링크 403 → 공식 LoL Esports API 로 전환. static.lolesports.com(Akamai) 핫링크 친화.
//
// 키는 lolesports.com 프런트엔드 공개 키 — 로테이션 시 cron 이 graceful 실패(로고만 미충전).

import axios from "axios";
import { prisma } from "@/lib/db";

const API = "https://esports-api.lolesports.com/persisted/gw/getTeams?hl=en-US";
const PUBLIC_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const UA = "Mozilla/5.0 scorebase/1.0";
// LCK(="LOL")는 lol.ts 하드코딩이라 제외.
const FOREIGN_LEAGUES = ["LPL", "LEC", "LCS", "LCK_CL"];
// 이름 변형 심한 메이저 팀 → 공식 team code 별칭.
const CODE_ALIAS: Record<string, string> = {
  "Anyone's Legend": "AL", "JD Gaming": "JDG", "Team WE": "WE",
  "LNG Esports": "LNG", "Team Liquid": "TL", "Cloud9": "C9",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const toHttps = (u: string) => u.replace(/^http:/, "https:");

interface ApiTeam {
  name?: string;
  code?: string;
  image?: string;
}

async function head200(url: string): Promise<boolean> {
  try {
    const r = await axios.head(url, {
      headers: { "User-Agent": UA },
      timeout: 12000,
      maxRedirects: 3,
      validateStatus: () => true,
    });
    return r.status === 200;
  } catch {
    return false;
  }
}

/** 로고 없는 외국 LoL 팀에 공식 API 로고를 채움. HEAD 200 검증한 URL 만 저장. */
export async function fillForeignLolLogos(): Promise<{
  updated: number;
  missing: string[];
}> {
  const teams = await prisma.team.findMany({
    where: { league: { in: FOREIGN_LEAGUES }, logoUrl: null },
    select: { id: true, name: true },
  });
  if (teams.length === 0) return { updated: 0, missing: [] };

  const { data } = await axios.get(API, {
    headers: { "x-api-key": PUBLIC_KEY },
    timeout: 20000,
  });
  const apiTeams: ApiTeam[] = data?.data?.teams ?? [];

  const byName = new Map<string, string[]>();
  const byCode = new Map<string, string[]>();
  for (const t of apiTeams) {
    if (!t.image || /TBD|placeholder/i.test(t.image)) continue;
    const img = toHttps(t.image);
    if (t.name) {
      const k = norm(t.name);
      byName.set(k, [...(byName.get(k) ?? []), img]);
    }
    if (t.code) {
      const k = t.code.toUpperCase();
      byCode.set(k, [...(byCode.get(k) ?? []), img]);
    }
  }

  // 후보: 정확 이름 → code 별칭 → prefix(양방향, 짧은 API 이름 우선=스폰서 접미사 제거).
  const candidates = (name: string): string[] => {
    const n = norm(name);
    if (byName.get(n)?.length) return byName.get(n)!;
    const code = CODE_ALIAS[name];
    if (code && byCode.get(code)?.length) return byCode.get(code)!;
    const pre: Array<{ k: string; imgs: string[] }> = [];
    for (const [k, imgs] of byName) {
      if (k.startsWith(n) || n.startsWith(k)) pre.push({ k, imgs });
    }
    pre.sort((a, b) => a.k.length - b.k.length);
    return pre.flatMap((p) => p.imgs);
  };

  let updated = 0;
  const missing: string[] = [];
  for (const t of teams) {
    let chosen: string | null = null;
    for (const url of candidates(t.name)) {
      if (await head200(url)) {
        chosen = url;
        break;
      }
    }
    if (!chosen) {
      missing.push(t.name);
      continue;
    }
    await prisma.team.update({ where: { id: t.id }, data: { logoUrl: chosen } });
    updated++;
  }
  return { updated, missing };
}
