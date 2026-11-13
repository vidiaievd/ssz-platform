using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public sealed class AdminLevelAssignmentConfiguration : IEntityTypeConfiguration<AdminLevelAssignment>
{
    public void Configure(EntityTypeBuilder<AdminLevelAssignment> builder)
    {
        builder.ToTable("admin_levels", t => t.HasCheckConstraint(
            "ck_admin_levels_level", "level IN ('support', 'admin', 'super')"));

        builder.HasKey(a => a.UserId);
        builder.Property(a => a.UserId)
            .HasColumnName("user_id")
            .ValueGeneratedNever();

        builder.Property(a => a.Level)
            .HasColumnName("level")
            .HasMaxLength(16)
            .IsRequired();

        builder.Property(a => a.GrantedAt).HasColumnName("granted_at");
        builder.Property(a => a.GrantedBy).HasColumnName("granted_by");

        // An erased account takes its level with it.
        builder.HasOne<User>()
            .WithOne()
            .HasForeignKey<AdminLevelAssignment>(a => a.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
