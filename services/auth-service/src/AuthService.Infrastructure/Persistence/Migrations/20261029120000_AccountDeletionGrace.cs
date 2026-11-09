using System;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Account deletion with a 30-day grace period (VoxOrd plan 07, step 3b): when the user asked,
    /// and a partial index over the few rows the purge reads.
    /// </summary>
    [DbContext(typeof(AuthDbContext))]
    [Migration("20261029120000_AccountDeletionGrace")]
    public partial class AccountDeletionGrace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deletion_requested_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_deletion_requested_at",
                table: "users",
                column: "deletion_requested_at",
                filter: "deletion_requested_at IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_users_deletion_requested_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "deletion_requested_at",
                table: "users");
        }
    }
}
