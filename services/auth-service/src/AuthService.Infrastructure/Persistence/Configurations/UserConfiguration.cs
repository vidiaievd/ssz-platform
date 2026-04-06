using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");

        builder.HasKey(u => u.Id);

        builder.Property(u => u.Id)
            .HasColumnName("id");

        builder.Property(u => u.Email)
            .HasColumnName("email")
            .HasMaxLength(254)
            .IsRequired();

        builder.Property(u => u.NormalizedEmail)
            .HasColumnName("normalized_email")
            .HasMaxLength(254)
            .IsRequired();

        builder.Property(u => u.PasswordHash)
            .HasColumnName("password_hash")
            .IsRequired();

        builder.Property(u => u.EmailVerified)
            .HasColumnName("email_verified")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder.Property(u => u.IsLocked)
            .HasColumnName("is_locked")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder.Property(u => u.LockedUntil)
            .HasColumnName("locked_until");

        builder.Property(u => u.FailedLoginAttempts)
            .HasColumnName("failed_login_attempts")
            .HasDefaultValue(0)
            .ValueGeneratedNever();

        builder.Property(u => u.LastFailedLoginAt)
            .HasColumnName("last_failed_login_at");

        builder.Property(u => u.TwoFactorEnabled)
            .HasColumnName("two_factor_enabled")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder.Property(u => u.TotpSecretEncrypted)
            .HasColumnName("totp_secret_encrypted");

        builder.Property(u => u.TotpVerified)
            .HasColumnName("totp_verified")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder.Property(u => u.LastLoginAt)
            .HasColumnName("last_login_at");

        builder.Property(u => u.CreatedAt)
            .HasColumnName("created_at");

        builder.Property(u => u.UpdatedAt)
            .HasColumnName("updated_at");

        builder.HasIndex(u => u.NormalizedEmail)
            .IsUnique()
            .HasDatabaseName("ix_users_normalized_email");

        builder.HasMany(u => u.RefreshTokens)
            .WithOne()
            .HasForeignKey(rt => rt.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.BackupCodes)
            .WithOne()
            .HasForeignKey(bc => bc.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.Roles)
            .WithOne(ur => ur.User)
            .HasForeignKey(ur => ur.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(u => u.RefreshTokens)
            .UsePropertyAccessMode(PropertyAccessMode.Field)
            .HasField("_refreshTokens");

        builder.Navigation(u => u.BackupCodes)
            .UsePropertyAccessMode(PropertyAccessMode.Field)
            .HasField("_backupCodes");

        builder.Navigation(u => u.Roles)
            .UsePropertyAccessMode(PropertyAccessMode.Field)
            .HasField("_roles");
    }
}