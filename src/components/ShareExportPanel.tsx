'use client';

import { useRef, useState } from 'react';
import { Copy, Crown, Download, Image as ImageIcon, Link as LinkIcon, Share2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import Pitch from './Pitch';
import { useTeamStore } from '@/store/useTeamStore';
import { getCaptainRole } from '@/lib/captain';
import { encodeShareCode, type SharedTeamSnapshot } from '@/lib/shareCode';
import { saveTeamSnapshot } from '@/lib/localStats';

interface ShareExportPanelProps {
  isTeamFull: boolean;
  hasCaptain: boolean;
}

type ExportVariant = 'story' | 'square';

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to a temporary textarea when clipboard permissions are strict.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
};

export default function ShareExportPanel({ isTeamFull, hasCaptain }: ShareExportPanelProps) {
  const selectedPlayers = useTeamStore((state) => state.selectedPlayers);
  const formation = useTeamStore((state) => state.formation);
  const mentality = useTeamStore((state) => state.mentality);
  const blindMode = useTeamStore((state) => state.blindMode);
  const teamRating = useTeamStore((state) => state.teamRating);
  const captainId = useTeamStore((state) => state.captainId);
  const theme = useTeamStore((state) => state.theme);
  const squadName = useTeamStore((state) => state.squadName);
  const competitionId = useTeamStore((state) => state.competitionId);

  const exportRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Paylasima hazir');
  const [variant, setVariant] = useState<ExportVariant>('story');
  const [isExporting, setIsExporting] = useState(false);

  const isDark = theme === 'dark';
  const captain = selectedPlayers.find((player) => player?.id === captainId) ?? null;
  const captainRole = getCaptainRole(captain);
  const playerIds = selectedPlayers.map((player) => player?.id ?? null);
  const shareReady = isTeamFull && hasCaptain;
  const displayStatus = shareReady
    ? status
    : isTeamFull
      ? 'Kaptan secilince paylasim acilir'
      : 'Kadro tamamlaninca paylasim acilir';

  const buildSnapshot = (): SharedTeamSnapshot | null => {
    if (!formation || !mentality || !shareReady || !captainId) return null;

    return {
      version: 2,
      formation,
      mentality,
      blindMode,
      competitionId,
      captainId,
      squadName,
      playerIds,
    };
  };

  const recordSharedTeam = (headline?: string) => {
    if (!formation || !shareReady) return;
    saveTeamSnapshot({
      formation,
      rating: teamRating,
      captainId,
      playerIds,
      outcome: 'shared',
      headline,
      competitionId,
    });
  };

  const handleCopyLink = async () => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;

    try {
      const url = new URL(window.location.href);
      url.search = new URLSearchParams({ team: encodeShareCode(snapshot) }).toString();
      url.hash = '';

      await copyText(url.toString());
      recordSharedTeam('Paylaşım linki kopyalandı');
      setStatus('Link kopyalandı');
    } catch {
      setStatus('Link kopyalanamadı');
    }
  };

  const handleDownload = async (nextVariant: ExportVariant) => {
    const snapshot = buildSnapshot();
    if (!snapshot || !exportRef.current) return;

    setVariant(nextVariant);
    setIsExporting(true);
    setStatus('Görsel hazırlanıyor');

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#09090b',
      });

      const link = document.createElement('a');
      link.download = `efsane-11-${nextVariant}.png`;
      link.href = dataUrl;
      link.click();

      recordSharedTeam(nextVariant === 'story' ? 'Story görseli indirildi' : 'Kare görsel indirildi');
      setStatus(nextVariant === 'story' ? 'Story PNG indirildi' : 'Kare PNG indirildi');
    } catch {
      setStatus('Görsel oluşturulamadı');
    } finally {
      setIsExporting(false);
    }
  };

  const disabledClass = !shareReady ? 'opacity-45 grayscale' : '';
  const exportSize = variant === 'story' ? { width: 540, height: 960 } : { width: 540, height: 540 };

  return (
    <section className={`mt-6 border-2 border-black p-4 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Share2 size={18} className="text-yellow-500" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Paylaşım</p>
            <p className="text-xs font-black opacity-75 mt-0.5">{displayStatus}</p>
          </div>
        </div>
        <span className="text-xs font-black bg-black text-yellow-500 px-3 py-1.5">{shareReady ? 'HAZIR' : isTeamFull ? 'KAPTAN' : 'KILITLI'}</span>
      </div>

      <div className={`mt-4 grid grid-cols-3 gap-2 ${disabledClass}`}>
        <button
          type="button"
          onClick={handleCopyLink}
          disabled={!shareReady || isExporting}
          className="game-button flex items-center justify-center gap-2 border-2 border-black bg-yellow-500 px-3 py-3 text-[11px] font-black uppercase text-black transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          <Copy size={14} />
          Link
        </button>
        <button
          type="button"
          onClick={() => handleDownload('story')}
          disabled={!shareReady || isExporting}
          className="game-button flex items-center justify-center gap-2 border-2 border-black bg-zinc-950 px-3 py-3 text-[11px] font-black uppercase text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-black disabled:opacity-50"
        >
          <Download size={14} />
          Story
        </button>
        <button
          type="button"
          onClick={() => handleDownload('square')}
          disabled={!shareReady || isExporting}
          className="game-button flex items-center justify-center gap-2 border-2 border-black bg-zinc-950 px-3 py-3 text-[11px] font-black uppercase text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-black disabled:opacity-50"
        >
          <ImageIcon size={14} />
          Kare
        </button>
      </div>

      <div
        ref={exportRef}
        aria-hidden
        className="fixed -left-[9999px] top-0 overflow-hidden bg-zinc-950 text-white font-mono"
        style={exportSize}
      >
        <div className="flex h-full flex-col p-8">
          <div className="flex items-start justify-between border-b-2 border-yellow-500 pb-5">
            <div>
              <div className="max-w-[320px] truncate text-5xl font-black italic leading-none tracking-tighter">{squadName || 'EFSANE-11'}</div>
              <div className="mt-2 text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400">
                {formation} / {mentality}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Rating</div>
              <div className="text-6xl font-black text-yellow-500">{blindMode ? '??' : teamRating}</div>
            </div>
          </div>

          <div className={`${variant === 'story' ? 'mt-8 w-[430px]' : 'mt-4 w-[305px]'} mx-auto`}>
            <Pitch elementId={`export-pitch-${variant}`} />
          </div>

          <div className={`${variant === 'story' ? 'mt-auto grid grid-cols-2 gap-3' : 'mt-4 grid grid-cols-2 gap-2'}`}>
            <div className="player-card is-captain border-2 border-yellow-500 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-300">Kaptan</div>
                  <div className="mt-2 truncate text-xl font-black">{captain?.name ?? 'Secilmedi'}</div>
                  <div className="mt-1 text-xs font-black text-white/65">{captainRole?.title ?? 'Rol yok'}</div>
                </div>
                <div className="grid h-11 w-11 place-items-center border-2 border-black bg-yellow-500 text-black shadow-[2px_2px_0px_0px_#000]">
                  <Crown size={23} fill="currentColor" />
                </div>
              </div>
              <div className="mt-3 inline-flex items-center border border-black bg-yellow-500 px-2 py-1 text-[11px] font-black text-black">
                +{captainRole?.bonus ?? 0} Liderlik
              </div>
            </div>
            <div className="border-2 border-zinc-700 bg-black p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Efsane Imza</div>
              <div className="mt-2 flex items-center gap-2 text-xl font-black">
                <LinkIcon size={18} className="text-yellow-500" />
                efsane-11
              </div>
              <div className="mt-1 text-xs font-black text-zinc-500">Kadro kur / simule et</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
