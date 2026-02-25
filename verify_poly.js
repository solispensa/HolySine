import { AudioProcessor } from './audioProcessor.js';

// Simple mock for AudioContext and AnalyserNode
class MockAudioContext {
    constructor() {
        this.sampleRate = 44100;
    }
}

class MockAnalyserNode {
    constructor() {
        this.fftSize = 8192;
        this.frequencyBinCount = 4096;
        this.freqData = new Float32Array(this.frequencyBinCount).fill(-100);
    }
    getFloatFrequencyData(array) {
        for (let i = 0; i < this.frequencyBinCount; i++) {
            array[i] = this.freqData[i];
        }
    }
}

// Standard Guitar Frequencies (E2-E4)
const guitarTargets = [
    { id: 1, note: 'e', octave: 4, targetFreq: 329.63 },
    { id: 2, note: 'B', octave: 3, targetFreq: 246.94 },
    { id: 3, note: 'G', octave: 3, targetFreq: 196.00 },
    { id: 4, note: 'D', octave: 3, targetFreq: 146.83 },
    { id: 5, note: 'A', octave: 2, targetFreq: 110.00 },
    { id: 6, note: 'E', octave: 2, targetFreq: 82.41 }
];

console.log("--- POLY TUNER AUTOMATED VERIFICATION ---");

// Initialize mock processor
const processor = new AudioProcessor();
processor.audioContext = new MockAudioContext();
processor.analyser = new MockAnalyserNode();
processor.dataArray = new Float32Array(processor.analyser.fftSize);

// Inject peaks into the frequency data to simulate a strum
const sampleRate = processor.audioContext.sampleRate;
const fftSize = processor.analyser.fftSize;

guitarTargets.forEach(target => {
    // Inject a peak. Let's make it slightly sharp by 10 cents to test cents calculation
    const currentFreq = target.targetFreq * Math.pow(2, 10 / 1200);
    const exactBin = currentFreq * fftSize / sampleRate;
    const bestBin = Math.round(exactBin);
    const p = exactBin - bestBin; // Fractional bin offset between -0.5 and 0.5

    // To satisfy the parabolic equation: p = 0.5 * (y1 - y3) / (y1 - 2*y2 + y3)
    const y2 = -30 * p * p - 20;
    const y1 = -50 - 60 * p - 30 * p * p;
    const y3 = -50 + 60 * p - 30 * p * p;

    processor.analyser.freqData[bestBin - 1] = y1;
    processor.analyser.freqData[bestBin] = y2;
    processor.analyser.freqData[bestBin + 1] = y3;
});

const detected = processor.getPolyNotes(guitarTargets);

console.log(`Expected 6 strings, detected ${detected.length}`);
let allPassed = true;

guitarTargets.forEach((target, index) => {
    const match = detected.find(n => {
        const freqDiff = Math.abs(1200 * Math.log2(n.frequency / target.targetFreq));
        return freqDiff < 200;
    });

    if (match) {
        const relativeCents = 1200 * Math.log2(match.frequency / target.targetFreq);
        console.log(`String ${target.id} (${target.note}${target.octave}): Detected ${match.frequency.toFixed(2)} Hz. Diff: ${relativeCents.toFixed(1)} cents.`);
        if (Math.abs(relativeCents - 10) > 5) {
            console.log(`  -> FAILED Cents calculation.`);
            allPassed = false;
        } else {
            console.log(`  -> PASSED`);
        }
    } else {
        console.log(`String ${target.id} (${target.note}${target.octave}): NOT DETECTED! -> FAILED`);
        allPassed = false;
    }
});

if (allPassed) {
    console.log("ALGORITHM VERIFIED: SUCCESS");
} else {
    console.log("ALGORITHM VERIFIED: FAILURE");
}
