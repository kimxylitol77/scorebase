// 매칭된 시드 JSON 을 Supabase players 테이블에 upsert.
// onConflict: api_football_id — 같은 ID 면 갱신.
//
// 사용:
//   npm run players:apply

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_PATH = path.join(process.cwd(), "data/players-seed-matched.json");

interface MatchedPlayer {
  name_en: string;
  name_ko: string;
  name_ko_alt?: string[];
  sport: "soccer" | "basketball" | "baseball" | "hockey";
  source_league: string;
  team_hint: string;
  nationality?: string;
  api_football_id: number | null;
  match_confidence: "exact" | "fuzzy" | "none";
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      "[apply] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요",
    );
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const raw = await fs.readFile(SEED_PATH, "utf-8");
  const file = JSON.parse(raw) as { matched: MatchedPlayer[] };

  // id 가 채워진 행만 추출
  const upsertable = file.matched.filter(
    (m): m is MatchedPlayer & { api_football_id: number } =>
      typeof m.api_football_id === "number" && m.api_football_id > 0,
  );
  const skipped = file.matched.length - upsertable.length;
  console.log(
    `[apply] upsertable ${upsertable.length}건 · skipped ${skipped}건 (ID 미매칭)`,
  );

  const BATCH = 50;
  let inserted = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < upsertable.length; i += BATCH) {
    const slice = upsertable.slice(i, i + BATCH);
    const rows = slice.map((m) => ({
      api_football_id: m.api_football_id,
      sport: m.sport,
      name_en: m.name_en,
      name_ko: m.name_ko,
      name_ko_alt: m.name_ko_alt ?? [],
      team_name_en: m.team_hint,
      nationality: m.nationality ?? null,
      source: "manual",
      source_confidence: m.match_confidence === "exact" ? 100 : 85,
      updated_at: nowIso,
    }));

    const { error, count } = await supabase
      .from("players")
      .upsert(rows, { onConflict: "api_football_id", count: "exact" });
    if (error) {
      console.error(
        `[apply] 배치 ${i / BATCH + 1} 실패:`,
        error.message,
      );
      failed += slice.length;
    } else {
      inserted += count ?? slice.length;
      console.log(
        `[apply] 배치 ${i / BATCH + 1}: ${slice.length}건 upsert`,
      );
    }
  }

  console.log(`\n[apply] 완료 — upsert ${inserted}건, 실패 ${failed}건`);

  // 충돌 점검
  console.log("\n[apply] detect_name_conflicts 호출 중...");
  const { data: conflicts, error: cerr } = await supabase.rpc(
    "detect_name_conflicts",
  );
  if (cerr) {
    console.warn(`[apply] 충돌 점검 실패: ${cerr.message}`);
  } else {
    const list = (conflicts ?? []) as Array<{
      name_ko: string;
      sports: string[];
      player_ids: number[];
      player_count: number;
    }>;
    if (list.length === 0) {
      console.log("[apply] 동명이인 충돌 없음 ✅");
    } else {
      console.warn(`[apply] ⚠ 충돌 ${list.length}건 발견:`);
      for (const c of list) {
        console.warn(
          `  - "${c.name_ko}" — sports=${c.sports.join(",")} ids=${c.player_ids.join(",")}`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
