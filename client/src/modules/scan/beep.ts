/** Short sound so people on the floor know the result without looking at the screen */
export function beep(good: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = good ? 880 : 220; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start();
    o.stop(ctx.currentTime + (good ? 0.12 : 0.45));
    o.onended = () => void ctx.close();
  } catch { /* no sound is fine */ }
}
