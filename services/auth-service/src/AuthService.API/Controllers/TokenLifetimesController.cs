using AuthService.API.Extensions;
using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.API.Controllers;

/// <summary>
/// Refresh-token lifetimes by role and client (ADR-012), for platform administrators.
///
/// A user's token lives as long as the shortest lifetime among their roles on the client
/// they signed in from. A change applies to tokens issued or rotated after it.
/// </summary>
[ApiController]
[Route("api/v1/auth/admin/token-lifetimes")]
[Authorize(Policy = "AdminOnly")]
[Produces("application/json")]
public sealed class TokenLifetimesController(ISender mediator) : ControllerBase
{
    /// <summary>Every lifetime, with the fallback for a user whose roles have none.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(TokenLifetimesResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await mediator.Send(new ListTokenLifetimesQuery(), ct));

    /// <summary>
    /// Change some lifetimes, in hours (1 … 2160). A role with no row yet gets one, if the
    /// role exists. Answers with every lifetime as it now stands.
    /// </summary>
    [HttpPut]
    [ProducesResponseType(typeof(TokenLifetimesResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Update(
        [FromBody] UpdateTokenLifetimesRequest request,
        CancellationToken ct) =>
        Ok(await mediator.Send(
            new UpdateTokenLifetimesCommand(User.GetUserId(), request.Policies ?? []), ct));
}
