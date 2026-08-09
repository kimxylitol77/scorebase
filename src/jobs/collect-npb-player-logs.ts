// NPB 경기별 선수 로그 수집 — npb.jp 일정 페이지의 경기 링크를 훑어 box.html 을 파싱, NpbPlayerGameLog 적재.
// KBO(collect-kbo-player-logs)와 동일 패턴이되 소스가 경기 중심(박스스코어)이라 게임 단위로 순회한다.
// 멱등 id = "npb:{role}:{npbId}:{season}:{MM.DD}:{seq}" 라 같은 날짜를 다시 훑어도 안전.
// cron: /api/cron/npb-player-logs (일일, 전날 JST 경기만). 과거 시즌은 --season 백필 (2016~).
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchNpbScheduleLinks, fetchNpbBoxScore, type NpbGameLink } from "@/lib/sports/npb-box";

// npb.jp 예절 스로틀 — 전역 250ms 간격 (시즌 백필 ~880 페이지 ≈ 4분).
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 250;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

interface LogRow {
  id: string; npbId: string; role: string; season: number; date: Date; seq: number;
  name: string | null; team: string | null; opponent: string;
  roleDetail: string | null; result: string | null; ip: string | null;
  pitches: number | null; tbf: number | null; er: number | null; hbp: number | null;
  ab: number | null; d2b: number | null; d3b: number | null; rbi: number | null; sb: number | null;
  h: number | null; hr: number | null; bb: number | null; so: number | null; r: number | null;
}

function toDate(season: number, mmdd: string): Date {
  return new Date(Date.UTC(season, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(2))));
}

export async function runCollectNpbPlayerLogs({ season }: { season?: number } = {}) {
  // 일일 모드 = 전날(JST). NPB 경기는 JST 자정 전에 끝나므로 전날 날짜 하나면 충분하다.
  const now = new Date(Date.now() + 9 * 3600_000);
  const yesterday = new Date(now.getTime() - 24 * 3600_000);
  const y = season ?? yesterday.getUTCFullYear();

  let links: NpbGameLink[] = [];
  if (season) {
    for (let month = 3; month <= 11; month++) {
      await throttle();
      links.push(...(await fetchNpbScheduleLinks(season, month)));
    }
    // 모든 월 페이지에 "오늘의 경기" 사이드바가 있어 오늘 링크가 월 수만큼 반복된다 — 전역 dedup.
    const seen = new Set<string>();
    links = links.filter((l) => !seen.has(l.path) && seen.add(l.path));
  } else {
    const mmdd = `${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}${String(yesterday.getUTCDate()).padStart(2, "0")}`;
    const monthLinks = await fetchNpbScheduleLinks(y, yesterday.getUTCMonth() + 1);
    links = monthLinks.filter((l) => l.mmdd === mmdd);
  }
  // 오늘(JST) 이후 경기 제외 — 라이브 중 박스는 부분 스탯이라 종료 전 적재 금지.
  if (y === now.getUTCFullYear()) {
    const todayMmdd = `${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
    links = links.filter((l) => l.mmdd < todayMmdd);
  }

  // 경기별 박스 파싱 → 행 생성. seq 는 (선수,날짜) 등장 순번 — 링크가 날짜순 정렬이라 결정적.
  const rows = new Map<string, LogRow>();
  const seqCount = new Map<string, number>();
  let games = 0;
  let skipped = 0;
  for (const link of links) {
    await throttle();
    // 일시 네트워크 오류로 시즌 전체가 죽지 않게 경기 단위 격리 — 멱등이라 다음 실행이 메운다.
    let box: Awaited<ReturnType<typeof fetchNpbBoxScore>> = null;
    try {
      box = await fetchNpbBoxScore(link.path);
    } catch {
      skipped++;
      continue;
    }
    if (!box) {
      skipped++; // 미래 경기·취소·박스 미게시
      continue;
    }
    games++;
    const date = toDate(y, link.mmdd);
    const push = (role: "P" | "B", pid: string, partial: Omit<LogRow, "id" | "npbId" | "role" | "season" | "date" | "seq">) => {
      const seqKey = `${role}:${pid}:${link.mmdd}`;
      const seq = seqCount.get(seqKey) ?? 0;
      seqCount.set(seqKey, seq + 1);
      const id = `npb:${role}:${pid}:${y}:${link.mmdd.slice(0, 2)}.${link.mmdd.slice(2)}:${seq}`;
      rows.set(id, { id, npbId: pid, role, season: y, date, seq, ...partial });
    };
    for (const p of box.pitchers) {
      push("P", p.pid, {
        name: p.name || null, team: p.team, opponent: p.opponent,
        roleDetail: p.roleDetail, result: p.result, ip: p.ip,
        pitches: p.pitches, tbf: p.tbf, er: p.er, hbp: p.hbp,
        ab: null, d2b: null, d3b: null, rbi: null, sb: null,
        h: p.h, hr: p.hr, bb: p.bb, so: p.so, r: p.r,
      });
    }
    for (const b of box.hitters) {
      push("B", b.pid, {
        name: b.name || null, team: b.team, opponent: b.opponent,
        roleDetail: null, result: null, ip: null,
        pitches: null, tbf: null, er: null, hbp: b.hbp,
        ab: b.ab, d2b: b.d2b, d3b: b.d3b, rbi: b.rbi, sb: b.sb,
        h: b.h, hr: b.hr, bb: b.bb, so: b.so, r: b.r,
      });
    }
  }

  const unique = [...rows.values()];
  let created = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const res = await prisma.npbPlayerGameLog.createMany({ data: unique.slice(i, i + 1000), skipDuplicates: true });
    created += res.count;
  }
  return { season: y, links: links.length, games, skipped, rows: unique.length, created };
}

// 직접 실행 (npm run job:npb-player-logs -- --season=2021)
if (import.meta.url === `file://${process.argv[1]}`) {
  const seasonArg = process.argv.find((a) => a.startsWith("--season="));
  runCollectNpbPlayerLogs(seasonArg ? { season: Number(seasonArg.split("=")[1]) } : {})
    .then((r) => {
      console.log(JSON.stringify(r));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
