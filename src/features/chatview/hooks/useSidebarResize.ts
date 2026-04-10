import React, { useState, useRef, useCallback } from 'react';

const LEFT_SIDEBAR_MIN = 220;
const LEFT_SIDEBAR_MAX = 320;

export function useSidebarResize() {
  const [leftSidebarW, setLeftSidebarW] = useState<number>(() => {
    const saved = localStorage.getItem('leftSidebarW');
    return saved ? Math.min(LEFT_SIDEBAR_MAX, Math.max(LEFT_SIDEBAR_MIN, parseInt(saved))) : 240;
  });
  const leftSidebarWRef = useRef(leftSidebarW);
  leftSidebarWRef.current = leftSidebarW;
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleSidebarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarDragRef.current = { startX: e.clientX, startW: leftSidebarWRef.current };
    const onMove = (ev: MouseEvent) => {
      if (!sidebarDragRef.current) return;
      const delta = ev.clientX - sidebarDragRef.current.startX;
      const next = Math.min(LEFT_SIDEBAR_MAX, Math.max(LEFT_SIDEBAR_MIN, sidebarDragRef.current.startW + delta));
      setLeftSidebarW(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem('leftSidebarW', String(leftSidebarWRef.current));
      sidebarDragRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return { leftSidebarW, handleSidebarDragStart };
}
