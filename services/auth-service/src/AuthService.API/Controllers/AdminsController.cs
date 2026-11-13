using AuthService.API.Extensions;
using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.API.Controllers;

/// <summary>
/// Who may use the admin panel, and at which level (plan 90). Super administrators only — the
/// `admin_level` claim exists on admin-panel sessions alone, so a web session of the same person
/// is refused. Every change needs a reason and lands in the admin trail.
/// </summary>
[ApiController]
[Route("api/v1/auth/admin/admins")]
[Authorize(Policy = "SuperAdmin")]
[Produces("application/json")]
public sealed class AdminsController(ISender mediator) : ControllerBase
{
    /// <summary>Every administrator, highest level first.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(AdminListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await mediator.Send(new ListAdminsQuery(), ct));

    /// <summary>
    /// Makes an existing account an administrator of this level, or changes its level. You
    /// cannot change your own level, nor lower the last super administrator.
    /// </summary>
    [HttpPut("{userId:guid}")]
    [ProducesResponseType(typeof(AdminResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Set(
        Guid userId,
        [FromBody] SetAdminLevelRequest request,
        CancellationToken ct) =>
        Ok(await mediator.Send(
            new SetAdminLevelCommand(
                User.GetUserId(), ActorLevel(), userId, request.Level, request.Reason), ct));

    /// <summary>
    /// Removes the administrator role and level, and ends the account's admin-panel sessions.
    /// The reason goes in the query string. You cannot remove yourself, nor the last super.
    /// </summary>
    [HttpDelete("{userId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Revoke(
        Guid userId,
        [FromQuery] string? reason,
        CancellationToken ct)
    {
        await mediator.Send(
            new RevokeAdminCommand(User.GetUserId(), ActorLevel(), userId, reason ?? ""), ct);
        return NoContent();
    }

    // The policy guarantees the claim is there and is `super`.
    private string ActorLevel() => User.FindFirst("admin_level")?.Value ?? "";
}
