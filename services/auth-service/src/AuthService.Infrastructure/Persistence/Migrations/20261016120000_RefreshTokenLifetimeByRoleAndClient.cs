using System;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// ADR-012 — refresh-token lifetime by role and client. The session remembers which kind
    /// of client opened it (every existing one was a web session), and the lifetimes live in
    /// a table a platform administrator can change, seeded with the decided defaults.
    /// </summary>
    [DbContext(typeof(AuthDbContext))]
    [Migration("20261016120000_RefreshTokenLifetimeByRoleAndClient")]
    public partial class RefreshTokenLifetimeByRoleAndClient : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "client_type",
                table: "refresh_tokens",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "web");

            migrationBuilder.CreateTable(
                name: "token_lifetime_policies",
                columns: table => new
                {
                    role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    client_type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    refresh_lifetime_hours = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_token_lifetime_policies", x => new { x.role, x.client_type });
                });

            migrationBuilder.InsertData(
                table: "token_lifetime_policies",
                columns: new[] { "role", "client_type", "refresh_lifetime_hours", "updated_at", "updated_by" },
                // Spelled out: a migration written without a designer file carries no target model
                // for EF to read the column types from.
                columnTypes: new[] { "character varying(64)", "character varying(16)", "integer", "timestamp with time zone", "uuid" },
                values: new object[,]
                {
                    { "platform_admin", "web", 12, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "platform_admin", "mobile", 12, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "manager_platform", "web", 24, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "manager_platform", "mobile", 24, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "school_admin", "web", 72, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "school_admin", "mobile", 168, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "teacher", "web", 168, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "teacher", "mobile", 336, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "tutor", "web", 168, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "tutor", "mobile", 336, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "student", "web", 168, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "student", "mobile", 720, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "premium", "web", 168, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { "premium", "mobile", 720, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "token_lifetime_policies");

            migrationBuilder.DropColumn(
                name: "client_type",
                table: "refresh_tokens");
        }
    }
}
