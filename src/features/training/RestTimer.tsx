import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';

export type RestPresetSec = 90 | 120 | 180;

export interface RestTimerExternalStart {
  durationSec: RestPresetSec;
  key: number;
}

export interface RestTimerProps {
  externalStart?: RestTimerExternalStart | null;
}

const REST_PRESETS: ReadonlyArray<{ label: string; sec: RestPresetSec }> = [
  { label: '90s', sec: 90 },
  { label: '2m', sec: 120 },
  { label: '3m', sec: 180 },
];

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function playRestBeep(): void {
  try {
    if (typeof window === 'undefined') return;
    const win = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtx = win.AudioContext ?? win.webkitAudioContext;
    if (typeof AudioCtx !== 'function') return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx.resume().catch(() => undefined);
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => {
      void ctx.close().catch(() => undefined);
    };
  } catch {
    // Ignore audio playback errors in unsupported/restricted environments
  }
}

function triggerRestVibrate(): void {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // Ignore vibration errors in unsupported environments
  }
}

export function RestTimer({ externalStart = null }: RestTimerProps) {
  const [presetSec, setPresetSec] = useState<RestPresetSec>(90);
  const [totalSec, setTotalSec] = useState<number>(90);
  const [remainingSec, setRemainingSec] = useState<number>(90);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const remainingSecRef = useRef<number>(90);
  const lastTickNowRef = useRef<number>(Date.now());
  const alertFiredRef = useRef<boolean>(false);
  const lastExternalKeyRef = useRef<number | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    if (!externalStart || externalStart.key === lastExternalKeyRef.current) {
      return;
    }
    lastExternalKeyRef.current = externalStart.key;
    const nextSec = externalStart.durationSec;
    setPresetSec(nextSec);
    setTotalSec(nextSec);
    remainingSecRef.current = nextSec;
    setRemainingSec(nextSec);
    lastTickNowRef.current = Date.now();
    alertFiredRef.current = false;
    setCompleted(false);
    setIsRunning(true);
  }, [externalStart]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    lastTickNowRef.current = Date.now();
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const wallElapsedSec = Math.round((now - lastTickNowRef.current) / 1000);
      lastTickNowRef.current = now;
      const stepSec = wallElapsedSec > 0 ? wallElapsedSec : 1;

      const nextRemaining = Math.max(0, remainingSecRef.current - stepSec);
      remainingSecRef.current = nextRemaining;
      setRemainingSec(nextRemaining);

      if (nextRemaining <= 0) {
        setIsRunning(false);
        setCompleted(true);
        if (!alertFiredRef.current) {
          alertFiredRef.current = true;
          triggerRestVibrate();
          if (soundEnabledRef.current) {
            playRestBeep();
          }
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRunning]);

  const handleSelectPreset = (sec: RestPresetSec) => {
    alertFiredRef.current = false;
    setPresetSec(sec);
    setTotalSec(sec);
    remainingSecRef.current = sec;
    setRemainingSec(sec);
    setIsRunning(false);
    setCompleted(false);
  };

  const handleStartOrPause = () => {
    if (isRunning) {
      setIsRunning(false);
      return;
    }

    if (remainingSecRef.current <= 0) {
      setTotalSec(presetSec);
      remainingSecRef.current = presetSec;
      setRemainingSec(presetSec);
    }
    lastTickNowRef.current = Date.now();
    alertFiredRef.current = false;
    setCompleted(false);
    setIsRunning(true);
  };

  const handleReset = () => {
    alertFiredRef.current = false;
    setIsRunning(false);
    setCompleted(false);
    setTotalSec(presetSec);
    remainingSecRef.current = presetSec;
    setRemainingSec(presetSec);
  };

  const handleAdd15s = () => {
    const nextRemaining = remainingSecRef.current + 15;
    remainingSecRef.current = nextRemaining;
    setRemainingSec(nextRemaining);
    setTotalSec((prev) => Math.max(prev, nextRemaining));
    setCompleted(false);
    alertFiredRef.current = false;
  };

  const progressPct =
    totalSec > 0
      ? Math.min(100, Math.max(0, (remainingSec / totalSec) * 100))
      : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
            <Timer className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">Rest Timer</h3>
            <p className="text-xs text-slate-400">
              {isRunning ? 'Counting down' : completed ? 'Finished' : 'Ready'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSoundEnabled((prev) => !prev)}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? 'Mute timer alert' : 'Unmute timer alert'}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 text-slate-200 transition-colors hover:bg-slate-800"
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4 text-amber-400" aria-hidden="true" />
          ) : (
            <VolumeX className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          aria-label="Remaining rest time"
          className="font-mono text-3xl font-bold tracking-tight text-slate-50"
        >
          {formatMmSs(remainingSec)}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rest presets">
          {REST_PRESETS.map((preset) => {
            const active = presetSec === preset.sec;
            return (
              <button
                key={preset.sec}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectPreset(preset.sec)}
                className={`min-h-[44px] min-w-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                    : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Rest timer progress"
        aria-valuemin={0}
        aria-valuemax={totalSec}
        aria-valuenow={remainingSec}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleStartOrPause}
          className="inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
        >
          {isRunning ? (
            <>
              <Pause className="h-4 w-4" aria-hidden="true" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>Start</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleAdd15s}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800"
        >
          <span>+15s</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          aria-label="Reset timer"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      {completed && (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-center text-xs font-semibold text-emerald-300"
        >
          Rest complete — ready for next set
        </p>
      )}
    </div>
  );
}
