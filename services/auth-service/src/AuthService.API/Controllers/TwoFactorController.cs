using AuthService.API.Extensions;
using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.API.Controllers;

[ApiController]
[Route("api/v1/auth/2fa")]
[Authorize]
[Produces("application/json")]
public sealed class TwoFactorController(ISender mediator) : ControllerBase
{
    /// <summary>
    /// Initiates TOTP setup.
    /// Returns QR code image and secret key for manual entry.
    /// Must call /verify to complete enrollment.
    /// </summary>
    [HttpPost("setup")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Setup(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var result = await mediator.Send(new SetupTotpCommand(userId), ct);

        return Ok(new
        {
            secretKey = result.SecretKey,
            qrCodeUri = result.QrCodeUri,

            // Base64 encoded PNG — client renders this as an image
            qrCodeImageBase64 = Convert.ToBase64String(result.QrCodeImage),
        });
    }

    /// <summary>
    /// Verifies TOTP code and enables 2FA.
    /// Returns one-time backup recovery codes — display once only.
    /// </summary>
    [HttpPost("verify")]
    [ProducesResponseType(typeof(Enable2FAResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> VerifyAndEnable(
        [FromBody] TotpVerifyRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        var result = await mediator.Send(
            new VerifyAndEnableTotpCommand(userId, request.Code), ct);

        return Ok(new
        {
            message = "Two-factor authentication has been enabled.",
            backupCodes = result.BackupCodes,
            warning = "Store these backup codes securely. They will not be shown again.",
        });
    }

    /// <summary>
    /// Disables 2FA. Requires a valid TOTP code to confirm intent.
    /// </summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Disable(
        [FromBody] TotpVerifyRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        await mediator.Send(new DisableTwoFactorCommand(userId, request.Code), ct);
        return NoContent();
    }
}