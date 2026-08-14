// 유령(중복) 선수 페이지 → 정본 페이지 리다이렉트 맵 산출
//   → data/player-canonical-redirects.json { 유령 tsId: 정본 tsId }
//
// 배경: TheSports 가 한 선수에 ts id 를 여러 개 부여한다. 이적 시 새 id 로 갈아타면서
//   옛 id 의 몸값 기록이 그 시점에 멈추는데, /transfers/{옛id} 페이지는 그대로 살아 있다.
//   (실측 2026-08-14: 크바라츠헬리아 = 현역 PSG 140M + 유령 나폴리 85M[2023-03 정지])
//   /transfers 목록은 dedup 하지만 개별 페이지·sitemap 은 걸러지지 않아 중복 색인된다.
//
// 판정: 같은 영문명 + 같은 추정 생년(마지막 갱신 연도 - 그때 나이) 만 동일인으로 본다.
//   생년이 다르면 진짜 동명이인이라 절대 묶지 않는다 (디에고 로페스·라울 가르시아 등).
// 정본: 활성 행(18개월 내 갱신) 중 ① 최근 갱신 → ② 리그 보유 → ③ 몸값 순.
//   소속팀·몸값이 최신인 쪽이어야 한다 — 유령은 몇 년 전 스냅샷이라 정보가 틀렸다.
// af 매핑 상속: 그룹 안에서 af 매핑이 유령 쪽에만 붙어 있으면 정본에 물려준다.
//   같은 사람이니 af id 도 같다. 이걸 안 하면 경력표를 가진 쪽이 유령일 때(실측 28건,
//   세르니콜라·베네디차크·본판티 등) 리다이렉트가 경력표를 버리는 셈이 된다.
//   ts-af-player-map.json 에 직접 써넣는다 — build-ts-af-player-map 이 기존 맵을
//   병합 보존(prevMap)하므로 주간 재빌드에도 살아남는다.
//
// 재실행: 멱등. 몸값 피드 갱신 후 주기적으로. 유령이 다시 활성화되면 자동으로 맵에서 빠진다.
//   npx tsx --env-file=.env.local scripts/build-player-canonical-map.ts
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import { tsPlayerToAf } from "../src/lib/players/ts-af-map";

const prisma = new PrismaClient();

// /transfers 목록 dedup 과 같은 정규화 (발음기호·대소문자·구분자 무시)
const normEn = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();

// 이름 토큰 집합 — 완전일치가 못 잡는 표기차(미들네임 유무·어순 뒤바뀜·발음기호)용.
//  "Vítor Ferreira"(유령) ↔ "Vitor Machado Ferreira"(현역) 은 normEn 키가 갈린다.
const FOLD: Record<string, string> = { "ø": "o", "å": "a", "ł": "l", "ß": "ss", "æ": "ae", "ð": "d", "þ": "th", "đ": "d", "ı": "i", "ŧ": "t", "ħ": "h" };
const TOK_STOP = new Set(["de", "da", "do", "dos", "del", "la", "le", "van", "von", "di", "el", "al", "bin", "ben", "the", "jr"]);
const tokset = (s: string) =>
  new Set(
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[øåłßæðþđıŧħ]/g, (c) => FOLD[c] || c)
      .split(/[\s·.\-']+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length >= 2 && !TOK_STOP.has(t)),
  );

interface Row {
  id: string;
  name: string;
  nameKo: string;
  league: string | null;
  value: number;
  last: number;        // 마지막 몸값 갱신 unix 초
  born: number | null; // 추정 생년
  af: number | null;
  tok: Set<string>;
}

async function main() {
  const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // /transfers 활성 기준과 동일

  const mv = await prisma.playerMarketValue.findMany({
    where: { currentValue: { not: null } },
    select: { id: true, league: true, currentValue: true, age: true, history: true },
  });
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: mv.map((m) => m.id) } },
    select: { id: true, name: true, nameKo: true },
  });
  await prisma.$disconnect();
  const nameById = new Map(players.map((p) => [p.id, p]));

  const rows: Row[] = [];
  for (const m of mv) {
    const p = nameById.get(m.id);
    if (!p?.name) continue;
    const hist = m.history as { market_time?: number; age?: number }[] | null;
    const lastEntry = Array.isArray(hist) ? hist[hist.length - 1] : null;
    const last = lastEntry?.market_time ?? 0;
    const ageThen = lastEntry?.age ?? m.age;
    rows.push({
      id: m.id,
      name: p.name,
      nameKo: p.nameKo || p.name,
      league: m.league,
      value: Number(m.currentValue),
      last,
      born: last && ageThen ? new Date(last * 1000).getUTCFullYear() - ageThen : null,
      af: tsPlayerToAf(m.id),
      tok: tokset(p.name),
    });
  }

  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    const k = normEn(r.name);
    if (k) byName.set(k, [...(byName.get(k) ?? []), r]);
  }

  // 정본 우선순위 — 앞에 오는 것이 정본. 소속·몸값이 최신인 행을 고른다.
  const better = (a: Row, b: Row) =>
    b.last - a.last ||
    (b.league ? 1 : 0) - (a.league ? 1 : 0) ||
    b.value - a.value;

  const map: Record<string, string> = {};
  const inherit: Record<string, number> = {}; // 정본 tsId → 물려받을 af id
  let groups = 0, skippedDiffBorn = 0, skippedNoBorn = 0;
  for (const g of byName.values()) {
    if (g.length < 2) continue;
    // 활성(18개월 내 갱신)인 행이 그룹의 기준점. 전부 옛날이면 어느 쪽도 정본이 아니라 건너뛴다.
    const live = g.filter((r) => r.last >= cutoff);
    if (!live.length) continue;
    const canon = [...live].sort(better)[0];
    if (canon.born == null) { skippedNoBorn++; continue; }
    let merged = 0;
    for (const r of g) {
      if (r.id === canon.id) continue;
      if (r.last >= cutoff) continue;          // 둘 다 활성 — 별개 선수일 수 있어 건드리지 않는다
      if (r.born == null) { skippedNoBorn++; continue; }
      if (r.born !== canon.born) { skippedDiffBorn++; continue; } // 동명이인
      map[r.id] = canon.id;
      merged++;
      if (!canon.af && r.af && !inherit[canon.id]) inherit[canon.id] = r.af;
    }
    if (merged) groups++;
  }

  const exactCount = Object.keys(map).length;

  // 2단계 — 이름 표기가 달라 위 그룹에 못 든 유령. 같은 추정 생년 안에서만 찾고,
  //  한쪽 토큰이 다른 쪽의 부분집합이며 후보가 유일할 때만 묶는다. 생년으로 먼저 좁히므로
  //  흔한 이름의 동명이인이 섞일 여지가 작다 (실측: 후보 다중 0건).
  {
    const liveByBorn = new Map<number, Row[]>();
    for (const r of rows) {
      if (r.last >= cutoff && r.born != null) liveByBorn.set(r.born, [...(liveByBorn.get(r.born) ?? []), r]);
    }
    for (const d of rows) {
      if (d.last >= cutoff || map[d.id]) continue;
      if (d.born == null || d.tok.size < 2) continue;
      const cands = (liveByBorn.get(d.born) ?? []).filter(
        (l) => l.tok.size >= 2 && ([...d.tok].every((t) => l.tok.has(t)) || [...l.tok].every((t) => d.tok.has(t))),
      );
      if (cands.length !== 1) continue;
      map[d.id] = cands[0].id;
      if (!cands[0].af && d.af && !inherit[cands[0].id]) inherit[cands[0].id] = d.af;
    }
  }

  fs.writeFileSync("data/player-canonical-redirects.json", JSON.stringify(map, null, 0));
  console.log(
    `유령 → 정본 ${Object.keys(map).length}건 (이름일치 ${exactCount} + 표기차 ${Object.keys(map).length - exactCount}, 그룹 ${groups}) · 동명이인 제외 ${skippedDiffBorn} · 생년불명 제외 ${skippedNoBorn}`,
  );

  // af 매핑 상속 — 유령이 갖고 있던 af id 를 정본에 붙인다 (afToTs 도 정본을 가리키게 재생성)
  if (Object.keys(inherit).length) {
    const file = JSON.parse(fs.readFileSync("data/ts-af-player-map.json", "utf8")) as {
      tsToAf: Record<string, number>;
    };
    for (const [tsId, afId] of Object.entries(inherit)) file.tsToAf[tsId] = afId;
    const afToTs: Record<number, string> = {};
    // 유령이 먼저 오면 정본이 덮어쓰도록 정본 키를 나중에 넣는다
    for (const [ts, a] of Object.entries(file.tsToAf)) if (!inherit[ts]) afToTs[a] = ts;
    for (const [ts] of Object.entries(inherit)) afToTs[file.tsToAf[ts]] = ts;
    fs.writeFileSync("data/ts-af-player-map.json", JSON.stringify({ tsToAf: file.tsToAf, afToTs }, null, 0));
    console.log(`  af 매핑 상속: ${Object.keys(inherit).length}건 → 정본에 경력표 부여`);
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const weak = Object.entries(map).filter(([, to]) => !rowById.get(to)?.af && !inherit[to]);
  console.log(`  상속 후에도 정본에 경력표 없음: ${weak.length}건 (양쪽 다 매핑 없음 — 리다이렉트만)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
