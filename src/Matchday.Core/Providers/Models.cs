namespace Matchday.Core.Providers;

public enum MatchStatus { Scheduled, Live, HalfTime, FullTime, Postponed, Cancelled, Unknown }

public enum MatchEventType { Goal, PenaltyGoal, OwnGoal, YellowCard, RedCard, Substitution, Other }

public sealed record TeamRef(
    string ProviderId,
    string Name,
    string ShortName,
    string Abbreviation,
    string? LogoUrl);

public sealed record PlayerRef(
    string ProviderId,
    string Name,
    string? Jersey,
    string? Position);

public sealed record MatchSummary(
    string ProviderId,
    DateTimeOffset KickoffUtc,
    MatchStatus Status,
    string? ClockDisplay,
    TeamRef Home,
    TeamRef Away,
    int? HomeScore,
    int? AwayScore,
    string? Venue);

public sealed record LineupPlayer(
    PlayerRef Player,
    bool Starter,
    int? FormationPlace);

public sealed record TeamLineup(
    string TeamProviderId,
    string? Formation,
    IReadOnlyList<LineupPlayer> Players);

/// <summary>
/// Primary = scorer / carded player / player coming on.
/// Secondary = assister / player going off.
/// </summary>
public sealed record MatchEvent(
    MatchEventType Type,
    int? Minute,
    string ClockDisplay,
    string? TeamProviderId,
    PlayerRef? Primary,
    PlayerRef? Secondary,
    string? Detail);

/// <summary>
/// One team's match stats, keyed by the provider's stat name (e.g. "possessionPct", "totalShots").
/// A loose map so new stats flow through without code changes.
/// </summary>
public sealed record TeamStats(
    string TeamProviderId,
    IReadOnlyDictionary<string, double> Values);

public sealed record MatchDetail(
    MatchSummary Summary,
    IReadOnlyList<TeamLineup> Lineups,
    IReadOnlyList<MatchEvent> Events,
    IReadOnlyList<TeamStats> Stats);

/// <summary>One player in a club's current squad. Player.Position is G, D, M or F.</summary>
public sealed record SquadPlayer(
    PlayerRef Player,
    int? Age,
    string? Nationality,
    string? FlagUrl);

public sealed record StandingRow(
    int Position,
    TeamRef Team,
    int Played,
    int Won,
    int Drawn,
    int Lost,
    int GoalsFor,
    int GoalsAgainst,
    int Points);