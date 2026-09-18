// KHL 선수 사전 빌드 — TheSports team/squad/list + player/list 프로필 → data/khl-players.json (+Haiku 한글명)
//
// 흐름:
//   1) ice-hockey-team-id-mapping.json 의 KHL 22팀(tsId→ourId)
//   2) /v1/ice_hockey/team/squad/list?uuid={tsTeamId} → player_id·position·shirt_number
//   3) /v1/ice_hockey/player/list?uuid={player_id} → 영문명·사진·생년월일·키·몸무게·국적
//      (기존 json 에 프로필이 있으면 재조회 생략 — 멱등, 스쿼드 소속만 매 실행 갱신)
//   4) 한글명 없는 선수만 Haiku 음역 (NHL 선례 build-nhl-player-names-haiku 와 같은 방식)
//   5) /v1/ice_hockey/team/injury/list?uuid={tsTeamId} → 부상자 (2026-09-18 실측 22팀 전부 빈 배열 — 권한은 열려 있어
//      데이터가 들어오기 시작하면 팀 페이지 로스터에 자동 표시. 구조는 미확인이라 원본 필드를 그대로 보존한다)
// 소비처: 팀 페이지 로스터 · KHL 리더보드(선수명·사진) · 라이브 골 타임라인/박스스코어(nhl-live-names 폴백)
// 실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-khl-players.ts   (weekly-static-refresh ⑪-b)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import rawMapping from "../src/lib/sports/thesports/ice-hockey-team-id-mapping.json";

const OUT = "data/khl-players.json";
const SLIM_OUT = "data/khl-player-names.json";
const LEAGUE = "KHL";
const TS_USER = process.env.THESPORTS_USER || "";
const TS_SECRET = process.env.THESPORTS_SECRET || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const CALL_GAP_MS = 150;
const BATCH = 50;

if (!TS_USER || !TS_SECRET) {
  console.error("THESPORTS_USER / THESPORTS_SECRET 미설정");
  process.exit(1);
}

export interface KhlPlayerEntry {
  en: string;
  ko?: string;
  short?: string;
  pos?: string; // F / D / G
  no?: number;
  teamTs: string;
  teamId: number; // 우리 Team.id
  photo?: string;
  birth?: string; // YYYY-MM-DD
  height?: number;
  weight?: number;
  natId?: string; // ts country_id (국적명은 매 실행 재해석)
  nat?: string; // 국적 영문
  natKo?: string;
}
export interface KhlInjuryEntry {
  playerId: string;
  teamId: number; // 우리 Team.id
  /** ts 원본 필드(reason·start_time·end_time 등 — 실데이터 확인 전이라 그대로 보존) */
  raw: Record<string, unknown>;
}
interface OutFile {
  meta: { updatedAt: string; teams: number; players: number; injuries: number; injuriesCheckedAt: string };
  players: Record<string, KhlPlayerEntry>;
  injuries: KhlInjuryEntry[];
}

const COUNTRY_KO: Record<string, string> = {
  Russia: "러시아", Belarus: "벨라루스", Kazakhstan: "카자흐스탄", Canada: "캐나다", "United States": "미국",
  Finland: "핀란드", Sweden: "스웨덴", "Czech Republic": "체코", Slovakia: "슬로바키아", Latvia: "라트비아",
  China: "중국", Germany: "독일", Switzerland: "스위스", Denmark: "덴마크", Norway: "노르웨이", Ukraine: "우크라이나",
  Slovenia: "슬로베니아", Austria: "오스트리아", France: "프랑스", Lithuania: "리투아니아", Estonia: "에스토니아",
  Uzbekistan: "우즈베키스탄", Armenia: "아르메니아", Kyrgyzstan: "키르기스스탄", Hungary: "헝가리", Italy: "이탈리아",
  Poland: "폴란드", Serbia: "세르비아", Croatia: "크로아티아", Australia: "호주", Japan: "일본", "South Korea": "한국",
  USA: "미국", Netherlands: "네덜란드", Czech: "체코", Czechia: "체코", "Great Britain": "영국", England: "잉글랜드",
};
// 국가 id → 영문명. ⚠️ ice_hockey 는 축구 country-list.json 과 id 체계가 다르다(실측 — 러시아가 kp3glrwdb5qdyjv).
//   /v1/ice_hockey/country/list?page=1 (213건) 을 실행 때 한 번 받는다.
const COUNTRY_NAME = new Map<string, string>();
async function loadHockeyCountries() {
  for (let page = 1; page <= 3; page++) {
    const u = new URL("https://api.thesports.com/v1/ice_hockey/country/list");
    u.searchParams.set("user", TS_USER); u.searchParams.set("secret", TS_SECRET); u.searchParams.set("page", String(page));
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
    const d = (await r.json()) as { code?: number; results?: Array<{ id: string; name: string }> };
    if (d.code !== 0 || !d.results?.length) break;
    for (const c of d.results) COUNTRY_NAME.set(c.id, c.name);
    if (d.results.length < 1000) break;
  }
}

interface MapEntry { ourId: number; ourName: string; ourLeague: string; tsId: string }
const teams = (rawMapping as MapEntry[]).filter((m) => m.ourLeague === LEAGUE);

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function tsGet<T>(path: string, uuid: string): Promise<T | null> {
  const u = new URL(`https://api.thesports.com/v1/ice_hockey/${path}`);
  u.searchParams.set("user", TS_USER);
  u.searchParams.set("secret", TS_SECRET);
  u.searchParams.set("uuid", uuid);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
      const d = (await r.json()) as { code?: number; results?: T; err?: string };
      if (d.code !== 0) throw new Error(d.err ?? `code=${d.code}`);
      return d.results ?? null;
    } catch (e) {
      if (attempt === 2) { console.warn(`  ! ${path} ${uuid}: ${(e as Error).message}`); return null; }
      await sleep(1500);
    }
  }
  return null;
}

interface SquadRes { id: string; squad: Array<{ player_id: string; position?: string; shirt_number?: number }> }
interface InjuryRes { id: string; injury?: Array<Record<string, unknown>>; updated_at?: number }
interface PlayerRes {
  id: string; name?: string; short_name?: string; logo?: string; birthday?: number;
  height?: number; weight?: number; position?: string; country_id?: string;
}

async function haikuTranslate(batch: Array<{ id: string; en: string }>): Promise<Record<string, string>> {
  const prompt =
    `다음 KHL(러시아 아이스하키) 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성). 러시아어 로마자 표기는 러시아어 발음 관용 표기로. "Alexander Ovechkin"→알렉산드르 오베치킨, "Nikita Gusev"→니키타 구세프, "Vadim Shipachyov"→바딤 시파초프\n` +
    `- 북미·유럽 외국인 선수는 그 나라 관용 표기. "Josh Leivo"→조시 레이보, "Rob Hamilton"→롭 해밀턴\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X). key 는 위 영문 이름 그대로:\n` +
    `{"Alexander Ovechkin": "알렉산드르 오베치킨", ...}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) { console.warn(`! Haiku ${res.status}`); return {}; }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data?.content?.[0]?.text?.trim() ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const k = ko.trim();
      if (k && /[가-힣]/.test(k)) cleaned[en] = k;
    }
    return cleaned;
  } catch { return {}; }
}

async function main() {
  const outPath = resolve(OUT);
  let existing: Record<string, KhlPlayerEntry> = {};
  if (existsSync(outPath)) {
    try { existing = (JSON.parse(readFileSync(outPath, "utf8")) as OutFile).players ?? {}; } catch { existing = {}; }
  }
  await loadHockeyCountries();
  console.log(`▶ KHL ${teams.length}팀 · 기존 사전 ${Object.keys(existing).length}명 · 국가 ${COUNTRY_NAME.size}`);

  const players: Record<string, KhlPlayerEntry> = {};
  let fetched = 0;
  for (const t of teams) {
    const squad = await tsGet<SquadRes[]>("team/squad/list", t.tsId);
    const list = squad?.[0]?.squad ?? [];
    await sleep(CALL_GAP_MS);
    let n = 0;
    for (const s of list) {
      if (!s.player_id) continue;
      const prev = existing[s.player_id];
      let profile: Partial<KhlPlayerEntry> = prev ? { ...prev } : {};
      // natId 없는 옛 항목은 한 번 재조회 (국적 id 를 저장하기 전 빌드분)
      if (!prev?.en || !prev.natId) {
        const p = (await tsGet<PlayerRes[]>("player/list", s.player_id))?.[0];
        await sleep(CALL_GAP_MS);
        fetched++;
        if (!p?.name) continue;
        profile = {
          ko: prev?.ko,
          en: p.name.trim(),
          natId: p.country_id || undefined,
          short: p.short_name?.trim() || undefined,
          photo: p.logo || undefined,
          birth: p.birthday ? new Date(p.birthday * 1000).toISOString().slice(0, 10) : undefined,
          height: p.height || undefined,
          weight: p.weight || undefined,
          pos: p.position || undefined,
        };
      }
      const nat = profile.natId ? COUNTRY_NAME.get(profile.natId) : undefined;
      profile.nat = nat;
      profile.natKo = nat ? COUNTRY_KO[nat] : undefined;
      players[s.player_id] = {
        ...(profile as KhlPlayerEntry),
        pos: s.position || profile.pos,
        no: s.shirt_number || undefined,
        teamTs: t.tsId,
        teamId: t.ourId,
      };
      n++;
    }
    console.log(`  ${t.ourName}: ${n}명`);
  }
  console.log(`▶ 스쿼드 합계 ${Object.keys(players).length}명 · 프로필 신규 조회 ${fetched}`);

  // 부상자 — 팀 단위. 빈 배열이 정상 상태(2026-09-18 기준)라 0건이어도 실패가 아니다.
  const injuries: KhlInjuryEntry[] = [];
  let injuryErr = 0;
  for (const t of teams) {
    const res = await tsGet<InjuryRes[]>("team/injury/list", t.tsId);
    await sleep(CALL_GAP_MS);
    if (!res) { injuryErr++; continue; }
    for (const i of res[0]?.injury ?? []) {
      const pid = String(i.player_id ?? "");
      if (!pid) continue;
      injuries.push({ playerId: pid, teamId: t.ourId, raw: i });
    }
  }
  console.log(`▶ 부상자 ${injuries.length}건 (조회 실패 ${injuryErr}팀)`);

  // 한글명 — 없는 선수만 Haiku
  const need = Object.entries(players).filter(([, p]) => !p.ko && p.en).map(([id, p]) => ({ id, en: p.en }));
  if (need.length > 0 && !ANTHROPIC_KEY) {
    console.warn(`! ANTHROPIC_API_KEY 미설정 — 한글명 ${need.length}건 생략 (영문 노출)`);
  } else if (need.length > 0) {
    console.log(`▶ Haiku 음역 대상 ${need.length}명`);
    let done = 0;
    for (let i = 0; i < need.length; i += BATCH) {
      const batch = need.slice(i, i + BATCH);
      const map = await haikuTranslate(batch);
      for (const b of batch) {
        const ko = map[b.en];
        if (ko) { players[b.id].ko = ko; done++; }
      }
      await sleep(500);
    }
    console.log(`  한글명 채움 ${done}/${need.length}`);
  }

  const out: OutFile = {
    meta: {
      updatedAt: new Date().toISOString(), teams: teams.length, players: Object.keys(players).length,
      injuries: injuries.length, injuriesCheckedAt: new Date().toISOString(),
    },
    players,
    injuries,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
  // 슬림 사전 — 라이브 골 타임라인·박스스코어(클라이언트 번들)용. 프로필 없이 이름·포지션만.
  const slim: Record<string, { ko: string; en: string; pos?: string }> = {};
  for (const [id, p] of Object.entries(players)) slim[id] = { ko: p.ko ?? "", en: p.en, pos: p.pos };
  writeFileSync(resolve(SLIM_OUT), JSON.stringify(slim) + "\n");
  console.log(`✔ ${OUT} — ${out.meta.players}명 (한글명 ${Object.values(players).filter((p) => p.ko).length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
