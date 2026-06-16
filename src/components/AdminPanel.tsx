'use client';

import Link from 'next/link';
import { ChangeEvent, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Download, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import {
  getSeasonDataset,
  getSeasonServerSnapshot,
  isSyntheticPlayerName,
  resetSeasonDataset,
  saveSeasonDataset,
  subscribeSeasonDataset,
} from '@/lib/seasonRepository';
import type {
  CompetitionFormat,
  FootballPosition,
  GameSettings,
  KnockoutRound,
  PlayerAttributes,
  SeasonCompetition,
  SeasonDataset,
  SeasonPlayer,
  SeasonTeam,
  TeamType,
} from '@/types';

type Section = 'competitions' | 'teams' | 'players' | 'settings';

const positions: FootballPosition[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
const knockoutRounds: KnockoutRound[] = ['round-of-32', 'round-of-16', 'quarter-final', 'semi-final', 'final'];
const knockoutRoundLabels: Record<KnockoutRound, string> = {
  'round-of-32': 'Son 32',
  'round-of-16': 'Son 16',
  'quarter-final': 'Çeyrek Final',
  'semi-final': 'Yarı Final',
  final: 'Final',
};
const attributeLabels: Record<keyof PlayerAttributes, string> = {
  attack: 'Hücum',
  defense: 'Savunma',
  passing: 'Pas',
  pace: 'Hız',
  shooting: 'Şut',
  dribbling: 'Dribbling',
  goalkeeping: 'Kalecilik',
};

const slugify = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const syncRelations = (input: SeasonDataset): SeasonDataset => {
  const teams = input.teams.map((team) => ({
    ...team,
    competitionIds: Array.from(new Set(team.competitionIds)),
    players: input.players.filter((player) => player.teamId === team.id).map((player) => player.id),
  }));

  const competitions = input.competitions.map((competition) => {
    const competitionTeams = teams.filter((team) => team.competitionIds.includes(competition.competitionId));
    return {
      ...competition,
      teams: competitionTeams.map((team) => team.id),
      players: competitionTeams.flatMap((team) => team.players),
    };
  });

  return { ...input, teams, competitions };
};

const emptyCompetition = (season: string): SeasonCompetition => ({
  competitionId: '',
  competitionName: '',
  season,
  format: 'league',
  leagueMatchCount: 34,
  leaguePhaseMatchCount: 8,
  homeAway: true,
  groupCount: 0,
  groupSize: 0,
  groups: [],
  knockoutRounds: [...knockoutRounds],
  teams: [],
  players: [],
});

const emptyTeam = (): SeasonTeam => ({
  id: '',
  name: '',
  teamType: 'club',
  country: 'Türkiye',
  league: '',
  competitionIds: [],
  strengthBonus: 0,
  players: [],
});

const emptyPlayer = (teamId = ''): SeasonPlayer => ({
  id: '',
  teamId,
  name: '',
  playerType: 'club',
  number: 1,
  primaryPosition: 'CM',
  secondaryPositions: [],
  rating: 75,
  form: 0,
  nationality: 'Türkiye',
  isActive: true,
  attributes: {
    attack: 75,
    defense: 75,
    passing: 75,
    pace: 75,
    shooting: 75,
    dribbling: 75,
    goalkeeping: 20,
  },
});

const inputClass = 'w-full border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none focus:bg-yellow-50';
const labelClass = 'block text-[10px] font-black uppercase tracking-[0.18em] opacity-60 mb-1';

export default function AdminPanel() {
  const dataset = useSyncExternalStore(
    subscribeSeasonDataset,
    getSeasonDataset,
    getSeasonServerSnapshot,
  );
  const [section, setSection] = useState<Section>('competitions');
  const [competitionDraft, setCompetitionDraft] = useState<SeasonCompetition | null>(null);
  const [teamDraft, setTeamDraft] = useState<SeasonTeam | null>(null);
  const [playerDraft, setPlayerDraft] = useState<SeasonPlayer | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<GameSettings>({ ...dataset.settings });
  const [status, setStatus] = useState('Local JSON yönetimi');

  const sortedTeams = useMemo(
    () => [...(dataset?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [dataset],
  );
  const sortedPlayers = useMemo(
    () => [...(dataset?.players ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [dataset],
  );

  const commit = (nextDataset: SeasonDataset, message: string) => {
    const synced = syncRelations(nextDataset);
    saveSeasonDataset(synced);
    setStatus(message);
  };

  const saveCompetition = () => {
    if (!competitionDraft?.competitionName.trim()) return;
    const originalId = dataset.competitions.find(
      (item) => item.competitionId === competitionDraft.competitionId,
    )?.competitionId;
    const competitionId = originalId || slugify(competitionDraft.competitionId || competitionDraft.competitionName);
    if (!competitionId) return;

    const nextCompetition = { ...competitionDraft, competitionId };
    const exists = dataset.competitions.some((item) => item.competitionId === competitionId);
    commit({
      ...dataset,
      competitions: exists
        ? dataset.competitions.map((item) => item.competitionId === competitionId ? nextCompetition : item)
        : [...dataset.competitions, nextCompetition],
    }, 'Turnuva kaydedildi');
    setCompetitionDraft(nextCompetition);
  };

  const deleteCompetition = () => {
    if (!competitionDraft?.competitionId) return;
    const competitionId = competitionDraft.competitionId;
    commit({
      ...dataset,
      competitions: dataset.competitions.filter((item) => item.competitionId !== competitionId),
      teams: dataset.teams.map((team) => ({
        ...team,
        competitionIds: team.competitionIds.filter((id) => id !== competitionId),
      })),
    }, 'Turnuva silindi');
    setCompetitionDraft(null);
  };

  const saveTeam = () => {
    if (!teamDraft?.name.trim()) return;
    const id = teamDraft.id || slugify(teamDraft.name);
    if (!id) return;
    const nextTeam = { ...teamDraft, id };
    const exists = dataset.teams.some((item) => item.id === id);
    commit({
      ...dataset,
      teams: exists
        ? dataset.teams.map((item) => item.id === id ? nextTeam : item)
        : [...dataset.teams, nextTeam],
    }, 'Takım kaydedildi');
    setTeamDraft(nextTeam);
  };

  const deleteTeam = () => {
    if (!teamDraft?.id) return;
    const teamId = teamDraft.id;
    commit({
      ...dataset,
      teams: dataset.teams.filter((team) => team.id !== teamId),
      players: dataset.players.filter((player) => player.teamId !== teamId),
    }, 'Takım ve oyuncuları silindi');
    setTeamDraft(null);
  };

  const savePlayer = () => {
    if (!playerDraft?.name.trim() || !playerDraft.teamId) return;
    if (isSyntheticPlayerName(playerDraft.name, playerDraft.teamId, dataset.teams)) {
      setStatus('Oyuncu adı takım adı + mevki biçiminde olamaz');
      return;
    }
    const id = playerDraft.id || `${playerDraft.teamId}-${slugify(playerDraft.name)}`;
    if (!id) return;
    const teamType = dataset.teams.find((team) => team.id === playerDraft.teamId)?.teamType ?? 'club';
    const nextPlayer = {
      ...playerDraft,
      id,
      playerType: teamType === 'nationalTeam' ? 'nationalTeam' as const : 'club' as const,
    };
    const exists = dataset.players.some((item) => item.id === id);
    commit({
      ...dataset,
      players: exists
        ? dataset.players.map((item) => item.id === id ? nextPlayer : item)
        : [...dataset.players, nextPlayer],
    }, 'Oyuncu kaydedildi');
    setPlayerDraft(nextPlayer);
  };

  const deletePlayer = () => {
    if (!playerDraft?.id) return;
    commit({
      ...dataset,
      players: dataset.players.filter((player) => player.id !== playerDraft.id),
    }, 'Oyuncu silindi');
    setPlayerDraft(null);
  };

  const saveSettings = () => {
    commit({ ...dataset, settings: settingsDraft }, 'Oyun ve reklam ayarları kaydedildi');
  };

  const exportJson = () => {
    const blob = new Blob([`${JSON.stringify(dataset, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `efsane-11-${dataset.season}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('JSON dışa aktarıldı');
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as SeasonDataset;
      if (
        parsed.schemaVersion !== 4 ||
        !parsed.settings ||
        !Array.isArray(parsed.competitions) ||
        !Array.isArray(parsed.teams) ||
        !Array.isArray(parsed.players) ||
        parsed.players.some((player) => (
          !player.name?.trim() ||
          typeof player.number !== 'number' ||
          typeof player.primaryPosition !== 'string' ||
          isSyntheticPlayerName(player.name, player.teamId, parsed.teams)
        ))
      ) {
        throw new Error('Geçersiz şema');
      }
      commit(parsed, 'JSON içe aktarıldı');
      setCompetitionDraft(null);
      setTeamDraft(null);
      setPlayerDraft(null);
      setSettingsDraft({ ...parsed.settings });
    } catch {
      setStatus('JSON okunamadı veya şema geçersiz');
    }
  };

  const resetData = () => {
    resetSeasonDataset();
    setCompetitionDraft(null);
    setTeamDraft(null);
    setPlayerDraft(null);
    setSettingsDraft({ ...getSeasonDataset().settings });
    setStatus('Varsayılan 2025-2026 verisine dönüldü');
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-4 font-mono text-white sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-4 border-black bg-yellow-500 p-5 text-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">Local JSON</p>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Efsane-11 Admin</h1>
            <p className="mt-1 text-xs font-black">{dataset.season} / {dataset.teams.length} takım / {dataset.players.length} oyuncu</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="game-button flex items-center gap-2 border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000]">
              <ArrowLeft size={16} /> Oyuna dön
            </Link>
            <button type="button" onClick={exportJson} className="game-button flex items-center gap-2 border-2 border-black bg-black px-4 py-3 text-xs font-black uppercase text-white">
              <Download size={16} /> Dışa aktar
            </button>
            <label className="game-button flex cursor-pointer items-center gap-2 border-2 border-black bg-white px-4 py-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000]">
              <Upload size={16} /> İçe aktar
              <input type="file" accept="application/json" onChange={importJson} className="hidden" />
            </label>
            <button type="button" onClick={resetData} className="game-button flex items-center gap-2 border-2 border-black bg-red-600 px-4 py-3 text-xs font-black uppercase text-white">
              <RotateCcw size={16} /> Sıfırla
            </button>
          </div>
        </header>

        <div className="mt-7 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-4 border-black bg-zinc-900 p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,1)]">
            <p className="mb-3 border-b-2 border-white/10 pb-3 text-[10px] font-black uppercase tracking-[0.22em] text-yellow-500">{status}</p>
            {([
              ['competitions', `Turnuvalar (${dataset.competitions.length})`],
              ['teams', `Takımlar (${dataset.teams.length})`],
              ['players', `Oyuncular (${dataset.players.length})`],
              ['settings', 'Oyun Ayarları'],
            ] as [Section, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`game-button mb-2 w-full border-2 border-black px-4 py-4 text-left text-xs font-black uppercase ${
                  section === id ? 'bg-yellow-500 text-black' : 'bg-white text-black'
                }`}
              >
                {label}
              </button>
            ))}
          </aside>

          <section className="border-4 border-black bg-zinc-100 p-5 text-black shadow-[7px_7px_0px_0px_rgba(0,0,0,1)]">
            {section === 'competitions' && (
              <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                <EntityList
                  title="Turnuvalar"
                  onAdd={() => setCompetitionDraft(emptyCompetition(dataset.season))}
                  items={dataset.competitions.map((item) => ({
                    id: item.competitionId,
                    label: item.competitionName,
                    detail: `${item.season} / ${item.teams.length} takım`,
                  }))}
                  selectedId={competitionDraft?.competitionId}
                  onSelect={(id) => {
                    const selected = dataset.competitions.find((item) => item.competitionId === id)!;
                    setCompetitionDraft({
                      ...selected,
                      knockoutRounds: [...selected.knockoutRounds],
                      groups: selected.groups.map((group) => ({ ...group, teamIds: [...group.teamIds] })),
                    });
                  }}
                />
                {competitionDraft ? (
                  <Editor title="Turnuva düzenle" onSave={saveCompetition} onDelete={competitionDraft.competitionId ? deleteCompetition : undefined}>
                    <Field label="Turnuva adı"><input className={inputClass} value={competitionDraft.competitionName} onChange={(event) => setCompetitionDraft({ ...competitionDraft, competitionName: event.target.value })} /></Field>
                    <Field label="Turnuva ID"><input className={inputClass} value={competitionDraft.competitionId} disabled={Boolean(dataset.competitions.some((item) => item.competitionId === competitionDraft.competitionId))} onChange={(event) => setCompetitionDraft({ ...competitionDraft, competitionId: slugify(event.target.value) })} /></Field>
                    <Field label="Sezon"><input className={inputClass} value={competitionDraft.season} onChange={(event) => setCompetitionDraft({ ...competitionDraft, season: event.target.value })} /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Competition formatı">
                        <select
                          className={inputClass}
                          value={competitionDraft.format}
                          onChange={(event) => setCompetitionDraft({ ...competitionDraft, format: event.target.value as CompetitionFormat })}
                        >
                          <option value="league">League</option>
                          <option value="group_knockout">Group + Knockout</option>
                          <option value="knockout">Knockout Only</option>
                          <option value="world_cup_48">World Cup 48</option>
                        </select>
                      </Field>
                      <Field label="Lig maç/hafta sayısı">
                        <input type="number" min="1" max="50" className={inputClass} value={competitionDraft.leagueMatchCount} onChange={(event) => setCompetitionDraft({ ...competitionDraft, leagueMatchCount: Number(event.target.value) })} />
                      </Field>
                      <Field label="Avrupa lig aşaması maç sayısı">
                        <input type="number" min="1" max="20" className={inputClass} value={competitionDraft.leaguePhaseMatchCount} onChange={(event) => setCompetitionDraft({ ...competitionDraft, leaguePhaseMatchCount: Number(event.target.value) })} />
                      </Field>
                      <Field label="Grup sayısı">
                        <input type="number" min="0" max="16" className={inputClass} value={competitionDraft.groupCount} onChange={(event) => setCompetitionDraft({ ...competitionDraft, groupCount: Number(event.target.value) })} />
                      </Field>
                      <Field label="Grup takım sayısı">
                        <input type="number" min="0" max="8" className={inputClass} value={competitionDraft.groupSize} onChange={(event) => setCompetitionDraft({ ...competitionDraft, groupSize: Number(event.target.value) })} />
                      </Field>
                      <label className="flex items-center gap-3 border-2 border-black bg-white p-3 text-xs font-black uppercase">
                        <input type="checkbox" checked={competitionDraft.homeAway} onChange={(event) => setCompetitionDraft({ ...competitionDraft, homeAway: event.target.checked })} />
                        İç saha / deplasman
                      </label>
                    </div>
                    <Field label="Eleme turları">
                      <div className="grid gap-2 md:grid-cols-2">
                        {knockoutRounds.map((round) => (
                          <label key={round} className="flex items-center gap-3 border-2 border-black bg-white p-3 text-xs font-black">
                            <input
                              type="checkbox"
                              checked={competitionDraft.knockoutRounds.includes(round)}
                              onChange={(event) => setCompetitionDraft({
                                ...competitionDraft,
                                knockoutRounds: event.target.checked
                                  ? knockoutRounds.filter((item) => [...competitionDraft.knockoutRounds, round].includes(item))
                                  : competitionDraft.knockoutRounds.filter((item) => item !== round),
                              })}
                            />
                            {knockoutRoundLabels[round]}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <p className="text-xs font-bold opacity-60">Takım atamaları Takımlar bölümünden yönetilir.</p>
                  </Editor>
                ) : <EmptyState text="Düzenlemek için bir turnuva seç." />}
              </div>
            )}

            {section === 'teams' && (
              <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                <EntityList
                  title="Takımlar"
                  onAdd={() => setTeamDraft(emptyTeam())}
                  items={sortedTeams.map((item) => ({ id: item.id, label: item.name, detail: `${item.country} / ${item.players.length} oyuncu` }))}
                  selectedId={teamDraft?.id}
                  onSelect={(id) => setTeamDraft({ ...dataset.teams.find((item) => item.id === id)!, competitionIds: [...dataset.teams.find((item) => item.id === id)!.competitionIds] })}
                />
                {teamDraft ? (
                  <Editor title="Takım düzenle" onSave={saveTeam} onDelete={teamDraft.id ? deleteTeam : undefined}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Takım adı"><input className={inputClass} value={teamDraft.name} onChange={(event) => setTeamDraft({ ...teamDraft, name: event.target.value })} /></Field>
                      <Field label="Takım ID"><input className={inputClass} value={teamDraft.id} disabled={Boolean(dataset.teams.some((item) => item.id === teamDraft.id))} onChange={(event) => setTeamDraft({ ...teamDraft, id: slugify(event.target.value) })} /></Field>
                      <Field label="Ülke"><input className={inputClass} value={teamDraft.country} onChange={(event) => setTeamDraft({ ...teamDraft, country: event.target.value })} /></Field>
                      <Field label="Lig"><input className={inputClass} value={teamDraft.league} onChange={(event) => setTeamDraft({ ...teamDraft, league: event.target.value })} /></Field>
                      <Field label="Takım tipi">
                        <select className={inputClass} value={teamDraft.teamType} onChange={(event) => setTeamDraft({ ...teamDraft, teamType: event.target.value as TeamType })}>
                          <option value="club">Club</option>
                          <option value="nationalTeam">National Team</option>
                        </select>
                      </Field>
                      <Field label="Güç bonusu"><input type="number" min="-10" max="10" className={inputClass} value={teamDraft.strengthBonus} onChange={(event) => setTeamDraft({ ...teamDraft, strengthBonus: Number(event.target.value) })} /></Field>
                    </div>
                    <Field label="Turnuva atamaları">
                      <div className="grid gap-2 md:grid-cols-2">
                        {dataset.competitions.map((competition) => (
                          <label key={competition.competitionId} className="flex items-center gap-3 border-2 border-black bg-white p-3 text-xs font-black">
                            <input
                              type="checkbox"
                              checked={teamDraft.competitionIds.includes(competition.competitionId)}
                              onChange={(event) => setTeamDraft({
                                ...teamDraft,
                                competitionIds: event.target.checked
                                  ? [...teamDraft.competitionIds, competition.competitionId]
                                  : teamDraft.competitionIds.filter((id) => id !== competition.competitionId),
                              })}
                            />
                            {competition.competitionName}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </Editor>
                ) : <EmptyState text="Düzenlemek için bir takım seç." />}
              </div>
            )}

            {section === 'players' && (
              <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                <EntityList
                  title="Oyuncular"
                  onAdd={() => setPlayerDraft(emptyPlayer(sortedTeams[0]?.id))}
                  items={sortedPlayers.map((item) => ({
                    id: item.id,
                    label: item.name,
                    detail: `${dataset.teams.find((team) => team.id === item.teamId)?.name ?? item.teamId} / ${item.primaryPosition} / R${item.rating}`,
                  }))}
                  selectedId={playerDraft?.id}
                  onSelect={(id) => {
                    const selected = dataset.players.find((item) => item.id === id)!;
                    setPlayerDraft({
                      ...selected,
                      secondaryPositions: [...selected.secondaryPositions],
                      attributes: { ...selected.attributes },
                    });
                  }}
                />
                {playerDraft ? (
                  <Editor title="Oyuncu düzenle" onSave={savePlayer} onDelete={playerDraft.id ? deletePlayer : undefined}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Oyuncu adı"><input className={inputClass} value={playerDraft.name} onChange={(event) => setPlayerDraft({ ...playerDraft, name: event.target.value })} /></Field>
                      <Field label="Oyuncu ID"><input className={inputClass} value={playerDraft.id} disabled={Boolean(dataset.players.some((item) => item.id === playerDraft.id))} onChange={(event) => setPlayerDraft({ ...playerDraft, id: slugify(event.target.value) })} /></Field>
                      <Field label="Takım">
                        <select className={inputClass} value={playerDraft.teamId} onChange={(event) => setPlayerDraft({ ...playerDraft, teamId: event.target.value })}>
                          {sortedTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Pozisyon">
                        <select className={inputClass} value={playerDraft.primaryPosition} onChange={(event) => setPlayerDraft({ ...playerDraft, primaryPosition: event.target.value as FootballPosition })}>
                          {positions.map((position) => <option key={position} value={position}>{position}</option>)}
                        </select>
                      </Field>
                      <Field label="Rating"><input type="number" min="1" max="99" className={inputClass} value={playerDraft.rating} onChange={(event) => setPlayerDraft({ ...playerDraft, rating: Number(event.target.value) })} /></Field>
                      <Field label="Form (-5 / +5)"><input type="number" min="-5" max="5" className={inputClass} value={playerDraft.form} onChange={(event) => setPlayerDraft({ ...playerDraft, form: Number(event.target.value) })} /></Field>
                      <Field label="Uyruk"><input className={inputClass} value={playerDraft.nationality} onChange={(event) => setPlayerDraft({ ...playerDraft, nationality: event.target.value })} /></Field>
                      <Field label="Forma no"><input type="number" min="1" max="99" className={inputClass} value={playerDraft.number} onChange={(event) => setPlayerDraft({ ...playerDraft, number: Number(event.target.value) })} /></Field>
                    </div>
                    <Field label="Yan mevkiler">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {positions.filter((position) => position !== playerDraft.primaryPosition).map((position) => (
                          <label key={position} className="flex items-center gap-2 border-2 border-black bg-white p-3 text-xs font-black">
                            <input
                              type="checkbox"
                              checked={playerDraft.secondaryPositions.includes(position)}
                              onChange={(event) => setPlayerDraft({
                                ...playerDraft,
                                secondaryPositions: event.target.checked
                                  ? [...playerDraft.secondaryPositions, position]
                                  : playerDraft.secondaryPositions.filter((item) => item !== position),
                              })}
                            />
                            {position}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <Field label="Oyuncu özellikleri">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {(Object.keys(attributeLabels) as (keyof PlayerAttributes)[]).map((attribute) => (
                          <label key={attribute}>
                            <span className={labelClass}>{attributeLabels[attribute]}</span>
                            <input
                              type="number"
                              min="1"
                              max="99"
                              className={inputClass}
                              value={playerDraft.attributes[attribute]}
                              onChange={(event) => setPlayerDraft({
                                ...playerDraft,
                                attributes: {
                                  ...playerDraft.attributes,
                                  [attribute]: Number(event.target.value),
                                },
                              })}
                            />
                          </label>
                        ))}
                      </div>
                    </Field>
                    <label className="flex items-center gap-3 border-2 border-black bg-white p-3 text-xs font-black uppercase">
                      <input type="checkbox" checked={playerDraft.isActive} onChange={(event) => setPlayerDraft({ ...playerDraft, isActive: event.target.checked })} />
                      Aktif oyuncu
                    </label>
                  </Editor>
                ) : <EmptyState text="Düzenlemek için bir oyuncu seç." />}
              </div>
            )}

            {section === 'settings' && (
              <Editor title="Oyun ayarları" onSave={saveSettings}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-3 border-2 border-black bg-white p-4 text-xs font-black uppercase">
                    <input
                      type="checkbox"
                      checked={settingsDraft.adsEnabled}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, adsEnabled: event.target.checked })}
                    />
                    Reklamları aç
                  </label>
                  <label className="flex items-center gap-3 border-2 border-black bg-white p-4 text-xs font-black uppercase">
                    <input
                      type="checkbox"
                      checked={settingsDraft.penaltiesEnabled}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, penaltiesEnabled: event.target.checked })}
                    />
                    Gelişmiş penaltı hesabı
                  </label>
                  <label className="flex items-center gap-3 border-2 border-black bg-white p-4 text-xs font-black uppercase">
                    <input
                      type="checkbox"
                      checked={settingsDraft.simulateOtherMatches}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, simulateOtherMatches: event.target.checked })}
                    />
                    Diğer maçları simüle et
                  </label>
                  <Field label="Şans faktörü (0.2 - 2)">
                    <input type="number" min="0.2" max="2" step="0.05" className={inputClass} value={settingsDraft.chanceFactor} onChange={(event) => setSettingsDraft({ ...settingsDraft, chanceFactor: Number(event.target.value) })} />
                  </Field>
                  <Field label="Küçük sakatlık ihtimali (0 - 1)">
                    <input type="number" min="0" max="1" step="0.01" className={inputClass} value={settingsDraft.injuryChance} onChange={(event) => setSettingsDraft({ ...settingsDraft, injuryChance: Number(event.target.value) })} />
                  </Field>
                </div>
                <p className="text-xs font-bold opacity-60">
                  Fikstür biçimi ve maç sayıları Turnuvalar bölümünden ayrı ayrı yönetilir.
                </p>
              </Editor>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function EntityList({
  title,
  items,
  selectedId,
  onSelect,
  onAdd,
}: {
  title: string;
  items: { id: string; label: string; detail: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black uppercase italic">{title}</h2>
        <button type="button" onClick={onAdd} className="game-button grid h-10 w-10 place-items-center border-2 border-black bg-yellow-500 shadow-[3px_3px_0px_0px_#000]"><Plus size={18} /></button>
      </div>
      <div className="max-h-[65vh] space-y-2 overflow-y-auto border-2 border-black bg-zinc-200 p-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`game-button w-full border-2 border-black p-3 text-left ${selectedId === item.id ? 'bg-yellow-500' : 'bg-white'}`}
          >
            <span className="block text-xs font-black uppercase">{item.label}</span>
            <span className="mt-1 block text-[9px] font-bold uppercase opacity-55">{item.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Editor({
  title,
  children,
  onSave,
  onDelete,
}: {
  title: string;
  children: React.ReactNode;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <div>
      <h2 className="border-b-2 border-black pb-3 text-xl font-black uppercase italic">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
      <div className="mt-7 flex flex-wrap gap-3 border-t-2 border-black pt-5">
        <button type="button" onClick={onSave} className="game-button flex items-center gap-2 border-2 border-black bg-green-600 px-5 py-3 text-xs font-black uppercase text-white shadow-[4px_4px_0px_0px_#000]">
          <Save size={17} /> Kaydet
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="game-button flex items-center gap-2 border-2 border-black bg-red-600 px-5 py-3 text-xs font-black uppercase text-white">
            <Trash2 size={17} /> Sil
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className={labelClass}>{label}</span>{children}</label>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid min-h-64 place-items-center border-2 border-dashed border-black p-8 text-center text-xs font-black uppercase opacity-45">{text}</div>;
}
