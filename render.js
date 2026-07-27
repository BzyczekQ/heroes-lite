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
    else renderAll();
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

  function worldToScreen(x, y) {
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    return { sx: (x - cam.x) * TILE + cw / 2, sy: (y - cam.y) * TILE + ch / 2 };
  }
  function screenToWorld(sx, sy) {
    const cw = canvas.width / DPR, ch = canvas.height / DPR;
    return { x: Math.round((sx - cw / 2) / TILE + cam.x), y: Math.round((sy - ch / 2) / TILE + cam.y) };
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
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, cw, ch);
    const f = net.mode === 'local' ? state.fog[state.turn] : state.fog[myIndex];
    const sx0 = Math.floor(cam.x - cw / 2 / TILE - 1), sy0 = Math.floor(cam.y - ch / 2 / TILE - 1);
    const sx1 = Math.ceil(cam.x + cw / 2 / TILE + 1), sy1 = Math.ceil(cam.y + ch / 2 / TILE + 1);
    // kafelki
    for (let y = clamp(sy0, 0, state.H - 1); y <= clamp(sy1, 0, state.H - 1); y++) {
      for (let x = clamp(sx0, 0, state.W - 1); x <= clamp(sx1, 0, state.W - 1); x++) {
        if (!f.exp[y][x]) { // nieodkryte — czarne
          ctx.fillStyle = '#050505'; ctx.fillRect(...ts(x, y)); continue;
        }
        const t = state.map.tiles[y][x];
        const { sx, sy } = worldToScreen(x, y);
        ctx.fillStyle = TERRAIN[t].color;
        ctx.fillRect(sx - TILE / 2, sy - TILE / 2, TILE + 1, TILE + 1);
        // tekstura lasu/gór
        if (t === E.T.FOREST) { ctx.font = (TILE - 16) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🌲', sx, sy); }
        else if (t === E.T.MOUNTAIN) { ctx.fillStyle = '#6f6f6f'; ctx.beginPath(); ctx.moveTo(sx, sy - TILE / 3); ctx.lineTo(sx + TILE / 3, sy + TILE / 3); ctx.lineTo(sx - TILE / 3, sy + TILE / 3); ctx.fill(); }
        else if (t === E.T.WATER) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(sx - TILE / 2, sy - TILE / 4, TILE, 3); }
        // siatka
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.strokeRect(sx - TILE / 2, sy - TILE / 2, TILE, TILE);
        // mgła (odkryte ale nie widoczne — przyciemnienie)
        if (!f.vis[y][x]) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx - TILE / 2, sy - TILE / 2, TILE, TILE); }
      }
    }
    function ts(x, y) { const s = worldToScreen(x, y); return [s.sx - TILE / 2, s.sy - TILE / 2, TILE + 1, TILE + 1]; }
    // obiekty (tylko widoczne/odkryte)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const id in state.map.objects) {
      const o = state.map.objects[id];
      if (!f.vis[o.y][o.x] && !f.exp[o.y][o.x]) continue;
      if (!f.exp[o.y][o.x]) continue;
      drawObject(o, f.vis[o.y][o.x]);
    }
    for (const t of state.map.towns) { if (f.exp[t.y][t.x]) drawObject(t, f.vis[t.y][t.x]); }
    // bohaterowie (widoczni)
    for (const p of state.players) for (const h of p.heroes) {
      if (!h.alive) continue;
      if (!f.vis[h.y][h.x]) continue;
      drawHero(h, p);
    }
    // reachable + ścieżka
    if (canAct() && selectedHero && selectedHero.alive && !moving) {
      const reach = E.reachable(state, selectedHero.x, selectedHero.y, selectedHero.mp);
      for (const k in reach.dist) { const [x, y] = k.split(',').map(Number); const { sx, sy } = worldToScreen(x, y); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(sx - TILE / 2, sy - TILE / 2, TILE, TILE); }
    }
    ctx.restore();
  }

  function drawObject(o, visible) {
    const { sx, sy } = worldToScreen(o.x, o.y);
    ctx.globalAlpha = visible ? 1 : 0.5;
    let icon = '❓';
    if (o.type === 'town') {
      ctx.beginPath(); ctx.arc(sx, sy, TILE / 2 - 3, 0, Math.PI * 2);
      ctx.fillStyle = o.owner >= 0 ? state.players[o.owner].color : '#888'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.font = (TILE - 10) + 'px serif'; ctx.fillText('🏰', sx, sy + 1);
      ctx.globalAlpha = 1; return;
    }
    if (o.type === 'mine') icon = o.icon || '⛏️';
    else if (o.type === 'treasure') icon = '💰';
    else if (o.type === 'resource') icon = D.RES_INFO[o.resource].emoji;
    else if (o.type === 'pile') icon = D.RES_INFO[o.resource].emoji;
    else if (o.type === 'monster') icon = '👹';
    else if (o.type === 'artifact') icon = '🏆';
    else if (o.type === 'dwelling') icon = '🏚️';
    ctx.font = (TILE - 8) + 'px serif';
    ctx.fillStyle = '#000'; ctx.fillText(icon, sx + 1, sy + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(icon, sx, sy);
    // flaga kopalni
    if (o.type === 'mine' && o.owner >= 0) {
      ctx.beginPath(); ctx.arc(sx + TILE / 2 - 6, sy - TILE / 2 + 6, 6, 0, Math.PI * 2);
      ctx.fillStyle = state.players[o.owner].color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
    }
    // licznik gwardii/potwora
    if ((o.type === 'monster' || (o.guard && o.guard.length)) && o.guard && o.guard.length) {
      ctx.font = '10px system-ui';
      const txt = o.guard.map(s => UNITS[s.key].emoji + s.count).join('');
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(txt, sx, sy + TILE / 2 - 4);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, sx, sy + TILE / 2 - 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawHero(h, p) {
    const { sx, sy } = worldToScreen(h.x, h.y);
    const isMine = me() && me().heroes.includes(h);
    ctx.beginPath(); ctx.arc(sx, sy, TILE / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = isMine ? '#ffe24a' : '#000'; ctx.stroke();
    ctx.font = (TILE - 16) + 'px serif'; ctx.fillStyle = '#fff';
    ctx.fillText(FACTIONS[p.faction].hero, sx, sy + 1);
    // pasek ruchu
    const w = TILE - 8;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w / 2, sy + TILE / 2 - 5, w, 4);
    ctx.fillStyle = '#5fb56a'; ctx.fillRect(sx - w / 2, sy + TILE / 2 - 5, w * clamp(h.mp / D.HERO_BASE_MP, 0, 1), 4);
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
      const dx = (e.clientX - dragState.sx) / TILE, dy = (e.clientY - dragState.sy) / TILE;
      if (Math.abs(e.clientX - dragState.sx) + Math.abs(e.clientY - dragState.sy) > 8) dragState.moved = true;
      cam.x = dragState.cx - dx; cam.y = dragState.cy - dy; drawMap();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!dragState) return; const d = dragState; dragState = null;
      if (!d.moved) { const rect = canvas.getBoundingClientRect(); handleMapTap(e.clientX - rect.left, e.clientY - rect.top); }
    });
  }

  function handleMapTap(sx, sy) {
    if (moving) return;
    const p = me(); if (!p) return;
    const { x, y } = screenToWorld(sx, sy);
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
  function isInteractable(o) { return ['treasure', 'resource', 'pile', 'monster', 'mine', 'town', 'artifact', 'dwelling'].includes(o.type); }
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
      case 'artifact': case 'monster': case 'dwelling': { if (o.guard && o.guard.length) startGuardCombat(hero, o); break; }
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
    if (o.type === 'monster' || o.type === 'dwelling') { def.removeObj = o.id; if (o.reward) def.reward = o.reward; }
    else if (o.type === 'treasure' || o.type === 'resource') { def.removeObj = o.id; }
    else if (o.type === 'artifact') { def.removeObj = o.id; }
    else if (o.type === 'mine') def.mineId = o.id;
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
    resizeCombat();
    const c = state.combat;
    const wrap = $('combatCanvasWrap');
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // dobierz rozmiar heksa tak, by plansza się zmieściła (z marginesem)
    const margin = 10;
    const sizeByW = (w - margin) / (Math.sqrt(3) * (c.cols + 0.5));
    const sizeByH = (h - margin) / (1.5 * (c.rows - 1) + 2);
    const size = Math.max(12, Math.floor(Math.min(sizeByW, sizeByH)));
    combatView.size = size;
    const cs = combatView.size;
    // szerokość/wysokość planszy w px (do wyśrodkowania)
    const boardW = cs * Math.sqrt(3) * (c.cols + 0.5);
    const boardH = cs * (1.5 * (c.rows - 1) + 2);
    combatView.ox = (w - boardW) / 2;
    combatView.oy = (h - boardH) / 2;

    cctx.save(); cctx.scale(DPR, DPR);
    cctx.fillStyle = '#1a1610'; cctx.fillRect(0, 0, w, h);

    // podświetlenie reachable aktywnej jednostki
    const cur = E.currentUnit(state);
    let reach = null;
    if (cur) reach = E.combatReach(state, cur);

    // heksy
    for (let row = 0; row < c.rows; row++) for (let col = 0; col < c.cols; col++) {
      const s = hexScreen(col, row);
      drawHex(s.x, s.y, cs * combatView.zoom, col, row, cur, reach);
    }

    // jednostki
    for (const u of c.units) {
      if (!u.alive) continue;
      const s = hexScreen(u.x, u.y);
      drawUnit(u, s.x, s.y, cs * combatView.zoom);
    }

    cctx.restore();
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
  function afterCombatAct() {
    if (state.phase === 'combat') { renderCombat(); syncOut(); maybeAI(); return; }
    // walka się skończyła
    syncOut();
    if (combatResume) { const r = combatResume; combatResume = null; r(); }
    else renderAll();
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
    for (let tier = 1; tier <= 7; tier++) {
      const u = FACTIONS[p.faction].units[tier - 1];
      if (!t.built['dw' + tier]) html += buildBtn('dw' + tier, `${u.emoji} ${u.name}`, D.DWELLING_COST[tier], p, t);
    }
    html += `</div>`;

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
    $('btnHelp').onclick = () => show('help');
    $('btnHelpClose').onclick = () => hide('help');
    $('btnPassGo').onclick = () => { hide('pass'); renderAll(); };
    $('btnAgain').onclick = () => { hide('winner'); hide('combatLayer'); hide('town'); show('menu'); renderMenu(); state = null; };
    // menu
    $('mNewGame').onclick = () => { hide('menu'); show('setup'); renderMenu(); };
    $('mHotseat').onclick = () => { hide('menu'); show('setup'); renderMenu(); $('setupTitle').textContent = 'Hot-seat (2 graczy na 1 telefonie)'; };
    $('mMulti').onclick = () => { hide('menu'); show('setup'); renderMenu(); $('setupTitle').textContent = 'Multiplayer WiFi'; };
    $('mHelp').onclick = () => show('help');
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
