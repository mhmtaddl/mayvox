import React from 'react';
import { isCapacitor } from './platform';

/**
 * Mobilde formlarda Enter tuşu ile bir sonraki input'a geçiş.
 * Desktop'ta eski davranış (Enter = submit) korunur.
 *
 * Kullanım:
 *   const handleNext = useEnterToNext([ref1, ref2, ref3], onSubmit);
 *   <input ref={ref1} onKeyDown={handleNext(0)} />
 *   <input ref={ref2} onKeyDown={handleNext(1)} />
 *   <input ref={ref3} onKeyDown={handleNext(2)} />  // son → submit
 */
export function makeEnterToNext(
  refs: Array<React.RefObject<HTMLInputElement | null>>,
  onSubmit: () => void,
) {
  return (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (!isCapacitor()) { onSubmit(); return; }
    const next = refs[idx + 1]?.current;
    if (next) {
      e.preventDefault();
      next.focus();
    } else {
      onSubmit();
    }
  };
}
