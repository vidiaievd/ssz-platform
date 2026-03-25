using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Infrastructure.Messaging;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Persistence.Repositories;
using AuthService.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace AuthService.Infrastructure.Extensions;

public static class InfrastructureServiceExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions(configuration)
            .AddDatabase(configuration)
            .AddRedis(configuration)
            .AddRepositories()
            .AddSecurityServices()
            .AddMessaging(configuration);

        return services;
    }

    private static IServiceCollection AddOptions(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<AuthOptions>(
            configuration.GetSection(AuthOptions.SectionName));

        services.Configure<RabbitMqOptions>(
            configuration.GetSection(RabbitMqOptions.SectionName));

        return services;
    }

    private static IServiceCollection AddDatabase(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddDbContext<AuthDbContext>(opts =>
        {
            opts.UseNpgsql(
                configuration.GetConnectionString("Postgres"),
                npgsql =>
                {
                    // Retry on transient failures — network blips, DB restarts
                    npgsql.EnableRetryOnFailure(
                        maxRetryCount: 5,
                        maxRetryDelay: TimeSpan.FromSeconds(10),
                        errorCodesToAdd: null);
                });
        });

        return services;
    }

    private static IServiceCollection AddRedis(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Redis connection string is missing.");

        // Singleton — one connection shared across all requests
        services.AddSingleton<IConnectionMultiplexer>(
            _ => ConnectionMultiplexer.Connect(connectionString));

        return services;
    }

    private static IServiceCollection AddRepositories(
        this IServiceCollection services)
    {
        // Scoped — one instance per HTTP request
        // Matches DbContext lifetime
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRoleRepository, RoleRepository>();
        services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        return services;
    }

    private static IServiceCollection AddSecurityServices(
        this IServiceCollection services)
    {
        // Singleton — stateless, thread-safe, expensive to create
        services.AddSingleton<IPasswordHasher, Argon2idPasswordHasher>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddSingleton<ITotpService, TotpService>();
        services.AddSingleton<IEncryptionService, AesGcmEncryptionService>();
        services.AddSingleton<IBackupCodeService, BackupCodeService>();
        services.AddSingleton<IRateLimitStore, RedisRateLimitStore>();
        services.AddSingleton<IOtpReplayGuard, RedisOtpReplayGuard>();

        return services;
    }

    private static IServiceCollection AddMessaging(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Singleton — one RabbitMQ connection for the lifetime of the app
        services.AddSingleton<IDomainEventPublisher, RabbitMqEventPublisher>();

        return services;
    }

    // Applies EF Core migrations on startup
    // Called from Program.cs after app is built
    public static async Task ApplyMigrationsAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
        await db.Database.MigrateAsync();
    }
}
