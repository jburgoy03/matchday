using Matchday.Core.Providers;
using Matchday.Data;
using Matchday.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Matchday.Sync;

/// <summary>Writes provider data into the database. One instance per scope, so one DbContext per sync call.</summary>
public sealed class MatchSyncService(
    MatchdayDbContext db,
    IFootballProvider provider,
    TimeProvider clock,
    ILogger<MatchSyncService> log)
{
    /// <summary>Upserts every match on one day. Returns true if any match newly reached full time.</summary>
    public async Task<bool> SyncDayAsync(DateOnly date, CancellationToken ct)
    {
        var summaries = await provider.GetMatchesAsync(date, ct);
        var anyFinished = false;
        foreach (var s in summaries)
            anyFinished |= (await UpsertMatchAsync(s, ct)).BecameFinished;
        await db.SaveChangesAsync(ct);
        return anyFinished;
    }

    /// <summary>Refreshes score, lineups and incidents for one match. Returns true if it newly reached full time.</summary>
    public async Task<bool> SyncMatchDetailAsync(string providerId, CancellationToken ct)
    {
        var detail = await provider.GetMatchDetailAsync(providerId, ct);
        if (detail is null)
        {
            log.LogWarning("Provider has no detail for match {MatchId}", providerId);
            return false;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var (match, becameFinished) = await UpsertMatchAsync(detail.Summary, ct);

        var playerRefs = detail.Lineups.SelectMany(l => l.Players.Select(p => p.Player))
            .Concat(detail.Events.SelectMany(e => new[] { e.Primary, e.Secondary }).OfType<PlayerRef>())
            .Where(p => p.ProviderId != "")
            .DistinctBy(p => p.ProviderId)
            .ToList();
        var players = new Dictionary<string, Player>();
        foreach (var p in playerRefs)
            players[p.ProviderId] = await UpsertPlayerAsync(p, ct);

        await db.SaveChangesAsync(ct); // assigns ids to any new match/teams/players

        await db.LineupEntries.Where(l => l.MatchId == match.Id).ExecuteDeleteAsync(ct);
        await db.Incidents.Where(i => i.MatchId == match.Id).ExecuteDeleteAsync(ct);

        var teamIds = new Dictionary<string, int>
        {
            [detail.Summary.Home.ProviderId] = match.HomeTeamId,
            [detail.Summary.Away.ProviderId] = match.AwayTeamId
        };
        int? PlayerId(PlayerRef? p) => p is not null && players.TryGetValue(p.ProviderId, out var pl) ? pl.Id : null;
        int? TeamId(string? providerTeamId) => providerTeamId is not null && teamIds.TryGetValue(providerTeamId, out var t) ? t : null;

        foreach (var lineup in detail.Lineups)
        {
            if (TeamId(lineup.TeamProviderId) is not { } teamId) continue;

            if (teamId == match.HomeTeamId) match.HomeFormation = lineup.Formation;
            else match.AwayFormation = lineup.Formation;

            foreach (var lp in lineup.Players.DistinctBy(p => p.Player.ProviderId))
            {
                if (PlayerId(lp.Player) is not { } playerId) continue;
                db.LineupEntries.Add(new LineupEntry
                {
                    MatchId = match.Id,
                    TeamId = teamId,
                    PlayerId = playerId,
                    Jersey = lp.Player.Jersey,
                    Position = lp.Player.Position,
                    Starter = lp.Starter,
                    FormationPlace = lp.FormationPlace
                });
            }
        }

        // Team stats: only overwrite when the provider sent some, so a thin response can't blank them.
        foreach (var s in detail.Stats)
        {
            var values = new Dictionary<string, double>(s.Values);
            if (s.TeamProviderId == detail.Summary.Home.ProviderId) match.HomeStats = values;
            else if (s.TeamProviderId == detail.Summary.Away.ProviderId) match.AwayStats = values;
        }

        var sequence = 0;
        foreach (var e in detail.Events)
        {
            db.Incidents.Add(new MatchIncident
            {
                MatchId = match.Id,
                Sequence = sequence++,
                Type = e.Type,
                Minute = e.Minute,
                ClockDisplay = e.ClockDisplay,
                TeamId = TeamId(e.TeamProviderId),
                PrimaryPlayerId = PlayerId(e.Primary),
                SecondaryPlayerId = PlayerId(e.Secondary),
                Detail = e.Detail
            });
        }

        match.DetailSyncedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return becameFinished;
    }

    public async Task SyncStandingsAsync(CancellationToken ct)
    {
        var rows = await provider.GetStandingsAsync(ct);
        if (rows.Count == 0) return;

        var now = clock.GetUtcNow();
        foreach (var r in rows)
        {
            var team = await UpsertTeamAsync(r.Team, ct);
            var entry = team.Id == 0 ? null : await db.Standings.FirstOrDefaultAsync(s => s.TeamId == team.Id, ct);
            if (entry is null)
            {
                entry = new StandingEntry { Team = team };
                db.Standings.Add(entry);
            }
            entry.Position = r.Position;
            entry.Played = r.Played;
            entry.Won = r.Won;
            entry.Drawn = r.Drawn;
            entry.Lost = r.Lost;
            entry.GoalsFor = r.GoalsFor;
            entry.GoalsAgainst = r.GoalsAgainst;
            entry.Points = r.Points;
            entry.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct);

        // Drop teams no longer in the table (relegated at season rollover).
        var current = rows.Select(r => r.Team.ProviderId).ToList();
        await db.Standings.Where(s => !current.Contains(s.Team.ProviderId)).ExecuteDeleteAsync(ct);
    }

    private async Task<(Match Match, bool BecameFinished)> UpsertMatchAsync(MatchSummary s, CancellationToken ct)
    {
        var home = await UpsertTeamAsync(s.Home, ct);
        var away = await UpsertTeamAsync(s.Away, ct);

        var match = db.Matches.Local.FirstOrDefault(m => m.ProviderId == s.ProviderId)
                    ?? await db.Matches.FirstOrDefaultAsync(m => m.ProviderId == s.ProviderId, ct);
        var wasFinished = match?.Status == MatchStatus.FullTime;

        if (match is null)
        {
            match = new Match { ProviderId = s.ProviderId };
            db.Matches.Add(match);
        }

        match.KickoffUtc = s.KickoffUtc;
        match.Status = s.Status;
        match.ClockDisplay = s.ClockDisplay;
        match.HomeTeam = home;
        match.AwayTeam = away;
        match.HomeScore = s.HomeScore;
        match.AwayScore = s.AwayScore;
        match.Venue = s.Venue ?? match.Venue;
        match.UpdatedAt = clock.GetUtcNow();

        return (match, !wasFinished && s.Status == MatchStatus.FullTime);
    }

    private async Task<Team> UpsertTeamAsync(TeamRef r, CancellationToken ct)
    {
        var team = db.Teams.Local.FirstOrDefault(t => t.ProviderId == r.ProviderId)
                   ?? await db.Teams.FirstOrDefaultAsync(t => t.ProviderId == r.ProviderId, ct);
        if (team is null)
        {
            team = new Team
            {
                ProviderId = r.ProviderId,
                Name = r.Name,
                ShortName = r.ShortName,
                Abbreviation = r.Abbreviation,
                LogoUrl = r.LogoUrl
            };
            db.Teams.Add(team);
        }
        else
        {
            team.Name = r.Name;
            team.ShortName = r.ShortName;
            team.Abbreviation = r.Abbreviation;
            team.LogoUrl = r.LogoUrl ?? team.LogoUrl;
        }
        return team;
    }

    private async Task<Player> UpsertPlayerAsync(PlayerRef r, CancellationToken ct)
    {
        var player = db.Players.Local.FirstOrDefault(p => p.ProviderId == r.ProviderId)
                     ?? await db.Players.FirstOrDefaultAsync(p => p.ProviderId == r.ProviderId, ct);
        if (player is null)
        {
            player = new Player { ProviderId = r.ProviderId, Name = r.Name };
            db.Players.Add(player);
        }
        else if (r.Name != "")
        {
            player.Name = r.Name;
        }
        return player;
    }
}