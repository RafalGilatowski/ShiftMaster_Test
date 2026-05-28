import { Layers } from 'lucide-react';

interface ShiftMasterLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function ShiftMasterLogo({ size = 'md' }: ShiftMasterLogoProps) {
  const config = {
    sm: { icon: 'w-4 h-4', text: 'text-base', gap: 'gap-1.5' },
    md: { icon: 'w-5 h-5', text: 'text-xl',   gap: 'gap-2'   },
    lg: { icon: 'w-8 h-8', text: 'text-4xl',  gap: 'gap-3'   },
  }[size];

  return (
    <div className={`inline-flex items-center ${config.gap}`}>
      <Layers className={`${config.icon} text-sokolow-600 flex-shrink-0`} />
      <span className={`${config.text} font-bold leading-none tracking-tight`}>
        <span className="text-slate-800">Shift</span>
        <span className="text-sokolow-600">Master</span>
      </span>
    </div>
  );
}
