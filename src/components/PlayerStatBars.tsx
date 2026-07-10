import type { Player } from '@/types';

export interface PlayerDisplayStat {
  label: string;
  shortLabel: string;
  value: number;
}

export function getPlayerDisplayStats(player: Player): PlayerDisplayStat[] {
  const rating = player.overall_rating;
  const attributes = player.attributes;
  return [
    { label: 'Hız', shortLabel: 'HIZ', value: attributes?.pace ?? rating },
    { label: 'Şut', shortLabel: 'ŞUT', value: attributes?.shooting ?? rating },
    { label: 'Pas', shortLabel: 'PAS', value: attributes?.passing ?? rating },
    { label: 'Dribling', shortLabel: 'DRİ', value: attributes?.dribbling ?? rating },
    { label: 'Defans', shortLabel: 'DEF', value: attributes?.defense ?? rating },
    { label: 'Fizik', shortLabel: 'FİZ', value: attributes?.attack ?? rating },
  ];
}

export default function PlayerStatBars({ player }: { player: Player }) {
  return (
    <div className="space-y-2">
      {getPlayerDisplayStats(player).map((stat) => (
        <div key={stat.label} className="grid grid-cols-[4rem_2rem_minmax(0,1fr)] items-center gap-2 text-[10px] font-black uppercase">
          <span className="text-white/55">{stat.label}</span>
          <span className="text-right text-yellow-300 tabular-nums">{stat.value}</span>
          <span className="h-2 overflow-hidden border border-white/15 bg-white/10">
            <span className="block h-full bg-yellow-400" style={{ width: `${Math.max(0, Math.min(100, stat.value))}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function CompactPlayerStats({ player }: { player: Player }) {
  return (
    <div className="grid grid-cols-3 gap-1 text-center text-[8px] font-black uppercase">
      {getPlayerDisplayStats(player).map((stat) => (
        <span key={stat.label} className="border border-white/10 bg-black/35 px-1 py-1 text-white/75">
          <span className="mr-1 text-white/35">{stat.shortLabel}</span>{stat.value}
        </span>
      ))}
    </div>
  );
}
