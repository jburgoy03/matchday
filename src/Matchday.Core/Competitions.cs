namespace Matchday.Core;

/// <summary>
/// The competitions the site follows, by the provider's league slug. Every one has its own matches
/// and season leaders on the matches page; the ones in <see cref="WithTables"/> also have a table.
/// Squad and team season stats stay Premier League only. Friendlies and anything not listed here are ignored.
/// </summary>
public static class Competitions
{
    public const string PremierLeague = "eng.1";

    /// <summary>Slug → (full name, short label for match rows).</summary>
    public static readonly IReadOnlyDictionary<string, (string Name, string Short)> Followed =
        new Dictionary<string, (string, string)>
        {
            [PremierLeague] = ("Premier League", "PL"),
            ["uefa.champions"] = ("Champions League", "UCL"),
            ["uefa.europa"] = ("Europa League", "UEL"),
            ["uefa.europa.conf"] = ("Conference League", "UECL"),
            ["eng.fa"] = ("FA Cup", "FA Cup"),
            ["eng.league_cup"] = ("League Cup", "League Cup"),
            ["eng.charity"] = ("Community Shield", "Shield"),
        };

    public static bool IsFollowed(string? slug) => slug is not null && Followed.ContainsKey(slug);

    /// <summary>Competitions with a league table: the Premier League and the three UEFA league phases.</summary>
    public static readonly IReadOnlyList<string> WithTables = [PremierLeague, "uefa.champions", "uefa.europa", "uefa.europa.conf"];
}
