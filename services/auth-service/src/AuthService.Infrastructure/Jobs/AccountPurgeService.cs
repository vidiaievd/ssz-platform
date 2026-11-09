using AuthService.Application.Commands;
using AuthService.Application.Options;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AuthService.Infrastructure.Jobs;

/// <summary>
/// Erases accounts whose deletion grace period is over: on start, then every
/// <see cref="AuthOptions.AccountPurgeInterval"/>. Each account runs in its own scope, so one
/// that fails (its event did not publish, the delete hit an error) stays for the next run
/// without holding up the rest.
/// </summary>
public sealed class AccountPurgeService(
    IServiceScopeFactory scopeFactory,
    IOptions<AuthOptions> authOptions,
    ILogger<AccountPurgeService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(authOptions.Value.AccountPurgeInterval);
        do
        {
            try
            {
                await PurgeDueAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Account purge run failed — retrying at the next interval");
            }
        }
        while (await timer.WaitForNextTickAsync(ct));
    }

    private async Task PurgeDueAsync(CancellationToken ct)
    {
        List<Guid> due;
        using (var scope = scopeFactory.CreateScope())
        {
            var mediator = scope.ServiceProvider.GetRequiredService<ISender>();
            due = await mediator.Send(new ListAccountsDueForPurgeQuery(), ct);
        }

        foreach (var userId in due)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var mediator = scope.ServiceProvider.GetRequiredService<ISender>();
                if (await mediator.Send(new PurgeAccountCommand(userId), ct))
                    logger.LogInformation("Account {UserId} erased after its deletion grace period", userId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Failed to erase account {UserId} — left for the next run", userId);
            }
        }
    }
}
