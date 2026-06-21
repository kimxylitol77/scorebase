// 분석가 아바타 결정 + 봇 식별 — 봇 계정도 일반 회원처럼 표시(아바타/소개글).
//   - 봇: manager-bot("스코어베이스 분석팀", badge=OFFICIAL), ou-bot("사관학교"), fake-members 15명.
//   - 봇은 avatarUrl 미설정 → 닉네임 해시로 결정적 프리셋 아바타(매번 동일).
//   - 소개글(intro)은 스키마에 필드가 없어 정적 dict(봇) + 기본문구(나머지).

import { AVATARS, avatarById, ROOKIE_AVATAR, AVATAR_EDIT_MIN_LEVEL, type AvatarPreset } from "@/lib/avatars";
import { FAKE_NICKNAMES } from "@/lib/analysis/fake-members";

// 각 봇 파일 상수와 동기 (manager-bot.ts:23, ou-bot.ts:15).
const MANAGER_NICKNAME = "스코어베이스 분석팀";
const OU_BOT_NICKNAME = "사관학교";

/** 봇(AI 분석관) 닉네임 단일 진실. */
export const AI_ANALYST_NICKNAMES: ReadonlySet<string> = new Set<string>([
  MANAGER_NICKNAME,
  OU_BOT_NICKNAME,
  ...FAKE_NICKNAMES,
]);

/** AI 분석관 여부 — OFFICIAL 배지이거나 봇 닉네임 화이트셋. */
export function isAiAnalyst(nickname: string, badge: string | null): boolean {
  return badge === "OFFICIAL" || AI_ANALYST_NICKNAMES.has(nickname);
}

/** 문자열 → 32bit 해시 (결정적). */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 아바타 결정.
 *  - 봇(AI 분석관): 설정된 아바타 우선, 없으면 닉네임 해시 프리셋(등급 무관).
 *  - 실회원 1등급: 모두 기본 루키 이미지(저장된 아바타 무시).
 *  - 실회원 2등급+: 본인이 설정한 아바타, 미설정이면 루키 이미지.
 * level 을 안 넘기면(undefined) 게이팅 없이 설정값/해시로 폴백.
 */
export function resolveAvatar(
  avatarUrl: string | null,
  nickname: string,
  level?: number,
  badge?: string | null,
): AvatarPreset {
  if (isAiAnalyst(nickname, badge ?? null)) {
    return avatarUrl ? avatarById(avatarUrl) : AVATARS[hash(nickname) % AVATARS.length];
  }
  if (level != null && level < AVATAR_EDIT_MIN_LEVEL) return ROOKIE_AVATAR;
  return avatarUrl ? avatarById(avatarUrl) : ROOKIE_AVATAR;
}

// 봇별 소개글 — 미등록 봇/실회원은 analystIntro 의 기본문구.
const INTRO: Record<string, string> = {
  [MANAGER_NICKNAME]:
    "스코어베이스 공식 분석팀입니다. Elo 레이팅·최근 폼·부상·선발/골리 시그널을 종합한 데이터 기반 예측을 매일 제공합니다.",
  [OU_BOT_NICKNAME]:
    "오버언더(득점 총합) 전문 분석관. 양 팀 공·수 지표와 시장 라인을 비교해 오버/언더 가치를 찾습니다.",
};

/** 소개글 — 봇 dict 우선, 나머지는 일반 회원 문구. */
export function analystIntro(nickname: string): string {
  if (INTRO[nickname]) return INTRO[nickname];
  return "예측 적중에 도전하는 스코어베이스 회원입니다.";
}
