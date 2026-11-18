using AuthService.API.Extensions;
using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.API.Controllers;

/// <summary>
/// Accounts in the platform admin panel (plan 90, phase 6) — read by any admin level, changed by
/// the level each action names. No password hash, TOTP secret, backup code or refresh token is
/// ever answered.
///
/// Every change takes `{ reason }` (required, ≤ 500; 422 otherwise), answers the account's card
/// as it is afterwards and lands in the admin trail. Refusals: 400 `ADMIN_SELF_CHANGE` (your own
/// account), 400 `ADMIN_LAST_SUPER` (blocking the last super who can sign in), 403
/// `ADMIN_LEVEL_REQUIRED` (`requiredLevel` — e.g. a platform_admin account needs `super`), 409
/// `NOTHING_TO_CHANGE` (the action would change nothing; no trail row).
/// </summary>
[ApiController]
[Route("api/v1/auth/admin/users")]
[Authorize(Policy = "AdminSupport")]
[Produces("application/json")]
public sealed class AdminUsersController(ISender mediator) : ControllerBase
{
    /// <summary>
    /// Accounts, one page at a time.
    /// `search` — part of the e-mail (at least 2 characters, case ignored);
    /// `role` — student, tutor, teacher, school_admin, platform_admin, manager_platform or premium;
    /// `status` — active, blocked, locked (failed sign-ins), deletion_pending or unverified;
    /// `sort` — -createdAt (default), createdAt, email, -email, -lastLoginAt (never signed in last);
    /// `page` from 1; `limit` 1–100 (default 25);
    /// `ids` — up to 100 comma-separated account ids (unknown ones are simply absent).
    /// A bad argument → 400 `INVALID_FILTER`.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(AdminUserListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] string? role,
        [FromQuery] string? status,
        [FromQuery] string? sort,
        [FromQuery] int? page,
        [FromQuery] int? limit,
        [FromQuery] string? ids,
        CancellationToken ct) =>
        Ok(await mediator.Send(new ListAdminUsersQuery(search, role, status, sort, page, limit, ids), ct));

    /// <summary>
    /// The card of one account: the list row plus the block (who, why), failed sign-ins, the
    /// two-factor code lockout (`mfaCodes.available: false` when Redis could not be read) and
    /// the open sessions of each client (web, mobile, admin).
    /// </summary>
    [HttpGet("{userId:guid}")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct) =>
        Ok(await mediator.Send(new GetAdminUserQuery(userId), ct));

    /// <summary>
    /// Blocks the account: every session ends and none opens until it is unblocked. Level
    /// `admin`; a platform_admin account — `super`. An access token already handed out lives
    /// out its ≤ 15 minutes.
    /// </summary>
    [HttpPost("{userId:guid}/block")]
    [Authorize(Policy = "AdminLevel")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public Task<IActionResult> Block(Guid userId, [FromBody] AdminUserActionRequest request, CancellationToken ct) =>
        Act(userId, new BlockUserCommand(User.GetUserId(), ActorLevel(), userId, request.Reason), ct);

    /// <summary>Lifts an administrator's block. Level `admin`; a platform_admin account — `super`.</summary>
    [HttpPost("{userId:guid}/unblock")]
    [Authorize(Policy = "AdminLevel")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public Task<IActionResult> Unblock(Guid userId, [FromBody] AdminUserActionRequest request, CancellationToken ct) =>
        Act(userId, new UnblockUserCommand(User.GetUserId(), ActorLevel(), userId, request.Reason), ct);

    /// <summary>
    /// Lifts the lockout after failed sign-ins and the two-factor code lockout. Any level.
    /// Redis unreachable → 503 `LOCKOUT_STORE_UNAVAILABLE`, nothing changed.
    /// </summary>
    [HttpPost("{userId:guid}/unlock")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public Task<IActionResult> Unlock(Guid userId, [FromBody] AdminUserActionRequest request, CancellationToken ct) =>
        Act(userId, new UnlockUserCommand(User.GetUserId(), ActorLevel(), userId, request.Reason), ct);

    /// <summary>
    /// Ends the open sessions of one client (`clientType` web, mobile or admin) or, without it,
    /// of every client. Any level.
    /// </summary>
    [HttpPost("{userId:guid}/sessions/revoke")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public Task<IActionResult> RevokeSessions(
        Guid userId, [FromBody] AdminRevokeSessionsRequest request, CancellationToken ct) =>
        Act(userId, new RevokeUserSessionsCommand(
            User.GetUserId(), ActorLevel(), userId, request.Reason, request.ClientType), ct);

    /// <summary>
    /// Turns two-factor sign-in off (TOTP, backup codes), ends the admin-panel sessions and clears
    /// the code count. Any level; a platform_admin account — `super`.
    /// </summary>
    [HttpPost("{userId:guid}/mfa/reset")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public Task<IActionResult> ResetMfa(Guid userId, [FromBody] AdminUserActionRequest request, CancellationToken ct) =>
        Act(userId, new ResetUserMfaCommand(User.GetUserId(), ActorLevel(), userId, request.Reason), ct);

    /// <summary>Withdraws a pending deletion request. Level `admin`.</summary>
    [HttpPost("{userId:guid}/deletion/cancel")]
    [Authorize(Policy = "AdminLevel")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public Task<IActionResult> CancelDeletion(
        Guid userId, [FromBody] AdminUserActionRequest request, CancellationToken ct) =>
        Act(userId, new CancelUserDeletionCommand(User.GetUserId(), ActorLevel(), userId, request.Reason), ct);

    private async Task<IActionResult> Act(Guid userId, AdminUserActionCommand command, CancellationToken ct)
    {
        await mediator.Send(command, ct);
        return Ok(await mediator.Send(new GetAdminUserQuery(userId), ct));
    }

    // The policies guarantee a known level is there.
    private string ActorLevel() => User.FindFirst("admin_level")?.Value ?? "";
}
