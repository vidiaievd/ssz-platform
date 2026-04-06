using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Commands;

// ── Setup TOTP — generates secret and QR code ─────────────────────────────────

public sealed record SetupTotpCommand(Guid UserId) : IRequest<TotpSetupResponse>;

public sealed class SetupTotpCommandHandler(
    IUserRepository userRepository,
    ITotpService totpService,
    IEncryptionService encryptionService,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> opts)
    : IRequestHandler<SetupTotpCommand, TotpSetupResponse>
{
    public async Task<TotpSetupResponse> Handle(
        SetupTotpCommand command,
        CancellationToken ct)
    {
        var user = await userRepository.FindByIdAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        var secret = totpService.GenerateSecret();
        var uri = totpService.GetQrCodeUri(user.Email, secret, opts.Value.TotpIssuer);
        var qrImage = totpService.GetQrCodeImage(uri);

        // Store encrypted secret — not verified yet
        user.SetTotpSecret(encryptionService.Encrypt(secret));
        await unitOfWork.SaveChangesAsync(ct);

        return new TotpSetupResponse(secret, uri, qrImage);
    }
}

// ── Verify TOTP code and enable 2FA ──────────────────────────────────────────

public sealed record VerifyAndEnableTotpCommand(
    Guid UserId,
    string Code
) : IRequest<Enable2FAResponse>;

public sealed class VerifyAndEnableTotpCommandHandler(
    IUserRepository userRepository,
    ITotpService totpService,
    IEncryptionService encryptionService,
    IBackupCodeService backupCodeService,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork)
    : IRequestHandler<VerifyAndEnableTotpCommand, Enable2FAResponse>
{
    public async Task<Enable2FAResponse> Handle(
        VerifyAndEnableTotpCommand command,
        CancellationToken ct)
    {
        var user = await userRepository.FindByIdWithBackupCodesAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        if (user.TotpSecretEncrypted is null)
            throw new DomainException(
                "TOTP setup has not been initiated.",
                "TOTP_NOT_INITIALIZED");

        var secret = encryptionService.Decrypt(user.TotpSecretEncrypted);

        if (!totpService.ValidateCode(secret, command.Code))
            throw new InvalidTotpCodeException();

        // Mark TOTP as verified so EnableTwoFactor invariant passes
        user.ConfirmTotpVerification();

        // Remove existing backup codes from database
        userRepository.RemoveBackupCodesForUser(user.Id);

        // Generate 8 backup codes
        var generatedCodes = backupCodeService.GenerateCodes(8).ToList();
        var backupCodeEntities = generatedCodes
            .Select(c => BackupCode.Create(user.Id, c.hash))
            .ToList();

        user.EnableTwoFactor(backupCodeEntities);
        
        // Add backup codes to EF context
        foreach (var backupCode in backupCodeEntities)
            userRepository.AddBackupCode(backupCode);
        
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        // Raw codes returned ONCE — never stored as plaintext
        return new Enable2FAResponse(
            generatedCodes.Select(c => c.rawCode).ToArray());
    }
}

// ── Disable 2FA ───────────────────────────────────────────────────────────────

public sealed record DisableTwoFactorCommand(
    Guid UserId,
    string Code
) : IRequest;

public sealed class DisableTwoFactorCommandHandler(
    IUserRepository userRepository,
    ITotpService totpService,
    IEncryptionService encryptionService,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork)
    : IRequestHandler<DisableTwoFactorCommand>
{
    public async Task Handle(DisableTwoFactorCommand command, CancellationToken ct)
    {
        var user = await userRepository.FindByIdAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        if (!user.TwoFactorEnabled || user.TotpSecretEncrypted is null)
            throw new DomainException(
                "Two-factor authentication is not enabled.",
                "MFA_NOT_ENABLED");

        // Require valid TOTP code to confirm intent before disabling
        var secret = encryptionService.Decrypt(user.TotpSecretEncrypted);
        if (!totpService.ValidateCode(secret, command.Code))
            throw new InvalidTotpCodeException();

        user.DisableTwoFactor();
        userRepository.RemoveBackupCodesForUser(user.Id);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();
    }
}