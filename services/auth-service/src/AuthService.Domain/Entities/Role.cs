using AuthService.Domain.Common;

namespace AuthService.Domain.Entities;

public sealed class Role : Entity
{
    private Role() { }

    public string Name { get; private set; } = default!;
    public string NormalizedName { get; private set; } = default!;
    public string? Description { get; private set; }

    public static Role Create(string name, string? description = null) => new()
    {
        Name = name,
        NormalizedName = name.ToUpperInvariant(),
        Description = description,
    };
}

public sealed class UserRole
{
    private UserRole() { }

    public Guid UserId { get; private set; }
    public Guid RoleId { get; private set; }
    public DateTimeOffset GrantedAt { get; private set; }

    public User User { get; private set; } = default!;
    public Role Role { get; private set; } = default!;

    public static UserRole Create(Guid userId, Guid roleId) => new()
    {
        UserId = userId,
        RoleId = roleId,
        GrantedAt = DateTimeOffset.UtcNow,
    };
}