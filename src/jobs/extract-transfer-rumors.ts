// 이적 딜 추출·병합·검증 — fetch-news-briefing 러닝이 TRANSFER 항목을 넘겨 호출.
// 2026-07-02 철회분(810bbf4) 부활: 옛 haiku 추출 + 동성(同姓) 병합 fix(8ae70d9)에
// 새 게이트(stage 정규식 클램프, 강한 주장 sonnet 검증)를 얹음. /transfers?view=rumors 소스.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";

const BRIEFING_MODEL = process.env.BRIEFING_MODEL ?? "claude-sonnet-5";

export interface RumorInput {
  title: string;
  desc: string;
  link: string;
  publishedAt: Date;
  sourceName: string;
  tag: string; // 소스 말머리 — "오피셜"(구단 공식 피드)이면 OFFICIAL 클램프 통과
}

const STAGE_RANK: Record<string, number> = { TALKS: 1, MEDICAL: 2, HERE_WE_GO: 3, OFFICIAL: 4 };
const KEEP_DAYS = 21;

interface Extracted {
  i: number;
  deal: boolean;
  player?: string | null;
  playerKo?: string | null;
  fromTeam?: string | null;
  toTeam?: string | null;
  fromKo?: string | null;
  toKo?: string | null;
  stage?: string | null;
  fee?: string | null;
  league?: string | null;
  summaryKo?: string | null;
}

/** haiku 일괄 추출 — 헤드라인+요약 → 딜 여부·선수·팀·단계·한 줄 요약(JSON). */
async function extractBatch(items: RumorInput[]): Promise<Extracted[]> {
  const list = items
    .map((it, i) => `${i}. [${it.sourceName}] ${it.title}${it.desc ? ` — ${it.desc.slice(0, 150)}` : ""}`)
    .join("\n");
  const prompt = `다음은 축구 이적 관련 뉴스 헤드라인(과 요약) 목록이다. 각 항목이 "특정 선수의 구단 간 이적 진행/성사 보도"인지 판별하고 정보를 추출하라.

${list}

JSON 배열만 출력(코드펜스·설명 금지). 각 원소:
{"i":번호,"deal":true|false,"player":"원문 선수명","playerKo":"한국 미디어 관행 한글 표기","fromTeam":"원소속 팀(불명 null)","toTeam":"행선 팀(불명 null)","fromKo":"원소속 한글","toKo":"행선 한글","stage":"OFFICIAL|HERE_WE_GO|MEDICAL|TALKS","fee":"€60M 형식 이적료(보도에 있을 때만, 없으면 null)","league":"행선팀 리그(EPL|LALIGA|BUNDESLIGA|SERIE_A|LIGUE_1|K_LEAGUE_1|SAUDI_PL|MLS 중 하나, 그 외/불명 null)","summaryKo":"한 문장 한국어 요약(~다체, 45자 이내)"}

규칙:
- deal=false: 이적 보도가 아닌 것(경기·인터뷰·연예·용품), 감독/코치 인사, 근거 없는 단순 관심설.
- deal=false 추가 기준: 재계약/계약 연장(팀 이동 없음), 방출·결렬·무산·입찰 거절 등 성사 반대 방향 보도, 축구가 아닌 종목(NBA·야구 등), 헤드라인에 선수 실명이 없는 낚시성("두 번째 영입 완료" 류).
- player·playerKo·summaryKo 는 반드시 같은 한 선수를 가리켜야 한다. 헤드라인에서 확신할 수 없으면 deal=false.
- deal=false 면 다른 필드는 전부 null 로.
- stage 판별: OFFICIAL=구단 공식 발표 완료, HERE_WE_GO=로마노 히위고·양측 합의 완료 보도, MEDICAL=메디컬 진행/예정, TALKS=구체적 협상 진행.
- 헤드라인에 없는 사실(이적료·계약 기간)을 지어내지 말 것.`;
  const text = await generate(prompt, { maxTokens: 4000, temperature: 0 });
  const jsonStr = text.replace(/```json|```/g, "").trim();
  const arr = JSON.parse(jsonStr.slice(jsonStr.indexOf("["), jsonStr.lastIndexOf("]") + 1));
  return Array.isArray(arr) ? (arr as Extracted[]) : [];
}

// ── 딜 병합 (8ae70d9 원형 — 실사고 산출물이라 단순화 금지) ────────────────
// 성(마지막 토큰)+행선팀(첫 토큰)이 같고 **이름이 호환**될 때만 같은 딜.
// "Tonali"⊆"Sandro Tonali" 병합, "Bruno Fernandes" vs "Matheus Fernandes" 분리.

function dealNorm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9가-힣\s]/g, "").trim();
}
function nameTokens(s: string): string[] {
  return dealNorm(s).split(/\s+/).filter(Boolean);
}
/** 짧은 표기의 토큰이 긴 표기에 전부 포함되면 같은 선수로 간주. */
function namesCompatible(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.length > 0 && short.every((t) => long.includes(t));
}
// 언론별 팀 약칭 통일 — "Man Utd" vs "Manchester United" 가 다른 딜로 갈라지는 것 방지
const TEAM_ALIAS: Record<string, string> = {
  man: "manchester", utd: "manchester", spurs: "tottenham", barca: "barcelona",
  psg: "paris", 맨유: "맨체스터", 맨시티: "맨체스터",
};
function teamKeyOf(toTeam: string | null | undefined): string {
  const first = dealNorm(toTeam ?? "").split(/\s+/)[0] ?? "";
  return TEAM_ALIAS[first] ?? first;
}
/** 그룹 키 — 성+행선팀. 같은 키 안에서 namesCompatible 로 최종 판별. */
function dealKey(player: string, toTeam: string | null | undefined): string {
  return `${nameTokens(player).pop() ?? ""}|${teamKeyOf(toTeam)}`;
}
// 한글 표기 수동 교정 — haiku 음역 오기 반복분 (player-name-manual-fix 패턴)
const KO_NAME_FIX: Record<string, string> = { 촉아메니: "추아메니", "나선 아케": "네이선 아케" };
function fixKo(s: string): string {
  let out = s;
  for (const [bad, good] of Object.entries(KO_NAME_FIX)) out = out.split(bad).join(good);
  return out;
}

// ── stage 보수 클램프 — LLM 주장을 원문구 근거로 하향만 ─────────────────
// 지난 철회 원인이 haiku 단독 판정 과신. 강한 단계일수록 원문 증거를 요구한다.
function clampStage(claimed: string | null | undefined, item: RumorInput): string {
  const text = `${item.title} ${item.desc}`;
  // "want to sign" 류 희망 보도를 완료 보도("Chelsea sign X")와 구분 — 완료 판정의 오탐 방지
  const wishfulSign =
    /\b(want(?:s)? to|keen to|aim(?:s)? to|hope(?:s)? to|plan(?:s)? to|race to|try(?:ing)? to|preparing to|set to|close to|looking to|could|move to) sign/i.test(text);
  const officialSupported =
    item.tag === "오피셜" ||
    /official|completed a (deal|move)|done deal|signs for|has signed|have signed|completes?\b|unveil|오피셜|공식 발표/i.test(text) ||
    (!wishfulSign && /\bsigns?\b [A-Z]/.test(item.title));
  const supported = officialSupported
    ? 4
    : /here we go|히위고|히어위고|\bagree(?:s|d)?\b[^.]{0,40}\b(deal|fee|terms|move)\b|deal agreed|total agreement|이적\s*합의|영입\s*합의/i.test(text)
      ? 3
      : /medical|메디컬/i.test(text)
        ? 2
        : 1;
  const rank = Math.min(STAGE_RANK[claimed ?? ""] ?? 1, supported);
  return (Object.entries(STAGE_RANK).find(([, v]) => v === rank)?.[0]) ?? "TALKS";
}

/** 강한 주장(HERE_WE_GO/OFFICIAL) sonnet 검증 — 선수·이적 방향·단계가 헤드라인과 맞는지. */
async function verifyStrongClaim(
  c: { player: string; fromTeam: string | null; toTeam: string | null; stage: string; summaryKo: string },
  item: RumorInput,
): Promise<boolean> {
  const prompt = [
    "아래 [원문 헤드라인]에서 추출된 [이적 딜 정보]가 정확한지 검수하라.",
    "",
    "불합격 기준 (하나라도 해당하면 ok=false).",
    "1. 선수가 헤드라인의 선수와 다르다.",
    "2. 이적 방향(원소속→행선)이 헤드라인과 반대이거나 근거가 없다.",
    `3. 단계 "${c.stage}" 가 헤드라인 근거보다 과장됐다 (합의·공식 발표 문구가 실제로 없는데 그 단계로 표시).`,
    "4. 한 줄 요약이 헤드라인에 없는 사실을 단정한다.",
    "",
    '출력은 JSON 하나만: {"ok": true/false}',
    "",
    "[원문 헤드라인]",
    `[${item.sourceName}] ${item.title}`,
    item.desc ? `요약: ${item.desc.slice(0, 300)}` : "",
    "",
    "[이적 딜 정보]",
    `선수: ${c.player} · ${c.fromTeam ?? "?"} → ${c.toTeam ?? "?"} · 단계: ${c.stage}`,
    `요약: ${c.summaryKo}`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const res = await generate(prompt, { model: BRIEFING_MODEL, maxTokens: 600 });
    const m = res.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]).ok === true : false;
  } catch (e) {
    console.warn(`[rumors] 강한 주장 검증 실패 → 드롭: ${(e as Error).message}`);
    return false; // 검증 불능이면 보수적으로 드롭 (품질 우선)
  }
}

/**
 * 이적 딜 추출·병합·upsert. 실패해도 브리핑 러닝을 막지 않도록 호출부에서 try/catch.
 * @returns upsert 건수
 */
export async function extractTransferRumors(items: RumorInput[], opts: { dry?: boolean } = {}): Promise<number> {
  const dry = opts.dry ?? false;
  if (items.length === 0) return 0;

  const extracted = await extractBatch(items);

  // 딜만 추려 병합 — 같은 그룹키(성+행선팀)여도 이름 호환일 때만 같은 딜
  interface DealAcc { c: Extracted; item: RumorInput; fullPlayer: string; fullPlayerKo: string }
  const merged: DealAcc[] = [];
  for (const c of extracted) {
    if (!c.deal || !c.player || !c.playerKo || !c.summaryKo) continue;
    // 노이즈 방어 — 실명 없음 / 재계약(from=to) / 부정 보도
    if (/^unknown$/i.test(c.player) || c.playerKo.includes("미상")) continue;
    if (c.fromTeam && c.toTeam && dealNorm(c.fromTeam) === dealNorm(c.toTeam)) continue;
    if (/무산|결렬|거절|철회|재계약|연장|방출/.test(c.summaryKo)) continue;
    const item = items[c.i];
    if (!item) continue;
    const key = dealKey(c.player, c.toTeam);
    const rank = STAGE_RANK[c.stage ?? ""] ?? 0;
    const prev = merged.find(
      (m) => dealKey(m.fullPlayer, m.c.toTeam) === key && namesCompatible(m.fullPlayer, c.player!),
    );
    if (!prev) {
      merged.push({ c, item, fullPlayer: c.player, fullPlayerKo: c.playerKo });
      continue;
    }
    if (nameTokens(c.player).length > nameTokens(prev.fullPlayer).length) {
      prev.fullPlayer = c.player;
      prev.fullPlayerKo = c.playerKo;
    }
    const prevRank = STAGE_RANK[prev.c.stage ?? ""] ?? 0;
    if (rank > prevRank || (rank === prevRank && item.publishedAt > prev.item.publishedAt)) {
      prev.c = c;
      prev.item = item;
    }
  }

  // upsert — 14일 내 같은 딜 행 id 재사용(표기 변형 중복 방지), 낮은 stage 로 강등 금지
  const recentRows = dry
    ? []
    : await prisma.transferRumor.findMany({
        where: { publishedAt: { gte: new Date(Date.now() - 14 * 86400 * 1000) } },
        select: { id: true, playerName: true, toTeam: true, stage: true },
      });
  let upserted = 0;
  for (const { c, item, fullPlayer, fullPlayerKo } of merged) {
    const stage = clampStage(c.stage, item);
    // 강한 주장은 sonnet 검증 통과해야 반영 — 불합격이면 딜 자체를 드롭
    if (STAGE_RANK[stage] >= 3) {
      const ok = await verifyStrongClaim(
        { player: fullPlayer, fromTeam: c.fromTeam ?? null, toTeam: c.toTeam ?? null, stage, summaryKo: c.summaryKo! },
        item,
      );
      if (!ok) {
        console.warn(`[rumors] 강한 주장 검증 불합격 — 드롭: ${fullPlayer} → ${c.toTeam} (${stage})`);
        continue;
      }
    }
    if (dry) {
      console.log(`[rumors] DRY: ${stage} ${fixKo(fullPlayerKo)} (${fullPlayer}) ${c.fromKo ?? c.fromTeam ?? "?"}→${c.toKo ?? c.toTeam ?? "?"} ${c.fee ?? ""} :: ${c.summaryKo} [${item.sourceName}]`);
      upserted++;
      continue;
    }
    const key = dealKey(fullPlayer, c.toTeam);
    const ex = recentRows.find(
      (r) => dealKey(r.playerName, r.toTeam) === key && namesCompatible(r.playerName, fullPlayer),
    );
    const id = ex
      ? ex.id
      : createHash("sha1").update(`${dealNorm(fullPlayer)}|${teamKeyOf(c.toTeam)}`).digest("hex").slice(0, 16);
    if (ex && (STAGE_RANK[ex.stage] ?? 0) > (STAGE_RANK[stage] ?? 0)) continue;
    await prisma.transferRumor.upsert({
      where: { id },
      create: {
        id,
        playerName: fullPlayer,
        playerKo: fixKo(fullPlayerKo),
        fromTeam: c.fromTeam ?? null,
        toTeam: c.toTeam ?? null,
        fromTeamKo: c.fromKo ?? null,
        toTeamKo: c.toKo ?? null,
        stage,
        fee: c.fee ?? null,
        league: c.league ?? null,
        summaryKo: fixKo(c.summaryKo!),
        sourceName: item.sourceName,
        sourceUrl: item.link,
        publishedAt: item.publishedAt,
      },
      update: {
        stage,
        fee: c.fee ?? undefined,
        summaryKo: fixKo(c.summaryKo!),
        sourceName: item.sourceName,
        sourceUrl: item.link,
        publishedAt: item.publishedAt,
      },
    });
    upserted++;
  }

  // 오래된 루머 정리
  if (!dry) {
    await prisma.transferRumor.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400 * 1000) } },
    });
  }

  console.log(`[rumors] 입력 ${items.length} → 딜 ${merged.length} → 반영 ${upserted}`);
  return upserted;
}
