// 아바타 — 이모지 프리셋(emoji+bg) 또는 업로드 사진(imageUrl). User.avatarUrl 에 프리셋 id 또는 Cloudinary URL 저장.
export interface AvatarPreset {
  id: string;
  emoji: string;
  bg: string; // tailwind 배경 클래스
  imageUrl?: string; // 업로드 사진이면 이미지 URL(이 경우 emoji/bg 무시). 미설정=이모지 프리셋
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

/** 업로드 사진 여부 — avatarUrl 이 http(s) URL 또는 data URL 이면 사진, 아니면 프리셋 id. */
export function isUploadedAvatar(id: string | null | undefined): boolean {
  return !!id && (id.startsWith("http") || id.startsWith("data:image/"));
}

export function avatarById(id: string | null | undefined): AvatarPreset {
  if (isUploadedAvatar(id)) {
    return { id: id!, emoji: "", bg: "bg-neutral-200 dark:bg-neutral-700", imageUrl: id! };
  }
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

/** 신규(1등급) 회원 기본 아바타 — 등급 게이팅 시 표시. 2등급부터 변경 가능. */
export const ROOKIE_AVATAR: AvatarPreset = {
  id: "rookie",
  emoji: "",
  bg: "bg-neutral-200 dark:bg-neutral-700",
  imageUrl: "/rookie-avatar.png",
};

/** 2등급(유소년)부터 아바타 변경 가능 — 1등급은 모두 ROOKIE_AVATAR. */
export const AVATAR_EDIT_MIN_LEVEL = 2;
