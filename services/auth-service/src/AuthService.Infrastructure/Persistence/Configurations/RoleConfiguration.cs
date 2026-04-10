using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("roles");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");

        builder.Property(r => r.Name)
            .HasColumnName("name")
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(r => r.NormalizedName)
            .HasColumnName("normalized_name")
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(r => r.Description)
            .HasColumnName("description")
            .HasMaxLength(256);

        builder.Property(r => r.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(r => r.NormalizedName)
            .IsUnique()
            .HasDatabaseName("ix_roles_normalized_name");

        builder.HasData(
            CreateRole("00000000-0000-0000-0001-000000000001", "User", "Standard user"),
            CreateRole("00000000-0000-0000-0001-000000000002", "Admin", "Administrator"),
            CreateRole("00000000-0000-0000-0001-000000000003", "Premium", "Premium subscriber"),
            CreateRole("00000000-0000-0000-0001-000000000004", "Student", "Language learner"),
            CreateRole("00000000-0000-0000-0001-000000000005", "Tutor", "Language teacher")
        );
    }

    private static object CreateRole(string id, string name, string description) => new
    {
        Id = Guid.Parse(id),
        Name = name,
        NormalizedName = name.ToUpperInvariant(),
        Description = description,
        CreatedAt = new DateTimeOffset(2024, 1, 1, 0, 0, 0, TimeSpan.Zero),
        UpdatedAt = (DateTimeOffset?)null,
    };
}