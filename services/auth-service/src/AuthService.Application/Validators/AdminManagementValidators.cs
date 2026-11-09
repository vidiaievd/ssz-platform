using AuthService.Application.Commands;
using AuthService.Domain.Entities;
using FluentValidation;

namespace AuthService.Application.Validators;

public sealed class SetAdminLevelCommandValidator : AbstractValidator<SetAdminLevelCommand>
{
    public SetAdminLevelCommandValidator()
    {
        RuleFor(x => x.Level)
            .Must(l => l is not null && AdminLevels.IsKnown(l.Trim().ToLowerInvariant()))
            .WithMessage("Level must be 'support', 'admin' or 'super'.");

        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("A reason is required.")
            .MaximumLength(500).WithMessage("The reason is at most 500 characters.");
    }
}

public sealed class RevokeAdminCommandValidator : AbstractValidator<RevokeAdminCommand>
{
    public RevokeAdminCommandValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("A reason is required.")
            .MaximumLength(500).WithMessage("The reason is at most 500 characters.");
    }
}
