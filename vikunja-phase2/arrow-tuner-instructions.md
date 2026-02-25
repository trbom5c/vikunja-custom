# Gantt Arrow Tuner

## Quick Start

1. Open your Gantt page in the browser
2. Open DevTools console — press `F12` then click the **Console** tab
3. Paste the entire contents of `arrow-tuner.js` into the console and press Enter
4. A floating panel appears in the top-right corner

## Controls

| Control | Range | What it does |
|---------|-------|-------------|
| Stroke Width | 0.5 – 4 | Thickness of the arrow lines |
| Dash Pattern | presets | Line style — dashed, dotted, dot-dash, or solid |
| Opacity | 0.1 – 1.0 | Transparency of the arrow lines |
| Bezier Spread | 0.1 – 0.9 | How wide the S-curve bends (lower = tighter, higher = wider) |
| Detour Size | 5 – 40 | How far overlapping arrows route around bars |
| Arrow Size | 4 – 16 | Size of the arrowhead triangle |
| Palette | multi / mono | Color-coded per arrow or single gray color |
| Source Dots | on/off | Show a dot where each arrow starts |
| Dot Radius | 1 – 6 | Size of source dots |
| Drop Shadow | on/off | Dark shadow behind lines for contrast |
| Shadow Width | 2 – 8 | Thickness of the shadow |
| Shadow Opacity | 0.05 – 0.5 | Darkness of the shadow |

## Usage

- Move sliders — changes apply instantly to the live Gantt arrows
- Click **📋 Copy Config** when happy — copies a JSON config to your clipboard
- Click **↩ Reset** to restore defaults
- Click **✕ Close** to remove the panel

## Applying Your Config

Paste the copied JSON config to Claude and the values will be baked into the `GanttDependencyArrows.vue` component permanently.
