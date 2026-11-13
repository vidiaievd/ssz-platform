using System;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Plan 90 — the admin trail of auth-service: who changed which administrator, at which
    /// level, why, and the object before and after.
    /// </summary>
    [DbContext(typeof(AuthDbContext))]
    [Migration("20261109130000_AdminAudit")]
    public partial class AdminAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "admin_audit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    actor_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_level = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    target_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    target_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    before = table.Column<string>(type: "jsonb", nullable: true),
                    after = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_admin_audit", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_admin_audit_occurred_at",
                table: "admin_audit",
                column: "occurred_at");

            migrationBuilder.CreateIndex(
                name: "ix_admin_audit_target",
                table: "admin_audit",
                columns: new[] { "target_type", "target_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "admin_audit");
        }
    }
}
