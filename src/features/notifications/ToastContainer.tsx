import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { useNotifications } from './useNotifications';
import ToastItemView from './ToastItem';

/** Portal-mounted top-right stack. En fazla 3 toast (service seviyesinde cap). */
export default function ToastContainer() {
  const toasts = useNotifications();
  if (typeof document === 'undefined') return null;

  const node = (
    <div
      className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1000] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 pointer-events-none sm:right-4 sm:top-4"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence mode="sync">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItemView toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );

  return createPortal(node, document.body);
}
