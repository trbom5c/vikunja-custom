// Gantt Dependency Arrow Tuner v4
// Adds stepped/routed path mode alongside bezier

(function() {
  const existing = document.getElementById('arrow-tuner');
  if (existing) existing.remove();

  const config = {
    strokeWidth: 1.5,
    dashArray: '4,2',
    opacity: 0.6,
    // Path mode
    pathMode: 'bezier',     // 'bezier' | 'stepped' | 'stepRounded'
    // Bezier controls
    cp1X: 0.5,
    cp1Y: 0,
    cp2X: 0.5,
    cp2Y: 0,
    // Stepped controls
    exitLength: 20,         // how far right before turning down
    entryLength: 20,        // how far left of target before arriving
    cornerRadius: 6,        // rounded corners on stepped paths
    // General
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
        position: fixed; top: 10px; right: 10px; width: 350px;
        max-height: 90vh; overflow-y: auto;
        background: rgba(20, 22, 30, 0.95);
        border: 1px solid rgba(100, 120, 200, 0.4);
        border-radius: 8px; padding: 12px; z-index: 99999;
        font-family: 'SF Mono', Monaco, monospace; font-size: 12px; color: #ccd;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      #arrow-tuner h3 {
        margin: 0 0 10px; font-size: 13px; color: #8af;
        border-bottom: 1px solid rgba(100,120,200,0.3);
        padding-bottom: 6px; cursor: move;
      }
      #arrow-tuner .row { display:flex; align-items:center; margin-bottom:5px; gap:6px; }
      #arrow-tuner label { flex:0 0 90px; font-size:11px; color:#99a; }
      #arrow-tuner input[type="range"] { flex:1; height:4px; accent-color:#5DA5DA; }
      #arrow-tuner .val { flex:0 0 42px; text-align:right; font-size:11px; color:#aaf; }
      #arrow-tuner select {
        background:rgba(40,42,55,0.9); border:1px solid rgba(100,120,200,0.3);
        color:#ccd; border-radius:4px; padding:2px 4px; font-size:11px; flex:1;
      }
      #arrow-tuner button {
        margin:4px 4px 0 0; padding:5px 12px;
        border:1px solid rgba(100,120,200,0.4); border-radius:4px;
        background:rgba(50,55,80,0.8); color:#aaf; cursor:pointer; font-size:11px;
      }
      #arrow-tuner button:hover { background:rgba(70,75,110,0.9); }
      #arrow-tuner button.primary { background:rgba(93,165,218,0.4); color:#fff; }
      #arrow-tuner .section {
        margin-top:8px; padding-top:6px;
        border-top:1px solid rgba(100,120,200,0.15);
      }
      #arrow-tuner .sec-label { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
      #arrow-tuner .sec-label.red { color:#f88; }
      #arrow-tuner .sec-label.blue { color:#88f; }
      #arrow-tuner .sec-label.green { color:#8d8; }
      #arrow-tuner .sec-label.gray { color:#668; }
      #arrow-tuner .toggle { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
      #arrow-tuner .toggle input { accent-color:#5DA5DA; }
      #arrow-tuner .status { font-size:10px; color:#6a6; margin-top:6px; min-height:14px; }
      #arrow-tuner .hint { font-size:9px; color:#556; margin:-2px 0 5px 0; line-height:1.3; }
      #arrow-tuner .mode-panel { display:none; }
      #arrow-tuner .mode-panel.active { display:block; }
      #arrow-tuner .cp-diagram {
        background:rgba(30,32,45,0.8); border:1px solid rgba(80,90,140,0.3);
        border-radius:4px; padding:4px; margin-bottom:6px; text-align:center;
      }
    </style>

    <h3 id="tuner-drag-handle">🎯 Arrow Tuner v4</h3>

    <!-- Mini diagram -->
    <div class="cp-diagram">
      <svg width="310" height="60" viewBox="0 0 310 60" id="diagram-svg">
        <rect x="5" y="15" width="30" height="16" rx="3" fill="rgba(100,180,100,0.3)" stroke="#6a6" stroke-width="1"/>
        <text x="20" y="26" fill="#8a8" font-size="7" text-anchor="middle">SRC</text>
        <rect x="255" y="35" width="50" height="16" rx="3" fill="rgba(100,180,100,0.3)" stroke="#6a6" stroke-width="1"/>
        <text x="280" y="46" fill="#8a8" font-size="7" text-anchor="middle">TARGET</text>
        <path id="diagram-curve" d="M 35 23 C 155 23, 155 43, 255 43" fill="none" stroke="rgba(150,150,200,0.6)" stroke-width="1.5" stroke-dasharray="3,2"/>
        <circle id="diagram-cp1" cx="155" cy="10" r="3" fill="rgba(255,100,100,0.7)" class="mode-bezier-el"/>
        <circle id="diagram-cp2" cx="155" cy="50" r="3" fill="rgba(100,100,255,0.7)" class="mode-bezier-el"/>
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
      <div class="sec-label green">⬡ Path Mode</div>
      <div class="row">
        <label>Mode</label>
        <select data-key="pathMode" id="path-mode-select">
          <option value="bezier" selected>Bezier (smooth curves)</option>
          <option value="stepped">Stepped (right angles)</option>
          <option value="stepRounded">Stepped + Rounded</option>
        </select>
      </div>
    </div>

    <!-- Bezier controls -->
    <div class="section mode-panel active" id="panel-bezier">
      <div class="sec-label red">🔴 CP1 — Source Arc</div>
      <div class="row">
        <label>CP1 Horiz</label>
        <input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-key="cp1X">
        <span class="val">0.5</span>
      </div>
      <div class="row">
        <label>CP1 Vert ↕</label>
        <input type="range" min="-200" max="200" step="5" value="0" data-key="cp1Y">
        <span class="val">0</span>
      </div>
      <div class="hint">Negative = UP above bars</div>

      <div class="sec-label blue">🔵 CP2 — Target Approach</div>
      <div class="row">
        <label>CP2 Horiz</label>
        <input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-key="cp2X">
        <span class="val">0.5</span>
      </div>
      <div class="row">
        <label>CP2 Vert ↕</label>
        <input type="range" min="-200" max="200" step="5" value="0" data-key="cp2Y">
        <span class="val">0</span>
      </div>
      <div class="hint">Negative = approach from above. Positive = swoop from below</div>
    </div>

    <!-- Stepped controls -->
    <div class="section mode-panel" id="panel-stepped">
      <div class="sec-label green">📐 Stepped Path Controls</div>
      <div class="hint">Path: exit right → turn down → run horizontal → turn down → enter target left</div>
      <div class="row">
        <label>Exit Length</label>
        <input type="range" min="5" max="100" step="5" value="20" data-key="exitLength">
        <span class="val">20</span>
      </div>
      <div class="hint">How far right from source before first turn</div>
      <div class="row">
        <label>Entry Length</label>
        <input type="range" min="5" max="100" step="5" value="20" data-key="entryLength">
        <span class="val">20</span>
      </div>
      <div class="hint">How far left of target for final approach</div>
      <div class="row">
        <label>Corner Radius</label>
        <input type="range" min="0" max="20" step="1" value="6" data-key="cornerRadius">
        <span class="val">6</span>
      </div>
      <div class="hint">0 = sharp corners, higher = rounder (only in Stepped + Rounded)</div>
    </div>

    <div class="section">
      <div class="sec-label gray">Other</div>
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
      <div class="toggle"><input type="checkbox" data-key="showDots"><label style="flex:none">Source dots</label></div>
      <div class="row">
        <label>Dot Radius</label>
        <input type="range" min="1" max="6" step="0.5" value="3" data-key="dotRadius">
        <span class="val">3</span>
      </div>
      <div class="toggle"><input type="checkbox" data-key="showShadow"><label style="flex:none">Drop shadow</label></div>
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
      <div class="toggle"><input type="checkbox" data-key="showControlPoints"><label style="flex:none">Show control points</label></div>
    </div>

    <div style="margin-top:10px;">
      <button class="primary" id="tuner-copy">📋 Copy Config</button>
      <button id="tuner-reset">↩ Reset</button>
      <button id="tuner-close">✕ Close</button>
    </div>
    <div class="status" id="tuner-status"></div>
  `;

  document.body.appendChild(panel);

  // Draggable
  let isDragging = false, dragX, dragY;
  panel.querySelector('#tuner-drag-handle').addEventListener('mousedown', (e) => {
    isDragging = true; dragX = e.clientX - panel.offsetLeft; dragY = e.clientY - panel.offsetTop;
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragX) + 'px';
    panel.style.top = (e.clientY - dragY) + 'px';
    panel.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => isDragging = false);

  // Mode panel switching
  function updateModePanels() {
    const isBezier = config.pathMode === 'bezier';
    document.getElementById('panel-bezier').classList.toggle('active', isBezier);
    document.getElementById('panel-stepped').classList.toggle('active', !isBezier);
  }

  const MULTI_COLORS = [
    [93,165,218],[250,164,58],[96,189,104],[241,88,84],
    [178,118,178],[222,207,63],[77,201,246],[241,124,176],
    [178,145,47],[0,193,166]
  ];

  function getColor(i) {
    const a = config.opacity;
    if (config.palette === 'mono') return `rgba(150,150,200,${a})`;
    const c = MULTI_COLORS[i % MULTI_COLORS.length];
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  function captureOriginals() {
    if (originalPaths.length > 0) return;
    const svg = document.querySelector('.gantt-dependency-arrows');
    if (!svg) return;
    svg.querySelectorAll('path[class="dependency-arrow"], path[marker-end]').forEach(path => {
      const d = path.getAttribute('d');
      if (!d) return;
      const b = d.match(/^M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+)$/);
      if (b) {
        originalPaths.push({ type:'bezier', sx:+b[1], sy:+b[2], tx:+b[7], ty:+b[8] });
        return;
      }
      const m = d.match(/^M\s+([\d.-]+)\s+([\d.-]+)/);
      if (m) originalPaths.push({ type:'detour', sx:+m[1], sy:+m[2], raw:d });
    });
  }

  // Build a stepped path: right → down → right → down → right
  function buildSteppedPath(sx, sy, tx, ty) {
    const ex = config.exitLength;
    const en = config.entryLength;
    const r = config.pathMode === 'stepRounded' ? config.cornerRadius : 0;
    const dy = ty - sy;
    const dir = dy >= 0 ? 1 : -1;
    const absdy = Math.abs(dy);

    // Waypoints
    const x1 = sx + ex;     // after exit
    const x2 = tx - en;     // before entry
    const midY = sy + dy/2; // vertical midpoint

    // If target is close horizontally, use simple L shape
    if (x2 <= x1 + 10) {
      // Simple: right then down then right
      if (r === 0) {
        return `M ${sx} ${sy} L ${x1} ${sy} L ${x1} ${ty} L ${tx} ${ty}`;
      }
      const cr = Math.min(r, absdy/2, ex);
      return `M ${sx} ${sy} L ${x1 - cr} ${sy} Q ${x1} ${sy}, ${x1} ${sy + dir*cr} L ${x1} ${ty - dir*cr} Q ${x1} ${ty}, ${x1 + cr} ${ty} L ${tx} ${ty}`;
    }

    // Full stepped: right → down to midY → right to x2 → down to ty → right to tx
    if (r === 0) {
      return `M ${sx} ${sy} L ${x1} ${sy} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${ty} L ${tx} ${ty}`;
    }

    // Rounded version
    const cr = Math.min(r, absdy/4, (x2-x1)/2);
    const d1 = dy >= 0 ? 1 : -1;

    return `M ${sx} ${sy} `
      + `L ${x1 - cr} ${sy} `
      + `Q ${x1} ${sy}, ${x1} ${sy + d1*cr} `
      + `L ${x1} ${midY - d1*cr} `
      + `Q ${x1} ${midY}, ${x1 + cr} ${midY} `
      + `L ${x2 - cr} ${midY} `
      + `Q ${x2} ${midY}, ${x2} ${midY + d1*cr} `
      + `L ${x2} ${ty - d1*cr} `
      + `Q ${x2} ${ty}, ${x2 + cr} ${ty} `
      + `L ${tx} ${ty}`;
  }

  function buildBezierPath(sx, sy, tx, ty) {
    const dx = tx - sx;
    const c1x = sx + dx * config.cp1X;
    const c1y = sy + config.cp1Y;
    const c2x = sx + dx * config.cp2X;
    const c2y = ty + config.cp2Y;
    return { path: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`, c1x, c1y, c2x, c2y };
  }

  function updateDiagram() {
    const curve = document.getElementById('diagram-curve');
    if (!curve) return;
    const sx = 35, sy = 23, tx = 255, ty = 43;

    if (config.pathMode === 'bezier') {
      const { path } = buildBezierPath(sx, sy, tx, ty);
      curve.setAttribute('d', path);
    } else {
      // Scale stepped for mini diagram
      const saved = { exitLength: config.exitLength, entryLength: config.entryLength, cornerRadius: config.cornerRadius };
      config.exitLength = config.exitLength * 0.8;
      config.entryLength = config.entryLength * 0.8;
      config.cornerRadius = config.cornerRadius * 0.5;
      curve.setAttribute('d', buildSteppedPath(sx, sy, tx, ty));
      Object.assign(config, saved);
    }

    // Toggle CP dots visibility
    document.querySelectorAll('.mode-bezier-el').forEach(el => {
      el.style.display = config.pathMode === 'bezier' ? '' : 'none';
    });

    if (config.pathMode === 'bezier') {
      const dx = tx - sx;
      const cp1 = document.getElementById('diagram-cp1');
      const cp2 = document.getElementById('diagram-cp2');
      if (cp1) { cp1.setAttribute('cx', String(sx + dx * config.cp1X)); cp1.setAttribute('cy', String(Math.max(2,Math.min(58, sy + config.cp1Y * 0.12)))); }
      if (cp2) { cp2.setAttribute('cx', String(sx + dx * config.cp2X)); cp2.setAttribute('cy', String(Math.max(2,Math.min(58, ty + config.cp2Y * 0.12)))); }
    }
  }

  function redraw() {
    const svg = document.querySelector('.gantt-dependency-arrows');
    if (!svg) { setStatus('⚠ No arrow SVG found'); return; }

    captureOriginals();
    svg.querySelectorAll('.tuner-added').forEach(el => el.remove());

    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.prepend(defs); }
    defs.innerHTML = '';

    const arrowPaths = Array.from(
      svg.querySelectorAll('path[class="dependency-arrow"], path[marker-end]')
    ).filter(p => !p.classList.contains('tuner-added'));

    arrowPaths.forEach((pathEl, i) => {
      const color = getColor(i);
      const orig = originalPaths[i];

      // Marker
      const marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
      marker.setAttribute('id', `tuner-arrow-${i}`);
      marker.setAttribute('markerWidth', String(config.arrowSize));
      marker.setAttribute('markerHeight', String(config.arrowSize*0.75));
      marker.setAttribute('refX', String(config.arrowSize - 1));
      marker.setAttribute('refY', String(config.arrowSize*0.375));
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      poly.setAttribute('points', `0 0, ${config.arrowSize} ${config.arrowSize*0.375}, 0 ${config.arrowSize*0.75}`);
      poly.setAttribute('fill', color);
      marker.appendChild(poly);
      defs.appendChild(marker);

      if (orig && orig.type === 'bezier') {
        const { sx, sy, tx, ty } = orig;

        if (config.pathMode === 'bezier') {
          const { path, c1x, c1y, c2x, c2y } = buildBezierPath(sx, sy, tx, ty);
          pathEl.setAttribute('d', path);

          if (config.showControlPoints) {
            addCircle(svg, c1x, c1y, 4, 'rgba(255,100,100,0.8)', '#f66');
            addLine(svg, sx, sy, c1x, c1y, 'rgba(255,100,100,0.25)');
            addCircle(svg, c2x, c2y, 4, 'rgba(100,100,255,0.8)', '#66f');
            addLine(svg, tx, ty, c2x, c2y, 'rgba(100,100,255,0.25)');
          }
        } else {
          pathEl.setAttribute('d', buildSteppedPath(sx, sy, tx, ty));

          if (config.showControlPoints) {
            // Show waypoints
            const ex = config.exitLength, en = config.entryLength;
            const x1 = sx + ex, x2 = tx - en, midY = sy + (ty-sy)/2;
            addCircle(svg, x1, sy, 3, 'rgba(255,200,100,0.8)');
            addCircle(svg, x1, midY, 3, 'rgba(255,200,100,0.8)');
            addCircle(svg, x2, midY, 3, 'rgba(255,200,100,0.8)');
            addCircle(svg, x2, ty, 3, 'rgba(255,200,100,0.8)');
          }
        }
      }

      pathEl.setAttribute('stroke', color);
      pathEl.setAttribute('stroke-width', String(config.strokeWidth));
      pathEl.setAttribute('stroke-dasharray', config.dashArray === 'none' ? '' : config.dashArray);
      pathEl.setAttribute('marker-end', `url(#tuner-arrow-${i})`);

      if (config.showShadow) {
        const shadow = document.createElementNS('http://www.w3.org/2000/svg','path');
        shadow.classList.add('tuner-added');
        shadow.setAttribute('d', pathEl.getAttribute('d'));
        shadow.setAttribute('fill','none');
        shadow.setAttribute('stroke', `rgba(0,0,0,${config.shadowOpacity})`);
        shadow.setAttribute('stroke-width', String(config.shadowWidth));
        shadow.setAttribute('stroke-linecap','round');
        svg.insertBefore(shadow, svg.firstChild.nextSibling);
      }

      if (config.showDots) {
        const m = pathEl.getAttribute('d').match(/^M\s+([\d.-]+)\s+([\d.-]+)/);
        if (m) addCircle(svg, +m[1], +m[2], config.dotRadius, color);
      }
    });

    svg.style.zIndex = String(config.zIndex);
    updateDiagram();
    updateModePanels();
    setStatus(`✓ ${arrowPaths.length} arrows (${config.pathMode})`);
  }

  function addCircle(svg, cx, cy, r, fill, stroke) {
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.classList.add('tuner-added');
    c.setAttribute('cx',String(cx)); c.setAttribute('cy',String(cy));
    c.setAttribute('r',String(r)); c.setAttribute('fill',fill);
    if (stroke) { c.setAttribute('stroke',stroke); c.setAttribute('stroke-width','1'); }
    svg.appendChild(c);
  }

  function addLine(svg, x1, y1, x2, y2, color) {
    const l = document.createElementNS('http://www.w3.org/2000/svg','line');
    l.classList.add('tuner-added');
    l.setAttribute('x1',String(x1)); l.setAttribute('y1',String(y1));
    l.setAttribute('x2',String(x2)); l.setAttribute('y2',String(y2));
    l.setAttribute('stroke',color); l.setAttribute('stroke-width','1');
    l.setAttribute('stroke-dasharray','2,2');
    svg.appendChild(l);
  }

  function setStatus(msg) {
    const el = document.getElementById('tuner-status');
    if (el) el.textContent = msg;
  }

  // Bind all controls
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
    const out = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(out).then(() => setStatus('✓ Copied!')).catch(() => prompt('Copy:', out));
  });

  document.getElementById('tuner-reset').addEventListener('click', () => {
    Object.assign(config, {
      strokeWidth:1.5, dashArray:'4,2', opacity:0.6, pathMode:'bezier',
      cp1X:0.5, cp1Y:0, cp2X:0.5, cp2Y:0,
      exitLength:20, entryLength:20, cornerRadius:6,
      detourSize:15, arrowSize:8, zIndex:5,
      showDots:false, dotRadius:3, showShadow:false,
      shadowWidth:4, shadowOpacity:0.2, showControlPoints:false, palette:'multi',
    });
    panel.querySelectorAll('input[type="range"]').forEach(input => {
      input.value = config[input.dataset.key];
      const v = input.nextElementSibling;
      if (v && v.classList.contains('val')) v.textContent = input.value;
    });
    panel.querySelectorAll('select').forEach(s => s.value = config[s.dataset.key]);
    panel.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = config[c.dataset.key]);
    redraw(); setStatus('↩ Reset');
  });

  document.getElementById('tuner-close').addEventListener('click', () => panel.remove());

  redraw();
  console.log('%c🎯 Arrow Tuner v4 — Bezier + Stepped modes', 'color: #5DA5DA; font-size: 14px;');
})();
