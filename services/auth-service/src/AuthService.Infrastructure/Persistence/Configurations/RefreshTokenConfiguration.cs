using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_tokens");

        builder.HasKey(rt => rt.Id);
        builder.Property(rt => rt.Id).HasColumnName("id");
        builder.Property(rt => rt.UserId).HasColumnName("user_id");

        builder.Property(rt => rt.TokenHash)
            .HasColumnName("token_hash")
            .HasMaxLength(512)
            .IsRequired();

        builder.Property(rt => rt.FamilyId)
            .HasColumnName("family_id")
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(rt => rt.IsRevoked)
            .HasColumnName("is_revoked")
            .HasDefaultValue(false);

        builder.Property(rt => rt.ExpiresAt).HasColumnName("expires_at");
        builder.Property(rt => rt.RevokedAt).HasColumnName("revoked_at");

        builder.Property(rt => rt.DeviceInfo)
            .HasColumnName("device_info")
            .HasMaxLength(512);

        builder.Property(rt => rt.CreatedAt).HasColumnName("created_at");

        builder.HasIndex(rt => rt.TokenHash)
            .IsUnique()
            .HasDatabaseName("ix_refresh_tokens_hash");

        builder.HasIndex(rt => rt.FamilyId)
            .HasDatabaseName("ix_refresh_tokens_family_id");

        builder.HasIndex(rt => new { rt.UserId, rt.IsRevoked })
            .HasDatabaseName("ix_refresh_tokens_user_active");
    }
}