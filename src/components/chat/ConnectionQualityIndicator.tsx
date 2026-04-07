import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';

interface ConnectionQualityIndicatorProps {
  connectionLevel: number;
  isConnecting: boolean;
  isActive: boolean;
}

function getBarColor(level: number) {
  if (level >= 4) return 'bg-emerald-500';
  if (level === 3) return 'bg-yellow-500';
  if (level === 2) return 'bg-orange-500';
  if (level === 1) return 'bg-red-500';
  return 'text-red-500';
}

function getStatusLabel(isActive: boolean, isConnecting: boolean, connectionLevel: number) {
  if (!isActive) return null;
  if (isConnecting) return null;
  if (connectionLevel === 0) return { text: 'Bağlantı Yok', color: 'text-red-400' };
  if (connectionLevel === 1) return { text: 'Zayıf', color: 'text-red-400' };
  return null;
}

function ConnectionQualityIndicatorInner({ connectionLevel, isConnecting, isActive }: ConnectionQualityIndicatorProps) {
  const statusLabel = getStatusLabel(isActive, isConnecting, connectionLevel);

  if (connectionLevel === 0 && !isConnecting) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <X size={14} className="text-red-500" />
        {statusLabel && (
          <span className={`text-[8px] font-bold animate-pulse ${statusLabel.color}`}>{statusLabel.text}</span>
        )}
      </div>
    );
  }

  return (
    <motion.div
      animate={connectionLevel <= 2 ? { opacity: [1, 0.5, 1] } : {}}
      transition={{ duration: 1, repeat: Infinity }}
      className="flex flex-col items-center gap-0.5"
    >
      <div className="flex items-end gap-0.5 h-3">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            animate={connectionLevel <= 1 ? { height: [`${i * 25}%`, `${i * 15}%`, `${i * 25}%`] } : {}}
            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
            className={`w-1 rounded-full transition-all ${i <= connectionLevel ? getBarColor(connectionLevel) : 'bg-[var(--theme-border)]'}`}
            style={{ height: `${i * 25}%` }}
          />
        ))}
      </div>
      {statusLabel && (
        <span className={`text-[8px] font-bold animate-pulse leading-none ${statusLabel.color}`}>{statusLabel.text}</span>
      )}
    </motion.div>
  );
}

const ConnectionQualityIndicator = React.memo(ConnectionQualityIndicatorInner);
export default ConnectionQualityIndicator;
