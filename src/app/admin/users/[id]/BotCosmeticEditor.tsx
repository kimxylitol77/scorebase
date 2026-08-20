// 봇 계정 프로필 편집기 — 관리자가 상점 아이템 중에서 골라 장착시킨다.
// 고르는 즉시 위 미리보기에 반영되므로 저장 전에 실제 모습을 확인할 수 있다.
"use client";

import { useState } from "react";
import { AVATARS, avatarById } from "@/lib/avatars";
import { shopItemsByType, shopItemById, RAINBOW_NAME_CLASS, TITLE_BADGE_CLASS } from "@/lib/shop";
import { saveBotCosmetics } from "./actions";

interface Props {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  nameColor: string | null;
  avatarFrame: string | null;
  title: string | null;
}

const NONE = ""; // 해제 값

export default function BotCosmeticEditor({
  userId,
  nickname,
  avatarUrl,
  nameColor,
  avatarFrame,
  title,
}: Props) {
  // 업로드 사진(data URL)은 프리셋이 아니라 그리드에서 고를 수 없다 — 초기값을 비워 둔다.
  const initialAvatar = avatarUrl && AVATARS.some((a) => a.id === avatarUrl) ? avatarUrl : NONE;
  const [avatar, setAvatar] = useState(initialAvatar);
  const [color, setColor] = useState(nameColor ?? NONE);
  const [frame, setFrame] = useState(avatarFrame ?? NONE);
  const [ttl, setTtl] = useState(title ?? NONE);
  const [saving, setSaving] = useState(false);

  const colorItem = shopItemById(color);
  const frameItem = shopItemById(frame);
  const titleItem = shopItemById(ttl);
  const preset = avatar ? avatarById(avatar) : null;

  const hadUpload = !!avatarUrl && !AVATARS.some((a) => a.id === avatarUrl);

  return (
    <form
      action={async (fd) => {
        setSaving(true);
        try {
          await saveBotCosmetics(fd);
        } finally {
          setSaving(false);
        }
      }}
      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-5"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="avatarUrl" value={avatar} />
      <input type="hidden" name="nameColor" value={color} />
      <input type="hidden" name="avatarFrame" value={frame} />
      <input type="hidden" name="title" value={ttl} />

      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold">봇 프로필 꾸미기</h2>
        <span className="text-[11px] text-neutral-400">상점 아이템 · 포인트 차감 없음</span>
      </div>

      {/* 미리보기 — 실제 게시판에서 보이는 모습 */}
      <div className="mb-5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-4 py-3.5">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">미리보기</div>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
              preset ? preset.bg : "bg-neutral-200 dark:bg-neutral-700"
            } ${frameItem?.ring ?? ""}`}
          >
            {preset?.emoji ?? ""}
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            {colorItem?.gradient ? (
              <span className={`font-bold ${RAINBOW_NAME_CLASS}`}>{nickname}</span>
            ) : (
              <span className="font-bold" style={colorItem?.color ? { color: colorItem.color } : undefined}>
                {nickname}
              </span>
            )}
            {titleItem && <span className={TITLE_BADGE_CLASS}>{titleItem.name}</span>}
          </span>
        </div>
        {hadUpload && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            이 봇은 업로드된 사진을 쓰고 있습니다. 아래에서 아바타를 고르면 사진이 교체되고,
            아무것도 고르지 않고 저장하면 사진이 지워집니다.
          </p>
        )}
      </div>

      <Section label="아바타">
        <Chip active={avatar === NONE} onClick={() => setAvatar(NONE)}>
          없음
        </Chip>
        {AVATARS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAvatar(a.id)}
            aria-pressed={avatar === a.id}
            title={a.id}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-transform ${a.bg} ${
              avatar === a.id
                ? "ring-2 ring-offset-2 ring-neutral-900 dark:ring-white dark:ring-offset-neutral-900 scale-105"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {a.emoji}
          </button>
        ))}
      </Section>

      <Section label="닉네임 색상">
        <Chip active={color === NONE} onClick={() => setColor(NONE)}>
          없음
        </Chip>
        {shopItemsByType("nameColor").map((it) => (
          <Chip key={it.id} active={color === it.id} onClick={() => setColor(it.id)}>
            <span
              className={it.gradient ? RAINBOW_NAME_CLASS : undefined}
              style={it.color ? { color: it.color } : undefined}
            >
              {it.name}
            </span>
          </Chip>
        ))}
      </Section>

      <Section label="아바타 프레임">
        <Chip active={frame === NONE} onClick={() => setFrame(NONE)}>
          없음
        </Chip>
        {shopItemsByType("avatarFrame").map((it) => (
          <Chip key={it.id} active={frame === it.id} onClick={() => setFrame(it.id)}>
            {it.name}
          </Chip>
        ))}
      </Section>

      <Section label="칭호">
        <Chip active={ttl === NONE} onClick={() => setTtl(NONE)}>
          없음
        </Chip>
        {shopItemsByType("title").map((it) => (
          <Chip key={it.id} active={ttl === it.id} onClick={() => setTtl(it.id)}>
            {it.name}
          </Chip>
        ))}
      </Section>

      <button
        type="submit"
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
      >
        {saving ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
        active
          ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white"
          : "bg-white text-neutral-600 ring-neutral-200 hover:text-neutral-900 dark:bg-white/[0.04] dark:text-neutral-400 dark:ring-white/10 dark:hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
