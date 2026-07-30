

import React, { useCallback, useEffect, useRef, useState } from "react";

/* ================================ Types ================================= */

type FilterMode = "lowpass" | "highpass";

interface SynthParams {
  osc1Type: OscillatorType;
  osc2Type: OscillatorType;
  osc1Detune: number;
  osc2Detune: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterType: FilterMode;
  filterFreq: number;
  filterQ: number;
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  masterVolume: number;
}

const DEFAULT_PARAMS: SynthParams = {
  osc1Type: "sawtooth",
  osc2Type: "square",
  osc1Detune: 0,
  osc2Detune: 7,
  attack: 0.02,
  decay: 0.18,
  sustain: 0.55,
  release: 0.35,
  filterType: "lowpass",
  filterFreq: 2400,
  filterQ: 1,
  delayTime: 0.28,
  delayFeedback: 0.35,
  delayMix: 0.22,
  masterVolume: 0.8,
};

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  sub1: GainNode;
  sub2: GainNode;
  env: GainNode;
}

interface KeyDef {
  name: string;
  freq: number;
  black: boolean;
  kb?: string;
}

/* ============================== Note table ============================== */
/* C4 → G5 (19 semitones ≈ 1.58 octaves). A–L maps white keys up to D5,    */
/* W E T Y U O map the black keys; top notes are mouse/touch playable.     */

const NOTES: KeyDef[] = [
  { name: "C4",  freq: 261.63, black: false, kb: "a" },
  { name: "C#4", freq: 277.18, black: true,  kb: "w" },
  { name: "D4",  freq: 293.66, black: false, kb: "s" },
  { name: "D#4", freq: 311.13, black: true,  kb: "e" },
  { name: "E4",  freq: 329.63, black: false, kb: "d" },
  { name: "F4",  freq: 349.23, black: false, kb: "f" },
  { name: "F#4", freq: 369.99, black: true,  kb: "t" },
  { name: "G4",  freq: 392.0,  black: false, kb: "g" },
  { name: "G#4", freq: 415.3,  black: true,  kb: "y" },
  { name: "A4",  freq: 440.0,  black: false, kb: "h" },
  { name: "A#4", freq: 466.16, black: true,  kb: "u" },
  { name: "B4",  freq: 493.88, black: false, kb: "j" },
  { name: "C5",  freq: 523.25, black: false, kb: "k" },
  { name: "C#5", freq: 554.37, black: true,  kb: "o" },
  { name: "D5",  freq: 587.33, black: false, kb: "l" },
  { name: "D#5", freq: 622.25, black: true },
  { name: "E5",  freq: 659.26, black: false },
  { name: "F5",  freq: 698.46, black: false },
  { name: "F#5", freq: 739.99, black: true },
  { name: "G5",  freq: 784.0,  black: false },
];

const KB_TO_FREQ: Record<string, number> = {};
NOTES.forEach((n) => {
  if (n.kb) KB_TO_FREQ[n.kb] = n.freq;
});

const WHITE_NOTES = NOTES.filter((n) => !n.black);
const WHITE_W = 100 / WHITE_NOTES.length; // percent width per white key
const BLACK_W = WHITE_W * 0.62;

// Absolute left-% position of each black key (sits on white-key boundaries)
const BLACK_LAYOUT: { note: KeyDef; leftPct: number }[] = [];
{
  let whitesSeen = 0;
  for (const n of NOTES) {
    if (n.black) {
      BLACK_LAYOUT.push({ note: n, leftPct: whitesSeen * WHITE_W - BLACK_W / 2 });
    } else {
      whitesSeen++;
    }
  }
}

const OSC_TYPES: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];
const OSC_LABEL: Record<OscillatorType, string> = {
  sine: "SIN",
  square: "SQR",
  sawtooth: "SAW",
  triangle: "TRI",
};
const FILTER_TYPES: FilterMode[] = ["lowpass", "highpass"];
const FILTER_LABEL: Record<FilterMode, string> = {
  lowpass: "LP",
  highpass: "HP",
};

/* ============================== Subcomponents =========================== */

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block select-none">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
          {props.label}
        </span>
        <span className="font-mono text-[10px] text-cyan-300">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-zinc-700/80 accent-cyan-400"
      />
    </label>
  );
}

function TypeButtons<T extends string>(props: {
  options: T[];
  value: T;
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))` }}
    >
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => props.onChange(o)}
          className={`rounded border px-1 py-1.5 text-[9px] font-bold tracking-widest transition-colors ${
            props.value === o
              ? "border-cyan-400 bg-cyan-400/15 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
              : "border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
          }`}
        >
          {props.labels[o]}
        </button>
      ))}
    </div>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 backdrop-blur-sm">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">
        {props.title}
      </div>
      <div className="space-y-3">{props.children}</div>
    </div>
  );
}

/* ================================ App =================================== */

export default function App() {
  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS);
  const [started, setStarted] = useState(false);
  const [activeNotes, setActiveNotes] = useState<ReadonlySet<number>>(new Set());

  // ---- Audio engine refs -------------------------------------------------
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const feedbackRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const paramsRef = useRef<SynthParams>(DEFAULT_PARAMS);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* ------------------------- Engine bootstrap --------------------------- */
  // Signal chain:
  //   voice(osc1+osc2 -> env) -> filter -> dry -> master -> analyser -> out
  //                                filter -> delay -> wet -> master
  //                                delay -> feedback -> delay (loop)
  const initAudio = useCallback(() => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
      setStarted(true);
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    const p = paramsRef.current;

    const master = ctx.createGain();
    master.gain.value = p.masterVolume;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;

    const filter = ctx.createBiquadFilter();
    filter.type = p.filterType;
    filter.frequency.value = p.filterFreq;
    filter.Q.value = p.filterQ;

    const dry = ctx.createGain();
    dry.gain.value = 1;

    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = p.delayTime;

    const feedback = ctx.createGain();
    feedback.gain.value = p.delayFeedback;

    const wet = ctx.createGain();
    wet.gain.value = p.delayMix;

    filter.connect(dry);
    dry.connect(master);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    ctxRef.current = ctx;
    masterRef.current = master;
    filterRef.current = filter;
    delayRef.current = delay;
    feedbackRef.current = feedback;
    wetRef.current = wet;
    analyserRef.current = analyser;
    setStarted(true);
  }, []);

  /* ------------------------------ Voices -------------------------------- */
  const noteOn = useCallback(
    (freq: number) => {
      initAudio();
      const ctx = ctxRef.current;
      const filter = filterRef.current;
      if (!ctx || !filter || voicesRef.current.has(freq)) return;
      if (ctx.state === "suspended") void ctx.resume();

      const p = paramsRef.current;
      const now = ctx.currentTime;
      const peak = 0.9;
      const atk = Math.max(p.attack, 0.005);
      const dec = Math.max(p.decay, 0.005);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = p.osc1Type;
      osc2.type = p.osc2Type;
      osc1.frequency.value = freq;
      osc2.frequency.value = freq;
      osc1.detune.value = p.osc1Detune;
      osc2.detune.value = p.osc2Detune;

      const sub1 = ctx.createGain();
      sub1.gain.value = 0.5;
      const sub2 = ctx.createGain();
      sub2.gain.value = 0.5;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(peak, now + atk);
      env.gain.exponentialRampToValueAtTime(
        Math.max(p.sustain * peak, 0.0001),
        now + atk + dec
      );

      osc1.connect(sub1);
      osc2.connect(sub2);
      sub1.connect(env);
      sub2.connect(env);
      env.connect(filter);

      osc1.start(now);
      osc2.start(now);

      voicesRef.current.set(freq, { osc1, osc2, sub1, sub2, env });
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.add(freq);
        return next;
      });
    },
    [initAudio]
  );

  const noteOff = useCallback((freq: number) => {
    const ctx = ctxRef.current;
    const voice = voicesRef.current.get(freq);
    if (!ctx || !voice) return;

    const rel = Math.max(paramsRef.current.release, 0.01);
    const now = ctx.currentTime;

    voice.env.gain.cancelScheduledValues(now);
    voice.env.gain.setValueAtTime(Math.max(voice.env.gain.value, 0.0001), now);
    voice.env.gain.exponentialRampToValueAtTime(0.0001, now + rel);

    const stopAt = now + rel + 0.05;
    try {
      voice.osc1.stop(stopAt);
      voice.osc2.stop(stopAt);
    } catch {
      /* oscillators already stopped */
    }
    voicesRef.current.delete(freq);

    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(freq);
      return next;
    });

    window.setTimeout(() => {
      voice.osc1.disconnect();
      voice.osc2.disconnect();
      voice.sub1.disconnect();
      voice.sub2.disconnect();
      voice.env.disconnect();
    }, (rel + 0.15) * 1000);
  }, []);

  /* ---------------------- Live parameter updates ------------------------ */
  const setParam = useCallback(
    <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
      setParams((prev) => {
        const next = { ...prev, [key]: value };
        paramsRef.current = next;
        return next;
      });

      const ctx = ctxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;

      switch (key) {
        case "filterFreq":
          filterRef.current?.frequency.setTargetAtTime(value as number, t, 0.015);
          break;
        case "filterQ":
          filterRef.current?.Q.setTargetAtTime(value as number, t, 0.015);
          break;
        case "filterType":
          if (filterRef.current) filterRef.current.type = value as FilterMode;
          break;
        case "delayTime":
          delayRef.current?.delayTime.setTargetAtTime(value as number, t, 0.03);
          break;
        case "delayFeedback":
          // clamped to avoid runaway feedback build-up
          feedbackRef.current?.gain.setTargetAtTime(
            Math.min(value as number, 0.85),
            t,
            0.03
          );
          break;
        case "delayMix":
          wetRef.current?.gain.setTargetAtTime(value as number, t, 0.03);
          break;
        case "masterVolume":
          masterRef.current?.gain.setTargetAtTime(value as number, t, 0.03);
          break;
        case "osc1Type":
          voicesRef.current.forEach((v) => {
            v.osc1.type = value as OscillatorType;
          });
          break;
        case "osc2Type":
          voicesRef.current.forEach((v) => {
            v.osc2.type = value as OscillatorType;
          });
          break;
        case "osc1Detune":
          voicesRef.current.forEach((v) =>
            v.osc1.detune.setTargetAtTime(value as number, t, 0.02)
          );
          break;
        case "osc2Detune":
          voicesRef.current.forEach((v) =>
            v.osc2.detune.setTargetAtTime(value as number, t, 0.02)
          );
          break;
        default:
          break; // ADSR values are read fresh at noteOn / noteOff time
      }
    },
    []
  );

  /* ------------------- Computer keyboard (A–L map) ---------------------- */
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const f = KB_TO_FREQ[e.key.toLowerCase()];
      if (f !== undefined) {
        e.preventDefault();
        noteOn(f);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const f = KB_TO_FREQ[e.key.toLowerCase()];
      if (f !== undefined) noteOff(f);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [noteOn, noteOff]);

  /* ------------------------- Canvas visualizer -------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    let raf = 0;
    let cw = 0;
    let ch = 0;

    const freqData = new Uint8Array(1024); // fftSize 2048 -> 1024 bins
    const timeData = new Uint8Array(2048);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      cw = Math.max(1, rect.width);
      ch = Math.max(1, rect.height);
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const analyser = analyserRef.current;

      // motion-trail fade
      c2d.globalCompositeOperation = "source-over";
      c2d.fillStyle = "rgba(6, 8, 16, 0.28)";
      c2d.fillRect(0, 0, cw, ch);

      let energy = 0;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        energy = sum / freqData.length / 255;
      }

      // hue travels cyan -> magenta as output gets louder
      const hue = 190 + energy * 140;
      c2d.globalCompositeOperation = "lighter";

      // ---- layer 1: frequency spectrum bars ----
      const barCount = 96;
      const barW = cw / barCount;
      for (let i = 0; i < barCount; i++) {
        // log-ish bin mapping for a musical low-end focus
        const idx = Math.floor(Math.pow(i / barCount, 1.4) * freqData.length * 0.72);
        const v = (analyser ? freqData[idx] : 0) / 255;
        const h = Math.max(2, v * ch * 0.72);
        const x = i * barW;
        const g = c2d.createLinearGradient(0, ch, 0, ch - h);
        g.addColorStop(0, `hsla(${hue + i * 0.6}, 100%, 55%, 0.25)`);
        g.addColorStop(1, `hsla(${hue + i * 0.6}, 100%, 65%, 0.85)`);
        c2d.fillStyle = g;
        c2d.fillRect(x + 1, ch - h, Math.max(1, barW - 2), h);
      }

      // ---- layer 2: oscilloscope waveform overlay ----
      const t = performance.now() / 1000;
      c2d.beginPath();
      const n = timeData.length;
      for (let i = 0; i < n; i += 4) {
        const x = (i / (n - 1)) * cw;
        const v = analyser
          ? (timeData[i] - 128) / 128
          : Math.sin(i * 0.02 + t * 2) * 0.03; // gentle idle drift
        const y = ch / 2 + v * ch * 0.38;
        if (i === 0) c2d.moveTo(x, y);
        else c2d.lineTo(x, y);
      }
      c2d.lineWidth = 2 + energy * 3;
      c2d.shadowColor = `hsla(${hue}, 100%, 60%, 0.9)`;
      c2d.shadowBlur = 14 + energy * 30;
      c2d.strokeStyle = `hsla(${hue}, 100%, ${62 + energy * 25}%, 0.95)`;
      c2d.stroke();
      c2d.shadowBlur = 0;
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* --------------------------------- UI --------------------------------- */
  const keyHandlers = (freq: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      noteOn(freq);
    },
    onPointerUp: () => noteOff(freq),
    onPointerLeave: () => noteOff(freq),
    onPointerCancel: () => noteOff(freq),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <main className="min-h-screen bg-[#06080f] font-sans text-zinc-200 antialiased">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* header */}
        <header className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[0.2em] text-white">
              NEON<span className="text-cyan-400">//</span>SYNTH
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
              Procedural Web Audio Engine · Zero Dependencies
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                started
                  ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
                  : "bg-zinc-600"
              }`}
            />
            {started ? "Engine Live" : "Standby"}
          </div>
        </header>

        {/* visualizer */}
        <section className="relative h-64 overflow-hidden rounded-xl border border-zinc-800 bg-black/60">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="pointer-events-none absolute left-3 top-2 text-[9px] uppercase tracking-[0.25em] text-zinc-600">
            Master Output · Spectrum + Oscilloscope
          </div>
        </section>

        {/* control panels */}
        <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Panel title="Oscillator 1">
            <TypeButtons
              options={OSC_TYPES}
              value={params.osc1Type}
              labels={OSC_LABEL}
              onChange={(v) => setParam("osc1Type", v)}
            />
            <Slider
              label="Detune"
              value={params.osc1Detune}
              min={-50}
              max={50}
              step={1}
              display={`${params.osc1Detune > 0 ? "+" : ""}${params.osc1Detune}¢`}
              onChange={(v) => setParam("osc1Detune", v)}
            />
          </Panel>

          <Panel title="Oscillator 2">
            <TypeButtons
              options={OSC_TYPES}
              value={params.osc2Type}
              labels={OSC_LABEL}
              onChange={(v) => setParam("osc2Type", v)}
            />
            <Slider
              label="Detune"
              value={params.osc2Detune}
              min={-50}
              max={50}
              step={1}
              display={`${params.osc2Detune > 0 ? "+" : ""}${params.osc2Detune}¢`}
              onChange={(v) => setParam("osc2Detune", v)}
            />
          </Panel>

          <Panel title="Envelope · ADSR">
            <Slider
              label="Attack"
              value={params.attack}
              min={0.005}
              max={2}
              step={0.005}
              display={`${(params.attack * 1000).toFixed(0)}ms`}
              onChange={(v) => setParam("attack", v)}
            />
            <Slider
              label="Decay"
              value={params.decay}
              min={0.01}
              max={2}
              step={0.01}
              display={`${(params.decay * 1000).toFixed(0)}ms`}
              onChange={(v) => setParam("decay", v)}
            />
            <Slider
              label="Sustain"
              value={params.sustain}
              min={0}
              max={1}
              step={0.01}
              display={`${Math.round(params.sustain * 100)}%`}
              onChange={(v) => setParam("sustain", v)}
            />
            <Slider
              label="Release"
              value={params.release}
              min={0.02}
              max={3}
              step={0.01}
              display={`${(params.release * 1000).toFixed(0)}ms`}
              onChange={(v) => setParam("release", v)}
            />
          </Panel>

          <Panel title="Filter">
            <TypeButtons
              options={FILTER_TYPES}
              value={params.filterType}
              labels={FILTER_LABEL}
              onChange={(v) => setParam("filterType", v)}
            />
            <Slider
              label="Cutoff"
              value={params.filterFreq}
              min={80}
              max={8000}
              step={10}
              display={
                params.filterFreq >= 1000
                  ? `${(params.filterFreq / 1000).toFixed(1)}kHz`
                  : `${Math.round(params.filterFreq)}Hz`
              }
              onChange={(v) => setParam("filterFreq", v)}
            />
            <Slider
              label="Resonance"
              value={params.filterQ}
              min={0.5}
              max={10}
              step={0.1}
              display={params.filterQ.toFixed(1)}
              onChange={(v) => setParam("filterQ", v)}
            />
          </Panel>

          <Panel title="Delay · Master">
            <Slider
              label="Time"
              value={params.delayTime}
              min={0.02}
              max={1.2}
              step={0.01}
              display={`${(params.delayTime * 1000).toFixed(0)}ms`}
              onChange={(v) => setParam("delayTime", v)}
            />
            <Slider
              label="Feedback"
              value={params.delayFeedback}
              min={0}
              max={0.85}
              step={0.01}
              display={`${Math.round(params.delayFeedback * 100)}%`}
              onChange={(v) => setParam("delayFeedback", v)}
            />
            <Slider
              label="Wet Mix"
              value={params.delayMix}
              min={0}
              max={0.8}
              step={0.01}
              display={`${Math.round(params.delayMix * 100)}%`}
              onChange={(v) => setParam("delayMix", v)}
            />
            <Slider
              label="Volume"
              value={params.masterVolume}
              min={0}
              max={1}
              step={0.01}
              display={`${Math.round(params.masterVolume * 100)}%`}
              onChange={(v) => setParam("masterVolume", v)}
            />
          </Panel>
        </section>

        {/* keyboard */}
        <section className="relative mt-4 select-none">
          <div className="relative h-52 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
            <div className="relative flex h-full">
              {WHITE_NOTES.map((n) => {
                const active = activeNotes.has(n.freq);
                return (
                  <button
                    key={n.name}
                    type="button"
                    {...keyHandlers(n.freq)}
                    className={`relative flex-1 touch-none rounded-b-md border-r border-zinc-800 transition-colors ${
                      active
                        ? "bg-gradient-to-b from-cyan-300 to-cyan-500 shadow-[0_0_24px_rgba(34,211,238,0.6)]"
                        : "bg-gradient-to-b from-zinc-100 to-zinc-300 hover:from-cyan-100 hover:to-zinc-200"
                    }`}
                  >
                    <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
                      {n.kb && (
                        <span
                          className={`block font-mono text-[10px] font-bold ${
                            active ? "text-cyan-900" : "text-zinc-500"
                          }`}
                        >
                          {n.kb.toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`block text-[8px] ${
                          active ? "text-cyan-800" : "text-zinc-400"
                        }`}
                      >
                        {n.name}
                      </span>
                    </span>
                  </button>
                );
              })}

              {BLACK_LAYOUT.map(({ note: n, leftPct }) => {
                const active = activeNotes.has(n.freq);
                return (
                  <button
                    key={n.name}
                    type="button"
                    {...keyHandlers(n.freq)}
                    style={{ left: `${leftPct}%`, width: `${BLACK_W}%` }}
                    className={`absolute top-0 z-10 h-[58%] touch-none rounded-b-md border transition-colors ${
                      active
                        ? "border-fuchsia-400 bg-gradient-to-b from-fuchsia-500 to-fuchsia-800 shadow-[0_0_24px_rgba(232,121,249,0.7)]"
                        : "border-zinc-700 bg-gradient-to-b from-zinc-800 to-black hover:from-zinc-700"
                    }`}
                  >
                    {n.kb && (
                      <span
                        className={`pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] font-bold ${
                          active ? "text-fuchsia-100" : "text-zinc-500"
                        }`}
                      >
                        {n.kb.toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* autoplay-policy gate */}
          {!started && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur-sm">
              <button
                type="button"
                onClick={initAudio}
                className="rounded-lg border border-cyan-400 bg-cyan-400/10 px-8 py-4 text-sm font-black tracking-[0.3em] text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.35)] transition-all hover:bg-cyan-400/20 hover:shadow-[0_0_50px_rgba(34,211,238,0.6)]"
              >
                ⚡ POWER ON SYNTH
              </button>
            </div>
          )}
        </section>

        <footer className="mt-4 text-center text-[10px] uppercase tracking-[0.25em] text-zinc-600">
          Keys A–L play C4–D5 · W E T Y U O play sharps · Polyphonic · 100% local
        </footer>
      </div>
    </main>
  );
}
