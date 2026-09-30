using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Matchday.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCompetitions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Standings_TeamId",
                table: "Standings");

            migrationBuilder.AddColumn<string>(
                name: "Competition",
                table: "Standings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "eng.1");

            migrationBuilder.AddColumn<string>(
                name: "Competition",
                table: "Matches",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "eng.1");

            migrationBuilder.CreateIndex(
                name: "IX_Standings_Competition_TeamId",
                table: "Standings",
                columns: new[] { "Competition", "TeamId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Standings_TeamId",
                table: "Standings",
                column: "TeamId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Standings_Competition_TeamId",
                table: "Standings");

            migrationBuilder.DropIndex(
                name: "IX_Standings_TeamId",
                table: "Standings");

            migrationBuilder.DropColumn(
                name: "Competition",
                table: "Standings");

            migrationBuilder.DropColumn(
                name: "Competition",
                table: "Matches");

            migrationBuilder.CreateIndex(
                name: "IX_Standings_TeamId",
                table: "Standings",
                column: "TeamId",
                unique: true);
        }
    }
}
