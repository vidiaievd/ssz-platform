using AuthService.Application.Commands;
using AuthService.Application.Validators;
using FluentAssertions;
using FluentValidation.TestHelper;
using Xunit;

namespace AuthService.UnitTests.Application;

public sealed class RegisterUserCommandValidatorTests
{
    private readonly RegisterUserCommandValidator _validator = new();

    [Theory]
    [InlineData("student")]
    [InlineData("tutor")]
    [InlineData("STUDENT")]      // SelfAssignable is case-insensitive
    [InlineData(" tutor ")]      // trimmed before comparison
    public void Validate_SelfAssignableRole_ShouldPass(string role)
    {
        var command = new RegisterUserCommand("user@example.com", "Password123!ABC", role);

        var result = _validator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.Role);
    }

    [Theory]
    [InlineData("school")]
    [InlineData("admin")]
    [InlineData("platform_admin")]
    [InlineData("premium")]
    [InlineData("")]
    public void Validate_NonSelfAssignableRole_ShouldFail(string role)
    {
        var command = new RegisterUserCommand("user@example.com", "Password123!ABC", role);

        var result = _validator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Role);
    }

    [Fact]
    public void Validate_RoleDefaultsToStudent_ShouldPass()
    {
        var command = new RegisterUserCommand("user@example.com", "Password123!ABC");

        var result = _validator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.Role);
    }
}
