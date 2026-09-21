using Matchday.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Matchday.Data;

public class MatchdayDbContext(DbContextOptions<MatchdayDbContext> options) : DbContext(options)
{
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<LineupEntry> LineupEntries => Set<LineupEntry>();
    public DbSet<MatchIncident> Incidents => Set<MatchIncident>();
    public DbSet<StandingEntry> Standings => Set<StandingEntry>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Team>(e => e.HasIndex(x => x.ProviderId).IsUnique());
        b.Entity<Player>(e => e.HasIndex(x => x.ProviderId).IsUnique());

        b.Entity<Match>(e =>
        {
            e.HasIndex(x => x.ProviderId).IsUnique();
            e.HasIndex(x => x.KickoffUtc);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
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

        b.Entity<StandingEntry>(e =>
        {
            e.HasIndex(x => x.TeamId).IsUnique();
            e.HasOne(x => x.Team).WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}