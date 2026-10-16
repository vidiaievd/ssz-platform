using AuthService.Application.Commands;
using AuthService.Domain.Entities;
using FluentValidation;

namespace AuthService.Application.Validators;

/// <summary>
/// The shape of a lifetime change (ADR-012), checked before anything is read. The domain
/// enforces the bounds again — this only turns a bad request into a readable 422 rather than
/// a half-applied batch.
/// </summary>
public sealed class UpdateTokenLifetimesCommandValidator
    : AbstractValidator<UpdateTokenLifetimesCommand>
{
    public UpdateTokenLifetimesCommandValidator()
    {
        RuleFor(x => x.Changes)
            .NotEmpty().WithMessage("At least one lifetime is required.");

        RuleForEach(x => x.Changes).ChildRules(change =>
        {
            change.RuleFor(c => c.Role)
                .NotEmpty().WithMessage("Role is required.");

            change.RuleFor(c => c.ClientType)
                .Must(c => c is not null && ClientTypes.All.Contains(c.Trim().ToLowerInvariant()))
                .WithMessage("Client type must be 'web' or 'mobile'.");

            change.RuleFor(c => c.RefreshLifetimeHours)
                .InclusiveBetween(TokenLifetimePolicy.MinHours, TokenLifetimePolicy.MaxHours)
                .WithMessage(
                    $"A refresh token lifetime must be between {TokenLifetimePolicy.MinHours} " +
                    $"and {TokenLifetimePolicy.MaxHours} hours.");
        });

        RuleFor(x => x.Changes)
            .Must(changes => changes
                .GroupBy(c => (c.Role.Trim(), c.ClientType.Trim().ToLowerInvariant()))
                .All(g => g.Count() == 1))
            .When(x => x.Changes is not null && x.Changes.All(c => c.Role is not null && c.ClientType is not null))
            .WithMessage("Each role and client may appear only once.");
    }
}
