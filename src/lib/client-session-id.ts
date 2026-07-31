"use client";

const SESSION_KEY = "scorebase-sid";
const TAB_KEY = "scorebase-tab-id";

function randomId(): string {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let value = localStorage.getItem(SESSION_KEY);
    if (!value) {
      value = randomId();
      localStorage.setItem(SESSION_KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}

export function getOrCreateTabId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let value = sessionStorage.getItem(TAB_KEY);
    if (!value) {
      value = randomId();
      sessionStorage.setItem(TAB_KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}
