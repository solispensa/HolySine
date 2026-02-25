import './style.css';
import { AudioProcessor } from './audioProcessor.js';

const processor = new AudioProcessor();
const startBtn = document.getElementById('start-audio');
const initialOverlay = document.getElementById('initial-overlay');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

// Analyzer State
let analyzerEnabled = false;
const analyzerBtn = document.getElementById('analyzer-toggle-btn');
const analyzerCanvas = document.getElementById('analyzer-canvas');
let analyzerCtx = null;

if (analyzerCanvas) {
    analyzerCtx = analyzerCanvas.getContext('2d');
    const resizeAnalyzer = () => {
        analyzerCanvas.width = window.innerWidth * window.devicePixelRatio;
        analyzerCanvas.height = window.innerHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', resizeAnalyzer);
    resizeAnalyzer();
}

if (analyzerBtn) {
    analyzerBtn.addEventListener('click', () => {
        analyzerEnabled = !analyzerEnabled;
        if (analyzerEnabled) {
            analyzerBtn.classList.add('active');
            analyzerCanvas.classList.add('active');
        } else {
            analyzerBtn.classList.remove('active');
            analyzerCanvas.classList.remove('active');
            if (analyzerCtx) {
                analyzerCtx.clearRect(0, 0, analyzerCanvas.width, analyzerCanvas.height);
            }
        }
    });
}

// Tuning definitions
const TUNINGS = {
    standard: [
        { id: 6, note: 'E', octave: 2, midi: 40 },
        { id: 5, note: 'A', octave: 2, midi: 45 },
        { id: 4, note: 'D', octave: 3, midi: 50 },
        { id: 3, note: 'G', octave: 3, midi: 55 },
        { id: 2, note: 'B', octave: 3, midi: 59 },
        { id: 1, note: 'e', octave: 4, midi: 64 }
    ],
    drop_d: [
        { id: 6, note: 'D', octave: 2, midi: 38 },
        { id: 5, note: 'A', octave: 2, midi: 45 },
        { id: 4, note: 'D', octave: 3, midi: 50 },
        { id: 3, note: 'G', octave: 3, midi: 55 },
        { id: 2, note: 'B', octave: 3, midi: 59 },
        { id: 1, note: 'e', octave: 4, midi: 64 }
    ],
    open_g: [
        { id: 6, note: 'D', octave: 2, midi: 38 },
        { id: 5, note: 'G', octave: 2, midi: 43 },
        { id: 4, note: 'D', octave: 3, midi: 50 },
        { id: 3, note: 'G', octave: 3, midi: 55 },
        { id: 2, note: 'B', octave: 3, midi: 59 },
        { id: 1, note: 'd', octave: 4, midi: 62 }
    ],
    eb_standard: [
        { id: 6, note: 'D#', octave: 2, midi: 39 },
        { id: 5, note: 'G#', octave: 2, midi: 44 },
        { id: 4, note: 'C#', octave: 3, midi: 49 },
        { id: 3, note: 'F#', octave: 3, midi: 54 },
        { id: 2, note: 'A#', octave: 3, midi: 58 },
        { id: 1, note: 'd#', octave: 4, midi: 63 }
    ],
    open_esus2: [
        { id: 6, note: 'E', octave: 2, midi: 40 },
        { id: 5, note: 'B', octave: 2, midi: 47 },
        { id: 4, note: 'E', octave: 3, midi: 52 },
        { id: 3, note: 'F#', octave: 3, midi: 54 },
        { id: 2, note: 'B', octave: 3, midi: 59 },
        { id: 1, note: 'e', octave: 4, midi: 64 }
    ],
    dadgad: [
        { id: 6, note: 'D', octave: 2, midi: 38 },
        { id: 5, note: 'A', octave: 2, midi: 45 },
        { id: 4, note: 'D', octave: 3, midi: 50 },
        { id: 3, note: 'G', octave: 3, midi: 55 },
        { id: 2, note: 'A', octave: 3, midi: 57 },
        { id: 1, note: 'd', octave: 4, midi: 62 }
    ],
    rain_song: [
        { id: 6, note: 'D', octave: 2, midi: 38 },
        { id: 5, note: 'G', octave: 2, midi: 43 },
        { id: 4, note: 'C', octave: 3, midi: 48 },
        { id: 3, note: 'G', octave: 3, midi: 55 },
        { id: 2, note: 'C', octave: 4, midi: 60 },
        { id: 1, note: 'd', octave: 4, midi: 62 }
    ],
    custom: [] // Populated dynamically
};

let currentTuningKey = 'standard';
let referencePitch = 440;
let GUITAR_STRINGS = [];

function updateGuitarStrings() {
    GUITAR_STRINGS = TUNINGS[currentTuningKey].map(string => ({
        ...string,
        targetFreq: referencePitch * Math.pow(2, (string.midi - 69) / 12)
    }));
    AudioProcessor.referencePitch = referencePitch;
}

updateGuitarStrings(); // Initialize the active targets array

// Settings Events
const customTuningInput = document.getElementById('custom-tuning-input');
const customTuningText = document.getElementById('custom-tuning-text');
const applyCustomBtn = document.getElementById('apply-custom-tuning');

function parseCustomNotes(text) {
    const notesStr = text.split(',').map(s => s.trim()).filter(s => s);
    const parsed = [];
    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    notesStr.forEach((noteStr, index) => {
        const match = noteStr.match(/^([a-gA-G]#?)([0-9])$/);
        if (match) {
            let noteName = match[1].toUpperCase();
            if (noteName.includes('B#')) noteName = 'C';
            if (noteName.includes('E#')) noteName = 'F';
            const octave = parseInt(match[2], 10);
            let noteIdx = NOTES.indexOf(noteName);
            if (noteIdx !== -1) {
                const midi = (octave + 1) * 12 + noteIdx;
                parsed.push({
                    id: notesStr.length - index,
                    note: match[1],
                    octave: octave,
                    midi: midi
                });
            }
        }
    });
    return parsed;
}

if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', () => {
        const parsed = parseCustomNotes(customTuningText.value);
        if (parsed.length > 0) {
            TUNINGS.custom = parsed;
            updateGuitarStrings();
            reinitPolyTuner();
            alert(`Applied custom tuning: ${parsed.map(p => p.note + p.octave).join(', ')}`);
        } else {
            alert("Invalid format! Please use format like: E4, B3, G3, D3, A2, E2");
        }
    });
}

document.querySelectorAll('input[name="tuning"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentTuningKey = e.target.value;
        if (currentTuningKey === 'custom') {
            customTuningInput.style.display = 'flex';
            TUNINGS.custom = parseCustomNotes(customTuningText.value);
        } else {
            customTuningInput.style.display = 'none';
        }
        updateGuitarStrings();
        reinitPolyTuner();
    });
});

const pitchSlider = document.getElementById('pitch-slider');
const pitchVal = document.getElementById('pitch-val');

function updateSliderBackground() {
    if (!pitchSlider) return;
    const val = (pitchSlider.value - pitchSlider.min) / (pitchSlider.max - pitchSlider.min) * 100;
    pitchSlider.style.background = `linear-gradient(to right, #00ff88 0%, #00ff88 ${val}%, rgba(255, 255, 255, 0.1) ${val}%, rgba(255, 255, 255, 0.1) 100%)`;
}

if (pitchSlider && pitchVal) {
    pitchSlider.addEventListener('input', (e) => {
        referencePitch = parseInt(e.target.value, 10);
        pitchVal.textContent = `${referencePitch} Hz`;
        updateSliderBackground();
        updateGuitarStrings();
        reinitPolyTuner();
    });

    // Set initial custom background
    updateSliderBackground();
}

class TuningCard {
    constructor(container, stringInfo = null) {
        this.container = container;
        this.stringInfo = stringInfo;
        this.element = this.createCard();
        this.container.appendChild(this.element);
        this.canvas = this.element.querySelector('.oscilloscope-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.history = new Array(100).fill(0); // Store last 100 cents measurements
        this.isActuallyDetected = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    createCard() {
        const card = document.createElement('div');
        card.className = 'tuning-card';
        const label = this.stringInfo ? `${this.stringInfo.id} - ${this.stringInfo.note}` : '1 - E';

        card.innerHTML = `
      <div class="card-header">
        <div class="string-info">${label}</div>
        <div class="measurement-info">
          <span class="cents-display">+0.0</span>
          <span class="cents-label">Cents</span>
          <span class="freq-display">0.0 Hz</span>
        </div>
      </div>
      <div class="scale-container">
        <div class="scale-markers">
          <span>-50</span>
          <span>-30</span>
          <span>-20</span>
          <span>-10</span>
          <span>0</span>
          <span>+10</span>
          <span>+20</span>
          <span>+30</span>
          <span>+50</span>
        </div>
        <div class="scale-line"></div>
        <canvas class="oscilloscope-canvas"></canvas>
      </div>
    `;
        return card;
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    }

    update(data) {
        const { cents, frequency, isDetected, name, octave } = data;
        const centsElem = this.element.querySelector('.cents-display');
        const freqElem = this.element.querySelector('.freq-display');
        const noteElem = this.element.querySelector('.string-info');

        this.isActuallyDetected = isDetected;

        if (isDetected) {
            const freqValue = typeof frequency === 'number' ? frequency : parseFloat(frequency);
            centsElem.textContent = (cents >= 0 ? '+' : '') + cents.toFixed(1);
            freqElem.textContent = freqValue.toFixed(1) + ' Hz';

            // Update label based on the actual detected note, even in poly tuner
            if (!this.stringInfo) {
                noteElem.textContent = `${name}${octave}`;
            } else {
                noteElem.textContent = `${this.stringInfo.id} - ${name}${octave}`;
            }

            // Push to history
            this.history.push(cents);
            this.history.shift();

            if (Math.abs(cents) < 5) {
                this.element.classList.add('in-tune');
            } else {
                this.element.classList.remove('in-tune');
            }
        } else {
            centsElem.textContent = '+0.0';
            freqElem.textContent = '0.0 Hz';
            this.element.classList.remove('in-tune');

            if (!this.stringInfo) {
                noteElem.textContent = '---';
            } else {
                noteElem.textContent = `${this.stringInfo.id} - ${this.stringInfo.note}`;
            }

            // Push 0 or stay static when not detected? 
            // In a horizontal tracker, we usually push the last value or 0 or just stop.
            // Let's push something that shows "not listening"
            this.history.push(null);
            this.history.shift();
        }

        this.drawHistory();
    }

    drawHistory() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const step = h / (this.history.length - 1);
        this.ctx.beginPath();
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // We want to color each segment dynamically.
        // Red when far away (> 10 cents), interpolating to Green when close (0 cents).
        let first = true;
        for (let i = 0; i < this.history.length; i++) {
            const cents = this.history[i];
            if (cents === null) {
                first = true;
                continue;
            }

            // Map cents (-50 to +50) to canvas width (X-axis)
            const x = w / 2 + (cents / 50) * (w * 0.4);
            const y = h - i * step;

            if (first) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                first = false;
            } else {
                // Color mapping: 
                // Math.abs(cents): 0 -> #00ff88 (Green)
                // Math.abs(cents): 20+ -> #ff4466 (Red)
                const errorRatio = Math.min(1.0, Math.abs(cents) / 20); // 0 = perfect, 1 = red
                const r = Math.round(0 + errorRatio * 255);
                const g = Math.round(255 - errorRatio * 187); // 255 to 68
                const b = Math.round(136 - errorRatio * 34);  // 136 to 102
                const strokeColor = `rgba(${r}, ${g}, ${b}, ${1.0 - (i / this.history.length) * 0.8})`;

                this.ctx.lineTo(x, y);
                this.ctx.strokeStyle = strokeColor;
                this.ctx.shadowBlur = errorRatio < 0.2 ? 10 : 0;
                this.ctx.shadowColor = 'rgba(0, 255, 136, 0.5)';
                this.ctx.stroke();

                // Start next segment
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
            }
        }
    }
}

let simpleCard = null;
let polyCards = [];

function initTuner() {
    const simpleContainer = document.getElementById('simple-tuner-container');
    simpleCard = new TuningCard(simpleContainer);
    reinitPolyTuner();
}

function reinitPolyTuner() {
    const polyGrid = document.getElementById('poly-tuner-grid');
    if (polyGrid) {
        polyGrid.innerHTML = '';
        polyCards = GUITAR_STRINGS.map(string => new TuningCard(polyGrid, string));

        // Re-calculate layout if poly-view happens to be active
        const polyView = document.getElementById('poly-view');
        if (polyView && polyView.classList.contains('active')) {
            polyCards.forEach(card => card.resize());
        }
    }
}

// Navigation handling
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetViewId = item.getAttribute('data-view');

        navItems.forEach(nb => nb.classList.remove('active'));
        item.classList.add('active');

        views.forEach(view => {
            view.classList.remove('active');
            if (view.id === targetViewId) {
                view.classList.add('active');
                // Trigger resize for all cards in the new view
                if (targetViewId === 'simple-view' && simpleCard) {
                    simpleCard.resize();
                } else if (targetViewId === 'poly-view') {
                    polyCards.forEach(card => card.resize());
                }
            }
        });
    });
});

startBtn.addEventListener('click', async () => {
    const success = await processor.initialize();
    if (success) {
        initialOverlay.style.display = 'none';
        initTuner();
        animate();
    } else {
        alert('Could not access microphone. Please check permissions.');
    }
});

function animate() {
    // Ensure context is running (browsers may suspend it)
    if (processor.audioContext && processor.audioContext.state === 'suspended') {
        processor.audioContext.resume();
    }

    const simpleView = document.getElementById('simple-view');

    if (simpleView && simpleView.classList.contains('active')) {
        // Only run Monophonic processing
        const monoNote = processor.getMonoNote() || { cents: 0, frequency: 0, isDetected: false };
        if (simpleCard) simpleCard.update({ ...monoNote, isDetected: !!monoNote.name });
    } else if (polyCards.length > 0) {
        // Only run Polyphonic processing passing dynamic array
        const detected = processor.getPolyNotes(GUITAR_STRINGS);
        // Update all 6 strings in poly view
        polyCards.forEach((card, index) => {
            const stringInfo = GUITAR_STRINGS[index];
            const match = detected.find(n => {
                // Approximate match for the string (within 2 semitones)
                const freq = typeof n.frequency === 'number' ? n.frequency : parseFloat(n.frequency);
                const freqDiff = Math.abs(1200 * Math.log2(freq / stringInfo.targetFreq));
                return freqDiff < 200;
            });

            if (match) {
                // For poly mode, calculate cents relative to the TARGET frequency of the string
                const freq = typeof match.frequency === 'number' ? match.frequency : parseFloat(match.frequency);
                const relativeCents = 1200 * Math.log2(freq / stringInfo.targetFreq);
                card.update({ ...match, cents: relativeCents, isDetected: true });
            } else {
                card.update({ cents: 0, frequency: stringInfo.targetFreq, isDetected: false });
            }
        });
    }

    // Draw Frequency Analyzer if enabled
    if (analyzerEnabled && analyzerCtx) {
        const w = analyzerCanvas.width;
        const h = analyzerCanvas.height;
        const binCount = processor.analyser.frequencyBinCount;
        const byteData = new Uint8Array(binCount);
        processor.getByteFrequencyData(byteData);

        analyzerCtx.clearRect(0, 0, w, h);

        // Draw a smooth wave at the bottom, centered horizontally
        // Display first 1024 bins which covers up to ~2.7kHz at 44.1kHz (perfect for guitar)
        const displayBins = Math.min(1024, binCount);

        // We will draw from the center outwards symmetrically
        const center = w / 2;
        const step = center / displayBins;

        analyzerCtx.beginPath();
        analyzerCtx.moveTo(w, h); // Start at bottom right
        analyzerCtx.lineTo(0, h); // Line to bottom left

        // Left side (mirrored)
        for (let i = displayBins - 1; i >= 0; i--) {
            const value = byteData[i];
            const percent = value / 255;
            const height = percent * h * 0.4; // Max height is 40% of screen
            const x = center - (i * step);
            analyzerCtx.lineTo(x, h - height);
        }

        // Right side (normal)
        for (let i = 0; i < displayBins; i++) {
            const value = byteData[i];
            const percent = value / 255;
            const height = percent * h * 0.4;
            const x = center + (i * step);
            analyzerCtx.lineTo(x, h - height);
        }

        analyzerCtx.lineTo(w, h);
        analyzerCtx.closePath();

        const gradient = analyzerCtx.createLinearGradient(0, h, 0, h * 0.6);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0.0)');

        analyzerCtx.fillStyle = gradient;
        analyzerCtx.fill();

        analyzerCtx.lineWidth = 2;
        analyzerCtx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
        analyzerCtx.stroke();
    }

    requestAnimationFrame(animate);
}
