import React, { useState, useRef, useCallback, useEffect } from 'react';

const LEFT_SIDEBAR_MIN = 228;
const LEFT_SIDEBAR_MAX = 320;
const LEFT_SIDEBAR_DEFAULT = LEFT_SIDEBAR_MIN;
const LEFT_SIDEBAR_WIDTH_VERSION = 'leftSidebarW:v2:narrow-default';

export function useSidebarResize() {
  const [leftSidebarW, setLeftSidebarW] = useState<number>(() => {
    if (localStorage.getItem(LEFT_SIDEBAR_WIDTH_VERSION) !== 'true') {
      localStorage.setItem(LEFT_SIDEBAR_WIDTH_VERSION, 'true');
      localStorage.setItem('leftSidebarW', String(LEFT_SIDEBAR_DEFAULT));
      return LEFT_SIDEBAR_DEFAULT;
    }
    const saved = localStorage.getItem('leftSidebarW');
    return saved ? Math.min(LEFT_SIDEBAR_MAX, Math.max(LEFT_SIDEBAR_MIN, parseInt(saved))) : LEFT_SIDEBAR_DEFAULT;
  });
  const leftSidebarWRef = useRef(leftSidebarW);
  leftSidebarWRef.current = leftSidebarW;
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--left-sidebar-width', `${leftSidebarW}px`);
  }, [leftSidebarW]);

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
