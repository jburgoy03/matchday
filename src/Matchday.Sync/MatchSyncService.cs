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
    /// <summary>How long a news article is kept before it's pruned.</summary>
    private static readonly TimeSpan NewsRetention = TimeSpan.FromDays(45);

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

    /// <summary>Replaces one club's squad with the provider's current roster. Returns the number of players stored.</summary>
    public async Task<int> SyncSquadAsync(string teamProviderId, CancellationToken ct)
    {
        var team = await db.Teams.FirstOrDefaultAsync(t => t.ProviderId == teamProviderId, ct);
        if (team is null) return 0;

        var squad = await provider.GetSquadAsync(teamProviderId, ct);
        if (squad.Count == 0)
        {
            // An empty or failed roster keeps the squad we have rather than wiping it.
            log.LogWarning("Provider returned no squad for team {TeamId}", teamProviderId);
            return 0;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var players = new Dictionary<string, Player>();
        foreach (var p in squad)
            players[p.Player.ProviderId] = await UpsertPlayerAsync(p.Player, ct);
        await db.SaveChangesAsync(ct); // assigns ids to new players

        await db.SquadMembers.Where(s => s.TeamId == team.Id).ExecuteDeleteAsync(ct);

        var now = clock.GetUtcNow();
        foreach (var p in squad)
        {
            db.SquadMembers.Add(new SquadMember
            {
                TeamId = team.Id,
                PlayerId = players[p.Player.ProviderId].Id,
                Jersey = p.Player.Jersey,
                Position = p.Player.Position,
                Age = p.Age,
                Nationality = p.Nationality,
                FlagUrl = p.FlagUrl,
                UpdatedAt = now
            });
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return squad.Count;
    }

    /// <summary>
    /// Upserts the provider's latest news and re-tags each article with the clubs it mentions.
    /// Tags for clubs outside this league are dropped, because they match no team we store.
    /// Articles past NewsRetention are pruned in the same pass, so the table can't grow forever.
    /// Returns the number of articles the provider sent.
    /// </summary>
    public async Task<int> SyncNewsAsync(string? teamProviderId, int limit, CancellationToken ct)
    {
        var items = await provider.GetNewsAsync(teamProviderId, limit, ct);
        if (items.Count == 0)
        {
            log.LogWarning("Provider returned no news for {Feed}", teamProviderId ?? "the league");
            return 0;
        }

        var now = clock.GetUtcNow();
        var providerIds = items.Select(i => i.ProviderId).ToList();
        var existing = await db.NewsArticles
            .Include(a => a.Teams)
            .Where(a => providerIds.Contains(a.ProviderId))
            .ToDictionaryAsync(a => a.ProviderId, ct);

        var taggedIds = items.SelectMany(i => i.TeamProviderIds).Distinct().ToList();
        var teams = await db.Teams
            .Where(t => taggedIds.Contains(t.ProviderId))
            .ToDictionaryAsync(t => t.ProviderId, t => t.Id, ct);

        foreach (var i in items)
        {
            if (!existing.TryGetValue(i.ProviderId, out var article))
            {
                article = new NewsArticle { ProviderId = i.ProviderId, Headline = i.Headline };
                db.NewsArticles.Add(article);
            }

            article.Headline = i.Headline;
            article.Description = i.Description;
            article.Byline = i.Byline;
            article.PublishedUtc = i.PublishedUtc;
            article.Type = i.Type;
            article.Premium = i.Premium;
            article.ImageUrl = i.ImageUrl;
            article.ImageCredit = i.ImageCredit;
            article.WebUrl = i.WebUrl;
            article.UpdatedAt = now;

            // Re-tagging rather than appending, so a corrected article loses the clubs it no longer mentions.
            var wanted = i.TeamProviderIds
                .Select(t => teams.TryGetValue(t, out var id) ? id : 0)
                .Where(id => id != 0)
                .Distinct()
                .ToList();

            article.Teams.RemoveAll(t => !wanted.Contains(t.TeamId));
            foreach (var teamId in wanted.Where(id => article.Teams.All(t => t.TeamId != id)))
                article.Teams.Add(new NewsArticleTeam { TeamId = teamId });
        }

        await db.SaveChangesAsync(ct);

        var cutoff = now - NewsRetention;
        await db.NewsArticles.Where(a => a.PublishedUtc < cutoff).ExecuteDeleteAsync(ct);
        return items.Count;
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