import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useEscapeKey } from '../hooks/useEscapeKey';

/**
 * Global modal primitive — tüm modal/dialog/popup pencereleri için tek stil kaynağı.
 *
 * Davranış:
 *   - `createPortal` → document.body (parent'ın transform/backdrop-filter'ları etkilemez)
 *   - `fixed inset-0` + merkez hizalama (flex)
 *   - ESC → onClose (opsiyonel `closeOnEscape=false` ile kapatılabilir)
 *   - Backdrop click → onClose (opsiyonel `closeOnBackdrop=false` ile kapatılabilir)
 *   - Surface: solid koyu arka plan, ince kenar, hafif shadow — GLOW YOK, spotlight YOK
 *   - framer-motion fade + hafif scale entrance (140ms)
 *
 * Kural: Uygulamadaki yeni tüm modallar bunu kullanır; var olan özel-stil modallar
 * zamanla buna taşınır. Bu component accent-tinted glow, radial-gradient spotlight,
 * blur-3xl outer halo gibi efektleri YASAKLAR — bunlar CSS'inde yer almaz.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Varsayılan 'sm' = 340px. Gerekiyorsa 'md'/'lg'/'xl' ya da sayı piksel. */
  width?: 'sm' | 'md' | 'lg' | 'xl' | number;
  /** Danger ton → kenar hafif kırmızı; aksi halde nötr */
  danger?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /** İçerik için padding uygula (varsayılan true). İç özel layout için false. */
  padded?: boolean;
  children: React.ReactNode;
  /** Dış kapsayıcı className (nadiren — surface değil yalnızca layout override). */
  className?: string;
}

const WIDTH_PX: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 340,
  md: 460,
  lg: 620,
  xl: 800,
};

export default function Modal({
  open,
  onClose,
  width = 'sm',
  danger = false,
  closeOnEscape = true,
  closeOnBackdrop = true,
  padded = true,
  children,
  className,
}: ModalProps) {
  useEscapeKey(onClose, open && closeOnEscape);

  if (typeof document === 'undefined') return null;

  const widthPx = typeof width === 'number' ? width : WIDTH_PX[width];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          // Tek katman solid dim. NO backdrop-blur, NO radial spotlight.
          style={{ background: 'rgba(0, 0, 0, 0.72)' }}
          onClick={closeOnBackdrop ? onClose : undefined}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className={`relative rounded-2xl overflow-hidden ${danger ? '' : 'surface-floating'} ${className ?? ''}`}
            style={{
              width: 'min(92vw, ' + widthPx + 'px)',
              maxHeight: '90vh',
              // danger case'de özel kırmızı border; aksi halde surface-floating class'ı
              // (bg + border + shadow) otomatik uygulanır
              ...(danger ? {
                background: 'var(--surface-floating-bg)',
                border: '1px solid rgba(239, 68, 68, 0.14)',
                boxShadow: 'var(--surface-floating-shadow)',
              } : {}),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {padded ? <div className="p-5">{children}</div> : children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
