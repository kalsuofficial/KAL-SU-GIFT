import React from 'react';

interface BrandLogoProps {
  showSlogan?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ showSlogan = false, size = 'md' }) => {
  const iconDim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';
  const titleSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDim} shrink-0 drop-shadow-[0_0_12px_rgba(0,102,255,0.45)]`}
        aria-hidden="true"
      >
        <rect x="2" y="2" width="60" height="60" rx="14" fill="#000000" stroke="#0066FF" strokeWidth="2.5" />
        {/* Digital Gift Box in Solid Gold */}
        <rect x="13" y="21" width="38" height="30" rx="5" fill="#060912" stroke="#D4AF37" strokeWidth="2.2" />
        <rect x="10" y="16" width="44" height="7" rx="2.5" fill="#0A1224" stroke="#0066FF" strokeWidth="1.8" />
        {/* Solid Gold Gift Bow */}
        <path d="M32 16 C27 10 21 10 22.5 15.5 Z" fill="#D4AF37" />
        <path d="M32 16 C37 10 43 10 41.5 15.5 Z" fill="#D4AF37" />
        {/* K Monogram */}
        <path d="M18 28 V44 M18 36 L25 28 M21.5 33 L25.5 44" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* Central Solid Gold Lightning */}
        <path d="M33.5 24.5 L28.5 35.5 H32.5 L30 46.5 L36.8 34 H32.5 L33.5 24.5 Z" fill="#D4AF37" stroke="#3B9EFF" strokeWidth="0.7" strokeLinejoin="round" />
        {/* S Monogram in Electric Blue */}
        <path d="M45 29.5 C44 27.8 40.5 27.5 39 29.2 C37.5 30.8 38.5 33.2 41.5 34.5 C44.5 35.8 45.8 38 44.2 40.8 C42.8 43 39 43 37.8 41" stroke="#0066FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="flex flex-col leading-none">
        <span className={`font-display font-bold tracking-tight whitespace-nowrap text-white ${titleSize}`}>
          KAL-SU <span className="text-[#D4AF37]">GIFT</span>
        </span>
        {showSlogan && (
          <span className="mt-1 text-[11px] font-medium tracking-[0.14em] text-slate-400">
            YOUR DIGITAL WORLD, ONE PLACE.
          </span>
        )}
      </div>
    </div>
  );
};
