using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuthService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSchoolAdminRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "id", "created_at", "description", "name", "normalized_name", "UpdatedAt" },
                values: new object[] { new Guid("00000000-0000-0000-0001-000000000007"), new DateTimeOffset(new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "School owner or manager — creates and administers a school organisation", "school_admin", "SCHOOL_ADMIN", null });

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000005"),
                column: "description",
                value: "Private language teacher — individual content and students");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000007"));

            migrationBuilder.UpdateData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0001-000000000005"),
                column: "description",
                value: "Language teacher — creates personal content");
        }
    }
}
