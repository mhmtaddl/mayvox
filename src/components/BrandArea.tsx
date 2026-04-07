import React from 'react';
import appLogo from '../assets/app-logo.png';

export default function BrandArea() {
  return (
    <div className="flex items-center gap-2.5 select-none rounded-lg px-1.5 py-1 -ml-1.5">
      <div className="w-[52px] h-[52px] rounded-[20%] overflow-hidden ring-1 ring-[var(--theme-border)]/30 shrink-0">
        <img src={appLogo} alt="PigeVox" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col leading-none min-w-0">
        <h1 className="text-[15px] tracking-[-0.01em]">
          <span className="font-extrabold text-[var(--theme-text)]">Pige</span>
          <span className="font-semibold text-[var(--theme-accent)]">Vox</span>
        </h1>
        <span className="text-[8px] font-medium tracking-[0.2em] uppercase text-[var(--theme-secondary-text)]/40 mt-0.5">
          sesini duyur
        </span>
      </div>
    </div>
  );
}
