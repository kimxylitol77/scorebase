"use server";
// 드림팀 저장 서버 액션 — 인증·예산·구성 검증 후 DreamTeam upsert
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { TIERS } from "@/lib/dream-team/tiers";
import { MENTALITIES, ROLES } from "@/lib/dream-team/tactics";
import type { SquadMember } from "@/lib/dream-team/squad";

export interface SaveState {
  ok: boolean;
  error?: string;
  teamId?: string;
}

export async function saveDreamTeam(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const name = (String(formData.get("name") ?? "").trim() || "나의 드림팀").slice(0, 30);
  const formation = String(formData.get("formation") ?? "4-3-3");
  const rawMentality = String(formData.get("mentality") ?? "balanced");
  const mentality = MENTALITIES[rawMentality] ? rawMentality : "balanced";

  let players: { slot: string; playerId: string; role?: string }[];
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

  // 역할 정규화 (클라이언트 조작·구버전 대비 — 유효하지 않으면 균형)
  players = players.map((p) => ({ slot: p.slot, playerId: p.playerId, role: ROLES[p.role ?? ""] ? p.role : "balanced" }));

  const existing = await prisma.dreamTeam.findFirst({ where: { userId } });
  const pool = getDreamPlayers(ids);
  if (pool.length !== 11) return { ok: false, error: "유효하지 않은 선수가 포함됐습니다." };

  const existingSquad = (existing?.squad as unknown as SquadMember[]) ?? [];
  const lineup = players.map((p) => ({ slot: p.slot, playerId: p.playerId }));

  // 보유 스쿼드가 있으면 라인업 편성 — 선발 11명이 모두 보유 중인지 검증, 역할만 갱신, 자금·스쿼드 보존
  if (existingSquad.length > 0) {
    const ownedSet = new Set(existingSquad.map((s) => s.playerId));
    if (!ids.every((id) => ownedSet.has(id))) return { ok: false, error: "보유하지 않은 선수가 있습니다. 이적 시장에서 먼저 영입하세요." };
    const roleOf = new Map(players.map((p) => [p.playerId, p.role ?? "balanced"]));
    const newSquad = existingSquad.map((s) => (roleOf.has(s.playerId) ? { ...s, role: roleOf.get(s.playerId)! } : s));
    await prisma.dreamTeam.update({
      where: { id: existing!.id },
      data: { name, formation, mentality, lineup, squad: newSquad as unknown as Prisma.InputJsonValue },
    });
    revalidatePath("/dream-team");
    return { ok: true, teamId: existing!.id };
  }

  // 보유가 비었으면(신규/초기) 전체 풀에서 예산 내 구성 → squad·lineup·funds 생성
  const budget = TIERS[existing?.tier ?? "amateur"]?.budget ?? 15;
  const total = pool.reduce((s, p) => s + p.value, 0);
  if (total > budget) return { ok: false, error: `예산 초과 (€${total}M / €${budget}M)` };
  const squad = players.map((p) => ({ playerId: p.playerId, xp: 0, role: p.role }));
  const funds = Math.max(0, budget - total);

  let teamId: string;
  if (existing) {
    await prisma.dreamTeam.update({
      where: { id: existing.id },
      data: { name, formation, mentality, lineup, squad, funds },
    });
    teamId = existing.id;
  } else {
    const created = await prisma.dreamTeam.create({
      data: { userId, name, formation, mentality, lineup, squad, funds, tier: "amateur" },
    });
    teamId = created.id;
  }

  revalidatePath("/dream-team");
  return { ok: true, teamId };
}
