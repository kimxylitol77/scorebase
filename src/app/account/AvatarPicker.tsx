"use client";

import { AVATARS } from "@/lib/avatars";
import { setAvatarAction } from "./actions";

export default function AvatarPicker({ current }: { current: string }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {AVATARS.map((a) => (
        <form key={a.id} action={setAvatarAction}>
          <input type="hidden" name="avatarId" value={a.id} />
          <button
            type="submit"
            title={a.id}
            aria-label={`아바타 ${a.id}`}
            className={`w-full aspect-square rounded-full ${a.bg} flex items-center justify-center text-xl transition hover:scale-105 ${
              current === a.id
                ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {a.emoji}
          </button>
        </form>
      ))}
    </div>
  );
}
