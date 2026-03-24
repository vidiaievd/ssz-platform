using AuthService.Application.Interfaces;
using StackExchange.Redis;

namespace AuthService.Infrastructure.Security;

// Sliding window rate limiter backed by Redis
// Key pattern: ratelimit:count:{identifier} / ratelimit:lock:{identifier}
public sealed class RedisRateLimitStore(IConnectionMultiplexer redis) : IRateLimitStore
{
    private readonly IDatabase _db = redis.GetDatabase();

    public async Task<bool> IsLockedOutAsync(string key, CancellationToken ct = default)
    {
        var value = await _db.StringGetAsync(LockKey(key));
        return value.HasValue;
    }

    public async Task RecordAttemptAsync(
        string key,
        int maxAttempts,
        TimeSpan window,
        CancellationToken ct = default)
    {
        var countKey = CountKey(key);
        var count = await _db.StringIncrementAsync(countKey);

        // Set expiry only on first attempt
        if (count == 1)
            await _db.KeyExpireAsync(countKey, window);

        if (count >= maxAttempts)
        {
            // Progressive lockout — doubles each time threshold is hit
            var lockDuration = TimeSpan.FromSeconds(
                window.TotalSeconds * Math.Min(count / maxAttempts, 8));

            await _db.StringSetAsync(LockKey(key), "1", lockDuration);
        }
    }

    public async Task ResetAsync(string key, CancellationToken ct = default)
    {
        await _db.KeyDeleteAsync([CountKey(key), LockKey(key)]);
    }

    private static string CountKey(string key) => $"ratelimit:count:{key}";
    private static string LockKey(string key) => $"ratelimit:lock:{key}";
}