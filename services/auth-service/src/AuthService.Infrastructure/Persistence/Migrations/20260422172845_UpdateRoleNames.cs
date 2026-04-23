using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UpdateRoleNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Remove all user_role assignments for the legacy "User" role before dropping it
            migrationBuilder.Sql(
                "DELETE FROM user_roles WHERE role_id = '00000000-0000-0000-0001-000000000001';");

            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000001"));

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000002"),
                columns: new[] { "description", "name", "normalized_name" },
                values: new object[] { "Platform administrator — full access", "platform_admin", "PLATFORM_ADMIN" });

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000003"),
                column: "name",
                value: "premium");

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000004"),
                column: "name",
                value: "student");

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000005"),
                columns: new[] { "description", "name" },
                values: new object[] { "Language teacher — creates personal content", "tutor" });

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "id", "created_at", "description", "name", "normalized_name", "UpdatedAt" },
                values: new object[] { new Guid("00000000-0000-0000-0001-000000000006"), new DateTimeOffset(new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Platform manager — elevated access, cannot manage admins", "manager_platform", "MANAGER_PLATFORM", null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000006"));

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000002"),
                columns: new[] { "description", "name", "normalized_name" },
                values: new object[] { "Administrator", "Admin", "ADMIN" });

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000003"),
                column: "name",
                value: "Premium");

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000004"),
                column: "name",
                value: "Student");

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000005"),
                columns: new[] { "description", "name" },
                values: new object[] { "Language teacher", "Tutor" });

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "id", "created_at", "description", "name", "normalized_name", "UpdatedAt" },
                values: new object[] { new Guid("00000000-0000-0000-0001-000000000001"), new DateTimeOffset(new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Standard user", "User", "USER", null });
        }
    }
}
