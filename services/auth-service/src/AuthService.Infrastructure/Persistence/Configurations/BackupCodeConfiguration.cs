using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class BackupCodeConfiguration : IEntityTypeConfiguration<BackupCode>
{
    public void Configure(EntityTypeBuilder<BackupCode> builder)
    {
        builder.ToTable("backup_codes");

        builder.HasKey(bc => bc.Id);
        builder.Property(bc => bc.Id).HasColumnName("id");
        builder.Property(bc => bc.UserId).HasColumnName("user_id");

        builder.Property(bc => bc.CodeHash)
            .HasColumnName("code_hash")
            .HasMaxLength(512)
            .IsRequired();

        builder.Property(bc => bc.IsUsed)
            .HasColumnName("is_used")
            .HasDefaultValue(false);

        builder.Property(bc => bc.UsedAt).HasColumnName("used_at");
        builder.Property(bc => bc.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(bc => new { bc.UserId, bc.IsUsed })
            .HasDatabaseName("ix_backup_codes_user_unused");
    }
}