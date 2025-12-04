import { hexToRgb } from '../utils.js';

export class ColorLoader {
    /**
     * Fetches and parses the CSV data.
     * @param {string} url - Path to the CSV file
     * @param {function} onProgress - Callback (percent, statusMessage)
     * @returns {Promise<Array>} - Array of color objects
     */
    static async load(url, onProgress) {
        try {
            // 1. Fetch
            if (onProgress) onProgress(10, 'Fetching CSV file...');
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // 2. Read Text
            if (onProgress) onProgress(30, 'Reading file data...');
            const text = await response.text();

            // 3. Parse Lines
            if (onProgress) onProgress(40, 'Parsing colors...');
            const lines = text.split('\n');
            const totalLines = lines.length;
            const data = [];

            // Skip header (i=1)
            for (let i = 1; i < totalLines; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const parts = line.split(',');
                
                // Ensure row has enough columns based on your specific CSV structure
                if (parts.length >= 5) {
                    const hex = parts[1];
                    const rgb = hexToRgb(hex); // Util helper
                    
                    data.push({
                        name: parts[0],
                        hex: hex,
                        l: parseFloat(parts[2]),
                        a: parseFloat(parts[3]),
                        oklab_b: parseFloat(parts[4]),
                        // Adding RGB to the data object avoids recalculating it later
                        r: rgb.r,
                        g: rgb.g,
                        b: rgb.b,
                        flag: JSON.parse(parts[5] || 'false'), // Safe fallback
                    });
                }

                // 4. Non-blocking yield
                // Every 2000 lines, pause execution to let the UI breathe
                if (i % 2000 === 0) {
                    const progress = 40 + (i / totalLines) * 30;
                    if (onProgress) {
                        onProgress(progress, `Parsing colors... ${i}/${totalLines}`);
                    }
                    // This allows the browser to render the loading bar update
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            return data;

        } catch (error) {
            // Re-throw so main.js can handle the UI error display
            throw error;
        }
    }
}