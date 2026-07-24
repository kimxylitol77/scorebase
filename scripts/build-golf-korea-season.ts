// 골프 한국 선수 시즌 성적 집계 → data/golf-korea-season.json
// ESPN ?dates=YYYY (PGA·LPGA 시즌 전체 대회 + 리더보드) 를 훑어 한국 선수만 추출·집계.
// 응답이 10MB 급이라 페이지에서 직접 못 씀 → 이 스크립트로 정적 JSON 생성.
// 선수 한글명은 위키 ko langlink → 미확보분 Haiku 음역.
//
// 실행: tsx scripts/build-golf-korea-season.ts [연도]
// 환경변수: ANTHROPIC_API_KEY (없으면 위키분만)

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const YEAR = process.argv[2] ?? String(new Date().getFullYear());
const OUT = "data/golf-korea-season.json";
const NAME_DICT = "data/golf-player-names.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

interface Recent {
  event: string;
  date: string;
  order: number | null;
  score: string | null;
}
interface KoreanPlayer {
  tour: "PGA" | "LPGA";
  name: string;
  id: string | null;
  starts: number;
  wins: number;
  top10: number;
  best: number | null;
  recent: Recent[];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface ScoreboardResp {
  events?: Array<{
    name?: string;
    date?: string;
    status?: { type?: { state?: string } };
    competitions?: Array<{
      competitors?: Array<{
        order?: number;
        score?: string | number;
        athlete?: {
          displayName?: string;
          flag?: { alt?: string };
          links?: Array<{ rel?: string[]; href?: string }>;
        };
      }>;
    }>;
  }>;
}

async function collect(): Promise<KoreanPlayer[]> {
  const agg = new Map<string, KoreanPlayer>();
  for (const tour of ["pga", "lpga"] as const) {
    const j = await getJson<ScoreboardResp>(
      `https://site.api.espn.com/apis/site/v2/sports/golf/${tour}/scoreboard?dates=${YEAR}`,
    );
    const events = (j?.events ?? []).filter((e) => e.status?.type?.state === "post");
    console.log(`  ${tour.toUpperCase()} 종료 대회 ${events.length}개`);
    for (const e of events) {
      for (const c of e.competitions?.[0]?.competitors ?? []) {
        // 국적 판별 — ESPN flag.alt 고정 표기
        if (c.athlete?.flag?.alt !== "South Korea") continue;
        const name = c.athlete.displayName;
        if (!name) continue;
        // 시즌 응답엔 athlete.id 가 없어 이름을 키로 사용(노트 참고)
        const key = `${tour}|${name}`;
        const p =
          agg.get(key) ??
          ({
            tour: tour.toUpperCase() as "PGA" | "LPGA",
            name,
            id: null,
            starts: 0,
            wins: 0,
            top10: 0,
            best: null,
            recent: [],
          } as KoreanPlayer);
        p.starts++;
        const order = c.order ?? null;
        if (order === 1) p.wins++;
        if (order != null && order <= 10) p.top10++;
        if (order != null && (p.best == null || order < p.best)) p.best = order;
        if (!p.id) {
          const href =
            (c.athlete.links ?? []).find((l) => (l.rel ?? []).some((r) => /playercard|athlete/.test(r)))
              ?.href ?? "";
          p.id = href.match(/\/id\/(\d+)/)?.[1] ?? null;
        }
        p.recent.push({
          event: e.name ?? "",
          date: e.date?.slice(0, 10) ?? "",
          order,
          score: c.score != null ? String(c.score) : null,
        });
        agg.set(key, p);
      }
    }
  }
  // 최근 성적은 날짜 내림차순 5개만
  for (const p of agg.values()) {
    p.recent.sort((a, b) => b.date.localeCompare(a.date));
    p.recent = p.recent.slice(0, 5);
  }
  return [...agg.values()].sort(
    (a, b) => b.wins - a.wins || b.top10 - a.top10 || (a.best ?? 99) - (b.best ?? 99),
  );
}

// 한글명 — 위키 우선, 미확보분 Haiku
async function buildNames(players: KoreanPlayer[]): Promise<Record<string, string>> {
  const dictPath = resolve(NAME_DICT);
  const prev: Record<string, string> = existsSync(dictPath)
    ? JSON.parse(readFileSync(dictPath, "utf8"))
    : {};
  const need = players.filter((p) => !prev[p.name]).map((p) => p.name);
  console.log(`한글명: 기존 ${Object.keys(prev).length} / 신규 필요 ${need.length}`);

  // 위키 en→ko
  for (let i = 0; i < need.length; i += 40) {
    const chunk = need.slice(i, i + 40);
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks` +
      `&titles=${encodeURIComponent(chunk.join("|"))}&lllang=ko&format=json&redirects=1&lllimit=50`;
    const j = await getJson<{
      query?: {
        redirects?: Array<{ from: string; to: string }>;
        pages?: Record<string, { title?: string; langlinks?: Array<{ "*"?: string }> }>;
      };
    }>(url);
    const q = j?.query;
    if (!q) continue;
    const back = new Map((q.redirects ?? []).map((r) => [r.to, r.from]));
    for (const pg of Object.values(q.pages ?? {})) {
      const ko = pg.langlinks?.[0]?.["*"];
      if (!pg.title || !ko) continue;
      const clean = ko.replace(/\s*\(.*\)\s*$/, "").trim();
      prev[pg.title] = clean;
      const orig = back.get(pg.title);
      if (orig) prev[orig] = clean;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const wikiHit = need.filter((n) => prev[n]).length;
  console.log(`  위키 확보 ${wikiHit}/${need.length}`);

  // Haiku 음역 — 한국 선수라 로마자 표기를 한글 본명으로 되돌리는 작업
  const rest = need.filter((n) => !prev[n]);
  if (ANTHROPIC_KEY && rest.length > 0) {
    for (let i = 0; i < rest.length; i += 50) {
      const chunk = rest.slice(i, i + 50);
      const prompt =
        `다음은 골프 대회에 출전한 한국 선수들의 로마자 표기 이름이다. 한국어 본명으로 바꿔줘.\n` +
        `- 각 줄 "원문|한글" 형식, 다른 말 금지\n` +
        `- 실제 알려진 선수면 그 본명 (예: Tom Kim=김주형, Sungjae Im=임성재, Haeran Ryu=유해란)\n` +
        `- 모르면 로마자를 한국식 성명으로 자연스럽게 (성이 뒤에 오는 경우 주의)\n\n` +
        chunk.join("\n");
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 3000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const j = (await res.json()) as { content?: Array<{ text?: string }> };
        for (const line of (j.content?.[0]?.text ?? "").split("\n")) {
          const [en, ko] = line.split("|").map((s) => s?.trim());
          if (en && ko && /[가-힣]/.test(ko)) prev[en] = ko;
        }
      } catch (e) {
        console.warn("  Haiku 실패:", (e as Error).message);
      }
    }
    console.log(`  Haiku 후 총 ${Object.keys(prev).length}명`);
  }

  writeFileSync(dictPath, JSON.stringify(prev, null, 2) + "\n");
  return prev;
}

async function main() {
  console.log(`골프 한국 선수 집계 — ${YEAR} 시즌`);
  const players = await collect();
  if (players.length === 0) {
    console.error("❌ 한국 선수 0명 — ESPN 응답 확인. 기존 파일 유지하고 종료.");
    process.exit(1);
  }
  console.log(`한국 선수 ${players.length}명 (PGA ${players.filter((p) => p.tour === "PGA").length} / LPGA ${players.filter((p) => p.tour === "LPGA").length})`);

  const names = await buildNames(players);
  const withKo = players.map((p) => ({ ...p, nameKo: names[p.name] ?? null }));

  const out = {
    year: YEAR,
    updatedAt: new Date().toISOString(),
    players: withKo,
  };
  writeFileSync(resolve(OUT), JSON.stringify(out, null, 2) + "\n");
  const koCount = withKo.filter((p) => p.nameKo).length;
  console.log(`✅ ${OUT} — ${withKo.length}명 저장 (한글명 ${koCount}/${withKo.length})`);
  console.log("  상위:", withKo.slice(0, 5).map((p) => `${p.nameKo ?? p.name}(${p.wins}승)`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
