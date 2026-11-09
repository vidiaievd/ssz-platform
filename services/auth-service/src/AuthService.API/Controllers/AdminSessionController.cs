using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.API.Controllers;

/// <summary>
/// Sign-in for the platform admin panel (plan 90). The only way to an admin session — client
/// `admin`, whose access tokens alone carry `admin_level`.
///
/// Password, then MFA, always: an administrator without MFA gets a setup token instead of a
/// session, sets MFA up with it, and is signed in by the first code. The refresh token never
/// appears in a body: it lives in an httpOnly, Secure, SameSite=Strict cookie that only the
/// routes under this path receive.
/// </summary>
[ApiController]
[Route(BasePath)]
[Produces("application/json")]
public sealed class AdminSessionController(ISender mediator) : ControllerBase
{
    private const string BasePath = "api/v1/auth/admin/session";
    private const string CookieName = "ssz_admin_rt";

    /// <summary>
    /// Password step. Answers `{ mfaRequired, challenge }` for an administrator with MFA, or
    /// `{ mfaSetupRequired, setup }` for one without — never a session.
    /// </summary>
    [HttpPost("login")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status423Locked)]
    public async Task<IActionResult> Login([FromBody] AdminLoginRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(
            new LoginCommand(
                request.Email,
                request.Password,
                Request.Headers.UserAgent.ToString(),
                HttpContext.Connection.RemoteIpAddress?.ToString(),
                ClientTypes.Admin), ct);

        return result switch
        {
            MfaRequiredResult mfa => Ok(new { mfaRequired = true, challenge = mfa.Challenge }),
            MfaSetupRequiredResult setup => Ok(new { mfaSetupRequired = true, setup = setup.Setup }),
            // The handler never opens an admin session on a password alone.
            _ => throw new MfaSetupRequiredException(),
        };
    }

    /// <summary>MFA step: the authenticator code opens the session.</summary>
    [HttpPost("mfa")]
    [ProducesResponseType(typeof(AdminSessionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status423Locked)]
    public async Task<IActionResult> Mfa([FromBody] AdminMfaRequest request, CancellationToken ct)
    {
        var tokens = await mediator.Send(
            new CompleteMfaLoginCommand(
                request.MfaChallengeToken,
                request.Code,
                Request.Headers.UserAgent.ToString(),
                ClientTypes.Admin), ct);

        return Ok(StartSession(tokens));
    }

    /// <summary>MFA step with a one-time backup code instead of the authenticator.</summary>
    [HttpPost("mfa/backup")]
    [ProducesResponseType(typeof(AdminSessionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status423Locked)]
    public async Task<IActionResult> Backup([FromBody] AdminBackupCodeRequest request, CancellationToken ct)
    {
        var tokens = await mediator.Send(
            new LoginWithBackupCodeCommand(
                request.MfaChallengeToken,
                request.BackupCode,
                Request.Headers.UserAgent.ToString(),
                ClientTypes.Admin), ct);

        return Ok(StartSession(tokens));
    }

    /// <summary>
    /// MFA setup, step 1 (administrator without MFA): the secret and QR code for the
    /// authenticator. 400 MFA_ALREADY_ENABLED when MFA is on.
    /// </summary>
    [HttpPost("mfa-setup")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> StartMfaSetup([FromBody] AdminMfaSetupRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new StartAdminMfaSetupCommand(request.MfaSetupToken), ct);

        return Ok(new
        {
            secretKey = result.SecretKey,
            qrCodeUri = result.QrCodeUri,
            qrCodeImageBase64 = Convert.ToBase64String(result.QrCodeImage),
        });
    }

    /// <summary>
    /// MFA setup, step 2: the first code turns MFA on and opens the session. The backup codes
    /// are shown once.
    /// </summary>
    [HttpPost("mfa-setup/confirm")]
    [ProducesResponseType(typeof(AdminMfaSetupConfirmedResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status423Locked)]
    public async Task<IActionResult> ConfirmMfaSetup(
        [FromBody] AdminMfaSetupConfirmRequest request,
        CancellationToken ct)
    {
        var result = await mediator.Send(
            new ConfirmAdminMfaSetupCommand(
                request.MfaSetupToken,
                request.Code,
                Request.Headers.UserAgent.ToString()), ct);

        var session = StartSession(result.Tokens);
        return Ok(new AdminMfaSetupConfirmedResponse(
            result.BackupCodes,
            session.AccessToken,
            session.AccessTokenExpiresAt,
            session.SessionExpiresAt));
    }

    /// <summary>
    /// A new access token from the session cookie (rotated). 401 without a valid cookie; 403 when
    /// the person is no longer an administrator with a level and MFA — the session is then over.
    /// </summary>
    [HttpPost("refresh")]
    [ProducesResponseType(typeof(AdminSessionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var raw = Request.Cookies[CookieName];
        if (string.IsNullOrEmpty(raw))
            throw new InvalidTokenException();

        try
        {
            var tokens = await mediator.Send(new RefreshTokenCommand(raw, AdminSession: true), ct);
            return Ok(StartSession(tokens));
        }
        catch (DomainException)
        {
            ClearCookie();
            throw;
        }
    }

    /// <summary>Ends this admin session; the person's other sessions are left alone. Always 204.</summary>
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var raw = Request.Cookies[CookieName];
        if (!string.IsNullOrEmpty(raw))
            await mediator.Send(new EndAdminSessionCommand(raw), ct);

        ClearCookie();
        return NoContent();
    }

    private AdminSessionResponse StartSession(AuthTokensResponse tokens)
    {
        Response.Cookies.Append(CookieName, tokens.RefreshToken, CookieOptions(tokens.RefreshTokenExpiresAt));
        return new AdminSessionResponse(
            tokens.AccessToken,
            tokens.AccessTokenExpiresAt,
            tokens.RefreshTokenExpiresAt);
    }

    private void ClearCookie() =>
        Response.Cookies.Delete(CookieName, CookieOptions(expires: null));

    private static CookieOptions CookieOptions(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        // Browsers accept Secure cookies from http://localhost, so dev needs no exception.
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/" + BasePath,
        Expires = expires,
        IsEssential = true,
    };
}
