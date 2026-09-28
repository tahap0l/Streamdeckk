using StreamDeckk.Core;

Log.Init(ConfigStore.DataDir, console: true);
var (result, app) = await DeckApp.StartAsync(new SimulatedPlatform());
if (result == DeckApp.StartResult.AlreadyRunning) return;

var done = new TaskCompletionSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; done.TrySetResult(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) => done.TrySetResult();
await done.Task;
app!.Stop();
