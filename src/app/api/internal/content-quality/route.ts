// GET /api/internal/content-quality
// 표시 품질 검사 — mac-mini data-quality.js 가 15분마다 호출.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// 왜 별도인가. 기존 감시(endpoint-monitor·data-sanity·synthetic-monitor)는 "응답이 오나 ·
// 마커가 있나 · 라이브 값이 일관되나"를 본다. 전부 "있어야 할 게 있나" 유형이라
// "잘못된 값이 화면에 나간다"는 원천적으로 안 걸린다 — 2026-07-31 일본어 잔존·선발 지표
// 누락을 감시봇 9개가 전부 놓치고 사용자가 먼저 발견했다(그날 실측 실제 탐지 0건).
//
// 검출 항목:
//   1. foreign_text_leak   — 화면에 그대로 나가는 DB 문자열에 일본어(가나·한자) 잔존
//   2. starter_incomplete  — 경기 임박인데 선발 성적이 비어 카드가 "—" 로 나감
//
// 응답: { ok, checkedAt, issues: [{ kind, severity, league, detail, samples }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 가나 + CJK 한자. 한국어 화면에 이게 보이면 음역이 안 된 원문이다.
const JP_TEXT = /[぀-ヿ㐀-鿿]/;

// DB 는 npb.jp 원문을 저장하고 화면이 렌더 시 음역한다(/scores·/live/npb 공통).
// 원문 자체를 판정하면 정상 저장까지 매일 울린다 — 렌더와 같은 변환을 통과시킨 뒤
// 그래도 일본어가 남는 것(= 실제 화면에 새는 것)만 알린다 (2026-08-16 오탐 정합).
function leaksOnScreen(league: string, name: string): boolean {
  if (!JP_TEXT.test(name)) return false;
  if (league !== "NPB") return true; // KBO·MLB 에 일본어면 그 자체가 이상
  return JP_TEXT.test(npbPlayerToKorean(name));
}

// 선발 지표는 경기 임박에만 요구한다 — 발표 전 빈 값은 정상이고,
// 그걸 알리면 매일 아침 오탐이 된다(KBO·NPB 는 당일 확정).
const STARTER_DUE_MS = 3 * 60 * 60 * 1000;

interface Issue {
  kind: string;
  severity: "high" | "medium";
  league?: string;
  detail: string;
  samples: string[];
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) return unauthorized();

  const issues: Issue[] = [];
  const now = new Date();

  // 1) 선발 투수 이름 — Match.homeStarter/awayStarter JSON 의 name
  const withStarters = await prisma.match.findMany({
    where: {
      league: { in: ["NPB", "KBO", "MLB"] },
      startTime: { gte: new Date(now.getTime() - 7 * 86400_000) },
      OR: [{ homeStarter: { not: null } }, { awayStarter: { not: null } }],
    },
    select: { league: true, startTime: true, homeStarter: true, awayStarter: true },
  });

  const leakByLeague = new Map<string, string[]>();
  const incompleteByLeague = new Map<string, string[]>();
  for (const m of withStarters) {
    for (const raw of [m.homeStarter, m.awayStarter]) {
      if (!raw) continue;
      let o: { name?: string; era?: number | null } | null = null;
      try {
        o = JSON.parse(raw as string);
      } catch {
        continue;
      }
      if (!o?.name) continue;
      if (leaksOnScreen(m.league, o.name)) {
        const arr = leakByLeague.get(m.league) ?? [];
        if (arr.length < 5) arr.push(o.name);
        leakByLeague.set(m.league, arr);
      }
      // 임박(3h 이내)했는데 성적이 없는 카드 — 사진·지표가 통째로 "—" 로 나간다
      const due = m.startTime.getTime() - now.getTime();
      if (due > 0 && due < STARTER_DUE_MS && o.era == null) {
        const arr = incompleteByLeague.get(m.league) ?? [];
        if (arr.length < 5) arr.push(o.name);
        incompleteByLeague.set(m.league, arr);
      }
    }
  }

  // 2) 시즌 스탯 선수명 (라이브 타자 표에 그대로 나감)
  const statRows = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league: { in: ["NPB", "KBO", "MLB"] } },
    select: { league: true, playerName: true },
  });
  // 시즌스탯은 잡이 저장 시점에 음역해 넣고(fetch-baseball-season-stats) 화면은 저장값을
  // 그대로 그린다 — 여기 일본어가 남았다면 그게 곧 화면 노출이라 원문 판정이 맞다.
  // (starter 와 달리 leaksOnScreen 재변환을 쓰면 사전 갱신 후 실탐을 놓친다.)
  for (const r of statRows) {
    if (!r.playerName || !JP_TEXT.test(r.playerName)) continue;
    const key = `${r.league}:stats`;
    const arr = leakByLeague.get(key) ?? [];
    if (arr.length < 5) arr.push(r.playerName);
    leakByLeague.set(key, arr);
  }

  for (const [league, samples] of leakByLeague) {
    issues.push({
      kind: "foreign_text_leak",
      severity: "high",
      league,
      detail: `${league} — 한국어 화면에 나가는 이름에 일본어 원문이 남아 있습니다 (${samples.length}건+)`,
      samples,
    });
  }
  for (const [league, samples] of incompleteByLeague) {
    issues.push({
      kind: "starter_incomplete",
      severity: "medium",
      league,
      detail: `${league} — 경기 3시간 내인데 선발 성적이 비어 카드가 "—" 로 표시됩니다 (${samples.length}건+)`,
      samples,
    });
  }

  // ── 자가치유 — 알리기 전에 보강 cron 을 재실행한다.
  //    60일 실측 "MLB 선발 지표 누락" 72회·KBO 32회 + 일본어 노출 58회가 전부
  //    "다음 회차 자동 보강 대기"로 사람에게 갔는데, 그 보강이 곧 멱등 cron 재실행이다.
  //    (2026-08-18 실증 — 10:48 synthetic 이 알린 선발 일본어 노출 4건이 11:25
  //     baseball-starters 재실행만으로 해소됐다.) 기계가 먼저 시도하고 2회 실패분만
  //     알림에 남긴다(health-check 자가치유 루프와 같은 원칙).
  //    잡의 startersUpdatedAt 6h skip 이 과호출을 자연 차단하므로 여기선 시도 수만 센다.
  //    일본어 노출은 사전 결손이 원인이면 재실행으로 안 낫는데, 그때 상한 소진 →
  //    "사람 확인 필요"(= npb-name-dict 등록, 진짜 사람 일)로 넘어가는 게 의도된 동작.
  const HEAL_CRON: Record<string, string> = {
    MLB: "mlb-starters",
    KBO: "baseball-starters",
    NPB: "baseball-starters",
    "MLB:stats": "baseball-season-stats",
    "KBO:stats": "baseball-season-stats",
    "NPB:stats": "baseball-season-stats",
  };
  const healedAway: string[] = [];
  const heals = issues.filter(
    (i) => (i.kind === "starter_incomplete" || i.kind === "foreign_text_leak") && i.league && HEAL_CRON[i.league],
  );
  // 봇 axios timeout 30s 안에서 안전하게 — 한 사이클에 1건만 치유(다음 15분 폴이 나머지)
  for (const issue of heals.slice(0, 1)) {
    const league = issue.league!;
    const healKey = `${issue.kind === "starter_incomplete" ? "starter-incomplete" : "jp-leak"}:${league}`;
    const cronRoute = HEAL_CRON[league];
    const attempts = await prisma.healthCheck.count({
      where: { category: "self-heal", key: healKey, runAt: { gte: new Date(now.getTime() - 6 * 3600_000) } },
    });
    if (attempts >= 2) {
      issue.detail += " · 자가치유 2회 실패 — 사람 확인 필요";
      continue;
    }
    // 트리거만 하고 완주를 기다리지 않는다(mlb-starters 최대 120s) — 판정은 다음 15분 폴이 한다.
    const site = (process.env.SITE_URL || "https://www.scorebase.kr").replace("://scorebase.kr", "://www.scorebase.kr");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    let result = "triggered";
    try {
      const res = await fetch(`${site}/api/cron/${cronRoute}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) result = `fail:${res.status}`;
    } catch (e) {
      if ((e as Error).name !== "AbortError") result = "fail:net";
    } finally {
      clearTimeout(t);
    }
    try {
      await prisma.healthCheck.create({
        data: {
          severity: "LOW",
          category: "self-heal",
          key: healKey,
          message: `${cronRoute} ${result === "triggered" ? "트리거" : "호출 실패"} (시도 ${attempts + 1}/2) — 판정은 다음 폴`,
        },
      });
    } catch {
      /* 기록 실패가 검사를 막지 않는다 */
    }
    if (result === "triggered") {
      // 치유 중 — 이번 사이클은 알리지 않는다. 다음 폴에서 여전히 비어 있으면 시도 2 → 그다음 알림.
      healedAway.push(league);
      issues.splice(issues.indexOf(issue), 1);
    }
  }

  return NextResponse.json({
    ok: issues.length === 0,
    checkedAt: now.toISOString(),
    totals: { startersChecked: withStarters.length, statRowsChecked: statRows.length },
    healing: healedAway,
    issues,
  });
}
