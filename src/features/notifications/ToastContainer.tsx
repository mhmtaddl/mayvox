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
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
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
