# 컨텍스트 노트 — /scores orphan 카드 이름 사각지대 (2026-08-16)

## 왜 중복이 나는가 (구조)

`/scores` 축구 탭은 두 소스를 합쳐 그린다. DB 매치(TheSports 수집, `ext=ts-…`)와, DB 에 없는
군소 리그를 메우는 api-football 날짜조회 orphan 카드(`af-{fixtureId}`)다. 두 소스는 같은 경기를
**다른 팀 표기**로 싣기 때문에 externalId 로는 절대 안 맞고, 판정을 이름에 기대는 축이 있다.
판정 단일 출처는 `src/lib/sports/orphan-dedup.ts` (`buildOrphanDedup`).

## 이번에 드러난 사각지대 2유형

**유형 A — af 가 구 팀명을 유지 (CHINA_3).** 중국 하위리그는 연고 이전·스폰서 개명이 잦은데
api-football 이 팀 이름만 안 따라간다. 결정적 단서는 **af 스스로 `venue.city` 는 최신을 준다**는
점이다. 이름은 옛것, 도시는 현재 — 이 어긋남으로 24팀이 1:1 로 대조됐다.

| af 이름(구) | af city(현재) | 우리(ts) 이름 |
|---|---|---|
| Langfang Glory City | Hangzhou (Linping 경기장) | Hangzhou Linping Wuyue |
| Shangyu Pterosaur | Ganzhou | Ganzhou Ruishi |
| Yichun Grand Tiger | Wenzhou | Wenzhou Professional FC |
| Guizhou Zhucheng | Guiyang | Guizhou Guiyang Athletic |
| Rizhao Yuqi | Lanzhou | Lanzhou Longyuan Athletic |
| Xi'an Ronghai | Taiyuan | Shanxi Chongde Ronghai |

이름 규칙으로는 영구히 안 풀린다(이름이 다른 게 원인). **ID 로 못박는 게 유일한 해법** —
`TeamSourceId(source="api-football")` 24건 등록으로 `coveredByTeamId` 축이 살아난다.
6경기 중 4건은 원정팀 이름이 우연히 남아 `oneSide` 로 걸러지고 있었고, 홈·원정이 **둘 다** 개명된
2건만 새어 나왔다 — 즉 "일부만 중복"으로 보여 원인이 가려졌다.

**유형 B — 로마자 표기 갈림 (RPL).** `Krylia/Krylya`, `Dinamo/Dynamo`. 슬라브어 로마자화에서
i 와 y 가 갈린다. `romanizeTeamName` 에 y→i 흡수를 넣어 해결.

> 오매칭이 중복보다 나쁘다는 원칙([[scores-orphan-card-dedup]])이라 **적용 전에 측정**했다 —
> 전체 5002팀을 리그별로 묶어 y→i 후 새로 겹치는 키가 있는지 스캔, **0건**. 단위 검증도 8/8
> (Lyon/Lorient·Bayern/Bayer·Young Boys/Yeovil 은 그대로 불일치).

## 감사 스크립트의 사각지대 (핵심 교훈)

`audit-scores-orphan-dup.ts` 는 이 문제를 잡으라고 만든 도구인데 오늘 **[잔여의심] 0건으로 통과**시켰다.
그 경보가 "같은 리그·±2h·**한쪽 팀이라도** 이름이 겹칠 때"만 뜨기 때문이다. 위 두 유형은 양팀이
모두 어긋나서 애초에 레이더 밖이었다.

→ `[사각지대]` 경보 추가. **af 경기수 ≤ DB 경기수인데 orphan 이 남는 리그**를 찍는다. 그 리그의
af 경기는 원래 전부 DB 에 있어야 하므로, 남았다면 이름 규칙이 놓친 것이다. 이름을 전혀 안 보는
수량 기준이라 표기가 아무리 갈려도 걸린다.

## 함정 메모

- **af 부분 응답**: 감사를 짧은 간격으로 반복 실행하면 분당 한도에 걸려 `fetchSoccerByDate` 가
  일부 리그만 돌려준다(af 312건 → 167건). 일일 쿼터는 멀쩡해도(31666/75000) 이렇게 된다.
  **총 af 건수가 평소보다 적으면 그 감사 결과는 신뢰하지 말 것** — 리그가 통째로 빠져 중복이
  "없어 보인다". [[api-sports-silent-200-errors]] 와 같은 클래스.
- **Neon 간헐 끊김**: 이날 `Can't reach database server` 가 몇 차례. 백필 스크립트를 재실행
  안전(존재하면 skip)하게 짠 이유. 실패 시 그냥 다시 돌리면 된다.
- af `/teams?league=929&season=2026` 는 24팀을 한 번에 준다 — 팀 대조는 경기 단위로 긁지 말고
  리그 단위로 받는 게 빠르고 누락이 없다.

관련. [[scores-orphan-card-dedup]] [[cross-source-dup-reschedule]] [[api-sports-silent-200-errors]]
