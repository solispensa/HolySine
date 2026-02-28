
/**
 * Chord Logic for Identifying Guitar Chords
 * Handles Major, Minor, 7th, and basic voicings.
 */

const CHORD_INTERVALS = {
    'Major': [0, 4, 7],
    'Minor': [0, 3, 7],
    'Diminished': [0, 3, 6],
    'Augmented': [0, 4, 8],
    'Major 7': [0, 4, 7, 11],
    'Minor 7': [0, 3, 7, 10],
    'Dominant 7': [0, 4, 7, 10],
    'Sus 2': [0, 2, 7],
    'Sus 4': [0, 5, 7],
    'Major 6': [0, 4, 7, 9],
    'Minor 6': [0, 3, 7, 9],
    '9th': [0, 4, 7, 10, 2],
    'Major 9': [0, 4, 7, 11, 2],
    'Minor 9': [0, 3, 7, 10, 2],
    'Add 9': [0, 4, 7, 2],
    '7sus4': [0, 5, 7, 10]
};

const NOTES_MAP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function identifyChord(notes) {
    if (!notes || notes.length < 2) return null;

    // notes is an array of note objects: { name, octave, cents, frequency, magnitude }
    // Sort all notes by frequency to find the Bass (root candidate)
    const sortedByFreq = [...notes].sort((a, b) => a.frequency - b.frequency);

    // Get unique semi-tones (0-11)
    const uniqueSemiTones = [...new Set(notes.map(n => NOTES_MAP.indexOf(n.name)))].sort((a, b) => a - b);

    let bestMatch = null;

    // We check roots, prioritizing the lowest frequencies first
    for (const rootCandidate of sortedByFreq) {
        const root = NOTES_MAP.indexOf(rootCandidate.name);
        if (root === -1) continue;

        const rootName = NOTES_MAP[root];
        // Normalize other notes relative to this root (0-11)
        const normalized = uniqueSemiTones.map(s => (s - root + 12) % 12);

        for (const [chordName, intervals] of Object.entries(CHORD_INTERVALS)) {
            // Check if all chord intervals are present
            const isMatch = intervals.every(interval => normalized.includes(interval));

            if (isMatch) {
                // If the candidate root is indeed in the intervals (which it should be, 0), it's a strong match
                const matchGrade = intervals.length; // More intervals = more specific match

                if (!bestMatch || matchGrade > bestMatch.grade) {
                    bestMatch = {
                        root: rootName,
                        type: chordName,
                        fullName: `${rootName} ${chordName}`,
                        intervals: intervals,
                        grade: matchGrade,
                        detectedNotes: Array.from(new Set(notes.map(n => n.name)))
                    };
                }
            }
        }
    }

    return bestMatch;
}
