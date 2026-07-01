import type { CompetitionFixture, MatchIncident, MatchResult } from './competitionEngine';
import { flowEventForMinute } from './matchAnimation';

export type MatchTimelineTone = 'neutral' | 'goal' | 'warning' | 'danger' | 'change' | 'penalty';

export interface MatchTimelineEntry {
  id: string;
  minute: string;
  text: string;
  tone: MatchTimelineTone;
}

export interface MatchSummary {
  scoreLine: string;
  manOfTheMatch: string;
  totalShots: string;
  shotsOnTarget: string;
  possession: string;
  goalMinutes: string;
  keyMoments: string[];
}

const formatMinute = (minute: number) => `${minute}'`;

const teamNameForIncident = (
  incident: MatchIncident,
  fixture: Pick<CompetitionFixture, 'homeTeamId' | 'awayTeamId'>,
  homeName: string,
  awayName: string,
) => (incident.teamId === fixture.homeTeamId ? homeName : awayName);

export const flowTextForMinute = (minute: number, sideName: string) => {
  if (minute === 45) return 'İlk yarı sona erdi';
  if (minute === 46) return 'İkinci yarı başladı';
  if (minute === 90) return 'Normal süre tamamlandı';
  if (minute === 91) return 'Uzatma başladı';
  if (minute === 120) return 'Maç sonu';

  const flowEvent = flowEventForMinute(minute);
  if (flowEvent === 'pass') return `${sideName} orta saha mücadelesi kuruyor`;
  if (flowEvent === 'attack') return `${sideName} tehlikeli geliyor`;
  if (flowEvent === 'shot') return `${sideName} şut arıyor`;
  if (flowEvent === 'save') return 'Kaleci kurtarışı geldi';
  if (flowEvent === 'foul') return 'Faul düdüğü ve kısa bir duraklama';
  return 'Oyun akıyor';
};

export const toneForMinute = (minute: number): MatchTimelineTone => {
  if (minute === 45 || minute === 46 || minute === 90 || minute === 91 || minute === 120) return 'neutral';
  const flowEvent = flowEventForMinute(minute);
  if (flowEvent === 'shot') return 'danger';
  if (flowEvent === 'save') return 'warning';
  if (flowEvent === 'foul') return 'warning';
  if (flowEvent === 'attack') return 'neutral';
  return 'neutral';
};

export const describeIncident = (
  incident: MatchIncident,
  fixture: Pick<CompetitionFixture, 'homeTeamId' | 'awayTeamId'>,
  homeName: string,
  awayName: string,
): MatchTimelineEntry => {
  const teamName = teamNameForIncident(incident, fixture, homeName, awayName);
  if (incident.type === 'goal') {
    return {
      id: `incident-${incident.minute}-${incident.teamId}-${incident.playerName}`,
      minute: formatMinute(incident.minute),
      text: `GOL! ${teamName} adına ${incident.playerName}.`,
      tone: 'goal',
    };
  }
  if (incident.type === 'yellow-card') {
    return {
      id: `incident-${incident.minute}-${incident.teamId}-${incident.playerName}`,
      minute: formatMinute(incident.minute),
      text: `Sarı kart: ${incident.playerName}.`,
      tone: 'warning',
    };
  }
  if (incident.type === 'substitution') {
    return {
      id: `incident-${incident.minute}-${incident.teamId}-${incident.playerName}`,
      minute: formatMinute(incident.minute),
      text: `Oyuncu değişikliği: ${incident.relatedPlayerName ?? 'Oyuncu'} çıktı, ${incident.playerName} girdi.`,
      tone: 'change',
    };
  }
  return {
    id: `incident-${incident.minute}-${incident.teamId}-${incident.playerName}`,
    minute: formatMinute(incident.minute),
    text: `Sakatlık: ${incident.playerName}.`,
    tone: 'danger',
  };
};

export const buildMatchTimeline = (
  fixture: Pick<CompetitionFixture, 'homeTeamId' | 'awayTeamId'>,
  result: MatchResult,
  homeName: string,
  awayName: string,
) => {
  const entries: MatchTimelineEntry[] = [{
    id: 'kickoff',
    minute: "0'",
    text: 'Başlama düdüğü',
    tone: 'neutral',
  }];

  const checkpoints = result.extraTime
    ? [5, 12, 23, 37, 45, 46, 60, 75, 90, 91, 105, 120]
    : [5, 12, 23, 37, 45, 46, 60, 75, 90];
  const incidents = [...result.incidents].sort((left, right) => left.minute - right.minute);
  const incidentMap = new Map<number, MatchIncident[]>();

  incidents.forEach((incident) => {
    const list = incidentMap.get(incident.minute) ?? [];
    list.push(incident);
    incidentMap.set(incident.minute, list);
  });

  checkpoints.forEach((minute) => {
    const sideName = minute % 2 === 0 ? homeName : awayName;
    entries.push({
      id: `flow-${minute}`,
      minute: formatMinute(minute),
      text: flowTextForMinute(minute, sideName),
      tone: toneForMinute(minute),
    });

    if (minute % 29 === 0) {
      entries.push({
        id: `corner-${minute}`,
        minute: formatMinute(minute),
        text: 'Korner tehlikesi',
        tone: 'warning',
      });
    }

    const currentIncidents = incidentMap.get(minute) ?? [];
    currentIncidents.forEach((incident, index) => {
      entries.push({
        ...describeIncident(incident, fixture, homeName, awayName),
        id: `${incident.minute}-${index}-${incident.teamId}-${incident.playerName}`,
      });
    });
  });

  entries.push({
    id: 'fulltime',
    minute: 'FT',
    text: 'Maç sona erdi',
    tone: 'neutral',
  });

  return entries;
};

const sortedGoalMinutes = (result: MatchResult) => {
  const goalMinutes = result.incidents
    .filter((incident) => incident.type === 'goal')
    .map((incident) => incident.minute)
    .sort((left, right) => left - right);
  return goalMinutes.length > 0 ? goalMinutes.map((minute) => `${minute}'`).join(', ') : '-';
};

const pickManOfTheMatch = (
  fixture: Pick<CompetitionFixture, 'homeTeamId' | 'awayTeamId'>,
  result: MatchResult,
  homeName: string,
  awayName: string,
) => {
  const goalCounts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  result.incidents.forEach((incident, index) => {
    if (!firstSeen.has(incident.playerName)) firstSeen.set(incident.playerName, index);
    if (incident.type === 'goal') {
      goalCounts.set(incident.playerName, (goalCounts.get(incident.playerName) ?? 0) + 1);
    }
  });
  const sortedGoals = [...goalCounts.entries()].sort((left, right) => (
    right[1] - left[1] || (firstSeen.get(left[0]) ?? 0) - (firstSeen.get(right[0]) ?? 0)
  ));
  if (sortedGoals.length > 0) return sortedGoals[0][0];
  const firstIncident = result.incidents[0];
  if (firstIncident) return `${teamNameForIncident(firstIncident, fixture, homeName, awayName)} kolektifi`;
  const leadingTeam = result.normalTime.home >= result.normalTime.away ? homeName : awayName;
  return `${leadingTeam} kolektifi`;
};

export const buildMatchSummary = (
  fixture: Pick<CompetitionFixture, 'homeTeamId' | 'awayTeamId'>,
  result: MatchResult,
  homeName: string,
  awayName: string,
): MatchSummary => {
  const finalScore = result.extraTime ?? result.normalTime;
  const totalShots = result.stats.shotsHome + result.stats.shotsAway;
  const totalShotsOnTarget = result.stats.shotsOnTargetHome + result.stats.shotsOnTargetAway;
  const keyIncidents = result.incidents
    .filter((incident) => incident.type === 'goal' || incident.type === 'yellow-card')
    .slice(0, 4);

  return {
    scoreLine: `${finalScore.home} - ${finalScore.away}`,
    manOfTheMatch: pickManOfTheMatch(fixture, result, homeName, awayName),
    totalShots: `${totalShots}`,
    shotsOnTarget: `${totalShotsOnTarget}`,
    possession: `%${result.stats.possessionHome}`,
    goalMinutes: sortedGoalMinutes(result),
    keyMoments: keyIncidents.map((incident) => (
      describeIncident(incident, fixture, homeName, awayName).text
    )),
  };
};
