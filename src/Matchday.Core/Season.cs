namespace Matchday.Core;

/// <summary>Premier League season boundaries. A season runs from 1 August to the following July.</summary>
public static class Season
{
    public const int StartMonth = 8;

    /// <summary>1 August of the season <paramref name="today"/> belongs to: this year from July on, otherwise last year.</summary>
    public static DateOnly StartFor(DateOnly today) =>
        new(today.Month >= StartMonth - 1 ? today.Year : today.Year - 1, StartMonth, 1);
}