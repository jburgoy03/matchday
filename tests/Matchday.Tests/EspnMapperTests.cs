using System.Text.Json;
using Matchday.Core.Providers;
using Matchday.Providers.Espn;

namespace Matchday.Tests;

public class EspnMapperTests
{
    private static JsonElement Load(string file) =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Samples", file))).RootElement;

    [Fact]
    public void Scoreboard_maps_city_sunderland_result()
    {
        var matches = EspnMapper.MapScoreboard(Load("scoreboard-20260920.json"));

        var m = Assert.Single(matches, x => x.ProviderId == "401879272");
        Assert.Equal(MatchStatus.FullTime, m.Status);
        Assert.Equal("Manchester City", m.Home.Name);
        Assert.Equal("Sunderland", m.Away.Name);
        Assert.Equal(5, m.HomeScore);
        Assert.Equal(3, m.AwayScore);
    }

    [Fact]
    public void Summary_maps_score_lineups_and_goals()
    {
        var d = EspnMapper.MapSummary(Load("summary-fulltime.json"), "401879272");

        Assert.NotNull(d);
        Assert.Equal(MatchStatus.FullTime, d.Summary.Status);
        Assert.Equal(5, d.Summary.HomeScore);
        Assert.Equal(3, d.Summary.AwayScore);

        Assert.Equal(2, d.Lineups.Count);
        Assert.All(d.Lineups, l => Assert.Equal(11, l.Players.Count(p => p.Starter)));
        var city = Assert.Single(d.Lineups, l => l.TeamProviderId == d.Summary.Home.ProviderId);
        Assert.Equal("4-2-3-1", city.Formation);

        var goals = d.Events.Where(e => e.Type is MatchEventType.Goal or MatchEventType.PenaltyGoal or MatchEventType.OwnGoal).ToList();
        Assert.Equal(8, goals.Count);
        Assert.Equal("Enzo Fernández", goals[0].Primary?.Name);
        Assert.Equal(9, goals[0].Minute);
        Assert.Equal("Rayan Cherki", goals[2].Primary?.Name);
        Assert.Equal("Antoine Semenyo", goals[2].Secondary?.Name); // assister is second participant

        Assert.Contains(d.Events, e => e.Type == MatchEventType.YellowCard);
        Assert.Contains(d.Events, e => e.Type == MatchEventType.Substitution);
        Assert.DoesNotContain(d.Events, e => e.Type == MatchEventType.Other);
    }

    [Fact]
    public void Summary_maps_team_stats_by_team()
    {
        var d = EspnMapper.MapSummary(Load("summary-fulltime.json"), "401879272");

        Assert.NotNull(d);
        Assert.Equal(2, d.Stats.Count);
        var home = Assert.Single(d.Stats, s => s.TeamProviderId == d.Summary.Home.ProviderId).Values;
        var away = Assert.Single(d.Stats, s => s.TeamProviderId == d.Summary.Away.ProviderId).Values;

        Assert.Equal(55, home["possessionPct"]);
        Assert.Equal(16, home["totalShots"]);
        Assert.Equal(6, home["shotsOnTarget"]);
        Assert.Equal(470, home["totalPasses"]);
        Assert.Equal(403, home["accuratePasses"]);
        Assert.Equal(4, home["saves"]);
        Assert.InRange(home["possessionPct"] + away["possessionPct"], 99, 101);
    }

    [Fact]
    public void Roster_maps_squad_with_positions_and_nationality()
    {
        var squad = EspnMapper.MapRoster(Load("roster-367.json"));

        Assert.Equal(29, squad.Count);
        Assert.All(squad, p => Assert.Contains(p.Player.Position, new[] { "G", "D", "M", "F" }));
        Assert.Equal(squad.Count, squad.Select(p => p.Player.ProviderId).Distinct().Count());

        var dubravka = Assert.Single(squad, p => p.Player.Name == "Martin Dúbravka");
        Assert.Equal("39", dubravka.Player.Jersey);
        Assert.Equal("G", dubravka.Player.Position);
        Assert.Equal(37, dubravka.Age);
        Assert.NotNull(dubravka.Nationality);
    }

    /// <summary>
    /// The feed's contents change daily, so this asserts the shape rather than any one article:
    /// unique ids, newest first, links that leave the site, and the team tags a story is filed under.
    /// </summary>
    [Fact]
    public void News_maps_articles_newest_first_with_team_tags()
    {
        var news = EspnMapper.MapNews(Load("news-eng1.json"));

        Assert.NotEmpty(news);
        Assert.All(news, n => Assert.False(string.IsNullOrWhiteSpace(n.ProviderId)));
        Assert.All(news, n => Assert.False(string.IsNullOrWhiteSpace(n.Headline)));
        Assert.Equal(news.Count, news.Select(n => n.ProviderId).Distinct().Count());
        Assert.Equal(
            news.OrderByDescending(n => n.PublishedUtc).Select(n => n.ProviderId),
            news.Select(n => n.ProviderId));

        Assert.All(news, n => Assert.True(n.WebUrl is null || n.WebUrl.StartsWith("http")));
        Assert.Contains(news, n => n.WebUrl is not null);
        Assert.Contains(news, n => n.ImageUrl is not null);

        Assert.Contains(news, n => n.TeamProviderIds.Count > 0);
        Assert.All(news, n => Assert.Equal(n.TeamProviderIds.Count, n.TeamProviderIds.Distinct().Count()));
    }

    [Fact]
    public void Standings_maps_twenty_teams_in_order()
    {
        var rows = EspnMapper.MapStandings(Load("standings.json"));

        Assert.Equal(20, rows.Count);
        Assert.Equal(Enumerable.Range(1, 20), rows.Select(r => r.Position));
        Assert.All(rows, r => Assert.Equal(r.Played, r.Won + r.Drawn + r.Lost));
    }
}