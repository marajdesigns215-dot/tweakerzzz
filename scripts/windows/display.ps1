#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
    $request = [Console]::In.ReadLine() | ConvertFrom-Json
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
public static class TweakerDisplay {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Mode {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public uint dmFields;
        public int dmPositionX, dmPositionY;
        public uint dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
        public uint dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplaySettings(string device, int number, ref Mode mode);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int ChangeDisplaySettingsEx(string device, ref Mode mode, IntPtr hwnd, uint flags, IntPtr param);
    private static Mode Empty() { Mode m = new Mode(); m.dmSize = (ushort)Marshal.SizeOf(typeof(Mode)); return m; }
    public static Mode Current() {
        Mode m = Empty();
        if (!EnumDisplaySettings(null, -1, ref m)) throw new Exception("Windows could not read the primary display mode.");
        return m;
    }
    public static Mode[] Modes() {
        var result = new List<Mode>();
        Mode current = Current();
        for (int index = 0; index < 10000; index++) {
            Mode m = Empty();
            if (!EnumDisplaySettings(null, index, ref m)) break;
            if (m.dmBitsPerPel == current.dmBitsPerPel && m.dmDisplayOrientation == current.dmDisplayOrientation && m.dmDisplayFrequency >= 23) result.Add(m);
        }
        return result.ToArray();
    }
    public static void Apply(int width, int height, int frequency, bool persist) {
        foreach (Mode candidate in Modes()) {
            if (candidate.dmPelsWidth != width || candidate.dmPelsHeight != height || candidate.dmDisplayFrequency != frequency) continue;
            Mode m = candidate;
            // Change only these fields. Do not alter desktop positioning,
            // orientation, HDR, color depth, or manufacture custom timings.
            m.dmFields = 0x00080000 | 0x00100000 | 0x00400000;
            int test = ChangeDisplaySettingsEx(null, ref m, IntPtr.Zero, 2, IntPtr.Zero);
            if (test != 0) throw new Exception("The display driver rejected this mode (code " + test + ").");
            int result = ChangeDisplaySettingsEx(null, ref m, IntPtr.Zero, persist ? 1u : 0u, IntPtr.Zero);
            if (result != 0) throw new Exception("Windows could not apply this display mode (code " + result + ").");
            return;
        }
        throw new Exception("This resolution and refresh rate are not exposed by your display driver.");
    }
    public static string AwaitDecision(int milliseconds) {
        // Use a background task because Console.In.ReadLineAsync can block
        // synchronously on Windows PowerShell's synchronized console reader.
        Task<string> read = Task.Factory.StartNew(() => Console.ReadLine());
        return read.Wait(milliseconds) ? read.Result : null;
    }
}
'@
    function Format-Mode($mode) {
        return [ordered]@{ width = [int]$mode.dmPelsWidth; height = [int]$mode.dmPelsHeight; refreshRate = [int]$mode.dmDisplayFrequency }
    }
    switch ($request.action) {
        'list' {
            $data = @([TweakerDisplay]::Modes() | ForEach-Object { Format-Mode $_ } | Sort-Object -Property width, height, refreshRate -Unique)
        }
        'current' { $data = Format-Mode ([TweakerDisplay]::Current()) }
        'set' {
            $mode = $request.mode
            foreach ($property in @('width', 'height', 'refreshRate')) {
                if ($mode.$property -isnot [int] -and $mode.$property -isnot [long]) { throw 'Display mode fields must be integers.' }
            }
            if ($mode.width -lt 320 -or $mode.width -gt 16384 -or $mode.height -lt 200 -or $mode.height -gt 16384 -or $mode.refreshRate -lt 23 -or $mode.refreshRate -gt 1000) { throw 'Display mode is out of range.' }
            [TweakerDisplay]::Apply($mode.width, $mode.height, $mode.refreshRate, ($request.persist -eq $true))
            $data = @{ message = 'Primary display mode updated.' }
        }
        'test' {
            $mode = $request.mode
            foreach ($property in @('width', 'height', 'refreshRate')) {
                if ($mode.$property -isnot [int] -and $mode.$property -isnot [long]) { throw 'Display mode fields must be integers.' }
            }
            if ($mode.width -lt 320 -or $mode.width -gt 16384 -or $mode.height -lt 200 -or $mode.height -gt 16384 -or $mode.refreshRate -lt 23 -or $mode.refreshRate -gt 1000) { throw 'Display mode is out of range.' }
            $original = [TweakerDisplay]::Current()
            $restoreNeeded = $true
            try {
                [TweakerDisplay]::Apply($mode.width, $mode.height, $mode.refreshRate, $false)
                [Console]::Out.WriteLine((@{ ok = $true; data = @{ event = 'applied' } } | ConvertTo-Json -Compress))
                [Console]::Out.Flush()
                $decision = [TweakerDisplay]::AwaitDecision(15000)
                if ($decision -eq 'confirm') {
                    [TweakerDisplay]::Apply($mode.width, $mode.height, $mode.refreshRate, $true)
                    $restoreNeeded = $false
                    $data = @{ event = 'confirmed' }
                } else {
                    [TweakerDisplay]::Apply($original.dmPelsWidth, $original.dmPelsHeight, $original.dmDisplayFrequency, $false)
                    $restoreNeeded = $false
                    $data = @{ event = 'reverted' }
                }
            } catch {
                $originalFailure = $_.Exception.Message
                if ($restoreNeeded) {
                    try { [TweakerDisplay]::Apply($original.dmPelsWidth, $original.dmPelsHeight, $original.dmDisplayFrequency, $false) }
                    catch { throw ('The display test failed and the driver rejected restoring the original mode. Open Windows Display Settings. Details: ' + $_.Exception.Message) }
                }
                throw $originalFailure
            }
        }
        default { throw 'Unsupported display operation.' }
    }
    [Console]::Out.WriteLine((@{ ok = $true; data = $data } | ConvertTo-Json -Depth 6 -Compress))
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
