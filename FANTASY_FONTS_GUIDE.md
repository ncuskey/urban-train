# Fantasy Fonts Guide for Urban Train Map Generator

This guide explains how to use the new fantasy fonts in your procedural map generator.

## Quick Start

1. **Test the fonts**: Open `test-fantasy-fonts.html` in your browser to see all available fonts
2. **Switch fonts**: Use the font switcher buttons or call `switchFont('fontName')` in the console
3. **Apply to your map**: The fonts will automatically apply to all map labels

## Available Fantasy Fonts

### Medieval/Classical Themes

| Font | Key | Style | Best For |
|------|-----|-------|----------|
| **Cinzel** | `cinzel` | Elegant serif with medieval feel | General fantasy maps, elegant labels |
| **UnifrakturMaguntia** | `unifraktur` | Gothic blackletter style | Very medieval, dramatic maps |
| **MedievalSharp** | `medieval` | Hand-drawn medieval look | Rustic, authentic medieval feel |
| **Alegreya SC** | `alegreya` | Small caps serif | Classical, formal maps |

### Elegant/Readable Themes

| Font | Key | Style | Best For |
|------|-----|-------|----------|
| **Crimson Text** | `crimson` | Elegant serif with fantasy feel | Very readable, elegant maps |
| **Lora** | `lora` | Beautiful serif with good readability | Balanced readability and style |
| **Merriweather** | `merriweather` | Robust serif with fantasy feel | Excellent readability, professional look |
| **Georgia** | `georgia` | Original font | Clean, readable fallback |

## How to Use

### Method 1: Console Commands

Open your browser's developer console and use these commands:

```javascript
// Switch to a specific font
switchFont('cinzel');           // Medieval elegant
switchFont('unifraktur');       // Gothic blackletter
switchFont('medieval');         // Hand-drawn medieval
switchFont('alegreya');         // Classical small caps
switchFont('crimson');          // Elegant readable
switchFont('lora');             // Beautiful readable
switchFont('merriweather');     // Robust professional
switchFont('georgia');          // Original clean

// Cycle through all fonts
cycleFont();

// List all available fonts
listFonts();

// Get current font info
getCurrentFont();
```

### Method 2: CSS Variables

You can also change fonts by modifying the CSS variables directly:

```css
:root {
  --label-font: 'Cinzel', serif;
  --label-font-family: 'Cinzel', serif;
}
```

### Method 3: Programmatic Usage

Import the font module in your JavaScript:

```javascript
import { switchFont, getCurrentFont, FANTASY_FONTS } from './src/modules/fonts.js';

// Switch fonts
switchFont('cinzel');

// Get current font info
const current = getCurrentFont();
console.log(`Using ${current.name}: ${current.description}`);
```

## Font Recommendations by Map Type

### High Fantasy Maps
- **Cinzel** - Perfect for epic fantasy worlds
- **UnifrakturMaguntia** - For very dramatic, gothic settings
- **MedievalSharp** - For rustic, hand-drawn feel

### Readable Fantasy Maps
- **Crimson Text** - Excellent balance of style and readability
- **Lora** - Beautiful and very readable
- **Merriweather** - Most readable, professional appearance

### Classical/Historical Maps
- **Alegreya SC** - Small caps give a classical feel
- **Cinzel** - Elegant serif works well for historical settings

### Fallback Option
- **Georgia** - Clean, readable, works everywhere

## Technical Details

### Font Loading
All fonts are loaded from Google Fonts via CSS import in `styles.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=UnifrakturMaguntia&family=MedievalSharp&family=Alegreya+SC:wght@400;700&family=Crimson+Text:wght@400;600;700&family=Lora:wght@400;500;600;700&family=Merriweather:wght@300;400;700;900&display=swap');
```

### CSS Variables
The fonts are controlled by these CSS custom properties:

```css
:root {
  --label-font: 'Cinzel', serif;
  --label-font-family: 'Cinzel', serif;
}
```

### JavaScript Integration
The `labelFontFamily()` function in `src/modules/labels.js` reads the CSS variable:

```javascript
export function labelFontFamily() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--label-font-family');
  return (v && v.trim()) || 'Lora, serif';
}
```

## Performance Considerations

- **Font Loading**: Google Fonts are optimized for fast loading
- **Fallbacks**: All fonts have appropriate fallbacks (serif, cursive)
- **Caching**: Fonts are cached by the browser after first load
- **Display**: Uses `display=swap` for better loading performance

## License Information

All fonts included are from Google Fonts and are free for commercial use:

- **Cinzel**: SIL Open Font License
- **UnifrakturMaguntia**: SIL Open Font License  
- **MedievalSharp**: SIL Open Font License
- **Alegreya SC**: SIL Open Font License
- **Crimson Text**: SIL Open Font License
- **Lora**: SIL Open Font License
- **Merriweather**: SIL Open Font License

## Troubleshooting

### Font Not Loading
1. Check your internet connection (fonts load from Google)
2. Verify the CSS import is present in `styles.css`
3. Check browser console for any errors

### Font Not Applying
1. Make sure you're using the correct font key
2. Check that the CSS variables are being set correctly
3. Verify the `labelFontFamily()` function is working

### Performance Issues
1. Fonts should load quickly, but first load may take a moment
2. Subsequent loads will be cached
3. If loading is slow, consider using a local font fallback

## Custom Fonts

To add your own fonts:

1. Add the font import to `styles.css`
2. Add the font definition to `FANTASY_FONTS` in `src/modules/fonts.js`
3. Test with the font switcher

Example:

```javascript
// In src/modules/fonts.js
customFont: {
  name: 'Your Custom Font',
  family: "'Your Custom Font', serif",
  description: 'Your custom font description',
  weights: [400, 700]
}
```

## Testing

Use `test-fantasy-fonts.html` to:
- See all fonts in action
- Test font switching
- Preview how fonts look on map labels
- Compare readability and style

This test page provides a complete demonstration of all available fonts and their characteristics.
