using Matchday.Api;
using Matchday.Data;
using Matchday.Providers.Espn;
using Matchday.Sync;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<MatchdayDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Matchday")));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddEspnFootballProvider();
builder.Services.AddScoped<MatchSyncService>();
builder.Services.AddHostedService<SyncWorker>();

builder.Services.AddOpenApi();

var app = builder.Build();

// Create or upgrade the schema on startup, so a fresh deployment needs no manual migration step.
await using (var scope = app.Services.CreateAsyncScope())
    await scope.ServiceProvider.GetRequiredService<MatchdayDbContext>().Database.MigrateAsync();

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

// Serve the built React app from wwwroot (populated by the Dockerfile).
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapMatchdayApi();

// Deep links like /match/12 or /table load index.html and let React Router take over.
app.MapFallbackToFile("index.html");

app.Run();