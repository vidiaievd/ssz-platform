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

// ── Actions on an account (plan 90, phase 6, step 3) ──────────────────────────

/// <summary>Every action on an account needs a reason; it goes to the admin trail.</summary>
public abstract class AdminUserActionValidator<T> : AbstractValidator<T>
    where T : AdminUserActionCommand
{
    protected AdminUserActionValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("A reason is required.")
            .MaximumLength(500).WithMessage("The reason is at most 500 characters.");
    }
}

public sealed class BlockUserCommandValidator : AdminUserActionValidator<BlockUserCommand>;
public sealed class UnblockUserCommandValidator : AdminUserActionValidator<UnblockUserCommand>;
public sealed class UnlockUserCommandValidator : AdminUserActionValidator<UnlockUserCommand>;
public sealed class ResetUserMfaCommandValidator : AdminUserActionValidator<ResetUserMfaCommand>;
public sealed class CancelUserDeletionCommandValidator : AdminUserActionValidator<CancelUserDeletionCommand>;

public sealed class RevokeUserSessionsCommandValidator : AdminUserActionValidator<RevokeUserSessionsCommand>
{
    public RevokeUserSessionsCommandValidator()
    {
        RuleFor(x => x.ClientType)
            .Must(c => string.IsNullOrWhiteSpace(c)
                || AdminUserActions.Clients.Contains(c.Trim().ToLowerInvariant()))
            .WithMessage("clientType must be 'web', 'mobile' or 'admin', or left out for all clients.");
    }
}
