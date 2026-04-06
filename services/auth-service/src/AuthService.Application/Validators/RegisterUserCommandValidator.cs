using AuthService.Application.Commands;
using FluentValidation;

namespace AuthService.Application.Validators;

public sealed class RegisterUserCommandValidator
    : AbstractValidator<RegisterUserCommand>
{
    public RegisterUserCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email format is invalid.")
            .MaximumLength(254).WithMessage("Email must not exceed 254 characters.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(12).WithMessage("Password must be at least 12 characters.")
            .MaximumLength(128).WithMessage("Password must not exceed 128 characters.")
            .Matches("[A-Z]").WithMessage("Password must contain at least one uppercase letter.")
            .Matches("[a-z]").WithMessage("Password must contain at least one lowercase letter.")
            .Matches("[0-9]").WithMessage("Password must contain at least one digit.")
            .Matches("[^a-zA-Z0-9]").WithMessage("Password must contain at least one special character.");
    }
}

public sealed class VerifyAndEnableTotpCommandValidator
    : AbstractValidator<VerifyAndEnableTotpCommand>
{
    public VerifyAndEnableTotpCommandValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("User ID is required.");

        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("TOTP code is required.")
            .Length(6).WithMessage("TOTP code must be exactly 6 digits.")
            .Matches("^[0-9]{6}$").WithMessage("TOTP code must contain only digits.");
    }
}

public sealed class DisableTwoFactorCommandValidator
    : AbstractValidator<DisableTwoFactorCommand>
{
    public DisableTwoFactorCommandValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("User ID is required.");

        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("TOTP code is required.")
            .Length(6).WithMessage("TOTP code must be exactly 6 digits.")
            .Matches("^[0-9]{6}$").WithMessage("TOTP code must contain only digits.");
    }
}