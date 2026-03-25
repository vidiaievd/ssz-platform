using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace AuthService.API.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("User ID claim not found.");

        return Guid.TryParse(sub, out var id)
            ? id
            : throw new InvalidOperationException("User ID claim is not a valid GUID.");
    }

    public static string GetEmail(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? principal.FindFirstValue(ClaimTypes.Email)
            ?? throw new InvalidOperationException("Email claim not found.");
}