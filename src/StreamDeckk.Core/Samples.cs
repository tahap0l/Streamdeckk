namespace StreamDeckk.Core;

/// <summary>İlk çalıştırmada örnek ses efektlerini (WAV) sentezler; harici dosya gerekmez.</summary>
public static class Samples
{
    const int Rate = 44100;
    const double Tau = Math.PI * 2;

    static readonly Dictionary<string, Func<float[]>> All = new()
    {
        ["ding.wav"] = () => Render(1.4, t => (Math.Sin(Tau * 1318 * t) * 0.5 + Math.Sin(Tau * 2637 * t) * 0.2) * Math.Exp(-t * 3.5)),
        ["tada.wav"] = () =>
        {
            double[] notes = { 523, 659, 784, 1047 };
            return Render(1.6, t =>
            {
                double s = 0;
                for (var i = 0; i < notes.Length; i++)
                {
                    var st = i * 0.09;
                    if (t < st) continue;
                    var lt = t - st;
                    var env = Math.Min(1, lt * 60) * Math.Exp(-lt * (i == 3 ? 2 : 6));
                    s += (Math.Sin(Tau * notes[i] * lt) + 0.3 * Math.Sin(Tau * notes[i] * 2 * lt)) * env * 0.3;
                }
                return s;
            });
        },
        ["sansur-bip.wav"] = () => Render(0.7, t => Math.Sin(Tau * 1000 * t) * 0.45 * Math.Min(1, Math.Min(t * 200, (0.7 - t) * 200))),
        ["korna.wav"] = () => Render(1.2, t =>
        {
            var vib = 1 + 0.01 * Math.Sin(Tau * 6 * t);
            double s = 0;
            foreach (var f in new double[] { 440, 554, 659 })
                for (var h = 1; h <= 6; h++) s += Math.Sin(Tau * f * h * vib * t) / h;
            return Math.Tanh(s * 0.35) * 0.6 * Math.Min(1, Math.Min(t * 30, (1.2 - t) * 8));
        }),
    };

    static float[] Render(double seconds, Func<double, double> fn)
    {
        var o = new float[(int)(Rate * seconds)];
        for (var i = 0; i < o.Length; i++) o[i] = (float)fn((double)i / Rate);
        return o;
    }

    static byte[] Wav(float[] samples)
    {
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write("RIFF"u8); w.Write(36 + samples.Length * 2); w.Write("WAVEfmt "u8);
        w.Write(16); w.Write((short)1); w.Write((short)1); w.Write(Rate); w.Write(Rate * 2); w.Write((short)2); w.Write((short)16);
        w.Write("data"u8); w.Write(samples.Length * 2);
        foreach (var s in samples) w.Write((short)Math.Round(Math.Clamp(s, -1f, 1f) * 32000));
        w.Flush();
        return ms.ToArray();
    }

    public static void WriteAll(string dir)
    {
        Directory.CreateDirectory(dir);
        foreach (var (name, gen) in All)
        {
            var p = Path.Combine(dir, name);
            if (!File.Exists(p)) File.WriteAllBytes(p, Wav(gen()));
        }
    }
}
