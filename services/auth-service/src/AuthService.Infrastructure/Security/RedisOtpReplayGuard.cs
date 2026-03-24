using AuthService.Application.Interfaces;
using StackExchange.Redis;

namespace AuthService.Infrastructure.Security;

// Prevents reuse of a TOTP code within its valid time window (90 seconds)
// A used code is stored in Redis with TTL — if seen again it's rejected
public sealed class RedisOtpReplayGuard(IConnectionMultiplexer redis) : IOtpReplayGuard
{
    private readonly IDatabase _db = redis.GetDatabase();

    // 90 seconds = full 3-step TOTP window (±1 step of 30s)
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(90);

    public async Task<bool> HasBeenUsedAsync(
        string userId,
        string code,
        CancellationToken ct = default)
    {
        return await _db.KeyExistsAsync(OtpKey(userId, code));
    }

    public async Task MarkAsUsedAsync(
        string userId,
        string code,
        CancellationToken ct = default)
    {
        await _db.StringSetAsync(OtpKey(userId, code), "1", Ttl);
    }

    private static string OtpKey(string userId, string code) =>
        $"otp:used:{userId}:{code}";
}