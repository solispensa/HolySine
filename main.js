import './style.css';
import { AudioProcessor } from './audioProcessor.js';

const processor = new AudioProcessor();
const startBtn = document.getElementById('start-audio');
const initialOverlay = document.getElementById('initial-overlay');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

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
    ]
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
document.querySelectorAll('input[name="tuning"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentTuningKey = e.target.value;
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

        let first = true;
        for (let i = 0; i < this.history.length; i++) {
            const cents = this.history[i];
            if (cents === null) {
                first = true;
                continue;
            }

            // Map cents (-50 to +50) to canvas width (X-axis)
            // -50 is at 10% width, +50 is at 90% width
            const x = w / 2 + (cents / 50) * (w * 0.4);
            // Oldest data (i=0) is pushed to bottom, newest (i=99) is top
            const y = h - i * step;

            if (first) {
                this.ctx.moveTo(x, y);
                first = false;
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
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

    requestAnimationFrame(animate);
}
