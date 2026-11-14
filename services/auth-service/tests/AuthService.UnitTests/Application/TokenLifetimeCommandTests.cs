using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Application.Validators;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>Plan 90, phase 8, step 2: changing token lifetimes leaves a trail row per changed pair.</summary>
public sealed class TokenLifetimeCommandTests
{
    private readonly ITokenLifetimePolicyRepository _policies = Substitute.For<ITokenLifetimePolicyRepository>();
    private readonly IRoleRepository _roles = Substitute.For<IRoleRepository>();
    private readonly IAdminAuditTrail _trail = Substitute.For<IAdminAuditTrail>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IOptions<AuthOptions> _options = Options.Create(new AuthOptions());

    private readonly Guid _actor = Guid.NewGuid();
    private readonly List<TokenLifetimePolicy> _rows =
    [
        TokenLifetimePolicy.Create(RoleNames.Student, ClientTypes.Web, 7 * 24, DateTimeOffset.UtcNow.AddDays(-1)),
        TokenLifetimePolicy.Create(RoleNames.Student, ClientTypes.Mobile, 30 * 24, DateTimeOffset.UtcNow.AddDays(-1)),
    ];

    public TokenLifetimeCommandTests()
    {
        _policies.ListAsync(Arg.Any<CancellationToken>()).Returns(_rows);
    }

    private UpdateTokenLifetimesCommandHandler Handler() =>
        new(_policies, _roles, _trail, _unitOfWork, _options);

    private UpdateTokenLifetimesCommand Command(string reason, params TokenLifetimeChange[] changes) =>
        new(_actor, AdminLevels.Super, changes, reason);

    [Fact]
    public async Task ChangedPair_WritesOneTrailRow_WithHoursBeforeAndAfter()
    {
        await Handler().Handle(
            Command(" shorter web sessions ", new TokenLifetimeChange(RoleNames.Student, "Web", 48)),
            default);

        _rows[0].RefreshLifetimeHours.Should().Be(48);
        _rows[0].UpdatedBy.Should().Be(_actor);
        _trail.Received(1).Stage(Arg.Is<AdminActionPerformedEvent>(e =>
            e.Action == TokenLifetimeActions.Changed
            && e.TargetType == TokenLifetimeActions.TargetType
            && e.TargetId == $"{RoleNames.Student}:web"
            && e.ActorId == _actor
            && e.ActorLevel == AdminLevels.Super
            && e.Reason == "shorter web sessions"
            && (int)e.Before!["hours"]! == 7 * 24
            && (int)e.After!["hours"]! == 48));
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        await _trail.Received(1).PublishAsync(Arg.Any<AdminActionPerformedEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task UnchangedPair_IsNotWritten_AndKeepsItsUpdatedBy()
    {
        await Handler().Handle(
            Command("tidy up",
                new TokenLifetimeChange(RoleNames.Student, ClientTypes.Web, 7 * 24),
                new TokenLifetimeChange(RoleNames.Student, ClientTypes.Mobile, 14 * 24)),
            default);

        _rows[0].UpdatedBy.Should().BeNull();
        _trail.Received(1).Stage(Arg.Any<AdminActionPerformedEvent>());
        _trail.Received(1).Stage(Arg.Is<AdminActionPerformedEvent>(e =>
            e.TargetId == $"{RoleNames.Student}:mobile"));
    }

    [Fact]
    public async Task NothingChanged_NoTrail()
    {
        await Handler().Handle(
            Command("no-op", new TokenLifetimeChange(RoleNames.Student, ClientTypes.Web, 7 * 24)),
            default);

        _trail.DidNotReceive().Stage(Arg.Any<AdminActionPerformedEvent>());
        await _trail.DidNotReceive().PublishAsync(Arg.Any<AdminActionPerformedEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task NewPairForExistingRole_IsCreated_WithoutBefore()
    {
        _roles.FindByNameAsync(RoleNames.Teacher, Arg.Any<CancellationToken>())
            .Returns(Role.Create(RoleNames.Teacher));
        TokenLifetimePolicy? added = null;
        _policies.Add(Arg.Do<TokenLifetimePolicy>(p => added = p));

        await Handler().Handle(
            Command("teachers on the panel", new TokenLifetimeChange(RoleNames.Teacher, ClientTypes.Admin, 8)),
            default);

        added!.RefreshLifetimeHours.Should().Be(8);
        _trail.Received(1).Stage(Arg.Is<AdminActionPerformedEvent>(e =>
            e.TargetId == $"{RoleNames.Teacher}:admin"
            && e.Before == null
            && (int)e.After!["hours"]! == 8));
    }

    [Fact]
    public async Task UnknownRole_RefusesTheWholeBatch_BeforeSaving()
    {
        var act = () => Handler().Handle(
            Command("typo",
                new TokenLifetimeChange(RoleNames.Student, ClientTypes.Web, 48),
                new TokenLifetimeChange("studnet", ClientTypes.Web, 48)),
            default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("TOKEN_LIFETIME_UNKNOWN_ROLE");
        _trail.DidNotReceive().Stage(Arg.Any<AdminActionPerformedEvent>());
        await _unitOfWork.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    // ── Validator ─────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Validator_RequiresAReason(string reason)
    {
        var result = new UpdateTokenLifetimesCommandValidator().Validate(
            Command(reason, new TokenLifetimeChange(RoleNames.Student, ClientTypes.Web, 48)));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateTokenLifetimesCommand.Reason));
    }

    [Fact]
    public void Validator_RefusesAReasonOver500Characters()
    {
        var result = new UpdateTokenLifetimesCommandValidator().Validate(
            Command(new string('x', 501), new TokenLifetimeChange(RoleNames.Student, ClientTypes.Web, 48)));

        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateTokenLifetimesCommand.Reason));
    }

    [Fact]
    public void Validator_AcceptsAValidChange()
    {
        new UpdateTokenLifetimesCommandValidator()
            .Validate(Command("ok", new TokenLifetimeChange(RoleNames.Student, ClientTypes.Web, 48)))
            .IsValid.Should().BeTrue();
    }
}
