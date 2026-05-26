// /api/live/mlb-pbp/[gameId] — ESPN summary plays 전체 (cap 없음).
// 네이버 스타일 "중계" 탭 — 이닝별/타자별 카드 + 모든 pitch 기록 보존.
//
// Cache:
//  - 라이브 (DB status LIVE)  → 30s s-maxage, 60s SWR
//  - 종료 (DB status FINISHED)  → 1h s-maxage (불변)
// 매번 응답 크기 ~ 100KB (500+ plays) — 별도 endpoint 로 분리해 다른 polling 에 영향 없음.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";

export const runtime = "nodejs";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const TIMEOUT = 12_000;

export interface PbpPlay {
  id: string;
  /** ESPN type.type slug (예: "ball", "strike-swinging", "foul-ball", "start-batterpitcher", "play-result"). */
  slug: string;
  /** ESPN type.text 라벨 (예: "Ball", "Foul Ball"). */
  typeText: string;
  text: string;
  /** 한국어 변환 (없으면 영문). */
  textKo: string;
  /** 1~9 (또는 연장). 이닝 번호. start-inning 의 period.number 기준. */
  inning: number;
  /** "top"(원정 공격) / "bottom"(홈 공격). */
  half: "top" | "bottom";
  awayScore: number;
  homeScore: number;
  scoringPlay: boolean;
}

export interface PbpResponse {
  /** 1~innings 의 plays. ESPN 응답 그대로 (start-inning, end-inning, start-batterpitcher,
   * end-batterpitcher, pitch, play-result 모두 포함) */
  plays: PbpPlay[];
  /** 마지막 진행 이닝. UI 의 default 탭 선택용. */
  currentInning: number;
  currentHalf: "top" | "bottom" | null;
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
}

interface EspnPlay {
  id?: string | number;
  type?: { id?: string; text?: string; type?: string };
  text?: string;
  awayScore?: number;
  homeScore?: number;
  period?: { type?: string; number?: number; displayValue?: string };
  scoringPlay?: boolean;
}

interface EspnSummary {
  plays?: EspnPlay[];
  header?: {
    competitions?: Array<{
      status?: { type?: { name?: string } };
    }>;
  };
}

/** ESPN pitch text "Pitch N : Strike 1 Foul" → 짧은 한국어 라벨 ("스트라이크 (파울)") */
function shortPitchLabel(slug: string): string {
  switch (slug) {
    case "ball":
    case "ball---confirmed":
      return "볼";
    case "strike-looking":
      return "스트라이크 (선구)";
    case "strike-swinging":
      return "헛스윙";
    case "foul-ball":
      return "파울";
    case "pick-off":
      return "견제";
    default:
      return "";
  }
}

/** play-result/타격 결과 영문을 한국어로 변환. 타자명은 보존. */
function translateResult(text: string): string {
  let r = text;
  r = r.replace(/struck out swinging/gi, "헛스윙 삼진");
  r = r.replace(/struck out looking/gi, "스탠딩 삼진");
  r = r.replace(/struck out/gi, "삼진");
  r = r.replace(/homered/gi, "홈런");
  r = r.replace(/tripled/gi, "3루타");
  r = r.replace(/doubled/gi, "2루타");
  r = r.replace(/singled/gi, "안타");
  r = r.replace(/walked/gi, "볼넷");
  r = r.replace(/hit by pitch/gi, "사구");
  r = r.replace(/grounded out/gi, "땅볼 아웃");
  r = r.replace(/flied out/gi, "플라이 아웃");
  r = r.replace(/lined out/gi, "라인드라이브 아웃");
  r = r.replace(/popped out/gi, "팝업 아웃");
  r = r.replace(/fouled out/gi, "파울 아웃");
  r = r.replace(/bunt(ed)? pop out/gi, "번트 팝업 아웃");
  r = r.replace(/reached on (an? )?error/gi, "에러로 출루");
  r = r.replace(/\sto left center\b/gi, " (좌중간)");
  r = r.replace(/\sto right center\b/gi, " (우중간)");
  r = r.replace(/\sto left\b/gi, " (좌)");
  r = r.replace(/\sto right\b/gi, " (우)");
  r = r.replace(/\sto center\b/gi, " (중)");
  r = r.replace(/\sto shortstop\b/gi, " (유격수)");
  r = r.replace(/\sto first\b/gi, " (1루수)");
  r = r.replace(/\sto second\b/gi, " (2루수)");
  r = r.replace(/\sto third\b/gi, " (3루수)");
  r = r.replace(/\sto pitcher\b/gi, " (투수)");
  r = r.replace(/\sto catcher\b/gi, " (포수)");
  r = r.replace(/\sscored\b/gi, " 득점");
  r = r.replace(/\sadvanced to\s+/gi, " 진루 → ");
  return r;
}

/** "Pitcher X pitches to Y" → 타자 이름 (한국어) + 투수 이름 (한국어). */
function parseMatchup(text: string): { batter: string; pitcher: string } | null {
  const m = text.match(/^(.+?)\s+pitches to\s+(.+)$/i);
  if (!m) return null;
  const pitcher = m[1].trim();
  const batter = m[2].trim();
  return {
    pitcher: toKoreanPlayerName(pitcher) || pitcher,
    batter: toKoreanPlayerName(batter) || batter,
  };
}

function toKoreanText(slug: string, text: string): string {
  if (!text) return "";
  // pitch — "Pitch N : ..." 형태
  const pitchMatch = text.match(/^Pitch\s+(\d+)\s*:/i);
  if (pitchMatch) {
    const n = pitchMatch[1];
    const label = shortPitchLabel(slug);
    return label ? `${n}구 · ${label}` : `${n}구`;
  }
  if (slug === "start-inning") {
    return text
      .replace(/Top of the (\d+).*/i, "$1회 초 시작")
      .replace(/Bottom of the (\d+).*/i, "$1회 말 시작")
      .replace(/Middle of the (\d+).*/i, "$1회 중간");
  }
  if (slug === "end-inning") return "";
  if (slug === "end-batterpitcher") return "";
  // matchup
  const mu = parseMatchup(text);
  if (mu) return `투수 ${mu.pitcher} → 타자 ${mu.batter}`;
  // 결과 (타격 결과 + scoring)
  return translateResult(text);
}

function normalize(data: EspnSummary): PbpResponse {
  const rawPlays = data.plays ?? [];
  const plays: PbpPlay[] = [];
  let currentInning = 1;
  let currentHalf: "top" | "bottom" | null = null;
  for (const p of rawPlays) {
    const slug = p.type?.type ?? "";
    const periodType = p.period?.type;
    const inning = p.period?.number ?? currentInning;
    let half: "top" | "bottom";
    if (periodType === "Top") half = "top";
    else if (periodType === "Bottom") half = "bottom";
    else half = currentHalf ?? "top";
    if (slug === "start-inning") {
      currentInning = inning;
      currentHalf = half;
    }
    plays.push({
      id: String(p.id ?? `${plays.length}`),
      slug,
      typeText: p.type?.text ?? "",
      text: p.text ?? "",
      textKo: toKoreanText(slug, p.text ?? ""),
      inning,
      half,
      awayScore: p.awayScore ?? 0,
      homeScore: p.homeScore ?? 0,
      scoringPlay: !!p.scoringPlay,
    });
  }
  const stateName = data.header?.competitions?.[0]?.status?.type?.name ?? "";
  let status: PbpResponse["status"] = "PRE";
  if (/IN_PROGRESS/.test(stateName)) status = "LIVE";
  else if (/FINAL/.test(stateName)) status = "FINAL";
  else if (/DELAY|POSTPONED|RAIN/.test(stateName)) status = "DELAY";
  return { plays, currentInning, currentHalf, status };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  if (!/^\d+$/.test(gameId)) {
    return NextResponse.json({ error: "invalid game id" }, { status: 400 });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${ESPN_BASE}/summary?event=${gameId}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as EspnSummary;
    const pbp = normalize(data);
    // DB status 확인 — final 경기는 1시간 cache (응답 큼)
    let isFinal = pbp.status === "FINAL";
    try {
      const m = await prisma.match.findFirst({
        where: { externalId: gameId, league: "MLB" },
        select: { status: true },
      });
      if (m?.status === "FINISHED") isFinal = true;
    } catch {
      // ignore
    }
    const maxAge = isFinal ? 3600 : 30;
    return NextResponse.json(pbp, {
      headers: {
        "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
        "Vercel-CDN-Cache-Control": `max-age=${maxAge}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, plays: [] },
      { status: 200 },
    );
  } finally {
    clearTimeout(t);
  }
}
