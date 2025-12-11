import * as THREE from 'three';

/**
 * converts a hex color string to RGB object 
 * @param {string} hex - hex color string (with or without #)
 * @returns {Object} RGB object with r, g, b properties (0-255)
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

/**
 * encodes an instance index as an RGB color for GPU picking
 * uses offset of 1 so black (0,0,0) represents "no hit"
 * @param {number} index - Instance index to encode
 * @returns {THREE.Color} RGB color representing the index
 */
export function indexToColor(index) {
    const encoded = index + 1;
    const r = ((encoded >> 16) & 0xff) / 255;
    const g = ((encoded >> 8) & 0xff) / 255;
    const b = (encoded & 0xff) / 255;
    return new THREE.Color(r, g, b);
}

/**
 * decodes an RGB color back to the original instance index
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Decoded instance index
 */
export function colorToIndex(r, g, b) {
    const encoded = (r << 16) | (g << 8) | b;
    return encoded - 1;
}

/**
 * creates a debounced version of a function that delays execution until after wait milliseconds
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait before executing
 * @returns {Function} Debounced function
 */
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

/**
 * calculates Levenshtein distance between two strings for fuzzy search ranking
 * uses optimized algorithm with O(min(m,n)) space complexity
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance between the strings
 */
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
