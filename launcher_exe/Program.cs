using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

internal static class Program
{
    private const string MutexName = "Global\\CRM_vFinal_EXE_Singleton";

    public static async Task<int> Main(string[] args)
    {
        using var mutex = new Mutex(initiallyOwned: true, name: MutexName, out bool createdNew);
        if (!createdNew)
        {
            var runningUrl = Files.TryReadStateUrl();
            if (!string.IsNullOrWhiteSpace(runningUrl))
            {
                Console.WriteLine($"CRM already running at {runningUrl}");
            }
            else
            {
                Console.WriteLine("CRM already running.");
            }
            return 0;
        }

        StreamWriter? logWriter = null;
        TextWriter? originalOut = null;
        TextWriter? originalErr = null;
        string? runLogPath = null;
        try
        {
            try
            {
                runLogPath = Files.NewRunLog();
                logWriter = new StreamWriter(runLogPath, append: false, Encoding.UTF8) { AutoFlush = true };
                originalOut = Console.Out;
                originalErr = Console.Error;
                var multiOut = new MultiWriter(originalOut, logWriter);
                Console.SetOut(multiOut);
                Console.SetError(new MultiWriter(originalErr, logWriter));
                Log.Info($"Run log: {runLogPath}");
            }
            catch (Exception ex)
            {
                logWriter?.Dispose();
                logWriter = null;
                originalOut = null;
                originalErr = null;
                Console.WriteLine($"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [WARN] Unable to initialize run log: {ex.Message}");
            }

            Log.Info($"Working directory: {Environment.CurrentDirectory}");
            Log.Info($"Executable path: {Environment.ProcessPath ?? "unknown"}");

            var asm = Assembly.GetExecutingAssembly();
            var embedded = new ManifestEmbeddedFileProvider(asm, "crm-app");
            var indexFile = embedded.GetFileInfo("index.html");
            if (!indexFile.Exists)
            {
                Log.Error("Embedded crm-app/index.html not found. Build step failed.");
                return 2;
            }

            int port = Ports.FindFree();
            string baseUrl = $"http://127.0.0.1:{port}/";
            string landingUrl = $"{baseUrl}index.html";
            string launchUrl = $"{landingUrl}?cb={Guid.NewGuid():N}";

            Log.Info($"Selected port: {port}");
            if (!Files.TryWriteStateUrl(landingUrl))
            {
                Log.Warn("Could not persist launcher state file; second launches may not find the running instance.");
            }
            AppDomain.CurrentDomain.ProcessExit += (_, __) => Files.TryRemoveStateUrl();
            Console.CancelKeyPress += (_, __) => Files.TryRemoveStateUrl();

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args,
                ApplicationName = asm.GetName().Name,
                ContentRootPath = AppContext.BaseDirectory
            });
            builder.Logging.ClearProviders();
            builder.WebHost.UseKestrel(options =>
            {
                options.Listen(IPAddress.Loopback, port);
            });

            var provider = new FileExtensionContentTypeProvider();
            provider.Mappings[".mjs"] = "application/javascript";
            provider.Mappings[".wasm"] = "application/wasm";
            provider.Mappings[".webmanifest"] = "application/manifest+json";
            provider.Mappings[".woff"] = "font/woff";
            provider.Mappings[".woff2"] = "font/woff2";

            var app = builder.Build();

            app.Use(async (ctx, next) =>
            {
                ctx.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                ctx.Response.Headers["Pragma"] = "no-cache";
                ctx.Response.Headers["Expires"] = "0";
                ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
                await next();
            });

            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = embedded,
                ContentTypeProvider = provider
            });

            app.MapFallback(async context =>
            {
                context.Response.ContentType = "text/html; charset=utf-8";
                using var stream = indexFile.CreateReadStream();
                await stream.CopyToAsync(context.Response.Body);
            });

            Log.Info($"HTTP server starting at {baseUrl}");
            await app.StartAsync();

            using var httpClient = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
            bool ready = false;
            for (int attempt = 0; attempt < 40; attempt++)
            {
                try
                {
                    using var response = await httpClient.GetAsync(landingUrl);
                    if ((int)response.StatusCode == 200)
                    {
                        var text = await response.Content.ReadAsStringAsync();
                        if (text.IndexOf("<html", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            ready = true;
                            break;
                        }
                    }
                }
                catch
                {
                }

                await Task.Delay(100);
            }

            if (!ready)
            {
                Log.Warn("Server did not pass readiness in time; proceeding to open browser.");
            }
            else
            {
                Log.Info("HTTP server ready.");
            }

            try
            {
                Log.Info($"Opening {launchUrl}");
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = launchUrl,
                    UseShellExecute = true
                };
                System.Diagnostics.Process.Start(psi);
            }
            catch (Exception ex)
            {
                Log.Warn($"Could not open browser automatically: {ex.Message}");
                Log.Info($"Open manually: {launchUrl}");
            }

            Log.Info("Press Ctrl+C in this window to stop the CRM server.");

            var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
            lifetime.ApplicationStopping.Register(Files.TryRemoveStateUrl);

            await app.WaitForShutdownAsync();
            return 0;
        }
        catch (Exception ex)
        {
            Log.Error(ex.ToString());
            return 1;
        }
        finally
        {
            Files.TryRemoveStateUrl();
            if (originalOut != null)
            {
                Console.SetOut(originalOut);
            }
            if (originalErr != null)
            {
                Console.SetError(originalErr);
            }
            logWriter?.Dispose();
            if (createdNew)
            {
                try
                {
                    mutex.ReleaseMutex();
                }
                catch
                {
                }
            }
        }
    }
}

internal static class Log
{
    private static string Timestamp => DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

    public static void Info(string message)
    {
        Console.Out.WriteLine($"{Timestamp} [INFO] {message}");
    }

    public static void Warn(string message)
    {
        Console.Out.WriteLine($"{Timestamp} [WARN] {message}");
    }

    public static void Error(string message)
    {
        Console.Out.WriteLine($"{Timestamp} [ERROR] {message}");
    }
}

internal static class Ports
{
    public static int FindFree()
    {
        var preferred = Enumerable.Range(8080, 20).Concat(Enumerable.Range(8100, 100));
        foreach (var port in preferred)
        {
            try
            {
                var listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                listener.Stop();
                return port;
            }
            catch
            {
            }
        }

        throw new InvalidOperationException("No free port found in 8080-8199");
    }
}

internal static class Files
{
    public static string BaseDir()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CRM");
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static string LogDir()
    {
        var dir = Path.Combine(BaseDir(), "logs");
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static string StateFilePath()
    {
        return Path.Combine(BaseDir(), "launcher_state.txt");
    }

    public static string NewRunLog()
    {
        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        return Path.Combine(LogDir(), $"launcher_{stamp}.log");
    }

    public static bool TryWriteStateUrl(string url)
    {
        var path = StateFilePath();
        try
        {
            File.WriteAllText(path, url);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static string? TryReadStateUrl()
    {
        var path = StateFilePath();
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var text = File.ReadAllText(path).Trim();
            return string.IsNullOrEmpty(text) ? null : text;
        }
        catch
        {
            return null;
        }
    }

    public static void TryRemoveStateUrl()
    {
        var path = StateFilePath();
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }
}

internal sealed class MultiWriter : TextWriter
{
    private readonly TextWriter _first;
    private readonly TextWriter _second;

    public MultiWriter(TextWriter first, TextWriter second)
    {
        _first = first;
        _second = second;
    }

    public override Encoding Encoding => _first.Encoding;

    public override void Write(char value)
    {
        _first.Write(value);
        _second.Write(value);
    }

    public override void Write(char[] buffer, int index, int count)
    {
        _first.Write(buffer, index, count);
        _second.Write(buffer, index, count);
    }

    public override void Write(string? value)
    {
        _first.Write(value);
        _second.Write(value);
    }

    public override void WriteLine(string? value)
    {
        _first.WriteLine(value);
        _second.WriteLine(value);
    }

    public override void Flush()
    {
        _first.Flush();
        _second.Flush();
    }
}
