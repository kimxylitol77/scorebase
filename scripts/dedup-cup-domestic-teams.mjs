// scripts/dedup-cup-domestic-teams.mjs
// 컵 네임스페이스 Team row 를 자국 리그 row 로 병합한다 (같은 ts 팀인데 우리 row 가 둘인 케이스).
//
// 왜: 한 tsId 가 두 ourId 를 가리키면 /api/internal/thesports-matches 의 JSON 폴백이
//     "unambiguous" 판정을 못 해 컵 매치가 skippedNoTeam 으로 빠지고, verify-football-season 의
//     team-mapping-rate 도 채울 수 없다 (대항전 시즌 ACTIVE 승격 차단).
//     collect-fa-cup.ts 의 seedTeamMappings 가 이미 "컵 행은 canonical 아님 — 도메스틱 우선"
//     정책을 쓰고 있어, 병합 방향은 컵 → 자국이 맞다.
//
// 판정 근거는 이름이 아니라 TheSports 원본이다:
//   - 각 row 의 "실제 ts 정체" = 자신의 TeamSourceId(thesports) → 없으면 매핑 tsId
//   - 두 row 의 ts 정체가 국가·이름에서 어긋나면 BLOCK (Barcelona ↔ Barcelona SC(ECU) 류 오매핑)
//   - 한 row 가 여러 tsId 그룹에 걸쳐 있고 그룹마다 상대 row 가 다르면 BLOCK
//
// 사용:
//   node --env-file=.env.local scripts/dedup-cup-domestic-teams.mjs                 # 전체 dry-run
//   node --env-file=.env.local scripts/dedup-cup-domestic-teams.mjs --cup UEL       # 컵 하나만
//   node --env-file=.env.local scripts/dedup-cup-domestic-teams.mjs --cup UEL --apply
//   TS_CACHE=/tmp/ts-team-cache.json ...  # ts 조회 캐시 경로 (기본 /tmp/ts-team-cache.json)

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CUP_ARG = (() => {
  const i = process.argv.indexOf("--cup");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].toUpperCase() : null;
})();
const CACHE_PATH = process.env.TS_CACHE ?? "/tmp/ts-team-cache.json";

const CUPS = new Set([
  "UCL", "UEL", "UECL", "UEFA_WCL",
  "AFC_CL", "AFC_CL_TWO",
  "COPA_LIB", "COPA_SUD", "CLUB_WORLD_CUP",
]);

const MAPPING_PATH = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf-8"));
const countryName = new Map(
  (JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/sports/thesports/country-list.json"), "utf-8")).results ?? [])
    .map((c) => [c.id, c.name]),
);

const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ts 팀 원본 조회 (id·이름·국가). 캐시 우선 — 재실행 때 API 를 다시 때리지 않는다. */
async function tsTeam(uuid) {
  if (cache[uuid] !== undefined) return cache[uuid];
  const url = new URL("https://api.thesports.com/v1/football/team/additional/list");
  url.searchParams.set("user", process.env.THESPORTS_USER ?? "");
  url.searchParams.set("secret", process.env.THESPORTS_SECRET ?? "");
  url.searchParams.set("uuid", uuid);
  let out = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const j = await res.json();
    const t = j.code === 0 && Array.isArray(j.results) ? j.results[0] : null;
    out = t
      ? { id: t.id, name: t.name, country_id: t.country_id, country: countryName.get(t.country_id) ?? t.country_id }
      : { error: "결과 없음" };
  } catch (e) {
    out = { error: String(e?.message ?? e) };
  }
  cache[uuid] = out;
  await sleep(120);
  return out;
}

const norm = (s) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|ca|club|de|el|cs|sk|as|us|ud|rc|bk|if|ff|aik)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
const like = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

async function buildPlan() {
  // 1) tsId 로 그룹핑 — ourId 가 둘 이상이고 한쪽이 컵 네임스페이스인 그룹
  const byTs = new Map();
  for (const e of mapping) {
    if (!byTs.has(e.tsId)) byTs.set(e.tsId, []);
    byTs.get(e.tsId).push(e);
  }
  const groups = [];
  for (const [tsId, entries] of byTs) {
    const ourIds = [...new Set(entries.map((e) => e.ourId))];
    if (ourIds.length < 2) continue;
    const cups = [...new Set(entries.filter((e) => CUPS.has(e.ourLeague)).map((e) => e.ourLeague))];
    if (cups.length === 0) continue;
    groups.push({ tsId, ourIds, cups });
  }

  // 2) Team / TeamSourceId / 매치 수
  const ids = [...new Set(groups.flatMap((g) => g.ourIds))];
  const teams = await prisma.team.findMany({
    where: { id: { in: ids } },
    select: { id: true, league: true, name: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const srcRows = await prisma.teamSourceId.findMany({
    where: { teamId: { in: ids }, source: "thesports" },
    select: { teamId: true, externalId: true },
  });
  const tsSrcByTeam = new Map();
  for (const s of srcRows) {
    if (!tsSrcByTeam.has(s.teamId)) tsSrcByTeam.set(s.teamId, new Set());
    tsSrcByTeam.get(s.teamId).add(s.externalId);
  }
  const matchCount = new Map();
  for (const id of ids) {
    matchCount.set(
      id,
      await prisma.match.count({ where: { OR: [{ homeTeamId: id }, { awayTeamId: id }] } }),
    );
  }

  // 3) row 가 여러 그룹에 걸치는지 (상대 row 집합이 다르면 병합 방향이 갈린다)
  const groupsOfRow = new Map();
  for (const g of groups) {
    for (const id of g.ourIds) {
      if (!groupsOfRow.has(id)) groupsOfRow.set(id, []);
      groupsOfRow.get(id).push(g);
    }
  }

  // 4) 판정
  const plan = [];
  for (const g of groups) {
    const rows = g.ourIds
      .map((id) => teamById.get(id))
      .filter(Boolean)
      .map((t) => ({
        id: t.id,
        league: t.league,
        name: t.name,
        isCup: CUPS.has(t.league),
        matches: matchCount.get(t.id) ?? 0,
        tsSrc: [...(tsSrcByTeam.get(t.id) ?? [])],
      }));
    const reasons = [];
    let verdict = "MERGE";

    if (rows.length !== g.ourIds.length) {
      verdict = "BLOCK";
      reasons.push("매핑이 가리키는 Team row 결번");
    }

    // (a) 여러 그룹에 걸친 row — 상대 row 집합이 같으면(매핑 json 이 tsId 만 둘) 문제 없음
    for (const r of rows) {
      const others = groupsOfRow.get(r.id) ?? [];
      if (others.length > 1) {
        const key = (x) => [...x.ourIds].sort((a, b) => a - b).join(",");
        const distinct = new Set(others.map(key));
        if (distinct.size > 1) {
          verdict = "BLOCK";
          reasons.push(`id=${r.id} 가 서로 다른 그룹 ${distinct.size}개에 등장 — 병합 상대가 갈린다`);
        }
      }
    }

    // (b) 각 row 의 실제 ts 정체 대조
    const idents = [];
    for (const r of rows) {
      const own = r.tsSrc.find((x) => x !== g.tsId);
      const useId = r.tsSrc.includes(g.tsId) || !own ? g.tsId : own;
      idents.push({ r, tsId: useId, team: await tsTeam(useId) });
    }
    const known = idents.filter((i) => i.team && !i.team.error);
    for (let a = 0; a < known.length; a++) {
      for (let b = a + 1; b < known.length; b++) {
        const A = known[a], B = known[b];
        if (A.tsId === B.tsId) continue;
        if (A.team.country_id !== B.team.country_id || !like(A.team.name, B.team.name)) {
          verdict = "BLOCK";
          reasons.push(
            `id=${A.r.id} 의 ts 정체 "${A.team.name}"(${A.team.country}) ≠ id=${B.r.id} 의 "${B.team.name}"(${B.team.country})`,
          );
        }
      }
    }
    if (known.length !== rows.length) {
      verdict = "BLOCK";
      reasons.push("ts 원본 조회 실패 — 판정 불가");
    }

    // (c) 우리 row 이름끼리 대조
    for (let a = 0; a < rows.length; a++) {
      for (let b = a + 1; b < rows.length; b++) {
        if (!like(rows[a].name, rows[b].name)) {
          verdict = "BLOCK";
          reasons.push(`우리 row 이름 불일치: "${rows[a].name}"(${rows[a].id}) vs "${rows[b].name}"(${rows[b].id})`);
        }
      }
    }

    rows.sort((a, b) => b.matches - a.matches || a.id - b.id);
    plan.push({
      tsId: g.tsId,
      tsName: (await tsTeam(g.tsId))?.name ?? null,
      cups: g.cups,
      verdict,
      reasons: [...new Set(reasons)],
      canonical: rows[0],
      dups: rows.slice(1),
    });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  return plan;
}

/** 부가 참조(아카이브) 이전 — 트랜잭션 안에서 호출. */
async function moveSideRefs(tx, dupId, canonicalId, log) {
  // TeamSeasonStatArchive: (teamId, seasonLabel) unique — canonical 에 같은 라벨이 있으면 컵 쪽 폐기
  const stats = await tx.teamSeasonStatArchive.findMany({
    where: { teamId: dupId },
    select: { id: true, seasonLabel: true },
  });
  for (const s of stats) {
    const clash = await tx.teamSeasonStatArchive.findUnique({
      where: { teamId_seasonLabel: { teamId: canonicalId, seasonLabel: s.seasonLabel } },
      select: { id: true },
    });
    if (clash) {
      await tx.teamSeasonStatArchive.delete({ where: { id: s.id } });
      log.statDropped++;
    } else {
      await tx.teamSeasonStatArchive.update({ where: { id: s.id }, data: { teamId: canonicalId } });
      log.statMoved++;
    }
  }

  // CoachTenureArchive: 팀당 현직(endedAt null) 1행 규칙 — canonical 에 현직이 있으면 컵 쪽 폐기
  const tenures = await tx.coachTenureArchive.findMany({
    where: { teamId: dupId },
    select: { id: true, endedAt: true },
  });
  for (const t of tenures) {
    if (t.endedAt === null) {
      const openOnCanonical = await tx.coachTenureArchive.count({
        where: { teamId: canonicalId, endedAt: null },
      });
      if (openOnCanonical > 0) {
        await tx.coachTenureArchive.delete({ where: { id: t.id } });
        log.coachDropped++;
        continue;
      }
    }
    await tx.coachTenureArchive.update({ where: { id: t.id }, data: { teamId: canonicalId } });
    log.coachMoved++;
  }

  // InjurySnapshot / User.favoriteTeam — FK 없음. 있으면 canonical 로 옮긴다.
  const inj = await tx.injurySnapshot.updateMany({ where: { teamId: dupId }, data: { teamId: canonicalId } });
  log.injuryMoved += inj.count;
  const fans = await tx.user.updateMany({ where: { favoriteTeamId: dupId }, data: { favoriteTeamId: canonicalId } });
  log.fansMoved += fans.count;
}

async function main() {
  console.log(`▶ 컵↔자국 Team 병합 (${APPLY ? "APPLY" : "dry-run"})${CUP_ARG ? ` — ${CUP_ARG} 만` : " — 전체"}\n`);

  const all = await buildPlan();
  const scoped = CUP_ARG ? all.filter((p) => p.cups.includes(CUP_ARG)) : all;
  const merge = scoped.filter((p) => p.verdict === "MERGE");
  const block = scoped.filter((p) => p.verdict === "BLOCK");

  console.log("=== 계획 ===");
  for (const m of merge) {
    console.log(
      `[${m.cups.join("+")}] keep ${m.canonical.id} [${m.canonical.league}] ${m.canonical.name} (매치 ${m.canonical.matches})`,
    );
    for (const d of m.dups) {
      console.log(`        del ${d.id} [${d.league}] ${d.name} (매치 ${d.matches}) → Match FK 이전`);
    }
  }
  const delRows = merge.reduce((s, m) => s + m.dups.length, 0);
  const fkRows = merge.reduce((s, m) => s + m.dups.reduce((t, d) => t + d.matches, 0), 0);
  console.log(`\n병합 그룹 ${merge.length} · 삭제 row ${delRows} · Match FK 이전 ${fkRows}`);

  if (block.length) {
    console.log(`\n=== BLOCK ${block.length}건 (사람 판단 — 자동 처리 안 함) ===`);
    for (const b of block) {
      console.log(`[${b.cups.join("+")}] ts=${b.tsId} "${b.tsName}"`);
      for (const r of [b.canonical, ...b.dups]) {
        if (r) console.log(`        ${r.id} [${r.league}] ${r.name} (매치 ${r.matches})`);
      }
      for (const rs of b.reasons) console.log(`        · ${rs}`);
    }
  }

  // 매핑 JSON 갱신 계획
  const idRemap = new Map();
  for (const m of merge) for (const d of m.dups) idRemap.set(d.id, m.canonical.id);
  const mappingChanges = mapping.filter((e) => idRemap.has(e.ourId));
  console.log(`\nts mapping 갱신 대상: ${mappingChanges.length} entries`);

  if (!APPLY) {
    console.log("\n[dry-run] 실제 변경 없음. --apply 로 실행.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== APPLY ===");
  const log = { statMoved: 0, statDropped: 0, coachMoved: 0, coachDropped: 0, injuryMoved: 0, fansMoved: 0, srcMoved: 0, srcDropped: 0, carried: 0 };
  await prisma.$transaction(
    async (tx) => {
      // 같은 row 쌍이 tsId 만 다른 두 그룹으로 잡히는 경우가 있다 (매핑 json 에 tsId 중복).
      // 두 번째 그룹에서 같은 row 를 또 지우면 P2025 로 트랜잭션 전체가 롤백된다.
      const donedups = new Set();
      for (const m of merge) {
        for (const d of m.dups) {
          if (donedups.has(d.id)) continue;
          donedups.add(d.id);
          const home = await tx.match.updateMany({ where: { homeTeamId: d.id }, data: { homeTeamId: m.canonical.id } });
          const away = await tx.match.updateMany({ where: { awayTeamId: d.id }, data: { awayTeamId: m.canonical.id } });

          // TeamSourceId — canonical 에 같은 (league, source, ext) 가 없으면 이전, 있으면 cascade 로 소멸
          const dupSources = await tx.teamSourceId.findMany({
            where: { teamId: d.id },
            select: { id: true, league: true, source: true, externalId: true },
          });
          for (const s of dupSources) {
            const clash = await tx.teamSourceId.findUnique({
              where: { league_source_externalId: { league: s.league, source: s.source, externalId: s.externalId } },
              select: { teamId: true },
            });
            if (clash && clash.teamId === m.canonical.id) {
              log.srcDropped++;
              continue;
            }
            await tx.teamSourceId.update({ where: { id: s.id }, data: { teamId: m.canonical.id } });
            log.srcMoved++;
          }

          await moveSideRefs(tx, d.id, m.canonical.id, log);

          // 표시용 필드 승계 — canonical 이 비어 있고 컵 row 가 들고 있으면 옮긴다.
          // (컵 row 에만 한글명이 있는 경우가 28건. 지우면 매치 카드가 영문으로 돌아간다.)
          const [cur, dead] = await Promise.all([
            tx.team.findUnique({ where: { id: m.canonical.id }, select: { nameKo: true, logoUrl: true } }),
            tx.team.findUnique({ where: { id: d.id }, select: { nameKo: true, logoUrl: true } }),
          ]);
          const carry = {};
          if (!cur?.nameKo && dead?.nameKo) carry.nameKo = dead.nameKo;
          if (!cur?.logoUrl && dead?.logoUrl) carry.logoUrl = dead.logoUrl;
          if (Object.keys(carry).length) {
            await tx.team.update({ where: { id: m.canonical.id }, data: carry });
            log.carried++;
          }

          await tx.team.delete({ where: { id: d.id } });
          console.log(`  ✗ del ${d.id} [${d.league}] ${d.name} → ${m.canonical.id} (home ${home.count}, away ${away.count})`);
        }
      }
    },
    { timeout: 300_000 },
  );

  console.log(
    `\n부가 참조 — 시즌스탯 이전 ${log.statMoved}/폐기 ${log.statDropped} · 감독이력 이전 ${log.coachMoved}/폐기 ${log.coachDropped} · 부상 ${log.injuryMoved} · 팬 ${log.fansMoved} · 소스ID 이전 ${log.srcMoved}/폐기 ${log.srcDropped} · 표시필드 승계 ${log.carried}`,
  );

  if (mappingChanges.length > 0) {
    for (const e of mapping) if (idRemap.has(e.ourId)) e.ourId = idRemap.get(e.ourId);
    fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
    console.log(`✓ team-id-mapping.json 갱신: ${mappingChanges.length} entries`);
  }

  console.log("\n✓ 완료");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
