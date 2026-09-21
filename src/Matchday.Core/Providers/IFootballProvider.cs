namespace Matchday.Core.Providers;

public interface IFootballProvider
{
    /// <summary>All league matches on a single calendar day.</summary>
    Task<IReadOnlyList<MatchSummary>> GetMatchesAsync(DateOnly date, CancellationToken ct = default);

    /// <summary>Score, lineups and events for one match; null if the provider doesn't know it.</summary>
    Task<MatchDetail?> GetMatchDetailAsync(string matchId, CancellationToken ct = default);

    /// <summary>Current league table.</summary>
    Task<IReadOnlyList<StandingRow>> GetStandingsAsync(CancellationToken ct = default);
}
