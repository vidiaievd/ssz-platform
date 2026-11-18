using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.API.Controllers;

/// <summary>
/// Accounts in the platform admin panel (plan 90, phase 6) — read by any admin level. No
/// password hash, TOTP secret, backup code or refresh token is ever answered.
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
}
