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

/** balldontlie 선수 → normKey(이름) → 후보[{id, team}] 맵. 선수 상세 페이지 연결용.
 *  1순위 /players/active (현역만 → 은퇴 동명이인 없음). 무료 플랜은 401 이라(2026-09 실측)
 *  2순위로 /players 전체를 순회한다 — 은퇴 동명이인이 섞이므로 호출부가 소속팀으로 고른다.
 *  분당 5회 제한: 429 면 대기 후 재시도, 페이지 간 12.5초. */
//  rich = 등번호·대학·드래프트 중 하나라도 있는 실레코드. BDL 엔 같은 이름의 빈 껍데기 중복 row 가 있어
//  (드루 스미스·트레이 머피 실측) 팀만 보고 고르면 껍데기를 집는다.
type BdlCand = { id: number; team: string | null; rich: boolean };
async function fetchBalldontlieIds(): Promise<Map<string, BdlCand[]>> {
  const key = process.env.BALLDONTLIE_KEY;
  const map = new Map<string, BdlCand[]>();
  if (!key) {
    console.warn("  BALLDONTLIE_KEY 미설정 — bdlId 매핑 skip");
    return map;
  }
  type Raw = {
    id: number; first_name?: string; last_name?: string; team?: { full_name?: string } | null;
    jersey_number?: string | null; college?: string | null; draft_year?: number | null;
  };
  type Page = { data?: Raw[]; meta?: { next_cursor?: number } };
  const toCand = (p: Raw): BdlCand => ({
    id: p.id,
    team: p.team?.full_name ?? null,
    rich: !!(p.jersey_number || p.college || p.draft_year),
  });
  const getPage = async (url: string): Promise<Page | null> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(12000) });
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 20000));
          continue;
        }
        if (res.status === 401 || res.status === 403) return null; // 플랜 밖 endpoint
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Page;
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    return null;
  };
  const crawl = async (path: string, maxPages: number, delayMs: number): Promise<boolean> => {
    let cursor: number | null = null;
    for (let page = 0; page < maxPages; page++) {
      const j = await getPage(`https://api.balldontlie.io/v1/${path}?per_page=100${cursor != null ? `&cursor=${cursor}` : ""}`);
      if (!j) return page > 0;
      for (const p of j.data ?? []) {
        const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        if (!full) continue;
        const k = normKey(full);
        map.set(k, [...(map.get(k) ?? []), toCand(p)]);
      }
      if ((page + 1) % 10 === 0) console.log(`  ${path} ${page + 1}페이지 · ${map.size}명`);
      if (j.meta?.next_cursor == null) return true;
      cursor = j.meta.next_cursor;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return true;
  };
  if (await crawl("players/active", 30, 400)) return map;
  console.warn("  /players/active 접근 불가 — /players 전체 순회로 폴백 (분당 5회, 약 10분)");
  await crawl("players", 200, 12500);
  return map;
}

/** 후보 중 하나 고르기 — 팀 일치 && 실레코드 > 팀 일치 > 유일 후보. 못 가리면 null. */
function pickBdl(cands: BdlCand[], team: string | undefined): BdlCand | null {
  if (cands.length === 1) return cands[0];
  const sameTeam = cands.filter((c) => c.team && c.team === team);
  return sameTeam.find((c) => c.rich) ?? sameTeam[0] ?? null;
}

/** 이름 표기가 달라 목록 대조에서 빠진 선수를 성(last name) 검색으로 찾는다.
 *  (Nic↔Nicolas Claxton, Bub↔Carlton Carrington, Ace↔Airious Bailey 등 실측 8명). 분당 5회 제한 준수.
 *  성만 같은 후보는 팀이 같아도 옛 선수가 섞인다(Ace Bailey → 1983년 설 베일리, Nate → Brandon Williams 실측)
 *  → 등번호까지 같아야 인정하고, ESPN 등번호를 모를 때만 이름 첫 글자 일치로 대신한다.
 *  BDL 의 성이 ESPN 마지막 토큰과 다른 경우(Yang Hansen → Yang, David Jones Garcia → Jones)를 위해
 *  이름 토큰을 뒤에서부터 차례로 성으로 시도한다. */
async function searchBdlByLastName(name: string, team: string | undefined, number: number | undefined): Promise<BdlCand | null> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return null;
  const tokens = name.split(" ").filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  const initial = normKey(tokens[0] ?? "")[0];
  type Raw = { id: number; first_name?: string; last_name?: string; team?: { full_name?: string } | null; jersey_number?: string | null; college?: string | null; draft_year?: number | null };
  for (const last of tokens.slice(1).reverse()) {
    let data: Raw[] | null = null;
    for (let attempt = 0; attempt < 5 && data == null; attempt++) {
      try {
        const res = await fetch(`https://api.balldontlie.io/v1/players?per_page=100&search=${encodeURIComponent(last)}`, {
          headers: { Authorization: key }, signal: AbortSignal.timeout(12000),
        });
        if (res.status === 429) { await new Promise((r) => setTimeout(r, 20000)); continue; }
        if (!res.ok) return null;
        data = ((await res.json()) as { data?: Raw[] }).data ?? [];
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    await new Promise((r) => setTimeout(r, 12500));
    if (!data) continue;
    const hit = data.find((p) => {
      if (normKey(p.last_name ?? "") !== normKey(last)) return false;
      if (!p.team?.full_name || p.team.full_name !== team) return false;
      if (number != null) return Number(p.jersey_number) === number;
      return !!initial && normKey(p.first_name ?? "")[0] === initial;
    });
    if (hit) return { id: hit.id, team: hit.team?.full_name ?? null, rich: !!(hit.jersey_number || hit.college || hit.draft_year) };
  }
  return null;
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
    // 기존 bdlId 는 유지한다 — 이전 실행이 /players/active(현역 전용)로 잡은 값이 더 믿을 만하고,
    // 전체 목록엔 빈 껍데기 중복 row 가 있어 재선택하면 오히려 깨진다(2026-09 실측 2건).
    if (index[key].bdlId != null) { bdlMatched++; continue; }
    const pick = pickBdl(bdlByKey.get(key) ?? [], index[key].team);
    if (pick) {
      index[key].bdlId = pick.id;
      bdlMatched++;
    }
  }
  // 이름 표기 차이로 못 찾은 선수 → 성 검색 (호출당 12.5초)
  const stillMissing = Object.keys(index).filter((k) => index[k].bdlId == null);
  if (stillMissing.length > 0 && bdlByKey.size > 0) {
    console.log(`  목록 대조 실패 ${stillMissing.length}명 → 성 검색...`);
    for (const key of stillMissing) {
      const pick = await searchBdlByLastName(index[key].name, index[key].team, index[key].number);
      if (pick) { index[key].bdlId = pick.id; bdlMatched++; console.log(`    ${index[key].name} → ${pick.id}`); }
      else console.log(`    ${index[key].name} → 못 찾음`);
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
