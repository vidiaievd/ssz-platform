using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;

namespace AuthService.Infrastructure.Security;

public sealed class JwtTokenService : ITokenService
{
    private readonly AuthOptions _opts;
    private readonly RsaSecurityKey _privateKey;
    private readonly RsaSecurityKey _publicKey;
    private readonly JwtSecurityTokenHandler _handler = new();

    public JwtTokenService(IOptions<AuthOptions> opts)
    {
        _opts = opts.Value;

        // Prevent JWT handler from mapping standard claim types (e.g. sub -> nameid)
        _handler.InboundClaimTypeMap.Clear();

        // Load RSA keys from PEM files
        var privateRsa = RSA.Create();
        privateRsa.ImportFromPem(File.ReadAllText(_opts.PrivateKeyPath));
        _privateKey = new RsaSecurityKey(privateRsa) { KeyId = "auth-v1" };

        var publicRsa = RSA.Create();
        publicRsa.ImportFromPem(File.ReadAllText(_opts.PublicKeyPath));
        _publicKey = new RsaSecurityKey(publicRsa) { KeyId = "auth-v1" };
    }

    public string GenerateAccessToken(Guid userId, string email, IEnumerable<string> roles)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64),
            new("token_type", "access"),
        };

        // Add each role as a separate claim
        foreach (var role in roles)
            claims.Add(new Claim(ClaimTypes.Role, role));

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.Add(_opts.AccessTokenLifetime),
            Issuer = _opts.Issuer,
            Audience = _opts.Audience,

            // RS256 — asymmetric signing
            // Private key signs, public key verifies
            // Other services only need the public key
            SigningCredentials = new SigningCredentials(
                _privateKey,
                SecurityAlgorithms.RsaSha256),
        };

        return _handler.WriteToken(_handler.CreateToken(descriptor));
    }

    public (string rawToken, string tokenHash, string familyId) GenerateRefreshToken()
    {
        // Raw token — sent to client, never stored
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

        // Hash — stored in DB
        var tokenHash = Convert.ToBase64String(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken)));

        // Family ID — groups rotation chain for theft detection
        var familyId = Guid.NewGuid().ToString("N");

        return (rawToken, tokenHash, familyId);
    }

    public string GenerateMfaChallengeToken(Guid userId)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim("token_type", "mfa_challenge"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        // MFA challenge token uses symmetric key — short-lived, internal only
        var key = new SymmetricSecurityKey(
            System.Text.Encoding.UTF8.GetBytes(_opts.MfaChallengeSecret));

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.Add(_opts.MfaChallengeLifetime),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        };

        return _handler.WriteToken(_handler.CreateToken(descriptor));
    }

    public Guid? ValidateMfaChallengeToken(string token)
    {
        var key = new SymmetricSecurityKey(
            System.Text.Encoding.UTF8.GetBytes(_opts.MfaChallengeSecret));

        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            IssuerSigningKey = key,
            ClockSkew = TimeSpan.Zero,
        };

        try
        {
            var principal = _handler.ValidateToken(token, parameters, out _);

            // Ensure this is actually an MFA challenge token
            var tokenType = principal.FindFirstValue("token_type");
            if (tokenType != "mfa_challenge")
                return null;

            var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(sub, out var id))
                return null;

            return id;
        }
        catch
        {
            return null;
        }
    }

}
