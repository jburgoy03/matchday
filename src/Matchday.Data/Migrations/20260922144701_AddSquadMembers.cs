using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Matchday.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSquadMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SquadMembers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TeamId = table.Column<int>(type: "integer", nullable: false),
                    PlayerId = table.Column<int>(type: "integer", nullable: false),
                    Jersey = table.Column<string>(type: "text", nullable: true),
                    Position = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    Age = table.Column<int>(type: "integer", nullable: true),
                    Nationality = table.Column<string>(type: "text", nullable: true),
                    FlagUrl = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SquadMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SquadMembers_Players_PlayerId",
                        column: x => x.PlayerId,
                        principalTable: "Players",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SquadMembers_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SquadMembers_PlayerId",
                table: "SquadMembers",
                column: "PlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_SquadMembers_TeamId_PlayerId",
                table: "SquadMembers",
                columns: new[] { "TeamId", "PlayerId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SquadMembers");
        }
    }
}
