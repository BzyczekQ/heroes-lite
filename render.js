/* ============================================================
   HEROES LITE — RENDER + WEJŚCIE + SIEĆ (przeglądarka)
   ============================================================ */
'use strict';
(function () {
  const D = window.H3DATA;
  const E = window.H3ENGINE;
  const UNITS = D.ALL_UNITS;
  const FACTIONS = D.FACTIONS;
  const TERRAIN = E.TERRAIN;

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let canvas, ctx, cCanvas, cctx;

  let state = null;
  let net = { mode: 'local' };            // 'local' (hot-seat) | 'mp'
  let myIndex = 0;
  let cam = { x: 0, y: 0 };
  let DPR = 1;
  const TILE = 48;
  let selectedHero = null;
  let moving = false;
  let combatResume = null; // funkcja wznawiająca po zakończeniu walki AI
  let dragState = null;
  let pendingAI = null;
  let menuConfig = { faction: 'castle', size: 'S', aiCount: 1 };

  let combatView = { size: 30, ox: 0, oy: 0, zoom: 1, panX: 0, panY: 0 };
  function hexScreen(col, row) {
    const p = E.hexToPixel(col, row, combatView.size);
    return { x: combatView.ox + p.x * combatView.zoom + combatView.panX, y: combatView.oy + p.y * combatView.zoom + combatView.panY };
  }
  function resetCombatView() { combatView.zoom = 1; combatView.panX = 0; combatView.panY = 0; }

  // ---------------- POMOC UI ----------------
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000); }
  function show(id) { $(id).classList.add('show'); }
  function hide(id) { $(id).classList.remove('show'); }

  function me() { return state ? state.players[net.mode === 'local' ? state.turn : myIndex] : null; }
  function canAct() {
    if (!state) return false;
    if (net.mode === 'local') return true;
    return myIndex === E.controllerOf(state);
  }

  // ============================================================
  //  MENU GŁÓWNE (styl HoMM3)
  // ============================================================
  function renderMenu() {
    let f = '';
    for (const k in FACTIONS) {
      const fac = FACTIONS[k];
      const sel = k === menuConfig.faction ? 'selected' : '';
      f += `<div class="faccard ${sel}" data-fac="${k}"><div class="facemo">${fac.emoji}</div><div>${fac.name}</div></div>`;
    }
    let sizes = '';
    for (const k in D.MAP_SIZES) {
      const ms = D.MAP_SIZES[k];
      const sel = k === menuConfig.size ? 'selected' : '';
      sizes += `<div class="sizecard ${sel}" data-size="${k}"><b>${ms.name}</b><br><small>${ms.w}×${ms.h}</small></div>`;
    }
    $('facGrid').innerHTML = f;
    $('sizeGrid').innerHTML = sizes;
    $('aiCount').textContent = menuConfig.aiCount;
    const lb = $('mLoad');
    if (lb) lb.style.display = hasSave() ? 'block' : 'none';
  }

  function startSingleVsAI() {
    const players = [{ name: 'Ty', faction: menuConfig.faction, isAI: false }];
    const otherFacs = Object.keys(FACTIONS).filter(k => k !== menuConfig.faction);
    for (let i = 0; i < menuConfig.aiCount; i++) {
      players.push({ name: 'Komputer ' + (i + 1), faction: otherFacs[i % otherFacs.length], isAI: true });
    }
    net = { mode: 'local' };
    state = E.newGame({ players, size: menuConfig.size, seed: Math.floor(Math.random() * 1e9) });
    selectedHero = state.players[0].heroes[0];
    hide('menu'); hide('setup');
    enterTurn();
  }
  function startHotseat() {
    net = { mode: 'local' };
    state = E.newGame({
      players: [{ name: 'Gracz 1', faction: menuConfig.faction }, { name: 'Gracz 2', faction: 'dungeon' }],
      size: menuConfig.size, seed: Math.floor(Math.random() * 1e9)
    });
    selectedHero = state.players[0].heroes[0];
    hide('menu'); hide('setup');
    enterTurn();
  }

  function enterTurn() {
    const p = state.players[state.turn];
    const h = p.heroes.find(h => h.alive);
    if (h) { selectedHero = h; cam = { x: h.x, y: h.y }; }
    if (p.isAI) { runAITurn(); return; }
    if (net.mode === 'local' && state.players.filter(x => !x.isAI).length > 1) showPassScreen();
    else { showDayPopup(); }
  }
  function showDayPopup() {
    const ev = state.dayEvent || {};
    const d = ev.day || state.day, w = ev.week || 1, m = ev.month || 1;
    let msg = 'Dzień ' + d;
    let sub = 'Tydzień ' + w + ' · Miesiąc ' + m;
    if (ev.newWeek) sub += ' — Nowy tydzień! (przyrost jednostek)';
    if (ev.newMonth) sub = '🌀 NOWY MIESIĄC!';
    if (d === 1 && w === 1 && m === 1) sub = 'Witaj w świecie Erathii!';
    $('dayPopupTitle').textContent = msg;
    $('dayPopupSub').textContent = sub;
    $('dayPopupPlayer').textContent = 'Tura: ' + state.players[state.turn].name;
    $('dayPopupPlayer').style.color = state.players[state.turn].color;
    show('dayPopup');
  }
  function showPassScreen() {
    const p = state.players[state.turn];
    $('passName').textContent = p.name;
    $('passName').style.color = p.color;
    $('passFac').textContent = FACTIONS[p.faction].emoji + ' ' + FACTIONS[p.faction].name;
    show('pass');
  }

  // ============================================================
  //  AI NA MAPIE
  // ============================================================
  function runAITurn() {
    if (state.winner !== null) { renderAll(); return; }
    const p = state.players[state.turn];
    if (!p.isAI) { renderAll(); return; }
    // proste AI: zbierz surowce, atakuj słabych strażników
    const h = p.heroes.find(h => h.alive);
    if (h) {
      const reach = E.reachable(state, h.x, h.y, h.mp);
      // znajdź najlepszy cel w zasięgu: skarb/pile/mine bez gwardii
      let target = null, bestScore = -1;
      for (const k in reach.dist) {
        const [x, y] = k.split(',').map(Number);
        const o = E.objectAt(state, x, y);
        if (!o) continue;
        let score = -1;
        if (o.type === 'treasure' || o.type === 'resource') score = 100;
        else if (o.type === 'pile') score = 80;
        else if (o.type === 'mine' && (!o.guard || !o.guard.length) && o.owner !== p.idx) score = 200;
        else if (o.type === 'monster' && o.guard) {
          // atakuj tylko jeśli mamy przewagę
          const myStr = h.army.reduce((s, st) => s + st.count * (UNITS[st.key].hp + UNITS[st.key].atk), 0);
          const enStr = o.guard.reduce((s, st) => s + st.count * (UNITS[st.key].hp + UNITS[st.key].atk), 0);
          if (myStr > enStr * 1.5) score = 50;
        }
        if (score > bestScore) { bestScore = score; target = { x, y }; }
      }
      if (target) {
        const path = E.pathTo(state, h.x, h.y, target.x, target.y, h.mp);
        if (path && path.length >= 2) { walkHeroAI(h, path); return; }
      }
    }
    setTimeout(() => { E.endTurn(state); syncOut(); enterTurn(); }, 400);
  }
  function walkHeroAI(hero, path) {
    moving = true;
    let i = 1;
    function step() {
      if (!state || i >= path.length || !hero.alive) { moving = false; afterAIMove(hero); return; }
      const tile = path[i];
      const cost = TERRAIN[state.map.tiles[tile.y][tile.x]].cost;
      if (hero.mp < cost) { moving = false; afterAIMove(hero); return; }
      hero.x = tile.x; hero.y = tile.y; hero.mp -= cost;
      E.recomputeVision(state, state.turn);
      i++;
      setTimeout(step, 90);
    }
    step();
  }
  function afterAIMove(hero) {
    interact(hero, E.objectAt(state, hero.x, hero.y), () => {
      if (state.winner !== null) { renderAll(); return; }
      setTimeout(() => { E.endTurn(state); syncOut(); enterTurn(); }, 300);
    });
  }

  // ============================================================
  //  RZYM / RENDER MAPY
  // ============================================================
  function resize() {
    DPR = window.devicePixelRatio || 1;
    const wrap = $('mapWrap');
    canvas.width = wrap.clientWidth * DPR; canvas.height = wrap.clientHeight * DPR;
    canvas.style.width = wrap.clientWidth + 'px'; canvas.style.height = wrap.clientHeight + 'px';
    resizeCombat();
    renderAll();
  }
  function resizeCombat() {
    if (!$('combatLayer').classList.contains('show')) return;
    const wrap = $('combatCanvasWrap');
    cCanvas.width = wrap.clientWidth * DPR; cCanvas.height = wrap.clientHeight * DPR;
    cCanvas.style.width = wrap.clientWidth + 'px'; cCanvas.style.height = wrap.clientHeight + 'px';
  }
  window.addEventListener('resize', resize);

  // ============================================================
  //  WSPÓŁRZĘDNE IZOMETRYCZNE (2:1, jak w HoMM3)
  // ============================================================
  const ISO_W = 58;
  const ISO_H = 29;
  function isoToScreen(gx, gy) {
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    const dx = gx - cam.x, dy = gy - cam.y;
    return { sx: cw / 2 + (dx - dy) * (ISO_W / 2), sy: ch / 2 + (dx + dy) * (ISO_H / 2) };
  }
  function screenToIso(sx, sy) {
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    const dx = sx - cw / 2, dy = sy - ch / 2;
    const gx = dx / ISO_W + dy / ISO_H + cam.x;
    const gy = dy / ISO_H - dx / ISO_W + cam.y;
    return { x: Math.floor(gx + 0.5), y: Math.floor(gy + 0.5) };
  }
  function fillIsoTile(cx, cy, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ISO_H); ctx.lineTo(cx + ISO_W / 2, cy);
    ctx.lineTo(cx, cy + ISO_H); ctx.lineTo(cx - ISO_W / 2, cy); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function renderAll() {
    if (!state) return;
    updateTopbar();
    if (state.winner !== null && state.winner !== undefined) { showWinner(); return; }
    if (state.phase === 'combat') { show('combatLayer'); resizeCombat(); renderCombat(); return; }
    hide('combatLayer');
    if (net.mode === 'mp' && !canAct()) {
      const ctrl = state.players[E.controllerOf(state)];
      $('waitText').textContent = 'Tura: ' + (ctrl ? ctrl.name : '?');
      show('waitOverlay');
    } else hide('waitOverlay');
    drawMap();
  }

  function updateTopbar() {
    const p = me();
    if (!p) return;
    let html = '';
    D.RESOURCES.forEach(r => {
      const amt = p.resources[r] || 0;
      html += `<div class="res">${D.RES_INFO[r].emoji}<span>${amt}</span></div>`;
    });
    $('resBar').innerHTML = html;
    const wk = Math.floor((state.day - 1) / 7) + 1, dy = ((state.day - 1) % 7) + 1;
    const turn = state.players[state.turn];
    $('turnInfo').innerHTML = `Tydzień ${wk}, dzień ${dy}<br>Tura: <b style="color:${turn.color}">${turn.name}</b>`;
  }

  function drawMap() {
    ctx.save(); ctx.scale(DPR, DPR);
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    ctx.fillStyle = '#080604'; ctx.fillRect(0, 0, cw, ch);
    const f = net.mode === 'local' ? state.fog[state.turn] : state.fog[myIndex];
    const drawList = [];
    const vis = Math.ceil((cw / ISO_W + ch / ISO_H) / 2) + 3;
    for (let dy = -vis; dy <= vis; dy++) for (let dx = -vis; dx <= vis; dx++) {
      const gx = Math.round(cam.x + dx), gy = Math.round(cam.y + dy);
      if (gx < 0 || gy < 0 || gx >= state.W || gy >= state.H) continue;
      const { sx, sy } = isoToScreen(gx, gy);
      if (sx < -ISO_W || sx > cw + ISO_W || sy < -ISO_H * 2 || sy > ch + ISO_H * 2) continue;
      drawList.push({ type: 'tile', gx, gy, sx, sy, depth: gx + gy });
      const o = E.objectAt(state, gx, gy);
      if (o && f.exp[gy][gx]) drawList.push({ type: 'obj', o, sx, sy, depth: gx + gy + 0.1, vis: f.vis[gy][gx] });
      const t = E.townAt(state, gx, gy);
      if (t && f.exp[gy][gx]) drawList.push({ type: 'town', t, sx, sy, depth: gx + gy + 0.1, vis: f.vis[gy][gx] });
    }
    for (const p of state.players) for (const h of p.heroes) {
      if (!h.alive || !f.vis[h.y][h.x]) continue;
      const { sx, sy } = isoToScreen(h.x, h.y);
      drawList.push({ type: 'hero', h, p, sx, sy, depth: h.x + h.y + 0.2 });
    }
    drawList.sort((a, b) => a.depth - b.depth);
    let reachSet = null;
    if (canAct() && selectedHero && selectedHero.alive && !moving) {
      const r = E.reachable(state, selectedHero.x, selectedHero.y, selectedHero.mp);
      reachSet = new Set(Object.keys(r.dist));
    }
    for (const item of drawList) {
      if (item.type === 'tile') {
        const tt = state.map.tiles[item.gy][item.gx];
        if (!f.exp[item.gy][item.gx]) { fillIsoTile(item.sx, item.sy, '#050505', null); continue; }
        let col = TERRAIN[tt].color;
        if (reachSet && reachSet.has(item.gx + ',' + item.gy)) col = '#7ac07a';
        fillIsoTile(item.sx, item.sy, col, 'rgba(0,0,0,0.2)');
        if (tt === E.T.FOREST) { ctx.font = (ISO_W - 20) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.8; ctx.fillText('🌲', item.sx, item.sy - 2); ctx.globalAlpha = 1; }
        else if (tt === E.T.MOUNTAIN) { ctx.fillStyle = '#5a5a5a'; ctx.beginPath(); ctx.moveTo(item.sx, item.sy - ISO_H * 0.7); ctx.lineTo(item.sx + ISO_W * 0.3, item.sy + ISO_H * 0.3); ctx.lineTo(item.sx - ISO_W * 0.3, item.sy + ISO_H * 0.3); ctx.fill(); }
        else if (tt === E.T.WATER) { ctx.fillStyle = 'rgba(120,180,255,0.12)'; ctx.beginPath(); ctx.ellipse(item.sx, item.sy, ISO_W * 0.3, ISO_H * 0.2, 0, 0, Math.PI * 2); ctx.fill(); }
        if (!f.vis[item.gy][item.gx]) fillIsoTile(item.sx, item.sy, 'rgba(0,0,0,0.5)', null);
      } else if (item.type === 'obj') drawObjectIso(item.o, item.sx, item.sy, item.vis);
      else if (item.type === 'town') drawTownIso(item.t, item.sx, item.sy, item.vis);
      else if (item.type === 'hero') drawHeroIso(item.h, item.p, item.sx, item.sy);
    }
    ctx.restore();
  }

  function drawObjectIso(o, sx, sy, visible) {
    ctx.globalAlpha = visible ? 1 : 0.55;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 2, ISO_W * 0.28, ISO_H * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    let icon = '❓';
    if (o.type === 'mine') icon = o.icon || '⛏️';
    else if (o.type === 'treasure' || o.type === 'resource') icon = '💰';
    else if (o.type === 'pile') icon = D.RES_INFO[o.resource].emoji;
    else if (o.type === 'monster') icon = '👹';
    else if (o.type === 'artifact') icon = '🏆';
    else if (o.type === 'dwelling') icon = '🏚️';
    else if (o.type === 'observatory') icon = '🗼';
    else if (o.type === 'shrine') icon = '⛩️';
    else if (o.type === 'market') icon = '⚖️';
    ctx.font = (ISO_W - 12) + 'px serif';
    ctx.fillStyle = '#000'; ctx.fillText(icon, sx + 1, sy - ISO_H * 0.3 + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(icon, sx, sy - ISO_H * 0.3);
    if ((o.type === 'mine' || o.type === 'dwelling') && o.owner >= 0) {
      ctx.beginPath(); ctx.arc(sx + ISO_W * 0.25, sy - ISO_H * 0.5, 5, 0, Math.PI * 2);
      ctx.fillStyle = state.players[o.owner].color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (o.guard && o.guard.length) {
      ctx.font = '9px system-ui'; const txt = o.guard.map(s => UNITS[s.key].emoji + s.count).join('');
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(txt, sx, sy + ISO_H * 0.5);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, sx, sy + ISO_H * 0.5);
    }
    ctx.globalAlpha = 1;
  }
  function drawTownIso(t, sx, sy, visible) {
    ctx.globalAlpha = visible ? 1 : 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, ISO_W * 0.35, ISO_H * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.owner >= 0 ? state.players[t.owner].color : '#777';
    ctx.beginPath(); ctx.moveTo(sx, sy - ISO_H * 0.9); ctx.lineTo(sx + ISO_W * 0.35, sy - ISO_H * 0.2);
    ctx.lineTo(sx + ISO_W * 0.25, sy + ISO_H * 0.4); ctx.lineTo(sx - ISO_W * 0.25, sy + ISO_H * 0.4);
    ctx.lineTo(sx - ISO_W * 0.35, sy - ISO_H * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#3a2812'; ctx.fillRect(sx - ISO_W * 0.18, sy - ISO_H * 0.6, ISO_W * 0.1, ISO_H * 0.8);
    ctx.fillRect(sx + ISO_W * 0.08, sy - ISO_H * 0.6, ISO_W * 0.1, ISO_H * 0.8);
    ctx.font = (ISO_W - 18) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏰', sx, sy - ISO_H * 0.3);
    ctx.globalAlpha = 1;
  }
  function drawHeroIso(h, p, sx, sy) {
    const isMine = me() && me().heroes.includes(h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 3, ISO_W * 0.22, ISO_H * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy - ISO_H * 0.3, ISO_W * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = isMine ? '#ffe24a' : '#000'; ctx.stroke();
    ctx.font = (ISO_W - 22) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(FACTIONS[p.faction].hero, sx, sy - ISO_H * 0.3 + 1);
    const bw = ISO_W * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(sx - bw / 2, sy + ISO_H * 0.4, bw, 3);
    ctx.fillStyle = '#5fb56a'; ctx.fillRect(sx - bw / 2, sy + ISO_H * 0.4, bw * clamp(h.mp / D.HERO_BASE_MP, 0, 1), 3);
  }

  // ============================================================
  //  WEJŚCIE: MAPA
  // ============================================================
  function setupMapInput() {
    canvas.addEventListener('pointerdown', (e) => {
      if (!canAct() || state.phase !== 'map') return;
      const rect = canvas.getBoundingClientRect();
      dragState = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragState) return;
      const dsx = e.clientX - dragState.sx, dsy = e.clientY - dragState.sy;
      if (Math.abs(dsx) + Math.abs(dsy) > 8) dragState.moved = true;
      cam.x = dragState.cx - (dsx / ISO_W + dsy / ISO_H);
      cam.y = dragState.cy + (dsx / ISO_W - dsy / ISO_H);
      drawMap();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!dragState) return; const d = dragState; dragState = null;
      if (!d.moved) { const rect = canvas.getBoundingClientRect(); handleMapTap(e.clientX - rect.left, e.clientY - rect.top); }
    });
  }

  function handleMapTap(sx, sy) {
    if (moving) return;
    const p = me(); if (!p) return;
    const { x, y } = screenToIso(sx, sy);
    if (x < 0 || y < 0 || x >= state.W || y >= state.H) return;

    // wybór własnego bohatera
    const clickedHero = E.heroAt(state, x, y);
    if (clickedHero && me().heroes.includes(clickedHero)) { selectedHero = clickedHero; drawMap(); return; }

    if (!selectedHero || !selectedHero.alive) { toast('Wybierz bohatera'); return; }

    // atak na wrogiego bohatera (z sąsiedztwa)
    if (clickedHero && !me().heroes.includes(clickedHero)) { attackEnemyHero(selectedHero, x, y); return; }

    // stuk w miejsce gdzie stoi bohater
    if (x === selectedHero.x && y === selectedHero.y) {
      const t = E.townAt(state, x, y);
      if (t && t.owner === me().idx) openTown(t);
      return;
    }

    const path = E.pathTo(state, selectedHero.x, selectedHero.y, x, y, selectedHero.mp);
    if (!path || path.length < 2) { toast('Nie da się tam dojść'); return; }
    walkHero(selectedHero, path);
  }

  function attackEnemyHero(hero, tx, ty) {
    const reach = E.reachable(state, hero.x, hero.y, hero.mp);
    let spot = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      if (reach.dist[(tx + dx) + ',' + (ty + dy)] !== undefined) { spot = { x: tx + dx, y: ty + dy }; }
    }
    if (!spot) { toast('Za daleko, by zaatakować'); return; }
    const path = E.pathTo(state, hero.x, hero.y, spot.x, spot.y, hero.mp);
    if (path && path.length >= 2) {
      walkHero(hero, path, () => {
        const enemy = E.heroAt(state, tx, ty);
        const ep = state.players.find(pl => pl.heroes.includes(enemy));
        startCombatCtx({ player: me().idx, heroId: hero.id }, { player: ep.idx, heroId: enemy.id }, hero.army, enemy.army);
      });
    }
  }

  function walkHero(hero, path, then) {
    moving = true;
    let i = 1;
    function step() {
      if (!state || i >= path.length || !hero.alive) { moving = false; afterMove(hero, then); return; }
      const tile = path[i];
      const cost = TERRAIN[state.map.tiles[tile.y][tile.x]].cost;
      if (hero.mp < cost) { moving = false; afterMove(hero, then); return; }
      hero.x = tile.x; hero.y = tile.y; hero.mp -= cost;
      E.recomputeVision(state, net.mode === 'local' ? state.turn : myIndex);
      drawMap(); updateTopbar();
      const o = E.objectAt(state, tile.x, tile.y);
      if (o && isInteractable(o)) { moving = false; interact(hero, o, then); return; }
      i++; setTimeout(step, 90);
    }
    step();
  }
  function isInteractable(o) { return ['treasure', 'resource', 'pile', 'monster', 'mine', 'town', 'artifact', 'dwelling', 'observatory', 'shrine', 'market'].includes(o.type); }
  function afterMove(hero, then) { drawMap(); if (then) then(); else syncOut(); }

  function interact(hero, o, then) {
    if (!o) { if (then) then(); else syncOut(); return; }
    const p = me();
    switch (o.type) {
      case 'treasure': case 'resource': {
        if (o.guard && o.guard.length) { startGuardCombat(hero, o); }
        else {
          const amt = o.gold || o.amount;
          p.resources.gold += amt; toast('+' + amt + ' 🪙');
          delete state.map.objects[o.id]; finishInteract(then);
        } break;
      }
      case 'pile': { p.resources[o.resource] += o.amount; toast('+' + o.amount + ' ' + D.RES_INFO[o.resource].emoji); delete state.map.objects[o.id]; finishInteract(then); break; }
      case 'artifact': case 'monster': { if (o.guard && o.guard.length) startGuardCombat(hero, o); break; }
      case 'dwelling': {
        if (o.guard && o.guard.length) { startGuardCombat(hero, o); }
        else if (o.owner === p.idx) {
          const got = E.collectDwelling(state, hero, o.id);
          if (got > 0) toast('+' + got + ' ' + UNITS[o.unitKey].emoji); else toast('Siedlisko puste');
          finishInteract(then);
        } else { o.owner = p.idx; o.stored = o.stored || 0; toast('Przejęto siedlisko ' + UNITS[o.unitKey].emoji); finishInteract(then); }
        break;
      }
      case 'observatory': {
        if (o.guard && o.guard.length) { startGuardCombat(hero, o); }
        else { E.revealArea(state, p.idx, o.x, o.y, 6); toast('🗺️ Odkryto teren!'); delete state.map.objects[o.id]; finishInteract(then); }
        break;
      }
      case 'shrine': {
        if (o.guard && o.guard.length) { startGuardCombat(hero, o); }
        else { E.grantXP(state, hero, 200); toast('⛩️ +200 XP dla ' + hero.name); delete state.map.objects[o.id]; finishInteract(then); }
        break;
      }
      case 'market': { openMarket(); break; }
      case 'mine': {
        if (o.owner !== p.idx && o.guard && o.guard.length) startGuardCombat(hero, o);
        else { if (o.owner !== p.idx) { o.owner = p.idx; toast('Zdobyto: ' + o.label); E.recomputeVision(state, p.idx); } finishInteract(then); }
        break;
      }
      case 'town': {
        if (o.owner === p.idx) openTown(o);
        else {
          const defArmy = o.garrison.length ? o.garrison : [{ key: 'cas1', count: 8 }];
          startCombatCtx({ player: p.idx, heroId: hero.id }, { player: o.owner, townId: o.id }, hero.army, defArmy);
        } break;
      }
    }
  }
  function finishInteract(then) { drawMap(); if (then) then(); else syncOut(); }

  function startGuardCombat(hero, o) {
    const def = { player: -1 };
    if (o.type === 'monster') { def.removeObj = o.id; if (o.reward) def.reward = o.reward; }
    else if (o.type === 'treasure' || o.type === 'resource') { def.removeObj = o.id; }
    else if (o.type === 'artifact') { def.removeObj = o.id; }
    else if (o.type === 'mine') def.mineId = o.id;
    else if (o.type === 'dwelling') def.flagDwellingId = o.id;
    else if (o.type === 'observatory') def.revealId = o.id;
    else if (o.type === 'shrine') def.removeObj = o.id;
    startCombatCtx({ player: me().idx, heroId: hero.id }, def, hero.army, o.guard);
  }
  function startCombatCtx(atk, def, atkArmy, defArmy) {
    E.startCombat(state, atk, def, atkArmy, defArmy);
    resetCombatView();
    // jeśli walkę zainicjował gracz-AI, po jej zakończeniu wznów jego turę
    const initiator = net.mode === 'local' ? state.players[state.turn] : state.players[myIndex];
    combatResume = (initiator && initiator.isAI)
      ? () => { if (state.winner !== null && state.winner !== undefined) { renderAll(); return; } setTimeout(() => { E.endTurn(state); syncOut(); enterTurn(); }, 300); }
      : null;
    syncOut();
    renderAll();
    maybeAI();
  }

  // ============================================================
  //  WALKA — RENDER
  // ============================================================
  function renderCombat() {
    if (!state || state.phase !== 'combat') return;
    renderCombatBase();
    updateCombatInfo();
  }

  function drawHex(cx, cy, size, col, row, cur, reach) {
    const sideOwner = col < 4 ? 0 : (col > 10 ? 1 : -1);
    let fill = '#2a2418';
    if (sideOwner === 0) fill = '#2a201c';
    else if (sideOwner === 1) fill = '#241c22';
    // podświetlenie reachable
    if (reach && reach.dist[col + ',' + row] !== undefined) fill = 'rgba(90,160,220,0.30)';
    cctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i + Math.PI / 6; // pointy-top
      const px = cx + size * Math.cos(a) * 0.94, py = cy + size * Math.sin(a) * 0.94;
      i === 0 ? cctx.moveTo(px, py) : cctx.lineTo(px, py);
    }
    cctx.closePath();
    cctx.fillStyle = fill; cctx.fill();
    cctx.strokeStyle = 'rgba(0,0,0,0.4)'; cctx.lineWidth = 1; cctx.stroke();
  }

  function drawUnit(u, cx, cy, size) {
    const c = state.combat;
    const col = u.side === 0 ? state.players[c.atk.player].color : (c.def.player >= 0 ? state.players[c.def.player].color : '#999');
    // pierścień aktywnej
    if (u.id === c.current) {
      cctx.beginPath(); cctx.arc(cx, cy, size * 0.95, 0, Math.PI * 2);
      cctx.strokeStyle = '#ffe24a'; cctx.lineWidth = 3; cctx.stroke();
    }
    cctx.beginPath(); cctx.arc(cx, cy, size * 0.72, 0, Math.PI * 2);
    cctx.fillStyle = col; cctx.fill(); cctx.lineWidth = 2; cctx.strokeStyle = '#000'; cctx.stroke();
    cctx.font = Math.floor(size) + 'px serif'; cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
    cctx.fillText(UNITS[u.key].emoji, cx, cy + 1);
    // licznik
    cctx.font = 'bold ' + Math.max(11, Math.floor(size * 0.5)) + 'px system-ui';
    cctx.fillStyle = '#000'; cctx.fillText(u.count, cx + 1, cy + size * 0.72 + 1);
    cctx.fillStyle = '#fff'; cctx.fillText(u.count, cx, cy + size * 0.72);
    // pasek hp
    const ud = UNITS[u.key];
    const frac = clamp((u.hp + (u.count - 1) * ud.hp) / (ud.hp * u.count), 0, 1);
    const bw = size * 1.3;
    cctx.fillStyle = 'rgba(0,0,0,.6)'; cctx.fillRect(cx - bw / 2, cy - size * 0.85, bw, 4);
    cctx.fillStyle = frac > 0.5 ? '#5fb56a' : (frac > 0.25 ? '#e0c040' : '#d65a5a');
    cctx.fillRect(cx - bw / 2, cy - size * 0.85, bw * frac, 4);
  }

  function updateCombatInfo() {
    const c = state.combat;
    const cur = E.currentUnit(state);
    const atkP = state.players[c.atk.player];
    const defName = c.def.player >= 0 ? state.players[c.def.player].name : 'Strażnicy';
    let html = `<div class="ci-row"><span style="color:${atkP.color}">${atkP.name}</span> ⚔️ <span style="color:${c.def.player >= 0 ? state.players[c.def.player].color : '#999'}">${defName}</span> · Runda ${c.round}</div>`;
    if (cur) html += `<div class="ci-cur">Rusza: <b>${UNITS[cur.key].emoji} ${UNITS[cur.key].name}</b> x${cur.count} ${cur.shots !== undefined && UNITS[cur.key].ranged ? '🏹' + cur.shots : ''}</div>`;
    if (c.log.length) { const last = c.log[c.log.length - 1]; html += `<div class="ci-log">${last}</div>`; }
    $('combatInfo').innerHTML = html;
  }

  function setupCombatInput() {
    const pointers = new Map();
    let pinchStartDist = 0, pinchStartZoom = 1;
    let panStart = null, didMove = false;

    function clientToCombat(e) {
      const rect = cCanvas.getBoundingClientRect();
      return {
        // odwrócenie zoomu/pana: px w „heksowym" układzie
        px: (e.clientX - rect.left - combatView.ox - combatView.panX) / combatView.zoom,
        py: (e.clientY - rect.top - combatView.oy - combatView.panY) / combatView.zoom
      };
    }
    function pointerDist() {
      const pts = [...pointers.values()]; if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    cCanvas.addEventListener('pointerdown', (e) => {
      if (!state || state.phase !== 'combat') return;
      cCanvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { pinchStartDist = pointerDist(); pinchStartZoom = combatView.zoom; }
      else { panStart = { x: e.clientX, y: e.clientY, px: combatView.panX, py: combatView.panY }; didMove = false; }
    });
    cCanvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const d = pointerDist();
        if (pinchStartDist > 0) {
          combatView.zoom = clamp(pinchStartZoom * d / pinchStartDist, 1, 3.5);
          renderCombat();
        }
      } else if (panStart) {
        const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) didMove = true;
        combatView.panX = panStart.px + dx; combatView.panY = panStart.py + dy;
        renderCombat();
      }
    });
    function endPointer(e) {
      if (pointers.size === 1 && !didMove && pointers.has(e.pointerId)) {
        // klik
        if (canAct()) {
          const cur = E.currentUnit(state);
          if (cur && humanControls(cur)) {
            const { px, py } = clientToCombat(e);
            const hex = E.pixelToHex(px, py, combatView.size);
            if (hex.col >= 0 && hex.row >= 0 && hex.col < state.combat.cols && hex.row < state.combat.rows) doCombatAction(cur, hex.col, hex.row);
          }
        }
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = 0;
      panStart = null;
    }
    cCanvas.addEventListener('pointerup', endPointer);
    cCanvas.addEventListener('pointercancel', endPointer);
  }
  function humanControls(u) {
    if (net.mode === 'local') return true;
    const ctrlP = u.side === 0 ? state.combat.atk.player : state.combat.def.player;
    return myIndex === ctrlP;
  }
  function doCombatAction(cur, col, row) {
    if (combatAnimRAF) return;
    const target = state.combat.units.find(u => u.alive && u.x === col && u.y === row);
    const ud = UNITS[cur.key];
    if (target && target.side !== cur.side) {
      if (ud.ranged && cur.shots > 0) { E.execShoot(state, cur.id, target.id); }
      else if (E.hexDistance({ col: cur.x, row: cur.y }, { col, row }) === 1) { E.execMelee(state, cur.id, target.id); }
      else { // dojdź obok i zaatakuj
        moveToHexAttack(cur, target);
        return;
      }
      afterCombatAct(); return;
    }
    if (!target) {
      const reach = E.combatReach(state, cur);
      if (reach.dist[col + ',' + row] !== undefined) { E.moveUnit(state, cur.id, col, row); afterCombatAct(); }
    }
  }
  function moveToHexAttack(cur, target) {
    const reach = E.combatReach(state, cur);
    let best = null;
    for (const [nc, nr] of E.hexNeighbors(target.x, target.y)) {
      if (reach.dist[nc + ',' + nr] !== undefined) { if (!best || reach.dist[nc + ',' + nr] < reach.dist[best.col + ',' + best.row]) best = { col: nc, row: nr }; }
    }
    if (!best) { toast('Nie dosięgniesz'); return; }
    E.moveUnit(state, cur.id, best.col, best.row);
    const still = E.currentUnit(state);
    if (still && still.id === cur.id && E.hexDistance({ col: cur.x, row: cur.y }, { col: target.x, row: target.y }) === 1) E.execMelee(state, cur.id, target.id);
    afterCombatAct();
  }
  let combatAnim = null;
  let combatAnimRAF = null;
  function afterCombatAct() {
    if (state.phase === 'combat') {
      // odtwórz animację z ostatniej akcji
      const anim = state.combat.lastAnim;
      if (anim && (!combatAnim || combatAnim.t !== anim.t)) {
        combatAnim = anim;
        playCombatAnim(anim);
      } else { renderCombat(); }
      syncOut(); maybeAI(); return;
    }
    syncOut();
    if (combatResume) { const r = combatResume; combatResume = null; r(); }
    else renderAll();
  }
  function playCombatAnim(anim) {
    if (combatAnimRAF) cancelAnimationFrame(combatAnimRAF);
    const start = performance.now();
    const dur = anim.type === 'shoot' ? 450 : 350;
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      renderCombatAnimated(anim, t);
      if (t < 1) combatAnimRAF = requestAnimationFrame(frame);
      else { combatAnimRAF = null; renderCombat(); }
    }
    combatAnimRAF = requestAnimationFrame(frame);
  }
  function renderCombatAnimated(anim, t) {
    renderCombatBase();
    const cs = combatView.size * combatView.zoom;
    const atk = E.unitById ? null : null; // fallback
    const atkU = state.combat.units.find(u => u.id === anim.atkId);
    const defU = state.combat.units.find(u => u.id === anim.defId);
    if (!atkU || !defU) return;
    const atkPos = hexScreen(atkU.x, atkU.y);
    const defPos = hexScreen(defU.x, defU.y);
    if (anim.type === 'melee') {
      // przybijanie: atk rusza w stronę celu i wraca
      const ease = t < 0.5 ? t * 2 : (1 - t) * 2;
      const dx = (defPos.x - atkPos.x) * 0.35 * ease;
      const dy = (defPos.y - atkPos.y) * 0.35 * ease;
      // przerysuj atkUnit w przesuniętej pozycji
      cctx.save(); cctx.scale(DPR, DPR);
      drawUnit(atkU, atkPos.x + dx, atkPos.y + dy, cs);
      cctx.restore();
    } else if (anim.type === 'shoot') {
      // pocisk (strzałka) leci od atk do def
      cctx.save(); cctx.scale(DPR, DPR);
      const px = atkPos.x + (defPos.x - atkPos.x) * t;
      const py = atkPos.y + (defPos.y - atkPos.y) * t - Math.sin(t * Math.PI) * 20;
      cctx.strokeStyle = '#ffe24a'; cctx.lineWidth = 3;
      const ang = Math.atan2(defPos.y - atkPos.y, defPos.x - atkPos.x);
      cctx.beginPath(); cctx.moveTo(px - Math.cos(ang) * 12, py - Math.sin(ang) * 12);
      cctx.lineTo(px + Math.cos(ang) * 12, py + Math.sin(ang) * 12); cctx.stroke();
      cctx.restore();
    }
    // migotanie obrażeń na celu + liczba obrażeń
    if (t > 0.3) {
      cctx.save(); cctx.scale(DPR, DPR);
      const flash = Math.sin(t * 20) > 0;
      if (flash && defU.alive) { cctx.fillStyle = 'rgba(255,60,60,0.4)'; cctx.beginPath(); cctx.arc(defPos.x, defPos.y, cs * 0.75, 0, Math.PI * 2); cctx.fill(); }
      // liczba obrażeń unosi się
      const yOff = -t * 25;
      cctx.font = 'bold ' + Math.max(14, Math.floor(cs * 0.7)) + 'px system-ui';
      cctx.textAlign = 'center'; cctx.fillStyle = '#ff4040';
      cctx.strokeStyle = '#000'; cctx.lineWidth = 3;
      const txt = '-' + anim.dmg;
      cctx.strokeText(txt, defPos.x, defPos.y - cs * 0.8 + yOff);
      cctx.fillText(txt, defPos.x, defPos.y - cs * 0.8 + yOff);
      cctx.restore();
    }
  }
  function renderCombatBase() {
    if (!state || state.phase !== 'combat') return;
    resizeCombat();
    const c = state.combat;
    const wrap = $('combatCanvasWrap');
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const margin = 10;
    const sizeByW = (w - margin) / (Math.sqrt(3) * (c.cols + 0.5));
    const sizeByH = (h - margin) / (1.5 * (c.rows - 1) + 2);
    const size = Math.max(12, Math.floor(Math.min(sizeByW, sizeByH)));
    combatView.size = size; const cs = combatView.size;
    const boardW = cs * Math.sqrt(3) * (c.cols + 0.5);
    const boardH = cs * (1.5 * (c.rows - 1) + 2);
    combatView.ox = (w - boardW) / 2; combatView.oy = (h - boardH) / 2;
    cctx.save(); cctx.scale(DPR, DPR);
    cctx.fillStyle = '#1a1610'; cctx.fillRect(0, 0, w, h);
    const cur = E.currentUnit(state);
    let reach = null; if (cur) reach = E.combatReach(state, cur);
    for (let row = 0; row < c.rows; row++) for (let col = 0; col < c.cols; col++) {
      const s = hexScreen(col, row); drawHex(s.x, s.y, cs * combatView.zoom, col, row, cur, reach);
    }
    for (const u of c.units) { if (!u.alive) continue; const s = hexScreen(u.x, u.y); drawUnit(u, s.x, s.y, cs * combatView.zoom); }
    cctx.restore();
  }

  function maybeAI() {
    if (!state || state.phase !== 'combat') return;
    const cur = E.currentUnit(state);
    if (!cur) return;
    const ctrlP = cur.side === 0 ? state.combat.atk.player : state.combat.def.player;
    const isNeutral = ctrlP === -1;
    const controlled = isNeutral || (state.players[ctrlP] && state.players[ctrlP].isAI);
    if (!controlled) return;
    // w trybie lokalnym AI napędza host; w mp neutralni -> atakujący
    if (net.mode === 'mp' && isNeutral && myIndex !== state.turn) return;
    clearTimeout(pendingAI);
    pendingAI = setTimeout(() => {
      if (!state || state.phase !== 'combat') return;
      E.aiCombatTurn(state);
      renderCombat(); syncOut();
      if (state.phase === 'combat') maybeAI(); else afterCombatAct();
    }, 450);
  }

  // ============================================================
  //  MIASTO
  // ============================================================
  let openTownObj = null;
  function openTown(t) { openTownObj = t; renderTown(); show('town'); }
  function renderTown() {
    const t = openTownObj; if (!t) return;
    const p = state.players[t.owner];
    const hero = p.heroes.find(h => h.alive && h.x === t.x && h.y === t.y);
    let html = `<div class="townHead"><span class="townEmoji">${FACTIONS[p.faction].emoji}</span><div><h1>${t.name}</h1><div class="townOwner" style="color:${p.color}">${p.name} · ${D.HALL_LEVELS[t.hall].name} (+${D.HALL_LEVELS[t.hall].income}🪙/dzień)</div></div><button id="townClose" class="primary">✕</button></div>`;

    // budowa
    html += `<h3>🔨 Budowa ${t.builtThisDay ? '<small>(zbudowano dziś)</small>' : ''}</h3><div class="buildGrid">`;
    if (t.hall < D.HALL_LEVELS.length - 1) html += buildBtn('hall', D.HALL_LEVELS[t.hall + 1].name + ' (↑' + D.HALL_LEVELS[t.hall + 1].income + ')', D.HALL_UPGRADE_COST, p, t);
    if (!t.fort) html += buildBtn('fort', 'Fort (obrona)', { gold: 1000, ore: 5 }, p, t);
    if (!t.mageGuild) html += buildBtn('mageGuild', '🔮 Gildia Magów', { gold: 2000, wood: 5, mercury: 5 }, p, t);
    for (let tier = 1; tier <= 7; tier++) {
      const u = FACTIONS[p.faction].units[tier - 1];
      if (!t.built['dw' + tier]) html += buildBtn('dw' + tier, `${u.emoji} ${u.name}`, D.DWELLING_COST[tier], p, t);
    }
    html += `</div>`;

    // karczma — zatrudnij bohatera
    const canHire = p.heroes.length < 8 && affords(p, { gold: 2500 });
    html += `<h3>🍺 Karczma</h3><div class="hireRow">
      <div class="hireInfo">Zatrudnij bohatera (do ${8 - p.heroes.length} wolnych miejsc)<br><small>Koszt: 2500🪙 · masz ${p.heroes.length}</small></div>
      <button id="btnHire" ${canHire ? '' : 'disabled'}>Zatrudnij 🧙</button></div>`;

    if (t.mageGuild && hero) {
      const known = (hero.spells || []).map(s => D.SPELLS[s] ? D.SPELLS[s].name : s).join(', ') || 'brak';
      html += '<h3>🔮 Gildia Magów</h3><div class="hireRow"><div class="hireInfo">Naucz bohatera czarów<br><small>Znane: ' + known + '</small></div><button id="btnLearn" class="primary">Ucz się ✨</button></div>';
    }

    // rekrutacja
    html += `<h3>⚔️ Rekrutacja</h3><div class="recruitList">`;
    for (const u of FACTIONS[p.faction].units) {
      const av = t.avail[u.key] || 0;
      const costStr = Object.keys(u.cost).map(k => `${u.cost[k]}${D.RES_INFO[k].emoji}`).join(' ');
      const can1 = av >= 1 && affords(p, u.cost);
      html += `<div class="recItem"><span class="recEmo">${u.emoji}</span>
        <div class="recInfo"><b>${u.name}</b><br><small>${costStr} · dostępne: ${av}</small><br>
        <small>A${u.atk} O${u.def} HP${u.hp} ${u.dmg[0]}-${u.dmg[1]} S${u.speed}${u.ranged ? ' 🏹' : ''}${u.flying ? ' 🦅' : ''}</small></div>
        <div class="recBtns">
          <button data-rec="${u.key}" data-n="1" ${can1 ? '' : 'disabled'}>1</button>
          <button data-rec="${u.key}" data-n="max" ${av > 0 ? '' : 'disabled'}>MAX</button>
        </div></div>`;
    }
    html += `</div>`;

    // armie
    html += `<h3>🎒 Wojsko</h3><div class="armies"><div class="armyCol"><h4>Garnizon</h4><div class="slots">`;
    for (let i = 0; i < 7; i++) html += slotHTML('gar', i, t.garrison[i], hero);
    html += `</div></div><div class="armyCol"><h4>Bohater ${hero ? '' : '(nie w mieście)'}</h4><div class="slots">`;
    for (let i = 0; i < 7; i++) html += slotHTML('hero', i, hero ? hero.army[i] : null, hero);
    html += `</div></div></div>`;
    html += `<p class="hint">Stuknij stos, by przenieść ${hero ? 'między garnizonem a bohaterem' : '(bohater musi stać w mieście)'}</p>`;

    $('townBody').innerHTML = html;
    bindTown();
  }
  function buildBtn(what, label, cost, p, t) {
    const can = !t.builtThisDay && affords(p, cost);
    const costStr = Object.keys(cost).map(k => `${cost[k]}${D.RES_INFO[k].emoji}`).join(' ');
    return `<button class="buildBtn ${can ? '' : 'disabled'}" data-build="${what}" ${can ? '' : 'disabled'}>${label}<br><small>${costStr}</small></button>`;
  }
  function slotHTML(where, i, s, hero) {
    if (s) return `<div class="slot" data-move="${where}" data-i="${i}">${UNITS[s.key].emoji}<span>${s.count}</span></div>`;
    return `<div class="slot empty"></div>`;
  }
  function affords(p, cost) { return E.D ? D.RESOURCES.every(r => (p.resources[r] || 0) >= (cost[r] || 0)) : true; }
  function bindTown() {
    $('townClose').onclick = () => { hide('town'); syncOut(); };
    const t = openTownObj; const p = state.players[t.owner];
    const hero = p.heroes.find(h => h.alive && h.x === t.x && h.y === t.y);
    const hireBtn = $('btnHire');
    if (hireBtn) hireBtn.onclick = () => {
      const h = E.hireHero(state, t.id);
      if (h) { toast('Zatrudniono: ' + h.name); renderTown(); syncOut(); }
      else toast('Nie można zatrudnić (brak złota/miejsc)');
    };
    const learnBtn = $('btnLearn');
    if (learnBtn) learnBtn.onclick = () => {
      if (hero) { const learned = E.learnSpells(state, hero, t.id); toast('Nauczono ' + learned.length + ' czarów!'); renderTown(); syncOut(); }
    };
    $('townBody').querySelectorAll('[data-build]').forEach(b => b.onclick = () => {
      if (E.buildInTown(state, t.id, b.getAttribute('data-build'))) { renderTown(); syncOut(); } else toast('Nie można budować');
    });
    $('townBody').querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
      const key = b.getAttribute('data-rec'); let n = b.getAttribute('data-n');
      n = n === 'max' ? 9999 : +n;
      const got = E.recruit(state, t.id, key, n);
      if (got > 0) { renderTown(); syncOut(); } else toast('Za mało surowców');
    });
    $('townBody').querySelectorAll('[data-move]').forEach(d => d.onclick = () => {
      if (!hero) return;
      const from = d.getAttribute('data-move'), idx = +d.getAttribute('data-i');
      if (from === 'gar') E.moveStack(t.garrison, idx, hero.army);
      else E.moveStack(hero.army, idx, t.garrison);
      renderTown(); syncOut();
    });
  }

  // ============================================================
  //  PRZYCISKI
  // ============================================================
  function setupButtons() {
    $('btnEnd').onclick = () => {
      if (!canAct() || state.phase === 'combat') return;
      E.endTurn(state); syncOut(); enterTurn();
    };
    $('btnNextHero').onclick = nextHero;
    $('btnSave').onclick = saveGame;
    $('btnHelp').onclick = () => show('help');
    $('btnHelpClose').onclick = () => hide('help');
    $('btnPassGo').onclick = () => { hide('pass'); renderAll(); };
    const dpc = $('btnDayOk');
    if (dpc) dpc.onclick = () => { hide('dayPopup'); renderAll(); };
    $('btnAgain').onclick = () => { hide('winner'); hide('combatLayer'); hide('town'); show('menu'); renderMenu(); state = null; };
    // menu
    $('mNewGame').onclick = () => { hide('menu'); show('setup'); renderMenu(); };
    $('mHotseat').onclick = () => { hide('menu'); show('setup'); renderMenu(); $('setupTitle').textContent = 'Hot-seat (2 graczy na 1 telefonie)'; };
    $('mMulti').onclick = () => { hide('menu'); show('setup'); renderMenu(); $('setupTitle').textContent = 'Multiplayer WiFi'; };
    $('mHelp').onclick = () => show('help');
    const mLoad = $('mLoad');
    if (mLoad) mLoad.onclick = () => { loadGame(); };
    const mSave = $('mSave');
    if (mSave) mSave.onclick = () => { if (state) saveGame(); else toast('Brak gry'); };
    // setup
    $('setup').addEventListener('click', (e) => {
      const fc = e.target.closest('[data-fac]'); if (fc) { menuConfig.faction = fc.getAttribute('data-fac'); renderMenu(); return; }
      const sc = e.target.closest('[data-size]'); if (sc) { menuConfig.size = sc.getAttribute('data-size'); renderMenu(); return; }
    });
    $('aiMinus').onclick = () => { menuConfig.aiCount = Math.max(1, menuConfig.aiCount - 1); renderMenu(); };
    $('aiPlus').onclick = () => { menuConfig.aiCount = Math.min(5, menuConfig.aiCount + 1); renderMenu(); };
    $('setupStart').onclick = () => {
      if ($('setupTitle').textContent.includes('Hot-seat')) startHotseat();
      else if ($('setupTitle').textContent.includes('WiFi')) { startMultiplayer(); }
      else startSingleVsAI();
    };
    $('setupBack').onclick = () => { hide('setup'); show('menu'); };
    // walka
    $('btnWait').onclick = () => { if (canAct() && state.phase === 'combat') { const cur = E.currentUnit(state); if (cur && humanControls(cur)) { E.waitUnit(state); afterCombatAct(); } } };
    $('btnDefend').onclick = () => { if (canAct() && state.phase === 'combat') { const cur = E.currentUnit(state); if (cur && humanControls(cur)) { E.defendUnit(state, cur.id); afterCombatAct(); } } };
    $('btnFlee').onclick = () => {
      if (!canAct() || state.phase !== 'combat') return;
      const cur = E.currentUnit(state); if (!cur || !humanControls(cur)) return;
      if (state.combat.atk.heroId) { const h = E.heroById(state, state.combat.atk.heroId); if (h) { const surv = state.combat.units.filter(u => u.alive && u.side === 0).map(u => ({ key: u.key, count: u.count })); h.army = surv; } }
      state.phase = 'map'; state.combat = null; E.checkWinner(state);
      hide('combatLayer'); syncOut(); renderAll();
    };
    $('btnAuto').onclick = () => {
      if (!canAct() || state.phase !== 'combat') return;
      const cur = E.currentUnit(state); if (!cur) return;
      // auto-rozegraj resztę walki AI vs AI
      let g = 0; while (state.phase === 'combat' && g < 500) { E.aiCombatTurn(state); g++; }
      renderAll(); syncOut();
    };
  }

  function showWinner() {
    hide('combatLayer'); hide('waitOverlay');
    if (state.winner === -1) $('winnerText').innerHTML = '🤝 Remis!';
    else { const w = state.players[state.winner]; $('winnerText').innerHTML = `🏆<br>Wygrywa:<br><span style="color:${w.color}">${w.name}</span>`; }
    show('winner');
  }

  // ============================================================
  //  TARG (handel surowcami)
  // ============================================================
  function openMarket() { renderMarket(); show('market'); }
  function renderMarket() {
    const p = me();
    let html = '<h1 style="font-size:24px;">⚖️ Targ</h1>';
    html += '<p style="text-align:center;font-size:13px;">Wymieniaj surowce. 5🪙=1 surowiec, 2 surowce=1🪙, 2 surowce=1 inny.</p>';
    html += '<div class="marketGrid">';
    D.RESOURCES.forEach(from => {
      html += '<div class="marketRow"><div class="marketFrom">' + D.RES_INFO[from].emoji + ' ' + (p.resources[from] || 0) + '</div><div class="marketArrows">';
      D.RESOURCES.filter(t => t !== from).forEach(to => {
        html += '<button class="tradeBtn" data-from="' + from + '" data-to="' + to + '">' + D.RES_INFO[to].emoji + '</button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    html += '<div class="btnrow"><button class="primary" id="marketClose">Zamknij</button></div>';
    $('marketBody').innerHTML = html;
    $('marketClose').onclick = () => { hide('market'); syncOut(); };
    $('marketBody').querySelectorAll('.tradeBtn').forEach(b => b.onclick = () => {
      const f = b.getAttribute('data-from'), t = b.getAttribute('data-to');
      const amt = (f === 'gold') ? 5 : 2;
      const got = E.tradeResource(state, me().idx, f, t, amt);
      if (got > 0) { toast('+' + got + ' ' + D.RES_INFO[t].emoji); renderMarket(); syncOut(); }
      else toast('Za mało ' + D.RES_INFO[f].emoji);
    });
  }

  // ============================================================
  //  ZAPIS / WCZYTANIE (localStorage)
  // ============================================================
  const SAVE_KEY = 'heroes_lite_save';
  function saveGame() {
    try { localStorage.setItem(SAVE_KEY, E.serialize(state)); toast('💾 Zapisano grę'); }
    catch (e) { toast('Błąd zapisu'); }
  }
  function loadGame() {
    try {
      const str = localStorage.getItem(SAVE_KEY);
      if (!str) { toast('Brak zapisu'); return false; }
      state = E.deserialize(str); net = { mode: 'local' };
      const h = state.players[state.turn].heroes.find(h => h.alive);
      if (h) { selectedHero = h; cam = { x: h.x, y: h.y }; }
      hide('menu'); renderAll(); toast('📂 Wczytano grę'); return true;
    } catch (e) { toast('Błąd wczytywania'); return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }

  // ============================================================
  //  NASTĘPNY BOHATER
  // ============================================================
  function nextHero() {
    if (!canAct() || state.phase !== 'map') return;
    const p = me();
    const alive = p.heroes.filter(h => h.alive);
    if (alive.length <= 1) { toast('Masz tylko 1 bohatera'); return; }
    const idx = alive.indexOf(selectedHero);
    selectedHero = alive[(idx + 1) % alive.length];
    cam = { x: selectedHero.x, y: selectedHero.y };
    drawMap();
  }

  // ============================================================
  //  SIEĆ (multiplayer)
  // ============================================================
  let es = null;
  let lastRoster = [];
  function startMultiplayer() {
    myIndex = -1; net = { mode: 'mp' };
    hide('setup'); show('lobby');
    $('lobbyStatus').textContent = 'Łączenie z serwerem…';
    try { es = new EventSource('/events'); } catch (e) { $('lobbyStatus').textContent = 'Otwórz przez serwer (node server.js), nie z pliku.'; return; }
    es.addEventListener('error', () => { $('lobbyStatus').textContent = 'Brak połączenia. Serwer działa? (node server.js)'; });
    es.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } handleNet(m); };
  }
  function sendNet(obj) { fetch('/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }).catch(() => { }); }
  function handleNet(m) {
    if (m.t === 'seat') { myIndex = m.i; $('lobbyStatus').textContent = 'Połączono jako gracz ' + (m.i + 1) + '. Czekaj na innych.'; sendNet({ t: 'join', i: myIndex, name: 'Gracz ' + (m.i + 1) }); }
    else if (m.t === 'roster') { lastRoster = m.roster; renderLobby(); }
    else if (m.t === 'start') { state = m.state; selectedHero = state.players[myIndex].heroes[0]; cam = { x: selectedHero.x, y: selectedHero.y }; hide('lobby'); renderAll(); }
    else if (m.t === 'state') { const prevTurn = state ? state.turn : -1; state = m.state; if (state.phase === 'map' && state.turn === myIndex && state.turn !== prevTurn) { const h = state.players[myIndex].heroes.find(h => h.alive); if (h) { selectedHero = h; cam = { x: h.x, y: h.y }; } } renderAll(); }
  }
  function renderLobby() {
    let html = ''; lastRoster.forEach(r => { html += `<div class="lobbyPlayer ${r.i === myIndex ? 'me' : ''}">${r.i + 1}. ${r.name || '?'}${r.i === myIndex ? ' ← TY' : ''}</div>`; });
    $('lobbyList').innerHTML = html;
  }
  function syncOut() { renderAll(); if (net.mode === 'mp' && state) sendNet({ t: 'state', state }); }

  function initLobbyButtons() {
    $('btnLobbyStart').onclick = () => {
      const metas = lastRoster.map(r => ({ name: r.name || ('Gracz ' + (r.i + 1)) }));
      if (metas.length < 2) { toast('Potrzeba min. 2 graczy'); return; }
      state = E.newGame({ players: metas, size: menuConfig.size, seed: Math.floor(Math.random() * 1e9) });
      sendNet({ t: 'start', state });
      selectedHero = state.players[myIndex].heroes[0]; cam = { x: selectedHero.x, y: selectedHero.y };
      hide('lobby'); renderAll();
    };
    $('btnLobbyLeave').onclick = () => { if (es) es.close(); hide('lobby'); show('menu'); };
  }

  // ============================================================
  //  START
  // ============================================================
  function init() {
    canvas = $('mapCanvas'); ctx = canvas.getContext('2d');
    cCanvas = $('combatCanvas'); cctx = cCanvas.getContext('2d');
    setupMapInput(); setupCombatInput(); setupButtons(); initLobbyButtons();
    renderMenu();
    resize();
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
