// 팀명 한글화 감사 — 미한글화 팀 스캔 + 위키 ko 문서명 자동 조회 → RAW 붙여넣기 블록 출력.
// 리그 온보딩 체크리스트 3단계(한글 팀명)의 실행 도구. 2026-08-09 829건 일괄(75255f5) 절차의 상설화.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/audit-team-names-ko.ts            # 전체 스캔
//   npx tsx --env-file=.env.local scripts/audit-team-names-ko.ts LIGUE_2    # 특정 리그만
//
// 출력: (1) 위키 ko 확보분 — team-names.ts RAW 에 그대로 붙여넣는 블록
//       (2) 가드 걸림 — 위키 문서가 축구 클럽/국가가 아니거나 약자 키 (수동 확인 후 등록)
//       (3) 위키 미확보분 — 음역 수작업 대상 목록 (여자 클럽은 "위민" 접미 관행)
// 주의: QPR·PAOK·LASK·T1 처럼 라틴 표기가 한국 매체 관행인 팀은 값에 한글이 없어 계속
//       잡힌다 — 의도된 잔여이니 억지로 한글화하지 말 것 (2026-08-09 기준 25건).
// 가드 배경: "JJK"→주술회전(만화)·"ABB"→ABB 그룹(기업)·"Grasshopper"→메뚜기(곤충)처럼
//       동명의 다른 위키 문서를 집어 오역이 사전에 유입된 사고(2026-08-11 교정 ec2c6df).
//       shortdesc 가 클럽/국가가 아니면 자동 채택 블록에서 제외한다.
import { PrismaClient } from "@prisma/client";
import { toKoreanTeamName } from "@/lib/team-names";

// 친선 2종은 군소·유스 클럽이 수백 팀 섞여 전체 스캔의 소음이 된다 — 필요하면 리그 인자로
// 명시 실행(스킵은 전체 스캔에만 적용). UFC·e스포츠는 팀명 체계가 달라 이 절차 대상이 아님.
const SKIP_LEAGUES = new Set([
  "CLUB_FRIENDLY", "INTL_FRIENDLY",
  "UFC", "LCK", "LCK_CL", "LPL", "LEC", "LCS", "EWC", "NBA_SL",
]);

interface WikiHit {
  ko: string;
  shortdesc?: string; // Wikidata 짧은 설명 (예: "Finnish association football club")
  disambig: boolean;
}

async function wikiKo(names: string[]): Promise<Map<string, WikiHit>> {
  const out = new Map<string, WikiHit>();
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query", prop: "langlinks|pageprops", lllang: "ko", lllimit: "max",
      ppprop: "wikibase-shortdesc|disambiguation",
      redirects: "1", format: "json", titles: batch.join("|"),
    });
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        headers: { "User-Agent": "scorebase-team-ko/1.0 (ops@scorebase.kr)" },
      });
      const d = (await r.json()) as {
        query?: {
          normalized?: { from: string; to: string }[];
          redirects?: { from: string; to: string }[];
          pages?: Record<string, {
            title?: string;
            langlinks?: { lang: string; "*": string }[];
            pageprops?: { "wikibase-shortdesc"?: string; disambiguation?: string };
          }>;
        };
      };
      // normalized→redirects 체인을 되짚어 원래 입력명으로 복원
      const chain = new Map<string, string>();
      for (const n of d.query?.normalized ?? []) chain.set(n.to, n.from);
      for (const rd of d.query?.redirects ?? []) chain.set(rd.to, chain.get(rd.from) ?? rd.from);
      for (const p of Object.values(d.query?.pages ?? {})) {
        const orig = chain.get(p.title ?? "") ?? p.title ?? "";
        const ko = (p.langlinks ?? []).find((l) => l.lang === "ko")?.["*"];
        // 괄호 주석 제거 — "FC 낭트 (축구단)" → "FC 낭트"
        if (ko && orig) {
          out.set(orig, {
            ko: ko.replace(/\s*\([^)]*\)\s*$/, "").trim(),
            shortdesc: p.pageprops?.["wikibase-shortdesc"],
            disambig: p.pageprops?.disambiguation !== undefined,
          });
        }
      }
    } catch (e) {
      console.warn(`  위키 배치 ${i} 실패: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

// 자동 채택 가드 — 통과 못 하면 사유 문자열 반환 (수동 확인 목록행).
// 동명이의 위키 문서(만화·기업·곤충·도시)를 집은 오역이 사전에 그대로 유입된 사고 방지.
// \b 필수 — "multinational company"(ABB 그룹)가 /nation/ 부분 문자열로 통과한 사례
const CLUB_DESC_RE = /\b(football|soccer|club|sports? team|futsal|country|sovereign|nation|national team)\b/i;
function guardReason(name: string, hit: WikiHit): string | null {
  if (hit.disambig) return "동음이의 문서";
  if (hit.shortdesc && !CLUB_DESC_RE.test(hit.shortdesc)) return `문서가 클럽/국가 아님: ${hit.shortdesc}`;
  // 약자 키(영문 4자 이하)는 리다이렉트가 엉뚱한 유명 문서로 튀는 단골 — 설명 없으면 수동
  if (!hit.shortdesc && name.replace(/[^A-Za-z]/g, "").length <= 4) return "약자 키 + 문서 설명 없음";
  return null;
}

(async () => {
  const onlyLeague = process.argv[2];
  const prisma = new PrismaClient();
  const rows = await prisma.match.findMany({
    where: {
      startTime: { gte: new Date(Date.now() - 400 * 86400e3) },
      ...(onlyLeague ? { league: onlyLeague } : {}),
    },
    // (스킵은 전체 스캔에만 — 리그를 명시하면 친선이라도 스캔한다)
    select: { league: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  const missByName = new Map<string, Set<string>>(); // name → leagues
  for (const m of rows) {
    if (!onlyLeague && SKIP_LEAGUES.has(m.league)) continue;
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (/[가-힣]/.test(toKoreanTeamName(t.name, m.league))) continue;
      if (!missByName.has(t.name)) missByName.set(t.name, new Set());
      missByName.get(t.name)!.add(m.league);
    }
  }
  await prisma.$disconnect();

  const names = [...missByName.keys()].sort();
  console.log(`미한글화 팀: ${names.length}${onlyLeague ? ` (${onlyLeague})` : ""}`);
  if (names.length === 0) return;

  console.log("위키 ko 조회 중...");
  const wiki = await wikiKo(names);
  const esc = (x: string) => x.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const auto: string[] = [];
  const guarded: { name: string; reason: string }[] = [];
  const missWiki: string[] = [];
  for (const n of names) {
    const h = wiki.get(n);
    if (!h) { missWiki.push(n); continue; }
    const reason = guardReason(n, h);
    if (reason) guarded.push({ name: n, reason });
    else auto.push(n);
  }
  if (auto.length) {
    console.log(`\n── 위키 확보 ${auto.length}건 — team-names.ts RAW 에 붙여넣기 ──`);
    for (const n of auto) console.log(`  "${esc(n)}": "${esc(wiki.get(n)!.ko)}",`);
  }
  if (guarded.length) {
    console.log(`\n── 가드 걸림 ${guarded.length}건 — 위키 값 있지만 자동 채택 금지, 수동 확인 ──`);
    for (const g of guarded) {
      console.log(`  "${esc(g.name)}": "${esc(wiki.get(g.name)!.ko)}",  // ${g.reason}  [${[...missByName.get(g.name)!].join(",")}]`);
    }
  }
  if (missWiki.length) {
    console.log(`\n── 위키 미확보 ${missWiki.length}건 — 음역 수작업 대상 (리그 병기) ──`);
    for (const n of missWiki) console.log(`  ${n}  [${[...missByName.get(n)!].join(",")}]`);
  }
})();
