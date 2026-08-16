// 클럽 예상 라인업 조회 — PredictedXiCache(리그당 1 row, /api/cron/club-xi 산출) 우선,
// 전환기 폴백으로 구 정적 JSON(data/club-predicted-xi.json, 맥북 크론 시절 산출물).
// 10분 메모이즈 — 라이브 페이지가 per-request 로 리그 payload(수십 KB JSONB)를 당기지 않게.
import { readFileSync } from "fs";
import path from "path";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export const getClubXiByLeague = unstable_cache(
  async (league: string): Promise<Record<string, unknown>> => {
    try {
      const row = await prisma.predictedXiCache.findUnique({ where: { league } });
      const payload = row?.payload as Record<string, unknown> | null;
      if (payload && Object.keys(payload).length > 0) return payload;
    } catch {
      // DB 순단 — 파일 폴백으로
    }
    try {
      const raw = JSON.parse(
        readFileSync(path.join(process.cwd(), "data/club-predicted-xi.json"), "utf-8"),
      ) as Record<string, Record<string, unknown>>;
      return raw[league] ?? {};
    } catch {
      return {};
    }
  },
  ["club-xi-by-league"],
  { revalidate: 600 },
);
