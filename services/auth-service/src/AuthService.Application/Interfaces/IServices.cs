using AuthService.Domain.Common;

namespace AuthService.Application.Interfaces;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

public interface ITokenService
{
    string GenerateAccessToken(Guid userId, string email, IEnumerable<string> roles);

    (string rawToken, string tokenHash, string familyId) GenerateRefreshToken();

    string GenerateMfaChallengeToken(Guid userId);
    Guid? ValidateMfaChallengeToken(string token);
}

public interface ITotpService
{
    string GenerateSecret();
    string GetQrCodeUri(string email, string secret, string issuer);
    byte[] GetQrCodeImage(string uri);
    bool ValidateCode(string secret, string code);
}

public interface IEncryptionService
{
    string Encrypt(string plaintext);
    string Decrypt(string ciphertext);
}

public interface IBackupCodeService
{
    (string rawCode, string hash) GenerateCode();
    bool VerifyCode(string rawCode, string hash);
    IEnumerable<(string rawCode, string hash)> GenerateCodes(int count = 8);
}

public interface IDomainEventPublisher
{
    Task PublishAsync<TEvent>(TEvent domainEvent, CancellationToken ct = default)
        where TEvent : IDomainEvent;
}

public interface IRateLimitStore
{
    Task<bool> IsLockedOutAsync(string key, CancellationToken ct = default);
    Task RecordAttemptAsync(
        string key,
        int maxAttempts,
        TimeSpan window,
        CancellationToken ct = default);
    Task ResetAsync(string key, CancellationToken ct = default);
}

public interface IOtpReplayGuard
{
    Task<bool> HasBeenUsedAsync(string userId, string code, CancellationToken ct = default);
    Task MarkAsUsedAsync(string userId, string code, CancellationToken ct = default);
}