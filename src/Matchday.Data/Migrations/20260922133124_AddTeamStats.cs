using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Matchday.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTeamStats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AwayStats",
                table: "Matches",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HomeStats",
                table: "Matches",
                type: "jsonb",
                nullable: true);

            // Re-pull finished matches so they pick up team stats (backfill does 5 per tick).
    migrationBuilder.Sql("UPDATE \"Matches\" SET \"DetailSyncedAt\" = NULL WHERE \"Status\" = 'FullTime';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AwayStats",
                table: "Matches");

            migrationBuilder.DropColumn(
                name: "HomeStats",
                table: "Matches");
        }
    }
}
