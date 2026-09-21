using System.Net;
using Matchday.Core.Providers;
using Microsoft.Extensions.DependencyInjection;

namespace Matchday.Providers.Espn;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddEspnFootballProvider(this IServiceCollection services)
    {
        services.AddHttpClient<IFootballProvider, EspnFootballProvider>(c =>
            {
                c.BaseAddress = new Uri(EspnFootballProvider.BaseUrl);
                c.Timeout = TimeSpan.FromSeconds(20);
                c.DefaultRequestHeaders.UserAgent.ParseAdd("Matchday/0.1 (personal project)");
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AutomaticDecompression = DecompressionMethods.All, // ESPN gzips some responses
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        return services;
    }
}
