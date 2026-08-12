"use client";

// 카드형 매치(야구·농구·하키·배구·e스포츠·축구 컴팩트)의 팀 블록 래퍼.
//
// 이 카드들은 축구 행과 달리 카드 전체가 <Link> 라서, 팀명 옆 빈 공간을 눌러도 매치
// 페이지로 튕겨 팀명을 복사·검색할 수 없었다 (7m 사용 습관, 2026-08-12 요청).
// 카드는 클릭 면적이 넓은 게 정상이라 링크를 통째로 걷어내지 않고, 팀 블록의 빈
// 여백에서만 이동을 막고 더블클릭 시 팀명 전체를 선택한다. 팀명 글자·로고·순위 배지를
// 누르면 종전대로 매치 페이지로 이동한다.
//
// 여백은 팀명과 별개 텍스트 노드라 브라우저 기본 단어 선택이 개행만 잡는다 —
// 그래서 선택 범위를 직접 지정한다 (축구 행 SoccerLiveRow 와 같은 처리).
// 팀명 요소는 이 블록 안에서 <span data-teamname> 로 표시해 둘 것.

import type { ReactNode } from "react";

export default function TeamNameCell({
  className = "",
  children,
}: {
  /** 기존 팀 블록 div 의 클래스 그대로 */
  className?: string;
  children: ReactNode;
}) {
  const onBlankClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // 이름·로고·배지 클릭은 기존 동작 유지
    e.preventDefault();
    e.stopPropagation();
  };

  const onBlankDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const el = (e.currentTarget as HTMLElement).querySelector("[data-teamname]");
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  return (
    <div className={className} onClick={onBlankClick} onDoubleClick={onBlankDoubleClick}>
      {children}
    </div>
  );
}
