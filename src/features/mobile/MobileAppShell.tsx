import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import MobileBottomBar from './MobileBottomBar';
import MobileContextTabs, { type MobileContextTab } from './MobileContextTabs';
import MobileTopBar from './MobileTopBar';
import type { SearchResult } from '../../components/SocialSearchHub';
import { isAppHelpEnabled, setAppHelpEnabled, shouldShowAppHelp } from '../../lib/appHelpPreferences';

export type MobileShellView = 'home' | 'room' | 'discover' | 'social' | 'notifications' | 'settings' | 'profile';
type MobileHelpAnchor = 'ptt' | 'voice-mode' | 'ptt-size';
type MobileHelpCoachmark = {
  id: string;
  message: string;
  anchor: MobileHelpAnchor;
};
type FloatingPttRect = {
  x: number;
  y: number;
  size: number;
};

interface MobileAppShellProps {
  phoneLayout?: boolean;
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeServerMotto?: string;
  activeChannelName?: string;
  hasActiveChannel?: boolean;
  activeChannelMode?: string;
  activeChannelIconName?: string;
  activeChannelIconColor?: string;
  cardStyle?: string;
  forceShowHomeButton?: boolean;
  userAvatarUrl?: string;
  userLabel?: string;
  userStatusText?: string;
  currentView?: MobileShellView;
  tabs?: MobileContextTab[];
  activeTabKey?: string;
  onOpenChannels?: () => void;
  onOpenRoom?: () => void;
  onOpenDiscover?: () => void;
  onOpenSocial?: () => void;
  onOpenNotifications?: () => void;
  onOpenFriends?: () => void;
  onOpenSettings?: () => void;
  onOpenServerSettings?: () => void;
  onOpenProfile?: () => void;
  onOpenAccountSettings?: () => void;
  currentUserId?: string;
  onSearchUserClick?: (user: SearchResult, position: { x: number; y: number }) => void;
  onChangeStatus?: (status: string) => void;
  onOpenQuickActions?: () => void;
  onGoHome?: () => void;
  onReturnToRoom?: () => void;
  onLeaveRoom?: () => void;
  onTabChange?: (key: string) => void;
  onLogout?: () => void;
  disableContentSwipe?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  isPttPressed?: boolean;
  isNoiseSuppressionEnabled?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onPttChange?: (pressed: boolean) => void;
  onToggleNoiseSuppression?: () => void;
  onCycleCardStyle?: () => void;
  children?: React.ReactNode;
}

export default function MobileAppShell({
  phoneLayout = false,
  activeServerName,
  activeServerAvatarUrl,
  activeServerShortName,
  activeServerMotto,
  activeChannelName,
  hasActiveChannel,
  activeChannelMode,
  activeChannelIconName,
  activeChannelIconColor,
  cardStyle,
  forceShowHomeButton,
  userAvatarUrl,
  userLabel,
  userStatusText,
  currentView = 'home',
  tabs,
  activeTabKey,
  onOpenChannels,
  onOpenRoom,
  onOpenDiscover,
  onOpenSocial,
  onOpenNotifications,
  onOpenFriends,
  onOpenSettings,
  onOpenServerSettings,
  onOpenProfile,
  onOpenAccountSettings,
  currentUserId,
  onSearchUserClick,
  onChangeStatus,
  onOpenQuickActions,
  onGoHome,
  onReturnToRoom,
  onLeaveRoom,
  onTabChange,
  onLogout,
  disableContentSwipe = false,
  isMuted,
  isDeafened,
  isPttPressed,
  isNoiseSuppressionEnabled,
  onToggleMute,
  onToggleDeafen,
  onPttChange,
  onToggleNoiseSuppression,
  onCycleCardStyle,
  children,
}: MobileAppShellProps) {
  const shellTabs = useMemo(() => {
    if (tabs && tabs.length > 0) return tabs;
    return undefined;
  }, [tabs]);
  const [localActiveTabKey, setLocalActiveTabKey] = useState(shellTabs?.[0]?.key ?? '');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [floatingPttEnabled, setFloatingPttEnabled] = useState(false);
  const [coachmark, setCoachmark] = useState<MobileHelpCoachmark | null>(null);
  const [coachmarkQueue, setCoachmarkQueue] = useState<MobileHelpCoachmark[]>([]);
  const [floatingPttRect, setFloatingPttRect] = useState<FloatingPttRect | null>(null);
  const [floatingPttSizeStep, setFloatingPttSizeStep] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const saved = Number(localStorage.getItem('mobileFloatingPttSizeStep'));
    return Number.isInteger(saved) && saved >= 0 && saved <= 9 ? saved : 0;
  });
  const selectedTabKey = activeTabKey ?? localActiveTabKey;
  const canShowRoomHelp = currentView === 'room' && !!hasActiveChannel;

  const showMobileHelp = (next: MobileHelpCoachmark) => {
    if (!canShowRoomHelp) return;
    setCoachmark(current => {
      if (current) {
        setCoachmarkQueue(queue => [...queue.filter(item => item.id !== next.id), next]);
        return current;
      }
      return next;
    });
  };

  const closeCoachmark = () => {
    setCoachmarkQueue(queue => {
      const [next, ...rest] = queue;
      setCoachmark(next ?? null);
      return rest;
    });
  };

  useEffect(() => {
    setLocalActiveTabKey(shellTabs?.[0]?.key ?? '');
  }, [currentView, shellTabs]);

  useEffect(() => {
    if (!canShowRoomHelp) {
      setCoachmark(null);
      setCoachmarkQueue([]);
      return;
    }
    if (!floatingPttEnabled || typeof window === 'undefined') return;
    if (shouldShowAppHelp('mobile-ptt-move')) {
      showMobileHelp({
        id: 'mobile-ptt-move',
        anchor: 'ptt',
        message: 'Taşımak için çift dokun, sonra sürükle.',
      });
    }
    if (shouldShowAppHelp('mobile-ptt-pinch-size')) {
      showMobileHelp({
        id: 'mobile-ptt-pinch-size',
        anchor: 'ptt',
        message: 'Boyut için çift dokun, sonra iki parmakla ayarla.',
      });
    }
  }, [canShowRoomHelp, floatingPttEnabled]);

  useEffect(() => {
    const showCoachmark = (event: Event) => {
      const detail = (event as CustomEvent<MobileHelpCoachmark>).detail;
      if (!detail || !isAppHelpEnabled() || !canShowRoomHelp) return;
      showMobileHelp(detail);
    };
    window.addEventListener('mayvox:mobile-help', showCoachmark);
    return () => window.removeEventListener('mayvox:mobile-help', showCoachmark);
  }, [canShowRoomHelp]);

  useEffect(() => {
    const onHelpChanged = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled: boolean }>).detail?.enabled;
      if (!enabled || !floatingPttEnabled || !canShowRoomHelp) return;
      if (shouldShowAppHelp('mobile-ptt-move')) {
        showMobileHelp({
          id: 'mobile-ptt-move',
          anchor: 'ptt',
          message: 'Taşımak için çift dokun, sonra sürükle.',
        });
      }
      if (shouldShowAppHelp('mobile-ptt-pinch-size')) {
        showMobileHelp({
          id: 'mobile-ptt-pinch-size',
          anchor: 'ptt',
          message: 'Boyut için çift dokun, sonra iki parmakla ayarla.',
        });
      }
    };
    window.addEventListener('mayvox:app-help-changed', onHelpChanged);
    return () => window.removeEventListener('mayvox:app-help-changed', onHelpChanged);
  }, [canShowRoomHelp, floatingPttEnabled]);

  const showTabs = !!shellTabs?.length;
  const handleTabChange = (key: string) => {
    setLocalActiveTabKey(key);
    onTabChange?.(key);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disableContentSwipe || currentView !== 'home' || !showTabs || touchStartX === null) {
      setTouchStartX(null);
      return;
    }
    const deltaX = event.changedTouches[0]?.clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 56) return;

    const currentIndex = shellTabs.findIndex(tab => tab.key === selectedTabKey);
    if (currentIndex < 0) return;
    const nextIndex = deltaX < 0
      ? Math.min(shellTabs.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    if (nextIndex !== currentIndex) handleTabChange(shellTabs[nextIndex].key);
  };

  return (
    <div
      className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none bg-[var(--theme-bg)] text-[var(--theme-text)] ${phoneLayout ? 'mobile-phone-shell' : ''}`}
      style={{ borderRadius: 0, margin: 0, boxShadow: 'none' }}
    >
      <MobileTopBar
        activeServerName={activeServerName}
        activeServerAvatarUrl={activeServerAvatarUrl}
        activeServerShortName={activeServerShortName}
        activeServerMotto={activeServerMotto}
        activeChannelName={activeChannelName}
        currentView={currentView}
        onOpenChannels={onOpenChannels}
        onOpenSettings={onOpenServerSettings ?? onOpenSettings}
        currentUserId={currentUserId}
        onSearchUserClick={onSearchUserClick}
        phoneLayout={phoneLayout}
      />

      {showTabs && <MobileContextTabs tabs={shellTabs} activeKey={selectedTabKey} onChange={handleTabChange} />}

      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          className={`relative mx-auto h-full min-h-0 w-full max-w-[1180px] overflow-hidden ${phoneLayout ? 'px-2' : 'px-3 sm:px-5'}`}
          onTouchStart={event => setTouchStartX(disableContentSwipe ? null : (event.touches[0]?.clientX ?? null))}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => setTouchStartX(null)}
        >
          {children}
        </div>
      </main>

      {floatingPttEnabled && onPttChange && (
        <FloatingPttButton
          active={!!isPttPressed}
          sizeStep={floatingPttSizeStep}
          onSizeStepChange={(next) => {
            setFloatingPttSizeStep(next);
            if (typeof window !== 'undefined') localStorage.setItem('mobileFloatingPttSizeStep', String(next));
          }}
          onPttChange={onPttChange}
          onRectChange={setFloatingPttRect}
        />
      )}

      {coachmark && (
        <MobileHelpCoachmarkView
          coachmark={coachmark}
          floatingPttRect={floatingPttRect}
          onClose={closeCoachmark}
          onDisable={() => {
            setAppHelpEnabled(false);
            setCoachmarkQueue([]);
            setCoachmark(null);
          }}
        />
      )}

      <MobileBottomBar
        activeServerName={activeServerName}
        activeServerAvatarUrl={activeServerAvatarUrl}
        activeServerShortName={activeServerShortName}
        activeChannelName={activeChannelName}
        hasActiveChannel={hasActiveChannel}
        activeChannelMode={activeChannelMode}
        activeChannelIconName={activeChannelIconName}
        activeChannelIconColor={activeChannelIconColor}
        cardStyle={cardStyle}
        forceShowHomeButton={forceShowHomeButton}
        userAvatarUrl={userAvatarUrl}
        userLabel={userLabel}
        userStatusText={userStatusText}
        currentView={currentView}
        onGoHome={onGoHome}
        onReturnToRoom={onReturnToRoom}
        onOpenChannels={onOpenChannels}
        onOpenRoom={onOpenRoom}
        onOpenSocial={onOpenSocial}
        onOpenNotifications={onOpenNotifications}
        onOpenSettings={onOpenSettings}
        onOpenProfile={onOpenProfile}
        onOpenAccountSettings={onOpenAccountSettings}
        onChangeStatus={onChangeStatus}
        onLeaveRoom={onLeaveRoom}
        isMuted={isMuted}
        isDeafened={isDeafened}
        isPttPressed={isPttPressed}
        isNoiseSuppressionEnabled={isNoiseSuppressionEnabled}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        onPttChange={onPttChange}
        onToggleNoiseSuppression={onToggleNoiseSuppression}
        onCycleCardStyle={onCycleCardStyle}
        onPttFloatingEnabledChange={setFloatingPttEnabled}
        phoneLayout={phoneLayout}
      />
    </div>
  );
}

function MobileHelpCoachmarkView({
  coachmark,
  floatingPttRect,
  onClose,
  onDisable,
}: {
  coachmark: MobileHelpCoachmark;
  floatingPttRect: FloatingPttRect | null;
  onClose: () => void;
  onDisable: () => void;
}) {
  const getDockAnchorRect = (anchor: MobileHelpAnchor) => {
    if (typeof document === 'undefined' || anchor === 'ptt') return null;
    const element = document.querySelector<HTMLElement>(`[data-mobile-help-anchor="${anchor}"]`);
    return element?.getBoundingClientRect() ?? null;
  };
  const dockRect = getDockAnchorRect(coachmark.anchor);
  const pttCenterX = floatingPttRect ? floatingPttRect.x + floatingPttRect.size / 2 : window.innerWidth - 78;
  const pttTop = floatingPttRect ? floatingPttRect.y : window.innerHeight - 220;
  const panelWidth = Math.min(260, window.innerWidth - 32);
  const pttPanelLeft = Math.min(Math.max(pttCenterX - panelWidth / 2, 16), window.innerWidth - panelWidth - 16);
  const pttPanelTop = Math.max(72, pttTop - 112);
  const dockX = dockRect ? dockRect.left + dockRect.width / 2 : coachmark.anchor === 'ptt-size' ? window.innerWidth / 2 + 44 : window.innerWidth / 2;
  const dockY = dockRect ? dockRect.top + dockRect.height / 2 : window.innerHeight - 56;
  const dockPanelLeft = Math.min(Math.max(dockX - panelWidth / 2, 16), window.innerWidth - panelWidth - 16);
  const dockPanelTop = Math.max(72, dockY - 118);
  const isPtt = coachmark.anchor === 'ptt';
  const targetX = isPtt ? pttCenterX : dockX;
  const targetY = isPtt ? pttTop : dockY;
  const panelLeft = isPtt ? pttPanelLeft : dockPanelLeft;
  const panelTop = isPtt ? pttPanelTop : dockPanelTop;
  const lineTop = panelTop + 86;
  const lineHeight = Math.max(18, targetY - lineTop);

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="pointer-events-auto fixed rounded-[14px] border border-[rgba(var(--glass-tint),0.14)] bg-[rgba(var(--theme-bg-rgb),0.92)] px-3 py-2.5 text-[11.5px] font-semibold leading-4 text-[var(--theme-text)] shadow-[0_18px_46px_rgba(0,0,0,0.38)] backdrop-blur-[16px]"
        style={{ left: panelLeft, top: panelTop, width: panelWidth }}
      >
        <p>{coachmark.message}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" className="text-[10px] font-bold text-[var(--theme-secondary-text)]/72" onClick={onDisable}>
            İpuçlarını kapat
          </button>
          <button type="button" className="rounded-lg bg-[var(--theme-accent)]/14 px-2 py-1 text-[10px] font-black text-[var(--theme-accent)]" onClick={onClose}>
            Tamam
          </button>
        </div>
      </div>
      <span
        className="fixed w-px bg-[linear-gradient(to_bottom,rgba(var(--theme-accent-rgb),0.78),rgba(var(--theme-accent-rgb),0.06))]"
        style={{ left: targetX, top: lineTop, height: lineHeight }}
        aria-hidden="true"
      />
      <span
        className="fixed h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-accent)] shadow-[0_0_14px_rgba(var(--theme-accent-rgb),0.65)]"
        style={{ left: targetX, top: targetY }}
        aria-hidden="true"
      />
    </div>
  );
}

function FloatingPttButton({
  active,
  sizeStep,
  onSizeStepChange,
  onPttChange,
  onRectChange,
}: {
  active: boolean;
  sizeStep: number;
  onSizeStepChange: (next: number) => void;
  onPttChange: (pressed: boolean) => void;
  onRectChange: (rect: FloatingPttRect) => void;
}) {
  const buttonSize = 74 + sizeStep * 18;
  const [position, setPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: 28, y: 132 };
    const saved = localStorage.getItem('mobileFloatingPttPosition');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { x?: number; y?: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: Math.min(Math.max(parsed.x, 12), window.innerWidth - buttonSize - 12),
            y: Math.min(Math.max(parsed.y, 72), window.innerHeight - buttonSize - 76),
          };
        }
      } catch {
        // Ignore stale saved positions.
      }
    }
    return { x: window.innerWidth - buttonSize - 24, y: window.innerHeight - buttonSize - 96 };
  });
  const hasSavedPositionRef = useRef(typeof window !== 'undefined' && !!localStorage.getItem('mobileFloatingPttPosition'));
  const [dragState, setDragState] = useState<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const positionRef = useRef(position);
  const dragStateRef = useRef(dragState);
  const moveModeRef = useRef(moveMode);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef(0);
  const pttStartTimerRef = useRef<number | null>(null);
  const pointerMapRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; step: number } | null>(null);
  const sizeStepRef = useRef(sizeStep);
  const suppressNextTapRef = useRef(false);

  const visualScale = active ? 1.04 : moveMode ? 1.03 : 1;

  const applyButtonTransform = (next = positionRef.current, scale = visualScale) => {
    const element = buttonRef.current;
    if (!element) return;
    element.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${scale})`;
  };

  useEffect(() => {
    positionRef.current = position;
    onRectChange({ x: position.x, y: position.y, size: buttonSize });
    applyButtonTransform(position);
  }, [position, buttonSize]);

  useEffect(() => {
    sizeStepRef.current = sizeStep;
  }, [sizeStep]);

  useEffect(() => {
    applyButtonTransform(positionRef.current, visualScale);
  }, [active, moveMode]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (hasSavedPositionRef.current || typeof window === 'undefined') return;
    const id = window.requestAnimationFrame(() => {
      const homeButton = document.querySelector<HTMLElement>('[data-mobile-help-anchor="home"]');
      if (!homeButton) return;
      const rect = homeButton.getBoundingClientRect();
      const next = clampPosition(rect.right + 10, rect.top + rect.height / 2 - buttonSize / 2);
      positionRef.current = next;
      setPosition(next);
      applyButtonTransform(next);
      onRectChange({ x: next.x, y: next.y, size: buttonSize });
    });
    return () => window.cancelAnimationFrame(id);
  }, [buttonSize]);

  useEffect(() => {
    moveModeRef.current = moveMode;
  }, [moveMode]);

  useEffect(() => {
    const next = clampPosition(positionRef.current.x, positionRef.current.y);
    positionRef.current = next;
    setPosition(next);
    if (buttonRef.current) {
      applyButtonTransform(next);
    }
    onRectChange({ x: next.x, y: next.y, size: buttonSize });
  }, [buttonSize]);

  useEffect(() => {
    (window as typeof window & { __mayvoxFloatingPttOnly?: boolean }).__mayvoxFloatingPttOnly = true;
    return () => {
      (window as typeof window & { __mayvoxFloatingPttOnly?: boolean }).__mayvoxFloatingPttOnly = false;
      if (pttStartTimerRef.current != null) window.clearTimeout(pttStartTimerRef.current);
      onPttChange(false);
    };
  }, [onPttChange]);

  const clearPttStartTimer = () => {
    if (pttStartTimerRef.current == null || typeof window === 'undefined') return;
    window.clearTimeout(pttStartTimerRef.current);
    pttStartTimerRef.current = null;
  };

  const clampPosition = (x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y };
    return {
      x: Math.min(Math.max(x, 12), window.innerWidth - buttonSize - 12),
      y: Math.min(Math.max(y, 62), window.innerHeight - buttonSize - 76),
    };
  };

  const savePosition = (next: { x: number; y: number }) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('mobileFloatingPttPosition', JSON.stringify(next));
  };

  const applyPosition = (next: { x: number; y: number }) => {
    positionRef.current = next;
    applyButtonTransform(next);
  };

  const getPointerDistance = () => {
    const pointers: Array<{ x: number; y: number }> = Array.from(pointerMapRef.current.values());
    if (pointers.length < 2) return null;
    const a = pointers[0];
    const b = pointers[1];
    if (!a || !b) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const updateSizeFromDistance = (distance: number | null) => {
    if (distance == null) return false;
    if (!pinchStartRef.current) {
      pinchStartRef.current = { distance, step: sizeStepRef.current };
      return true;
    }
    const next = Math.min(9, Math.max(0, Math.round(pinchStartRef.current.step + (distance - pinchStartRef.current.distance) / 10)));
    if (next !== sizeStepRef.current) {
      sizeStepRef.current = next;
      onSizeStepChange(next);
    }
    return true;
  };

  const updatePinchSize = () => updateSizeFromDistance(getPointerDistance());

  const getTouchDistance = (touches: TouchList) => {
    if (touches.length < 2) return null;
    const a = touches.item(0);
    const b = touches.item(1);
    if (!a || !b) return null;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  useEffect(() => {
    if (!moveMode || typeof window === 'undefined') return;

    const handleTouch = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.touches.length >= 2) {
        suppressNextTapRef.current = true;
        clearPttStartTimer();
        setDragState(null);
        dragStateRef.current = null;
        updateSizeFromDistance(getTouchDistance(event.touches));
      }
    };
    const handleTouchEnd = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.touches.length < 2) pinchStartRef.current = null;
    };

    window.addEventListener('touchstart', handleTouch, { capture: true, passive: false });
    window.addEventListener('touchmove', handleTouch, { capture: true, passive: false });
    window.addEventListener('touchend', handleTouchEnd, { capture: true, passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { capture: true, passive: false });
    return () => {
      window.removeEventListener('touchstart', handleTouch, { capture: true });
      window.removeEventListener('touchmove', handleTouch, { capture: true });
      window.removeEventListener('touchend', handleTouchEnd, { capture: true });
      window.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
    };
  }, [moveMode]);

  return (
    <>
    {moveMode && (
      <div
        className="fixed inset-0 z-[44] touch-none select-none"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerMove={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchMove={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    )}
    <div
      ref={buttonRef}
      role="button"
      tabIndex={0}
      className="mobile-floating-ptt pointer-events-auto fixed left-0 top-0 z-[45] flex touch-none select-none items-center justify-center overflow-hidden rounded-full border text-white transition-[background,border-color,box-shadow] duration-150 will-change-transform"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${visualScale})`,
        width: buttonSize,
        height: buttonSize,
        borderRadius: 999,
        background: moveMode
          ? 'radial-gradient(circle at 50% 50%, rgba(250,204,21,0.62) 0%, rgba(250,204,21,0.34) 36%, rgba(250,204,21,0.12) 68%, rgba(250,204,21,0.035) 100%)'
          : active
          ? 'radial-gradient(circle at 50% 50%, rgba(var(--theme-accent-rgb),0.92) 0%, rgba(var(--theme-accent-rgb),0.56) 34%, rgba(var(--theme-accent-rgb),0.18) 66%, rgba(var(--theme-accent-rgb),0.045) 100%)'
          : 'radial-gradient(circle at 50% 50%, rgba(var(--theme-accent-rgb),0.48) 0%, rgba(var(--theme-accent-rgb),0.27) 36%, rgba(var(--theme-accent-rgb),0.10) 68%, rgba(var(--theme-accent-rgb),0.026) 100%)',
        borderColor: moveMode ? 'rgba(250,204,21,0.26)' : active ? 'rgba(var(--theme-accent-rgb),0.34)' : 'rgba(var(--glass-tint),0.11)',
        boxShadow: moveMode
          ? 'inset 0 10px 22px rgba(255,255,255,0.040), 0 0 0 7px rgba(250,204,21,0.08), 0 18px 36px rgba(0,0,0,0.30)'
          : active
          ? 'inset 0 12px 24px rgba(255,255,255,0.060), 0 0 0 8px rgba(var(--theme-accent-rgb),0.09), 0 0 34px rgba(var(--theme-accent-rgb),0.24), 0 18px 36px rgba(0,0,0,0.32)'
          : 'inset 0 12px 24px rgba(255,255,255,0.035), 0 18px 36px rgba(0,0,0,0.30)',
        backdropFilter: 'blur(14px) saturate(130%)',
        WebkitBackdropFilter: 'blur(14px) saturate(130%)',
      }}
      aria-label={moveMode ? 'Bas konuş butonunu taşı' : active ? 'Konuşuyorsun' : 'Bas konuş'}
      aria-pressed={active}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        clearPttStartTimer();

        if (moveModeRef.current && pointerMapRef.current.size >= 2) {
          suppressNextTapRef.current = true;
          pinchStartRef.current = null;
          setDragState(null);
          dragStateRef.current = null;
          updatePinchSize();
          onPttChange(false);
          return;
        }

        const now = Date.now();
        const isDoubleTap = now - lastTapRef.current < 320;
        lastTapRef.current = now;

        const nextDragState = {
          pointerId: event.pointerId,
          offsetX: event.clientX - position.x,
          offsetY: event.clientY - position.y,
        };
        setDragState(nextDragState);
        dragStateRef.current = nextDragState;

        if (isDoubleTap) {
          const nextMoveMode = !moveModeRef.current;
          moveModeRef.current = nextMoveMode;
          setMoveMode(nextMoveMode);
          if (!nextMoveMode) {
            setDragState(null);
            dragStateRef.current = null;
            pinchStartRef.current = null;
            savePosition(positionRef.current);
          }
          onPttChange(false);
          return;
        }

        if (!moveModeRef.current) {
          pttStartTimerRef.current = window.setTimeout(() => {
            pttStartTimerRef.current = null;
            onPttChange(true);
          }, 140);
        }
      }}
      onPointerMove={(event) => {
        if (pointerMapRef.current.has(event.pointerId)) {
          pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }
        if (moveModeRef.current && pointerMapRef.current.size >= 2) {
          event.preventDefault();
          event.stopPropagation();
          updatePinchSize();
          return;
        }
        const currentDrag = dragStateRef.current;
        if (!moveModeRef.current || !currentDrag || currentDrag.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const next = clampPosition(event.clientX - currentDrag.offsetX, event.clientY - currentDrag.offsetY);
        applyPosition(next);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        pointerMapRef.current.delete(event.pointerId);
        if (pointerMapRef.current.size < 2) pinchStartRef.current = null;
        clearPttStartTimer();
        setDragState(null);
        dragStateRef.current = null;
        setPosition(positionRef.current);
        if (moveModeRef.current) savePosition(positionRef.current);
        onPttChange(false);
        if (pointerMapRef.current.size === 0 && suppressNextTapRef.current) {
          window.setTimeout(() => { suppressNextTapRef.current = false; }, 80);
        }
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        pointerMapRef.current.delete(event.pointerId);
        if (pointerMapRef.current.size < 2) pinchStartRef.current = null;
        clearPttStartTimer();
        setDragState(null);
        dragStateRef.current = null;
        setPosition(positionRef.current);
        savePosition(positionRef.current);
        onPttChange(false);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (suppressNextTapRef.current) return;
      }}
      onContextMenu={event => event.preventDefault()}
    >
      <Mic size={Math.round(buttonSize * 0.32)} strokeWidth={2.35} className="relative z-[1] opacity-95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.26)]" />
    </div>
    </>
  );
}
