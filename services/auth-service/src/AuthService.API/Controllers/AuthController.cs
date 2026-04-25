using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using AuthService.API.Extensions;
using AuthService.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AuthService.Application.Interfaces;
using AuthService.Domain.Exceptions;

namespace AuthService.API.Controllers;

[ApiController]
[Route("api/v1/auth")]
[Produces("application/json")]
public sealed class AuthController(
    ISender mediator,
    IUserRepository userRepository) : ControllerBase
{
    /// <summary>Register a new user account.</summary>
    [HttpPost("register")]
    [ProducesResponseType(typeof(RegisterResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Register(
        [FromBody] RegisterRequest request,
        CancellationToken ct)
    {
        var result = await mediator.Send(
            new RegisterUserCommand(request.Email, request.Password, request.Role), ct);

        return CreatedAtAction(nameof(Register), new { id = result.UserId }, result);
    }

    /// <summary>
    /// Authenticate with email and password.
    /// Returns tokens or MFA challenge if 2FA is enabled.
    /// </summary>
    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthTokensResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status423Locked)]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request,
        CancellationToken ct)
    {
        var deviceInfo = Request.Headers.UserAgent.ToString();
        var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        var result = await mediator.Send(
            new LoginCommand(request.Email, request.Password, deviceInfo, clientIp), ct);

        return result switch
        {
            LoginSuccessResult success => Ok(success.Tokens),
            MfaRequiredResult mfa => Ok(new
            {
                mfaRequired = true,
                challenge = mfa.Challenge,
            }),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    /// <summary>Complete login with TOTP code.</summary>
    [HttpPost("mfa/challenge")]
    [ProducesResponseType(typeof(AuthTokensResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> CompleteMfaLogin(
        [FromBody] MfaChallengeRequest request,
        CancellationToken ct)
    {
        var deviceInfo = Request.Headers.UserAgent.ToString();
        var tokens = await mediator.Send(
            new CompleteMfaLoginCommand(
                request.MfaChallengeToken,
                request.Code,
                deviceInfo), ct);

        return Ok(tokens);
    }

    /// <summary>Complete login using a backup recovery code.</summary>
    [HttpPost("mfa/backup")]
    [ProducesResponseType(typeof(AuthTokensResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> LoginWithBackupCode(
        [FromBody] BackupCodeLoginRequest request,
        CancellationToken ct)
    {
        var deviceInfo = Request.Headers.UserAgent.ToString();
        var tokens = await mediator.Send(
            new LoginWithBackupCodeCommand(
                request.MfaChallengeToken,
                request.BackupCode,
                deviceInfo), ct);

        return Ok(tokens);
    }

    /// <summary>Issue new access token using a valid refresh token.</summary>
    [HttpPost("refresh")]
    [ProducesResponseType(typeof(AuthTokensResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Refresh(
        [FromBody] RefreshTokenRequest request,
        CancellationToken ct)
    {
        var tokens = await mediator.Send(
            new RefreshTokenCommand(request.RefreshToken), ct);

        return Ok(tokens);
    }

    /// <summary>Revoke all sessions for the authenticated user.</summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var userId = User.GetUserId();
        await mediator.Send(new RevokeAllSessionsCommand(userId), ct);
        return NoContent();
    }

    /// <summary>
    /// Assign a role to the authenticated user.
    /// Student and Tutor can be self-assigned. Admin and Premium require the Admin role.
    /// Idempotent — returns 200 OK if the role is already assigned.
    /// </summary>
    [HttpPost("roles")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignRole(
        [FromBody] AssignRoleRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        var actorIsAdmin = User.IsInRole(RoleNames.PlatformAdmin);

        await mediator.Send(new AssignRoleCommand(userId, request.RoleName, actorIsAdmin), ct);

        return Ok();
    }

    /// <summary>Return the current role list for the authenticated user, loaded from the database.</summary>
    [HttpGet("roles")]
    [Authorize]
    [ProducesResponseType(typeof(UserRolesResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMyRoles(CancellationToken ct)
    {
        var userId = User.GetUserId();

        var user = await userRepository.FindByIdWithRolesAsync(userId, ct)
            ?? throw new DomainException("User not found.", "USER_NOT_FOUND");

        var roles = user.Roles
            .Select(ur => ur.Role.Name)
            .ToArray();

        return Ok(new UserRolesResponse(roles));
    }

    /// <summary>
    /// Request a password reset email.
    /// Always returns 204 — user enumeration is prevented by design.
    /// </summary>
    [HttpPost("password/forgot")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request,
        CancellationToken ct)
    {
        await mediator.Send(new ForgotPasswordCommand(request.Email), ct);
        return NoContent();
    }

    /// <summary>Reset password using a token received by email.</summary>
    [HttpPost("password/reset")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request,
        CancellationToken ct)
    {
        await mediator.Send(new ResetPasswordCommand(request.Token, request.NewPassword), ct);
        return NoContent();
    }

    /// <summary>
    /// Re-send the email verification link for the authenticated user.
    /// Idempotent — returns 204 if the email is already verified.
    /// </summary>
    [HttpPost("email/verify/request")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RequestEmailVerification(CancellationToken ct)
    {
        var userId = User.GetUserId();
        await mediator.Send(new RequestEmailVerificationCommand(userId), ct);
        return NoContent();
    }

    /// <summary>Confirm email ownership using the token from the verification email.</summary>
    [HttpPost("email/verify/confirm")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> VerifyEmail(
        [FromBody] VerifyEmailRequest request,
        CancellationToken ct)
    {
        await mediator.Send(new VerifyEmailCommand(request.Token), ct);
        return NoContent();
    }
}