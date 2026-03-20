namespace AuthService.Domain.Exceptions;

public class DomainException : Exception
{
    public string Code { get; }

    public DomainException(string message, string? code = null)
        : base(message) => Code = code ?? "DOMAIN_ERROR";
}

public sealed class UserNotFoundException : DomainException
{
    public UserNotFoundException()
        : base("User not found.", "USER_NOT_FOUND") { }
}

public sealed class UserAlreadyExistsException : DomainException
{
    public UserAlreadyExistsException()
        : base("A user with this email already exists.", "USER_ALREADY_EXISTS") { }
}

public sealed class AccountLockedException : DomainException
{
    public DateTimeOffset? LockedUntil { get; }

    public AccountLockedException(DateTimeOffset? lockedUntil)
        : base("Account is temporarily locked.", "ACCOUNT_LOCKED")
        => LockedUntil = lockedUntil;
}

public sealed class InvalidCredentialsException : DomainException
{
    public InvalidCredentialsException()
        : base("Invalid email or password.", "INVALID_CREDENTIALS") { }
}

public sealed class InvalidTokenException : DomainException
{
    public InvalidTokenException()
        : base("The token is invalid or has expired.", "INVALID_TOKEN") { }
}

public sealed class InvalidTotpCodeException : DomainException
{
    public InvalidTotpCodeException()
        : base("The two-factor code is invalid.", "INVALID_TOTP_CODE") { }
}

public sealed class TwoFactorRequiredException : DomainException
{
    public string MfaChallengeToken { get; }

    public TwoFactorRequiredException(string mfaChallengeToken)
        : base("Two-factor authentication is required.", "MFA_REQUIRED")
        => MfaChallengeToken = mfaChallengeToken;
}