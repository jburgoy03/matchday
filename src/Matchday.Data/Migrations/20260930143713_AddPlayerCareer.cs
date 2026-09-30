using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Matchday.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerCareer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CareerJson",
                table: "Players",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CareerSyncedAt",
                table: "Players",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CareerJson",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "CareerSyncedAt",
                table: "Players");
        }
    }
}
