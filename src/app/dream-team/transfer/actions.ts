"use server";
// 드림팀 이적 서버 액션 — 자금으로 선수 영입(squad 추가)·방출(squad 제거, 자금 회수)
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { marketValue } from "@/lib/dream-team/pricing";
import type { SquadMember, LineupSlot } from "@/lib/dream-team/squad";

export interface TransferState {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function transferPlayer(_prev: TransferState, formData: FormData): Promise<TransferState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const action = String(formData.get("action") ?? ""); // "in" | "out"
  const playerId = String(formData.get("playerId") ?? "");
  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) return { ok: false, error: "먼저 팀을 만들어주세요." };

  const squad = (team.squad as unknown as SquadMember[]) ?? [];
  const lineup = (team.lineup as unknown as LineupSlot[]) ?? [];
  const [dp] = getDreamPlayers([playerId]);
  if (!dp) return { ok: false, error: "선수를 찾을 수 없습니다." };

  if (action === "in") {
    if (squad.some((s) => s.playerId === playerId)) return { ok: false, error: "이미 보유한 선수입니다." };
    const price = marketValue(dp, 0, team.seasonNo);
    if (team.funds < price) return { ok: false, error: `자금 부족 (€${price}M 필요 / 보유 €${team.funds}M)` };
    const newSquad = [...squad, { playerId, xp: 0, role: "balanced", boughtValue: price }];
    await prisma.dreamTeam.update({
      where: { id: team.id },
      data: { squad: newSquad as unknown as Prisma.InputJsonValue, funds: team.funds - price },
    });
    revalidatePath("/dream-team/transfer");
    return { ok: true, message: `${dp.name} 영입 (−€${price}M)` };
  }

  if (action === "out") {
    const member = squad.find((s) => s.playerId === playerId);
    if (!member) return { ok: false, error: "보유하지 않은 선수입니다." };
    const price = marketValue(dp, member.xp, team.seasonNo);
    const profit = price - (member.boughtValue ?? dp.value);
    const newSquad = squad.filter((s) => s.playerId !== playerId);
    // 방출 선수가 선발에 있으면 라인업에서도 제거
    const newLineup = lineup.filter((l) => l.playerId !== playerId);
    await prisma.dreamTeam.update({
      where: { id: team.id },
      data: {
        squad: newSquad as unknown as Prisma.InputJsonValue,
        lineup: newLineup as unknown as Prisma.InputJsonValue,
        funds: team.funds + price,
      },
    });
    revalidatePath("/dream-team/transfer");
    const profitStr = profit > 0 ? ` · 차익 +€${profit}M` : profit < 0 ? ` · 손실 −€${-profit}M` : "";
    return { ok: true, message: `${dp.name} 방출 (+€${price}M)${profitStr}` };
  }

  return { ok: false, error: "잘못된 요청입니다." };
}
