using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class TokenLifetimePolicyConfiguration : IEntityTypeConfiguration<TokenLifetimePolicy>
{
    // When the defaults were decided (ADR-012). Fixed, so the seed does not change on every
    // build of the model and EF never sees a pending data change that is not there.
    private static readonly DateTimeOffset SeededAt =
        new(2026, 10, 16, 0, 0, 0, TimeSpan.Zero);

    public void Configure(EntityTypeBuilder<TokenLifetimePolicy> builder)
    {
        builder.ToTable("token_lifetime_policies");

        builder.HasKey(p => new { p.Role, p.ClientType });

        builder.Property(p => p.Role)
            .HasColumnName("role")
            .HasMaxLength(64);

        builder.Property(p => p.ClientType)
            .HasColumnName("client_type")
            .HasMaxLength(16);

        builder.Property(p => p.RefreshLifetimeHours).HasColumnName("refresh_lifetime_hours");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");

        builder.Ignore(p => p.RefreshLifetime);

        builder.HasData(DefaultTokenLifetimes.All.Select(d => new
        {
            Role = d.Role,
            ClientType = d.ClientType,
            RefreshLifetimeHours = d.Hours,
            UpdatedAt = SeededAt,
            UpdatedBy = (Guid?)null,
        }));
    }
}
