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

/// <summary>
/// The account was blocked by a platform administrator (plan 90, phase 6). Not a 423: there is
/// nothing to wait for. The reason stays with the administrators.
/// </summary>
public sealed class AccountBlockedException : DomainException
{
    public AccountBlockedException()
        : base("This account has been blocked. Please contact support.", "ACCOUNT_BLOCKED") { }
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

public sealed class EmailNotVerifiedException : DomainException
{
    public EmailNotVerifiedException()
        : base("Email address is not verified. Please check your inbox.", "EMAIL_NOT_VERIFIED") { }
}

public sealed class SelfDeletionNotAllowedException : DomainException
{
    public SelfDeletionNotAllowedException()
        : base("This account cannot be deleted from the app. Please contact support.", "CONTACT_SUPPORT") { }
}

/// <summary>
/// A wrong password on an already signed-in request — not a 401, which clients read as an
/// expired session and sign out.
/// </summary>
public sealed class PasswordMismatchException : DomainException
{
    public PasswordMismatchException()
        : base("The password is incorrect.", "INVALID_PASSWORD") { }
}

/// <summary>
/// An admin-panel session asked for by someone who is not a platform administrator with an
/// admin level (plan 90) — or who has stopped being one since the session was opened.
/// </summary>
public sealed class AdminAccessDeniedException : DomainException
{
    public AdminAccessDeniedException()
        : base("This account may not use the admin panel.", "ADMIN_ACCESS_DENIED") { }
}

/// <summary>
/// An admin-panel session is opened only through MFA (plan 90); this administrator has not
/// set it up yet.
/// </summary>
public sealed class MfaSetupRequiredException : DomainException
{
    public MfaSetupRequiredException()
        : base("Two-factor authentication must be set up before using the admin panel.", "MFA_SETUP_REQUIRED") { }
}

/// <summary>
/// The administrator's level is too low for this change (plan 90, phase 6) — e.g. a
/// <c>platform_admin</c> account is blocked or has its MFA reset by a super administrator only.
/// </summary>
public sealed class AdminLevelRequiredException : DomainException
{
    public string RequiredLevel { get; }

    public AdminLevelRequiredException(string requiredLevel)
        : base($"This change needs the '{requiredLevel}' admin level.", "ADMIN_LEVEL_REQUIRED")
        => RequiredLevel = requiredLevel;
}

/// <summary>
/// An administrator's action that would change nothing (plan 90, phase 6): unblocking an account
/// that is not blocked, resetting MFA that is not set up, and so on. Nothing is written.
/// </summary>
public sealed class NothingToChangeException : DomainException
{
    public NothingToChangeException(string message)
        : base(message, "NOTHING_TO_CHANGE") { }
}

/// <summary>
/// The store of sign-in and code counters (Redis) could not be reached, so an unlock cannot be
/// done or judged; nothing was changed.
/// </summary>
public sealed class LockoutStoreUnavailableException : DomainException
{
    public LockoutStoreUnavailableException()
        : base("The lockout store is unavailable; nothing was changed. Try again later.", "LOCKOUT_STORE_UNAVAILABLE") { }
}
