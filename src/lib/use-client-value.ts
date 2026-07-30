// 브라우저 전용 값(localStorage·document·hostname 등)을 하이드레이션 안전하게 읽는 훅.
//
// 왜 필요한가.
//   흔한 패턴은 useState(기본값) + useEffect(() => setState(브라우저값)) 인데,
//   이건 렌더 → effect → 재렌더로 한 프레임 깜빡이고 react-hooks/set-state-in-effect 에 걸린다.
//   useSyncExternalStore 는 서버/마운트 전엔 serverValue 를, 마운트 후엔 read() 를 주고
//   외부 변경(storage·custom event) 구독까지 한 곳에서 처리한다.
//
// 주의. read 는 값이 안 바뀌었으면 "같은 참조" 를 돌려줘야 한다.
//   문자열·불리언·숫자는 그냥 되지만 배열·Set 은 useCachedSnapshot 으로 캐시해서 넘길 것.
"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * @param read        브라우저에서 값을 읽는 함수 (마운트 후에만 호출된다)
 * @param serverValue SSR·하이드레이션 시점에 쓸 값
 * @param subscribe   값이 밖에서 바뀔 때 콜백을 부르는 구독자 (없으면 1회성)
 */
export function useClientValue<T>(
  read: () => T,
  serverValue: T,
  subscribe: (onChange: () => void) => () => void = noopSubscribe,
): T {
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

/**
 * 객체·배열을 돌려주는 read 를 useSyncExternalStore 에 안전하게 넘기기 위한 캐시 래퍼.
 * key 가 같으면 직전에 만든 값을 그대로 재사용해 참조 동일성을 지킨다.
 */
export function useCachedSnapshot<T>(read: () => T, key: (value: T) => string): () => T {
  const cache = useRef<{ key: string; value: T } | null>(null);
  return useCallback(() => {
    const next = read();
    const k = key(next);
    if (cache.current && cache.current.key === k) return cache.current.value;
    cache.current = { key: k, value: next };
    return next;
  }, [read, key]);
}

/** localStorage 값 변경 구독 — 같은 탭(custom event) + 다른 탭(storage event). */
export function subscribeToStorage(...eventNames: string[]) {
  return (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    for (const name of eventNames) window.addEventListener(name, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      for (const name of eventNames) window.removeEventListener(name, onChange);
    };
  };
}
