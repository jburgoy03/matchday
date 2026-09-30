namespace Matchday.Core.Providers;

public enum MatchStatus { Scheduled, Live, HalfTime, FullTime, Postponed, Cancelled, Unknown }

public enum MatchEventType { Goal, PenaltyGoal, OwnGoal, YellowCard, RedCard, Substitution, Other }

/// <summary>Color / AlternateColor are six lowercase hex digits without '#', or null when the feed doesn't say.</summary>
public sealed record TeamRef(
    string ProviderId,
    string Name,
    string ShortName,
    string Abbreviation,
    string? LogoUrl,
    string? Color = null,
    string? AlternateColor = null);

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
    string? Venue,
    string? Competition = null); // league slug (eng.1, uefa.champions…); null = the response didn't say

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

/// <summary>
/// One article from the provider's news feed. We carry the headline and a link out, never the body.
/// TeamProviderIds is every club the article is tagged with, which is how a story finds a team page.
/// </summary>
public sealed record NewsItem(
    string ProviderId,
    string Headline,
    string? Description,
    string? Byline,
    DateTimeOffset PublishedUtc,
    string? Type,
    bool Premium,
    string? ImageUrl,
    string? ImageCredit,
    string? WebUrl,
    IReadOnlyList<string> TeamProviderIds);

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

/// <summary>A player's club career, oldest club first. National sides are left out.</summary>
public sealed record PlayerCareer(IReadOnlyList<CareerClub> Clubs);

/// <summary>
/// One club and its league seasons, newest first. Seasons can be empty when the provider has no
/// numbers for that league. Color is six lowercase hex digits without '#'. Current = the player's club now.
/// </summary>
public sealed record CareerClub(string ProviderId, string Name, string? Color, bool Current, IReadOnlyList<CareerSeason> Seasons);

/// <summary>League stats for one season at one club. Year is the season's start year; Label reads like "2021-22".</summary>
public sealed record CareerSeason(int Year, string Label, string League, int Starts, int Goals, int Assists);
