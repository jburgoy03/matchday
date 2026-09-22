using Matchday.Core.Providers;

namespace Matchday.Data.Entities;

public class Team
{
    public int Id { get; set; }
    public required string ProviderId { get; set; }
    public required string Name { get; set; }
    public required string ShortName { get; set; }
    public required string Abbreviation { get; set; }
    public string? LogoUrl { get; set; }
}

public class Player
{
    public int Id { get; set; }
    public required string ProviderId { get; set; }
    public required string Name { get; set; }
}

public class Match
{
    public int Id { get; set; }
    public required string ProviderId { get; set; }
    public DateTimeOffset KickoffUtc { get; set; }
    public MatchStatus Status { get; set; }
    public string? ClockDisplay { get; set; }

    public int HomeTeamId { get; set; }
    public Team HomeTeam { get; set; } = null!;
    public int AwayTeamId { get; set; }
    public Team AwayTeam { get; set; } = null!;

    public int? HomeScore { get; set; }
    public int? AwayScore { get; set; }
    public string? Venue { get; set; }
    public string? HomeFormation { get; set; }
    public string? AwayFormation { get; set; }

    /// <summary>Team match stats (jsonb), keyed by ESPN stat name, e.g. "possessionPct" → 55. Null = never pulled.</summary>
    public Dictionary<string, double>? HomeStats { get; set; }
    public Dictionary<string, double>? AwayStats { get; set; }

    /// <summary>When lineups/events/stats were last pulled; null = never.</summary>
    public DateTimeOffset? DetailSyncedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public List<LineupEntry> Lineup { get; set; } = [];
    public List<MatchIncident> Incidents { get; set; } = [];
}

/// <summary>One player in one match's squad. Jersey/position live here because they can change match to match.</summary>
public class LineupEntry
{
    public int Id { get; set; }
    public int MatchId { get; set; }
    public int TeamId { get; set; }
    public int PlayerId { get; set; }
    public Player Player { get; set; } = null!;
    public string? Jersey { get; set; }
    public string? Position { get; set; }
    public bool Starter { get; set; }
    public int? FormationPlace { get; set; }
}

/// <summary>Goal, card or sub. Named "incident" to avoid clashing with Core's MatchEvent record.</summary>
public class MatchIncident
{
    public int Id { get; set; }
    public int MatchId { get; set; }
    public int Sequence { get; set; }
    public MatchEventType Type { get; set; }
    public int? Minute { get; set; }
    public required string ClockDisplay { get; set; }
    public int? TeamId { get; set; }
    public int? PrimaryPlayerId { get; set; }
    public Player? PrimaryPlayer { get; set; }
    public int? SecondaryPlayerId { get; set; }
    public Player? SecondaryPlayer { get; set; }
    public string? Detail { get; set; }
}

public class StandingEntry
{
    public int Id { get; set; }
    public int TeamId { get; set; }
    public Team Team { get; set; } = null!;
    public int Position { get; set; }
    public int Played { get; set; }
    public int Won { get; set; }
    public int Drawn { get; set; }
    public int Lost { get; set; }
    public int GoalsFor { get; set; }
    public int GoalsAgainst { get; set; }
    public int Points { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}