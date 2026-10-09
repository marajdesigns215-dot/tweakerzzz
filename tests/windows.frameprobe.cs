// CI-only Direct3D 11 WARP renderer. Exercises real presentation events without
// requiring a gaming GPU or treating a synthetic test as a game benchmark.
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class FrameProbe : Form {
    [StructLayout(LayoutKind.Sequential)] struct Rational { public uint Numerator, Denominator; }
    [StructLayout(LayoutKind.Sequential)] struct Mode { public uint Width, Height; public Rational Refresh; public int Format, Scanline, Scaling; }
    [StructLayout(LayoutKind.Sequential)] struct Sample { public uint Count, Quality; }
    [StructLayout(LayoutKind.Sequential)] struct Desc { public Mode Buffer; public Sample Sample; public uint Usage, Count; public IntPtr Window; public int Windowed, Effect; public uint Flags; }
    [DllImport("d3d11.dll", CallingConvention = CallingConvention.StdCall)]
    static extern int D3D11CreateDeviceAndSwapChain(IntPtr adapter, int driver, IntPtr software, uint flags, IntPtr levels, uint count, uint sdk, ref Desc desc, out IntPtr swap, out IntPtr device, out int level, out IntPtr context);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetBuffer(IntPtr self, uint index, ref Guid iid, out IntPtr buffer);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateView(IntPtr self, IntPtr resource, IntPtr desc, out IntPtr view);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void ClearView(IntPtr self, IntPtr view, [In] float[] color);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Present(IntPtr self, uint sync, uint flags);
    static T Method<T>(IntPtr obj, int slot) where T : class { return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T)) as T; }
    IntPtr swap, device, context, texture, view;
    readonly Timer timer = new Timer(); readonly Stopwatch clock = new Stopwatch();
    void InitializeRenderer() {
        var desc = new Desc { Buffer = new Mode { Width = 640, Height = 360, Format = 28, Refresh = new Rational { Numerator = 60, Denominator = 1 } }, Sample = new Sample { Count = 1 }, Usage = 0x20, Count = 2, Window = Handle, Windowed = 1 };
        int level;
        Marshal.ThrowExceptionForHR(D3D11CreateDeviceAndSwapChain(IntPtr.Zero, 5, IntPtr.Zero, 0, IntPtr.Zero, 0, 7, ref desc, out swap, out device, out level, out context));
        Guid iid = new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
        Marshal.ThrowExceptionForHR(Method<GetBuffer>(swap, 9)(swap, 0, ref iid, out texture));
        Marshal.ThrowExceptionForHR(Method<CreateView>(device, 9)(device, texture, IntPtr.Zero, out view));
        timer.Interval = 16;
        timer.Tick += delegate {
            try {
                if (clock.Elapsed.TotalSeconds > 55) { Close(); return; }
                Method<ClearView>(context, 50)(context, view, new float[] { (float)(clock.Elapsed.TotalSeconds % 1), .2f, .3f, 1 });
                Marshal.ThrowExceptionForHR(Method<Present>(swap, 8)(swap, 0, 0));
                Console.WriteLine("PRESENT," + clock.Elapsed.TotalMilliseconds.ToString("F4", CultureInfo.InvariantCulture)); Console.Out.Flush();
            } catch (Exception e) { Console.Error.WriteLine(e); Environment.ExitCode = 1; Close(); }
        };
        clock.Start(); timer.Start(); Console.WriteLine("READY"); Console.Out.Flush();
    }
    [STAThread] static void Main() {
        using (var form = new FrameProbe()) {
            form.Text = "Tweakerzzz CI frame probe"; form.Width = 640; form.Height = 360;
            form.Shown += delegate { try { form.InitializeRenderer(); } catch (Exception e) { Console.Error.WriteLine(e); Environment.ExitCode = 1; form.Close(); } };
            Application.Run(form);
            form.timer.Dispose();
            foreach (IntPtr ptr in new IntPtr[] { form.view, form.texture, form.context, form.device, form.swap }) if (ptr != IntPtr.Zero) Marshal.Release(ptr);
        }
    }
}
