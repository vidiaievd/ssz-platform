using AuthService.Application.Interfaces;
using OtpNet;
using QRCoder;

namespace AuthService.Infrastructure.Security;

public sealed class TotpService : ITotpService
{
    public string GenerateSecret()
    {
        // 20 bytes = 160-bit secret — RFC 6238 recommendation
        var secretBytes = new byte[20];
        System.Security.Cryptography.RandomNumberGenerator.Fill(secretBytes);
        return Base32Encoding.ToString(secretBytes);
    }

    public string GetQrCodeUri(string email, string secret, string issuer)
    {
        var encodedIssuer = Uri.EscapeDataString(issuer);
        var encodedEmail = Uri.EscapeDataString(email);

        // Standard otpauth URI format — works with Google Authenticator, Authy, etc.
        return $"otpauth://totp/{encodedIssuer}:{encodedEmail}" +
               $"?secret={secret}&issuer={encodedIssuer}" +
               $"&algorithm=SHA1&digits=6&period=30";
    }

    public byte[] GetQrCodeImage(string uri)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(uri, QRCodeGenerator.ECCLevel.Q);
        using var qrCode = new PngByteQRCode(data);
        return qrCode.GetGraphic(10);
    }

    public bool ValidateCode(string secret, string code)
    {
        var secretBytes = Base32Encoding.ToBytes(secret);
        var totp = new Totp(secretBytes, step: 30, totpSize: 6);

        // VerificationWindow(1, 1) allows ±30 seconds clock skew
        // Previous: 1 step back, Future: 1 step forward
        return totp.VerifyTotp(
            code,
            out _,
            new VerificationWindow(previous: 1, future: 1));
    }
}