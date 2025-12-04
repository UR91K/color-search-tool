import * as THREE from 'three';

// helper function to convert hex to RGB
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// Encode instance index as RGB color (offset by 1 so black=0 means "no hit")
// Index 0 becomes color (1,0,0), index 1 becomes (1,0,1), etc.
export function indexToColor(index) {
    const encoded = index + 1; // Offset by 1 so 0 is never used
    const r = ((encoded >> 16) & 0xff) / 255;
    const g = ((encoded >> 8) & 0xff) / 255;
    const b = (encoded & 0xff) / 255;
    return new THREE.Color(r, g, b);
}

// Decode RGB color back to instance index
export function colorToIndex(r, g, b) {
    const encoded = (r << 16) | (g << 8) | b;
    return encoded - 1; // Remove offset
}

// Debounce function
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Levenshtein distance for sorting (optimized O(min(m,n)) space)
export function getEditDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    if (a.length > b.length) [a, b] = [b, a];

    const row = [];
    for (let i = 0; i <= a.length; i++) row[i] = i;

    for (let i = 1; i <= b.length; i++) {
        let prev = i;
        for (let j = 1; j <= a.length; j++) {
            let val;
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                val = row[j - 1];
            } else {
                val = Math.min(row[j - 1] + 1, Math.min(prev + 1, row[j] + 1));
            }
            row[j - 1] = prev;
            prev = val;
        }
        row[a.length] = prev;
    }
    return row[a.length];
}
