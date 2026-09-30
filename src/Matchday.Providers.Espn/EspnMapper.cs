using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Matchday.Core.Providers;

namespace Matchday.Providers.Espn;

/// <summary>Pure translation from ESPN JSON to provider-neutral records. No I/O, so it's testable against saved files.</summary>
public static partial class EspnMapper
{
    public static IReadOnlyList<MatchSummary> MapScoreboard(JsonElement root) =>
        root.Arr("events")
            .Select(ev => (ev, comp: ev.Arr("competitions").Cast<JsonElement?>().FirstOrDefault()))
            .Where(x => x.comp is not null)
            .Select(x => MapCompetition(x.ev.Str("id") ?? "", x.comp!.Value, x.comp.Value.Str("venue", "fullName")))
            .ToList();

    public static MatchDetail? MapSummary(JsonElement root, string matchId)
    {
        var comp = root.Arr("header", "competitions").Cast<JsonElement?>().FirstOrDefault();
        if (comp is null) return null;

        var summary = MapCompetition(root.Str("header", "id") ?? matchId, comp.Value, root.Str("gameInfo", "venue", "fullName"));
        var lineups = root.Arr("rosters").Select(MapLineup).ToList();
        var events = root.Arr("keyEvents").Select(MapEvent).OfType<MatchEvent>().ToList();
        var stats = root.Arr("boxscore", "teams")
            .Select(MapTeamStats)
            .Where(s => s.TeamProviderId != "" && s.Values.Count > 0)
            .ToList();
        return new MatchDetail(summary, lineups, events, stats);
    }

    public static IReadOnlyList<StandingRow> MapStandings(JsonElement root) =>
        root.Arr("children")
            .SelectMany(c => c.Arr("standings", "entries"))
            .Select(en =>
            {
                var stats = en.Arr("stats")
                    .Where(s => s.Str("name") is not null)
                    .GroupBy(s => s.Str("name")!)
                    .ToDictionary(g => g.Key, g => g.First().Int("value") ?? 0);
                int S(string k) => stats.GetValueOrDefault(k);
                return new StandingRow(S("rank"), MapTeam(en.Get("team")!.Value),
                    S("gamesPlayed"), S("wins"), S("ties"), S("losses"),
                    S("pointsFor"), S("pointsAgainst"), S("points"));
            })
            .OrderBy(r => r.Position)
            .ToList();

    /// <summary>teams/{id}/roster → the current squad. Players without an id are skipped.</summary>
    public static IReadOnlyList<SquadPlayer> MapRoster(JsonElement root) =>
        root.Arr("athletes")
            .Select(a => new SquadPlayer(
                new PlayerRef(
                    a.Str("id") ?? "",
                    a.Str("displayName") ?? "",
                    a.Str("jersey"),
                    a.Str("position", "abbreviation")),
                a.Int("age"),
                a.Str("citizenship"),
                a.Str("flag", "href")))
            .Where(p => p.Player.ProviderId != "")
            .DistinctBy(p => p.Player.ProviderId)
            .ToList();

    /// <summary>
    /// news → articles, newest first. The photo is the widest header image, else the widest with a url.
    /// categories[] of type "team" is what files a story under a club; ids for clubs outside this
    /// league come through too and are dropped later, when they fail to match a team we know.
    /// Articles with no id, headline or date are skipped.
    /// </summary>
    public static IReadOnlyList<NewsItem> MapNews(JsonElement root) =>
        root.Arr("articles")
            .Select(MapArticle)
            .OfType<NewsItem>()
            .DistinctBy(n => n.ProviderId)
            .OrderByDescending(n => n.PublishedUtc)
            .ToList();

    private static NewsItem? MapArticle(JsonElement a)
    {
        var id = a.Str("id");
        var headline = a.Str("headline");
        var published = ParseDateOrNull(a.Str("published") ?? a.Str("lastModified"));
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(headline) || published is null) return null;

        var images = a.Arr("images")
            .Where(i => i.Str("url") is not null)
            .OrderByDescending(i => i.Str("type") == "header")
            .ThenByDescending(i => i.Int("width") ?? 0)
            .ToList();

        var teams = a.Arr("categories")
            .Where(c => c.Str("type") == "team")
            .Select(c => c.Int("teamId")?.ToString(CultureInfo.InvariantCulture) ?? c.Str("team", "id"))
            .Where(t => !string.IsNullOrEmpty(t))
            .Select(t => t!)
            .Distinct()
            .ToList();

        return new NewsItem(
            id,
            headline,
            a.Str("description"),
            a.Str("byline"),
            published.Value,
            a.Str("type"),
            a.Bool("premium"),
            images.Count > 0 ? images[0].Str("url") : null,
            images.Count > 0 ? images[0].Str("credit") : null,
            a.Str("links", "web", "href"),
            teams);
    }

    /// <summary>teams/{id}/schedule (league "all") → one summary per match, each tagged with its competition slug.</summary>
    public static IReadOnlyList<MatchSummary> MapTeamSchedule(JsonElement root) =>
        root.Arr("events")
            .Where(e => e.Str("id") is not null && e.Arr("competitions").Any())
            .Select(e =>
            {
                var comp = e.Arr("competitions").First();
                return MapCompetition(e.Str("id")!, comp, comp.Str("venue", "fullName")) with { Competition = e.Str("league", "slug") };
            })
            .ToList();

    private static MatchSummary MapCompetition(string id, JsonElement comp, string? venue)
    {
        var competitors = comp.Arr("competitors").ToList();
        var home = competitors.First(c => c.Str("homeAway") == "home");
        var away = competitors.First(c => c.Str("homeAway") == "away");
        var status = MapStatus(comp.Str("status", "type", "name"), comp.Str("status", "type", "state"));
        var hasScore = status is MatchStatus.Live or MatchStatus.HalfTime or MatchStatus.FullTime;

        return new MatchSummary(
            id,
            ParseDate(comp.Str("date")),
            status,
            comp.Str("status", "displayClock"),
            MapTeam(home.Get("team")!.Value),
            MapTeam(away.Get("team")!.Value),
            hasScore ? Score(home) : null,
            hasScore ? Score(away) : null,
            venue);
    }

    private static int? Score(JsonElement competitor) => competitor.Int("score") ?? competitor.Int("score", "value");

    internal static MatchStatus MapStatus(string? name, string? state) => (name, state) switch
    {
        ("STATUS_POSTPONED", _) => MatchStatus.Postponed,
        ("STATUS_CANCELED" or "STATUS_CANCELLED" or "STATUS_ABANDONED", _) => MatchStatus.Cancelled,
        ("STATUS_HALFTIME", _) => MatchStatus.HalfTime,
        (_, "pre") => MatchStatus.Scheduled,
        (_, "in") => MatchStatus.Live,
        (_, "post") => MatchStatus.FullTime,
        _ => MatchStatus.Unknown
    };

    // The scoreboard and summary team objects carry color / alternateColor; standings don't, so
    // those come through as null and the sync keeps whatever it already has.
    private static TeamRef MapTeam(JsonElement t) => new(
        t.Str("id") ?? "",
        t.Str("displayName") ?? t.Str("name") ?? "",
        t.Str("shortDisplayName") ?? t.Str("displayName") ?? "",
        t.Str("abbreviation") ?? "",
        t.Str("logo") ?? t.Arr("logos").Select(l => l.Str("href")).FirstOrDefault(),
        Hex(t.Str("color")),
        Hex(t.Str("alternateColor")));

    /// <summary>"99C5EA" or "#99c5ea" → "99c5ea"; anything else → null.</summary>
    internal static string? Hex(string? value)
    {
        var v = value?.Trim().TrimStart('#').ToLowerInvariant();
        return v is { Length: 6 } && v.All(Uri.IsHexDigit) ? v : null;
    }

    private static TeamLineup MapLineup(JsonElement r) => new(
        r.Str("team", "id") ?? "",
        r.Str("formation"),
        r.Arr("roster").Select(p => new LineupPlayer(
            new PlayerRef(
                p.Str("athlete", "id") ?? "",
                p.Str("athlete", "displayName") ?? "",
                p.Str("jersey"),
                p.Str("position", "abbreviation")),
            p.Bool("starter"),
            p.Int("formationPlace") is > 0 and var fp ? fp : null)).ToList());

    /// <summary>
    /// boxscore.teams[] → name/number map. Matched to a side by team id, not array position.
    /// Values come from displayValue ("55", "0.4"); anything non-numeric is skipped.
    /// </summary>
    private static TeamStats MapTeamStats(JsonElement t) => new(
        t.Str("team", "id") ?? "",
        t.Arr("statistics")
            .Select(s => (Name: s.Str("name"), Value: ParseStat(s.Str("displayValue"))))
            .Where(x => x.Name is not null && x.Value is not null)
            .GroupBy(x => x.Name!)
            .ToDictionary(g => g.Key, g => g.First().Value!.Value));

    private static double? ParseStat(string? s) =>
        double.TryParse(s?.Trim().TrimEnd('%'), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    private static MatchEvent? MapEvent(JsonElement e)
    {
        var type = MapEventType(e.Str("type", "type")) ?? (e.Bool("scoringPlay") ? MatchEventType.Goal : null);
        if (type is null) return null;

        var people = e.Arr("participants")
            .Select(p => new PlayerRef(p.Str("athlete", "id") ?? "", p.Str("athlete", "displayName") ?? "", null, null))
            .ToList();
        var clock = e.Str("clock", "displayValue") ?? "";

        return new MatchEvent(type.Value, ParseMinute(clock, e.Int("clock", "value")), clock,
            e.Str("team", "id"), people.ElementAtOrDefault(0), people.ElementAtOrDefault(1), e.Str("text"));
    }

    internal static MatchEventType? MapEventType(string? slug) => slug switch
    {
        null => null,
        _ when slug.StartsWith("own-goal") => MatchEventType.OwnGoal,
        _ when slug.StartsWith("goal") && slug.Contains("penalty") => MatchEventType.PenaltyGoal,
        _ when slug.StartsWith("penalty") && slug.Contains("scored") => MatchEventType.PenaltyGoal,
        _ when slug.StartsWith("goal") => MatchEventType.Goal,
        "yellow-card" => MatchEventType.YellowCard,
        "red-card" or "second-yellow-card" or "yellow-red-card" => MatchEventType.RedCard,
        "substitution" => MatchEventType.Substitution,
        _ => null
    };

    [GeneratedRegex(@"^\s*(\d+)")]
    private static partial Regex LeadingNumber();

    private static int? ParseMinute(string display, int? seconds)
    {
        var m = LeadingNumber().Match(display);
        if (m.Success) return int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        return seconds is { } s ? (int)Math.Ceiling(s / 60.0) : null;
    }

    private static DateTimeOffset? ParseDateOrNull(string? s) =>
        DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var v) ? v : null;

    private static DateTimeOffset ParseDate(string? s) =>
        DateTimeOffset.Parse(s ?? throw new FormatException("Missing match date"),
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
}