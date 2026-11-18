using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;

namespace AuthService.Application.Services;

/// <summary>Values of <c>status</c> in the admin user list (plan 90, phase 6).</summary>
public static class AdminUserStatuses
{
    /// <summary>None of the four below.</summary>
    public const string Active = "active";
    /// <summary>Blocked by an administrator.</summary>
    public const string Blocked = "blocked";
    /// <summary>Locked out after failed sign-ins, the lockout still running.</summary>
    public const string Locked = "locked";
    /// <summary>Asked to be deleted; erased when the grace period ends.</summary>
    public const string DeletionPending = "deletion_pending";
    /// <summary>E-mail not confirmed yet.</summary>
    public const string Unverified = "unverified";

    public static readonly IReadOnlyList<string> All =
        [Active, Blocked, Locked, DeletionPending, Unverified];
}

/// <summary>Values of <c>sort</c> in the admin user list; ties are broken by id.</summary>
public static class AdminUserSorts
{
    public const string CreatedDesc = "-createdAt";
    public const string CreatedAsc = "createdAt";
    public const string EmailAsc = "email";
    public const string EmailDesc = "-email";
    /// <summary>Most recent sign-in first; accounts that never signed in go last.</summary>
    public const string LastLoginDesc = "-lastLoginAt";

    public const string Default = CreatedDesc;

    public static readonly IReadOnlyList<string> All =
        [CreatedDesc, CreatedAsc, EmailAsc, EmailDesc, LastLoginDesc];
}

/// <summary>
/// The filter and order of the admin user list as plain LINQ, so the same expressions run in
/// PostgreSQL (through EF) and in unit tests (over a list). Only stored columns are used — the
/// computed <see cref="User.IsBlocked"/> or <see cref="User.IsCurrentlyLocked"/> would not
/// translate to SQL.
/// </summary>
public static class AdminUserFilter
{
    public static IQueryable<User> Apply(
        IQueryable<User> users,
        AdminUserCriteria criteria,
        DateTimeOffset now)
    {
        var q = users;

        if (criteria.Ids is { } ids)
            q = q.Where(u => ids.Contains(u.Id));

        if (criteria.Search is { } search)
            q = q.Where(u => u.NormalizedEmail.Contains(search));

        if (criteria.RoleId is { } roleId)
            q = q.Where(u => u.Roles.Any(r => r.RoleId == roleId));

        q = criteria.Status switch
        {
            AdminUserStatuses.Blocked => q.Where(u => u.BlockedAt != null),
            AdminUserStatuses.Locked => q.Where(u =>
                u.IsLocked && u.LockedUntil != null && u.LockedUntil > now),
            AdminUserStatuses.DeletionPending => q.Where(u => u.DeletionRequestedAt != null),
            AdminUserStatuses.Unverified => q.Where(u => !u.EmailVerified),
            AdminUserStatuses.Active => q.Where(u =>
                u.BlockedAt == null
                && !(u.IsLocked && u.LockedUntil != null && u.LockedUntil > now)
                && u.DeletionRequestedAt == null
                && u.EmailVerified),
            _ => q,
        };

        return q;
    }

    public static IOrderedQueryable<User> Sort(IQueryable<User> users, string sort) => sort switch
    {
        AdminUserSorts.CreatedAsc => users.OrderBy(u => u.CreatedAt).ThenBy(u => u.Id),
        AdminUserSorts.EmailAsc => users.OrderBy(u => u.Email).ThenBy(u => u.Id),
        AdminUserSorts.EmailDesc => users.OrderByDescending(u => u.Email).ThenBy(u => u.Id),
        // PostgreSQL puts NULLs first in a descending order, so they are pushed back explicitly.
        AdminUserSorts.LastLoginDesc => users
            .OrderBy(u => u.LastLoginAt == null)
            .ThenByDescending(u => u.LastLoginAt)
            .ThenBy(u => u.Id),
        _ => users.OrderByDescending(u => u.CreatedAt).ThenBy(u => u.Id),
    };
}
