// 베트맨 팀명 → 우리 Team.id 사전 생성 → data/betman-team-map.json
//
// 왜 이름 매칭이 아니라 경기 대조인가.
//   베트맨은 팀 id 를 주지만 우리 매핑 테이블에 없다. 이름으로 붙이려니 표기가 갈린다 —
//   "한신 타이거즈"(베트맨) vs "한신 타이거스"(우리), "주니치 드래건스" vs "드래곤스".
//   문자 유사도만으로는 71% 에서 멈췄고, "시카고"처럼 컵스·화이트삭스 둘 다에 걸리는
//   위험한 매칭도 생겼다.
//   대신 **경기(킥오프 시각)** 로 대조하면 같은 시각·같은 대진이 한 쌍으로 떨어진다.
//   시각이 같은 우리 경기 후보들 중 양 팀 이름 유사도(bigram Dice) 합이 가장 높은 것을
//   고르되, 2등과 충분히 벌어질 때만 채택한다. 이렇게 얻은 팀 쌍을 이름별로 투표해
//   최다 득표 팀을 확정한다.
//
//   npx tsx --env-file=.env.local scripts/build-betman-team-map.ts
//
// 재실행 권장 시점: 새 리그가 베트맨 발매에 등장했을 때. 기존 항목은 유지(병합)한다.

import { PrismaClient } from "@prisma/client";
import { toKoreanTeamName } from "../src/lib/team-names";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "betman-team-map.json");

/**
 * 경기 대조로 안 잡히는 팀 — 우리 일정에 그 경기가 없어서다(슈퍼컵·친선·남미·북유럽).
 * 영문명으로 직접 확인해 넣는다. 값은 Team.id.
 * 확인 방법: prisma.team.findMany({ where: { name: { contains: "<영문명>" } } }) 로 실물 대조.
 */
const MANUAL: Record<string, number> = {
  "AC밀란": 181, // AC Milan (SERIE_A)
  "아스널": 1554, // Arsenal (EPL)
  "맨체스터 시티": 1543, // Manchester City (EPL)
  "에버턴": 1558, // Everton (EPL)
  "뉴캐슬 유나이티드": 1528, // Newcastle (EPL)
  "애스턴 빌라": 1527, // Aston Villa (EPL)
  "파리 생제르맹": 293, // Paris Saint Germain (LIGUE_1)
  "RC랑스": 277, // Lens (LIGUE_1)
  "애슬레틱스": 968, // Athletics (MLB)
  "로센보르그BK": 287837, // Rosenborg (ELITESERIEN)
  "비킹FK": 287839, // Viking (ELITESERIEN)
  "데포르테스 톨리마": 119221, // Deportes Tolima (COPA_LIB)
  "CA플라텐세": 119223, // Platense (COPA_LIB)
  "코킴보 우니도": 119220, // Coquimbo Unido (COPA_LIB)
  // 우리 DB 의 nameKo 가 옛 구단명("Independiente José Terán")을 기계번역한 "무소속 호세 테란"
  // 이라 이름으로는 절대 안 잡힌다. 영문명 대조로 확정.
  "인디펜디엔테 델바예": 119228, // Independiente del Valle (COPA_LIB)
};

const norm = (s: string) => s.replace(/[\s·.()]/g, "").toLowerCase();

function bigrams(s: string): Set<string> {
  const t = norm(s);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  if (t.length === 1) out.add(t);
  return out;
}

function dice(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** 우리 팀의 표기 후보 — 축구는 nameKo, 야구는 name 에 한글이 들어 있고 사전값도 다르다. */
function keysOf(t: { name: string; nameKo: string | null; league: string }): string[] {
  const ko = (() => { try { return toKoreanTeamName(t.name, t.league); } catch { return null; } })();
  return [t.nameKo, t.name, ko].filter((x): x is string => !!x);
}

const score = (bmName: string, t: { name: string; nameKo: string | null; league: string }) =>
  Math.max(...keysOf(t).map((k) => dice(bmName, k)), 0);

async function main() {
  const bm = await prisma.betmanOdds.findMany({
    where: { betTypNm: { in: ["승무패", "일반 승패"] }, winAllot: { not: null } },
    select: { gameDate: true, homeName: true, awayName: true },
    distinct: ["gameDate", "homeName", "awayName"],
  });
  if (bm.length === 0) throw new Error("BetmanOdds 가 비어 있다 — 수집 잡을 먼저 돌려라");

  const times = bm.map((b) => b.gameDate.getTime());
  const ours = await prisma.match.findMany({
    where: { startTime: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) } },
    select: {
      league: true, startTime: true,
      homeTeam: { select: { id: true, name: true, nameKo: true } },
      awayTeam: { select: { id: true, name: true, nameKo: true } },
    },
  });
  const byTime = new Map<number, typeof ours>();
  for (const o of ours) {
    const a = byTime.get(o.startTime.getTime()) ?? [];
    a.push(o);
    byTime.set(o.startTime.getTime(), a);
  }

  // 이름별 팀 득표 — 한 이름이 여러 경기에 나오므로 다수결이 오매칭을 흡수한다.
  const votes = new Map<string, Map<number, number>>();
  let matched = 0, ambiguous = 0, noCand = 0;
  for (const b of bm) {
    const cands = byTime.get(b.gameDate.getTime()) ?? [];
    if (!cands.length) { noCand++; continue; }
    const scored = cands
      .map((c) => ({
        c,
        s: (score(b.homeName, { ...c.homeTeam, league: c.league }) +
            score(b.awayName, { ...c.awayTeam, league: c.league })) / 2,
      }))
      .sort((x, y) => y.s - x.s);
    const [top, second] = scored;
    // 절대 점수와 2등과의 격차 둘 다 봐야 한다 — 같은 시각 경기가 최대 69개까지 몰린다.
    if (top.s < 0.45 || (second && top.s - second.s < 0.12)) { ambiguous++; continue; }
    matched++;
    for (const [nm, tm] of [[b.homeName, top.c.homeTeam], [b.awayName, top.c.awayTeam]] as const) {
      const v = votes.get(nm) ?? new Map<number, number>();
      v.set(tm.id, (v.get(tm.id) ?? 0) + 1);
      votes.set(nm, v);
    }
  }
  console.log(`경기 대조: ${bm.length}건 → 확정 ${matched} / 모호 ${ambiguous} / 후보없음 ${noCand}`);

  // 기존 사전 병합 — 이번 회차에 안 나온 팀을 잃지 않는다.
  const out: Record<string, number> = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8"))
    : {};
  let auto = 0;
  for (const [name, v] of votes) {
    const [teamId] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
    if (out[name] !== teamId) auto++;
    out[name] = teamId;
  }
  for (const [name, id] of Object.entries(MANUAL)) out[name] = id;

  // 로고 없는 팀을 가리키면 사전에 있어도 화면엔 안 나온다 — 미리 알린다.
  const ids = [...new Set(Object.values(out))];
  const teams = await prisma.team.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, logoUrl: true },
  });
  const meta = new Map(teams.map((t) => [t.id, t]));
  const noLogo = Object.entries(out).filter(([, id]) => !meta.get(id)?.logoUrl);
  const dangling = Object.entries(out).filter(([, id]) => !meta.has(id));

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`✓ ${OUT} — 총 ${Object.keys(out).length}개 (경기 대조 ${auto} 갱신 + 수동 ${Object.keys(MANUAL).length})`);
  if (noLogo.length) console.log(`  ⚠️ 로고 없는 팀 ${noLogo.length}:`, noLogo.map(([n]) => n).slice(0, 10));
  if (dangling.length) console.log(`  ⚠️ 존재하지 않는 Team.id ${dangling.length}:`, dangling.slice(0, 10));

  // 이번 회차에 뜬 이름 중 사전에 없는 것 = 다음에 채워야 할 목록
  const all = new Set<string>();
  for (const b of bm) { all.add(b.homeName); all.add(b.awayName); }
  const missing = [...all].filter((n) => out[n] == null);
  console.log(`  커버리지 ${all.size - missing.length}/${all.size} (${Math.round((all.size - missing.length) * 100 / all.size)}%)`);
  if (missing.length) console.log("  미해결:", missing);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
