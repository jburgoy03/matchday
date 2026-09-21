# syntax=docker/dockerfile:1

# ---- Build the React app ----
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Build the .NET API ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/ src/
RUN dotnet publish src/Matchday.Api/Matchday.Api.csproj -c Release -o /app/publish /p:UseAppHost=false
COPY --from=web /web/dist /app/publish/wwwroot

# ---- Runtime image ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0
# Time zone data so "America/New_York" resolves inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Matchday.Api.dll"]