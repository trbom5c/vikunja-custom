// Gantt Dependency Arrow Tuner v6
// Exit/entry anchor offset — slide connection points along bar edges

(function() {
  const existing = document.getElementById('arrow-tuner');
  if (existing) existing.remove();

  const config = {
    strokeWidth: 1.5,
    dashArray: '2,2',
    opacity: 0.5,
    pathMode: 'stepRounded',
    // Bezier
    cp1X: 0.5, cp1Y: 0, cp2X: 0.5, cp2Y: 0,
    // Stepped
    exitDir: 'bottom',
    entryDir: 'left',
    exitOffset: 0.5,       // 0=left/top edge, 0.5=center, 1=right/bottom edge of bar
    entryOffset: 0.5,      // same for target bar
    exitLength: 30,
    entryLength: 20,
    cornerRadius: 11,
    // General
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
  const ROW_HEIGHT = 40;
  const BAR_HEIGHT = 30;

  const panel = document.createElement('div');
  panel.id = 'arrow-tuner';
  panel.innerHTML = `
    <style>
      #arrow-tuner {
        position:fixed; top:10px; right:10px; width:350px;
        max-height:90vh; overflow-y:auto;
        background:rgba(20,22,30,0.95);
        border:1px solid rgba(100,120,200,0.4);
        border-radius:8px; padding:12px; z-index:99999;
        font-family:'SF Mono',Monaco,monospace; font-size:12px; color:#ccd;
        box-shadow:0 4px 20px rgba(0,0,0,0.5);
      }
      #arrow-tuner h3 { margin:0 0 10px; font-size:13px; color:#8af; border-bottom:1px solid rgba(100,120,200,0.3); padding-bottom:6px; cursor:move; }
      #arrow-tuner .row { display:flex; align-items:center; margin-bottom:5px; gap:6px; }
      #arrow-tuner label { flex:0 0 90px; font-size:11px; color:#99a; }
      #arrow-tuner input[type="range"] { flex:1; height:4px; accent-color:#5DA5DA; }
      #arrow-tuner .val { flex:0 0 42px; text-align:right; font-size:11px; color:#aaf; }
      #arrow-tuner select { background:rgba(40,42,55,0.9); border:1px solid rgba(100,120,200,0.3); color:#ccd; border-radius:4px; padding:2px 4px; font-size:11px; flex:1; }
      #arrow-tuner button { margin:4px 4px 0 0; padding:5px 12px; border:1px solid rgba(100,120,200,0.4); border-radius:4px; background:rgba(50,55,80,0.8); color:#aaf; cursor:pointer; font-size:11px; }
      #arrow-tuner button:hover { background:rgba(70,75,110,0.9); }
      #arrow-tuner button.primary { background:rgba(93,165,218,0.4); color:#fff; }
      #arrow-tuner .section { margin-top:8px; padding-top:6px; border-top:1px solid rgba(100,120,200,0.15); }
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
      #arrow-tuner .cp-diagram { background:rgba(30,32,45,0.8); border:1px solid rgba(80,90,140,0.3); border-radius:4px; padding:4px; margin-bottom:6px; text-align:center; }
    </style>

    <h3 id="tuner-drag-handle">🎯 Arrow Tuner v6</h3>

    <div class="cp-diagram">
      <svg width="310" height="70" viewBox="0 0 310 70" id="diagram-svg">
        <rect x="5" y="10" width="60" height="16" rx="3" fill="rgba(100,180,100,0.3)" stroke="#6a6" stroke-width="1"/>
        <text x="35" y="21" fill="#8a8" font-size="7" text-anchor="middle">SOURCE</text>
        <rect x="230" y="44" width="60" height="16" rx="3" fill="rgba(100,180,100,0.3)" stroke="#6a6" stroke-width="1"/>
        <text x="260" y="55" fill="#8a8" font-size="7" text-anchor="middle">TARGET</text>
        <path id="diagram-curve" d="" fill="none" stroke="rgba(150,150,200,0.6)" stroke-width="1.5" stroke-dasharray="3,2"/>
        <circle id="diagram-exit-dot" cx="35" cy="26" r="3" fill="#f88"/>
        <circle id="diagram-entry-dot" cx="230" cy="52" r="3" fill="#88f"/>
      </svg>
    </div>

    <div class="sec-label gray">Line Style</div>
    <div class="row"><label>Stroke</label><input type="range" min="0.5" max="4" step="0.25" value="1.5" data-key="strokeWidth"><span class="val">1.5</span></div>
    <div class="row"><label>Dash</label>
      <select data-key="dashArray">
        <option value="4,2">4,2 (default)</option>
        <option value="6,3">6,3 (longer)</option>
        <option value="2,2" selected>2,2 (short)</option>
        <option value="8,4">8,4 (wide)</option>
        <option value="4,2,1,2">4,2,1,2 (dot-dash)</option>
        <option value="none">solid</option>
      </select>
    </div>
    <div class="row"><label>Opacity</label><input type="range" min="0.1" max="1" step="0.05" value="0.5" data-key="opacity"><span class="val">0.5</span></div>
    <div class="row"><label>Arrow Size</label><input type="range" min="4" max="16" step="1" value="8" data-key="arrowSize"><span class="val">8</span></div>

    <div class="section">
      <div class="sec-label green">⬡ Path Mode</div>
      <div class="row"><label>Mode</label>
        <select data-key="pathMode">
          <option value="bezier">Bezier (smooth curves)</option>
          <option value="stepped">Stepped (right angles)</option>
          <option value="stepRounded" selected>Stepped + Rounded</option>
        </select>
      </div>
    </div>

    <div class="section mode-panel" id="panel-bezier">
      <div class="sec-label red">🔴 CP1 — Source Arc</div>
      <div class="row"><label>CP1 Horiz</label><input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-key="cp1X"><span class="val">0.5</span></div>
      <div class="row"><label>CP1 Vert ↕</label><input type="range" min="-200" max="200" step="5" value="0" data-key="cp1Y"><span class="val">0</span></div>
      <div class="sec-label blue">🔵 CP2 — Target Approach</div>
      <div class="row"><label>CP2 Horiz</label><input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-key="cp2X"><span class="val">0.5</span></div>
      <div class="row"><label>CP2 Vert ↕</label><input type="range" min="-200" max="200" step="5" value="0" data-key="cp2Y"><span class="val">0</span></div>
    </div>

    <div class="section mode-panel active" id="panel-stepped">
      <div class="sec-label red">🔴 Exit (Source)</div>
      <div class="row"><label>Exit Edge</label>
        <select data-key="exitDir">
          <option value="right">Right edge →</option>
          <option value="bottom" selected>Bottom edge ↓</option>
        </select>
      </div>
      <div class="row"><label>Exit Anchor</label><input type="range" min="0" max="1" step="0.05" value="0.5" data-key="exitOffset"><span class="val">0.5</span></div>
      <div class="hint">Slide along edge: 0 = left/top end, 0.5 = center, 1 = right/bottom end</div>
      <div class="row"><label>Exit Length</label><input type="range" min="5" max="120" step="5" value="30" data-key="exitLength"><span class="val">30</span></div>
      <div class="hint">How far from bar before first turn</div>

      <div class="sec-label blue" style="margin-top:8px">🔵 Entry (Target)</div>
      <div class="row"><label>Enter Edge</label>
        <select data-key="entryDir">
          <option value="left" selected>Left edge ←</option>
          <option value="top">Top edge ↑</option>
        </select>
      </div>
      <div class="row"><label>Entry Anchor</label><input type="range" min="0" max="1" step="0.05" value="0.5" data-key="entryOffset"><span class="val">0.5</span></div>
      <div class="hint">Slide along edge: 0 = left/top end, 0.5 = center, 1 = right/bottom end</div>
      <div class="row"><label>Entry Length</label><input type="range" min="5" max="120" step="5" value="20" data-key="entryLength"><span class="val">20</span></div>
      <div class="hint">How far from target before final turn</div>

      <div class="sec-label gray" style="margin-top:8px">Corners</div>
      <div class="row"><label>Corner Radius</label><input type="range" min="0" max="20" step="1" value="11" data-key="cornerRadius"><span class="val">11</span></div>
    </div>

    <div class="section">
      <div class="sec-label gray">Other</div>
      <div class="row"><label>Palette</label>
        <select data-key="palette">
          <option value="multi" selected>Multi-color</option>
          <option value="mono">Mono (original)</option>
        </select>
      </div>
    </div>

    <div class="section">
      <div class="sec-label gray">Extras</div>
      <div class="toggle"><input type="checkbox" data-key="showDots"><label style="flex:none">Source dots</label></div>
      <div class="row"><label>Dot Radius</label><input type="range" min="1" max="6" step="0.5" value="3" data-key="dotRadius"><span class="val">3</span></div>
      <div class="toggle"><input type="checkbox" data-key="showShadow"><label style="flex:none">Drop shadow</label></div>
      <div class="row"><label>Shadow W</label><input type="range" min="2" max="8" step="0.5" value="4" data-key="shadowWidth"><span class="val">4</span></div>
      <div class="row"><label>Shadow Op</label><input type="range" min="0.05" max="0.5" step="0.05" value="0.2" data-key="shadowOpacity"><span class="val">0.2</span></div>
      <div class="toggle"><input type="checkbox" data-key="showControlPoints"><label style="flex:none">Show waypoints</label></div>
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
  let isDragging=false,dragX,dragY;
  panel.querySelector('#tuner-drag-handle').addEventListener('mousedown',e=>{isDragging=true;dragX=e.clientX-panel.offsetLeft;dragY=e.clientY-panel.offsetTop;});
  document.addEventListener('mousemove',e=>{if(!isDragging)return;panel.style.left=(e.clientX-dragX)+'px';panel.style.top=(e.clientY-dragY)+'px';panel.style.right='auto';});
  document.addEventListener('mouseup',()=>isDragging=false);

  function updateModePanels(){
    const b=config.pathMode==='bezier';
    document.getElementById('panel-bezier').classList.toggle('active',b);
    document.getElementById('panel-stepped').classList.toggle('active',!b);
  }

  const MC=[[93,165,218],[250,164,58],[96,189,104],[241,88,84],[178,118,178],[222,207,63],[77,201,246],[241,124,176],[178,145,47],[0,193,166]];
  function getColor(i){const a=config.opacity;if(config.palette==='mono')return`rgba(150,150,200,${a})`;const c=MC[i%MC.length];return`rgba(${c[0]},${c[1]},${c[2]},${a})`;}

  function captureOriginals(){
    if(originalPaths.length>0)return;
    const svg=document.querySelector('.gantt-dependency-arrows');
    if(!svg)return;
    svg.querySelectorAll('path[class="dependency-arrow"], path[marker-end]').forEach(path=>{
      const d=path.getAttribute('d');if(!d)return;
      const b=d.match(/^M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+)$/);
      if(b){originalPaths.push({type:'bezier',sx:+b[1],sy:+b[2],tx:+b[7],ty:+b[8]});return;}
      const m=d.match(/^M\s+([\d.-]+)\s+([\d.-]+)/);
      if(m)originalPaths.push({type:'detour',sx:+m[1],sy:+m[2],raw:d});
    });
  }

  /**
   * Compute actual anchor point on bar edge.
   *
   * Original path data gives us: sx,sy = right-edge center of source; tx,ty = left-edge center of target
   * We derive the bar bounds from that, knowing ROW_HEIGHT and BAR_HEIGHT.
   *
   * For source bar:
   *   right edge = sx, center-y = sy
   *   top = sy - BAR_HEIGHT/2, bottom = sy + BAR_HEIGHT/2
   *   left edge = unknown (we don't have bar width), but we can estimate from right edge
   *
   * For offset: 0 = one end of the edge, 1 = other end
   */
  function getExitPoint(sx, sy, barWidth) {
    const halfH = BAR_HEIGHT / 2;
    const w = barWidth || 40; // fallback estimate

    if (config.exitDir === 'bottom') {
      // Bottom edge: x slides from left to right of bar
      const left = sx - w;
      const x = left + w * config.exitOffset;
      const y = sy + halfH;
      return { x, y };
    }
    // Right edge: y slides from top to bottom of bar
    const top = sy - halfH;
    const x = sx;
    const y = top + BAR_HEIGHT * config.exitOffset;
    return { x, y };
  }

  function getEntryPoint(tx, ty, barWidth) {
    const halfH = BAR_HEIGHT / 2;
    const w = barWidth || 40;

    if (config.entryDir === 'top') {
      // Top edge: x slides from left to right of bar
      const x = tx + w * config.entryOffset;
      const y = ty - halfH;
      return { x, y };
    }
    // Left edge: y slides from top to bottom of bar
    const top = ty - halfH;
    const x = tx;
    const y = top + BAR_HEIGHT * config.entryOffset;
    return { x, y };
  }

  function buildSteppedPath(sx, sy, tx, ty) {
    const r = config.pathMode === 'stepRounded' ? config.cornerRadius : 0;
    const ex = config.exitLength;
    const en = config.entryLength;

    const start = getExitPoint(sx, sy);
    const end = getEntryPoint(tx, ty);

    if (config.exitDir === 'bottom' && config.entryDir === 'left') {
      const dropY = start.y + ex;
      const approachX = end.x - en;
      return buildRoundedPath([
        [start.x, start.y],
        [start.x, dropY],
        [approachX, dropY],
        [approachX, end.y],
        [end.x, end.y],
      ], r);
    }
    if (config.exitDir === 'bottom' && config.entryDir === 'top') {
      const dropY = start.y + ex;
      return buildRoundedPath([
        [start.x, start.y],
        [start.x, dropY],
        [end.x, dropY],
        [end.x, end.y],
      ], r);
    }
    if (config.exitDir === 'right' && config.entryDir === 'left') {
      const turnX = start.x + ex;
      const approachX = end.x - en;
      const midY = (start.y + end.y) / 2;
      if (approachX <= turnX + 5) {
        return buildRoundedPath([[start.x,start.y],[turnX,start.y],[turnX,end.y],[end.x,end.y]], r);
      }
      return buildRoundedPath([
        [start.x, start.y],
        [turnX, start.y],
        [turnX, midY],
        [approachX, midY],
        [approachX, end.y],
        [end.x, end.y],
      ], r);
    }
    if (config.exitDir === 'right' && config.entryDir === 'top') {
      const turnX = start.x + ex;
      return buildRoundedPath([
        [start.x, start.y],
        [turnX, start.y],
        [turnX, end.y - en],
        [end.x, end.y - en],
        [end.x, end.y],
      ], r);
    }
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  function buildRoundedPath(pts, r) {
    if (pts.length < 2) return '';
    if (r === 0 || pts.length === 2) return 'M ' + pts.map(p=>`${p[0]} ${p[1]}`).join(' L ');
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev=pts[i-1], curr=pts[i], next=pts[i+1];
      const dx1=curr[0]-prev[0], dy1=curr[1]-prev[1];
      const dx2=next[0]-curr[0], dy2=next[1]-curr[1];
      const len1=Math.sqrt(dx1*dx1+dy1*dy1), len2=Math.sqrt(dx2*dx2+dy2*dy2);
      const cr=Math.min(r, len1/2, len2/2);
      if(cr<1){d+=` L ${curr[0]} ${curr[1]}`;continue;}
      const sRX=curr[0]-(dx1/len1)*cr, sRY=curr[1]-(dy1/len1)*cr;
      const eRX=curr[0]+(dx2/len2)*cr, eRY=curr[1]+(dy2/len2)*cr;
      d+=` L ${sRX} ${sRY} Q ${curr[0]} ${curr[1]}, ${eRX} ${eRY}`;
    }
    d+=` L ${pts[pts.length-1][0]} ${pts[pts.length-1][1]}`;
    return d;
  }

  function buildBezierPath(sx,sy,tx,ty){
    const dx=tx-sx;
    return{path:`M ${sx} ${sy} C ${sx+dx*config.cp1X} ${sy+config.cp1Y}, ${sx+dx*config.cp2X} ${ty+config.cp2Y}, ${tx} ${ty}`};
  }

  function updateDiagram(){
    const curve=document.getElementById('diagram-curve');
    const exitDot=document.getElementById('diagram-exit-dot');
    const entryDot=document.getElementById('diagram-entry-dot');
    if(!curve)return;

    // Source bar: x=5..65, y=10..26. Target bar: x=230..290, y=44..60
    if(config.pathMode==='bezier'){
      const{path}=buildBezierPath(65,18,230,52);
      curve.setAttribute('d',path);
      if(exitDot){exitDot.setAttribute('cx','65');exitDot.setAttribute('cy','18');}
      if(entryDot){entryDot.setAttribute('cx','230');entryDot.setAttribute('cy','52');}
    } else {
      // Compute diagram anchor positions
      let ex,ey,nx,ny;
      if(config.exitDir==='bottom'){
        ex=5+60*config.exitOffset; ey=26;
      } else {
        ex=65; ey=10+16*config.exitOffset;
      }
      if(config.entryDir==='top'){
        nx=230+60*config.entryOffset; ny=44;
      } else {
        nx=230; ny=44+16*config.entryOffset;
      }
      if(exitDot){exitDot.setAttribute('cx',String(ex));exitDot.setAttribute('cy',String(ey));}
      if(entryDot){entryDot.setAttribute('cx',String(nx));entryDot.setAttribute('cy',String(ny));}

      // Build mini path
      const saved={...config};
      config.exitLength=config.exitLength*0.25;
      config.entryLength=config.entryLength*0.25;
      config.cornerRadius=config.cornerRadius*0.35;

      // Temporarily override getExitPoint/getEntryPoint for diagram coords
      const miniPath = buildMiniSteppedPath(ex,ey,nx,ny,config.pathMode==='stepRounded'?saved.cornerRadius*0.35:0,saved.exitLength*0.25,saved.entryLength*0.25);
      curve.setAttribute('d',miniPath);
      Object.assign(config,saved);
    }
  }

  function buildMiniSteppedPath(sx,sy,tx,ty,r,ex,en){
    if(config.exitDir==='bottom'&&config.entryDir==='left'){
      const dropY=sy+Math.max(ex,8);
      const approachX=tx-Math.max(en,8);
      return buildRoundedPath([[sx,sy],[sx,dropY],[approachX,dropY],[approachX,ty],[tx,ty]],r);
    }
    if(config.exitDir==='bottom'&&config.entryDir==='top'){
      const dropY=sy+Math.max(ex,8);
      return buildRoundedPath([[sx,sy],[sx,dropY],[tx,dropY],[tx,ty]],r);
    }
    if(config.exitDir==='right'&&config.entryDir==='left'){
      const turnX=sx+Math.max(ex,8);
      const approachX=tx-Math.max(en,8);
      const midY=(sy+ty)/2;
      return buildRoundedPath([[sx,sy],[turnX,sy],[turnX,midY],[approachX,midY],[approachX,ty],[tx,ty]],r);
    }
    if(config.exitDir==='right'&&config.entryDir==='top'){
      const turnX=sx+Math.max(ex,8);
      return buildRoundedPath([[sx,sy],[turnX,sy],[turnX,ty-Math.max(en,8)],[tx,ty-Math.max(en,8)],[tx,ty]],r);
    }
    return`M ${sx} ${sy} L ${tx} ${ty}`;
  }

  function redraw(){
    const svg=document.querySelector('.gantt-dependency-arrows');
    if(!svg){setStatus('⚠ No arrow SVG found');return;}
    captureOriginals();
    svg.querySelectorAll('.tuner-added').forEach(el=>el.remove());
    let defs=svg.querySelector('defs');
    if(!defs){defs=document.createElementNS('http://www.w3.org/2000/svg','defs');svg.prepend(defs);}
    defs.innerHTML='';
    const arrowPaths=Array.from(svg.querySelectorAll('path[class="dependency-arrow"], path[marker-end]')).filter(p=>!p.classList.contains('tuner-added'));

    arrowPaths.forEach((pathEl,i)=>{
      const color=getColor(i);
      const orig=originalPaths[i];

      const marker=document.createElementNS('http://www.w3.org/2000/svg','marker');
      marker.setAttribute('id',`tuner-arrow-${i}`);
      marker.setAttribute('markerWidth',String(config.arrowSize));
      marker.setAttribute('markerHeight',String(config.arrowSize*0.75));
      marker.setAttribute('refX',String(config.arrowSize-1));
      marker.setAttribute('refY',String(config.arrowSize*0.375));
      marker.setAttribute('orient','auto');
      const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
      poly.setAttribute('points',`0 0, ${config.arrowSize} ${config.arrowSize*0.375}, 0 ${config.arrowSize*0.75}`);
      poly.setAttribute('fill',color);
      marker.appendChild(poly);defs.appendChild(marker);

      if(orig&&orig.type==='bezier'){
        const{sx,sy,tx,ty}=orig;
        if(config.pathMode==='bezier'){
          const{path}=buildBezierPath(sx,sy,tx,ty);
          pathEl.setAttribute('d',path);
        } else {
          pathEl.setAttribute('d',buildSteppedPath(sx,sy,tx,ty));
        }

        if(config.showControlPoints){
          const coords=pathEl.getAttribute('d').match(/[\d.-]+ [\d.-]+/g);
          if(coords)coords.forEach(c=>{const[cx,cy]=c.split(' ').map(Number);addCircle(svg,cx,cy,3,'rgba(255,200,100,0.7)');});
        }
      }

      pathEl.setAttribute('stroke',color);
      pathEl.setAttribute('stroke-width',String(config.strokeWidth));
      pathEl.setAttribute('stroke-dasharray',config.dashArray==='none'?'':config.dashArray);
      pathEl.setAttribute('marker-end',`url(#tuner-arrow-${i})`);

      if(config.showShadow){
        const shadow=document.createElementNS('http://www.w3.org/2000/svg','path');
        shadow.classList.add('tuner-added');shadow.setAttribute('d',pathEl.getAttribute('d'));
        shadow.setAttribute('fill','none');shadow.setAttribute('stroke',`rgba(0,0,0,${config.shadowOpacity})`);
        shadow.setAttribute('stroke-width',String(config.shadowWidth));shadow.setAttribute('stroke-linecap','round');
        svg.insertBefore(shadow,svg.firstChild.nextSibling);
      }
      if(config.showDots){
        const m=pathEl.getAttribute('d').match(/^M\s+([\d.-]+)\s+([\d.-]+)/);
        if(m)addCircle(svg,+m[1],+m[2],config.dotRadius,color);
      }
    });
    svg.style.zIndex=String(config.zIndex);
    updateDiagram();updateModePanels();
    setStatus(`✓ ${arrowPaths.length} arrows (${config.pathMode} exit:${config.exitDir}@${config.exitOffset} enter:${config.entryDir}@${config.entryOffset})`);
  }

  function addCircle(svg,cx,cy,r,fill,stroke){const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.classList.add('tuner-added');c.setAttribute('cx',String(cx));c.setAttribute('cy',String(cy));c.setAttribute('r',String(r));c.setAttribute('fill',fill);if(stroke){c.setAttribute('stroke',stroke);c.setAttribute('stroke-width','1');}svg.appendChild(c);}
  function addLine(svg,x1,y1,x2,y2,color){const l=document.createElementNS('http://www.w3.org/2000/svg','line');l.classList.add('tuner-added');l.setAttribute('x1',String(x1));l.setAttribute('y1',String(y1));l.setAttribute('x2',String(x2));l.setAttribute('y2',String(y2));l.setAttribute('stroke',color);l.setAttribute('stroke-width','1');l.setAttribute('stroke-dasharray','2,2');svg.appendChild(l);}
  function setStatus(msg){const el=document.getElementById('tuner-status');if(el)el.textContent=msg;}

  // Bind
  panel.querySelectorAll('input[type="range"]').forEach(input=>{
    const key=input.dataset.key,valSpan=input.nextElementSibling;
    input.addEventListener('input',()=>{config[key]=parseFloat(input.value);if(valSpan&&valSpan.classList.contains('val'))valSpan.textContent=input.value;redraw();});
  });
  panel.querySelectorAll('select').forEach(sel=>{sel.addEventListener('change',()=>{config[sel.dataset.key]=sel.value;redraw();});});
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb=>{cb.addEventListener('change',()=>{config[cb.dataset.key]=cb.checked;redraw();});});

  document.getElementById('tuner-copy').addEventListener('click',()=>{
    const out=JSON.stringify(config,null,2);
    navigator.clipboard.writeText(out).then(()=>setStatus('✓ Copied!')).catch(()=>prompt('Copy:',out));
  });
  document.getElementById('tuner-reset').addEventListener('click',()=>{
    Object.assign(config,{strokeWidth:1.5,dashArray:'2,2',opacity:0.5,pathMode:'stepRounded',cp1X:0.5,cp1Y:0,cp2X:0.5,cp2Y:0,exitDir:'bottom',entryDir:'left',exitOffset:0.5,entryOffset:0.5,exitLength:30,entryLength:20,cornerRadius:11,arrowSize:8,zIndex:5,showDots:false,dotRadius:3,showShadow:false,shadowWidth:4,shadowOpacity:0.2,showControlPoints:false,palette:'multi'});
    panel.querySelectorAll('input[type="range"]').forEach(input=>{input.value=config[input.dataset.key];const v=input.nextElementSibling;if(v&&v.classList.contains('val'))v.textContent=input.value;});
    panel.querySelectorAll('select').forEach(s=>s.value=config[s.dataset.key]);
    panel.querySelectorAll('input[type="checkbox"]').forEach(c=>c.checked=config[c.dataset.key]);
    redraw();setStatus('↩ Reset');
  });
  document.getElementById('tuner-close').addEventListener('click',()=>panel.remove());
  redraw();
  console.log('%c🎯 Arrow Tuner v6 — Anchor offset sliders to position connection points along edges','color:#5DA5DA;font-size:14px;');
})();
