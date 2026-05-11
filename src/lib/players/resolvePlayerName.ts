import "server-only";

// Hybrid 한글 표시명 resolver
// 우선순위:
//   1. Supabase players 테이블 (sport 강제 매칭, 정확)
//   2. 코드 매핑 (src/lib/player-names.ts — last-name fallback 포함, 빠름)
//   3. 영문 fallback (큐 적재 → 다음 매핑 후보)

import { getKoreanNamesBatch } from "./getKoreanName";
import { toKoreanPlayerName } from "@/lib/player-names";
import type { DisplayName, SportType } from "./types";

interface ResolveInput {
  apiFootballId?: number | null;
  nameEn: string;
  teamId?: number | null;
  teamNameEn?: string | null;
}

export interface ResolvedName {
  ko: string;
  en: string;
  source: DisplayName["source"] | "code-fallback";
  /** Supabase / 코드 / fallback 중 어디서 왔는지 */
  isSupabase: boolean;
  isFallback: boolean;
}

export async function resolvePlayerNames(
  players: ResolveInput[],
  sport: SportType,
  leagueCode?: string,
): Promise<Map<number | string, ResolvedName>> {
  // Supabase batch 조회
  const supaResult = await getKoreanNamesBatch(players, sport, leagueCode);

  // 결과 합성 — Supabase 매핑 없으면 코드 매핑 시도
  const out = new Map<number | string, ResolvedName>();
  for (const p of players) {
    const key = p.apiFootballId ?? p.nameEn;
    const supa = supaResult.get(key);

    if (supa && !supa.isFallback) {
      out.set(key, {
        ko: supa.ko,
        en: supa.en,
        source: supa.source ?? "manual",
        isSupabase: true,
        isFallback: false,
      });
      continue;
    }

    // Supabase 매핑 없음 → 코드 fallback
    const codeKo = toKoreanPlayerName(p.nameEn);
    const isCodeFallback = codeKo === p.nameEn; // 코드도 fail = 영문 그대로
    out.set(key, {
      ko: codeKo,
      en: p.nameEn,
      source: isCodeFallback ? null : "code-fallback",
      isSupabase: false,
      isFallback: isCodeFallback,
    });
  }
  return out;
}

/** 단일 선수 — 자주 쓰일 헬퍼 */
export async function resolvePlayerName(
  apiFootballId: number | null | undefined,
  nameEn: string,
  sport: SportType,
  leagueCode?: string,
): Promise<ResolvedName> {
  const m = await resolvePlayerNames(
    [{ apiFootballId, nameEn }],
    sport,
    leagueCode,
  );
  const key = apiFootballId ?? nameEn;
  return (
    m.get(key) ?? {
      ko: nameEn,
      en: nameEn,
      source: null,
      isSupabase: false,
      isFallback: true,
    }
  );
}
