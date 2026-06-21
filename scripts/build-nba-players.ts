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
  bdlId?: number; // balldontlie player id — 선수 상세(/players/{bdlId}?league=NBA) 연결용
  team?: string; // ESPN displayName(= DB Team.name) — 팀 페이지 로스터 그룹핑용
  number?: number; // 등번호(ESPN jersey)
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

async function fetchTeams(): Promise<{ id: string; name: string }[]> {
  const r = await (
    await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams", {
      headers: { "User-Agent": UA },
    })
  ).json();
  const teams = r.sports?.[0]?.leagues?.[0]?.teams ?? [];
  // displayName = DB Team.name 과 일치 (30팀 검증 완료) → 로스터 팀 키
  return teams.map((t: { team: { id: string; displayName: string } }) => ({
    id: t.team.id,
    name: t.team.displayName,
  }));
}

/** balldontlie 현역 선수 → normKey(이름) → bdlId 맵. 선수 상세 페이지 연결용.
 *  /players/active cursor 순회 (현역만 → 은퇴 동명이인 충돌 회피). */
async function fetchBalldontlieIds(): Promise<Map<string, number>> {
  const key = process.env.BALLDONTLIE_KEY;
  const map = new Map<string, number>();
  if (!key) {
    console.warn("  BALLDONTLIE_KEY 미설정 — bdlId 매핑 skip");
    return map;
  }
  let cursor: number | null = null;
  for (let guard = 0; guard < 30; guard++) {
    const url = `https://api.balldontlie.io/v1/players/active?per_page=100${cursor != null ? `&cursor=${cursor}` : ""}`;
    let j: { data?: Array<{ id: number; first_name?: string; last_name?: string }>; meta?: { next_cursor?: number } };
    try {
      const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) break;
      j = await res.json();
    } catch {
      break;
    }
    for (const p of j.data ?? []) {
      const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      if (full) map.set(normKey(full), p.id);
    }
    if (j.meta?.next_cursor == null) break;
    cursor = j.meta.next_cursor;
    await new Promise((r) => setTimeout(r, 400)); // rate limit 회피
  }
  return map;
}

interface RosterAthlete {
  id: string;
  fullName?: string;
  displayName?: string;
  headshot?: { href?: string };
  position?: { abbreviation?: string };
  jersey?: string;
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
  const teams = await fetchTeams();
  console.log(`${teams.length}팀`);

  // 각 선수에 소속팀명 태그 (팀 페이지 로스터 그룹핑용)
  const athletes: (RosterAthlete & { team: string })[] = [];
  for (const t of teams) {
    const roster = await fetchRoster(t.id);
    for (const a of roster) athletes.push({ ...a, team: t.name });
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
      ...prev[key], // enrich 프로필(tsId·생일·연봉 등, enrich-nba-players-thesports.ts) 보존
      name,
      ko,
      photo: a.headshot?.href ?? `https://a.espncdn.com/i/headshots/nba/players/full/${a.id}.png`,
      espnId: a.id,
      pos: a.position?.abbreviation ?? null,
      bdlId: prev[key]?.bdlId, // 기존 매핑 보존, 아래서 갱신
      team: a.team,
      number: a.jersey ? Number(a.jersey) : undefined,
    };
  }

  // balldontlie id 병합 — 선수 상세 페이지(/players/{bdlId}?league=NBA) 연결용
  console.log("balldontlie 현역 선수 id 매핑...");
  const bdlByKey = await fetchBalldontlieIds();
  let bdlMatched = 0;
  for (const key of Object.keys(index)) {
    const bdl = bdlByKey.get(key);
    if (bdl != null) {
      index[key].bdlId = bdl;
      bdlMatched++;
    }
  }
  console.log(`  bdlId 매칭 ${bdlMatched}/${Object.keys(index).length}`);

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
  const withBdl = Object.values(index).filter((e) => e.bdlId != null).length;
  console.log(`\n✓ ${OUT} — ${Object.keys(index).length}명 (한글 ${withKo} · bdlId ${withBdl})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
