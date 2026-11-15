using System;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// A block set by a platform administrator (plan 90, phase 6, step 1): when, by whom and why.
    /// Kept apart from the lockout after failed sign-ins (`is_locked` / `locked_until`), which a
    /// correct password clears.
    /// </summary>
    [DbContext(typeof(AuthDbContext))]
    [Migration("20261115120000_AdminUserBlock")]
    public partial class AdminUserBlock : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "blocked_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "blocked_by",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "block_reason",
                table: "users",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "block_reason", table: "users");
            migrationBuilder.DropColumn(name: "blocked_by", table: "users");
            migrationBuilder.DropColumn(name: "blocked_at", table: "users");
        }
    }
}
