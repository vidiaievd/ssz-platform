using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class AdminAuditEntryConfiguration : IEntityTypeConfiguration<AdminAuditEntry>
{
    public void Configure(EntityTypeBuilder<AdminAuditEntry> builder)
    {
        builder.ToTable("admin_audit");

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(a => a.OccurredAt).HasColumnName("occurred_at");
        builder.Property(a => a.ActorId).HasColumnName("actor_id");
        builder.Property(a => a.ActorLevel).HasColumnName("actor_level").HasMaxLength(16);
        builder.Property(a => a.Action).HasColumnName("action").HasMaxLength(64).IsRequired();
        builder.Property(a => a.TargetType).HasColumnName("target_type").HasMaxLength(64).IsRequired();
        builder.Property(a => a.TargetId).HasColumnName("target_id").HasMaxLength(128).IsRequired();
        builder.Property(a => a.Reason).HasColumnName("reason").HasMaxLength(500);
        builder.Property(a => a.BeforeJson).HasColumnName("before").HasColumnType("jsonb");
        builder.Property(a => a.AfterJson).HasColumnName("after").HasColumnType("jsonb");

        builder.HasIndex(a => a.OccurredAt).HasDatabaseName("ix_admin_audit_occurred_at");
        builder.HasIndex(a => new { a.TargetType, a.TargetId }).HasDatabaseName("ix_admin_audit_target");
    }
}
