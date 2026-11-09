using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Exceptions;

namespace AuthService.Application.Services;

/// <summary>
/// Wrong two-factor codes, counted per account across every client — web, phone and the admin
/// panel share one count, so guesses cannot be spread between them. After
/// <see cref="AuthOptions.MfaMaxAttempts"/> within <see cref="AuthOptions.MfaWindow"/> no code
/// (authenticator or backup) is taken for that account until the window passes (423). A
/// six-digit code guessed at the gateway's rate would otherwise fall within one challenge's
/// lifetime.
/// </summary>
public sealed class MfaAttempts(IRateLimitStore store, AuthOptions options, Guid userId)
{
    private readonly string _key = $"mfa:attempts:{userId}";

    public async Task EnsureNotLockedAsync(CancellationToken ct)
    {
        if (await store.IsLockedOutAsync(_key, ct))
            throw new AccountLockedException(null);
    }

    public Task RecordFailureAsync(CancellationToken ct) =>
        store.RecordAttemptAsync(_key, options.MfaMaxAttempts, options.MfaWindow, ct);

    public Task ResetAsync(CancellationToken ct) => store.ResetAsync(_key, ct);
}
