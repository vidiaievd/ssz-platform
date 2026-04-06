using AuthService.Infrastructure.Security;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Infrastructure;

public sealed class Argon2idPasswordHasherTests
{
    private readonly Argon2idPasswordHasher _hasher = new();

    [Fact]
    public void Hash_ShouldProduceUniqueHashesForSamePassword()
    {
        var hash1 = _hasher.Hash("SamePassword1!");
        var hash2 = _hasher.Hash("SamePassword1!");

        // Different salt every time
        hash1.Should().NotBe(hash2);
    }

    [Fact]
    public void Hash_ShouldContainTwoParts_SaltAndHash()
    {
        var hash = _hasher.Hash("Password1!");
        var parts = hash.Split(':');

        parts.Should().HaveCount(2);
        parts[0].Should().NotBeNullOrEmpty(); // salt
        parts[1].Should().NotBeNullOrEmpty(); // hash
    }

    [Fact]
    public void Verify_CorrectPassword_ShouldReturnTrue()
    {
        var hash = _hasher.Hash("CorrectPassword1!");

        _hasher.Verify("CorrectPassword1!", hash).Should().BeTrue();
    }

    [Fact]
    public void Verify_WrongPassword_ShouldReturnFalse()
    {
        var hash = _hasher.Hash("CorrectPassword1!");

        _hasher.Verify("WrongPassword1!", hash).Should().BeFalse();
    }

    [Fact]
    public void Verify_TamperedHash_ShouldReturnFalse()
    {
        _hasher.Verify("password", "tampered:invaliddataXXX==").Should().BeFalse();
    }

    [Fact]
    public void Verify_InvalidFormat_ShouldReturnFalse()
    {
        _hasher.Verify("password", "no-colon-separator").Should().BeFalse();
    }
}