// Gantt Dependency Arrow Tuner v3
// Paste into browser console on the Gantt page
// Independent control of both bezier control points

(function() {
  const existing = document.getElementById('arrow-tuner');
  if (existing) existing.remove();

  const config = {
    strokeWidth: 1.5,
    dashArray: '4,2',
    opacity: 0.6,
    // CP1 = control point near source (controls initial arc)
    cp1X: 0.5,         // horizontal position: 0 = at source, 1 = at target
    cp1Y: 0,           // vertical offset from SOURCE y. Negative = UP
    // CP2 = control point near target (controls approach/swoop)
    cp2X: 0.5,         // horizontal position: 0 = at source, 1 = at target
    cp2Y: 0,           // vertical offset from TARGET y. Negative = UP, Positive = DOWN
    detourSize: 15,
    arrowSize: 8,
    zIndex: 5,
    showDots: false,
    dotRadius: 3,
    showShadow: false,
    shadowWidth: 4,
    shadowOpacity: 0.2,
    showControlPoints: false,
    palette: 'multi',
  };

  const originalPaths = [];

  const panel = document.createElement('div');
  panel.id = 'arrow-tuner';
  panel.innerHTML = `
    <style>
      #arrow-tuner {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 350px;
        max-height: 90vh;
        overflow-y: auto;
        background: rgba(20, 22, 30, 0.95);
        border: 1px solid rgba(100, 120, 200, 0.4);
        border-radius: 8px;
        padding: 12px;
        z-index: 99999;
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 12px;
        color: #ccd;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      #arrow-tuner h3 {
        margin: 0 0 10px;
        font-size: 13px;
        color: #8af;
        border-bottom: 1px solid rgba(100,120,200,0.3);
        padding-bottom: 6px;
        cursor: move;
      }
      #arrow-tuner .row {
        display: flex;
        align-items: center;
        margin-bottom: 5px;
        gap: 6px;
      }
      #arrow-tuner label {
        flex: 0 0 90px;
        font-size: 11px;
        color: #99a;
      }
      #arrow-tuner input[type="range"] {
        flex: 1;
        height: 4px;
        accent-color: #5DA5DA;
      }
      #arrow-tuner .val {
        flex: 0 0 42px;
        text-align: right;
        font-size: 11px;
        color: #aaf;
      }
      #arrow-tuner select {
        background: rgba(40,42,55,0.9);
        border: 1px solid rgba(100,120,200,0.3);
        color: #ccd;
        border-radius: 4px;
        padding: 2px 4px;
        font-size: 11px;
        flex: 1;
      }
      #arrow-tuner button {
        margin: 4px 4px 0 0;
        padding: 5px 12px;
        border: 1px solid rgba(100,120,200,0.4);
        border-radius: 4px;
        background: rgba(50,55,80,0.8);
        color: #aaf;
        cursor: pointer;
        font-size: 11px;
      }
      #arrow-tuner button:hover { background: rgba(70,75,110,0.9); }
      #arrow-tuner button.primary { background: rgba(93,165,218,0.4); color: #fff; }
      #arrow-tuner .section {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid rgba(100,120,200,0.15);
      }
      #arrow-tuner .sec-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      #arrow-tuner .sec-label.red { color: #f88; }
      #arrow-tuner .sec-label.blue { color: #88f; }
      #arrow-tuner .sec-label.gray { color: #668; }
      #arrow-tuner .toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 5px;
      }
      #arrow-tuner .toggle input { accent-color: #5DA5DA; }
      #arrow-tuner .status {
        font-size: 10px;
        color: #6a6;
        margin-top: 6px;
        min-height: 14px;
      }
      #arrow-tuner .hint {
        font-size: 9px;
        color: #556;
        margin: -2px 0 5px 0;
        line-height: 1.3;
      }
      #arrow-tuner .cp-diagram {
        background: rgba(30,32,45,0.8);
        border: 1px solid rgba(80,90,140,0.3);
        border-radius: 4px;
        padding: 4px;
        margin-bottom: 6px;
        text-align: center;
      }
      #arrow-tuner .cp-diagram svg { display: block; margin: 0 auto; }
    </style>

    <h3 id="tuner-drag-handle">🎯 Arrow Tuner v3</h3>

    <!-- Mini diagram -->
    <div class="cp-diagram">
      <svg width="310" height="50" viewBox="0 0 310 50">
        <circle cx="20" cy="25" r="6" fill="rgba(100,180,100,0.6)" stroke="#6a6" stroke-width="1"/>
        <text x="20" y="48" fill="#668" font-size="8" text-anchor="middle">SRC</text>
        <circle cx="290" cy="25" r="6" fill="rgba(100,180,100,0.6)" stroke="#6a6" stroke-width="1"/>
        <text x="290" y="48" fill="#668" font-size="8" text-anchor="middle">TGT</text>
        <circle cx="120" cy="10" r="5" fill="rgba(255,100,100,0.7)" stroke="#f66" stroke-width="1" id="diagram-cp1"/>
        <text x="120" y="8" fill="#f88" font-size="7" text-anchor="middle" dy="-6">CP1</text>
        <circle cx="200" cy="40" r="5" fill="rgba(100,100,255,0.7)" stroke="#66f" stroke-width="1" id="diagram-cp2"/>
        <text x="200" y="40" fill="#88f" font-size="7" text-anchor="middle" dy="12">CP2</text>
        <path d="M 20 25 C 120 10, 200 40, 290 25" fill="none" stroke="rgba(150,150,200,0.5)" stroke-width="1.5" stroke-dasharray="3,2" id="diagram-curve"/>
        <line x1="20" y1="25" x2="120" y2="10" stroke="rgba(255,100,100,0.2)" stroke-width="1" stroke-dasharray="2,2"/>
        <line x1="290" y1="25" x2="200" y2="40" stroke="rgba(100,100,255,0.2)" stroke-width="1" stroke-dasharray="2,2"/>
      </svg>
    </div>

    <div class="sec-label gray">Line Style</div>
    <div class="row">
      <label>Stroke</label>
      <input type="range" min="0.5" max="4" step="0.25" value="1.5" data-key="strokeWidth">
      <span class="val">1.5</span>
    </div>
    <div class="row">
      <label>Dash</label>
      <select data-key="dashArray">
        <option value="4,2" selected>4,2 (default)</option>
        <option value="6,3">6,3 (longer)</option>
        <option value="2,2">2,2 (short)</option>
        <option value="8,4">8,4 (wide)</option>
        <option value="4,2,1,2">4,2,1,2 (dot-dash)</option>
        <option value="none">solid</option>
      </select>
    </div>
    <div class="row">
      <label>Opacity</label>
      <input type="range" min="0.1" max="1" step="0.05" value="0.6" data-key="opacity">
      <span class="val">0.6</span>
    </div>
    <div class="row">
      <label>Arrow Size</label>
      <input type="range" min="4" max="16" step="1" value="8" data-key="arrowSize">
      <span class="val">8</span>
    </div>

    <div class="section">
      <div class="sec-label red">🔴 CP1 — Source Side (initial arc)</div>
      <div class="hint">Controls where the curve goes after leaving the source bar</div>
      <div class="row">
        <label>CP1 Horiz</label>
        <input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-key="cp1X">
        <span class="val">0.5</span>
      </div>
      <div class="hint">0 = at source, 1 = at target</div>
      <div class="row">
        <label>CP1 Vert ↕</label>
        <input type="range" min="-200" max="200" step="5" value="0" data-key="cp1Y">
        <span class="val">0</span>
      </div>
      <div class="hint">Negative = pull UP (arc above bars). Positive = push DOWN</div>
    </div>

    <div class="section">
      <div class="sec-label blue">🔵 CP2 — Target Side (approach swoop)</div>
      <div class="hint">Controls how the curve approaches the target bar</div>
      <div class="row">
        <label>CP2 Horiz</label>
        <input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-key="cp2X">
        <span class="val">0.5</span>
      </div>
      <div class="hint">0 = at source, 1 = at target</div>
      <div class="row">
        <label>CP2 Vert ↕</label>
        <input type="range" min="-200" max="200" step="5" value="0" data-key="cp2Y">
        <span class="val">0</span>
      </div>
      <div class="hint">Negative = approach from ABOVE. Positive = swoop from BELOW</div>
    </div>

    <div class="section">
      <div class="sec-label gray">Other</div>
      <div class="row">
        <label>Detour</label>
        <input type="range" min="5" max="40" step="1" value="15" data-key="detourSize">
        <span class="val">15</span>
      </div>
      <div class="row">
        <label>Palette</label>
        <select data-key="palette">
          <option value="multi" selected>Multi-color</option>
          <option value="mono">Mono (original)</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sec-label gray">Extras</div>
      <div class="toggle">
        <input type="checkbox" data-key="showDots">
        <label style="flex:none">Source dots</label>
      </div>
      <div class="row">
        <label>Dot Radius</label>
        <input type="range" min="1" max="6" step="0.5" value="3" data-key="dotRadius">
        <span class="val">3</span>
      </div>
      <div class="toggle">
        <input type="checkbox" data-key="showShadow">
        <label style="flex:none">Drop shadow</label>
      </div>
      <div class="row">
        <label>Shadow W</label>
        <input type="range" min="2" max="8" step="0.5" value="4" data-key="shadowWidth">
        <span class="val">4</span>
      </div>
      <div class="row">
        <label>Shadow Op</label>
        <input type="range" min="0.05" max="0.5" step="0.05" value="0.2" data-key="shadowOpacity">
        <span class="val">0.2</span>
      </div>
      <div class="toggle">
        <input type="checkbox" data-key="showControlPoints">
        <label style="flex:none">Show control points (debug)</label>
      </div>
    </div>

    <div style="margin-top: 10px;">
      <button class="primary" id="tuner-copy">📋 Copy Config</button>
      <button id="tuner-reset">↩ Reset</button>
      <button id="tuner-close">✕ Close</button>
    </div>
    <div class="status" id="tuner-status"></div>
  `;

  document.body.appendChild(panel);

  // Draggable
  let isDragging = false, dragX, dragY;
  const handle = panel.querySelector('#tuner-drag-handle');
  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragX = e.clientX - panel.offsetLeft;
    dragY = e.clientY - panel.offsetTop;
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragX) + 'px';
    panel.style.top = (e.clientY - dragY) + 'px';
    panel.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  const MULTI_COLORS = [
    [93,165,218], [250,164,58], [96,189,104], [241,88,84],
    [178,118,178], [222,207,63], [77,201,246], [241,124,176],
    [178,145,47], [0,193,166]
  ];

  function getColor(index) {
    const a = config.opacity;
    if (config.palette === 'mono') return `rgba(150,150,200,${a})`;
    const c = MULTI_COLORS[index % MULTI_COLORS.length];
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  function captureOriginals() {
    if (originalPaths.length > 0) return;
    const svg = document.querySelector('.gantt-dependency-arrows');
    if (!svg) return;
    svg.querySelectorAll('path[class="dependency-arrow"], path[marker-end]').forEach(path => {
      const d = path.getAttribute('d');
      if (!d) return;
      const bMatch = d.match(/^M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+)$/);
      if (bMatch) {
        originalPaths.push({
          type: 'bezier',
          sx: parseFloat(bMatch[1]), sy: parseFloat(bMatch[2]),
          tx: parseFloat(bMatch[7]), ty: parseFloat(bMatch[8]),
        });
        return;
      }
      const dMatch = d.match(/^M\s+([\d.-]+)\s+([\d.-]+)/);
      if (dMatch) {
        originalPaths.push({
          type: 'detour',
          sx: parseFloat(dMatch[1]), sy: parseFloat(dMatch[2]),
          raw: d,
        });
      }
    });
  }

  function updateDiagram() {
    const curve = document.getElementById('diagram-curve');
    const cp1dot = document.getElementById('diagram-cp1');
    const cp2dot = document.getElementById('diagram-cp2');
    if (!curve || !cp1dot || !cp2dot) return;

    // Map config to diagram coords (310x50, src=20,25 tgt=290,25)
    const sx = 20, sy = 25, tx = 290, ty = 25;
    const dx = tx - sx;
    const c1x = sx + dx * config.cp1X;
    const c1y = sy + config.cp1Y * 0.15; // scale down for mini view
    const c2x = sx + dx * config.cp2X;
    const c2y = ty + config.cp2Y * 0.15;

    cp1dot.setAttribute('cx', String(c1x));
    cp1dot.setAttribute('cy', String(Math.max(3, Math.min(47, c1y))));
    cp2dot.setAttribute('cx', String(c2x));
    cp2dot.setAttribute('cy', String(Math.max(3, Math.min(47, c2y))));
    curve.setAttribute('d', `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`);
  }

  function redraw() {
    const svg = document.querySelector('.gantt-dependency-arrows');
    if (!svg) { setStatus('⚠ No arrow SVG found'); return; }

    captureOriginals();

    svg.querySelectorAll('.tuner-added').forEach(el => el.remove());

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.prepend(defs);
    }
    defs.innerHTML = '';

    const arrowPaths = Array.from(
      svg.querySelectorAll('path[class="dependency-arrow"], path[marker-end]')
    ).filter(p => !p.classList.contains('tuner-added'));

    arrowPaths.forEach((path, i) => {
      const color = getColor(i);
      const orig = originalPaths[i];

      // Marker
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `tuner-arrow-${i}`);
      marker.setAttribute('markerWidth', String(config.arrowSize));
      marker.setAttribute('markerHeight', String(config.arrowSize * 0.75));
      marker.setAttribute('refX', String(config.arrowSize - 1));
      marker.setAttribute('refY', String(config.arrowSize * 0.375));
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', `0 0, ${config.arrowSize} ${config.arrowSize*0.375}, 0 ${config.arrowSize*0.75}`);
      poly.setAttribute('fill', color);
      marker.appendChild(poly);
      defs.appendChild(marker);

      // Recompute bezier
      if (orig && orig.type === 'bezier') {
        const { sx, sy, tx, ty } = orig;
        const dx = tx - sx;
        const c1x = sx + dx * config.cp1X;
        const c1y = sy + config.cp1Y;
        const c2x = sx + dx * config.cp2X;
        const c2y = ty + config.cp2Y;

        path.setAttribute('d', `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`);

        if (config.showControlPoints) {
          // CP1 dot + line
          addCircle(svg, c1x, c1y, 4, 'rgba(255,100,100,0.8)', '#f66');
          addLine(svg, sx, sy, c1x, c1y, 'rgba(255,100,100,0.25)');
          // CP2 dot + line
          addCircle(svg, c2x, c2y, 4, 'rgba(100,100,255,0.8)', '#66f');
          addLine(svg, tx, ty, c2x, c2y, 'rgba(100,100,255,0.25)');
        }
      }

      // Style
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', String(config.strokeWidth));
      path.setAttribute('stroke-dasharray', config.dashArray === 'none' ? '' : config.dashArray);
      path.setAttribute('marker-end', `url(#tuner-arrow-${i})`);

      // Shadow
      if (config.showShadow) {
        const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shadow.classList.add('tuner-added');
        shadow.setAttribute('d', path.getAttribute('d'));
        shadow.setAttribute('fill', 'none');
        shadow.setAttribute('stroke', `rgba(0,0,0,${config.shadowOpacity})`);
        shadow.setAttribute('stroke-width', String(config.shadowWidth));
        shadow.setAttribute('stroke-linecap', 'round');
        svg.insertBefore(shadow, svg.firstChild.nextSibling);
      }

      // Dot
      if (config.showDots) {
        const m = path.getAttribute('d').match(/^M\s+([\d.-]+)\s+([\d.-]+)/);
        if (m) addCircle(svg, parseFloat(m[1]), parseFloat(m[2]), config.dotRadius, color);
      }
    });

    svg.style.zIndex = String(config.zIndex);
    updateDiagram();
    setStatus(`✓ Applied to ${arrowPaths.length} arrows`);
  }

  function addCircle(svg, cx, cy, r, fill, stroke) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.classList.add('tuner-added');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', fill);
    if (stroke) { c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '1'); }
    svg.appendChild(c);
  }

  function addLine(svg, x1, y1, x2, y2, color) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.classList.add('tuner-added');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', '1');
    l.setAttribute('stroke-dasharray', '2,2');
    svg.appendChild(l);
  }

  function setStatus(msg) {
    const el = document.getElementById('tuner-status');
    if (el) el.textContent = msg;
  }

  // Bind controls
  panel.querySelectorAll('input[type="range"]').forEach(input => {
    const key = input.dataset.key;
    const valSpan = input.nextElementSibling;
    input.addEventListener('input', () => {
      config[key] = parseFloat(input.value);
      if (valSpan && valSpan.classList.contains('val')) valSpan.textContent = input.value;
      redraw();
    });
  });
  panel.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => { config[sel.dataset.key] = sel.value; redraw(); });
  });
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => { config[cb.dataset.key] = cb.checked; redraw(); });
  });

  document.getElementById('tuner-copy').addEventListener('click', () => {
    const output = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(output).then(() => setStatus('✓ Copied!')).catch(() => prompt('Copy:', output));
  });

  document.getElementById('tuner-reset').addEventListener('click', () => {
    Object.assign(config, {
      strokeWidth: 1.5, dashArray: '4,2', opacity: 0.6,
      cp1X: 0.5, cp1Y: 0, cp2X: 0.5, cp2Y: 0,
      detourSize: 15, arrowSize: 8, zIndex: 5,
      showDots: false, dotRadius: 3,
      showShadow: false, shadowWidth: 4, shadowOpacity: 0.2,
      showControlPoints: false, palette: 'multi',
    });
    panel.querySelectorAll('input[type="range"]').forEach(input => {
      input.value = config[input.dataset.key];
      const v = input.nextElementSibling;
      if (v && v.classList.contains('val')) v.textContent = input.value;
    });
    panel.querySelectorAll('select').forEach(s => { s.value = config[s.dataset.key]; });
    panel.querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = config[c.dataset.key]; });
    redraw();
    setStatus('↩ Reset');
  });

  document.getElementById('tuner-close').addEventListener('click', () => panel.remove());

  redraw();
  console.log('%c🎯 Arrow Tuner v3 — CP1 (red) controls source arc, CP2 (blue) controls target approach', 'color: #5DA5DA; font-size: 14px;');
})();
