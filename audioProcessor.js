export class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isInitialized = false;
        this.onUpdate = null;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Disable browser audio processing for raw signal
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 8192; // High resolution required for Poly Tuner separation

            this.microphone.connect(this.analyser);
            this.dataArray = new Float32Array(this.analyser.fftSize);

            this.isInitialized = true;
            this.startProcessing();
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            return false;
        }
    }

    startProcessing() {
        const process = () => {
            if (!this.isInitialized) return;
            // Capture time-domain data for autocorrelation
            this.analyser.getFloatTimeDomainData(this.dataArray);
            requestAnimationFrame(process);
        };
        process();
    }

    // High-precision Autocorrelation for pitch detection using SDF (Square Difference Function)
    static autoCorrelate(buffer, sampleRate) {
        let SIZE = buffer.length;
        let rms = 0;

        for (let i = 0; i < SIZE; i++) {
            rms += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(rms / SIZE);

        // Signal too weak or silence
        if (rms < 0.002) return -1;

        // Perform Square Difference Function within musical frequency range (40Hz to 1200Hz)
        const minLag = Math.floor(sampleRate / 1200);
        const maxLag = Math.floor(sampleRate / 40);

        // We use a half-size window to ensure we have enough data for the lag
        const windowSize = Math.floor(SIZE / 2);
        const diff = new Float32Array(maxLag + 1);

        for (let lag = minLag; lag <= maxLag; lag++) {
            for (let i = 0; i < windowSize; i++) {
                const delta = buffer[i] - buffer[i + lag];
                diff[lag] += delta * delta;
            }
        }

        // Find the first significant "valley" to avoid octave errors
        let bestLag = -1;
        let minDiff = Infinity;
        let threshold = 0.2 * diff[minLag]; // Dynamic threshold for first valley

        for (let lag = minLag; lag <= maxLag; lag++) {
            if (diff[lag] < minDiff) {
                minDiff = diff[lag];
                bestLag = lag;
            }
            // If we found a significant local minimum, stop to avoid harmonics/octave errors
            if (lag > minLag && diff[lag] < threshold && diff[lag] < diff[lag - 1] && diff[lag] < diff[lag + 1]) {
                bestLag = lag;
                break;
            }
        }

        if (bestLag === -1) return -1;

        let T0 = bestLag;
        // Parabolic interpolation for sub-sample accuracy
        if (T0 > 0 && T0 < maxLag) {
            const y1 = diff[T0 - 1];
            const y2 = diff[T0];
            const y3 = diff[T0 + 1];
            const a = (y1 + y3 - 2 * y2) / 2;
            const b = (y3 - y1) / 2;
            if (a) T0 = T0 - b / (2 * a);
        }

        return sampleRate / T0;
    }

    static referencePitch = 440;

    // Map frequency to note components
    static getNoteFromFrequency(frequency) {
        if (frequency <= 0 || isNaN(frequency)) return null;
        const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        // Standard formula: n = 12 * log2(f / ref)
        const n = 12 * Math.log2(frequency / AudioProcessor.referencePitch);
        const roundN = Math.round(n);
        const noteIndex = (roundN + 69) % 12;
        const octave = Math.floor((roundN + 69) / 12) - 1;
        const cents = 100 * (n - roundN);

        return {
            name: NOTES[noteIndex < 0 ? noteIndex + 12 : noteIndex],
            octave,
            cents,
            frequency: parseFloat(frequency.toFixed(2))
        };
    }
    // Targeted polyphonic detection for guitar strings
    getPolyNotes(guitarTargets) {
        if (!this.dataArray) return [];
        const sampleRate = this.audioContext.sampleRate;
        const binCount = this.analyser.frequencyBinCount;
        const fftSize = this.analyser.fftSize;

        // We need frequency data for polyphonic isolation
        const freqData = new Float32Array(binCount);
        this.analyser.getFloatFrequencyData(freqData);

        const detected = [];

        guitarTargets.forEach(target => {
            const targetFrequency = target.targetFreq || target.freq;
            // Search window (+/- 1.5 semitones to avoid overlap/harmonic interference)
            const lowFreq = targetFrequency * Math.pow(2, -1.5 / 12);
            const highFreq = targetFrequency * Math.pow(2, 1.5 / 12);

            let maxMag = -Infinity;
            let bestBin = -1;

            const lowBin = Math.floor(lowFreq * fftSize / sampleRate);
            const highBin = Math.ceil(highFreq * fftSize / sampleRate);

            // Bounds check
            if (lowBin < 0 || highBin >= binCount) return;

            for (let i = lowBin; i <= highBin; i++) {
                if (freqData[i] > maxMag) {
                    maxMag = freqData[i];
                    bestBin = i;
                }
            }

            // Strum sensitivity threshold (-95 dB to ensure we pick up weaker audio)
            if (maxMag > -95) {
                // Parabolic interpolation for sub-bin accuracy
                const y1 = freqData[bestBin - 1] || freqData[bestBin];
                const y2 = freqData[bestBin];
                const y3 = freqData[bestBin + 1] || freqData[bestBin];

                let refinedFreq = bestBin * sampleRate / fftSize;
                if (y1 !== y2 || y2 !== y3) {
                    const p = 0.5 * (y1 - y3) / (y1 - 2 * y2 + y3);
                    refinedFreq = (bestBin + p) * sampleRate / fftSize;
                }

                const note = AudioProcessor.getNoteFromFrequency(refinedFreq);
                detected.push({ ...note, magnitude: maxMag, targetFreq: targetFrequency });
            }
        });

        return detected;
    }

    // Monophonic detection for the simple view
    getMonoNote() {
        if (!this.dataArray) return null;
        const sampleRate = this.audioContext.sampleRate;
        const monoFreq = AudioProcessor.autoCorrelate(this.dataArray, sampleRate);
        if (monoFreq !== -1 && monoFreq < 1200) {
            return AudioProcessor.getNoteFromFrequency(monoFreq);
        }

        // Fallback to FFT if Autocorrelation fails (e.g. noise or transients)
        const binCount = this.analyser.frequencyBinCount;
        const fftSize = this.analyser.fftSize;
        const freqData = new Float32Array(binCount);
        this.analyser.getFloatFrequencyData(freqData);

        let maxMag = -Infinity;
        let bestBin = -1;
        for (let i = 2; i < binCount; i++) { // Ignore extreme lows
            if (freqData[i] > maxMag) {
                maxMag = freqData[i];
                bestBin = i;
            }
        }

        if (maxMag > -90 && bestBin > 0) {
            const y1 = freqData[bestBin - 1] || freqData[bestBin];
            const y2 = freqData[bestBin];
            const y3 = freqData[bestBin + 1] || freqData[bestBin];
            let refinedFreq = bestBin * sampleRate / fftSize;
            if (y1 !== y2 || y2 !== y3) {
                const p = 0.5 * (y1 - y3) / (y1 - 2 * y2 + y3);
                refinedFreq = (bestBin + p) * sampleRate / fftSize;
            }
            return AudioProcessor.getNoteFromFrequency(refinedFreq);
        }

        return null;
    }

    // Expose byte frequency data for visualizer
    getByteFrequencyData(array) {
        if (this.analyser && this.isInitialized) {
            this.analyser.getByteFrequencyData(array);
        }
    }
}
