// 아바타 프리셋 — 이모지 + 배경색. User.avatarUrl 에 프리셋 id 저장(이미지 업로드 X).
export interface AvatarPreset {
  id: string;
  emoji: string;
  bg: string; // tailwind 배경 클래스
}

export const AVATARS: readonly AvatarPreset[] = [
  { id: "soccer", emoji: "⚽", bg: "bg-emerald-500" },
  { id: "fire", emoji: "🔥", bg: "bg-orange-500" },
  { id: "trophy", emoji: "🏆", bg: "bg-amber-500" },
  { id: "star", emoji: "⭐", bg: "bg-yellow-500" },
  { id: "lightning", emoji: "⚡", bg: "bg-sky-500" },
  { id: "crown", emoji: "👑", bg: "bg-violet-500" },
  { id: "rocket", emoji: "🚀", bg: "bg-indigo-500" },
  { id: "diamond", emoji: "💎", bg: "bg-cyan-500" },
  { id: "target", emoji: "🎯", bg: "bg-rose-500" },
  { id: "baseball", emoji: "⚾", bg: "bg-blue-500" },
  { id: "basketball", emoji: "🏀", bg: "bg-orange-600" },
  { id: "hockey", emoji: "🏒", bg: "bg-teal-500" },
] as const;

export const AVATAR_IDS = AVATARS.map((a) => a.id);
export const DEFAULT_AVATAR_ID = "soccer";

export function avatarById(id: string | null | undefined): AvatarPreset {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
