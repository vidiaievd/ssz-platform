using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;

namespace AuthService.Infrastructure.Security;

// AES-256-GCM — authenticated encryption
// "Authenticated" means it detects if the ciphertext was tampered with
// Format: base64(nonce):base64(tag):base64(ciphertext)
public sealed class AesGcmEncryptionService : IEncryptionService
{
    private readonly byte[] _key;

    public AesGcmEncryptionService(IOptions<AuthOptions> opts)
    {
        _key = Convert.FromBase64String(opts.Value.EncryptionKey);

        if (_key.Length != 32)
            throw new InvalidOperationException(
                "Encryption key must be exactly 32 bytes (256-bit).");
    }

    public string Encrypt(string plaintext)
    {
        // New random nonce for every encryption — critical for GCM security
        var nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var tag = new byte[AesGcm.TagByteSizes.MaxSize];
        var plaintextBytes = System.Text.Encoding.UTF8.GetBytes(plaintext);
        var ciphertext = new byte[plaintextBytes.Length];

        using var aes = new AesGcm(_key, AesGcm.TagByteSizes.MaxSize);
        aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        return $"{Convert.ToBase64String(nonce)}:" +
               $"{Convert.ToBase64String(tag)}:" +
               $"{Convert.ToBase64String(ciphertext)}";
    }

    public string Decrypt(string encrypted)
    {
        var parts = encrypted.Split(':');
        if (parts.Length != 3)
            throw new CryptographicException("Invalid encrypted data format.");

        var nonce = Convert.FromBase64String(parts[0]);
        var tag = Convert.FromBase64String(parts[1]);
        var ciphertext = Convert.FromBase64String(parts[2]);
        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(_key, AesGcm.TagByteSizes.MaxSize);

        // Throws CryptographicException if tag doesn't match — data was tampered
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        return System.Text.Encoding.UTF8.GetString(plaintext);
    }
}