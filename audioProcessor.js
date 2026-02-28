export class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isInitialized = false;
        this.onUpdate = null;

        // Monitor nodes
        this.baseNode = null;
        this.bassNode = null;
        this.trebleNode = null;
        this.monitorNode = null;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Initialize AudioContext with low-latency hint
            const contextOptions = {
                latencyHint: 'interactive',
                // On some systems, setting the sampleRate to the device's default 
                // can bypass internal resamplers and reduce latency
            };
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            this.microphone = this.audioContext.createMediaStreamSource(stream);

            // Initialize Compressor (Sustain)
            this.compressor = this.audioContext.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-30, this.audioContext.currentTime);
            this.compressor.knee.setValueAtTime(40, this.audioContext.currentTime);
            this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
            this.compressor.attack.setValueAtTime(0, this.audioContext.currentTime);
            this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 8192; // High resolution required for Poly Tuner separation

            // Mic -> Compressor -> Analyser
            this.microphone.connect(this.compressor);
            this.compressor.connect(this.analyser);

            this.dataArray = new Float32Array(this.analyser.fftSize);

            // Initialize Monitor Chain
            this.bassNode = this.audioContext.createBiquadFilter();
            this.bassNode.type = 'lowshelf';
            this.bassNode.frequency.value = 200;
            this.bassNode.gain.value = 0;

            this.trebleNode = this.audioContext.createBiquadFilter();
            this.trebleNode.type = 'highshelf';
            this.trebleNode.frequency.value = 2000;
            this.trebleNode.gain.value = 0;

            this.monitorNode = this.audioContext.createGain();
            this.monitorNode.gain.value = 0; // Off by default

            // Connect monitor chain: Mic -> Bass -> Treble -> Gain -> Destination (Raw Signal)
            this.microphone.connect(this.bassNode);
            this.bassNode.connect(this.trebleNode);
            this.trebleNode.connect(this.monitorNode);
            this.monitorNode.connect(this.audioContext.destination);

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

        // Perform Square Difference Function within guitar frequency range (70Hz to 1100Hz)
        const minLag = Math.floor(sampleRate / 1100);
        const maxLag = Math.floor(sampleRate / 70);

        // We use a optimized window size to balance speed and accuracy
        const windowSize = Math.floor(SIZE * 0.4);
        const diff = new Float32Array(maxLag + 1);

        for (let lag = minLag; lag <= maxLag; lag++) {
            let sum = 0;
            for (let i = 0; i < windowSize; i++) {
                const delta = buffer[i] - buffer[i + lag];
                sum += delta * delta;
            }
            diff[lag] = sum;
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

    setMonitorGain(value) {
        if (this.monitorNode) this.monitorNode.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
    }

    setBassGain(value) {
        if (this.bassNode) this.bassNode.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
    }

    setTrebleGain(value) {
        if (this.trebleNode) this.trebleNode.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
    }

    setSustain(value) {
        if (!this.compressor) return;
        // value 0 -> threshold -20, ratio 4
        // value 1 -> threshold -60, ratio 20
        const threshold = -20 - (value * 40);
        const ratio = 4 + (value * 16);
        this.compressor.threshold.setTargetAtTime(threshold, this.audioContext.currentTime, 0.1);
        this.compressor.ratio.setTargetAtTime(ratio, this.audioContext.currentTime, 0.1);
    }

    // Polyphonic peak detection for chord identification
    getFrequencyPeaks() {
        if (!this.dataArray || !this.isInitialized) return [];

        const binCount = this.analyser.frequencyBinCount;
        const sampleRate = this.audioContext.sampleRate;
        const fftSize = this.analyser.fftSize;
        const freqData = new Float32Array(binCount);
        this.analyser.getFloatFrequencyData(freqData);

        const peaks = [];
        const threshold = -85; // Lower boundary Sensitivity threshold in dB

        // Search for peaks between 50Hz and 1200Hz
        const minBin = Math.floor(50 * fftSize / sampleRate);
        const maxBin = Math.floor(1200 * fftSize / sampleRate);

        for (let i = minBin; i < maxBin; i++) {
            if (freqData[i] > threshold && freqData[i] > freqData[i - 1] && freqData[i] > freqData[i + 1]) {
                // Local dominance check
                let isLocalMax = true;
                const windowSize = 20;
                for (let j = Math.max(minBin, i - windowSize); j <= Math.min(maxBin, i + windowSize); j++) {
                    if (freqData[j] > freqData[i]) {
                        isLocalMax = false;
                        break;
                    }
                }

                if (isLocalMax) {
                    const y1 = freqData[i - 1];
                    const y2 = freqData[i];
                    const y3 = freqData[i + 1];
                    const p = 0.5 * (y1 - y3) / (y1 - 2 * y2 + y3);
                    const refinedFreq = (i + p) * sampleRate / fftSize;

                    const note = AudioProcessor.getNoteFromFrequency(refinedFreq);
                    if (note && !peaks.some(p => p.name === note.name && p.octave === note.octave)) {
                        peaks.push({ ...note, magnitude: freqData[i] });
                    }
                }
            }
        }

        // Return top 8 candidates before harmonic filtering
        let candidates = peaks.sort((a, b) => b.magnitude - a.magnitude).slice(0, 10);
        const filtered = [];

        // Simple Harmonic Filtering
        // If a peak is a multiple of a strong lower peak (fundamental), we check if it's truly a new note
        for (let i = 0; i < candidates.length; i++) {
            const current = candidates[i];
            let isUnique = true;

            for (let j = 0; j < filtered.length; j++) {
                const prev = filtered[j];
                // Check if current is a harmonic of prev (roughly 2x, 3x, 4x...)
                // We use a small tolerance for frequency ratio
                const ratio = current.frequency / prev.frequency;
                const roundedRatio = Math.round(ratio);

                // If it's a harmonic (2.0, 3.0, etc.) and much weaker than the fundamental
                if (roundedRatio > 1 && Math.abs(ratio - roundedRatio) < 0.03) {
                    // It's a harmonic. If it's significantly lower in magnitude, it's likely just an overtone.
                    if (current.magnitude < prev.magnitude - 10) {
                        isUnique = false;
                        break;
                    }
                }
            }

            if (isUnique) {
                filtered.push(current);
            }
        }

        // Return top 6 filtered peaks
        return filtered.sort((a, b) => b.magnitude - a.magnitude).slice(0, 6);
    }
}
