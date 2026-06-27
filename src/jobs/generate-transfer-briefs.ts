// AI 이적 브리핑 — 이번 창의 주목 확정 이적(선수 시장가치순)에 haiku 한 줄 분석을 생성·저장.
// FootballTransfer.aiBrief 채움. /transfers 상단 "AI 이적 브리핑" 섹션 소스. cron: /api/cron/transfer-briefs.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { toKoreanTeamName } from "@/lib/team-names";

const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
// 실제 이동만 — 3 완전이적 · 1 임대 · 7 자유계약 (2 복귀·6 방출 제외).
const MOVE_TYPES = [1, 3, 7];
const MAX_BRIEFS = Number(process.env.TRANSFER_BRIEF_MAX ?? 14); // 1회 haiku 호출 상한
const TOP_POOL = 60; // 시장가치 상위 후보 풀

const TYPE_KO: Record<number, string> = { 1: "임대", 3: "완전이적", 7: "자유계약" };
// TheSports 축구 coarse 포지션 → 한국어 역할 (환각 방지용 사실 주입).
const POS_KO: Record<string, string> = { G: "골키퍼", D: "수비수", M: "미드필더", F: "공격수" };

function transferWindow(): { label: string; from: number; to: number } {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (m >= 6 && m <= 9) return { label: `${y} 여름 이적시장`, from: Date.UTC(y, 5, 1) / 1000, to: Date.UTC(y, 9, 1) / 1000 };
  if (m === 12) return { label: `${y + 1} 겨울 이적시장`, from: Date.UTC(y, 11, 1) / 1000, to: Date.UTC(y + 1, 2, 1) / 1000 };
  if (m <= 2) return { label: `${y} 겨울 이적시장`, from: Date.UTC(y - 1, 11, 1) / 1000, to: Date.UTC(y, 2, 1) / 1000 };
  return { label: "최근 90일", from: Math.floor(now.getTime() / 1000) - 90 * 86400, to: Math.floor(now.getTime() / 1000) + 30 * 86400 };
}

async function briefFor(d: {
  name: string; fromKo: string; toKo: string; typeKo: string; valueM: number; posKo: string | null;
}): Promise<string | null> {
  const valueStr = d.valueM > 0 ? `시장가치 약 €${d.valueM}M` : "시장가치 미상";
  const posLine = d.posKo ? `포지션: ${d.posKo}` : "포지션: 미상";
  const prompt = `다음 축구 확정 이적을 한 문장(45자 이내) 한국어로 분석하라.
선수: ${d.name}
${posLine}
이적: ${d.fromKo} → ${d.toKo} (${d.typeKo})
${valueStr}

규칙:
- 주어진 사실만 사용. 이적료·계약기간·세부 포지션·루머 등 주어지지 않은 정보 지어내기 절대 금지.
- 포지션은 위에 주어진 것만 언급. "미상"이면 포지션·보강 부위를 추측하지 말 것.
- 영입팀 관점에서 전력·맥락을 간결히. 문장 하나만 출력(따옴표·접두어 없이).`;
  try {
    const text = await generate(prompt, { maxTokens: 200, temperature: 0.6 });
    const line = text.trim().replace(/^["'`]|["'`]$/g, "").split("\n")[0].trim();
    return line.slice(0, 120) || null;
  } catch (e) {
    console.warn(`[transfer-briefs] haiku 실패 ${d.name}: ${(e as Error).message}`);
    return null;
  }
}

export async function runGenerateTransferBriefs(opts?: { max?: number }) {
  const max = opts?.max ?? MAX_BRIEFS;
  const win = transferWindow();

  // 창 내 실제 이동 + 빅5. 미래 발효(여름 7/1 등) 포함 위해 to 까지 허용.
  const rows = await prisma.footballTransfer.findMany({
    where: {
      league: { in: BIG5 },
      transferType: { in: MOVE_TYPES },
      transferTime: { gte: win.from, lte: win.to },
    },
    select: {
      id: true, playerId: true, fromTeamName: true, toTeamName: true,
      transferType: true, league: true, aiBrief: true,
    },
  });
  if (rows.length === 0) {
    console.log("[transfer-briefs] 대상 이적 없음");
    return { candidates: 0, generated: 0 };
  }

  // 시장가치 + 선수명 join
  const pids = [...new Set(rows.map((r) => r.playerId))];
  const [pmv, players] = await Promise.all([
    prisma.playerMarketValue.findMany({ where: { id: { in: pids } }, select: { id: true, currentValue: true } }),
    prisma.theSportsPlayer.findMany({ where: { id: { in: pids } }, select: { id: true, nameKo: true, name: true, position: true } }),
  ]);
  const valueMap = new Map(pmv.map((p) => [p.id, p.currentValue ?? 0]));
  const nameMap = new Map(players.map((p) => [p.id, p.nameKo || p.name || null]));
  const posMap = new Map(players.map((p) => [p.id, (p.position && POS_KO[p.position]) || null]));

  // enrich + 이름 있는 것만 + 시장가치순 + 중복(선수+행선지) 제거
  const seen = new Set<string>();
  const enriched = rows
    .map((r) => ({
      row: r,
      name: nameMap.get(r.playerId),
      valueM: Math.round((valueMap.get(r.playerId) ?? 0) / 1e6),
    }))
    .filter((e) => e.name && e.name !== "선수")
    .sort((a, b) => b.valueM - a.valueM)
    .filter((e) => {
      const k = `${e.name}|${e.row.toTeamName}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, TOP_POOL);

  // 아직 브리핑 없는 상위 후보부터 생성 (상한까지)
  const todo = enriched.filter((e) => !e.row.aiBrief).slice(0, max);
  let generated = 0;
  for (const e of todo) {
    const brief = await briefFor({
      name: e.name!,
      fromKo: toKoreanTeamName(e.row.fromTeamName, e.row.league ?? undefined) || e.row.fromTeamName || "이전 팀",
      toKo: toKoreanTeamName(e.row.toTeamName, e.row.league ?? undefined) || e.row.toTeamName || "새 팀",
      typeKo: TYPE_KO[e.row.transferType ?? 3] ?? "이적",
      valueM: e.valueM,
      posKo: posMap.get(e.row.playerId) ?? null,
    });
    if (!brief) continue;
    await prisma.footballTransfer.update({
      where: { id: e.row.id },
      data: { aiBrief: brief, aiBriefAt: new Date() },
    });
    generated++;
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`[transfer-briefs] 완료 — 후보 ${enriched.length} / 신규 브리핑 ${generated} (${win.label})`);
  return { candidates: enriched.length, generated };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGenerateTransferBriefs()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
