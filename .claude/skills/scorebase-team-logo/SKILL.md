---
name: scorebase-team-logo
description: scorebase 에서 팀 이름이 보이는 곳에 팀 로고(마크)를 따라붙인다. 사용자가 "팀 마크 해줘", "팀 로고 붙여줘", "여기 로고 따라오게", "팀 이름 옆에 로고", "로고도 같이", "마크 넣어줘" 같은 요청을 하거나, 특정 페이지/탭 URL 을 주며 "여기 팀 마크" 라고 할 때 반드시 사용. 일정·역사·순위·맞대결·매치카드 등 팀명이 텍스트로만 나오는 곳에 로고를 추가하는 정형 절차(공용 TeamBadge + DB연결/이름매칭 두 가지 로고 해석 + 클럽=로고·국가=국기 규칙 + 현역팀 커버리지 검증)를 한 번에 적용한다.
---

# Scorebase 팀 로고 (팀 마크)

팀 이름이 텍스트로만 나오는 곳에 **로고(마크)** 를 따라붙인다. 매번 설명 없이 이 절차로.

## 0. 핵심 규칙

- **로고 필드 = `Team.logoUrl`** (prisma Team 모델). 없으면(null) **아무것도 안 그림**(graceful, 깨진 img 금지).
- **클럽 리그 = 로고 / 국가대항 = 국기.** `isNationalTeamLeague(league)`(`@/lib/sports/fifa-rankings`) 가 true 면 로고 대신 `fifaFlag()` 국기. 둘을 같이 그리지 말 것.
- **공용 컴포넌트 `@/components/TeamBadge`** 로만 그린다(직접 `<img>` 산발 금지). 시그니처: `<TeamBadge logoUrl={...} size={18|20} className?="bg-white rounded-sm" />`.
- 배치 = 이름 **옆**. 홈(우측정렬)은 `이름 → 배지`(중앙 스코어 쪽), 원정은 `배지 → 이름`. 국기와 같은 자리.

## 1. 로고를 어떻게 구하나 — 두 경로

### A. DB 연결 (매치·순위 등 — 쉽고 100%)
팀이 `homeTeam`/`awayTeam` 또는 `teamId` 로 DB 에 연결돼 있으면 **select 에 `logoUrl` 만 추가**하면 끝.

```ts
// 쿼리
homeTeam: { select: { name: true, logoUrl: true } },
awayTeam: { select: { name: true, logoUrl: true } },
// 렌더 (showFlag = isNationalTeamLeague(league))
const hLogo = showFlag ? null : m.homeTeam.logoUrl;
<TeamBadge logoUrl={hLogo} size={20} />
```
예시: `src/components/leagues/LeagueFixtures.tsx`, `LeagueStandingsTable.tsx`.

### B. 이름만 있음 (정적 우승팀 목록 등 — 이름→DB 매칭)
우승팀처럼 **이름 문자열뿐**이면(위키데이터 풀네임 vs 짧은 DB명), 리그 팀 로고로 매칭한다. 한글 정확일치 → 영문 정확/부분일치 순(graceful).

```ts
const FOOTBALL_TOKENS = new Set(["fc","afc","cf","sc","ac","cd","ud","as","rcd","sd","ssc","ss","uc","acf","cfc","fbc","vfl","vfb","sv","club"]);
const NAME_ALIAS:[RegExp,string][]=[[/munchen/g,"munich"],[/koln/g,"cologne"],[/nurnberg/g,"nuremberg"],[/monchengladbach/g,"gladbach"]]; // 독·불 번역차
const normEn = (s:string)=>{ let r=s.toLowerCase().normalize("NFD").replace(/\./g,"").split(/[^a-z0-9]+/).filter(w=>w&&!FOOTBALL_TOKENS.has(w)&&!/^\d+$/.test(w)).join(""); for(const[re,to]of NAME_ALIAS)r=r.replace(re,to); return r; };
const normKo = (s:string)=>s.replace(/[a-zA-Z0-9.()]+/g," ").replace(/\s+/g,"").trim(); // 한글만(ko 의 라틴 접두 strip)

const teams = await prisma.team.findMany({ where:{ league }, select:{ name:true, logoUrl:true }});
const koMap = new Map<string,string>(); const enList:{norm:string;logo:string}[]=[];
for (const t of teams) { if(!t.logoUrl) continue;
  koMap.set(normKo(toKoreanTeamName(t.name, league)), t.logoUrl);   // @/lib/team-names
  enList.push({ norm: normEn(t.name), logo: t.logoUrl });
}
const logoOf = (ko:string, en:string):string|null => {
  const k = koMap.get(normKo(ko)); if (k) return k;                 // 1) 한글 정확(EPL·라리가 강함)
  const q = normEn(en); if (!q) return null;
  const ex = enList.find(t=>t.norm===q); if (ex) return ex.logo;    // 2) 영문 정확
  let best:{norm:string;logo:string}|null=null;                     // 3) 영문 부분(풀네임 ⊇ 짧은 DB명, len≥4, 최장)
  for (const t of enList) if (t.norm.length>=4 && (q.includes(t.norm)||t.norm.includes(q)) && (!best||t.norm.length>best.norm.length)) best=t;
  return best?.logo ?? null;
};
```
- **컴포넌트를 `async` 로** 만들고(서버 컴포넌트), 호출부는 `await` 없이 `<LeagueHistory .../>` 그대로(React 가 await).
- 미스(강등·해체팀)는 DB 로고가 없어 자연히 로고 없이 표시 — **정상**. 풀네임 데이터(분데스·리그1 일부 미번역)는 한계.
- 기준 구현: `src/components/leagues/LeagueHistory.tsx`.

## 2. 절차

1. 대상 컴포넌트에서 팀명이 어떻게 나오는지 확인(DB연결 A 인가, 이름만 B 인가).
2. A → select 에 `logoUrl` 추가 + `<TeamBadge>`. B → 매처 빌드 + `<TeamBadge>`.
3. `isNationalTeamLeague` 분기 — 국가대항은 국기 유지, 클럽만 로고.
4. **검증(B 경로 필수)** — prod DB 로 현역팀 매칭률 확인. 미스가 강등·해체팀뿐인지 본다:
   ```bash
   npx tsx --env-file=/Users/kimss/scorebase/.env.local scripts/_check-logos-tmp.ts   # 임시, 확인 후 rm
   ```
   (PrismaClient 직접 생성 + championsData/toKoreanTeamName import. EPL 현역 5/5 면 정상.)
5. `npx tsc --noEmit` → 0.
6. 배포는 **scorebase-deploy** 스킬로(commit 한국어·footer 없음·main 직접 push).

## 절대 하지 말 것

- 로고 없을 때 깨진 `<img>` 노출 — `TeamBadge` 가 null 가드(logoUrl 없으면 `return null`).
- 클럽 로고 + 국기 동시 표시 — 리그 종류로 택일.
- 이름매칭 B 를 검증 없이 배포 — normName 한 글자 차이로 0% 날 수 있음(F.C. split·약어 Man City 등). 현역팀 매칭률 먼저 본다.
- `<img>` 산발 — 항상 `@/components/TeamBadge`.

## 참고
- 공용: `src/components/TeamBadge.tsx`
- A 예시: `LeagueFixtures.tsx` · `LeagueStandingsTable.tsx`
- B 예시: `LeagueHistory.tsx`
- 로고 데이터 소스/복구는 종목별 상이(메모리 `nba-team-logos-espn` 등). DB `Team.logoUrl` 이 단일 진실원.
