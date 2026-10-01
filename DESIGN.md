---
version: 1
name: Scorebase
description: 한국향 AI 스포츠 데이터 미디어. 라이트는 연회색 바탕 위 흰 카드와 로즈 액센트, 다크는 #0a0a0a 위로 살짝 떠 보이는 elevated 카드. 숫자가 주인공이라 표·스코어보드는 tabular 숫자와 얇은 선으로 조용하게, 허브·랜딩은 큰 둥근 카드로 넉넉하게. 장식 이모지 대신 lucide 라인 아이콘.

colors:
  background-light: "#f6f6f7"   # globals.css --background (순백 금지 — 흰 카드 경계가 사라진다)
  background-dark: "#0a0a0a"
  foreground-light: "#0a0a0a"
  foreground-dark: "#ededed"
  surface-light: "#ffffff"      # bg-white ring-1 ring-black/5
  surface-dark: "rgba(255,255,255,0.04)"  # dark:bg-white/[0.04] ring-white/10 — 배경보다 밝아야 '떠' 보인다
  accent: "rose-500 / rose-600 (light text) / rose-400 (dark text)"
  live: "rose-500 tint (bg-rose-500/[0.06]) + rose-600 텍스트"
  ai-home: "sky-500"            # AI 예측 막대 홈
  ai-draw: "neutral-300/600"    # 무
  ai-away: "orange-500"         # 원정
  link: "blue-600 / dark:blue-400"
  success: "emerald-500"        # 적중·상승
  muted: "neutral-400 ~ neutral-500"

typography:
  sans: "Pretendard Variable (본문·제목), font-feature-settings ss03 cv01"
  mono: "Geist Mono (코드·일부 숫자)"
  numbers: "tabular-nums — 점수·배당·확률·기록은 항상"
  flags: "Twemoji Country Flags 폴리필 (윈도우 국기 이모지)"
---

# Scorebase DESIGN.md

에이전트가 새 화면을 만들거나 고칠 때 이 파일 하나로 톤을 맞춘다. 근거는 코드(`src/app/globals.css`, `src/components/AmbientGlow.tsx`, `src/components/scores/soccer/SoccerScoreboardTable.tsx`)와 사용자가 확정한 디자인 결정이다. 코드가 바뀌면 이 파일도 같이 고친다.

## Overview

- 사용자는 한국 스포츠 팬. 화면의 주인공은 점수·확률·배당·기록 숫자다.
- 두 가지 톤이 공존한다. 먼저 어느 톤인지 정하고 시작한다.
  - **허브·랜딩 톤(애플풍 카드)**: 홈, 종목 허브(/baseball 등), 요약·소개 페이지. 큰 둥근 모서리, 넉넉한 여백, hover 부상.
  - **데이터 톤**: 표·순위·스탯·스코어보드. 얇은 선, 촘촘한 행, 그림자 최소. 숫자 정렬이 디자인이다.
- 라이트 = "로즈 프리미엄", 다크 = "애플 elevated". 둘 다 반드시 같이 만든다(`dark:` 변형 필수, class 기반 다크모드).

## Colors

### Surface
- 페이지 배경은 `--background` 만 쓴다. 라이트 `#f6f6f7`, 다크 `#0a0a0a`.
- 카드: `bg-white ring-1 ring-black/5` + 은은한 그림자 / 다크 `dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none`.
- **다크에서 `dark:bg-neutral-950`·`zinc-950`·`black` 카드 금지.** 배경과 같은 색이라 평평하게 보인다(예외: sticky+backdrop-blur 헤더 `neutral-950/85`, 가로 스크롤 표의 sticky 첫 열 `dark:bg-neutral-900`).
- 페이지 루트는 `relative` + `<AmbientGlow />`(상단 로즈·에메랄드 메시 글로우).

### Accent·의미색
- 액센트는 로즈 하나. eyebrow 필, 활성 탭 밑줄, 강조 링크 hover.
- 진행 중(LIVE)은 로즈 틴트 행 + 로즈 텍스트.
- AI 예측 막대: 홈 sky-500 · 무 회색 · 원정 orange-500. 이 세 색은 사이트 전역 약속이라 다른 의미로 쓰지 않는다.
- 상승·적중 emerald, 하락·빗나감 rose/neutral. 배당 화살표 ↓ 하락 · ↑ 상승.
- 리그 히어로 그라데이션, 시상대 금·은·동, 국가대표 헤더 파랑 등은 아이덴티티 색이라 보존한다.

## Typography

- 본문·제목 Pretendard. 한국어 문단에는 `break-keep`.
- 점수·배당·확률·기록 숫자는 전부 `tabular-nums`. 소수 기록(타율 .316)은 앞 0 생략 규칙을 열 정의(`stripLeadingZero`)로 따른다.
- 크기 단계(실사용): 페이지 제목 `text-2xl sm:text-3xl font-bold tracking-tight` · 섹션 `text-base font-bold` · 표 본문 `text-[13px]~text-sm` · 보조 `text-[11px]~text-[12px] text-neutral-500` · 마이크로 라벨 `text-[10px] uppercase tracking-[0.15em]`.

## Layout

- 컨테이너 `max-w-6xl`(데이터)·`max-w-7xl`(스코어·스탯 표), 좌우 `px-4 sm:px-6`.
- 모바일 우선. 375px 에서 글자가 세로로 깨지지 않는지 본다 — 가로 스크롤 안 표는 `w-full` 대신 `min-w-max`/`min-w-[760px]`.
- 표 칸 폭은 숫자 기준으로 고정(예: 스코어보드 AI 예측 132px · 배당 136px). 내용 따라 출렁이지 않게.

## Elevation & Depth

- 라이트는 ring + 아주 옅은 그림자(`shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)]`), 다크는 그림자 없이 밝기(`white/[0.04]`)로 깊이.
- hover 는 `-translate-y-0.5` + 그림자 한 단계. 모든 전환 `transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`.

## Shapes

- 허브 카드 `rounded-[1.5rem] sm:rounded-[2rem]`, 데이터 카드·표 `rounded-xl ~ rounded-2xl`.
- 탭·필터·페이지네이션은 `rounded-full` 필. 원형 선수 사진은 고정 정사각(`h-8 w-8`·`aspect-square`) — 창 비율에 타원으로 깨지지 않게.

## Components

### Eyebrow
`inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400` + 점 하나.

### 탭
- 페이지 탭 = 밑줄형 `border-b-2 border-rose-500 text-rose-600 dark:text-rose-400`(PlayerTabs 표준).
- 보기 전환·필터 = 필 그룹(`bg-neutral-100 p-1` 안 활성 `bg-neutral-900 text-white dark:bg-white dark:text-neutral-900`).

### 스코어보드 표 (`SoccerScoreboardTable` — 전 종목 공용)
- /scores 기본 보기. 시작 시각순 한 줄 + 리그가 바뀔 때 리그 제목 줄. 진행·예정 위, 종료 아래, 연기 맨 아래.
- 열: 즐겨찾기 · 시간 · 홈[순위] · 스코어(hover 툴팁) · 원정 · AI 예측 · 배당. 야구는 원정이 왼쪽 + 홈 배지, 무승부 없는 종목은 2칸.
- 새 경기 목록을 만들 때 이 부품을 먼저 쓴다. /scores 카드에 요소를 더 얹지 않는다(참여 기능은 /picks·상세로).

### 스탯 표 (`StatsExplorer` — 스탯 페이지 공용, `lang` 으로 영어판)
- 표·카드·리더·산점도 4뷰, 셀 아래 백분위 숫자 + 상위일수록 로즈 배경.

### 축구 피치
- 반드시 `src/components/pitch/Pitch.tsx` + `PitchMarker`. 고정 px 원·박스, `preserveAspectRatio="none"` 금지.

### 아이콘·이모지
- UI 장식은 lucide 라인 아이콘(Trophy·Target 등). 헤더·제목·탭의 장식 이모지 금지.
- 데이터·상태 이모지는 유지: 국기(이모지가 표준, `aria-hidden`), 메달 🥇🥈🥉, 적중 ✓, 등급.

## Do's and Don'ts

### Do
- 라이트·다크 둘 다 실제로 열어 본다(다크는 `documentElement.classList.add('dark')`).
- 낡은 데이터는 숨기지 말고 "기준 시점" 라벨을 붙여 보여준다.
- 결과·우승 같은 사실 문구는 DB 판정으로 렌더한다(짐작 문구 금지).
- 기존 컴포넌트에 작은 요소(국기·배지)를 끼울 때도 정렬(flex·truncate·shrink-0)과 다크 색까지 점검한다.

### Don't
- 보라·바이올렛 그라데이션 같은 "AI 템플릿" 톤 금지 — 액센트는 로즈.
- 카드 안에 카드 안에 카드 중첩 금지.
- 다크 카드에 배경과 같은 검정 금지.
- 장식 이모지·이모지 제목 금지.
- 숫자 열에 비례 폭 숫자 금지(`tabular-nums`).

## Responsive Behavior

- 기준 폭 375(모바일)·768·1280. `sm:` 이 데스크톱 전환점이다.
- 모바일에서 표의 부가 열(AI 예측·배당)은 줄 아래 얇은 막대로 내리거나 숨긴다(스코어보드 방식).
- 윈도우에서 "안 보인다" 신고는 CSS 결손보다 대비(흰 카드 vs 배경)를 먼저 의심한다.

## Iteration Guide

1. 허브 톤인지 데이터 톤인지 정한다.
2. 비슷한 기존 화면(스코어보드·StatsExplorer·LeagueLeaderBoard·홈 카드)에서 부품을 먼저 찾는다.
3. 라이트·다크·375px 세 가지로 확인한다.
4. 바뀐 규칙이 있으면 이 파일을 같이 고친다.
