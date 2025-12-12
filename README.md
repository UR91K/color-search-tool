# Color Search Tool

A color exploration tool built in modern vanilla JavaScript using Three.js for 3D visualization.

## Features

### Color Explorer
- **30,000+ Colors**: Explore the complete [meodai/color-names](https://github.com/meodai/color-names) dataset in 3D space
- **Multiple Color Spaces**: Switch between Oklab, CIELAB and RGB.
- **Lerping**: Real time color space switching with async position updates
- **Navigation**: Orbit, zoom, lerping, and WASD movement
- **Search**: Fuzzy matching with Levenshtein distance, keyboard navigation, and auto-selection
- **Quality Filtering**: Hide/show "bad" colors flagged in the dataset
- **Visual Customization**: Adjustable background (HSV), scale, and coordinate axes

## Getting Started

**Live Demo**: [oklabexplorer.netlify.app](https://oklabexplorer.netlify.app/)

### Local Development

**Prerequisites:**
- Browser (like Firefox, Chrome, etc.)
- Python 3

**Setup:**
```bash
# Clone and enter directory
git clone <repository-url>
cd color-search-tool

# Start development server
python serve.py
```

**Open**: `http://localhost:8000/index.html`

**Note**: The server serves CSV files with correct MIME type for client-side parsing.

## Controls

### Mouse Controls
- **Hover**: Hover over a colour to see its name/hex code
- **Left Click**: Select color and fly to it
- **Right Click + Drag**: Orbit camera around focus point
- **Scroll Wheel**: Zoom in/out

### Keyboard Controls
- **WASD**: Move orbit focus point
- **Settings Gear**: Toggle advanced controls panel

### Search
- Type in the search box for fuzzy color name matching
- Use arrow keys to navigate results
- Press Enter to select and fly to color

## Architecture

The application is built with a modular architecture:

- **`js/main.js`**: Application entry point and coordination
- **`js/systems/`**: Core systems (Renderer, CameraRig, Interaction, Picker)
- **`js/components/`**: Visual components (PointCloud)
- **`js/ui/`**: User interface management
- **`js/data/`**: Data loading utilities
- **`js/config.js`**: Color space definitions
- **`js/utils.js`**: Utility functions (color conversion, search algorithms)

## Data Format

Colors are stored in `data/colors_oklab.csv` with the following format:
```
name,hex,l,a,b,flag
Color Name,#RRGGBB,L_value,A_value,B_value,true/false
```

Where:
- `l`, `a`, `b`: Oklab color space coordinates
- `flag`: Quality indicator (true = "good" color, false = "bad" color)

Additional colours can always be added if desired.

## Technical Stack

- **Three.js**: WebGL 3D graphics library (CDN-loaded)
- **ES6 Modules**: Modern JavaScript with native module support
- **No Build Tools**: Zero configuration, runs directly in browsers
- **Vanilla JS**: No frameworks or bundlers required

## Performance

- **60 FPS**: Smooth 3D interaction on modern hardware
- **GPU Picking**: Hardware-accelerated color selection
- **Progressive Loading**: Non-blocking CSV parsing with UI updates
- **Instanced Rendering**: Efficient display of 30k+ spheres
- **Memory Optimized**: ~50MB RAM usage for full dataset

## Contributing

The dataset can be extended by adding colors to `data/colors_oklab.csv` in the format:
```
Color Name,#RRGGBB,L_value,A_value,B_value,true/false
```

Convert RGB to Oklab using a color science library, or use the existing conversion utilities.

## License & Acknowledgments

- **Color Data**: [meodai/color-names](https://github.com/meodai/color-names) dataset
- **Color Science**: Based on Björn Ottosson's Oklab color space research
- **Icons**: Settings gear from public domain sources
