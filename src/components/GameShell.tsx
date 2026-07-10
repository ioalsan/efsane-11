'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type GameShellPanel = 'left' | 'center' | 'right';

export const GAME_SHELL_PANEL_EVENT = 'canli11:game-shell-panel';

export function showGameShellPanel(panel: GameShellPanel) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GameShellPanel>(GAME_SHELL_PANEL_EVENT, { detail: panel }));
}

export default function GameShell({
  header,
  modeNav,
  topActionBar,
  matchControlBar,
  leftPanel,
  centerPanel,
  rightPanel,
  bottomActionBar,
  floatingActionBar,
  leftLabel = 'Oyuncular',
  centerLabel = 'Saha',
  rightLabel = 'Kadro',
  initialPanel = 'center',
}: {
  header?: ReactNode;
  modeNav?: ReactNode;
  topActionBar?: ReactNode;
  matchControlBar?: ReactNode;
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  bottomActionBar?: ReactNode;
  floatingActionBar?: ReactNode;
  leftLabel?: string;
  centerLabel?: string;
  rightLabel?: string;
  initialPanel?: GameShellPanel;
}) {
  const [activePanel, setActivePanel] = useState<GameShellPanel>(initialPanel);

  useEffect(() => {
    const handlePanelChange = (event: Event) => {
      const panel = (event as CustomEvent<GameShellPanel>).detail;
      if (panel === 'left' || panel === 'center' || panel === 'right') setActivePanel(panel);
    };
    window.addEventListener(GAME_SHELL_PANEL_EVENT, handlePanelChange);
    return () => window.removeEventListener(GAME_SHELL_PANEL_EVENT, handlePanelChange);
  }, []);

  const tabs: Array<{ id: GameShellPanel; label: string }> = [
    { id: 'left', label: leftLabel },
    { id: 'center', label: centerLabel },
    { id: 'right', label: rightLabel },
  ];

  return (
    <section className="game-shell">
      {header && <div className="game-shell-header">{header}</div>}
      {modeNav && <div className="game-shell-mode-nav">{modeNav}</div>}
      {topActionBar && <div className="game-shell-action-bar">{topActionBar}</div>}
      {matchControlBar && <div className="game-shell-match-control">{matchControlBar}</div>}
      <nav className="game-shell-tabs" aria-label="Oyun panelleri">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActivePanel(tab.id)}
            className={`game-button game-shell-tab ${activePanel === tab.id ? 'game-shell-tab--active' : ''}`}
            aria-pressed={activePanel === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="game-shell-grid">
        <div className={`game-shell-panel game-shell-panel--left ${activePanel === 'left' ? 'game-shell-panel--mobile-active' : ''}`}>
          {leftPanel}
        </div>
        <div className={`game-shell-panel game-shell-panel--center ${activePanel === 'center' ? 'game-shell-panel--mobile-active' : ''}`}>
          {centerPanel}
        </div>
        <div className={`game-shell-panel game-shell-panel--right ${activePanel === 'right' ? 'game-shell-panel--mobile-active' : ''}`}>
          {rightPanel}
        </div>
      </div>
      {bottomActionBar && <div className="game-shell-bottom-action">{bottomActionBar}</div>}
      {floatingActionBar && <div className="game-shell-floating-action">{floatingActionBar}</div>}
    </section>
  );
}

export function GameShellGrid({
  children,
  variant = 'builder',
  className = '',
}: {
  children: ReactNode;
  variant?: 'builder' | 'season';
  className?: string;
}) {
  return (
    <div className={`game-shell-shared-grid game-shell-shared-grid--${variant} ${className}`}>
      {children}
    </div>
  );
}
