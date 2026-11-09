using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;

namespace AuthService.Application.Services;

/// <summary>
/// Wrong MFA codes on the admin panel (plan 90), counted per account: after
/// <see cref="AuthOptions.AdminMfaMaxAttempts"/> within <see cref="AuthOptions.AdminMfaWindow"/>
/// the panel stops taking codes for that account until the window passes. A six-digit code
/// guessed at the gateway's rate would otherwise fall within one challenge's lifetime.
/// Does nothing for any other client.
/// </summary>
public sealed class AdminMfaAttempts(
    IRateLimitStore store,
    AuthOptions options,
    Guid userId,
    string clientType)
{
    private readonly bool _counted = clientType == ClientTypes.Admin;
    private readonly string _key = $"admin-mfa:{userId}";

    public async Task EnsureNotLockedAsync(CancellationToken ct)
    {
        if (_counted && await store.IsLockedOutAsync(_key, ct))
            throw new AccountLockedException(null);
    }

    public Task RecordFailureAsync(CancellationToken ct) =>
        _counted
            ? store.RecordAttemptAsync(_key, options.AdminMfaMaxAttempts, options.AdminMfaWindow, ct)
            : Task.CompletedTask;

    public Task ResetAsync(CancellationToken ct) =>
        _counted ? store.ResetAsync(_key, ct) : Task.CompletedTask;
}
