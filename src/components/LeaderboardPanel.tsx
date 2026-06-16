'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { readMostSelectedPlayers, readSavedRuns, STATS_UPDATED_EVENT, LeaderboardEntry } from '@/lib/localStats';

export default function LeaderboardPanel() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [runCount, setRunCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setEntries(readMostSelectedPlayers(5));
      setRunCount(readSavedRuns().length);
    };

    refresh();
    window.addEventListener(STATS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener(STATS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <div className="border-t-2 border-black bg-black/5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-yellow-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">Yerel Istatistik</p>
        </div>
        <span className="text-[10px] font-black uppercase opacity-40">{runCount} kayıt</span>
      </div>

      <div className="mt-4 space-y-2">
        {entries.length === 0 ? (
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-35 leading-relaxed">
            İlk 11 tamamlanınca en çok seçilen efsaneler burada görünür.
          </p>
        ) : (
          entries.map((entry, index) => (
            <div key={entry.player.id} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 text-xs">
              <span className="font-black text-yellow-500">#{index + 1}</span>
              <span className="min-w-0 truncate font-black">{entry.player.name}</span>
              <span className="font-black opacity-50">{entry.count}x</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
