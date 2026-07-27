// Szybki test logiki gry (bez przeglądarki).
const G = require('./game.js');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }

console.log('1) Generowanie mapy (2 graczy)');
let s = G.newGame([{ name: 'A' }, { name: 'B' }], 42);
ok('2 graczy', s.players.length === 2);
ok('2 miasta', s.map.towns.length === 2);
ok('bohaterzy żyją', s.players.every(p => p.hero.alive));
ok('miasta mają właścicieli', s.map.towns.every(t => t.owner >= 0));
let objCount = Object.keys(s.map.objects).length;
ok('są obiekty na mapie (>10)', objCount > 10);

console.log('2) Pathfinding / reachable');
const p0 = s.players[0];
const reach = G.reachable(s, p0.hero.x, p0.hero.y, p0.hero.mp, 0);
ok('reachable zwraca dist', reach && Object.keys(reach.dist).length > 0);
ok('start ma dist 0', reach.dist[p0.hero.x + ',' + p0.hero.y] === 0);

console.log('3) Walka — neutralna obrona');
const atkArmy = [{ type: 'archer', count: 10 }, { type: 'knight', count: 5 }];
const defArmy = [{ type: 'peasant', count: 20 }];
G.startCombat(s, { player: 0, isHero: false }, { player: -1, monsterId: 'x' }, atkArmy, defArmy);
ok('faza walki', s.phase === 'combat');
ok('jednostki utworzone', s.combat.units.length === 3);
ok('kolejka zbudowana', s.combat.queue.length === 3);
// symuluj kilka tur AI vs AI
let guard = 0;
while (s.phase === 'combat' && guard < 200) {
  G.aiCombatTurn(s); guard++;
}
ok('walka się zakończyła', s.phase === 'map');
ok('jeden stron ma ocalałych', s.combat === null);

console.log('4) Rekrutacja');
s2 = G.newGame([{ name: 'A' }], 7);
const town = s2.map.towns[0];
town.avail = { peasant: 14, archer: 9 };
const player = s2.players[town.owner];
const gold0 = player.resources.gold;
const recruited = G.recruit(s2, town.id, 'peasant', 5);
ok('rekrut succeeded', recruited === true);
ok('zabrano surowce', player.resources.gold < gold0);
ok('garnizon ma chłopów', town.garrison.some(st => st.type === 'peasant' && st.count === 5));
ok('dostępne zmalały', town.avail.peasant === 9);

console.log('5) Ekonomia — dochód z kopalni');
s3 = G.newGame([{ name: 'A' }, { name: 'B' }], 100);
// przypisz graczowi 0 kopalnię złota
let mine = null;
for (const id in s3.map.objects) { const o = s3.map.objects[id]; if (o.type === 'mine') { mine = o; break; } }
if (mine) {
  mine.owner = 0; delete mine.guard;
  const before = s3.players[0].resources.gold;
  G.startPlayerDay(s3, 0);
  ok('dochód z kopalni złota (+1500 = 1000 kopalnia + 500 miasto)', s3.players[0].resources.gold === before + 1500);
} else {
  ok('znaleziono kopalnię złota', false);
}

console.log('\nWynik: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
