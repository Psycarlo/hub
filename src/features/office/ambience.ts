import { useEffect } from "react";

import { playSound, useSounds } from "@/lib/sounds";

import type { Phase } from "./phase";

/**
 * The office's sounds, under the app's Sounds setting and kept quiet:
 * footsteps, a puff when someone comes or goes, and the room around them, a
 * soft tone with birds by day and crickets at night. All made as they play,
 * with no files to fetch.
 */

/** A footstep: yours, or someone's near you, quieter. */
export function footstep(yours: boolean) {
  playSound("tap", {
    pitch: -6 + Math.random() * 3,
    volume: yours ? 0.14 : 0.07,
  });
}

/** Someone arriving in the office, or leaving it. */
export function puffSound() {
  playSound("swoosh", { pitch: -4, volume: 0.25 });
}

/** Two seconds of soft noise, low in pitch, looped for the room's tone. */
function roomTone(audio: AudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[index] = last * 3.5;
  }
  return buffer;
}

/** A bird's few chirps, each a quick rise in pitch. */
function chirp(audio: AudioContext, out: AudioNode) {
  const start = audio.currentTime + 0.05;
  const base = 2300 + Math.random() * 1400;
  const count = 2 + Math.floor(Math.random() * 3);
  for (let index = 0; index < count; index += 1) {
    const at = start + index * (0.11 + Math.random() * 0.05);
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.setValueAtTime(base, at);
    tone.frequency.exponentialRampToValueAtTime(base * 1.5, at + 0.07);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.03, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + 0.1);
  }
}

/** A cricket's trill: a high tone, fluttering. */
function trill(audio: AudioContext, out: AudioNode) {
  const at = audio.currentTime + 0.05;
  const length = 0.25 + Math.random() * 0.3;
  const tone = audio.createOscillator();
  const flutter = audio.createOscillator();
  const depth = audio.createGain();
  const gain = audio.createGain();
  tone.frequency.value = 4300 + Math.random() * 500;
  flutter.frequency.value = 28;
  depth.gain.value = 0.012;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.012, at + 0.04);
  gain.gain.setValueAtTime(0.012, at + length - 0.05);
  gain.gain.linearRampToValueAtTime(0, at + length);
  flutter.connect(depth).connect(gain.gain);
  tone.connect(gain).connect(out);
  for (const node of [tone, flutter]) {
    node.start(at);
    node.stop(at + length);
  }
}

async function close(audio: AudioContext) {
  try {
    await audio.close();
  } catch {
    // Already closed.
  }
}

/** The room around you, while the office is open, by the time of day. */
export function useAmbience(phase: Phase) {
  const on = useSounds();
  useEffect(() => {
    if (!on) {
      return;
    }
    const audio = new AudioContext();
    const master = audio.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(1, audio.currentTime + 2);
    master.connect(audio.destination);

    const tone = audio.createBufferSource();
    tone.buffer = roomTone(audio);
    tone.loop = true;
    const low = audio.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 380;
    const toneGain = audio.createGain();
    toneGain.gain.value = 0.05;
    tone.connect(low).connect(toneGain).connect(master);
    tone.start();

    let timer = 0;
    const next = () => {
      if (phase === "night") {
        trill(audio, master);
        timer = window.setTimeout(next, 1200 + Math.random() * 2600);
      } else {
        chirp(audio, master);
        timer = window.setTimeout(next, 3500 + Math.random() * 6500);
      }
    };
    timer = window.setTimeout(next, 1500);

    // Browsers start sound only after the page is used.
    const resume = async () => {
      try {
        await audio.resume();
      } catch {
        // Tried again on the next press.
      }
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      close(audio);
    };
  }, [on, phase]);
}
