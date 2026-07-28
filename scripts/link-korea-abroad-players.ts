// 해외파 선수 ↔ TheSports 선수 id 연결 — data/korea-abroad.json 의 tsId·nameKo 를 채운다.
//
// 왜 팀 스쿼드인가: af 이름만으로 ts 전체(한국 국적 795명)를 뒤지면 어순이 같은 동명이인에 붙는다
//   (홍현석 Hong Hyun-Seok ↔ 홍석현 Hong Seok-hyun 실측 오매칭). 팀을 먼저 좁히면 같은 팀에
//   한국인 동명이인이 사실상 없어 안전하다.
//
// 경로: af 팀 id → TeamSourceId(api-football) → Team → TeamSourceId(thesports) → team/squad/list
//       → 스쿼드 중 한국 국적(player-overrides) 선수 → 어순 지킨 이름 매칭 → tsId·nameKo 확정
//
// tsId 가 붙으면 페이지에서 /transfers/{tsId} 선수 페이지로 링크된다.
// ts whitelisted IP 필요(맥북·맥미니 OK). 호출량 = 팀 수(20여 콜), 0.5s 간격.
//
//   npx tsx --env-file=.env.local scripts/link-korea-abroad-players.ts
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import rawOverrides from "../data/player-overrides.json";

const OVERRIDES = rawOverrides as Record<string, { country?: string; nameKo?: string }>;
const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "korea-abroad.json");
const MANUAL = path.join(__dirname, "..", "data", "korea-abroad-names.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toks(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s\-.'·]+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .filter(Boolean);
}
function orderedKeys(name: string): string[] {
  const t = toks(name);
  if (t.length < 2) return t.length ? [t.join("")] : [];
  return [...new Set([t.join(""), [...t.slice(1), t[0]].join("")])];
}

interface Player {
  afId: number;
  tsId: string | null;
  nameKo: string;
  nameEn: string;
  team: { afId: number; name: string; logo: string | null };
}
interface SquadResp {
  code: number;
  results?: Array<{ squad?: Array<{ player?: { id?: string; name?: string } }> }>;
}

async function main() {
  const doc = JSON.parse(fs.readFileSync(OUT, "utf8")) as { players: Player[] };
  const manual: Record<string, string> = fs.existsSync(MANUAL) ? JSON.parse(fs.readFileSync(MANUAL, "utf8")) : {};

  // af 팀 → ts 팀
  const afIds = [...new Set(doc.players.map((p) => String(p.team.afId)))];
  const afSrc = await prisma.teamSourceId.findMany({
    where: { source: "api-football", externalId: { in: afIds } },
    select: { externalId: true, teamId: true },
  });
  const afToOur = new Map(afSrc.map((s) => [s.externalId, s.teamId]));
  const tsSrc = await prisma.teamSourceId.findMany({
    where: { source: "thesports", teamId: { in: [...new Set(afSrc.map((s) => s.teamId))] } },
    select: { teamId: true, externalId: true },
  });
  const tsByOur = new Map(tsSrc.map((s) => [s.teamId, s.externalId]));

  // 팀별 스쿼드 1회씩만 호출
  const needTeams = [
    ...new Set(
      doc.players
        .filter((p) => !p.tsId)
        .map((p) => afToOur.get(String(p.team.afId)))
        .filter((v): v is number => v != null)
        .map((ourId) => tsByOur.get(ourId))
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  console.log(`ts 스쿼드 조회 대상 팀 ${needTeams.length}`);

  const squadByTeam = new Map<string, Array<{ id: string; name: string }>>();
  for (const tid of needTeams) {
    try {
      const res = await thesportsGet<SquadResp>("/v1/football/team/squad/list", { uuid: tid });
      const squad = (res.results?.[0]?.squad ?? [])
        .map((s) => ({ id: s.player?.id ?? "", name: s.player?.name ?? "" }))
        .filter((s) => s.id && s.name);
      squadByTeam.set(tid, squad);
    } catch (e) {
      console.log(`  스쿼드 실패 ${tid}: ${(e as Error).message.slice(0, 60)}`);
    }
    await sleep(500);
  }

  // ts 선수 한글명
  const allIds = [...new Set([...squadByTeam.values()].flat().map((s) => s.id))];
  const tsp = await prisma.theSportsPlayer.findMany({
    where: { id: { in: allIds } },
    select: { id: true, nameKo: true },
  });
  const koById = new Map(tsp.map((t) => [t.id, t.nameKo]));

  let linked = 0;
  let named = 0;
  for (const p of doc.players) {
    if (p.tsId) continue;
    const ourId = afToOur.get(String(p.team.afId));
    const tsTeam = ourId ? tsByOur.get(ourId) : null;
    const squad = tsTeam ? squadByTeam.get(tsTeam) : null;
    if (!squad) continue;

    // 팀 안에서 한국 국적 + 어순 지킨 이름 매칭
    const keys = new Set(orderedKeys(p.nameEn));
    const hit = squad.find(
      (s) => OVERRIDES[s.id]?.country === "대한민국" && orderedKeys(s.name).some((k) => keys.has(k)),
    );
    if (!hit) continue;
    p.tsId = hit.id;
    linked++;

    // 한글명 — 수동 사전이 있으면 건드리지 않는다
    if (manual[p.nameEn]) continue;
    const ko = koById.get(hit.id) ?? OVERRIDES[hit.id]?.nameKo ?? null;
    if (ko && /[가-힣]/.test(ko) && !/[a-zA-Z]/.test(ko) && p.nameKo === p.nameEn) {
      p.nameKo = ko;
      named++;
    }
  }

  // 2차 — ts 팀 매핑이 없어 스쿼드를 못 본 선수는 확정된 한글명으로 잇는다.
  //   한국 국적 ts 선수 중 nameKo 가 정확히 일치하고 **유일**할 때만 채택(동명이인이면 보류).
  const remain = doc.players.filter((p) => !p.tsId && /[가-힣]/.test(p.nameKo));
  if (remain.length) {
    const korIds = Object.keys(OVERRIDES).filter((id) => OVERRIDES[id].country === "대한민국");
    const korPlayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: korIds }, nameKo: { in: remain.map((p) => p.nameKo) } },
      select: { id: true, nameKo: true },
    });
    const byKo = new Map<string, string[]>();
    for (const t of korPlayers) {
      const arr = byKo.get(t.nameKo!) ?? [];
      arr.push(t.id);
      byKo.set(t.nameKo!, arr);
    }
    for (const p of remain) {
      const ids = byKo.get(p.nameKo);
      if (ids?.length === 1) {
        p.tsId = ids[0];
        linked++;
      } else if (ids && ids.length > 1) {
        console.log(`  동명이인 보류: ${p.nameKo} (${ids.length}명)`);
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
  const stillEn = doc.players.filter((p) => !/[가-힣]/.test(p.nameKo));
  console.log(`\ntsId 연결 +${linked} (총 ${doc.players.filter((p) => p.tsId).length}/${doc.players.length})`);
  console.log(`한글명 +${named}, 남은 영문 ${stillEn.length}명: ${stillEn.map((p) => p.nameEn).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
