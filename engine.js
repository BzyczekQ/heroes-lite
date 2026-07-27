/* ============================================================
   HEROES LITE — SILNIK (czysta logika, testowalny w Node)
   Mapa z mgłą wojny, boisko walki na HEKSACH, ekonomia, budowle.
   ============================================================ */
'use strict';

const D = (typeof require === 'function') ? require('./data.js') : window.H3DATA;
const FACTIONS = D.FACTIONS;
const UNITS = D.ALL_UNITS;
const NEUTRALS = D.NEUTRALS;
const SPELLS = D.SPELLS;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, a, b) => Math.floor(r() * (b - a + 1)) + a;
const chance = (r, p) => r() < p;

/* ============================================================
   POMOC HEKSOWA (odd-r offset, pointy-top)
   ============================================================ */
const HEX_EVEN = [[+1, 0], [+0, -1], [-1, -1], [-1, 0], [-1, +1], [+0, +1]];
const HEX_ODD = [[+1, 0], [+1, -1], [+0, -1], [-1, 0], [+0, +1], [+1, +1]];

function hexNeighbors(col, row) {
  const dirs = (row & 1) ? HEX_ODD : HEX_EVEN;
  const out = [];
  for (const [dc, dr] of dirs) out.push([col + dc, row + dr]);
  return out;
}
function offsetToCube(col, row) {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  return [x, -x - z, z];
}
function hexDistance(a, b) {
  const ac = offsetToCube(a.col, a.row), bc = offsetToCube(b.col, b.row);
  return (Math.abs(ac[0] - bc[0]) + Math.abs(ac[1] - bc[1]) + Math.abs(ac[2] - bc[2])) / 2;
}
function hexToPixel(col, row, size) {
  const x = size * Math.sqrt(3) * (col + 0.5 * (row & 1));
  const y = size * 1.5 * row;
  return { x, y };
}
function pixelToHex(px, py, size) {
  // poprawna konwersja odwrotna dla pointy-top odd-r
  const q = (Math.sqrt(3) / 3 * px - 1 / 3 * py) / size;
  const r = (2 / 3 * py) / size;
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const xd = Math.abs(rx - x), yd = Math.abs(ry - y), zd = Math.abs(rz - z);
  if (xd > yd && xd > zd) rx = -ry - rz;
  else if (yd > zd) ry = -rx - rz;
  else rz = -rx - ry;
  const col = rx + (rz - (rz & 1)) / 2;
  const row = rz;
  return { col, row };
}

/* ============================================================
   TEREN MAPY
   ============================================================ */
const T = { GRASS: 0, DIRT: 1, FOREST: 2, WATER: 3, MOUNTAIN: 4, ROAD: 5, SAND: 6, SNOW: 7 };
const TERRAIN = {
  0: { name: 'Trawa', color: '#5aa84a', cost: 100, block: false },
  1: { name: 'Ziemia', color: '#b08a4e', cost: 100, block: false },
  2: { name: 'Las', color: '#2f6e2f', cost: 150, block: false },
  3: { name: 'Woda', color: '#2f6fb0', cost: 99999, block: true },
  4: { name: 'Góry', color: '#9a9a9a', cost: 99999, block: true },
  5: { name: 'Droga', color: '#cdb27e', cost: 75, block: false },
  6: { name: 'Piasek', color: '#d9c48a', cost: 125, block: false },
  7: { name: 'Śnieg', color: '#dde6ee', cost: 125, block: false }
};

/* ============================================================
   NOWA GRA
   ============================================================ */
function newGame(config) {
  // config: { players:[{name,faction,isAI}], size:'S'|'M'|'L', seed }
  const seed = config.seed || Math.floor(Math.random() * 1e9);
  const r = mulberry32(seed);
  const size = D.MAP_SIZES[config.size] || D.MAP_SIZES.S;
  const W = size.w, H = size.h;
  const n = config.players.length;
  const map = generateMap(r, W, H, n);

  const players = config.players.map((meta, i) => {
    const fac = FACTIONS[meta.faction] || FACTIONS.castle;
    const town = map.towns[i];
    const hero = {
      id: 'h' + i, name: heroName(i, r), x: town.x, y: town.y, mp: D.HERO_BASE_MP,
      atk: 2 + ri(r, 0, 2), def: 2 + ri(r, 0, 2), level: 1, xp: 0, mana: 10, maxMana: 20,
      army: [{ key: fac.units[0].key, count: 20 }, { key: fac.units[1].key, count: 5 }],
      faction: meta.faction, alive: true, hasMoved: false
    };
    return {
      idx: i, name: meta.name || ('Gracz ' + (i + 1)), color: D.PLAYER_COLORS[i % D.PLAYER_COLORS.length],
      faction: meta.faction, isAI: !!meta.isAI, alive: true,
      resources: JSON.parse(JSON.stringify(D.STARTING_RESOURCES)),
      heroes: [hero], townIds: [town.id]
    };
  });

  const state = {
    seed, players, map, W, H,
    turn: 0, day: 1, week: 1,
    phase: 'map', combat: null, winner: null, selectedHeroId: null
  };

  // mgła wojny
  initFog(state);
  // dochód / przyrost pierwszego dnia
  startPlayerDay(state, 0);
  state.selectedHeroId = players[0].heroes[0].id;
  return state;
}

function heroName(i, r) {
  const names = ['Lord Haart', 'Orrin', 'Valeska', 'Sandro', 'Tamika', 'Nimbus', 'Galthran', 'Crag Hack'];
  return names[i % names.length];
}

/* ============================================================
   GENERACJA MAPY
   ============================================================ */
function generateMap(r, W, H, n) {
  const tiles = [];
  for (let y = 0; y < H; y++) { const row = []; for (let x = 0; x < W; x++) row.push(ri(r, 0, 1) ? T.GRASS : T.DIRT); tiles.push(row); }

  // strefy biómów
  const biomes = [
    { t: T.FOREST, blobs: Math.floor(W * H / 60) },
    { t: T.SAND, blobs: Math.floor(W * H / 100) },
    { t: T.SNOW, blobs: Math.floor(W * H / 120) }
  ];
  biomes.forEach(b => {
    for (let k = 0; k < b.blobs; k++) {
      const cx = ri(r, 0, W - 1), cy = ri(r, 0, H - 1), rad = ri(r, 1, 3);
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const x = cx + dx, y = cy + dy;
        if (inB(x, y, W, H) && (dx * dx + dy * dy) <= rad * rad && chance(r, 0.7)) tiles[y][x] = b.t;
      }
    }
  });
  // jeziora
  for (let k = 0; k < Math.floor(W * H / 200); k++) {
    const cx = ri(r, 2, W - 3), cy = ri(r, 2, H - 3), rad = ri(r, 1, 2);
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx, y = cy + dy;
      if (inB(x, y, W, H) && (dx * dx + dy * dy) <= rad * rad + 1) tiles[y][x] = T.WATER;
    }
  }
  // pasma gór
  for (let k = 0; k < Math.floor(W / 6); k++) {
    let x = ri(r, 2, W - 3);
    for (let y = 0; y < H; y++) { x = clamp(x + ri(r, -1, 1), 1, W - 2); if (chance(r, 0.6)) tiles[y][x] = T.MOUNTAIN; }
  }

  // pozycje startowe (rogi)
  const corners = [
    { x: Math.floor(W * 0.12), y: Math.floor(H * 0.85) },
    { x: Math.floor(W * 0.88), y: Math.floor(H * 0.15) },
    { x: Math.floor(W * 0.12), y: Math.floor(H * 0.15) },
    { x: Math.floor(W * 0.88), y: Math.floor(H * 0.85) },
    { x: Math.floor(W * 0.5), y: Math.floor(H * 0.15) },
    { x: Math.floor(W * 0.5), y: Math.floor(H * 0.85) }
  ].slice(0, n);

  // drogi między startami
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) drawRoad(tiles, corners[i], corners[j], W, H);

  const objects = {};
  let oid = 0;
  const add = o => { o.id = 'o' + (oid++); objects[o.id] = o; return o; };

  // miasta startowe
  const towns = [];
  corners.forEach((p, i) => {
    clearArea(tiles, p.x, p.y, W, H);
    const t = add({ type: 'town', x: p.x, y: p.y, owner: i, name: 'Miasto ' + (i + 1),
      faction: null, garrison: [], avail: {}, built: {}, builtThisDay: false, hall: 0, fort: false });
    towns.push(t);
  });

  const used = new Set(towns.map(t => t.x + ',' + t.y));

  // kopalnie surowców (każdego z 7 typów) wokół startów + rozsiane
  const mineDefs = [
    { type: 'mine', sub: 'gold', out: { gold: 1000 }, icon: '⛏️', label: 'Kopalnia złota' },
    { type: 'mine', sub: 'wood', out: { wood: 2 }, icon: '🪓', label: 'Tartak' },
    { type: 'mine', sub: 'ore', out: { ore: 2 }, icon: '🪨', label: 'Kopalnia rudy' },
    { type: 'mine', sub: 'mercury', out: { mercury: 1 }, icon: '🔷', label: 'Złoże rtęci' },
    { type: 'mine', sub: 'sulfur', out: { sulfur: 1 }, icon: '🟡', label: 'Złoże siarki' },
    { type: 'mine', sub: 'crystal', out: { crystal: 1 }, icon: '🔴', label: 'Złoże kryształu' },
    { type: 'mine', sub: 'gems', out: { gems: 1 }, icon: '💎', label: 'Złoże klejnotów' }
  ];
  // po 1 z każdego typu przy starcie
  corners.forEach(p => {
    mineDefs.forEach(m => {
      const s = nearFree(tiles, used, p.x, p.y, ri(r, 3, 6), W, H, r);
      if (s) { clearArea(tiles, s.x, s.y, W, H); add(Object.assign({}, m, { x: s.x, y: s.y, owner: -1, guard: neutralGuard(r, 2) })); used.add(s.x + ',' + s.y); }
    });
  });
  // dodatkowe rozsiane kopalnie
  for (let k = 0; k < n * 2; k++) {
    const m = mineDefs[ri(r, 0, mineDefs.length - 1)];
    const s = nearFree(tiles, used, ri(r, 2, W - 3), ri(r, 2, H - 3), 2, W, H, r);
    if (s) { clearArea(tiles, s.x, s.y, W, H); add(Object.assign({}, m, { x: s.x, y: s.y, owner: -1, guard: neutralGuard(r, ri(r, 2, 3)) })); used.add(s.x + ',' + s.y); }
  }

  // skarby, stosy, potwory, artefakty
  const scatter = Math.floor(W * H / 6);
  for (let k = 0; k < scatter; k++) {
    const x = ri(r, 1, W - 2), y = ri(r, 1, H - 2);
    const key = x + ',' + y;
    if (used.has(key)) continue;
    const tt = tiles[y][x];
    if (tt === T.WATER || tt === T.MOUNTAIN) continue;
    used.add(key);
    const roll = r();
    if (roll < 0.35) add({ type: 'treasure', x, y, gold: ri(r, 5, 20) * 100, guard: r() < 0.5 ? neutralGuard(r, 1) : null });
    else if (roll < 0.5) { const res = D.RESOURCES[ri(r, 1, 6)]; add({ type: 'pile', x, y, resource: res, amount: ri(r, 3, 8) }); }
    else if (roll < 0.62) add({ type: 'resource', x, y, resource: 'gold', amount: ri(r, 3, 8) * 100 });
    else if (roll < 0.72) { const str = ri(r, 1, 4); add({ type: 'monster', x, y, guard: neutralGuard(r, str), reward: str * ri(r, 2, 5) * 100 }); }
    else if (roll < 0.78) { const str = ri(r, 2, 4); add({ type: 'artifact', x, y, guard: neutralGuard(r, str), bonus: artifactBonus(r) }); }
    else { const str = ri(r, 1, 3); add({ type: 'dwelling', x, y, unitKey: NEUTRALS[ri(r, 0, NEUTRALS.length - 1)].key, guard: neutralGuard(r, str) }); }
  }

  return { tiles, objects, towns };
}

function artifactBonus(r) {
  const types = [
    { stat: 'atk', amount: 1, name: 'Miecze (+1 atak)' },
    { stat: 'def', amount: 1, name: 'Tarcza (+1 obrona)' },
    { stat: 'atk', amount: 3, name: 'Topór (+3 atak)' },
    { stat: 'def', amount: 3, name: 'Zbroja (+3 obrona)' },
    { stat: 'mana', amount: 5, name: 'Kryształ (+5 many)' }
  ];
  return types[ri(r, 0, types.length - 1)];
}

function neutralGuard(r, strength) {
  // silniejszy strażnik = silniejszy potwór i więcej sztuk
  const maxIdx = clamp(strength, 1, NEUTRALS.length) - 1;
  const u = NEUTRALS[ri(r, 0, maxIdx)];
  const count = ri(r, 4, 8) * strength;
  return [{ key: u.key, count }];
}

function drawRoad(tiles, a, b, W, H) {
  let x = a.x, y = a.y;
  let safety = 0;
  while ((x !== b.x || y !== b.y) && safety++ < W * H) {
    if (x !== b.x && (y === b.y || chance(mulberry32((x * 31 + y * 17 + safety) & 0xffff), 0.55))) x += Math.sign(b.x - x);
    else if (y !== b.y) y += Math.sign(b.y - y);
    if (inB(x, y, W, H) && tiles[y][x] !== T.WATER && tiles[y][x] !== T.MOUNTAIN) tiles[y][x] = T.ROAD;
  }
}
function clearArea(tiles, x, y, W, H) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (inB(nx, ny, W, H) && tiles[ny][nx] !== T.GRASS) { if (tiles[ny][nx] === T.WATER || tiles[ny][nx] === T.MOUNTAIN) tiles[ny][nx] = T.DIRT; }
  }
  if (inB(x, y, W, H)) tiles[y][x] = T.GRASS;
}
function nearFree(tiles, used, x, y, rad, W, H, r) {
  for (let t = 0; t < 60; t++) {
    const nx = clamp(x + ri(r, -rad, rad), 1, W - 2), ny = clamp(y + ri(r, -rad, rad), 1, H - 2);
    const key = nx + ',' + ny;
    if (used.has(key)) continue;
    if (tiles[ny][nx] === T.WATER || tiles[ny][nx] === T.MOUNTAIN) continue;
    return { x: nx, y: ny };
  }
  return null;
}
function inB(x, y, W, H) { return x >= 0 && y >= 0 && x < W && y < H; }

/* ============================================================
   MGLA WOJNY
   ============================================================ */
function initFog(state) {
  state.fog = {};
  for (const p of state.players) {
    const exp = [], vis = [];
    for (let y = 0; y < state.H; y++) { exp.push(new Array(state.W).fill(false)); vis.push(new Array(state.W).fill(false)); }
    state.fog[p.idx] = { exp, vis };
    recomputeVision(state, p.idx);
  }
}
function recomputeVision(state, pi) {
  const f = state.fog[pi];
  if (!f) return;
  for (let y = 0; y < state.H; y++) for (let x = 0; x < state.W; x++) f.vis[y][x] = false;
  const p = state.players[pi];
  const R = 4; // promień widzenia
  const reveal = (cx, cy) => {
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!inB(x, y, state.W, state.H)) continue;
      if (dx * dx + dy * dy <= R * R) { f.exp[y][x] = true; f.vis[y][x] = true; }
    }
  };
  p.heroes.forEach(h => { if (h.alive) reveal(h.x, h.y); });
  state.map.towns.forEach(t => { if (t.owner === pi) reveal(t.x, t.y); });
}

/* ============================================================
   PATHFINDING (Dijkstra po kafełkach)
   ============================================================ */
function objectAt(state, x, y) {
  for (const id in state.map.objects) { const o = state.map.objects[id]; if (o.x === x && o.y === y) return o; }
  return null;
}
function townAt(state, x, y) { return state.map.towns.find(t => t.x === x && t.y === y) || null; }
function heroAt(state, x, y) {
  for (const p of state.players) for (const h of p.heroes) if (h.alive && h.x === x && h.y === y) return h;
  return null;
}
function heroPlayer(state, h) { for (const p of state.players) if (p.heroes.includes(h)) return p; return null; }

function tileBlockedFor(state, x, y) {
  if (!inB(x, y, state.W, state.H)) return true;
  if (TERRAIN[state.map.tiles[y][x]].block) return true;
  const o = objectAt(state, x, y);
  if (o && o.type === 'monster') return true;
  return false;
}

function reachable(state, sx, sy, mp) {
  const dist = { [sx + ',' + sy]: 0 };
  const prev = {};
  const open = [{ x: sx, y: sy, d: 0 }];
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift();
    const ck = cur.x + ',' + cur.y;
    if (cur.d > dist[ck]) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (tileBlockedFor(state, nx, ny)) continue;
      const step = TERRAIN[state.map.tiles[ny][nx]].cost;
      const nd = cur.d + step;
      if (nd > mp) continue;
      const nk = nx + ',' + ny;
      if (dist[nk] === undefined || nd < dist[nk]) { dist[nk] = nd; prev[nk] = ck; open.push({ x: nx, y: ny, d: nd }); }
    }
  }
  return { dist, prev };
}
function pathTo(state, sx, sy, tx, ty, mp) {
  if (sx === tx && sy === ty) return [];
  const { dist, prev } = reachable(state, sx, sy, mp);
  if (dist[tx + ',' + ty] === undefined) return null;
  const path = [];
  let k = tx + ',' + ty;
  while (k !== undefined) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); k = prev[k]; }
  return path;
}

/* ============================================================
   WALKA NA HEKSACH
   ============================================================ */
const CB_COLS = 15, CB_ROWS = 11;

// tworzy walkę; attackerArmy/defenderArmy: [{key,count}]
function startCombat(state, atkCtx, defCtx, atkArmy, defArmy) {
  const units = [];
  let uid = 0;
  const place = (side, army, baseCol) => {
    const rows = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10]; // rozkład pionowy
    army.forEach((s, i) => {
      if (s.count <= 0) return;
      const u = UNITS[s.key]; if (!u) return;
      const col = clamp(baseCol + (Math.floor(i / 11)), 0, CB_COLS - 1);
      const row = clamp(rows[i % 11], 0, CB_ROWS - 1);
      units.push({
        id: 'u' + (uid++), side, key: s.key, count: s.count,
        hp: u.hp, x: col, y: row, retaliated: false, shots: u.shots || 0,
        alive: true, buffAtk: 0, buffDef: 0, defended: false
      });
    });
  };
  place(0, atkArmy, 0);
  place(1, defArmy, CB_COLS - 1);

  state.phase = 'combat';
  state.combat = {
    cols: CB_COLS, rows: CB_ROWS, units,
    atk: atkCtx, def: defCtx,
    round: 1, queue: [], qi: 0, current: null, done: false, result: null, log: [],
    spellCast: false // czy bohater rzucił czar w tej rundzie
  };
  buildCombatQueue(state);
  return state.combat;
}

function buildCombatQueue(state) {
  const c = state.combat;
  const living = c.units.filter(u => u.alive);
  living.sort((a, b) => {
    const sa = UNITS[a.key].speed + (a.defended ? 1000 : 0), sb = UNITS[b.key].speed + (b.defended ? 1000 : 0);
    if (sb !== sa) return sb - sa;
    return a.side - b.side;
  });
  c.queue = living.map(u => u.id);
  c.qi = 0;
  for (const u of c.units) u.defended = false;
  advanceToLiving(state);
}
function advanceToLiving(state) {
  const c = state.combat;
  while (c.qi < c.queue.length) {
    const u = unitById(state, c.queue[c.qi]);
    if (u && u.alive) { c.current = u.id; return; }
    c.qi++;
  }
  // nowa runda
  c.round++;
  for (const u of c.units) { u.retaliated = false; }
  c.spellCast = false;
  buildCombatQueue(state);
}
function unitById(state, id) { return state.combat.units.find(u => u.id === id) || null; }
function currentUnit(state) { return state.combat ? unitById(state, state.combat.current) : null; }
function combatController(state) {
  const u = currentUnit(state);
  if (!u) return -1;
  return u.side === 0 ? state.combat.atk.player : state.combat.def.player;
}

function unitPos(u) { return { col: u.x, row: u.y }; }

// zasięg ruchu jednostki po heksach
function combatReach(state, unit) {
  const c = state.combat;
  const range = UNITS[unit.key].speed;
  const blocked = new Set();
  for (const u of c.units) if (u.alive) blocked.add(u.x + ',' + u.y);
  const dist = { [unit.x + ',' + unit.y]: 0 };
  const prev = {};
  const flying = UNITS[unit.key].flying;
  const start = { col: unit.x, row: unit.y, d: 0 };
  // BFS (każdy heks = 1)
  const open = [start];
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift();
    if (cur.d > dist[cur.col + ',' + cur.row]) continue;
    for (const [nc, nr] of hexNeighbors(cur.col, cur.row)) {
      if (nc < 0 || nr < 0 || nc >= c.cols || nr >= c.rows) continue;
      const k = nc + ',' + nr;
      if (!flying && blocked.has(k) && !(nc === unit.x && nr === unit.y)) continue;
      const nd = cur.d + 1;
      if (nd > range) continue;
      if (dist[k] === undefined || nd < dist[k]) { dist[k] = nd; prev[k] = cur.col + ',' + cur.row; open.push({ col: nc, row: nr, d: nd }); }
    }
  }
  delete dist[unit.x + ',' + unit.y];
  return { dist, prev };
}

function adjacentHex(a, b) { return hexDistance({ col: a.x, row: a.y }, { col: b.x, row: b.y }) === 1; }

function heroBonus(state, side) {
  const pi = side === 0 ? state.combat.atk.player : state.combat.def.player;
  const p = state.players[pi];
  if (!p) return { atk: 0, def: 0 };
  // użyj pierwszego żywego bohatera gracza
  const h = p.heroes.find(h => h.alive);
  return { atk: h ? h.atk : 0, def: h ? h.def : 0 };
}

function calcDamage(state, attacker, defender) {
  const ua = UNITS[attacker.key], ud = UNITS[defender.key];
  const hb = heroBonus(state, attacker.side);
  let base = ri(mulberry32((Date.now() & 0xffff) ^ (attacker.x * 7 + attacker.y * 13 + 1)), ua.dmg[0], ua.dmg[1]);
  if (attacker.buffAtk) base += attacker.buffAtk; // uproszczenie: buff jako +dmg
  let dmg = base * attacker.count;
  const A = ua.atk + hb.atk, D = ud.def + (defender.defended ? Math.floor(ud.def * 0.2) : 0);
  if (A > D) dmg *= 1 + Math.min(3, 0.05 * (A - D));
  else if (D > A) dmg *= Math.max(0.3, 1 - 0.025 * (D - A));
  if (attacker.defended) dmg = Math.floor(dmg * 0.85);
  return Math.max(1, Math.round(dmg));
}

function applyDamage(unit, damage) {
  const ud = UNITS[unit.key];
  let total = (unit.count - 1) * ud.hp + unit.hp - damage;
  if (total <= 0) { unit.count = 0; unit.hp = 0; unit.alive = false; return; }
  unit.count = Math.ceil(total / ud.hp);
  unit.hp = total - (unit.count - 1) * ud.hp;
}

function execMelee(state, atkId, defId) {
  const c = state.combat;
  const atk = unitById(state, atkId), def = unitById(state, defId);
  if (!atk || !def || !atk.alive || !def.alive) { afterCombatAction(state); return; }
  const dmg = calcDamage(state, atk, def);
  const before = def.count;
  applyDamage(def, dmg);
  const killed = before - def.count;
  c.log.push(`${UNITS[atk.key].emoji}${UNITS[atk.key].name} x${atk.count} → ${UNITS[def.key].name}: ${dmg} obr.${killed ? ` (−${killed})` : ''}`);
  // odwzajemnienie
  if (def.alive && def.count > 0 && adjacentHex(atk, def) && !def.retaliated) {
    def.retaliated = true;
    const rDmg = calcDamage(state, def, atk);
    const b2 = atk.count;
    applyDamage(atk, rDmg);
    c.log.push(`↩️ odwzajemnienie: ${rDmg} obr. (−${b2 - atk.count})`);
  }
  afterCombatAction(state);
}

function execShoot(state, atkId, defId) {
  const c = state.combat;
  const atk = unitById(state, atkId), def = unitById(state, defId);
  if (!atk || !def || !atk.alive || !def.alive) { afterCombatAction(state); return; }
  if (atk.shots <= 0) { c.log.push('Brak strzałów!'); afterCombatAction(state); return; }
  let dmg = calcDamage(state, atk, def);
  const dist = hexDistance(unitPos(atk), unitPos(def));
  if (dist > 8) dmg = Math.floor(dmg / 2); // kara za dystans (jak w H3)
  const before = def.count;
  applyDamage(def, dmg);
  atk.shots--;
  c.log.push(`🏹 ${UNITS[atk.key].name} x${atk.count} strzela → ${UNITS[def.key].name}: ${dmg} obr. (−${before - def.count})`);
  afterCombatAction(state);
}

function moveUnit(state, uid, col, row) {
  const u = unitById(state, uid);
  if (u) { u.x = col; u.y = row; }
  afterCombatAction(state);
}
function defendUnit(state, uid) {
  const u = unitById(state, uid);
  if (u) { u.defended = true; u.buffDef = Math.ceil(UNITS[u.key].def * 0.2); }
  afterCombatAction(state);
}
function waitUnit(state) { afterCombatAction(state); } // czekaj (przesuwa na koniec kolejki w tej rundzie)

function castSpell(state, spellKey, targetId) {
  const c = state.combat;
  if (c.spellCast) return false;
  const sp = SPELLS[spellKey];
  if (!sp) return false;
  const caster = state.players[c.atk.player];
  const h = caster.heroes.find(h => h.alive);
  if (!h || h.mana < sp.mana) { c.log.push('Za mało many!'); return false; }
  h.mana -= sp.mana;
  c.spellCast = true;
  const tgt = unitById(state, targetId);
  if (sp.effect === 'damage' && tgt) {
    const dmg = ri(mulberry32(Date.now() & 0xffff), sp.dmg[0], sp.dmg[1]);
    const before = tgt.count;
    applyDamage(tgt, dmg);
    c.log.push(`✨ ${sp.name}: ${dmg} obr. (−${before - tgt.count})`);
  } else if (sp.effect === 'heal' && tgt) {
    const heal = ri(mulberry32(Date.now() & 0xffff), sp.heal[0], sp.heal[1]);
    const ud = UNITS[tgt.key];
    tgt.hp = Math.min(ud.hp, tgt.hp + heal);
    c.log.push(`✨ ${sp.name}: +${heal} HP`);
  } else if (sp.effect === 'buff' && tgt) {
    tgt.buffAtk = (tgt.buffAtk || 0) + sp.amount;
    c.log.push(`✨ ${sp.name} na ${UNITS[tgt.key].name}`);
  }
  return true;
}

function afterCombatAction(state) {
  const c = state.combat;
  const a0 = c.units.some(u => u.alive && u.side === 0);
  const a1 = c.units.some(u => u.alive && u.side === 1);
  if (!a0 || !a1) { finishCombat(state); return; }
  c.qi++;
  advanceToLiving(state);
}

function finishCombat(state) {
  const c = state.combat;
  const s0 = c.units.filter(u => u.alive && u.side === 0).map(u => ({ key: u.key, count: u.count }));
  const s1 = c.units.filter(u => u.alive && u.side === 1).map(u => ({ key: u.key, count: u.count }));
  const attackerWon = s0.length > 0 && s1.length === 0;
  c.result = { s0, s1, attackerWon, mutual: s0.length === 0 && s1.length === 0 };
  c.done = true;
  applyCombatResult(state);
  state.phase = 'map';
  state.combat = null;
  checkWinner(state);
}

function applyCombatResult(state) {
  if (!state.combat) return; // ucieczka czyści combat wcześniej
  const c = state.combat;
  const res = c.result;
  const atk = c.atk, def = c.def;

  // atakujący-bohater
  if (atk.heroId !== undefined) {
    const h = heroById(state, atk.heroId);
    if (h) {
      addXP(h, res.attackerWon ? 100 : 30);
      if (res.s0.length === 0) { h.alive = false; }
      else h.army = res.s0;
    }
  }
  // usunięcie obiektu (skarb/potwór/artefakt)
  if (def.removeObj && res.s1.length === 0) {
    const obj = state.map.objects[def.removeObj];
    if (obj) {
      const player = state.players[atk.player];
      if (res.attackerWon) {
        if (obj.type === 'treasure' || obj.type === 'resource') { player.resources.gold += (obj.gold || obj.amount); }
        else if (obj.type === 'monster' && def.reward) { player.resources.gold += def.reward; }
        else if (obj.type === 'artifact') { applyArtifact(heroById(state, atk.heroId), obj.bonus); }
        else if (obj.type === 'dwelling') { /* flagowane siedlisko — dodaj jednostki */ }
      }
      delete state.map.objects[def.removeObj];
    }
  }
  // kopalnia
  if (def.mineId && res.attackerWon) {
    const m = state.map.objects[def.mineId];
    if (m) { m.owner = atk.player; delete m.guard; }
  }
  // miasto
  if (def.townId !== undefined && res.attackerWon) {
    const t = townById(state, def.townId);
    if (t) { t.owner = atk.player; t.garrison = []; if (!state.players[atk.player].townIds.includes(t.id)) state.players[atk.player].townIds.push(t.id); }
    if (def.heroId) { const dh = heroById(state, def.heroId); if (dh) dh.alive = false; }
    const oldOwner = state.players.find(p => p.townIds.includes(def.townId));
    if (oldOwner) oldOwner.townIds = oldOwner.townIds.filter(id => id !== def.townId);
  }
  // pojedynek bohaterów
  if (def.heroId !== undefined && def.townId === undefined) {
    const dh = heroById(state, def.heroId);
    if (dh && res.attackerWon) dh.alive = false;
  }
  recomputeVision(state, atk.player);
}

function heroById(state, hid) { for (const p of state.players) for (const h of p.heroes) if (h.id === hid) return h; return null; }
function townById(state, tid) { return state.map.towns.find(t => t.id === tid) || null; }
function addXP(h, xp) { h.xp += xp; while (h.xp >= h.level * 500) { h.xp -= h.level * 500; h.level++; h.atk++; h.def++; h.maxMana += 5; } }
function applyArtifact(h, bonus) { if (!h || !bonus) return; if (bonus.stat === 'atk') h.atk += bonus.amount; else if (bonus.stat === 'def') h.def += bonus.amount; else if (bonus.stat === 'mana') h.maxMana += bonus.amount; }

/* ============================================================
   AI BOJOWE (neutralni + frakcje)
   ============================================================ */
function aiCombatTurn(state) {
  const c = state.combat;
  const u = currentUnit(state);
  if (!u) return null;
  const enemies = c.units.filter(e => e.alive && e.side !== u.side);
  if (enemies.length === 0) { afterCombatAction(state); return null; }

  // strzelec: strzelaj w najsłabszego
  const ud = UNITS[u.key];
  if (ud.ranged && u.shots > 0) {
    const tgt = weakest(enemies);
    execShoot(state, u.id, tgt.id);
    return 'shoot';
  }
  // dojdź i zaatakuj
  const reach = combatReach(state, u);
  let best = null;
  // czy stoimy obok kogoś?
  const alreadyAdj = enemies.find(e => adjacentHex(u, e));
  if (alreadyAdj) { execMelee(state, u.id, alreadyAdj.id); return 'attack'; }
  for (const e of enemies) {
    for (const [nc, nr] of hexNeighbors(e.x, e.y)) {
      const k = nc + ',' + nr;
      if (reach.dist[k] !== undefined) {
        const cost = reach.dist[k];
        if (!best || cost < best.cost) best = { id: e.id, col: nc, row: nr, cost };
      }
    }
  }
  if (best) {
    if (!(best.col === u.x && best.row === u.y)) moveUnit(state, u.id, best.col, best.row);
    execMelee(state, u.id, best.id);
    return 'attack';
  }
  // podejdź bliżej najbliższego wroga
  const tgt = nearest(u, enemies);
  let step = null, bestDist = Infinity;
  for (const k in reach.dist) {
    const [c2, r2] = k.split(',').map(Number);
    const dd = hexDistance({ col: c2, row: r2 }, { col: tgt.x, row: tgt.y });
    if (dd < bestDist) { bestDist = dd; step = { c: c2, r: r2 }; }
  }
  if (step) { moveUnit(state, u.id, step.c, step.r); return 'move'; }
  afterCombatAction(state);
  return 'wait';
}
function weakest(units) { let b = units[0], bh = Infinity; for (const u of units) { const pool = (u.count - 1) * UNITS[u.key].hp + u.hp; if (pool < bh) { bh = pool; b = u; } } return b; }
function nearest(u, enemies) { let b = enemies[0], bd = Infinity; for (const e of enemies) { const d = hexDistance({ col: u.x, row: u.y }, { col: e.x, row: e.y }); if (d < bd) { bd = d; b = e; } } return b; }

/* ============================================================
   TURA / EKONOMIA / BUDOWLE
   ============================================================ */
function controllerOf(state) { return state.phase === 'combat' ? combatController(state) : state.turn; }

function startPlayerDay(state, pi) {
  const p = state.players[pi];
  if (!p.alive) return;
  // dochód z miast (poziom ratusza)
  for (const tid of p.townIds) {
    const t = townById(state, tid);
    if (t) p.resources.gold += D.HALL_LEVELS[t.hall].income;
  }
  // dochód z kopalni
  for (const id in state.map.objects) {
    const o = state.map.objects[id];
    if (o.type === 'mine' && o.owner === pi && o.out) {
      for (const k in o.out) p.resources[k] = (p.resources[k] || 0) + o.out[k];
    }
  }
  // reset ruchu bohaterów
  for (const h of p.heroes) if (h.alive) { h.mp = D.HERO_BASE_MP; h.hasMoved = false; }
  // przyrost jednostek co tydzień (co 7 dni)
  if (state.day > 1 && (state.day - 1) % 7 === 0) {
    for (const tid of p.townIds) {
      const t = townById(state, tid);
      if (t && t.built) for (let tier = 1; tier <= 7; tier++) {
        const key = 'dw' + tier;
        if (t.built[key]) {
          const u = factionUnit(p.faction, tier);
          if (u) t.avail[u.key] = (t.avail[u.key] || 0) + u.growth;
        }
      }
    }
  }
  // reset budowy
  for (const tid of p.townIds) { const t = townById(state, tid); if (t) t.builtThisDay = false; }
}

function factionUnit(faction, tier) { const f = FACTIONS[faction]; if (!f) return null; return f.units[tier - 1]; }

function endTurn(state) {
  if (state.phase === 'combat') return;
  let next = state.turn;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (state.players[next].alive) break;
  }
  if (next <= state.turn) state.day++;
  state.turn = next;
  startPlayerDay(state, next);
  recomputeVision(state, next);
  // wybierz pierwszego żywego bohatera
  const h = state.players[next].heroes.find(h => h.alive);
  state.selectedHeroId = h ? h.id : null;
  checkWinner(state);
}

function checkWinner(state) {
  for (const p of state.players) {
    const hasHero = p.heroes.some(h => h.alive);
    const hasTown = p.townIds.length > 0;
    if (p.alive && !hasHero && !hasTown) p.alive = false;
    // 7 dni bez miasta = eliminacja (uproszczone)
  }
  const alive = state.players.filter(p => p.alive);
  if (alive.length <= 1) state.winner = alive.length === 1 ? alive[0].idx : -1;
}

/* ============================================================
   BUDOWLE W MIEŚCIE
   ============================================================ */
function canAfford(p, cost) { for (const k in cost) if ((p.resources[k] || 0) < cost[k]) return false; return true; }
function payCost(p, cost) { for (const k in cost) p.resources[k] -= cost[k]; }

function buildInTown(state, townId, what) {
  const t = townById(state, townId);
  if (!t) return false;
  const p = state.players[t.owner];
  if (t.builtThisDay) return false;
  let cost = null;
  if (what === 'hall') {
    if (t.hall >= D.HALL_LEVELS.length - 1) return false;
    cost = D.HALL_UPGRADE_COST;
  } else if (what === 'fort') {
    if (t.fort) return false; cost = { gold: 1000, ore: 5 };
  } else if (what && what.startsWith('dw')) {
    const tier = +what.slice(2);
    if (t.built[what]) return false;
    cost = D.DWELLING_COST[tier];
  } else return false;
  if (!canAfford(p, cost)) return false;
  payCost(p, cost);
  if (what === 'hall') t.hall++;
  else if (what === 'fort') t.fort = true;
  else { t.built[what] = true; const u = factionUnit(p.faction, +what.slice(2)); if (u) t.avail[u.key] = (t.avail[u.key] || 0) + u.growth; }
  t.builtThisDay = true;
  return true;
}

function recruit(state, townId, unitKey, count) {
  const t = townById(state, townId);
  if (!t) return 0;
  const p = state.players[t.owner];
  const u = UNITS[unitKey];
  if (!u) return 0;
  const avail = t.avail[unitKey] || 0;
  count = Math.min(count, avail);
  if (count <= 0) return 0;
  const cost = {};
  for (const k in u.cost) cost[k] = u.cost[k] * count;
  if (!canAfford(p, cost)) {
    // kup tyle ile stać
    let maxAff = count;
    while (maxAff > 0 && !canAfford(p, multCost(u.cost, maxAff))) maxAff--;
    if (maxAff <= 0) return 0;
    count = maxAff;
    for (const k in u.cost) cost[k] = u.cost[k] * count;
  }
  payCost(p, cost);
  t.avail[unitKey] -= count;
  addStack(t.garrison, unitKey, count);
  return count;
}
function multCost(cost, n) { const o = {}; for (const k in cost) o[k] = cost[k] * n; return o; }
function addStack(army, key, count) { const ex = army.find(s => s.key === key); if (ex) ex.count += count; else army.push({ key, count }); }
function moveStack(from, fromIdx, to) {
  if (!from[fromIdx]) return;
  const s = from[fromIdx];
  const ex = to.find(x => x.key === s.key);
  if (ex) ex.count += s.count; else to.push({ key: s.key, count: s.count });
  from.splice(fromIdx, 1);
}

/* ============================================================
   EKSPORT
   ============================================================ */
const Engine = {
  T, TERRAIN, hexNeighbors, hexDistance, hexToPixel, pixelToHex,
  newGame, generateMap, initFog, recomputeVision,
  reachable, pathTo, objectAt, townAt, heroAt, heroById, townById,
  startCombat, currentUnit, combatReach, combatController,
  execMelee, execShoot, moveUnit, defendUnit, waitUnit, castSpell, aiCombatTurn,
  finishCombat, controllerOf, startPlayerDay, endTurn, checkWinner,
  buildInTown, recruit, moveStack, addXP,
  D
};
if (typeof module !== 'undefined') module.exports = Engine;
if (typeof window !== 'undefined') window.H3ENGINE = Engine;
