<div align="center">
  <img src="https://via.placeholder.com/800x450.png?text=Synthesizer+Preview+GIF" alt="Neon Synth Preview" width="100%">

  # 🎹 NEON//SYNTH
  **Procedural Web Audio Engine & Reactive Visualizer**
  
  [**🔴 Live Demonstration**]
  [  DEMO](https://neon-synth-smoky.vercel.app/) &nbsp;&bull;&nbsp;
  [**Source Code**](#)
</div>

<br>

**Neon Synth** is a polyphonic synthesizer operating entirely within the browser environment. Developed utilizing React and Tailwind CSS, the project maintains a strict zero-dependency architecture for audio generation. It leverages the native **Web Audio API** to synthesize sound procedurally, eliminating the need for external audio assets. Integrated with a 60 FPS HTML5 Canvas visualizer, the application translates keystrokes into synchronized, real-time auditory and visual feedback.

## 🚀 Core Features

- **True Polyphony**: Supports simultaneous multi-note playback (chords) via standard keyboard or cursor input.
- **Dual Oscillators**: Allows for the combination of Sine, Square, Sawtooth, and Triangle waveforms with independent detuning capabilities.
- **ADSR Envelopes**: Ensures precise, click-free sound modulation across Attack, Decay, Sustain, and Release phases.
- **Effects Chain**: Features a Biquad Filter (Lowpass/Highpass with adjustable Resonance) and a feedback delay loop.
- **Reactive Visualization**: Implements an HTML5 Canvas oscilloscope and frequency spectrum that directly respond to the master audio output bus in real time.

---

## 🧠 Technical Challenges & Key Takeaways

Engineering a robust audio engine within a browser environment introduces distinct technical requirements compared to standard React state management. The following details the approaches taken to resolve the primary engineering challenges:

### 1. Polyphony & Voice Management
To facilitate chord playback, a `Map` data structure was implemented to link active frequencies to distinct "voices". A voice is defined as an object containing references to all specific `AudioNode`s allocated for a single keystroke (Oscillators, Gain nodes for sub-mixing, and a dedicated ADSR Envelope node). 
Upon a key press event, a new set of nodes is instantiated and integrated into the signal chain. Upon a key release event, the precise voice is retrieved from the `Map` and scheduled for the release phase.

### 2. Audio Node Cleanup & Memory Leak Prevention
Improper management of the Web Audio API can result in severe memory leaks if nodes are continuously instantiated but never disconnected and subjected to garbage collection.
To mitigate this, the `.stop()` method is not invoked immediately upon key release. Instead, the ADSR envelope is programmed to decrease its gain to 0 over the specified release duration utilizing `exponentialRampToValueAtTime`. A precisely synchronized `setTimeout` function (calculated as release time plus a buffer margin) is subsequently executed to safely invoke `.disconnect()` and `.stop()` on the oscillators and gain nodes, ensuring cleanup occurs only after the audio has completely decayed.

### 3. Canvas Rendering Performance (60 FPS)
Synchronizing a visualizer with real-time audio necessitates extracting frequency data from an `AnalyserNode` within a `requestAnimationFrame` loop.
React's render cycles are inherently unsuited for high-performance, 60 FPS visual loops due to latency and inconsistency. By completely decoupling the canvas drawing logic from the React render lifecycle (achieved by utilizing a `useRef` to directly access the canvas context), unnecessary Virtual DOM diffing was eliminated. This architectural decision results in a highly fluid, low-latency visualizer that renders frequency gradients and oscilloscope waveforms at native execution speeds.

---

## 🛠️ Local Installation & Execution

Clone the repository and initialize the local development environment:

```bash
# Install dependencies
npm install

# Initialize the Vite development server
npm run dev
```

> **Note**: Modern browsers enforce autoplay policies that require explicit user interaction before audio context execution. Click the "Start Audio" / "Standby" button prior to input.

---

*Engineered and developed by Artificia.*
