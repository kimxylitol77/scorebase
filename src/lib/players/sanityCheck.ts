import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Player, SportType } from "./types";

/**
 * sport 불일치 sanity 체크.
 * soccer 리그 컨텍스트에서 fetch 된 선수 ID 중 player.sport 가 다른 종목인 게 있으면
 * conflict_log 에 critical 적재 + throw.
 *
 * 사용처: 부상자/라인업 데이터 가공 직후, 표시 직전.
 */
export async function assertSportConsistency(
  playerIds: number[],
  expectedSport: SportType,
  leagueCode: string,
): Promise<void> {
  const valid = playerIds.filter((x) => typeof x === "number" && x > 0);
  if (valid.length === 0) return;
  let rows: Array<Pick<Player, "api_football_id" | "sport" | "name_en">> = [];
  try {
    const { data } = await supabaseAdmin()
      .from("players")
      .select("api_football_id, sport, name_en")
      .in("api_football_id", valid);
    rows = (data ?? []) as typeof rows;
  } catch (e) {
    console.warn(
      `[sanityCheck] DB 조회 실패 (${leagueCode}/${expectedSport}):`,
      (e as Error).message,
    );
    return;
  }
  const mismatched = rows.filter((r) => r.sport !== expectedSport);
  if (mismatched.length === 0) return;

  // critical 로그 적재
  for (const r of mismatched) {
    try {
      await supabaseAdmin()
        .from("player_mapping_conflict_log")
        .insert({
          conflict_type: "sport_mismatch",
          expected_sport: expectedSport,
          actual_sport: r.sport,
          league_code: leagueCode,
          involved_player_id: r.api_football_id,
          involved_player_name: r.name_en,
          severity: "critical",
        });
    } catch (e) {
      console.warn(
        `[sanityCheck] conflict_log 적재 실패:`,
        (e as Error).message,
      );
    }
  }

  throw new Error(
    `[sanityCheck] sport 불일치 — ${leagueCode} (${expectedSport}) 컨텍스트에 ` +
      `잘못된 종목 선수 ${mismatched.length}명 검출: ` +
      mismatched
        .map((r) => `${r.name_en}(id=${r.api_football_id}, sport=${r.sport})`)
        .join(", "),
  );
}

/**
 * 동명이인 sanity 검출 — detect_name_conflicts RPC 호출.
 * 잡(cron) 에서 주기적으로 호출하거나 admin UI 에서 수동 실행.
 */
export async function detectNameConflicts(): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin().rpc("detect_name_conflicts");
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      name_ko: string;
      sports: string[];
      player_ids: number[];
      player_count: number;
    }>;
    if (rows.length === 0) {
      console.log("[detectNameConflicts] 동명이인 충돌 없음");
      return;
    }
    for (const r of rows) {
      console.warn(
        `⚠ [detectNameConflicts] "${r.name_ko}" — sports=${r.sports.join(",")} ids=${r.player_ids.join(",")} (${r.player_count}명)`,
      );
    }
  } catch (e) {
    console.warn(
      `[detectNameConflicts] RPC 호출 실패:`,
      (e as Error).message,
    );
  }
}
