// NPB ts선수 id → npb.jp 공식 pid 매핑 사전 구축 — 라이브 박스스코어 선수 링크용.
//   로스터(rst_*.html)엔 한자만 있고 ts 는 한글 음역이라 직접 매칭 불가 →
//   선수 상세(/bis/players/{pid}.html)의 카나를 수집해 한글 변환 후 이름 매칭한다.
//   표기 변이(가/카·다/타·바/파·자/차, 장음)를 흡수해도 실측 ~55% 가 한계 →
//   **유일 매칭만 채택**(중복은 버림). 잘못된 선수로 보내느니 링크를 안 거는 편이 낫다.
//   카나는 불변이라 data/npb-player-kana.json 에 캐시 → 재실행 시 신규 선수만 조회.
// 사용: npx tsx --env-file=.env.local scripts/build-npb-player-link.ts
import fs from "fs";
import { prisma } from "../src/lib/db";
import rosters from "../data/baseball-rosters.json";
import { fetchNpbPitcherProfile } from "../src/lib/sports/npb-official";
import { kanaToKorean } from "../src/lib/sports/kana-to-korean";

const KANA_PATH = "data/npb-player-kana.json";
const LINK_PATH = "data/npb-player-link.json";

// 일본어 한글 음역 변이 흡수 — 어두 청음/탁음 통일(ㄱ→ㅋ, ㄷ→ㅌ, ㅂ→ㅍ, ㅈ→ㅊ) + 장음 축약.
const BASE = 0xac00;
//   ㄱ→ㅋ, ㄷ→ㅌ, ㅂ→ㅍ, ㅈ→ㅊ, ㅆ→ㅊ(쓰/츠 표기 혼용 흡수)
const CHO_MAP: Record<number, number> = { 0: 15, 3: 16, 7: 17, 12: 14, 10: 14 };
export function jpNameNorm(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\s·・()（）A-Za-z.]/g, "")) {
    const c = ch.charCodeAt(0) - BASE;
    if (c < 0 || c > 11171) {
      out += ch;
      continue;
    }
    let cho = Math.floor(c / 588);
    const rest = c % 588;
    if (cho in CHO_MAP) cho = CHO_MAP[cho];
    out += String.fromCharCode(BASE + cho * 588 + rest);
  }
  return out.replace(/([가-힣])우([가-힣])/g, "$1$2").replace(/오우/g, "오");
}

const load = <T,>(p: string, d: T): T => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : d);

async function main() {
  const R = rosters as Record<string, { id: string; name: string }[]>;
  const teams = await prisma.team.findMany({ where: { league: "NPB" }, select: { id: true } });
  const npbTeamIds = new Set(teams.map((t) => String(t.id)));
  const players: { id: string; name: string }[] = [];
  for (const [tid, arr] of Object.entries(R)) if (npbTeamIds.has(tid)) players.push(...arr);
  console.log(`[npb-link] 로스터 NPB 선수 ${players.length}명`);

  // ── 카나 수집 (캐시 증분) ──
  const kana = load<Record<string, string>>(KANA_PATH, {});
  const todo = players.filter((p) => !(p.id in kana));
  console.log(`[npb-link] 카나 캐시 ${Object.keys(kana).length} · 신규 조회 ${todo.length}`);
  let done = 0;
  for (const p of todo) {
    try {
      const prof = await fetchNpbPitcherProfile(p.id);
      kana[p.id] = prof.kana ?? ""; // 빈 문자열도 기록 → 재조회 방지
    } catch {
      // 실패는 기록하지 않음 (다음 실행에 재시도)
    }
    if (++done % 50 === 0) {
      fs.writeFileSync(KANA_PATH, JSON.stringify(kana));
      console.log(`  진행 ${done}/${todo.length}`);
    }
    await new Promise((r) => setTimeout(r, 300)); // npb.jp burst 회피
  }
  fs.writeFileSync(KANA_PATH, JSON.stringify(kana));

  // ── ts 선수 인덱스 (정규화, 중복은 모호로 표시) ──
  const ts = await prisma.theSportsPlayer.findMany({
    where: { sport: "NPB", nameKo: { not: null } },
    select: { id: true, nameKo: true },
  });
  const tsByNorm = new Map<string, string[]>();
  for (const p of ts) {
    const k = jpNameNorm(p.nameKo!);
    if (!k) continue;
    tsByNorm.set(k, [...(tsByNorm.get(k) ?? []), p.id]);
  }

  // ── 매칭 (양쪽 모두 유일할 때만) ──
  const pidByNorm = new Map<string, string[]>();
  for (const p of players) {
    const k = kana[p.id];
    if (!k) continue;
    const ko = kanaToKorean(k);
    if (!/[가-힣]/.test(ko)) continue;
    const n = jpNameNorm(ko);
    if (!n) continue;
    pidByNorm.set(n, [...(pidByNorm.get(n) ?? []), p.id]);
  }
  const link: Record<string, string> = {};
  let ambiguous = 0;
  for (const [n, pids] of pidByNorm) {
    const tsIds = tsByNorm.get(n);
    if (!tsIds) continue;
    if (pids.length !== 1 || tsIds.length !== 1) {
      ambiguous++;
      continue;
    }
    link[tsIds[0]] = pids[0];
  }
  fs.writeFileSync(LINK_PATH, JSON.stringify(link));
  console.log(
    `[npb-link] 완료 → 매핑 ${Object.keys(link).length}명 / ts ${ts.length}명 (${Math.round((Object.keys(link).length / ts.length) * 100)}%) · 모호 제외 ${ambiguous}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
