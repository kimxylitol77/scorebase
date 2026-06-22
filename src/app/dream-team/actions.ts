"use server";
// 드림팀 저장 서버 액션 — 인증·예산·구성 검증 후 DreamTeam upsert
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { TIERS } from "@/lib/dream-team/tiers";

export interface SaveState {
  ok: boolean;
  error?: string;
}

export async function saveDreamTeam(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const name = (String(formData.get("name") ?? "").trim() || "나의 드림팀").slice(0, 30);
  const formation = String(formData.get("formation") ?? "4-3-3");

  let players: { slot: string; playerId: string }[];
  try {
    players = JSON.parse(String(formData.get("players") ?? "[]"));
  } catch {
    return { ok: false, error: "선수 데이터 형식 오류" };
  }
  if (!Array.isArray(players) || players.length !== 11) {
    return { ok: false, error: "11명을 모두 채워야 합니다." };
  }

  const ids = players.map((p) => p.playerId);
  if (new Set(ids).size !== 11) return { ok: false, error: "중복 선수가 있습니다." };

  // 서버에서 예산 재검증 (클라이언트 조작 방지) — 현재 티어 예산 기준
  const existing = await prisma.dreamTeam.findFirst({ where: { userId } });
  const budget = TIERS[existing?.tier ?? "amateur"]?.budget ?? 15;
  const pool = getDreamPlayers(ids);
  if (pool.length !== 11) return { ok: false, error: "유효하지 않은 선수가 포함됐습니다." };
  const total = pool.reduce((s, p) => s + p.value, 0);
  if (total > budget) return { ok: false, error: `예산 초과 (€${total}M / €${budget}M)` };

  if (existing) {
    await prisma.dreamTeam.update({
      where: { id: existing.id },
      data: { name, formation, players, tier: "amateur" },
    });
  } else {
    await prisma.dreamTeam.create({
      data: { userId, name, formation, players, tier: "amateur" },
    });
  }

  revalidatePath("/dream-team");
  return { ok: true };
}
