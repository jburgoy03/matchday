using System.Text.Json;
using Matchday.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Matchday.Data;

public class MatchdayDbContext(DbContextOptions<MatchdayDbContext> options) : DbContext(options)
{
    // Team stats are stored as jsonb: {"possessionPct": 55, "totalShots": 16, ...}
    private static readonly ValueConverter<Dictionary<string, double>, string> StatsConverter = new(
        v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
        s => JsonSerializer.Deserialize<Dictionary<string, double>>(s, (JsonSerializerOptions?)null)!);

    private static readonly ValueComparer<Dictionary<string, double>> StatsComparer = new(
        (a, b) => a!.Count == b!.Count && !a.Except(b).Any(),
        d => d.Aggregate(0, (h, kv) => HashCode.Combine(h, kv.Key.GetHashCode(), kv.Value.GetHashCode())),
        d => new Dictionary<string, double>(d));

    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<LineupEntry> LineupEntries => Set<LineupEntry>();
    public DbSet<MatchIncident> Incidents => Set<MatchIncident>();
    public DbSet<StandingEntry> Standings => Set<StandingEntry>();
    public DbSet<SyncState> SyncStates => Set<SyncState>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Team>(e => e.HasIndex(x => x.ProviderId).IsUnique());
        b.Entity<Player>(e => e.HasIndex(x => x.ProviderId).IsUnique());

        b.Entity<Match>(e =>
        {
            e.HasIndex(x => x.ProviderId).IsUnique();
            e.HasIndex(x => x.KickoffUtc);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.HomeStats).HasColumnType("jsonb").HasConversion(StatsConverter, StatsComparer);
            e.Property(x => x.AwayStats).HasColumnType("jsonb").HasConversion(StatsConverter, StatsComparer);
            e.HasOne(x => x.HomeTeam).WithMany().HasForeignKey(x => x.HomeTeamId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AwayTeam).WithMany().HasForeignKey(x => x.AwayTeamId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Lineup).WithOne().HasForeignKey(x => x.MatchId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Incidents).WithOne().HasForeignKey(x => x.MatchId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<LineupEntry>(e =>
        {
            e.HasIndex(x => new { x.MatchId, x.PlayerId }).IsUnique();
            e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<MatchIncident>(e =>
        {
            e.HasIndex(x => new { x.MatchId, x.Sequence }).IsUnique();
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.HasOne(x => x.PrimaryPlayer).WithMany().HasForeignKey(x => x.PrimaryPlayerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SecondaryPlayer).WithMany().HasForeignKey(x => x.SecondaryPlayerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<SyncState>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(64);
        });

        b.Entity<StandingEntry>(e =>
        {
            e.HasIndex(x => x.TeamId).IsUnique();
            e.HasOne(x => x.Team).WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}