# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS builder

WORKDIR /src

# Restore — layer-cached unless .csproj files change
COPY AuthService.sln ./
COPY src/AuthService.Domain/AuthService.Domain.csproj               src/AuthService.Domain/
COPY src/AuthService.Application/AuthService.Application.csproj     src/AuthService.Application/
COPY src/AuthService.Infrastructure/AuthService.Infrastructure.csproj src/AuthService.Infrastructure/
COPY src/AuthService.API/AuthService.API.csproj                     src/AuthService.API/
RUN dotnet restore

# Copy everything and publish
COPY . .
RUN dotnet publish src/AuthService.API/AuthService.API.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runner

WORKDIR /app

# curl for docker-compose healthcheck
RUN apk add --no-cache curl

COPY --from=builder /app/publish .

# JWT keys are mounted at runtime (docker secret or bind mount)
RUN mkdir -p keys

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "AuthService.API.dll"]
