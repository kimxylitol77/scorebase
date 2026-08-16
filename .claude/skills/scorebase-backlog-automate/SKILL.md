---
name: scorebase-backlog-automate
description: scorebase 의 대량 백로그 작업이나 큰 작업 list 가 들어왔을 때 자동 분류 + 셋업. 사용자가 "백로그 정리해", "이거 다 spawn 해", "대량 작업 같이 진행", "이런 작업들 자동화", "이거 다 처리하게 해줘", "백그라운드로 돌려", "한꺼번에 셋업해" 같은 요청을 하거나, 메시지에 5+ 작업 항목 list 가 paste 됐을 때, 또는 project_pending.md 를 참고하라는 컨텍스트가 있을 때 반드시 사용. 작업을 4가지 패턴(즉시 처리 / 주간 audit / 1회 reminder / 큰 spawn)으로 자동 분류하고 scheduled-tasks + spawn_task chip 으로 적절히 분배해 1인 운영자의 시간을 라이브 대응에만 집중하게 만든다.
---

# Scorebase Backlog Automate

대량 백로그/큰 작업 list 를 받았을 때, 매번 사용자가 "이건 spawn 으로 / 이건 매주 / 이건 6월 1일" 일일이 결정하지 않게 자동 분류 + 셋업. 1인 운영자의 시간이 자동화로 흘러가도록.

## 왜 이 스킬이 필요한가

scorebase 1인 운영 패턴:
- 라이브 봇 대응 (즉시) + 백로그 작업 (며칠~몇 달) 이 섞임
- 백로그를 매번 손으로 셋업하면 메인 세션 컨텍스트 소모 + 잊혀짐
- 이미 사용 가능한 도구 (scheduled-tasks / spawn_task chip / skill 자동 트리거) 로 거의 자동화 가능

## When to trigger

- 사용자가 "백로그 정리", "이거 다 진행", "한꺼번에 셋업", "대량 작업" 같은 요청
- 메시지에 작업 항목 5개+ 가 list 형식으로 paste 됐을 때
- `project_pending.md` 같은 메모리 파일을 참고하라는 컨텍스트
- 큰 리팩토링 / 마이그레이션 작업이 여러 단계로 나뉘는 상황

## Workflow

### 1. 작업 list 추출

세 가지 source 에서:
- 사용자 메시지의 명시적 list (bullet/번호/줄바꿈)
- `/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md` 의 `## 🚧 다른 미완료` 섹션
- 이번 세션의 진단 결과 / 봇 알림에서 발견된 follow-up

각 항목을 표준화: `{ title, description, estimated_hours, urgency, dependencies, recurring? }`

### 2. 4가지 패턴으로 자동 분류

판단 기준:

| 패턴 | 조건 | 도구 |
|---|---|---|
| **즉시 처리 (메인 세션)** | 30분 이내, 검증 가능, 의존성 없음 | 일반 Edit/Bash, 이번 세션에서 진행 |
| **주간/일간 audit** | 반복 점검 필요 (cover/health check 같은 read-only) | `mcp__scheduled-tasks__create_scheduled_task` + cronExpression |
| **1회 reminder** | 특정 시점 (시즌 시작, 비시즌 진입, 배포 일정) | `mcp__scheduled-tasks__create_scheduled_task` + fireAt |
| **큰 spawn** | 1일+ 작업 / 마이그레이션 / schema 변경 / 별도 worktree 필요 | `mcp__ccd_session__spawn_task` chip |

**힌트**:
- "audit", "체크", "monitor", "건강 검사" 같은 단어 → 주간 audit 후보
- "비시즌", "시즌 시작", "내년", "6월" 같은 시점 명시 → 1회 reminder 후보
- "schema 변경", "리팩토링", "마이그레이션", "FK 이전" → 큰 spawn 후보
- 30분 이내로 끝나는 단순 fix → 즉시 처리

### 3. 분류 결과 표 + 비용 추산

표 형식 보고 (한국어). 각 항목:
- 패턴 / 작업 / 도구 / 예상 비용

비용 추산 가이드 (Claude Sonnet 기준):
- read-only audit: $0.10~0.50/회
- 1회 reminder: $0.05/회 (메시지만)
- 큰 spawn (1-2일 작업): $5~20/회
- 메인 세션 즉시 처리: $0.5~2/작업

월 비용 합산해서 보고:
```
주간 audit × 4 = ~$1
1회 reminder × 1 = $0.05
spawn 3개 (사용자 1-click 시작) = $15~60
─────────────────────────────
합산 ~ $16~61/월
```

### 4. AskUserQuestion 옵션

전체 셋업 vs 일부만 선택:

옵션 패턴:
- (A) 전부 자동 셋업 — 추천
- (B) audit + reminder 만 (spawn 은 사용자가 chip 선택)
- (C) 분류표만 보고 결정

### 5. 실제 셋업 (사용자 confirm 후)

각 도구 호출 시 prompt 는 **self-contained** — 새 세션이 메모리 없이 실행 가능하게:

**scheduled-tasks prompt 포함 내용**:
- 트리거할 스킬 (예: `/scorebase-coverage-audit`)
- 결과 저장 위치 (메모리 파일 경로)
- 변동 없으면 알림 skip 로직 (비용 절약)
- 프로젝트 컨텍스트 (메모리 경로, 디렉토리, 토큰 위치)

**spawn_task prompt 포함 내용**:
- 작업 목적 + 배경 (현재 메모리 없는 agent 도 이해 가능하게)
- 단계별 가이드 (1, 2, 3...)
- 의존성 (다른 spawn 과 순서)
- 검증 기준
- 주의사항 + 메모리 파일 참조

### 6. 메모리 업데이트

`project_pending.md` 의 항목들이 자동화 셋업됐다는 marker 추가:
```
- **[Team schema 개선 (spawn_task 등록 2026-05-25)]** — chip 으로 진행 대기
```

### 7. 사용자에게 최종 보고

표 + 한 줄 요약. 사용자 메모리 [feedback_response_format.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_response_format.md) 패턴.

예:
```
## 셋업 완료

| 자동화 | 발동 시점 | 액션 |
|---|---|---|
| scheduled-tasks: 주간 audit | 매주 일요일 23:00 | ... |
| spawn_task chip #1 | 사용자 1-click | ... |

## 비용 추산

월 약 $X~Y. (audit ~$1, reminder $0.05, spawn 클릭 시 $15~60)

이제 라이브 대응에만 집중하시면 됩니다.
```

## 자동 분류 휴리스틱 상세

**큰 spawn 으로 보내야 할 case**:
- prisma schema 변경 / 마이그레이션
- 컴포넌트 5+ 파일 영향
- 검증에 production data 비교 필수
- 메모리 [feedback_*.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/) 에 "위험" / "큰 작업" 명시된 패턴

**주간 audit 으로 보내야 할 case**:
- "/스킬-이름" 으로 트리거 가능
- read-only (DB 쿼리 + 메모리 append)
- 정기 점검으로 패턴 발견 (cover/health/quota)

**1회 reminder 로 보내야 할 case**:
- 시점이 명시됨 ("비시즌 6월", "다음 시즌 시작", "내년 1월")
- 작업 자체는 아님, 작업 시작 권유

**즉시 처리 case**:
- 단일 파일 edit + tsc + push
- 검증이 단위 테스트 또는 production curl 한 번
- 의존성 없음

## 절대 하지 말 것

- **사용자 confirm 없이 spawn/schedule 자동 호출** — 비용 발생 + 후속 작업 책임. 반드시 AskUserQuestion → 사용자 답 후 실행.
- **하나의 큰 작업을 잘게 쪼개서 chip 10개+** — 사용자 chip 관리 부담. 1-2일 단위로 묶음.
- **scheduled task prompt 에 메모리 의존 컨텍스트만** — fresh agent 가 못 읽음. 필요한 모든 경로/토큰/예제 명시.
- **비용 추산 X 안내** — 사용자가 plan 한도 모르고 큰 spawn 다발 시 한도 초과. 항상 표 + 월 합산.
- **scorebase 외 프로젝트 적용** — 이 스킬은 scorebase 특화 (메모리 경로, project_pending 구조, 도구 사용 패턴 모두 scorebase 기준). 다른 프로젝트는 별도 스킬.

## 참고

- 이번 세션 (2026-05-25) 의 셋업 예시:
  - scheduled-tasks: scorebase-weekly-coverage-audit (cronExpression "0 23 * * 0")
  - scheduled-tasks: scorebase-nba-dedup-reminder (fireAt "2026-06-01T09:00:00+09:00")
  - spawn_task chips: Team schema 개선 / 발트 3국 standings / ts mapping 6리그
- 비용 추산은 Claude Sonnet 기준. Opus 는 5배. Haiku 는 0.2배. 사용자 model 확인 후 보정.
- 관련 스킬:
  - `/scorebase-triage` — 봇 알림 자동 진단 (대응)
  - `/scorebase-coverage-audit` — 주간 audit 대상 스킬
  - `/scorebase-deploy` — 셋업 후 fix 마무리
  - `/scorebase-team-dedup` — schema 개선 후 dedup
