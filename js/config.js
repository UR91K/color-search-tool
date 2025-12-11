/**
 * color space definitions for 3D visualization.
 * each space defines how colors are positioned in 3D space based on their components.
 */
export const colorSpaces = {
    oklab: {
        name: 'Oklab',
        scale: 4.0,
        getPosition: function(color) {
            const s = (typeof this !== 'undefined' && this.scale) ? this.scale : 4.0;

            return {
                x: ((color.l - 0.5) * 1.0) * s,
                y: (color.a * 2.5) * s,
                z: (color.oklab_b * 2.5) * s
            };
        },
        scales: { x: 1.0, y: 2.5, z: 2.5 },
        axisLabels: { x: 'L', y: 'A', z: 'B' }
    },
    rgb: {
        name: 'RGB',
        scale: 4.0,
        getPosition: function(color) {
            const s = (typeof this !== 'undefined' && this.scale) ? this.scale : 4.0;
            return {
                x: (color.r - 127.5) / 255 * s,
                y: (color.g - 127.5) / 255 * s,
                z: (color.b - 127.5) / 255 * s
            };
        },
        scales: { x: 2.0, y: 2.0, z: 2.0 },
        axisLabels: { x: 'R', y: 'G', z: 'B' }
    }
};