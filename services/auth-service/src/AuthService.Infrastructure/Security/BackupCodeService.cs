using AuthService.Application.Interfaces;
using Konscious.Security.Cryptography;
using System.Security.Cryptography;

namespace AuthService.Infrastructure.Security;

// Backup codes format: XXXXXXXX-XXXX (easy to read and type)
// Stored as Argon2id hash — same treatment as passwords
public sealed class BackupCodeService : IBackupCodeService
{
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    // Lower parameters than login hashing — backup codes are one-time use
    private const int Iterations = 1;
    private const int MemorySize = 19456; // 19 MB
    private const int Parallelism = 1;

    public (string rawCode, string hash) GenerateCode()
    {
        var raw = GenerateRawCode();
        var hash = HashCode(raw);
        return (raw, hash);
    }

    public bool VerifyCode(string rawCode, string hash)
    {
        try
        {
            var parts = hash.Split(':');
            if (parts.Length != 2) return false;

            var salt = Convert.FromBase64String(parts[0]);
            var expectedHash = Convert.FromBase64String(parts[1]);
            var actualHash = ComputeArgon2(rawCode, salt);

            return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
        }
        catch
        {
            return false;
        }
    }

    public IEnumerable<(string rawCode, string hash)> GenerateCodes(int count = 8)
    {
        for (var i = 0; i < count; i++)
            yield return GenerateCode();
    }

    private static string GenerateRawCode()
    {
        var bytes = RandomNumberGenerator.GetBytes(12);
        var chars = bytes.Select(b => Alphabet[b % Alphabet.Length]).ToArray();

        // Format: XXXXXXXX-XXXX
        return $"{new string(chars[..8])}-{new string(chars[8..])}";
    }

    private static string HashCode(string code)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = ComputeArgon2(code, salt);
        return $"{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
    }

    private static byte[] ComputeArgon2(string code, byte[] salt)
    {
        using var argon2 = new Argon2id(System.Text.Encoding.UTF8.GetBytes(code))
        {
            Salt = salt,
            Iterations = Iterations,
            MemorySize = MemorySize,
            DegreeOfParallelism = Parallelism,
        };
        return argon2.GetBytes(32);
    }
}