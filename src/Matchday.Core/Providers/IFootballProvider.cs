namespace Matchday.Core.Providers;

public interface IFootballProvider
{
    /// <summary>All league matches on a single calendar day.</summary>
    Task<IReadOnlyList<MatchSummary>> GetMatchesAsync(DateOnly date, CancellationToken ct = default);

    /// <summary>Score, lineups and events for a match in a given competition (league slug); null if unknown.</summary>
    Task<MatchDetail?> GetMatchDetailAsync(string matchId, string competition, CancellationToken ct = default) =>
        GetMatchDetailAsync(matchId, ct);

    /// <summary>
    /// A club's matches in every competition: upcoming ones (fixtures = true) or results so far.
    /// Each summary carries its competition slug. Empty if the provider doesn't know the team.
    /// </summary>
    Task<IReadOnlyList<MatchSummary>> GetTeamScheduleAsync(string teamId, bool fixtures, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<MatchSummary>>([]);

    /// <summary>Score, lineups and events for one match; null if the provider doesn't know it.</summary>
    Task<MatchDetail?> GetMatchDetailAsync(string matchId, CancellationToken ct = default);

    /// <summary>Current league table.</summary>
    Task<IReadOnlyList<StandingRow>> GetStandingsAsync(CancellationToken ct = default);

    /// <summary>The table for a given competition (league slug); empty if it has none.</summary>
    Task<IReadOnlyList<StandingRow>> GetStandingsAsync(string competition, CancellationToken ct = default) =>
        GetStandingsAsync(ct);

    /// <summary>A club's current squad; empty if the provider doesn't know the team.</summary>
    Task<IReadOnlyList<SquadPlayer>> GetSquadAsync(string teamId, CancellationToken ct = default);

    /// <summary>Recent news, newest first. Pass a team id for one club's feed, null for the whole league.</summary>
    Task<IReadOnlyList<NewsItem>> GetNewsAsync(string? teamId = null, int limit = 50, CancellationToken ct = default);

    /// <summary>A player's club career with league stats per season; null if the provider doesn't know the player.</summary>
    Task<PlayerCareer?> GetPlayerCareerAsync(string playerId, CancellationToken ct = default) =>
        Task.FromResult<PlayerCareer?>(null);
}