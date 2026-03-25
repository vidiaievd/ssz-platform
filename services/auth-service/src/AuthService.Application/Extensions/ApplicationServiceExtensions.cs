using AuthService.Application.Behaviors;
using AuthService.Application.Commands;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

namespace AuthService.Application.Extensions;

public static class ApplicationServiceExtensions
{
    public static IServiceCollection AddApplication(
        this IServiceCollection services)
    {
        // Register all command handlers from Application assembly
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(
                typeof(RegisterUserCommand).Assembly);

            // Validation runs before every command handler
            cfg.AddBehavior(
                typeof(IPipelineBehavior<,>),
                typeof(ValidationBehavior<,>));
        });

        // Register all validators from Application assembly
        services.AddValidatorsFromAssembly(
            typeof(RegisterUserCommand).Assembly);

        return services;
    }
}