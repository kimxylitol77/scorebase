// (server-only 는 supabase/admin 안에 위치 — cron 잡에서 직접 호출 가능)
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DisplayName, Player, SportType } from "./types";

interface QueueRow {
  api_football_id: number | null;
  sport: SportType;
  raw_name_en: string;
  team_id: number | null;
  team_name_en: string | null;
  league_code: string | null;
}

async function queueUnmapped(row: QueueRow): Promise<void> {
  try {
    await supabaseAdmin().rpc("upsert_mapping_queue", {
      p_api_football_id: row.api_football_id,
      p_sport: row.sport,
      p_raw_name_en: row.raw_name_en,
      p_team_id: row.team_id,
      p_team_name_en: row.team_name_en,
      p_league_code: row.league_code,
    });
  } catch (e) {
    // 큐 적재 실패는 사용자에게 영향 X — 로그만
    console.warn(
      `[getKoreanName] queue 적재 실패 (${row.sport}/${row.raw_name_en}):`,
      (e as Error).message,
    );
  }
}

async function queueUnmappedBatch(rows: QueueRow[]): Promise<void> {
  // RPC 가 단일 row 라 병렬 호출. 큐 크기 작아 부담 적음.
  await Promise.all(rows.map(queueUnmapped));
}

/**
 * 단일 선수 한글 표시명 조회.
 * - sport 는 required (타입 강제) → DB 조회 시 sport 필터 무조건 적용 → 종목 혼입 차단.
 * - 매핑 없으면 큐에 적재 + 영문 fallback 반환.
 */
export async function getKoreanName(
  apiFootballId: number | null | undefined,
  fallbackNameEn: string,
  sport: SportType,
  leagueCode?: string,
): Promise<DisplayName> {
  const en = (fallbackNameEn ?? "").trim();
  if (apiFootballId) {
    try {
      const { data } = await supabaseAdmin()
        .from("players")
        .select("api_football_id, name_en, name_ko, source")
        .eq("api_football_id", apiFootballId)
        .eq("sport", sport)
        .maybeSingle();
      const row = data as Pick<Player, "api_football_id" | "name_en" | "name_ko" | "source"> | null;
      if (row?.name_ko) {
        return {
          ko: row.name_ko,
          en: row.name_en ?? en,
          source: row.source ?? null,
          isFallback: false,
        };
      }
    } catch (e) {
      console.warn(
        `[getKoreanName] DB 조회 실패 (id=${apiFootballId}):`,
        (e as Error).message,
      );
    }
  }
  // fallback — 큐 적재 (background)
  if (en) {
    void queueUnmapped({
      api_football_id: apiFootballId ?? null,
      sport,
      raw_name_en: en,
      team_id: null,
      team_name_en: null,
      league_code: leagueCode ?? null,
    });
  }
  return { ko: en, en, source: null, isFallback: true };
}

export interface BatchInput {
  apiFootballId?: number | null;
  nameEn: string;
  teamId?: number | null;
  teamNameEn?: string | null;
}

/**
 * 일괄 조회 — IN 쿼리로 N명 한 번에.
 * 미매핑 선수는 일괄 큐 적재 + 콘솔 경고 (id 누락 또는 미매핑 N건).
 */
export async function getKoreanNamesBatch(
  players: BatchInput[],
  sport: SportType,
  leagueCode?: string,
): Promise<Map<number | string, DisplayName>> {
  const result = new Map<number | string, DisplayName>();
  const ids = players
    .map((p) => p.apiFootballId)
    .filter((x): x is number => typeof x === "number" && x > 0);

  let rows: Array<Pick<Player, "api_football_id" | "name_en" | "name_ko" | "source">> = [];
  if (ids.length > 0) {
    try {
      const { data } = await supabaseAdmin()
        .from("players")
        .select("api_football_id, name_en, name_ko, source")
        .eq("sport", sport)
        .in("api_football_id", ids);
      rows = (data ?? []) as typeof rows;
    } catch (e) {
      console.warn(
        `[getKoreanNamesBatch] DB 조회 실패:`,
        (e as Error).message,
      );
    }
  }
  const byId = new Map(rows.map((r) => [r.api_football_id, r]));

  const unmappedQueue: QueueRow[] = [];
  for (const p of players) {
    const key = p.apiFootballId ?? p.nameEn;
    const matched =
      typeof p.apiFootballId === "number"
        ? byId.get(p.apiFootballId)
        : undefined;
    if (matched?.name_ko) {
      result.set(key, {
        ko: matched.name_ko,
        en: matched.name_en ?? p.nameEn,
        source: matched.source ?? null,
        isFallback: false,
      });
      continue;
    }
    // fallback
    result.set(key, {
      ko: p.nameEn,
      en: p.nameEn,
      source: null,
      isFallback: true,
    });
    if (p.nameEn) {
      unmappedQueue.push({
        api_football_id: p.apiFootballId ?? null,
        sport,
        raw_name_en: p.nameEn,
        team_id: p.teamId ?? null,
        team_name_en: p.teamNameEn ?? null,
        league_code: leagueCode ?? null,
      });
    }
  }

  if (unmappedQueue.length > 0) {
    console.warn(
      `[getKoreanNamesBatch] 매핑 누락 ${unmappedQueue.length}건 (${sport}/${leagueCode ?? "?"}) — 큐 적재`,
    );
    void queueUnmappedBatch(unmappedQueue);
  }

  return result;
}
