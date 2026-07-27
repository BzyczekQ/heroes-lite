// Głęboki test walki na heksach
const E = require('./engine.js');
const D = E.D;
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };

function sim(s) { let g = 0; while (s.phase === 'combat' && g < 600) { E.aiCombatTurn(s); g++; } return g; }

console.log('W1) Pełna walka frakcji — anioły vs chłopi');
let s = E.newGame({ players: [{ name: 'A', faction: 'castle' }, { name: 'B', faction: 'dungeon' }], size: 'S', seed: 11 });
E.startCombat(s, { player: 0, heroId: s.players[0].heroes[0].id }, { player: -1, removeObj: 'x' },
  [{ key: 'cas7', count: 2 }], [{ key: 'peasant', count: 50 }]);
const steps = sim(s);
ok('walka zakończona w <600 krokach', s.phase === 'map');
ok('bohater atakujący żyje', s.players[0].heroes[0].alive);
ok('anioły przetrwały', s.players[0].heroes[0].army.some(a => a.key === 'cas7'));

console.log('W2) Strzelcy — łucznicy biją z dystansu');
let s2 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 22 });
E.startCombat(s2, { player: 0 }, { player: -1, removeObj: 'y' },
  [{ key: 'cas2', count: 20 }], [{ key: 'wolf', count: 10 }]);
let archer = s2.combat.units.find(u => u.key === 'cas2');
ok('łucznik ma strzały na starcie', archer.shots === 24);
// wymuś strzał łucznika (jeśli pierwszy rusza)
const before = s2.combat.units.find(u => u.side === 1).count;
sim(s2);
ok('walka ze strzelcami rozwiązana', s2.phase === 'map');

console.log('W3) Odwzajemnienie — po ataku wręcz wróg oddaje');
let s3 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 33 });
E.startCombat(s3, { player: 0 }, { player: -1, removeObj: 'z' },
  [{ key: 'cas1', count: 30 }], [{ key: 'ogre', count: 5 }]);
// umieść obok siebie by wymusić walkę wręcz
let atk = s3.combat.units.find(u => u.side === 0);
let def = s3.combat.units.find(u => u.side === 1);
atk.x = 5; atk.y = 5; def.x = 6; def.y = 5;
ok('sąsiadują', E.hexDistance({ col: atk.x, row: atk.y }, { col: def.x, row: def.y }) === 1);
E.execMelee(s3, atk.id, def.id);
ok('obrońca otrzymał obrażenia', def.count < 5 || !def.alive);
sim(s3);
ok('walka wręcz rozwiązana', s3.phase === 'map');

console.log('W4) Ruch jednostki po heksach');
let s4 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 44 });
E.startCombat(s4, { player: 0 }, { player: -1, removeObj: 'w' }, [{ key: 'cas3', count: 5 }], [{ key: 'goblin', count: 10 }]);
let u = E.currentUnit(s4);
const reach = E.combatReach(s4, u);
const keys = Object.keys(reach.dist);
ok('gryf ma dostępne heksy do ruchu', keys.length > 0);
const target = keys[0].split(',');
E.moveUnit(s4, u.id, +target[0], +target[1]);
ok('jednostka przesunięta', u.x === +target[0] && u.y === +target[1]);
sim(s4);

console.log('W5) Czar bojowy');
let s5 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 55 });
s5.players[0].heroes[0].mana = 50;
E.startCombat(s5, { player: 0, heroId: s5.players[0].heroes[0].id }, { player: -1, removeObj: 'q' },
  [{ key: 'cas1', count: 20 }], [{ key: 'wolf', count: 8 }]);
const enemy = s5.combat.units.find(u => u.side === 1);
const before5 = enemy.count;
E.castSpell(s5, 'magicArrow', enemy.id);
ok('czar zadaje obrażenia (lub zabija)', enemy.count < before5 || !enemy.alive);
ok('mana się zużyła', s5.players[0].heroes[0].mana < 50);

console.log('W6) Zastosowanie wyniku — armia po walce');
let s6 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 66 });
const h = s6.players[0].heroes[0];
const armyBefore = h.army[0].count;
E.startCombat(s6, { player: 0, heroId: h.id }, { player: -1, removeObj: 'r', reward: 1000 },
  h.army, [{ key: 'peasant', count: 5 }]);
sim(s6);
ok('bohater zachował ocalałe jednostki', h.army.length >= 1);
ok('nagroda przyznana', s6.players[0].resources.gold >= 5000);

console.log('W7) Przegrana walka — bohater ginie');
let s7 = E.newGame({ players: [{ name: 'A', faction: 'castle' }, { name: 'B', faction: 'dungeon' }], size: 'S', seed: 77 });
E.startCombat(s7, { player: 0, heroId: s7.players[0].heroes[0].id }, { player: 1, heroId: s7.players[1].heroes[0].id },
  [{ key: 'cas1', count: 3 }], [{ key: 'dun7', count: 5 }]);
sim(s7);
ok('atakujący (słabszy) przegrał', s7.players[0].heroes[0].alive === false);

console.log('\nWynik walki: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
