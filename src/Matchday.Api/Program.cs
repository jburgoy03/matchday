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

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.MapMatchdayApi();

app.Run();