// KBO 매치 181666 (SSG vs 삼성, 2026-05-27) 의 16명 누락 선수 한글명 upsert.
// 영문 source: TheSports player/list?uuid={id} fetch 결과
// 한글 표기: 네이버 KBO 표기 기준 (잘 알려진 선수는 직접, 외국인은 음역)
// 1회성. 영구 해결책은 KBO weekly bot 신설 (mac-mini-worker/.env 에 THESPORTS_USER/SECRET 추가 후 weekly-player-names.sh 에 KBO 라인 추가).
import { prisma } from "../src/lib/db";

const MAPPING: Array<{ id: string; name: string; nameKo: string; note?: string }> = [
  // === SSG 랜더스 ===
  { id: "l5ergxsldg0q8k0", name: "Guillermo Heredia", nameKo: "기예르모 에레디아" },
  { id: "zp5rzvs52xeq82w", name: "Anthony Veneziano", nameKo: "앤서니 베네치아노" },
  { id: "8yomoys77j2pq0j", name: "Han Yoo-seom", nameKo: "한유섬" },
  { id: "1l4rj7s61jjzr7v", name: "Han Doo-sol", nameKo: "한두솔" },
  { id: "2y8m46s33o98rl0", name: "Kim Jun-young", nameKo: "김준영" },
  { id: "dj2ryvskko0jr1z", name: "Yi Do-woo", nameKo: "이도우", note: "확인필요" },
  { id: "8yomoys77j57q0j", name: "Jeon Byeong-woo", nameKo: "전병우" },
  // === 삼성 라이온즈 ===
  { id: "l5ergxsl71oq8k0", name: "Lewin Diaz", nameKo: "르윈 디아즈" },
  { id: "jw2r06s6g8prz84", name: "Ariel Jurado", nameKo: "아리엘 후라도" },
  { id: "k82re4svv4jnqep", name: "Kang Min-ho", nameKo: "강민호" },
  { id: "k82re4svvd1jqep", name: "Kim Ji-chan", nameKo: "김지찬" },
  { id: "1l4rj7s66djlr7v", name: "Koo Ja Wook", nameKo: "구자욱" },
  { id: "y0or56sllknkmwz", name: "Choi Hyoung-woo", nameKo: "최형우" },
  { id: "4wyrnzs8819pr86", name: "Ryu Ji-hyuk", nameKo: "류지혁" },
  { id: "vjxm8ws4gkz1m6o", name: "Lee Ho-beom", nameKo: "이호범", note: "확인필요" },
  { id: "2y8m46s3jwverl0", name: "Park Seung-kyu", nameKo: "박승규", note: "확인필요" },
];

async function main() {
  let ok = 0;
  for (const p of MAPPING) {
    await prisma.theSportsPlayer.upsert({
      where: { id: p.id },
      update: { name: p.name, nameKo: p.nameKo },
      create: { id: p.id, name: p.name, nameKo: p.nameKo, sport: "KBO" },
    });
    ok++;
    const tag = p.note ? ` [${p.note}]` : "";
    console.log(`✓ ${p.id} → ${p.nameKo} (${p.name})${tag}`);
  }
  console.log(`\n=== upserted: ${ok}/${MAPPING.length} ===`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
