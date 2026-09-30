using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Matchday.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTeamColours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AlternateColor",
                table: "Teams",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "Teams",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AlternateColor",
                table: "Teams");

            migrationBuilder.DropColumn(
                name: "Color",
                table: "Teams");
        }
    }
}
