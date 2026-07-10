// 자유게시판(FREE) 회원 글 1회 게시 — 맨시티 마레스카 체제 + 앤더슨 영입 예상 XI 전술 분석.
import "@/lib/env";
import { prisma } from "@/lib/db";

// fake-members.ts / user-auth.ts 는 "server-only" 가드라 tsx 에서 import 불가.
// 이 회원은 이미 존재(기존 봇이 생성)하므로 조회만 한다.
const NICK_INDEX = 13; // 축덕광 — 축구 성향 일반 회원

async function fakeMemberId(i: number): Promise<string> {
  const email = `fake${i}@scorebase.internal`;
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new Error(`회원 없음: ${email}`);
  return u.id;
}

const title = "마레스카 맨시티, 앤더슨까지 품은 예상 XI 전술적으로 뜯어봤다";

const content = `
과르디올라의 10년이 끝났다. 후임은 엔초 마레스카. 낯선 이름 아니다. 2018-19 트레블 시즌 과르디올라 수석코치였고, 시티 유스팀을 지도했던 인물이다. 구단이 "혁명"이 아니라 "연속성"을 택했다는 신호. 그리고 그 첫 큰 베팅이 노팅엄 포레스트에서 데려온 £116m 엘리엇 앤더슨 — 벨링엄(£115m)을 넘어선 역대 최고액 영국 선수다.

## 예상 베스트 XI (4-3-3)

\`\`\`
                 홀란드(9)
      도쿠(11)              사비뉴(26)
            앤더슨(8)   레인더르스(4)
                  로드리(16)
   그바르디올(24)              리코 루이스(82)
          디아스(3·C)   아케(6)
                 에데르송(31)
\`\`\`

- **GK** 에데르송 — 여전히 빌드업 첫 번째 패서.
- **수비** 리코 루이스 · 디아스(C) · 아케 · 그바르디올
- **중원** 로드리 · 앤더슨 · 레인더르스
- **공격** 사비뉴 · 홀란드 · 도쿠

*앤더슨은 월드컵 종료 후 정식 등록. 개막 초반엔 포든이 같은 자리를 메울 수도 있다.*

## 마레스카는 뭘 바꾸나

**1. 인버티드 풀백, 그런데 더 교조적으로.**
마레스카는 과르디올라보다 위치 규칙이 더 엄격한 포지셔널 플레이 신봉자다. 공을 잡으면 리코 루이스가 로드리 옆으로 접혀 들어와 더블 피벗을 만들고, 디아스-아케-그바르디올이 백3로 재편된다. 소유 국면 실제 모양은 3-2-4-1(3-2-5). 과르디올라 후기 시티가 이미 하던 그림이라 선수단이 새로 배울 게 많지 않다는 게 선임 이유다.

**2. 앤더슨은 '데 브라위너 대체'가 아니라 다른 종류의 8번.**
£116m을 킬패스 장인에 쓴 게 아니다. 앤더슨의 값어치는 라인을 부수는 볼 운반과 전진에 있다. 왼쪽 하프스페이스에서 받아 직접 몰고 올라가 상대 블록을 끌어낸 뒤 뒤늦게 박스로 침투한다. 과르디올라 말기의 고질병이던 '로드리 의존증'을 물리적으로 메우는 카드다.

**3. 인내심 있는 후방 빌드업 → 측면 고립.**
골키퍼까지 끌어들이는 저위험 전개로 상대를 끌어올린 뒤, 하이라인 뒤 공간을 도쿠·사비뉴의 1대1로 공략한다. 홀란드는 여전히 최종 마침표. 다만 마레스카 템포는 과르디올라보다 조금 더 느리고 통제된 쪽이라, 초반 몇 경기는 "점유율은 높은데 답답하다"는 말이 나올 수 있다.

## 결론

연속성 선임 + 즉시 전력 보강. 리스크는 낮게 깔고 간 여름이다. 관전 포인트는 하나로 압축된다 — 로드리 옆에서 앤더슨이 얼마나 빨리 마레스카의 8번이 되느냐. 그게 되면 시티는 과르디올라 시대 마지막 약점을 지운 채 새 사이클을 연다.
`.trim();

async function main() {
  const dup = await prisma.post.findFirst({
    where: { category: "FREE", title },
    select: { id: true },
  });
  if (dup) {
    console.log("이미 게시됨 — skip:", dup.id);
    return;
  }
  const authorId = await fakeMemberId(NICK_INDEX);
  const post = await prisma.post.create({
    data: {
      authorId,
      category: "FREE",
      title,
      content,
      sport: "soccer",
    },
    select: { id: true, authorId: true },
  });
  console.log("게시 완료 — post.id:", post.id, "author:", post.authorId);
  console.log("URL: https://www.scorebase.kr/analysis/" + post.id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
