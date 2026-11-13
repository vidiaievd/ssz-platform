using System;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Plan 90 — the platform admin panel. A platform administrator's level (support / admin /
    /// super) and the refresh-token lifetime of the panel's own client, `admin`.
    /// </summary>
    [DbContext(typeof(AuthDbContext))]
    [Migration("20261109120000_AdminLevels")]
    public partial class AdminLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "admin_levels",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    level = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    granted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    granted_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_admin_levels", x => x.user_id);
                    table.ForeignKey(
                        name: "FK_admin_levels_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.CheckConstraint("ck_admin_levels_level", "level IN ('support', 'admin', 'super')");
                });

            migrationBuilder.InsertData(
                table: "token_lifetime_policies",
                columns: new[] { "role", "client_type", "refresh_lifetime_hours", "updated_at", "updated_by" },
                // Spelled out: a migration written without a designer file carries no target model
                // for EF to read the column types from.
                columnTypes: new[] { "character varying(64)", "character varying(16)", "integer", "timestamp with time zone", "uuid" },
                values: new object[] { "platform_admin", "admin", 12, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "token_lifetime_policies",
                keyColumns: new[] { "role", "client_type" },
                keyColumnTypes: new[] { "character varying(64)", "character varying(16)" },
                keyValues: new object[] { "platform_admin", "admin" });

            migrationBuilder.DropTable(name: "admin_levels");
        }
    }
}
