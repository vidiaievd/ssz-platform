using HealthChecks.NpgSql;
using AuthService.Application.Extensions;
using AuthService.Application.Options;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Extensions;
using AuthService.API.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ───────────────────────────────────────────────────────────────────
builder.Host.UseSerilog((ctx, cfg) =>
{
    cfg.ReadFrom.Configuration(ctx.Configuration)
       .Enrich.FromLogContext()
       .Enrich.WithMachineName()
       .WriteTo.Console(
           outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] " +
                           "{CorrelationId} {Message:lj}{NewLine}{Exception}");
});

// ── Application + Infrastructure ──────────────────────────────────────────────
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

// ── JWT Authentication ────────────────────────────────────────────────────────
var authOptions = builder.Configuration
    .GetSection(AuthOptions.SectionName)
    .Get<AuthOptions>()
    ?? throw new InvalidOperationException("Auth configuration is missing.");

var publicRsa = RSA.Create();
publicRsa.ImportFromPem(File.ReadAllText(authOptions.PublicKeyPath));
var publicKey = new RsaSecurityKey(publicRsa) { KeyId = "auth-v1" };

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = authOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = authOptions.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = publicKey,
            ClockSkew = TimeSpan.FromSeconds(30),
        };

        opts.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                // Never leak exception details
                ctx.Response.Headers["WWW-Authenticate"] =
                    "Bearer error=\"invalid_token\"";
                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization(opts =>
{
    opts.AddPolicy("AdminOnly",      p => p.RequireRole(RoleNames.PlatformAdmin));
    opts.AddPolicy("PremiumOrAdmin", p => p.RequireRole(RoleNames.Premium, RoleNames.PlatformAdmin));
});

// ── Controllers + Swagger ─────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(opts =>
{
    opts.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Auth Service API",
        Version = "v1",
        Description = "Authentication and authorization service for SSZ Platform.",
    });

    opts.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Enter your JWT access token.",
    });

    opts.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer",
                }
            },
            []
        }
    });
});

// ── Health checks ─────────────────────────────────────────────────────────────
builder.Services.AddHealthChecks()
    .AddNpgSql(
        connectionString: builder.Configuration.GetConnectionString("Postgres")!,
        name: "postgres");

// ── Build ─────────────────────────────────────────────────────────────────────
var app = builder.Build();

// Apply EF Core migrations on startup
await app.Services.ApplyMigrationsAsync();

// ── Middleware pipeline ───────────────────────────────────────────────────────
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseSerilogRequestLogging(opts =>
{
    opts.EnrichDiagnosticContext = (diag, ctx) =>
    {
        diag.Set("UserAgent", ctx.Request.Headers.UserAgent.ToString());
        diag.Set("RemoteIp", ctx.Connection.RemoteIpAddress?.ToString());
        // Never log Authorization header
    };
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(opts =>
        opts.SwaggerEndpoint("/swagger/v1/swagger.json", "Auth Service v1"));
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health");

app.Run();