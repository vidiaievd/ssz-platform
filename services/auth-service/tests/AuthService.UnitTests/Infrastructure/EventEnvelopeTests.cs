using System.Text.Json;
using AuthService.Domain.Common;
using AuthService.Domain.Events;
using AuthService.Infrastructure.Messaging;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Infrastructure;

/// <summary>
/// The payload is picked per event type; an event without a mapping leaves the envelope empty and
/// its consumers drop it (found live with the role events, plan 90 session 17).
/// </summary>
public sealed class EventEnvelopeTests
{
    private static readonly JsonSerializerOptions Camel = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    [Fact]
    public void RoleEvents_CarryUserIdAndRole_EvenWhenPublishedAsTheInterface()
    {
        IDomainEvent assigned = new UserRoleAssignedEvent(Guid.NewGuid(), "student");
        IDomainEvent removed = new UserRoleRemovedEvent(Guid.NewGuid(), "platform_admin");

        foreach (var (evt, role) in new[] { (assigned, "student"), (removed, "platform_admin") })
        {
            var json = JsonSerializer.SerializeToElement(EventEnvelope.Wrap(evt, "k"), Camel);
            var payload = json.GetProperty("payload");
            payload.GetProperty("role").GetString().Should().Be(role);
            payload.GetProperty("userId").GetGuid().Should().NotBeEmpty();
        }
    }
}
