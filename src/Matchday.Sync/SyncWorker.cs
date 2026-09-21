using Matchday.Core.Providers;
using Matchday.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Matchday.Sync;

/// <summary>Decides what to fetch and when, based on the state of matches already in the database.</summary>
public sealed class SyncWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<SyncWorker> log) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan FixtureInterval = TimeSpan.FromHours(3);
    private static readonly TimeSpan StandingsInterval = TimeSpan.FromHours(6);
    private static readonly TimeSpan LiveDetailInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan LineupCheckInterval = TimeSpan.FromMinutes(10);

    private DateTimeOffset _lastFixtures = DateTimeOffset.MinValue;
    private DateTimeOffset _lastStandings = DateTimeOffset.MinValue;
    private readonly Dictionary<string, DateTimeOffset> _lastDetail = new();

    private const int FixtureDaysBack = 3;
    private const int FixtureDaysAhead = 21; // covers international breaks and blank weekends

    private sealed record Candidate(
        string ProviderId,
        DateTimeOffset Kickoff,
        MatchStatus Status,
        bool HasLineup,
        DateTimeOffset? DetailSyncedAt);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Tick, clock);
        do
        {
            try
            {
                await RunOnceAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Sync pass failed; will retry next tick");
            }
        }
        while (await timer.WaitForNextTickAsync(ct));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var anyFinished = false;

        // 1. Fixture window. Overlapping days cover ESPN's date buckets not matching UTC.
                if (now - _lastFixtures >= FixtureInterval)
        {
            for (var d = today.AddDays(-FixtureDaysBack); d <= today.AddDays(FixtureDaysAhead); d = d.AddDays(1))
            {
                var day = d;
                anyFinished |= await WithSync(s => s.SyncDayAsync(day, ct));
            }
            _lastFixtures = now;
            log.LogInformation("Fixture window synced ({From} to {To})", today.AddDays(-FixtureDaysBack), today.AddDays(FixtureDaysAhead));
        }

        // 2. Match detail for anything live, about to start, or recently finished.
        List<Candidate> candidates;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MatchdayDbContext>();
            var from = now.AddHours(-6);
            var to = now.AddMinutes(90);
            candidates = await db.Matches.AsNoTracking()
                .Where(m => (m.KickoffUtc >= from && m.KickoffUtc <= to)
                         || (m.Status == MatchStatus.FullTime && m.DetailSyncedAt == null))
                .OrderByDescending(m => m.KickoffUtc)
                .Select(m => new Candidate(m.ProviderId, m.KickoffUtc, m.Status, m.Lineup.Any(), m.DetailSyncedAt))
                .ToListAsync(ct);
        }

                var backfills = 0;
        foreach (var c in candidates)
        {
            if (Due(c, now) is not { } interval) continue;
            if (_lastDetail.TryGetValue(c.ProviderId, out var last) && now - last < interval) continue;
            if (c is { Status: MatchStatus.FullTime, DetailSyncedAt: null } && ++backfills > 5) continue; // throttle backfill

            anyFinished |= await WithSync(s => s.SyncMatchDetailAsync(c.ProviderId, ct));
            _lastDetail[c.ProviderId] = now;
            log.LogInformation("Synced detail for match {MatchId} (was {Status})", c.ProviderId, c.Status);
        }

        // 3. Standings on a schedule, or right after a result.
        if (anyFinished || now - _lastStandings >= StandingsInterval)
        {
            await WithSync(async s => { await s.SyncStandingsAsync(ct); return true; });
            _lastStandings = now;
            log.LogInformation("Standings synced");
        }

        foreach (var stale in _lastDetail.Where(kv => now - kv.Value > TimeSpan.FromDays(1)).Select(kv => kv.Key).ToList())
            _lastDetail.Remove(stale);
    }

    /// <summary>How often this match needs a detail pull right now; null = leave it alone.</summary>
    private static TimeSpan? Due(Candidate c, DateTimeOffset now) => c switch
    {
        { Status: MatchStatus.Live or MatchStatus.HalfTime } => LiveDetailInterval,
        { Status: MatchStatus.Scheduled } when c.Kickoff <= now => LiveDetailInterval,
        { Status: MatchStatus.Scheduled, HasLineup: false } when c.Kickoff - now <= TimeSpan.FromMinutes(75) => LineupCheckInterval,
        { Status: MatchStatus.FullTime, DetailSyncedAt: null } => TimeSpan.Zero,
        { Status: MatchStatus.FullTime } when now >= c.Kickoff.AddHours(4) && c.DetailSyncedAt < c.Kickoff.AddHours(4) => TimeSpan.Zero,
        _ => null
    };

    private async Task<T> WithSync<T>(Func<MatchSyncService, Task<T>> work)
    {
        await using var scope = scopes.CreateAsyncScope();
        return await work(scope.ServiceProvider.GetRequiredService<MatchSyncService>());
    }
}