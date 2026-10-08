// Original interop implementation. NVIDIA DVC Ex ABI reference:
// https://github.com/falahati/NvAPIWrapper (Native/Delegates/Display.cs,
// Native/Display/Structures/PrivateDisplayDVCInfoEx.cs, FunctionId.cs).
// These private driver entry points are capability-checked; no DLL is downloaded.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

internal static class ColorAgent {
    [StructLayout(LayoutKind.Sequential)] internal struct Dvc { public uint version; public int current, minimum, maximum, normal; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Device {
        public int size;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string name;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string description;
        public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string id;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string key;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryEx(string name, IntPtr file, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module, string name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string name, uint index, ref Device device, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr Query(uint id);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Init();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Enumerate(uint index, out IntPtr display);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Name(IntPtr display, StringBuilder name);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Color(IntPtr display, uint output, ref Dvc info);
    static Query query; static Enumerate enumerate; static Name displayName; static Color readColor, writeColor;
    static JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 131072, RecursionLimit = 20 };
    static Dictionary<string, object> configuration;
    static readonly BlockingCollection<string> input = new BlockingCollection<string>(50);
    static string journal, error = "", activeProgram = "Desktop";
    static bool active, restoring;
    static string selected = "", physical = "";
    static int original, lastLevel = Int32.MinValue;
    static List<Screen> displays = new List<Screen>();
    sealed class Screen { public string id, label, physical; public IntPtr handle; public Dvc color; }

    static T Api<T>(uint id) where T : class {
        var ptr = query(id); if (ptr == IntPtr.Zero) throw new Exception("This NVIDIA driver does not expose digital vibrance control.");
        return Marshal.GetDelegateForFunctionPointer(ptr, typeof(T)) as T;
    }
    static void Check(int status, string operation) { if (status != 0) throw new Exception(operation + " was rejected by the NVIDIA driver (" + status + ")."); }
    static Dvc Read(IntPtr handle) {
        var info = new Dvc { version = 0x10014 };
        Check(readColor(handle, 0, ref info), "Reading vibrance");
        if (info.minimum >= info.maximum || info.current < info.minimum || info.current > info.maximum || info.minimum < -10000 || info.maximum > 10000) throw new Exception("Unsupported vibrance range.");
        return info;
    }
    static List<Screen> EnumerateScreens() {
        var result = new List<Screen>();
        for (uint i = 0; i < 32; i++) {
            IntPtr handle; var status = enumerate(i, out handle);
            if (status == -7) break; // NVAPI_END_ENUMERATION
            Check(status, "Display enumeration");
            var name = new StringBuilder(64); Check(displayName(handle, name), "Display name");
            var device = new Device { size = Marshal.SizeOf(typeof(Device)) };
            // Interface path identifies the monitor, not just its volatile DISPLAY number.
            if (!EnumDisplayDevices(name.ToString(), 0, ref device, 1) || String.IsNullOrWhiteSpace(device.id)) continue;
            try { result.Add(new Screen { id = name.ToString(), label = name + " · " + device.description, physical = device.id, handle = handle, color = Read(handle) }); }
            catch { /* An attached unsupported output is never treated as controllable. */ }
        }
        return result;
    }
    static void Initialize() {
        var dll = LoadLibraryEx(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "nvapi64.dll"), IntPtr.Zero, 0x800);
        if (dll == IntPtr.Zero) throw new Exception("NVIDIA desktop digital vibrance is unavailable. A supported display must be connected directly to the NVIDIA GPU.");
        var ptr = GetProcAddress(dll, "nvapi_QueryInterface");
        if (ptr == IntPtr.Zero) throw new Exception("NVIDIA API is unavailable.");
        query = (Query)Marshal.GetDelegateForFunctionPointer(ptr, typeof(Query));
        Check(Api<Init>(0x0150E828)(), "NVIDIA initialization");
        enumerate = Api<Enumerate>(0x9ABDD40D); displayName = Api<Name>(0x22A78B05);
        readColor = Api<Color>(0x0E45002D); writeColor = Api<Color>(0x4A82C2B1);
        displays = EnumerateScreens();
        if (displays.Count == 0) throw new Exception("No NVIDIA display with supported digital vibrance was found. Hybrid, remote, and unsupported outputs are not controlled.");
    }
    static void Write(Screen screen, int level) {
        var info = Read(screen.handle);
        if (level < info.minimum || level > info.maximum) throw new Exception("Vibrance is outside the driver range.");
        if (info.current == level) return;
        info.current = level; Check(writeColor(screen.handle, 0, ref info), "Setting vibrance");
        if (Read(screen.handle).current != level) throw new Exception("The NVIDIA driver did not retain the requested level.");
    }
    internal static int Percent(object value) {
        if (!(value is int) || (int)value < 0 || (int)value > 100) throw new Exception("Vibrance must be an integer from 0 to 100.");
        return (int)value;
    }
    static string Text(Dictionary<string, object> data, string key) { object value; return data.TryGetValue(key, out value) && value is string ? (string)value : ""; }
    internal static Dictionary<string, object> Validate(object inputConfig) {
        var cfg = inputConfig as Dictionary<string, object>;
        if (cfg == null || !cfg.ContainsKey("desktop") || !cfg.ContainsKey("profiles") || !cfg.ContainsKey("sdrConfirmed") || !Object.Equals(cfg["sdrConfirmed"], true)) throw new Exception("Confirm SDR mode and provide display profiles.");
        if (!Regex.IsMatch(Text(cfg, "displayId"), @"^\\\\\.\\DISPLAY\d{1,2}$")) throw new Exception("Select a detected display.");
        Percent(cfg["desktop"]);
        var profiles = cfg["profiles"] as object[];
        if (profiles == null || profiles.Length > 50) throw new Exception("At most 50 program profiles are supported.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in profiles) {
            var row = item as Dictionary<string, object>;
            var name = row == null ? "" : Text(row, "processName");
            if (name.Length > 128 || !Regex.IsMatch(name, @"^[^<>:""/\\|?*\x00-\x1f]+\.exe$", RegexOptions.IgnoreCase) || !names.Add(name)) throw new Exception("Profiles need unique executable names, such as game.exe.");
            if (!row.ContainsKey("vibrance")) throw new Exception("Missing vibrance level.");
            Percent(row["vibrance"]);
        }
        return cfg;
    }
    internal static string Foreground() {
        uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        if (pid == 0) return "";
        try { using (var process = Process.GetProcessById((int)pid)) return process.ProcessName + ".exe"; }
        catch { return ""; } // inaccessible, exited, or secure desktop -> desktop default
    }
    internal static int Match(Dictionary<string, object> cfg, string exe) {
        foreach (Dictionary<string, object> row in (object[])cfg["profiles"]) if (String.Equals(Text(row, "processName"), exe, StringComparison.OrdinalIgnoreCase)) return (int)row["vibrance"];
        return (int)cfg["desktop"];
    }
    static Screen Locate() {
        var current = EnumerateScreens().Find(s => s.id == selected && s.physical == physical);
        if (current == null) throw new Exception("The selected monitor disconnected or changed. Reconnect it before restoring; profiles have stopped.");
        return current;
    }
    static void Begin(object cfg) {
        if (active) throw new Exception("Stop the observer before editing profiles.");
        if (File.Exists(journal)) throw new Exception("Restore the previous color session before starting a new one.");
        configuration = Validate(cfg);
        displays = EnumerateScreens();
        var screen = displays.Find(s => s.id == Text(configuration, "displayId"));
        if (screen == null) throw new Exception("That display is no longer available.");
        selected = screen.id; physical = screen.physical; original = screen.color.current;
        var saved = new { version = 1, displayId = selected, physical = physical, level = original };
        // Persist the exact original before the first driver write. Never overwrite an unresolved session.
        using (var file = new FileStream(journal, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
            var bytes = Encoding.UTF8.GetBytes(json.Serialize(saved)); file.Write(bytes, 0, bytes.Length); file.Flush(true);
        }
        active = true; error = ""; lastLevel = Int32.MinValue;
        Tick();
    }
    static void Tick() {
        if (!active) return;
        var screen = Locate();
        var exe = Foreground(); var percent = Match(configuration, exe);
        var level = screen.color.minimum + (int)Math.Round((screen.color.maximum - screen.color.minimum) * percent / 100.0);
        var name = ((object[])configuration["profiles"]).Cast<Dictionary<string, object>>().Any(r => String.Equals(Text(r, "processName"), exe, StringComparison.OrdinalIgnoreCase)) ? exe : "Desktop";
        // Stop on another app changing the same setting rather than fighting it.
        if (lastLevel != Int32.MinValue && screen.color.current != lastLevel) throw new Exception("Vibrance changed outside Tweakerzzz. The observer stopped to avoid competing color controllers.");
        Write(screen, level);
        bool changed = name != activeProgram || level != lastLevel;
        activeProgram = name; lastLevel = level;
        if (changed) Emit(null);
    }
    static void Restore() {
        if (restoring) return;
        restoring = true; active = false;
        try {
            if (File.Exists(journal)) {
                var saved = (Dictionary<string, object>)json.DeserializeObject(File.ReadAllText(journal));
                if (!Object.Equals(saved["version"], 1) || !(saved["level"] is int)) throw new Exception("The recovery record is invalid. Keep it and use NVIDIA Control Panel to restore colors.");
                selected = Text(saved, "displayId"); physical = Text(saved, "physical");
                Write(Locate(), (int)saved["level"]);
                File.Delete(journal);
            }
            lastLevel = Int32.MinValue; activeProgram = "Desktop";
        } finally { restoring = false; }
    }
    static void Emit(object requestId) {
        Console.WriteLine(json.Serialize(new { ok = true, requestId = requestId, data = new { active = active, activeProgram = activeProgram, supported = displays.Count > 0, error = error, recoveryPending = File.Exists(journal), displays = displays.Select(s => new { id = s.id, label = s.label, vibrance = (int)Math.Round(100.0 * (s.color.current - s.color.minimum) / (s.color.maximum - s.color.minimum)) }).ToArray() } }));
        Console.Out.Flush();
    }
    internal static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false); Console.InputEncoding = new UTF8Encoding(false);
        if (args.Length == 1 && args[0] == "--self-test") return SelfTest();
        if (args.Length != 1 || !Path.IsPathRooted(args[0])) return 2;
        journal = args[0];
        try { Initialize(); } catch (Exception e) { error = e.Message; displays.Clear(); Emit(null); return 0; }
        var reader = new Thread(() => { try { string line; while ((line = Console.ReadLine()) != null) { if (line.Length > 65536) break; input.Add(line); } } catch { } finally { input.CompleteAdding(); } }); reader.IsBackground = true; reader.Start();
        Emit(null);
        try {
            while (!input.IsCompleted) {
                string line;
                if (input.TryTake(out line, 500)) {
                    object id = null;
                    try {
                        var request = (Dictionary<string, object>)json.DeserializeObject(line); request.TryGetValue("requestId", out id);
                        switch (Text(request, "action")) {
                            case "start": Begin(request["config"]); break;
                            case "stop": Restore(); error = ""; break;
                            default: throw new Exception("Unsupported color action.");
                        }
                        Emit(id);
                    } catch (Exception e) {
                        error = e.Message;
                        try { if (active) Restore(); } catch (Exception r) { error += " Restore needs attention: " + r.Message; }
                        Console.WriteLine(json.Serialize(new { ok = false, requestId = id, error = error })); Emit(null);
                    }
                }
                try { Tick(); } catch (Exception e) { error = e.Message; try { Restore(); } catch (Exception r) { error += " Restore needs attention: " + r.Message; } Emit(null); }
            }
        } finally {
            try { Restore(); } catch (Exception e) { error = "Restore needs attention: " + e.Message; }
            Emit(null);
        }
        return File.Exists(journal) ? 1 : 0;
    }
    static int SelfTest() {
        var cfg = Validate(json.DeserializeObject("{\"displayId\":\"\\\\\\\\.\\\\DISPLAY1\",\"desktop\":50,\"sdrConfirmed\":true,\"profiles\":[{\"processName\":\"game.exe\",\"vibrance\":72}]}"));
        if (Match(cfg, "GAME.EXE") != 72 || Match(cfg, "game-launcher.exe") != 50 || Match(cfg, "") != 50) throw new Exception("Foreground matching failed.");
        bool invalid = false; try { Percent(101); } catch { invalid = true; } if (!invalid) throw new Exception("Range check failed.");
        if (Marshal.SizeOf(typeof(Dvc)) != 20) throw new Exception("Unexpected NVIDIA ABI layout.");
        Foreground();
        Console.WriteLine("PASS: native color profile matching, bounds, ABI layout, and Windows foreground query. No display settings changed."); return 0;
    }
}
