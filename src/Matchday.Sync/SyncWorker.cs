using System.Globalization;
using Matchday.Core;
using Matchday.Core.Providers;
using Matchday.Data;
using Matchday.Data.Entities;
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
    private static readonly TimeSpan SquadInterval = TimeSpan.FromHours(24);

    private DateTimeOffset _lastFixtures = DateTimeOffset.MinValue;
    private DateTimeOffset _lastStandings = DateTimeOffset.MinValue;
    private readonly Dictionary<string, DateTimeOffset> _lastDetail = new();

    private const int FixtureDaysBack = 3;
    private const int FixtureDaysAhead = 21; // covers international breaks and blank weekends

    // Season backfill: walks from the season start up to the fixture window, a few days per tick.
    // Progress is stored in SyncStates so a restart or deploy doesn't rescan the season.
    private const int BackfillDaysPerTick = 3;
    private const string BackfillKey = "season-backfill-through";
    private DateOnly? _backfilledThrough;
    private bool _backfillMarkLoaded;

    // Squads: every club's roster once a day. The last run is stored in SyncStates so deploys don't refetch.
    private const string SquadsKey = "squads-synced-at";
    private DateTimeOffset? _squadsSyncedAt;
    private bool _squadsMarkLoaded;

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

        // 2. Season backfill: earlier matches this season, a few days per tick until caught up.
        anyFinished |= await BackfillSeasonAsync(today, now, ct);

        // 3. Match detail for anything live, about to start, recently finished, or never detail-synced.
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

        // 4. Standings on a schedule, or right after a result.
        if (anyFinished || now - _lastStandings >= StandingsInterval)
        {
            await WithSync(async s => { await s.SyncStandingsAsync(ct); return true; });
            _lastStandings = now;
            log.LogInformation("Standings synced");
        }

        // 5. Squads, once a day.
        await SyncSquadsIfDueAsync(now, ct);

        foreach (var stale in _lastDetail.Where(kv => now - kv.Value > TimeSpan.FromDays(1)).Select(kv => kv.Key).ToList())
            _lastDetail.Remove(stale);
    }

    /// <summary>
    /// Pulls scoreboards from the season start up to the day before the fixture window, BackfillDaysPerTick per call.
    /// New finished matches come in with DetailSyncedAt null, so the detail backfill fills their lineups and stats.
    /// Returns true if any match newly reached full time (i.e. new results were inserted).
    /// </summary>
    private async Task<bool> BackfillSeasonAsync(DateOnly today, DateTimeOffset now, CancellationToken ct)
    {
        if (!_backfillMarkLoaded)
        {
            _backfilledThrough = DateOnly.TryParseExact(await ReadStateAsync(BackfillKey, ct), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var mark) ? mark : null;
            _backfillMarkLoaded = true;
        }

        var seasonStart = Season.StartFor(today);
        var target = today.AddDays(-FixtureDaysBack - 1); // the fixture window covers everything after this
        var from = _backfilledThrough is { } done && done >= seasonStart ? done.AddDays(1) : seasonStart;
        if (from > target) return false;

        var until = from.AddDays(BackfillDaysPerTick - 1);
        if (until > target) until = target;

        var anyFinished = false;
        for (var d = from; d <= until; d = d.AddDays(1))
        {
            var day = d;
            anyFinished |= await WithSync(s => s.SyncDayAsync(day, ct));
        }

        await WriteStateAsync(BackfillKey, until.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), now, ct);
        _backfilledThrough = until;
        log.LogInformation(until == target
            ? "Season backfill complete ({From} to {Until})"
            : "Season backfill synced {From} to {Until}", from, until);
        return anyFinished;
    }

    /// <summary>Refreshes every club in the table once per SquadInterval. A failure for one club doesn't stop the rest.</summary>
    private async Task SyncSquadsIfDueAsync(DateTimeOffset now, CancellationToken ct)
    {
        if (!_squadsMarkLoaded)
        {
            _squadsSyncedAt = DateTimeOffset.TryParse(await ReadStateAsync(SquadsKey, ct), CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal, out var at) ? at : null;
            _squadsMarkLoaded = true;
        }
        if (_squadsSyncedAt is { } last && now - last < SquadInterval) return;

        List<string> teamIds;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MatchdayDbContext>();
            teamIds = await db.Standings.AsNoTracking().OrderBy(s => s.Position).Select(s => s.Team.ProviderId).ToListAsync(ct);
        }
        if (teamIds.Count == 0) return; // standings not synced yet; try next tick

        var players = 0;
        foreach (var teamId in teamIds)
        {
            try
            {
                players += await WithSync(s => s.SyncSquadAsync(teamId, ct));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "Squad sync failed for team {TeamId}", teamId);
            }
        }

        await WriteStateAsync(SquadsKey, now.ToString("O", CultureInfo.InvariantCulture), now, ct);
        _squadsSyncedAt = now;
        log.LogInformation("Squads synced ({Teams} clubs, {Players} players)", teamIds.Count, players);
    }

    private async Task<string?> ReadStateAsync(string key, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MatchdayDbContext>();
        return await db.SyncStates.AsNoTracking().Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(ct);
    }

    private async Task WriteStateAsync(string key, string value, DateTimeOffset now, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MatchdayDbContext>();
        var row = await db.SyncStates.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row is null)
        {
            row = new SyncState { Key = key, Value = value };
            db.SyncStates.Add(row);
        }
        row.Value = value;
        row.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
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