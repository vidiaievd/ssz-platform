using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Commands;

// ── Reading users in the admin panel (plan 90, phase 6, step 2) — any admin level ────

/// <summary>
/// The admin user list. Arguments come as the query string has them and are checked here; a
/// bad one is 400 <c>INVALID_FILTER</c>.
/// </summary>
/// <param name="Ids">Comma-separated account ids, up to 100 — to name the people of a trail or a roster.</param>
public sealed record ListAdminUsersQuery(
    string? Search = null,
    string? Role = null,
    string? Status = null,
    string? Sort = null,
    int? Page = null,
    int? Limit = null,
    string? Ids = null) : IRequest<AdminUserListResponse>;

public sealed class ListAdminUsersQueryHandler(
    IAdminUserReader reader,
    IRoleRepository roles,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<ListAdminUsersQuery, AdminUserListResponse>
{
    public const int DefaultLimit = 25;
    public const int MaxLimit = 100;
    public const int MaxIds = 100;
    public const int MinSearchLength = 2;

    /// <summary>The roles the list filters by — every role an account can hold.</summary>
    public static readonly IReadOnlyList<string> KnownRoles =
    [
        RoleNames.Student, RoleNames.Tutor, RoleNames.Teacher, RoleNames.SchoolAdmin,
        RoleNames.PlatformAdmin, RoleNames.ManagerPlatform, RoleNames.Premium,
    ];

    public async Task<AdminUserListResponse> Handle(ListAdminUsersQuery query, CancellationToken ct)
    {
        var page = query.Page ?? 1;
        if (page < 1) throw Invalid("page must be 1 or more.");

        var limit = query.Limit ?? DefaultLimit;
        if (limit is < 1 or > MaxLimit) throw Invalid($"limit must be between 1 and {MaxLimit}.");

        string? search = null;
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            if (term.Length < MinSearchLength)
                throw Invalid($"search needs at least {MinSearchLength} characters.");
            // normalized_email is the upper-cased address, as User.Create writes it.
            search = term.ToUpperInvariant();
        }

        string? status = null;
        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            status = query.Status.Trim();
            if (!AdminUserStatuses.All.Contains(status))
                throw Invalid($"status must be one of: {string.Join(", ", AdminUserStatuses.All)}.");
        }

        var sort = AdminUserSorts.Default;
        if (!string.IsNullOrWhiteSpace(query.Sort))
        {
            sort = query.Sort.Trim();
            if (!AdminUserSorts.All.Contains(sort))
                throw Invalid($"sort must be one of: {string.Join(", ", AdminUserSorts.All)}.");
        }

        var ids = ParseIds(query.Ids);

        Guid? roleId = null;
        if (!string.IsNullOrWhiteSpace(query.Role))
        {
            var roleName = query.Role.Trim();
            if (!KnownRoles.Contains(roleName))
                throw Invalid($"role must be one of: {string.Join(", ", KnownRoles)}.");

            // A known role missing from the table is held by nobody.
            var role = await roles.FindByNameAsync(roleName, ct);
            if (role is null) return new AdminUserListResponse([], 0, page, limit);
            roleId = role.Id;
        }

        var criteria = new AdminUserCriteria(search, roleId, status, ids, sort, page, limit);
        var now = DateTimeOffset.UtcNow;
        var result = await reader.ListAsync(criteria, now, ct);
        var grace = authOptions.Value.AccountDeletionGrace;

        return new AdminUserListResponse(
            result.Items.Select(r => AdminUserMapping.ToListItem(r, now, grace)).ToList(),
            result.Total,
            page,
            limit);
    }

    private static IReadOnlyList<Guid>? ParseIds(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return null;
        if (parts.Length > MaxIds) throw Invalid($"ids takes at most {MaxIds} ids.");

        var ids = new List<Guid>(parts.Length);
        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id)) throw Invalid($"'{part}' is not a UUID.");
            ids.Add(id);
        }
        return ids.Distinct().ToList();
    }

    private static DomainException Invalid(string message) => new(message, "INVALID_FILTER");
}

/// <summary>The admin card of one account.</summary>
public sealed record GetAdminUserQuery(Guid UserId) : IRequest<AdminUserDetailResponse>;

public sealed class GetAdminUserQueryHandler(
    IAdminUserReader reader,
    IRateLimitStore rateLimitStore,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<GetAdminUserQuery, AdminUserDetailResponse>
{
    public const int RecentSessions = 3;

    public async Task<AdminUserDetailResponse> Handle(GetAdminUserQuery query, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var record = await reader.GetAsync(query.UserId, now, ct)
            ?? throw new UserNotFoundException();

        var row = record.Row;
        var lockedUntil = AdminUserMapping.CurrentLockout(row, now);
        var mfaCodes = await ReadMfaCodesAsync(row.Id, now, ct);

        return new AdminUserDetailResponse(
            row.Id,
            row.Email,
            row.Roles,
            row.AdminLevel,
            row.EmailVerified,
            row.TwoFactorEnabled,
            row.BlockedAt,
            lockedUntil,
            row.DeletionRequestedAt,
            AdminUserMapping.PurgeAt(row, authOptions.Value.AccountDeletionGrace),
            row.CreatedAt,
            row.LastLoginAt,
            row.BlockedAt is { } blockedAt
                ? new AdminUserBlockDto(blockedAt, record.BlockedBy, record.BlockReason)
                : null,
            new AdminUserFailedLoginsDto(record.FailedLoginAttempts, record.LastFailedLoginAt, lockedUntil),
            mfaCodes,
            record.BackupCodesLeft,
            SummarizeSessions(record.ActiveTokens, record.LastIssuedByClient));
    }

    /// <summary>One entry per client, always in the order web, mobile, admin — zeros included.</summary>
    public static IReadOnlyList<AdminUserClientSessionsDto> SummarizeSessions(
        IReadOnlyList<AdminSessionToken> activeTokens,
        IReadOnlyDictionary<string, DateTimeOffset> lastIssuedByClient) =>
        new[] { ClientTypes.Web, ClientTypes.Mobile, ClientTypes.Admin }
            .Select(client =>
            {
                var open = activeTokens
                    .Where(t => t.ClientType == client)
                    .OrderByDescending(t => t.IssuedAt)
                    .ToList();
                return new AdminUserClientSessionsDto(
                    client,
                    open.Count,
                    lastIssuedByClient.TryGetValue(client, out var last) ? last : null,
                    open.Take(RecentSessions)
                        .Select(t => new AdminUserSessionDto(t.IssuedAt, t.ExpiresAt, t.DeviceInfo))
                        .ToList());
            })
            .ToList();

    // The card still answers when Redis does not: this part is then marked unavailable rather
    // than shown as "no failures".
    private async Task<AdminUserMfaCodesDto> ReadMfaCodesAsync(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        try
        {
            var snapshot = await rateLimitStore.InspectAsync(MfaAttempts.KeyFor(userId), ct);
            return new AdminUserMfaCodesDto(
                true,
                snapshot.Attempts,
                snapshot.LockRemaining is { } left ? now.Add(left) : null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new AdminUserMfaCodesDto(false, 0, null);
        }
    }
}

internal static class AdminUserMapping
{
    public static AdminUserListItem ToListItem(AdminUserRow r, DateTimeOffset now, TimeSpan grace) =>
        new(
            r.Id,
            r.Email,
            r.Roles,
            r.AdminLevel,
            r.EmailVerified,
            r.TwoFactorEnabled,
            r.BlockedAt,
            CurrentLockout(r, now),
            r.DeletionRequestedAt,
            PurgeAt(r, grace),
            r.CreatedAt,
            r.LastLoginAt);

    /// <summary>The end of a lockout still running; a lockout that has run out is no lockout.</summary>
    public static DateTimeOffset? CurrentLockout(AdminUserRow r, DateTimeOffset now) =>
        r.IsLocked && r.LockedUntil is { } until && until > now ? until : null;

    public static DateTimeOffset? PurgeAt(AdminUserRow r, TimeSpan grace) =>
        r.DeletionRequestedAt?.Add(grace);
}
