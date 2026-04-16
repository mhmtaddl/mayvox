import React, { useEffect, useReducer } from 'react';
import { useAppState } from '../../../contexts/AppStateContext';

// Banner açık/kapalı state'i LOCAL useState'te TUTULMAZ — countdownRef.current.active
// değerinden derive edilir. Burada sadece 250ms'de bir force-rerender tick'i var;
// bu sayede kalan saniye UI'de akıcı güncellenir.

const TICK_MS = 250;

interface Props {
  /** Dock içinde render edildiğinde true — kompakt stil. */
  compact?: boolean;
}

export default function InactivityCountdownBanner({ compact = false }: Props) {
  const { countdownRef, dismissIdleCountdown } = useAppState();
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const id = setInterval(forceRender, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const s = countdownRef.current;
  if (!s.active) return null;
  const remaining = Math.max(0, Math.ceil((s.disconnectAt - Date.now()) / 1000));

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-2 h-10 whitespace-nowrap">
        <span className="text-[11px] font-semibold text-yellow-300">
          Odadan ayrılmanıza {remaining}s
        </span>
        <button
          type="button"
          onClick={dismissIdleCountdown}
          className="px-2.5 py-1 rounded-md bg-yellow-500/30 hover:bg-yellow-500/50 text-yellow-50 text-[11px] font-semibold transition-colors"
        >
          Buradayım
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-100 text-sm"
    >
      <span className="flex-1 min-w-0 truncate">
        Pasifsin — {remaining} saniye sonra kanaldan ayrılacaksın.
      </span>
      <button
        type="button"
        onClick={dismissIdleCountdown}
        className="flex-shrink-0 px-3 py-1 rounded-md bg-yellow-500/30 hover:bg-yellow-500/50 text-yellow-50 font-medium transition-colors"
      >
        Buradayım
      </button>
    </div>
  );
}
