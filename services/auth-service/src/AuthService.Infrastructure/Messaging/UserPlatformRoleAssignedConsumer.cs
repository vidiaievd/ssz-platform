using AuthService.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AuthService.Infrastructure.Messaging;

public sealed class UserPlatformRoleAssignedConsumer(
    IServiceScopeFactory scopeFactory,
    IOptions<RabbitMqOptions> opts,
    ILogger<UserPlatformRoleAssignedConsumer> logger)
    : BackgroundService
{
    private const string ConsumeExchange = "organization.events";
    private const string Queue = "auth_service_platform_role_queue";
    private const string RoutingKey = "user.platform.role.assigned";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() },
    };

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await RunAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Consumer error — reconnecting in 10 s");
                await Task.Delay(TimeSpan.FromSeconds(10), ct);
            }
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var o = opts.Value;
        var factory = new ConnectionFactory
        {
            HostName = o.Host,
            Port = o.Port,
            UserName = o.Username,
            Password = o.Password,
            VirtualHost = o.VirtualHost,
            DispatchConsumersAsync = true,
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10),
        };

        using var connection = factory.CreateConnection();
        using var channel = connection.CreateModel();

        channel.ExchangeDeclare(ConsumeExchange, ExchangeType.Topic, durable: true, autoDelete: false);
        channel.QueueDeclare(Queue, durable: true, exclusive: false, autoDelete: false);
        channel.QueueBind(Queue, ConsumeExchange, RoutingKey);
        channel.BasicQos(0, 1, false);

        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        ct.Register(() => tcs.TrySetCanceled());

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.Received += async (_, ea) =>
        {
            await ProcessAsync(channel, ea, ct);
        };

        channel.BasicConsume(Queue, autoAck: false, consumer);
        logger.LogInformation("Consumer ready — queue \"{Queue}\"", Queue);

        await tcs.Task;
    }

    private async Task ProcessAsync(IModel channel, BasicDeliverEventArgs ea, CancellationToken ct)
    {
        string? eventId = null;
        try
        {
            var body = Encoding.UTF8.GetString(ea.Body.Span);
            var envelope = JsonSerializer.Deserialize<RoleAssignedEnvelope>(body, JsonOpts);

            if (envelope?.Payload is null)
            {
                logger.LogWarning("Received empty or malformed message — nacking without requeue");
                channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
                return;
            }

            eventId = envelope.EventId;
            var userId = envelope.Payload.UserId;
            var platformRole = envelope.Payload.PlatformRole;

            logger.LogInformation(
                "Processing user.platform.role.assigned: userId={UserId}, role={Role}",
                userId, platformRole);

            using var scope = scopeFactory.CreateScope();
            var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
            var roleRepo = scope.ServiceProvider.GetRequiredService<IRoleRepository>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var user = await userRepo.FindByIdWithRolesAsync(userId, ct);
            if (user is null)
            {
                logger.LogWarning("User {UserId} not found — nacking without requeue", userId);
                channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
                return;
            }

            var role = await roleRepo.FindByNameAsync(platformRole, ct);
            if (role is null)
            {
                logger.LogWarning("Role '{Role}' not found — nacking without requeue", platformRole);
                channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
                return;
            }

            // AssignRole is idempotent — skips if user already has this role
            user.AssignRole(role);
            await unitOfWork.SaveChangesAsync(ct);

            channel.BasicAck(ea.DeliveryTag, multiple: false);
            logger.LogInformation(
                "Role '{Role}' assigned to userId={UserId} [eventId={EventId}]",
                platformRole, userId, eventId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Failed to process event {EventId} — nacking without requeue", eventId ?? "unknown");
            channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
        }
    }

    // Envelope shape published by Organization Service
    private sealed class RoleAssignedEnvelope
    {
        public string EventId { get; init; } = default!;
        public RoleAssignedPayload? Payload { get; init; }
    }

    private sealed class RoleAssignedPayload
    {
        public Guid UserId { get; init; }
        public string PlatformRole { get; init; } = default!;
    }
}
