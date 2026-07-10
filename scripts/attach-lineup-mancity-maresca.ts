// post 875 전술판 재구성 — 실선수 pid + 사진 모드(651 방식). 실제 스쿼드(2026-07-04) 반영.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { encodeBoard, newUid, type BoardState, type Placed } from "@/lib/lineup/lineup-state";

const POST_ID = 875;

// [pid, x, y] — 맨시티 실제 스쿼드(ts team p4jwq2ghd57m0ve) 4-3-3, 로드리 단일 피벗 깊게.
const XI: Array<[string, number, number]> = [
  ["l5ergph2yx5r8k0", 20, 18], // 도쿠 LW
  ["2y8m4zhzd27ql07", 50, 15], // 홀란드 ST
  ["318q66hvpw61qo9", 80, 18], // 사비뉴 RW
  ["pxwrxlh92k9wryk", 28, 40], // 앤더슨 L8
  ["4wyrn4hvlloq86p", 50, 54], // 로드리 pivot
  ["965mkyhggodr1ge", 72, 40], // 레인더스 R8
  ["6ypq3nh5dj2gmd7", 14, 66], // 아이트누리 LB
  ["8yomo4h2x0xnq0j", 38, 68], // 그바르디올 CB
  ["n54qllhx733qvy9", 62, 68], // 디아스 CB(주장)
  ["ednm9whvxekpryo", 86, 66], // 리코 루이스 RB
  ["4wyrn4hv0znq86p", 50, 92], // 도나룸마 GK
];

const BENCH = [
  "ednm9whedo0ryox", // 포든
  "6ypq3nhze775md7", // 셰르키
  "vjxm8ghx0l5r6od", // 마르무시
  "23xmvkhx1y2qg8n", // 게히
  "n54qllhezp4qvy9", // 코바치치
];

const board: BoardState = {
  mode: "single",
  displayMode: "photo",
  orientation: "portrait",
  title: "맨체스터 시티",
  subtitle: "마레스카 4-3-3 · 앤더슨 영입 예상 XI",
  kit: "royal",
  home: {
    club: "맨체스터 시티",
    formation: "4-3-3",
    players: XI.map(([pid, x, y]) => ({ uid: newUid(), pid, name: null, pos: "MF", x, y }) as Placed),
  },
  bench: BENCH.map((pid) => ({ pid, name: null })),
  strokes: [],
};

const newContent = `
과르디올라의 10년이 끝났다. 후임은 엔초 마레스카. 낯선 이름 아니다. 2018-19 트레블 시즌 과르디올라 수석코치였고, 시티 유스팀을 지도했던 인물이다. 구단이 "혁명"이 아니라 "연속성"을 택했다는 신호. 다만 스쿼드는 조용히 갈아엎었다 — 골문은 도나룸마로, 뒷선엔 게히·아이트누리, 중원엔 레인더스·셰르키, 그리고 £116m 엘리엇 앤더슨(벨링엄 £115m 넘어선 역대 최고액 영국 선수)까지.

예상 베스트 XI 는 아래 전술판으로 붙였다. 4-3-3 을 기본으로, 감독이 뭘 바꾸는지 세 가지.

**1. 인버티드 풀백, 그런데 더 교조적으로.**
마레스카는 과르디올라보다 위치 규칙이 더 엄격한 포지셔널 플레이 신봉자다. 공을 잡으면 리코 루이스가 로드리 옆으로 접혀 들어와 더블 피벗을 만들고, 디아스-그바르디올-아이트누리가 백3로 재편된다. 소유 국면 실제 모양은 3-2-4-1(3-2-5). 과르디올라 후기 시티가 이미 하던 그림이라 선수단이 새로 배울 게 많지 않다는 게 선임 이유다.

**2. 앤더슨은 '데 브라위너 대체'가 아니라 다른 종류의 8번.**
£116m을 킬패스 장인에 쓴 게 아니다. 앤더슨의 값어치는 라인을 부수는 볼 운반과 전진에 있다. 왼쪽 하프스페이스에서 받아 직접 몰고 올라가 상대 블록을 끌어낸 뒤 뒤늦게 박스로 침투한다. 과르디올라 말기의 고질병이던 '로드리 의존증'을 물리적으로 메우는 카드다.

**3. 인내심 있는 후방 빌드업 → 측면 고립.**
도나룸마까지 끌어들이는 저위험 전개로 상대를 끌어올린 뒤, 하이라인 뒤 공간을 도쿠·사비뉴의 1대1로 공략한다. 홀란드는 여전히 최종 마침표. 다만 마레스카 템포는 과르디올라보다 조금 더 느리고 통제된 쪽이라, 초반 몇 경기는 "점유율은 높은데 답답하다"는 말이 나올 수 있다.

## 결론

연속성 선임 + 여름 대개편. 관전 포인트는 하나 — 로드리 옆에서 앤더슨이 얼마나 빨리 마레스카의 8번이 되느냐. 그게 되면 시티는 과르디올라 시대 마지막 약점을 지운 채 새 사이클을 연다.
`.trim();

async function main() {
  const code = encodeBoard(board);
  if (!/^[A-Za-z0-9_\-~.%]+$/.test(code) || code.length > 4000) {
    throw new Error(`lineupCode 형식/길이 위반: len=${code.length}`);
  }
  const updated = await prisma.post.update({
    where: { id: POST_ID },
    data: { lineupCode: code, content: newContent },
    select: { id: true },
  });
  console.log("재구성 완료 — post.id:", updated.id, "codeLen:", code.length);
  console.log("og:   https://www.scorebase.kr/api/og/lineup?d=" + code);
  console.log("post: https://www.scorebase.kr/analysis/" + POST_ID);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
