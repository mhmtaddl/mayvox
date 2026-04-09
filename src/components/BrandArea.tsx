import React from 'react';
import appLogo from '../assets/app-logo.png';

export default function BrandArea() {
  return (
    <div className="flex items-center justify-center gap-2.5 select-none py-1 w-full group/brand cursor-default">
      {/* Logo — shimmer only */}
      <div className="relative w-[44px] h-[44px] shrink-0">
        <img
          src={appLogo}
          alt="PigeVox"
          className="relative w-full h-full object-contain group-hover/brand:scale-105 transition-transform duration-300"
        />
        {/* Shimmer sweep */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full overflow-hidden"
          style={{ mask: 'radial-gradient(circle, white 40%, transparent 70%)', WebkitMask: 'radial-gradient(circle, white 40%, transparent 70%)' }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)',
              animation: 'brand-shimmer 4s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col leading-none min-w-0">
        <h1 className="text-[20px] tracking-[-0.01em]">
          <span className="font-extrabold text-[var(--theme-text)] group-hover/brand:text-[var(--theme-accent)] transition-colors duration-300">Pige</span>
          <span className="font-semibold text-[var(--theme-accent)]">Vox</span>
        </h1>
        <span className="text-[7.5px] font-medium tracking-[0.18em] uppercase text-[var(--theme-secondary-text)]/30 mt-0.5 group-hover/brand:text-[var(--theme-secondary-text)]/50 transition-colors duration-300">
          sesini duyur
        </span>
      </div>

      <style>{`
        @keyframes brand-shimmer {
          0%, 100% { transform: translateX(-120%); }
          50% { transform: translateX(120%); }
        }
      `}</style>
    </div>
  );
}
