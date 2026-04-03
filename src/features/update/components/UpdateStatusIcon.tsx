import React from 'react';
import { Download, RefreshCw, AlertCircle, Check, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { UpdatePhase } from '../types';

interface Props {
  phase: UpdatePhase;
  color?: string;
  size?: number;
}

export default function UpdateStatusIcon({ phase, color = 'var(--theme-accent)', size = 12 }: Props) {
  switch (phase) {
    case 'checking':
      return (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
          <Loader2 size={size} style={{ color }} />
        </motion.div>
      );
    case 'available':
      return <Download size={size} style={{ color }} />;
    case 'downloading':
      return (
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
          <Download size={size} style={{ color }} />
        </motion.div>
      );
    case 'downloaded':
      return <RefreshCw size={size} style={{ color: '#22c55e' }} />;
    case 'installing':
      return (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Loader2 size={size} style={{ color: '#22c55e' }} />
        </motion.div>
      );
    case 'error':
      return <AlertCircle size={size} style={{ color: '#ef4444' }} />;
    case 'up-to-date':
      return <Check size={size} style={{ color: '#22c55e' }} />;
    default:
      return null;
  }
}
