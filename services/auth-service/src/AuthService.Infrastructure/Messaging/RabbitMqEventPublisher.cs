using AuthService.Application.Interfaces;
using AuthService.Domain.Common;
using AuthService.Domain.Events;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AuthService.Infrastructure.Messaging;

public sealed class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string Username { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string VirtualHost { get; set; } = "/";
}

public sealed class RabbitMqEventPublisher : IDomainEventPublisher, IDisposable
{
    private readonly IConnection _connection;
    private readonly IModel _channel;
    private readonly ILogger<RabbitMqEventPublisher> _logger;
    private const string ExchangeName = "auth.events";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() },
    };

    public RabbitMqEventPublisher(
        IOptions<RabbitMqOptions> opts,
        ILogger<RabbitMqEventPublisher> logger)
    {
        _logger = logger;

        var factory = new ConnectionFactory
        {
            HostName = opts.Value.Host,
            Port = opts.Value.Port,
            UserName = opts.Value.Username,
            Password = opts.Value.Password,
            VirtualHost = opts.Value.VirtualHost,
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10),
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        // Declare exchange — idempotent, safe to call on every startup
        _channel.ExchangeDeclare(
            exchange: ExchangeName,
            type: ExchangeType.Topic,
            durable: true,
            autoDelete: false);
    }

    public async Task PublishAsync<TEvent>(
        TEvent domainEvent,
        CancellationToken ct = default)
        where TEvent : IDomainEvent
    {
        var routingKey = GetRoutingKey(domainEvent);
        if (routingKey is null)
        {
            _logger.LogDebug(
                "No routing key registered for event type {EventType}. Skipping.",
                typeof(TEvent).Name);
            return;
        }

        var envelope = EventEnvelope.Wrap(domainEvent, routingKey);
        var body = Encoding.UTF8.GetBytes(
            JsonSerializer.Serialize(envelope, JsonOptions));

        var props = _channel.CreateBasicProperties();
        props.ContentType = "application/json";
        props.DeliveryMode = 2; // persistent — survives broker restart
        props.MessageId = domainEvent.EventId.ToString();
        props.Timestamp = new AmqpTimestamp(
            domainEvent.OccurredAt.ToUnixTimeSeconds());
        props.Headers = new Dictionary<string, object>
        {
            ["event-type"] = typeof(TEvent).Name,
            ["event-version"] = domainEvent.Version,
            ["source"] = "auth-service",
        };

        try
        {
            _channel.BasicPublish(
                exchange: ExchangeName,
                routingKey: routingKey,
                basicProperties: props,
                body: body);

            _logger.LogInformation(
                "Published {EventType} with id {EventId} to {RoutingKey}",
                typeof(TEvent).Name,
                domainEvent.EventId,
                routingKey);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to publish {EventType} with id {EventId}",
                typeof(TEvent).Name,
                domainEvent.EventId);
            throw;
        }

        await Task.CompletedTask;
    }

    // Maps domain event types to RabbitMQ routing keys
    private static string? GetRoutingKey(IDomainEvent domainEvent) => domainEvent switch
    {
        UserRegisteredEvent => "auth.user.registered",
        UserLoggedInEvent => "auth.user.login",
        User2FAEnabledEvent => "auth.user.2fa_enabled",
        User2FADisabledEvent => "auth.user.2fa_disabled",
        UserLoggedOutEvent => "auth.user.logout",
        _ => null,
    };

    public void Dispose()
    {
        _channel.Dispose();
        _connection.Dispose();
    }
}

// Versioned envelope — safe for external consumers
// Payload contains only public-safe fields — never internal IDs or secrets
public sealed record EventEnvelope
{
    public Guid EventId { get; init; }
    public string EventType { get; init; } = default!;
    public string RoutingKey { get; init; } = default!;
    public DateTimeOffset OccurredAt { get; init; }
    public int Version { get; init; }
    public string Source { get; init; } = "auth-service";
    public object Payload { get; init; } = default!;

    public static EventEnvelope Wrap<TEvent>(TEvent domainEvent, string routingKey)
        where TEvent : IDomainEvent => new()
        {
            EventId = domainEvent.EventId,
            EventType = typeof(TEvent).Name,
            RoutingKey = routingKey,
            OccurredAt = domainEvent.OccurredAt,
            Version = domainEvent.Version,
            Payload = MapPayload(domainEvent),
        };

    // Each event type exposes only what consumers need
    private static object MapPayload(IDomainEvent e) => e switch
    {
        UserRegisteredEvent ev => new { ev.UserId, ev.Email },
        UserLoggedInEvent ev => new { ev.UserId, ev.MfaUsed },
        User2FAEnabledEvent ev => new { ev.UserId },
        User2FADisabledEvent ev => new { ev.UserId },
        UserLoggedOutEvent ev => new { ev.UserId },
        _ => new { },
    };
}