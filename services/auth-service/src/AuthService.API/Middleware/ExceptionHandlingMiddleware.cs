using AuthService.Domain.Exceptions;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace AuthService.API.Middleware;

public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, problem) = exception switch
        {
            ValidationException validationEx => (
                StatusCodes.Status422UnprocessableEntity,
                CreateProblem(
                    "Validation failed",
                    "VALIDATION_ERROR",
                    StatusCodes.Status422UnprocessableEntity,
                    errors: validationEx.Errors
                        .GroupBy(e => e.PropertyName)
                        .ToDictionary(
                            g => g.Key,
                            g => g.Select(e => e.ErrorMessage).ToArray()))),

            UserAlreadyExistsException ex => (
                StatusCodes.Status409Conflict,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status409Conflict)),

            AccountLockedException ex => (
                StatusCodes.Status423Locked,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status423Locked,
                    lockedUntil: ex.LockedUntil)),

            InvalidCredentialsException ex => (
                StatusCodes.Status401Unauthorized,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status401Unauthorized)),

            InvalidTotpCodeException ex => (
                StatusCodes.Status401Unauthorized,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status401Unauthorized)),

            InvalidTokenException ex => (
                StatusCodes.Status401Unauthorized,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status401Unauthorized)),

            UserNotFoundException ex => (
                StatusCodes.Status404NotFound,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status404NotFound)),

            DomainException ex => (
                StatusCodes.Status400BadRequest,
                CreateProblem(ex.Message, ex.Code, StatusCodes.Status400BadRequest)),

            // Unknown exceptions — log fully, return generic message
            _ => (
                StatusCodes.Status500InternalServerError,
                CreateProblem(
                    "An unexpected error occurred.",
                    "INTERNAL_ERROR",
                    StatusCodes.Status500InternalServerError)),
        };

        // Log 5xx fully with stack trace
        // Log 4xx at warning level — expected domain errors
        if (statusCode >= 500)
            logger.LogError(exception,
                "Unhandled exception for {Method} {Path}",
                context.Request.Method,
                context.Request.Path);
        else
            logger.LogWarning(
                "Domain exception {Code} for {Method} {Path}: {Message}",
                (problem as AuthProblemDetails)?.Code,
                context.Request.Method,
                context.Request.Path,
                exception.Message);

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/problem+json";

        await context.Response.WriteAsync(
            JsonSerializer.Serialize(problem, JsonOptions));
    }

    private static AuthProblemDetails CreateProblem(
        string detail,
        string code,
        int status,
        object? errors = null,
        DateTimeOffset? lockedUntil = null) => new()
        {
            Title = GetTitle(status),
            Detail = detail,
            Code = code,
            Status = status,
            Errors = errors,
            LockedUntil = lockedUntil,
        };

    private static string GetTitle(int status) => status switch
    {
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        409 => "Conflict",
        422 => "Validation Error",
        423 => "Account Locked",
        _ => "Internal Server Error",
    };
}

public sealed class AuthProblemDetails : ProblemDetails
{
    public string Code { get; set; } = default!;
    public object? Errors { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
}