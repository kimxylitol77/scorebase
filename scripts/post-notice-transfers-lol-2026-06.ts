// 공지 (CHANGELOG) 게시 — 2026-06-06 이적시장 페이지 신설 + LOL 글로벌 리그 확장.
import "@/lib/env";
import { prisma } from "@/lib/db";

const title = "이적시장·선수 시장가치 페이지 신설 + LOL 글로벌 리그 확장";

const content = `
## 한 줄 요약

유럽 빅5 리그 선수들의 **몸값·이적 정보**를 보여주는 **이적시장 페이지**를 새로 열었고, LOL(롤) e스포츠에 **LCK뿐 아니라 LPL·LEC·LCS·LCK CL**까지 글로벌 리그를 추가했습니다.

---

## ⭐ 이적시장 · 선수 시장가치 (신규)

유럽 빅5 리그 2,500여 명 선수의 **시장가치(몸값)와 변동 추이**를 한눈에 볼 수 있는 페이지입니다.

**[👉 이적시장 바로가기](/transfers)**

### 이렇게 볼 수 있어요
- **시장가치 랭킹** — 유로(€)와 원화(억 원)를 함께 표기하고, 몸값 상승 ▲ / 하락 ▼ 변동률까지 보여줍니다.
- **다양한 필터** — 전체 / 리그별 / 팀별 / 국가별 / 포지션별로 골라 볼 수 있습니다.
- **선수 카드** — 사진, 세부 포지션(GK·CB·FB·MF·W·ST 등), 국적·국기, 소속팀·나이를 한 카드에 정리했습니다.

### 선수 개인 페이지
선수 이름을 누르면 상세 페이지로 이동합니다.
- **커리어 × 시장가치 타임라인** — 거쳐온 클럽(엠블럼 포함)과 몸값 변화를 한 그래프에서 확인할 수 있습니다.
- **시즌별 성적** — 출전·득점·도움 등 기록을 접기/펼치기로 제공합니다.
- **국적·커리어 정보** — 위키데이터 기반으로 보강했습니다.

> 팀 페이지의 선수단 명단에서도 선수 이름을 누르면 바로 이 상세 페이지로 연결됩니다.

---

## 🎮 LOL e스포츠 글로벌 리그 확장

기존 **LCK(한국)** 에 더해 세계 주요 리그와 LCK 챌린저스를 추가했습니다.

**[👉 e스포츠 경기 보기](/scores?sport=esports)**

- **LCK** (한국) · **LCK CL** (LCK 챌린저스 / 2군)
- **LPL** (중국) · **LEC** (유럽) · **LCS** (북미)

경기 일정과 **AI 예측**을 날짜별로 확인할 수 있고, 일정은 매일 자동으로 업데이트됩니다.
`.trim();

const slug = "transfer-market-lol-2026-06";

async function main() {
  const existing = await prisma.notice.findUnique({ where: { slug } });
  if (existing) {
    const updated = await prisma.notice.update({
      where: { slug },
      data: { title, content, type: "CHANGELOG" },
    });
    console.log("기존 공지 갱신:", updated.id, updated.slug);
  } else {
    const created = await prisma.notice.create({
      data: { title, slug, type: "CHANGELOG", content },
    });
    console.log("신규 공지 등록:", created.id, created.slug);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
