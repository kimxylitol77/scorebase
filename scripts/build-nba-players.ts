// NBA 선수 인덱스 빌드 — ESPN 30팀 로스터 → data/nba-players.json.
// 각 선수: 한글명(toKoreanPlayerName 사전 우선 + 누락분 Haiku 음역) + ESPN headshot 사진 + espnId.
// 트랜잭션·연봉 페이지가 영문명 매칭으로 한글명·사진을 붙이는 데 사용.
//
// 로스터 변동(트레이드·콜업) 시 재실행 멱등. 한글 음역은 사전 매칭분 재사용 → 신규만 Haiku 호출.
//
// 실행: npx tsx --env-file=.env.local scripts/build-nba-players.ts

import { writeFileSync, existsSync, readFileSync } from "fs";
import { toKoreanPlayerName } from "../src/lib/player-names";
import { generate } from "../src/lib/ai/claude";

const OUT = "data/nba-players.json";
const UA = "Mozilla/5.0 AppleWebKit/537.36";

interface PlayerEntry {
  name: string; // ESPN fullName (영문)
  ko: string; // 한글명
  photo: string; // headshot URL
  espnId: string;
  pos: string | null;
}

/** 이름 정규화 — 매칭 키 (악센트 제거·소문자·suffix 정리). player-names.ts 와 동일 정책. */
function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTeamIds(): Promise<string[]> {
  const r = await (
    await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams", {
      headers: { "User-Agent": UA },
    })
  ).json();
  const teams = r.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((t: { team: { id: string } }) => t.team.id);
}

interface RosterAthlete {
  id: string;
  fullName?: string;
  displayName?: string;
  headshot?: { href?: string };
  position?: { abbreviation?: string };
}

async function fetchRoster(teamId: string): Promise<RosterAthlete[]> {
  try {
    const r = await (
      await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) },
      )
    ).json();
    return (r.athletes ?? []) as RosterAthlete[];
  } catch {
    return [];
  }
}

/** Haiku 배치 음역 — 사전에 없는 선수만. */
async function transliterate(names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const BATCH = 40;
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH);
    const prompt = `다음 NBA 선수 영문명을 한국 스포츠 미디어 통용 표기로 음역해줘.
외래어 표기법 + NBA 중계 관행 우선 (예: Stephen Curry→스테판 커리, Giannis Antetokounmpo→야니스 아데토쿤보, Luka Dončić→루카 돈치치).
반드시 아래 JSON 배열만 출력, 다른 텍스트 금지:
[${chunk.map((n) => `"${n}"`).join(",")}]
→ 형식: {"영문명":"한글명", ...}`;
    try {
      const res = await generate(prompt, { maxTokens: 4096, temperature: 0 });
      const m = res.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as Record<string, string>;
        for (const [en, ko] of Object.entries(parsed)) if (ko) out[en] = ko;
      }
    } catch (e) {
      console.warn(`  음역 배치 ${i} 실패:`, (e as Error).message);
    }
    console.log(`  음역 ${Math.min(i + BATCH, names.length)}/${names.length}`);
  }
  return out;
}

async function main() {
  console.log("ESPN 팀 목록 fetch...");
  const teamIds = await fetchTeamIds();
  console.log(`${teamIds.length}팀`);

  const athletes: RosterAthlete[] = [];
  for (const id of teamIds) {
    const roster = await fetchRoster(id);
    athletes.push(...roster);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`총 ${athletes.length}명 로스터 수집`);

  // 기존 캐시 — 음역 재사용 (멱등, Haiku 호출 최소화)
  const prev: Record<string, PlayerEntry> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  // 1차: 사전(toKoreanPlayerName) + 기존 캐시로 한글명 결정, 누락만 음역 대기
  const index: Record<string, PlayerEntry> = {};
  const needTranslit: string[] = [];
  for (const a of athletes) {
    const name = a.fullName ?? a.displayName;
    if (!a.id || !name) continue;
    const key = normKey(name);
    const dictKo = toKoreanPlayerName(name);
    const cachedKo = prev[key]?.ko;
    let ko = dictKo && dictKo !== name ? dictKo : cachedKo ?? "";
    if (!ko) {
      needTranslit.push(name);
      ko = ""; // 음역 후 채움
    }
    index[key] = {
      name,
      ko,
      photo: a.headshot?.href ?? `https://a.espncdn.com/i/headshots/nba/players/full/${a.id}.png`,
      espnId: a.id,
      pos: a.position?.abbreviation ?? null,
    };
  }

  // 2차: 누락분 Haiku 음역
  if (needTranslit.length > 0) {
    console.log(`사전 누락 ${needTranslit.length}명 Haiku 음역...`);
    const translit = await transliterate(needTranslit);
    for (const a of athletes) {
      const name = a.fullName ?? a.displayName;
      if (!name) continue;
      const key = normKey(name);
      if (index[key] && !index[key].ko) {
        index[key].ko = translit[name] ?? name; // 음역 실패 시 영문 fallback
      }
    }
  }

  writeFileSync(OUT, JSON.stringify(index, null, 0) + "\n");
  const withKo = Object.values(index).filter((e) => e.ko && e.ko !== e.name).length;
  console.log(`\n✓ ${OUT} — ${Object.keys(index).length}명 (한글 ${withKo})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
