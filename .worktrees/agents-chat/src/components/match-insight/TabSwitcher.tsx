"use client";

import { useState } from "react";

interface Props {
  tabs: string[];
  defaultIndex?: number;
  onChange?: (idx: number) => void;
}

export default function TabSwitcher({ tabs, defaultIndex = 0, onChange }: Props) {
  const [active, setActive] = useState(defaultIndex);
  return (
    <div
      className="flex gap-2 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden relative z-10"
      role="tablist"
    >
      {tabs.map((t, i) => (
        <button
          key={t}
          role="tab"
          aria-selected={i === active}
          onClick={() => {
            setActive(i);
            onChange?.(i);
          }}
          className={`insight-tab ${i === active ? "active" : ""}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
