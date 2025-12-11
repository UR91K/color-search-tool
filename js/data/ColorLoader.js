import { hexToRgb } from '../utils.js';

export class ColorLoader {
    /**
     * fetches and parses the CSV data.
     * @param {string} url - path to the CSV file
     * @param {function} onProgress - callback (percent, statusMessage)
     * @returns {Promise<Array>} - array of colour objects
     */
    static async load(url, onProgress) {
        try {
            // fetch
            if (onProgress) onProgress(10, 'Fetching CSV file...');
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // read text
            if (onProgress) onProgress(30, 'Reading file data...');
            const text = await response.text();

            // parse lines
            if (onProgress) onProgress(40, 'Parsing colors...');
            const lines = text.split('\n');
            const totalLines = lines.length;
            const data = [];

            // skip header (i=1)
            for (let i = 1; i < totalLines; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const parts = line.split(',');
                
                // ensure row has enough columns based on your specific CSV structure
                if (parts.length >= 5) {
                    const hex = parts[1];
                    const rgb = hexToRgb(hex);
                    
                    data.push({
                        name: parts[0],
                        hex: hex,
                        l: parseFloat(parts[2]),
                        a: parseFloat(parts[3]),
                        oklab_b: parseFloat(parts[4]),
                        // adding RGB to the data object avoids recalculating it later
                        r: rgb.r,
                        g: rgb.g,
                        b: rgb.b,
                        flag: JSON.parse(parts[5] || 'false'),
                    });
                }

                // non blocking yield
                // every 2000 lines, update the loading bar
                if (i % 2000 === 0) {
                    const progress = 40 + (i / totalLines) * 30;
                    if (onProgress) {
                        onProgress(progress, `Parsing colors... ${i}/${totalLines}`);
                    }

                    // let the browser render the loading bar update
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            return data;

        } catch (error) {
            // re-throw to let main.js handle the UI error display
            throw error;
        }
    }
}