export type TournamentStatus = "draft" | "published";
export type TournamentType = "single-elimination" | "double-elimination" | "custom-bracket";
export type TournamentSection = "bye" | "winners" | "losers" | "championship";
export type MatchupStatus = "scheduled" | "live" | "final" | "postponed" | "bye";
export type ParticipantSourceType = "seed" | "team" | "winner" | "loser" | "qualifier" | "tbd";
export type MatchupSlot = "A" | "B";

export interface TournamentEntry {
  id: string;
  tournamentId?: string;
  teamId: string;
  teamName: string;
  seed: number;
  displayNameOverride?: string;
  entryStatus: "active" | "tbd" | "withdrawn";
}

export interface ParticipantSource {
  type: ParticipantSourceType;
  seed?: number;
  teamId?: string;
  teamName?: string;
  matchupCode?: string;
  label?: string;
}

export interface TournamentMatchup {
  id: string;
  tournamentId?: string;
  matchupCode: string;
  bracketSection: TournamentSection;
  roundNumber: number;
  displayOrder: number;
  dateLabel?: string;
  timeLabel?: string;
  location?: string;
  status: MatchupStatus;
  seriesBestOf: number;
  seriesGameNumber: number;
  slotA: ParticipantSource;
  slotB: ParticipantSource;
  teamA?: string;
  teamB?: string;
  seedA?: string;
  seedB?: string;
  scoreA?: string;
  scoreB?: string;
  winner?: MatchupSlot | "";
  winnerDestination?: string;
  winnerDestinationSlot?: MatchupSlot | "";
  loserDestination?: string;
  loserDestinationSlot?: MatchupSlot | "";
  linkedGameId?: string;
  note?: string;
}

export interface TournamentValidationMessage {
  type: string;
  matchupCode?: string;
  message: string;
}

export interface Tournament {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  season: string;
  division: string;
  tournamentType: TournamentType | string;
  format: TournamentType | string;
  templateId: string;
  status: TournamentStatus | string;
  isPublic: boolean;
  startsAt?: string;
  endsAt?: string;
  championshipFormat?: string;
  description?: string;
  updatedAt?: string;
  entries: TournamentEntry[];
  matchups: TournamentMatchup[];
  rounds: Array<{
    id: string;
    name: string;
    order: number;
    bracketSection: TournamentSection;
    bracketSide: TournamentSection;
    matchups: TournamentMatchup[];
  }>;
  validation: TournamentValidationMessage[];
}
