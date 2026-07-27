// Test silnika Heroes Lite (heksy + walka + ekonomia)
const E = require('./engine.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };

console.log('1) Heksy — sąsiedztwo i dystans');
const n = E.hexNeighbors(3, 3);
ok('6 sąsiadów', n.length === 6);
ok('dystans 0 dla tego samego', E.hexDistance({ col: 2, row: 2 }, { col: 2, row: 2 }) === 0);
ok('dystans 1 dla sąsiada', E.hexDistance({ col: 2, row: 2 }, { col: 3, row: 2 }) === 1);
ok('dystans 2', E.hexDistance({ col: 0, row: 0 }, { col: 2, row: 0 }) === 2);

console.log('2) Nowa gra + mapa + mgła');
let s = E.newGame({ players: [{ name: 'A', faction: 'castle' }, { name: 'B', faction: 'dungeon', isAI: true }], size: 'S', seed: 123 });
ok('2 graczy', s.players.length === 2);
ok('2 miasta startowe', s.map.towns.length === 2);
ok('gracze mają bohaterów', s.players.every(p => p.heroes.length === 1 && p.heroes[0].alive));
ok('jest mgła wojny', !!s.fog && s.fog[0] && s.fog[0].exp);
ok('start bohatera jest widoczny', s.fog[0].vis[s.players[0].heroes[0].y][s.players[0].heroes[0].x] === true);
ok('oddalony kafelek nieodkryty', s.fog[0].exp[Math.floor(s.H / 2)][Math.floor(s.W / 2)] === false);

console.log('3) Pathfinding');
const h = s.players[0].heroes[0];
const reach = E.reachable(s, h.x, h.y, 500);
ok('reachable niepusty', Object.keys(reach.dist).length > 0);
const path = E.pathTo(s, h.x, h.y, h.x + 1, h.y, 500);
ok('ścieżka o 1 obok istnieje', path && path.length >= 2);
ok('cel ścieżki poprawny', path && path[path.length - 1].x === h.x + 1);

console.log('4) Walka na heksach — neutralny strażnik');
const combat = E.startCombat(s, { player: 0, heroId: h.id }, { player: -1, removeObj: 'test', reward: 500 },
  [{ key: 'cas7', count: 3 }], [{ key: 'wolf', count: 6 }]);
ok('faza walki', s.phase === 'combat');
ok('jednostki rozmieszczone', combat.units.length === 2);
ok('kolejka zbudowana', combat.queue.length === 2);
ok('jednostka ataku w lewej kolumnie', combat.units.find(u => u.side === 0).x < 5);
ok('jednostka obrony w prawej kolumnie', combat.units.find(u => u.side === 1).x > 9);
// zasięg ruchu
const cu = E.currentUnit(s);
const cr = E.combatReach(s, cu);
ok('zasięg ruchu jednostki > 0', Object.keys(cr.dist).length > 0);

console.log('5) Walka — symulacja AI do końca');
let guard = 0;
while (s.phase === 'combat' && guard < 500) { E.aiCombatTurn(s); guard++; }
ok('walka zakończona', s.phase === 'map');
ok('bohater żyje (anioły wygrywają)', h.alive === true);

console.log('6) Ekonomia + budowle');
let s2 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 7 });
E.startPlayerDay(s2, 0);
const town = s2.map.towns[0];
ok('start: poziom ratusza 0', town.hall === 0);
ok('dochód 1. dnia (500 z miasta)', s2.players[0].resources.gold >= 5000);
const built = E.buildInTown(s2, town.id, 'dw1');
ok('można zbudować siedlisko tier 1', built === true);
ok('siedlisko zarejestrowane', town.built['dw1'] === true);
ok('jedna budowa dziennie', E.buildInTown(s2, town.id, 'dw2') === false);
ok('jednostki dostępne po budowie', (town.avail[E.D.FACTIONS.castle.units[0].key] || 0) > 0);

console.log('7) Rekrutacja');
const rec = E.recruit(s2, town.id, E.D.FACTIONS.castle.units[0].key, 5);
ok('rekrut zwraca liczbę', rec > 0);
ok('garnizon ma jednostki', town.garrison.length > 0);
ok('dostępne zmalały', (town.avail[E.D.FACTIONS.castle.units[0].key] || 0) >= 0);

console.log('8) Tury i eliminacja');
let s3 = E.newGame({ players: [{ name: 'A', faction: 'castle' }, { name: 'B', faction: 'dungeon' }], size: 'S', seed: 9 });
ok('start dzień 1', s3.day === 1);
E.endTurn(s3);
ok('po endTurn: gracz 1', s3.turn === 1 && s3.day === 1);
E.endTurn(s3);
ok('po 2 endTurn: gracz 0, dzień 2', s3.turn === 0 && s3.day === 2);
s3.players[1].heroes[0].alive = false;
s3.players[1].townIds = [];
E.checkWinner(s3);
ok('zwycięzca = gracz 0', s3.winner === 0);

console.log('9) JSON round-trip (multiplayer)');
const json = JSON.stringify(s);
const s4 = JSON.parse(json);
ok('stan przechodzi przez JSON', s4.players.length === s.players.length);
E.recomputeVision(s4, 0);
ok('logika działa po deserializacji', !!E.reachable(s4, h.x, h.y, 500));

console.log('\nWynik: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
