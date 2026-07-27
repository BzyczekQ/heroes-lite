/* =========================================================================
   HEROES LITE — lekka gra w stylu HoMM3 (HTML5/JS)
   Część 1: czysta logika gry (bez DOM) — można testować w Node.
   Część 2: warstwa renderu / wejścia (DOM/Canvas).
   Część 3: sieć (multiplayer po WiFi) + hot-seat.
   ========================================================================= */
'use strict';

/* ----------------------------- DANE GRY ------------------------------- */

const TILE = 44;                 // px wielkość kafelka na mapie
const MAP_W = 22, MAP_H = 16;

const T = { GRASS: 0, DIRT: 1, FOREST: 2, WATER: 3, MOUNTAIN: 4, ROAD: 5 };
const TERRAIN = {
  0: { name: 'Trawa',  color: '#4f9a3f', cost: 100, blocked: false },
  1: { name: 'Ziemia', color: '#b08a4e', cost: 100, blocked: false },
  2: { name: 'Las',    color: '#2c6e2f', cost: 175, blocked: false },
  3: { name: 'Woda',   color: '#2f6fb0', cost: 99999, blocked: true },
  4: { name: 'Góry',   color: '#8a8a8a', cost: 99999, blocked: true },
  5: { name: 'Droga',  color: '#c9b07a', cost: 70,  blocked: false }
};

const RES = ['gold', 'wood', 'ore', 'gems'];

// Jednostki (frakcja „Zamek" w stylu HoMM3)
const UNITS = {
  peasant: { name: 'Chłop',   atk: 1,  def: 1,  dmg: [1, 1],   hp: 3,   speed: 3, cost: { gold: 15 },            ranged: false, flying: false, growth: 14, tier: 1, emoji: '🧑‍🌾' },
  archer:  { name: 'Łucznik', atk: 6,  def: 3,  dmg: [2, 3],   hp: 10,  speed: 5, cost: { gold: 100, wood: 1 },  ranged: true,  shots: 12, flying: false, growth: 9, tier: 2, emoji: '🏹' },
  griffin: { name: 'Gryf',    atk: 8,  def: 8,  dmg: [3, 6],   hp: 25,  speed: 6, cost: { gold: 240 },           ranged: false, flying: true,  growth: 4, tier: 3, emoji: '🦅' },
  knight:  { name: 'Rycerz',  atk: 10, def: 12, dmg: [5, 10],  hp: 35,  speed: 5, cost: { gold: 300 },           ranged: false, flying: false, growth: 3, tier: 4, emoji: '🛡️' },
  angel:   { name: 'Anioł',   atk: 20, def: 20, dmg: [40, 50], hp: 160, speed: 9, cost: { gold: 800, gems: 1 },  ranged: false, flying: true,  growth: 1, tier: 5, emoji: '😇' }
};
const UNIT_ORDER = ['peasant', 'archer', 'griffin', 'knight', 'angel'];

const PLAYER_COLORS = ['#3a7be0', '#e0524a', '#43b85a', '#b85ad0'];
const PLAYER_NAMES_FALLBACK = ['Niebieski', 'Czerwony', 'Zielony', 'Fioletowy'];

const HERO_MP = 1500;

/* ----------------------------- RNG ----------------------------------- */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (r, a, b) => Math.floor(r() * (b - a + 1)) + a;
const chance = (r, p) => r() < p;

/* ----------------------------- NOWA GRA ------------------------------ */

function newGame(playerMetas, seed) {
  // playerMetas: [{name?}, ...]  (liczba graczy = długość)
  const r = mulberry32(seed || 12345);
  const n = playerMetas.length;
  const map = generateMap(r, n);

  const players = [];
  for (let i = 0; i < n; i++) {
    const town = map.towns[i];
    players.push({
      idx: i,
      name: playerMetas[i].name || PLAYER_NAMES_FALLBACK[i],
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      alive: true,
      resources: { gold: 3000, wood: 5, ore: 5, gems: 2 },
      hero: {
        x: town.x, y: town.y, mp: HERO_MP, atk: 2, def: 2,
        army: [{ type: 'peasant', count: 12 }, { type: 'archer', count: 4 }],
        alive: true
      },
      townId: town.id
    });
  }

  return {
    seed: seed || 12345,
    players,
    map,
    turn: 0,           // indeks gracza który ma turę (faza mapy)
    day: 1,            // dzień globalny
    week: 1,
    phase: 'map',      // 'map' | 'combat'
    combat: null,
    townOpen: null,
    winner: null
  };
}

/* ----------------------------- GENERACJA MAPY ------------------------ */

function makeTiles() {
  const tiles = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push(T.GRASS);
    tiles.push(row);
  }
  return tiles;
}

function townPositions(n) {
  // rogi mapy
  const list = [
    { x: 3, y: MAP_H - 4 },
    { x: MAP_W - 4, y: 3 }
  ];
  if (n >= 3) list.push({ x: 3, y: 3 });
  if (n >= 4) list.push({ x: MAP_W - 4, y: MAP_H - 4 });
  return list.slice(0, n);
}

function generateMap(r, n) {
  const tiles = makeTiles();

  // skupiska lasu
  for (let k = 0; k < 55; k++) {
    const cx = rnd(r, 0, MAP_W - 1), cy = rnd(r, 0, MAP_H - 1);
    const rad = rnd(r, 0, 2);
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx, y = cy + dy;
      if (inBounds(x, y) && chance(r, 0.6)) tiles[y][x] = T.FOREST;
    }
  }
  // jezioro
  const lx = rnd(r, 5, MAP_W - 6), ly = rnd(r, 4, MAP_H - 5);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = lx + dx, y = ly + dy;
    if (inBounds(x, y) && dx * dx + dy * dy <= 6) tiles[y][x] = T.WATER;
  }
  // łańcuch górski
  let mx = rnd(r, 4, MAP_W - 5);
  for (let y = 0; y < MAP_H; y++) {
    mx += rnd(r, -1, 1); mx = clamp(mx, 2, MAP_W - 3);
    if (chance(r, 0.7)) tiles[y][mx] = T.MOUNTAIN;
    if (chance(r, 0.4)) tiles[y][mx + 1] = T.MOUNTAIN;
  }

  const positions = townPositions(n);

  // drogi między miastami
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++)
      drawRoad(tiles, positions[i], positions[j]);

  const objects = {};
  let oid = 0;
  const add = (o) => { o.id = 'o' + (oid++); objects[o.id] = o; return o; };

  // miasta
  const towns = [];
  positions.forEach((p, i) => {
    tiles[p.y][p.x] = T.GRASS;
    const t = add({ type: 'town', x: p.x, y: p.y, owner: i, name: 'Zamek ' + (i + 1), garrison: [], avail: {} });
    towns.push(t);
  });

  const used = new Set(towns.map(t => t.x + ',' + t.y));

  // kopalnie przy każdym mieście
  positions.forEach((p) => {
    const mines = [
      { type: 'mine', subtype: 'gold', icon: '⛏️', output: { gold: 1000 } },
      { type: 'sawmill', icon: '🪓', output: { wood: 3 } },
      { type: 'oremine', icon: '🪨', output: { ore: 3 } },
      { type: 'gem', icon: '💎', output: { gems: 1 } }
    ];
    mines.forEach((m, k) => {
      const spot = nearFree(tiles, used, p.x, p.y, r);
      if (spot) {
        tiles[spot.y][spot.x] = T.GRASS;
        add(Object.assign({}, m, { x: spot.x, y: spot.y, owner: -1, guard: neutralArmy(r, 1 + k) }));
        used.add(spot.x + ',' + spot.y);
      }
    });
  });

  // skarby, stosy surowców, potwory — rozsiane
  const scatterCount = 26;
  for (let k = 0; k < scatterCount; k++) {
    const x = rnd(r, 1, MAP_W - 2), y = rnd(r, 1, MAP_H - 2);
    const key = x + ',' + y;
    if (used.has(key)) continue;
    if (tiles[y][x] === T.WATER || tiles[y][x] === T.MOUNTAIN) continue;
    used.add(key);
    const roll = r();
    if (roll < 0.4) {
      add({ type: 'treasure', x, y, gold: rnd(r, 5, 16) * 100, guard: neutralArmy(r, 2) });
    } else if (roll < 0.6) {
      const which = ['wood', 'ore', 'gems'][rnd(r, 0, 2)];
      add({ type: 'pile', x, y, resource: which, amount: rnd(r, 3, 8) });
    } else {
      add({ type: 'monster', x, y, army: neutralArmy(r, rnd(r, 1, 3)), reward: rnd(r, 4, 12) * 100 });
    }
  }

  return { tiles, objects, towns };
}

function nearFree(tiles, used, x, y, r) {
  for (let tries = 0; tries < 40; tries++) {
    const dx = rnd(r, -4, 4), dy = rnd(r, -4, 4);
    const nx = x + dx, ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const key = nx + ',' + ny;
    if (used.has(key)) continue;
    if (tiles[ny][nx] === T.WATER || tiles[ny][nx] === T.MOUNTAIN) continue;
    return { x: nx, y: ny };
  }
  return null;
}

function drawRoad(tiles, a, b) {
  let x = a.x, y = a.y;
  while (x !== b.x || y !== b.y) {
    if (x !== b.x && (y === b.y || chance(mulberry32((x * 31 + y * 17) & 0xffff), 0.5))) {
      x += Math.sign(b.x - x);
    } else if (y !== b.y) {
      y += Math.sign(b.y - y);
    }
    if (tiles[y][x] !== T.WATER && tiles[y][x] !== T.MOUNTAIN) tiles[y][x] = T.ROAD;
  }
}

function neutralArmy(r, strength) {
  const templates = [
    [[12, 'peasant']],
    [[6, 'archer']],
    [[15, 'peasant'], [4, 'archer']],
    [[3, 'griffin']],
    [[2, 'knight']],
    [[8, 'archer'], [2, 'knight']],
    [[2, 'griffin'], [6, 'archer']],
    [[3, 'knight'], [5, 'archer']],
    [[1, 'angel']]
  ];
  const max = strength >= 3 ? 8 : (strength >= 2 ? 5 : 3);
  const tpl = templates[rnd(r, 0, max)];
  return tpl.map(([c, t]) => ({ type: t, count: c }));
}

function inBounds(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H; }

/* ----------------------------- POMOCNICZE MAPY ----------------------- */

function objectAt(state, x, y) {
  for (const id in state.map.objects) {
    const o = state.map.objects[id];
    if (o.x === x && o.y === y) return o;
  }
  return null;
}

function heroAt(state, x, y) {
  for (const p of state.players) if (p.hero.alive && p.hero.x === x && p.hero.y === y) return p;
  return null;
}

function townAt(state, x, y) {
  for (const t of state.map.towns) if (t.x === x && t.y === y) return t;
  return null;
}

// czy kafelek blokuje ruch bohatera gracza `player`
function tileBlockedFor(state, x, y, player) {
  if (!inBounds(x, y)) return true;
  if (TERRAIN[state.map.tiles[y][x]].blocked) return true;
  // obcy bohater blokuje (atakujemy z sąsiedztwa)
  const h = heroAt(state, x, y);
  if (h && h.idx !== player) return true;
  // potwór blokuje (atakujemy z sąsiedztwa)
  const o = objectAt(state, x, y);
  if (o && o.type === 'monster') return true;
  return false;
}

/* ----------------------------- PATHFINDING (Dijkstra) --------------- */

function reachable(state, sx, sy, mp, player) {
  const dist = {};
  const prev = {};
  const key = (x, y) => x + ',' + y;
  dist[key(sx, sy)] = 0;
  const open = [{ x: sx, y: sy, d: 0 }];
  // proste Dijkstra z tablicą (mapa mała)
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift();
    const ck = key(cur.x, cur.y);
    if (cur.d > dist[ck]) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (tileBlockedFor(state, nx, ny, player)) continue;
      const step = TERRAIN[state.map.tiles[ny][nx]].cost;
      const nd = cur.d + step;
      if (nd > mp) continue;
      const nk = key(nx, ny);
      if (dist[nk] === undefined || nd < dist[nk]) {
        dist[nk] = nd; prev[nk] = ck;
        open.push({ x: nx, y: ny, d: nd });
      }
    }
  }
  return { dist, prev };
}

function reconstructPath(prev, tx, ty) {
  const path = [];
  let k = tx + ',' + ty;
  if (prev[k] === undefined && !(path.length === 0 && false)) {
    // start?
  }
  while (k !== undefined) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ x, y });
    k = prev[k];
  }
  return path;
}

/* ----------------------------- RUCH BOHATERA ------------------------- */

function moveCost(state, x, y) { return TERRAIN[state.map.tiles[y][x]].cost; }

// Zwraca ścieżkę (listę {x,y}) z sx,sy do tx,ty — najkrótszą po `prev`
function pathTo(state, sx, sy, tx, ty, mp, player) {
  if (sx === tx && sy === ty) return [];
  const { prev } = reachable(state, sx, sy, mp, player);
  const targetKey = tx + ',' + ty;
  if (prev[targetKey] === undefined && !(sx === tx && sy === ty)) return null;
  return reconstructPath(prev, tx, ty);
}

/* ----------------------------- WALKA --------------------------------- */

// Tworzy stan walki. attacker/defender: { player, isHero, town?, monsterId?, mineId? }
function startCombat(state, attacker, defender, atkArmy, defArmy) {
  const CW = 11, CH = 9;
  const units = [];
  let uid = 0;
  function place(side, army, fromX, toX) {
    army.forEach((s, i) => {
      if (s.count <= 0) return;
      const u = UNITS[s.type];
      const row = clamp(i, 0, CH - 1);
      const x = fromX + Math.floor(i / CH);
      const y = row;
      units.push({
        id: 'u' + (uid++), side, type: s.type, count: s.count,
        hp: u.hp, maxhp: u.hp, x: clamp(x, 0, CW - 1), y: clamp(y, 0, CH - 1),
        hasRetal: true, shots: u.shots || 0, alive: true
      });
    });
  }
  place(0, atkArmy, 0, 1);
  place(1, defArmy, CW - 1, CW - 2);

  state.phase = 'combat';
  state.combat = {
    CW, CH, units,
    attacker, defender,
    round: 1,
    queue: [],         // kolejka indeksów jednostek w tej rundzie
    qi: 0,             // wskaźnik w kolejce
    selectedId: null,
    done: false,
    result: null,
    log: []
  };
  buildQueue(state);
  // jeśli pierwsza jednostka należy do AI (obrona neutralna) — ruch po krótkim opóźnieniu
}

function buildQueue(state) {
  const c = state.combat;
  const living = c.units.filter(u => u.alive);
  living.sort((a, b) => {
    const sa = UNITS[a.type].speed, sb = UNITS[b.type].speed;
    if (sb !== sa) return sb - sa;
    return a.side - b.side; // atakujący pierwszy przy remisie
  });
  c.queue = living.map(u => u.id);
  c.qi = 0;
  // pomiń martwe na początku
  advanceToLiving(state);
}

function advanceToLiving(state) {
  const c = state.combat;
  while (c.qi < c.queue.length) {
    const u = unitById(state, c.queue[c.qi]);
    if (u && u.alive) { c.selectedId = u.id; return; }
    c.qi++;
  }
  // koniec rundy
  c.round++;
  for (const u of c.units) u.hasRetal = true;
  buildQueue(state);
}

function unitById(state, id) { return state.combat.units.find(u => u.id === id) || null; }
function currentCombatUnit(state) {
  if (!state.combat) return null;
  return unitById(state, state.combat.selectedId);
}
function combatController(state) {
  // kto steruje aktualną jednostką
  const u = currentCombatUnit(state);
  if (!u) return -1;
  return u.side === 0 ? state.combat.attacker.player : state.combat.defender.player;
}

function enemiesOf(state, side) { return state.combat.units.filter(u => u.alive && u.side !== side); }

// BFS zasięgu ruchu jednostki na polu walki
function combatReachable(state, unit) {
  const c = state.combat;
  const range = UNITS[unit.type].speed;
  const blocked = new Set();
  for (const u of c.units) if (u.alive) blocked.add(u.x + ',' + u.y);
  const dist = { [unit.x + ',' + unit.y]: 0 };
  const prev = {};
  const open = [{ x: unit.x, y: unit.y, d: 0 }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift();
    const flying = UNITS[unit.type].flying;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= c.CW || ny >= c.CH) continue;
      if (!flying && blocked.has(nx + ',' + ny)) continue; // latające ignorują jednostki
      const nd = cur.d + (flying ? 1 : 1);
      if (nd > range) continue;
      const k = nx + ',' + ny;
      if (dist[k] === undefined || nd < dist[k]) {
        dist[k] = nd; prev[k] = cur.x + ',' + cur.y;
        open.push({ x: nx, y: ny, d: nd });
      }
    }
  }
  delete dist[unit.x + ',' + unit.y];
  return { dist, prev };
}

function adjacent(a, b) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y);
}

// oblicz obrażenia jednostki atakującej cel
function calcDamage(attacker, defender, atkBonus, defBonus) {
  const ua = UNITS[attacker.type], ud = UNITS[defender.type];
  let base = rnd(mulberry32((Date.now() & 0xffff) ^ (attacker.id.charCodeAt(1) * 7)), ua.dmg[0], ua.dmg[1]);
  let dmg = base * attacker.count;
  const A = ua.atk + atkBonus, D = ud.def + defBonus;
  if (A > D) dmg *= 1 + Math.min(3, 0.05 * (A - D));
  else if (D > A) dmg *= Math.max(0.3, 1 - 0.025 * (D - A));
  return Math.max(1, Math.round(dmg));
}

function applyDamage(state, unit, damage) {
  const ud = UNITS[unit.type];
  // całkowity pulpit HP
  let total = (unit.count - 1) * ud.hp + unit.hp - damage;
  if (total <= 0) { unit.count = 0; unit.hp = 0; unit.alive = false; return; }
  unit.count = Math.ceil(total / ud.hp);
  unit.hp = total - (unit.count - 1) * ud.hp;
}

function execAttack(state, attackerId, targetId) {
  const c = state.combat;
  const atk = unitById(state, attackerId), def = unitById(state, targetId);
  if (!atk || !def) return;
  const atkBonus = sideBonus(state, atk.side);
  const defBonus = sideBonus(state, def.side);
  const dmg = calcDamage(atk, def, atkBonus, defBonus);
  const killed = Math.min(def.count, countKilled(def, dmg));
  applyDamage(state, def, dmg);
  c.log.push(`${UNITS[atk.type].name} x${atk.count} → ${UNITS[def.type].name}: ${dmg} obrażeń${killed > 0 ? ' (' + killed + ' zabitych)' : ''}`);
  // odwzajemnienie (bliskie, cel żyje, jeszcze nie odwzajemniał)
  if (def.alive && def.count > 0 && adjacent(atk, def) && def.hasRetal && !UNITS[atk.type].ranged) {
    def.hasRetal = false;
    const rDmg = calcDamage(def, atk, defBonus, atkBonus);
    applyDamage(state, atk, rDmg);
  }
  afterAction(state);
}

function execShoot(state, attackerId, targetId) {
  const c = state.combat;
  const atk = unitById(state, attackerId), def = unitById(state, targetId);
  if (!atk || !def || atk.shots <= 0) return;
  const atkBonus = sideBonus(state, atk.side), defBonus = sideBonus(state, def.side);
  const dmg = calcDamage(atk, def, atkBonus, defBonus);
  applyDamage(state, def, dmg);
  atk.shots--;
  c.log.push(`🏹 ${UNITS[atk.type].name} x${atk.count} strzela → ${UNITS[def.type].name}: ${dmg} obrażeń`);
  // połowiczne odwzajemnienie przy strzale: brak
  afterAction(state);
}

function sideBonus(state, side) {
  const player = side === 0 ? state.combat.attacker.player : state.combat.defender.player;
  const p = state.players[player];
  return p && p.hero && p.hero.alive ? p.hero.atk : 0; // uproszczenie: bonus ataku/obrony = atk bohatera
}

function countKilled(def, dmg) {
  const ud = UNITS[def.type];
  const total = (def.count - 1) * ud.hp + def.hp;
  const remain = total - dmg;
  if (remain <= 0) return def.count;
  return def.count - Math.ceil(remain / ud.hp);
}

function moveCombatUnit(state, unitId, tx, ty) {
  const c = state.combat;
  const u = unitById(state, unitId);
  if (!u) return;
  u.x = tx; u.y = ty;
  afterAction(state);
}

function afterAction(state) {
  const c = state.combat;
  // koniec walki?
  const side0alive = c.units.some(u => u.alive && u.side === 0);
  const side1alive = c.units.some(u => u.alive && u.side === 1);
  if (!side0alive || !side1alive) {
    finishCombat(state);
    return;
  }
  c.qi++;
  advanceToLiving(state);
}

function finishCombat(state) {
  const c = state.combat;
  const survivors0 = c.units.filter(u => u.alive && u.side === 0).map(u => ({ type: u.type, count: u.count }));
  const survivors1 = c.units.filter(u => u.alive && u.side === 1).map(u => ({ type: u.type, count: u.count }));
  const attackerWon = survivors0.length > 0 && survivors1.length === 0;
  c.done = true;
  c.result = { survivors0, survivors1, attackerWon, defenderWon: !attackerWon && survivors1.length > 0 && survivors0.length === 0, mutual: survivors0.length === 0 && survivors1.length === 0 };

  applyCombatResult(state);
  state.phase = 'map';
  state.combat = null;
  checkWinner(state);
}

function applyCombatResult(state) {
  const c = state.combat;
  const res = c.result;
  const atk = c.attacker, def = c.defender;

  // atakujący (jeśli to bohater) — przetrwali wracają do armii
  if (atk.isHero) {
    const p = state.players[atk.player];
    if (res.survivors0.length === 0) {
      p.hero.alive = false; // bohater poległ
    } else {
      p.hero.army = res.survivors0;
    }
  }
  // cel
  if (def.removeObj) {
    const obj = state.map.objects[def.removeObj];
    // usuń obiekt jeśli obrońca wybity (zwycięstwo lub wzajemne zniszczenie)
    if (res.survivors1.length === 0) {
      delete state.map.objects[def.removeObj];
      // nagrodę w złocie dostajemy tylko jeśli atakujący przetrwał
      if (res.attackerWon && atk.isHero && state.players[atk.player].hero.alive && def.reward) {
        state.players[atk.player].resources.gold += def.reward;
      }
    }
  }
  if (def.mineId) {
    const m = state.map.objects[def.mineId];
    if (m && res.attackerWon) { m.owner = atk.player; delete m.guard; }
  }
  if (def.town !== undefined) {
    const t = townAt(state, def.town.x, def.town.y);
    if (t && res.attackerWon) {
      t.owner = atk.player;
      t.garrison = [];
      // jeśli bronił bohater obrońcy — zginął
      if (def.isHero) {
        const dp = state.players[def.player];
        if (dp) dp.hero.alive = false;
      }
    }
  }
  if (def.isHero && def.player !== undefined) {
    // pojedynek bohaterów
    const dp = state.players[def.player];
    if (dp && res.attackerWon) dp.hero.alive = false;
  }
}

/* ----------------------------- AI walki ------------------------------ */

function aiCombatTurn(state) {
  const c = state.combat;
  const u = currentCombatUnit(state);
  if (!u) return null;
  const enemies = enemiesOf(state, u.side);
  if (enemies.length === 0) return null;

  // strzelec: strzelaj w najsłabszego wroga w zasięgu, dopóki ma strzały
  if (UNITS[u.type].ranged && u.shots > 0) {
    const target = weakestReachableByShoot(state, u, enemies);
    if (target) { execShoot(state, u.id, target.id); return 'shoot'; }
  }

  // znajdź cel do ataku wręcz — szukamy pola sąsiadującego z wrogiem, do którego dojdziemy
  const reach = combatReachable(state, u);
  let best = null; // { targetId, moveTo }
  for (const e of enemies) {
    // już stoimy obok wroga?
    if (adjacent(u, e)) { best = { targetId: e.id, moveTo: null }; break; }
    const adjTiles = adjacentTilesTo(state, e);
    for (const at of adjTiles) {
      if (reach.dist[at.x + ',' + at.y] !== undefined) {
        const cost = reach.dist[at.x + ',' + at.y];
        if (!best || cost < best.cost) { best = { targetId: e.id, moveTo: at, cost }; }
      }
    }
  }

  if (best) {
    if (best.moveTo) moveCombatUnit(state, u.id, best.moveTo.x, best.moveTo.y);
    execAttack(state, u.id, best.targetId);
    return 'attack';
  }

  // brak celu w zasięgu — idź w stronę najbliższego wroga jak najdalej
  const tgt = nearestEnemy(u, enemies);
  if (tgt) {
    let step = null, bestD = -1;
    for (const k in reach.dist) {
      const [x, y] = k.split(',').map(Number);
      const d = -(Math.abs(x - tgt.x) + Math.abs(y - tgt.y)); // im bliżej tym większe
      if (d > bestD) { bestD = d; step = { x, y }; }
    }
    if (step) { moveCombatUnit(state, u.id, step.x, step.y); return 'move'; }
  }
  // nic nie rób — pomiń
  afterAction(state);
  return 'wait';
}

function weakestReachableByShoot(state, u, enemies) {
  let best = null, bestHp = Infinity;
  for (const e of enemies) {
    const pool = (e.count - 1) * UNITS[e.type].hp + e.hp;
    if (pool < bestHp) { bestHp = pool; best = e; }
  }
  return best;
}
function adjacentTilesTo(state, e) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx === 0 && dy === 0) continue;
    const x = e.x + dx, y = e.y + dy;
    if (x >= 0 && y >= 0 && x < state.combat.CW && y < state.combat.CH) out.push({ x, y });
  }
  return out;
}
function nearestEnemy(u, enemies) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    const d = Math.abs(u.x - e.x) + Math.abs(u.y - e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ----------------------------- TURA / EKONOMIA ----------------------- */

function controllerOf(state) {
  if (state.phase === 'combat') return combatController(state);
  return state.turn;
}

function startPlayerDay(state, pi) {
  const p = state.players[pi];
  if (!p.alive) return;
  // bazowy dochód z miast (+500 złota / miasto / dzień)
  const myTowns = state.map.towns.filter(t => t.owner === pi);
  p.resources.gold += 500 * myTowns.length;
  // dochód z kopalni
  for (const id in state.map.objects) {
    const o = state.map.objects[id];
    const isMine = o.type === 'mine' || o.type === 'sawmill' || o.type === 'oremine' || o.type === 'gem';
    if (isMine && o.owner === pi && o.output) {
      for (const k in o.output) p.resources[k] = (p.resources[k] || 0) + o.output[k];
    }
  }
  // reset ruchu bohatera
  if (p.hero.alive) p.hero.mp = HERO_MP;
  // tygodniowy przyrost wojska w mieście (co 7 dni)
  if (state.day % 7 === 1) {
    for (const t of myTowns) {
      for (const u of UNIT_ORDER) t.avail[u] = (t.avail[u] || 0) + UNITS[u].growth;
    }
  }
}

function endTurn(state) {
  if (state.phase === 'combat') return; // nie można skończyć tury w trakcie walki
  state.townOpen = null;
  // następny żywy gracz
  let next = state.turn;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (state.players[next].alive) break;
  }
  if (next <= state.turn) state.day++; // pełne koło = nowy dzień
  state.turn = next;
  startPlayerDay(state, next);
  checkWinner(state);
}

function checkWinner(state) {
  const alive = state.players.filter(p => p.alive);
  for (const p of state.players) {
    const hasHero = p.hero.alive;
    const hasTown = state.map.towns.some(t => t.owner === p.idx);
    if (p.alive && !hasHero && !hasTown) p.alive = false;
  }
  const stillAlive = state.players.filter(p => p.alive);
  if (stillAlive.length === 1) {
    state.winner = stillAlive[0].idx;
  } else if (stillAlive.length === 0) {
    state.winner = -1; // remis
  }
}

/* ----------------------------- REKRUTACJA ---------------------------- */

function canAfford(p, cost) {
  for (const k in cost) if ((p.resources[k] || 0) < cost[k]) return false;
  return true;
}
function payCost(p, cost) {
  for (const k in cost) p.resources[k] -= cost[k];
}
function recruit(state, townId, unitType, count) {
  const t = state.map.objects[townId];
  if (!t) return false;
  const p = state.players[t.owner];
  const u = UNITS[unitType];
  const avail = t.avail[unitType] || 0;
  count = Math.min(count, avail);
  if (count <= 0) return false;
  const cost = {};
  for (const k in u.cost) cost[k] = u.cost[k] * count;
  if (!canAfford(p, cost)) return false;
  payCost(p, cost);
  t.avail[unitType] -= count;
  // dodaj do garnizonu (bohater może potem przejąć w ekranie miasta)
  addStack(t.garrison, unitType, count);
  return true;
}
function addStack(army, type, count) {
  const ex = army.find(s => s.type === type);
  if (ex) ex.count += count;
  else army.push({ type, count });
}

/* ===================================================================== */
/*            CZĘŚĆ 2: RENDER / WEJŚCIE (przeglądarka)                   */
/* ===================================================================== */

const Game = {
  UNITS, UNIT_ORDER, TERRAIN, RES, newGame, reachable, pathTo,
  startCombat, execAttack, execShoot, moveCombatUnit, aiCombatTurn,
  currentCombatUnit, combatReachable, enemiesOf, finishCombat, endTurn,
  recruit, controllerOf, startPlayerDay, checkWinner, generateMap
};
if (typeof module !== 'undefined' && module.exports) module.exports = Game;

// Poniższe uruchamia się tylko w przeglądarce:
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function () {

    let state = null;
    let net = { mode: 'local', myIndex: 0 };
    const isBrowser = true;

    // --- elementy DOM ---
    const $ = (id) => document.getElementById(id);
    const canvas = $('mapCanvas'), ctx = canvas.getContext('2d');
    const cCanvas = $('combatCanvas'), cctx = cCanvas.getContext('2d');

    let cam = { x: 0, y: 0 };       // środek kamery w kafelkach
    let DPR = 1;
    let combatView = { cell: 40, ox: 0, oy: 0, CW: 11, CH: 9 };
    let moving = false;             // animacja ruchu bohatera
    let pendingAI = null;

    /* ----------------------- POMOC UI ----------------------- */
    let toastTimer = null;
    function toast(msg) {
      const t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
    }

    function show(id) { $(id).classList.add('show'); }
    function hide(id) { $(id).classList.remove('show'); }

    /* ----------------------- TRYBY / SIEĆ ------------------- */
    function startHotseat() {
      net = { mode: 'local', myIndex: 0 };
      state = newGame([{ name: 'Gracz 1' }, { name: 'Gracz 2' }], Math.floor(Math.random() * 1e9));
      startPlayerDay(state, 0); // dochód i przyrost wojska na dzień 1
      hide('menu');
      beginTurnTransition();
    }

    let es = null;
    function startMultiplayer() {
      const name = ($('mp-name').value || '').trim() || ('Gracz ' + Math.floor(Math.random() * 99));
      net = { mode: 'mp', myIndex: -1, name };
      hide('menu'); show('lobby');
      $('mp-status').textContent = 'Łączenie z serwerem…';
      try {
        es = new EventSource('/events');
      } catch (e) {
        $('mp-status').textContent = 'Błąd: otwórz grę przez serwer (node server.js), nie z pliku.';
        return;
      }
      es.addEventListener('error', () => {
        $('mp-status').textContent = 'Nie połączono. Czy serwer działa? (node server.js)';
      });
      es.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        handleMessage(msg);
      };
    }

    function sendNet(obj) {
      fetch('/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }).catch(() => { });
    }

    function handleMessage(msg) {
      if (msg.t === 'seat') {
        net.myIndex = msg.i;
        $('mp-status').textContent = 'Połączono jako gracz ' + (msg.i + 1) + ' (' + net.name + '). Czekaj na innych.';
        sendNet({ t: 'join', i: net.myIndex, name: net.name });
      } else if (msg.t === 'roster') {
        renderRoster(msg.roster);
      } else if (msg.t === 'start') {
        state = msg.state;
        net.mode = 'mp';
        hide('lobby');
        camToHero();
        renderAll();
      } else if (msg.t === 'state') {
        const prevTurn = state ? state.turn : -1;
        state = msg.state;
        // gdy właśnie zaczęła się moja tura na mapie — wyśrodkuj na moim bohaterze
        if (net.mode === 'mp' && state.phase === 'map' && state.turn === net.myIndex && state.turn !== prevTurn) {
          camToHero();
        }
        renderAll();
      }
    }

    function renderRoster(roster) {
      const el = $('roster'); el.innerHTML = '';
      roster.forEach(r => {
        const d = document.createElement('div');
        d.textContent = (r.i + 1) + '. ' + (r.name || '(bez imienia)') + (r.i === net.myIndex ? '  ← TY' : '');
        el.appendChild(d);
      });
    }

    function hostStart() {
      // host (gracz 0) generuje stan dla wszystkich obecnych graczy
      // liczba graczy = liczba podłączonych (min 2)
      // użyjemy rosteru, jeśli nie mamy — zakładamy 2
      const metas = []; // nie znamy imion dokładnie; serwer ich nie rozsyła w `start`
      // zbierzemy imiona z ostatniego rosteru
      metas.push(...lastRoster.map(r => ({ name: r.name })));
      if (metas.length < 2) { toast('Potrzeba co najmniej 2 graczy'); return; }
      state = newGame(metas, Math.floor(Math.random() * 1e9));
      startPlayerDay(state, 0); // dochód i przyrost wojska na dzień 1
      // ustaw net.myIndex już ustawiony przez seat
      sendNet({ t: 'start', state });
      hide('lobby');
      camToHero();
      renderAll();
    }
    let lastRoster = [];
    const _origRenderRoster = renderRoster;
    renderRoster = function (roster) { lastRoster = roster; _origRenderRoster(roster); };

    /* ----------------------- PUBLIKUJ STAN (synchronizacja) ---------- */
    function syncOut() {
      renderAll();
      if (net.mode === 'mp' && state) {
        sendNet({ t: 'state', state });
      }
    }

    function canAct() {
      if (net.mode === 'local') return true;
      if (!state) return false;
      return net.myIndex === controllerOf(state);
    }

    /* ----------------------- PRZEBICIĘ TURY (hot-seat) --------------- */
    function beginTurnTransition() {
      // dochód naliczany jest w endTurn (dla kolejnego gracza) — tu tylko UI
      if (net.mode === 'local') {
        $('pass-name').textContent = state.players[state.turn].name;
        $('pass-name').style.color = state.players[state.turn].color;
        show('pass');
      } else {
        camToHero();
        renderAll();
      }
    }

    /* ----------------------- RENDER MAPY ----------------------------- */
    function resize() {
      DPR = window.devicePixelRatio || 1;
      const wrap = $('mapWrap');
      canvas.width = wrap.clientWidth * DPR;
      canvas.height = wrap.clientHeight * DPR;
      canvas.style.width = wrap.clientWidth + 'px';
      canvas.style.height = wrap.clientHeight + 'px';
      // combat canvas
      const cwrap = $('combatCanvasWrap');
      cCanvas.width = cwrap.clientWidth * DPR;
      cCanvas.height = cwrap.clientHeight * DPR;
      cCanvas.style.width = cwrap.clientWidth + 'px';
      cCanvas.style.height = cwrap.clientHeight + 'px';
      renderAll();
    }
    window.addEventListener('resize', resize);

    function camToHero() {
      const p = state.players[state.turn];
      if (p && p.hero.alive) { cam.x = p.hero.x; cam.y = p.hero.y; }
    }

    function worldToScreen(wx, wy) {
      const cw = canvas.width / DPR, chh = canvas.height / DPR;
      return { sx: (wx - cam.x) * TILE + cw / 2, sy: (wy - cam.y) * TILE + chh / 2 };
    }
    function screenToWorld(sx, sy) {
      const cw = canvas.width / DPR, chh = canvas.height / DPR;
      return { wx: Math.round((sx - cw / 2) / TILE + cam.x), wy: Math.round((sy - chh / 2) / TILE + cam.y) };
    }

    function renderAll() {
      if (!state) return;
      renderTopbar();
      if (state.phase === 'combat') { show('combatLayer'); renderCombat(); return; }
      hide('combatLayer');
      // warstwa oczekiwania w mp
      if (net.mode === 'mp' && !canAct() && state.winner === null) {
        const ctrl = controllerOf(state);
        const who = state.players[ctrl];
        $('waitText').textContent = 'Tura gracza: ' + (who ? who.name : '?');
        show('waitOverlay');
      } else {
        hide('waitOverlay');
      }
      if (state.winner !== null && state.winner !== undefined) {
        showWinner();
        return;
      }
      drawMap();
    }

    function renderTopbar() {
      const p = state.players[controllerOf(state) >= 0 ? controllerOf(state) : state.turn];
      const view = net.mode === 'local' ? state.players[state.turn] : (canAct() ? state.players[net.myIndex] : p);
      const rp = state.players[net.mode === 'local' ? state.turn : net.myIndex] || p;
      $('r-gold').textContent = rp.resources.gold;
      $('r-wood').textContent = rp.resources.wood;
      $('r-ore').textContent = rp.resources.ore;
      $('r-gems').textContent = rp.resources.gems;
      $('ti-day').textContent = 'Tydzień ' + (Math.floor((state.day - 1) / 7) + 1) + ', dzień ' + (((state.day - 1) % 7) + 1);
      $('ti-turn').innerHTML = 'Tura: <b>' + (p ? p.name : '?') + '</b>';
      $('ti-turn').style.color = p ? p.color : '';
    }

    function drawMap() {
      ctx.save();
      ctx.scale(DPR, DPR);
      const cw = canvas.width / DPR, chh = canvas.height / DPR;
      ctx.fillStyle = '#0d1518'; ctx.fillRect(0, 0, cw, chh);

      const startX = Math.floor(cam.x - cw / 2 / TILE - 1);
      const startY = Math.floor(cam.y - chh / 2 / TILE - 1);
      const endX = Math.ceil(cam.x + cw / 2 / TILE + 1);
      const endY = Math.ceil(cam.y + chh / 2 / TILE + 1);

      // kafelki
      for (let y = clamp(startY, 0, MAP_H - 1); y <= clamp(endY, 0, MAP_H - 1); y++) {
        for (let x = clamp(startX, 0, MAP_W - 1); x <= clamp(endX, 0, MAP_W - 1); x++) {
          const { sx, sy } = worldToScreen(x, y);
          ctx.fillStyle = TERRAIN[state.map.tiles[y][x]].color;
          ctx.fillRect(sx - TILE / 2, sy - TILE / 2, TILE + 1, TILE + 1);
          // delikatna siatka
          ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(sx - TILE / 2, sy - TILE / 2, TILE, TILE);
        }
      }

      // podświetlenie reachable (dla aktywnego gracza)
      if (canAct() && state.phase === 'map') {
        const p = activePlayer();
        if (p && p.hero.alive && !moving) {
          const reach = reachable(state, p.hero.x, p.hero.y, p.hero.mp, p.idx);
          for (const k in reach.dist) {
            const [x, y] = k.split(',').map(Number);
            const { sx, sy } = worldToScreen(x, y);
            ctx.fillStyle = 'rgba(255,255,255,0.13)';
            ctx.fillRect(sx - TILE / 2, sy - TILE / 2, TILE, TILE);
          }
          // cel walki — potwory i wrogowie
        }
      }

      // obiekty
      ctx.font = (TILE - 8) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const id in state.map.objects) {
        const o = state.map.objects[id];
        drawObject(o);
      }
      // miasta
      for (const t of state.map.towns) drawObject(t);

      // bohaterowie
      for (const p of state.players) {
        if (!p.hero.alive) continue;
        const { sx, sy } = worldToScreen(p.hero.x, p.hero.y);
        ctx.beginPath(); ctx.arc(sx, sy, TILE / 2 - 5, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.font = (TILE - 14) + 'px serif';
        ctx.fillStyle = '#fff'; ctx.fillText('🧙', sx, sy + 1);
        // pasek ruchu
        const w = TILE - 8;
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w / 2, sy + TILE / 2 - 6, w, 5);
        ctx.fillStyle = '#5fb56a'; ctx.fillRect(sx - w / 2, sy + TILE / 2 - 6, w * clamp(p.hero.mp / HERO_MP, 0, 1), 5);
      }

      ctx.restore();
    }

    function drawObject(o) {
      const { sx, sy } = worldToScreen(o.x, o.y);
      let icon = '';
      if (o.type === 'town') {
        // miasto rysujemy specjalnie: tarcza koloru właściciela + zamek
        ctx.beginPath(); ctx.arc(sx, sy, TILE / 2 - 3, 0, Math.PI * 2);
        ctx.fillStyle = o.owner >= 0 ? state.players[o.owner].color : '#666';
        ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.font = (TILE - 8) + 'px serif'; ctx.fillStyle = '#fff';
        ctx.fillText('🏰', sx, sy + 1);
        return;
      }
      switch (o.type) {
        case 'mine': icon = '⛏️'; break;
        case 'sawmill': icon = '🪓'; break;
        case 'oremine': icon = '🪨'; break;
        case 'gem': icon = '💎'; break;
        case 'treasure': icon = '💰'; break;
        case 'pile': icon = o.resource === 'wood' ? '🪵' : (o.resource === 'ore' ? '🪨' : '💠'); break;
        case 'monster': icon = '👹'; break;
      }
      ctx.font = (TILE - 6) + 'px serif';
      ctx.fillStyle = '#000'; ctx.fillText(icon, sx, sy + 1);
      ctx.fillText(icon, sx, sy);
      // znacznik właściciela kopalni
      if ((o.type === 'mine' || o.type === 'sawmill' || o.type === 'oremine' || o.type === 'gem') && o.owner >= 0) {
        ctx.beginPath(); ctx.arc(sx + TILE / 2 - 6, sy - TILE / 2 + 6, 7, 0, Math.PI * 2);
        ctx.fillStyle = state.players[o.owner].color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
      }
      // garnizon/potwór — licznik
      if (o.type === 'monster' || o.guard) {
        const army = o.type === 'monster' ? o.army : o.guard;
        if (army && army.length) {
          ctx.font = '11px system-ui'; ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
          const txt = army.map(s => UNITS[s.type].emoji + s.count).join(' ');
          ctx.strokeText(txt, sx, sy + TILE / 2 - 2);
          ctx.fillText(txt, sx, sy + TILE / 2 - 2);
        }
      }
    }

    function activePlayer() {
      if (net.mode === 'local') return state.players[state.turn];
      return state.players[net.myIndex];
    }

    /* ----------------------- WEJŚCIE: MAPA ---------------------------- */
    let drag = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, moved: false };

    canvas.addEventListener('pointerdown', (e) => {
      if (!canAct() || state.phase !== 'map') return;
      drag.active = true; drag.sx = e.clientX; drag.sy = e.clientY;
      drag.cx = cam.x; drag.cy = cam.y; drag.moved = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag.active) return;
      const dx = (e.clientX - drag.sx) / TILE, dy = (e.clientY - drag.sy) / TILE;
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 8) drag.moved = true;
      cam.x = drag.cx - dx; cam.y = drag.cy - dy;
      drawMap();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!drag.active) return;
      drag.active = false;
      if (!drag.moved) {
        const rect = canvas.getBoundingClientRect();
        handleMapTap(e.clientX - rect.left, e.clientY - rect.top);
      }
    });

    function handleMapTap(sx, sy) {
      if (moving) return;
      const p = activePlayer();
      if (!p || !p.hero.alive) return;
      const { wx, wy } = screenToWorld(sx, sy);
      if (!inBounds(wx, wy)) return;

      // stuknięcie w kafelek, na którym stoi bohater (np. własne miasto) → wejdź do miasta
      if (wx === p.hero.x && wy === p.hero.y) {
        const o = objectAt(state, wx, wy);
        if (o && o.type === 'town' && o.owner === p.idx) { openTown(o); return; }
        return;
      }

      // stuknięcie we wrogiego bohatera → atak z sąsiedztwa
      const enemyHero = heroAt(state, wx, wy);
      if (enemyHero && enemyHero.idx !== p.idx) {
        attackEnemyHero(p, wx, wy);
        return;
      }
      // stuknięcie w obiekt obok = wejście tam
      const path = pathTo(state, p.hero.x, p.hero.y, wx, wy, p.hero.mp, p.idx);
      if (!path || path.length < 2) {
        toast('Nie da się tam dojść (lub za mało ruchu)');
        return;
      }
      walkPath(p, path);
    }

    function attackEnemyHero(p, tx, ty) {
      // znajdź sąsiednie pole, do którego możemy dojść
      const reach = reachable(state, p.hero.x, p.hero.y, p.hero.mp, p.idx);
      let best = null;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const k = (tx + dx) + ',' + (ty + dy);
        if (reach.dist[k] !== undefined) { best = { x: tx + dx, y: ty + dy }; break; }
      }
      if (!best) { toast('Za daleko, by zaatakować'); return; }
      const path = pathTo(state, p.hero.x, p.hero.y, best.x, best.y, p.hero.mp, p.idx);
      if (path && path.length >= 2) {
        walkPath(p, path, () => {
          startHeroVsHero(p, enemyHeroAt(tx, ty));
        });
      }
    }
    function enemyHeroAt(x, y) { return heroAt(state, x, y); }

    function startHeroVsHero(attackerPlayer, defenderPlayer) {
      startCombat(state,
        { player: attackerPlayer.idx, isHero: true },
        { player: defenderPlayer.idx, isHero: true },
        attackerPlayer.hero.army, defenderPlayer.hero.army);
      enterCombat();
      syncOut();
    }

    function walkPath(p, path, then) {
      moving = true;
      let i = 1;
      function step() {
        if (i >= path.length) { moving = false; afterMove(p, then); return; }
        const tile = path[i];
        const cost = moveCost(state, tile.x, tile.y);
        if (p.hero.mp < cost) { moving = false; afterMove(p, then); return; }
        p.hero.x = tile.x; p.hero.y = tile.y; p.hero.mp -= cost;
        cam.x = tile.x; cam.y = tile.y;
        drawMap(); renderTopbar();
        // czy na tym kafelku jest interaktywny obiekt?
        const o = objectAt(state, tile.x, tile.y);
        if (o && isInteractable(o, p)) {
          moving = false;
          interact(p, o, then);
          return;
        }
        i++;
        setTimeout(step, 110);
      }
      step();
    }
    function isInteractable(o, p) {
      if (o.type === 'treasure' || o.type === 'pile' || o.type === 'monster') return true;
      if (o.type === 'mine' || o.type === 'sawmill' || o.type === 'oremine' || o.type === 'gem') return true;
      if (o.type === 'town') return true;
      return false;
    }
    function afterMove(p, then) {
      drawMap();
      if (then) { then(); }
      else syncOut();
    }

    function interact(p, o, then) {
      switch (o.type) {
        case 'treasure': {
          if (o.guard && o.guard.length) {
            startGuardCombat(p, o, 'treasure');
          } else {
            p.resources.gold += o.gold; toast('+' + o.gold + ' 🪙');
            delete state.map.objects[o.id];
            finishInteract(then);
          }
          break;
        }
        case 'pile': {
          p.resources[o.resource] += o.amount;
          toast('+' + o.amount + ' ' + o.resource);
          delete state.map.objects[o.id];
          finishInteract(then);
          break;
        }
        case 'monster': {
          startGuardCombat(p, o, 'monster');
          break;
        }
        case 'mine': case 'sawmill': case 'oremine': case 'gem': {
          if (o.owner !== p.idx && o.guard && o.guard.length) {
            startGuardCombat(p, o, 'mine');
          } else {
            if (o.owner !== p.idx) { o.owner = p.idx; toast('Zdobyto: ' + (o.output ? Object.keys(o.output)[0] : 'kopalnia')); }
            finishInteract(then);
          }
          break;
        }
        case 'town': {
          if (o.owner === p.idx) {
            openTown(o);
            finishInteract(then, true);
          } else {
            // szturm miasta — walcz z garnizonem (lub bohaterem obrońcy jeśli stoi na mieście)
            const def = { town: o, player: o.owner, isHero: false };
            startCombat(state, { player: p.idx, isHero: true }, def, p.hero.army, o.garrison.length ? o.garrison : [{ type: 'peasant', count: 5 }]);
            enterCombat();
            syncOut();
          }
          break;
        }
      }
    }
    function finishInteract(then, suppressSync) {
      drawMap();
      if (!suppressSync) syncOut();
      if (then) then();
    }

    function startGuardCombat(p, o, kind) {
      const def = { player: -1 };
      if (kind === 'monster') { def.removeObj = o.id; def.reward = o.reward; }
      else if (kind === 'treasure') { def.removeObj = o.id; def.reward = o.gold; }
      else if (kind === 'mine') { def.mineId = o.id; }
      startCombat(state, { player: p.idx, isHero: true }, def, p.hero.army, kind === 'monster' ? o.army : o.guard);
      enterCombat();
      syncOut();
    }

    /* ----------------------- WEJŚCIE: WALKA --------------------------- */
    function enterCombat() {
      state.townOpen = null;
      show('combatLayer');
      combatView.CW = state.combat.CW; combatView.CH = state.combat.CH;
      renderCombat();
      maybeAI();
    }

    function renderCombat() {
      if (!state || state.phase !== 'combat' || !state.combat) return;
      const c = state.combat;
      const wrap = $('combatCanvasWrap');
      const w = wrap.clientWidth, h = wrap.clientHeight;
      const cell = Math.floor(Math.min(w / c.CW, h / c.CH));
      combatView.cell = cell;
      combatView.ox = (w - cell * c.CW) / 2;
      combatView.oy = (h - cell * c.CH) / 2;

      cctx.save(); cctx.scale(DPR, DPR);
      cctx.fillStyle = '#14110c'; cctx.fillRect(0, 0, w, h);

      // siatka
      for (let y = 0; y < c.CH; y++) for (let x = 0; x < c.CW; x++) {
        const px = combatView.ox + x * cell, py = combatView.oy + y * cell;
        cctx.fillStyle = (x + y) % 2 === 0 ? '#241c12' : '#2c2317';
        cctx.fillRect(px, py, cell, cell);
        cctx.strokeStyle = 'rgba(0,0,0,.25)'; cctx.strokeRect(px, py, cell, cell);
      }

      // podświetlenie reachable aktywnej jednostki (jeśli steruje nią człowiek)
      const cur = currentCombatUnit(state);
      if (cur && humanControls(cur) && !c.done) {
        const reach = combatReachable(state, cur);
        for (const k in reach.dist) {
          const [x, y] = k.split(',').map(Number);
          cctx.fillStyle = 'rgba(120,200,255,0.18)';
          cctx.fillRect(combatView.ox + x * cell, combatView.oy + y * cell, cell, cell);
        }
      }

      // jednostki
      for (const u of c.units) {
        if (!u.alive) continue;
        const px = combatView.ox + u.x * cell + cell / 2, py = combatView.oy + u.y * cell + cell / 2;
        const col = u.side === 0 ? state.players[c.attacker.player].color : (c.defender.player >= 0 ? state.players[c.defender.player].color : '#888');
        // selected ring
        if (u.id === c.selectedId) {
          cctx.beginPath(); cctx.arc(px, py, cell / 2 - 1, 0, Math.PI * 2);
          cctx.strokeStyle = '#ffe24a'; cctx.lineWidth = 3; cctx.stroke();
        }
        cctx.beginPath(); cctx.arc(px, py, cell / 2 - 5, 0, Math.PI * 2);
        cctx.fillStyle = col; cctx.fill(); cctx.lineWidth = 2; cctx.strokeStyle = '#000'; cctx.stroke();
        cctx.font = (cell - 12) + 'px serif'; cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
        cctx.fillText(UNITS[u.type].emoji, px, py + 1);
        // licznik
        cctx.font = 'bold 13px system-ui';
        cctx.fillStyle = '#000'; cctx.fillText(u.count, px + 1, py + cell / 2 - 8 + 1);
        cctx.fillStyle = '#fff'; cctx.fillText(u.count, px, py + cell / 2 - 8);
        // pasek hp
        const ud = UNITS[u.type];
        const frac = clamp((u.hp + (u.count - 1) * ud.hp) / (ud.hp * u.count), 0, 1);
        cctx.fillStyle = 'rgba(0,0,0,.6)'; cctx.fillRect(px - cell / 3, py - cell / 2 + 4, cell * 2 / 3, 4);
        cctx.fillStyle = frac > 0.5 ? '#5fb56a' : (frac > 0.25 ? '#e0c040' : '#d65a5a');
        cctx.fillRect(px - cell / 3, py - cell / 2 + 4, cell * 2 / 3 * frac, 4);
      }

      cctx.restore();

      // info
      const log = c.log.slice(-1)[0] || '';
      $('combatInfo').innerHTML = `Runda ${c.round} — <b>${cur ? UNITS[cur.type].name : ''}</b> (${cur && cur.side === 0 ? 'atak' : 'obrona'})` +
        (log ? `<br><span style="opacity:.8;font-size:12px;">${log}</span>` : '');
    }

    function humanControls(u) {
      if (net.mode === 'local') return true;
      const side = u.side;
      const ctrlPlayer = side === 0 ? state.combat.attacker.player : state.combat.defender.player;
      // neutralni obrońcy (player -1) nigdy nie są sterowani przez gracza-ludzia w mp... chyba że to PvP
      return net.myIndex === ctrlPlayer;
    }

    cCanvas.addEventListener('pointerdown', (e) => {
      if (!canAct() || state.phase !== 'combat') return;
      const cur = currentCombatUnit(state);
      if (!cur || !humanControls(cur) || state.combat.done) return;
      const rect = cCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const cell = combatView.cell;
      const gx = Math.floor((x - combatView.ox) / cell), gy = Math.floor((y - combatView.oy) / cell);
      if (gx < 0 || gy < 0 || gx >= state.combat.CW || gy >= state.combat.CH) return;
      const target = state.combat.units.find(u => u.alive && u.x === gx && u.y === gy);

      if (target && target.side !== cur.side) {
        // atak wręcz (jeśli obok) lub strzał
        if (UNITS[cur.type].ranged && cur.shots > 0) {
          execShoot(state, cur.id, target.id); renderCombat(); syncOut(); maybeAI(); return;
        }
        if (adjacent(cur, target)) {
          execAttack(state, cur.id, target.id); renderCombat(); syncOut(); maybeAI(); return;
        }
        // spróbuj dojść obok i zaatakować
        moveToAttack(cur, target);
        return;
      }
      if (!target) {
        // ruch
        const reach = combatReachable(state, cur);
        if (reach.dist[gx + ',' + gy] !== undefined) {
          moveCombatUnit(state, cur.id, gx, gy);
          renderCombat(); syncOut(); maybeAI();
        }
      }
    });

    function moveToAttack(cur, target) {
      const reach = combatReachable(state, cur);
      let best = null;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = target.x + dx, y = target.y + dy;
        if (reach.dist[x + ',' + y] !== undefined) {
          if (!best || reach.dist[x + ',' + y] < reach.dist[best.x + ',' + best.y]) best = { x, y };
        }
      }
      if (!best) { toast('Nie dosięgniesz'); return; }
      moveCombatUnit(state, cur.id, best.x, best.y);
      const stillCur = currentCombatUnit(state);
      if (stillCur && stillCur.id === cur.id && adjacent(stillCur, target)) {
        execAttack(state, cur.id, target.id);
      }
      renderCombat(); syncOut(); maybeAI();
    }

    function maybeAI() {
      if (!state || state.phase !== 'combat' || state.combat.done) return;
      const cur = currentCombatUnit(state);
      if (!cur) return;
      const ctrlPlayer = cur.side === 0 ? state.combat.attacker.player : state.combat.defender.player;
      // AI prowadzi WYŁĄCZNIE jednostki neutralne (ctrlPlayer === -1).
      // Jednostkami ludzkich graczy sterują oni sami (nawet po sieci).
      if (ctrlPlayer !== -1) return;
      // w mp neutralne AI napędza klient, którego jest tura na mapie (= atakujący)
      if (net.mode === 'mp' && net.myIndex !== state.turn) return;
      clearTimeout(pendingAI);
      pendingAI = setTimeout(() => {
        if (!state || state.phase !== 'combat') return;
        aiCombatTurn(state);
        renderCombat(); syncOut();
        if (state.phase === 'combat') maybeAI();
      }, 550);
    }

    /* ----------------------- Ucieczka z walki ------------------------- */
    $('btn-flee').addEventListener('click', () => {
      if (!canAct() || state.phase !== 'combat') return;
      const cur = currentCombatUnit(state);
      if (!cur || !humanControls(cur)) return;
      // ucieczka: atakujący wycofuje się z ocalałymi, bohater zostaje żywy
      if (state.combat.attacker.isHero) {
        const surv = state.combat.units.filter(u => u.alive && u.side === 0).map(u => ({ type: u.type, count: u.count }));
        state.players[state.combat.attacker.player].hero.army = surv;
      }
      state.phase = 'map'; state.combat = null;
      checkWinner(state);
      hide('combatLayer');
      syncOut();
    });

    /* ----------------------- EKRAN MIASTA ----------------------------- */
    let townTarget = null;
    function openTown(t) {
      townTarget = t;
      renderTown();
      show('town');
    }
    function renderTown() {
      const t = townTarget; if (!t) return;
      const p = state.players[t.owner];
      const heroHere = p.hero.alive && p.hero.x === t.x && p.hero.y === t.y;
      let html = `<h1>🏰 ${t.name}</h1>`;
      html += `<p style="text-align:center;">Właściciel: <b style="color:${p.color}">${p.name}</b></p>`;
      // rekrutacja
      html += `<h2>Rekrutacja</h2>`;
      for (const u of UNIT_ORDER) {
        const ud = UNITS[u];
        const avail = t.avail[u] || 0;
        const cost = ud.cost;
        const costStr = Object.keys(cost).map(k => `${cost[k]} ${resEmoji(k)}`).join('  ');
        const can1 = avail >= 1 && canAfford(p, cost);
        html += `<div class="stack">
          <div class="em">${ud.emoji}</div>
          <div class="info"><b>${ud.name}</b><br><small>${costStr} · dostępne: ${avail}</small><br>
          <small>Atk ${ud.atk} · Obr ${ud.def} · HP ${ud.hp} · obrażenia ${ud.dmg[0]}-${ud.dmg[1]}${ud.ranged ? ' · strzelec' : ''}${ud.flying ? ' · lata' : ''}</small></div>
          <div class="ctl">
            <button ${can1 ? '' : 'disabled'} data-rec="${u}" data-n="1">+1</button>
            <button ${avail >= 5 && canAfford(p, mulCost(cost, 5)) ? '' : 'disabled'} data-rec="${u}" data-n="5">+5</button>
          </div></div>`;
      }
      // garnizon / bohater
      html += `<h2>Wojsko</h2><div class="twocol"><div><h3>Garnizon</h3>`;
      if (!t.garrison.length) html += `<div class="empty">pusto</div>`;
      else t.garrison.forEach((s, i) => html += stackRow('gar', i, s));
      html += `</div><div><h3>Bohater ${heroHere ? '' : '(poza miastem)'}</h3>`;
      if (!p.hero.army.length) html += `<div class="empty">pusto</div>`;
      else p.hero.army.forEach((s, i) => html += stackRow('hero', i, s));
      html += `</div></div>`;
      html += `<p style="font-size:12px;opacity:.7;">Stuknij stos by przenieść ${heroHere ? 'między bohaterem a garnizonem' : '(bohater musi być w mieście)'}</p>`;
      html += `<div class="btnrow"><button class="primary" id="townClose">Zamknij</button></div>`;
      $('townCard').innerHTML = html;
      // obsługa
      $('townCard').querySelectorAll('[data-rec]').forEach(b => b.addEventListener('click', () => {
        const u = b.getAttribute('data-rec'), n = +b.getAttribute('data-n');
        if (recruit(state, t.id, u, n)) { renderTown(); syncOut(); }
        else toast('Za mało surowców / brak dostępnych');
      }));
      $('townCard').querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => {
        if (!heroHere) return;
        const from = b.getAttribute('data-from'), idx = +b.getAttribute('data-i');
        if (from === 'gar') {
          const s = t.garrison[idx]; p.hero.army.push(s); t.garrison.splice(idx, 1);
        } else {
          const s = p.hero.army[idx]; t.garrison.push(s); p.hero.army.splice(idx, 1);
        }
        renderTown(); syncOut();
      }));
      $('townClose').addEventListener('click', () => { hide('town'); syncOut(); });
    }
    function stackRow(from, i, s) {
      return `<div class="stack"><div class="em">${UNITS[s.type].emoji}</div>
        <div class="info"><b>${UNITS[s.type].name}</b><br><small>x${s.count}</small></div>
        <div class="ctl"><button data-move="1" data-from="${from}" data-i="${i}">⇄</button></div></div>`;
    }
    function resEmoji(k) { return k === 'gold' ? '🪙' : k === 'wood' ? '🪵' : k === 'ore' ? '🪨' : '💎'; }
    function mulCost(cost, n) { const o = {}; for (const k in cost) o[k] = cost[k] * n; return o; }

    /* ----------------------- PRZYCISKI / NAKŁADKI --------------------- */
    $('btn-end').addEventListener('click', () => {
      if (!canAct() || state.phase === 'combat') return;
      endTurn(state);
      syncOut();
      beginTurnTransition();
    });
    $('btn-hotseat').addEventListener('click', startHotseat);
    $('btn-mp').addEventListener('click', startMultiplayer);
    $('btn-start').addEventListener('click', hostStart);
    $('btn-leave').addEventListener('click', () => { if (es) es.close(); hide('lobby'); show('menu'); });
    $('btn-passgo').addEventListener('click', () => { hide('pass'); camToHero(); renderAll(); });
    $('btn-help').addEventListener('click', () => show('help'));
    $('btn-combat-help').addEventListener('click', () => show('help'));
    $('btn-helpclose').addEventListener('click', () => hide('help'));
    $('btn-again').addEventListener('click', () => { hide('winner'); hide('combatLayer'); hide('town'); show('menu'); state = null; });

    function showWinner() {
      hide('combatLayer'); hide('waitOverlay');
      if (state.winner === -1) $('winner-text').textContent = '🤝 Remis!';
      else {
        const w = state.players[state.winner];
        $('winner-text').innerHTML = '🏆<br>Wygrał:<br><span style="color:' + w.color + '">' + w.name + '</span>';
      }
      show('winner');
    }

    /* ----------------------- START ------------------------------------ */
    resize();
    // zapobiegaj scrollowi / zoomowi dotyku
    document.addEventListener('touchmove', (e) => { if (e.scale !== undefined && e.scale !== 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

  })();
}
