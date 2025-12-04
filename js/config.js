// Shared color space definitions
export const colorSpaces = {
    oklab: {
        name: 'Oklab',
        scale: 4.0,  // Base scale factor
        getPosition: function(color) {
            // Note: The 'scale' property here is modified by the UIManager
            // We use 'this.scale' if available, otherwise default to 4.0
            const s = (typeof this !== 'undefined' && this.scale) ? this.scale : 4.0;
            
            return {
                x: ((color.l - 0.5) * 1.0) * s,  // L: 0-1, center at 0.5
                y: (color.a * 2.5) * s,          // a: already centered around 0
                z: (color.oklab_b * 2.5) * s     // b: already centered around 0
            };
        },
        scales: { x: 1.0, y: 2.5, z: 2.5 },
        axisLabels: { x: 'L', y: 'A', z: 'B' }
    },
    rgb: {
        name: 'RGB',
        scale: 4.0,  // Base scale factor
        getPosition: function(color) {
            const s = (typeof this !== 'undefined' && this.scale) ? this.scale : 4.0;
            return {
                x: (color.r - 127.5) / 255 * s,  // R: 0-255, center at 127.5
                y: (color.g - 127.5) / 255 * s,  // G: 0-255, center at 127.5
                z: (color.b - 127.5) / 255 * s   // B: 0-255, center at 127.5
            };
        },
        scales: { x: 2.0, y: 2.0, z: 2.0 },
        axisLabels: { x: 'R', y: 'G', z: 'B' }
    }
};