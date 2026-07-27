// Test integracyjny: wyniki walki, nagrody, eliminacja, tury.
const G = require('./game.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };

// --- pomocnik: pętla walki AI vs AI do końca ---
function runCombat(s) { let g = 0; while (s.phase === 'combat' && g < 300) { G.aiCombatTurn(s); g++; } }

console.log('A) Walka z potworem → nagroda + usunięcie obiektu + armia');
let s = G.newGame([{ name: 'A' }, { name: 'B' }], 333);
// znajdź potwora
let mon = null; for (const id in s.map.objects) { if (s.map.objects[id].type === 'monster') { mon = s.map.objects[id]; break; } }
ok('jest potwór na mapie', !!mon);
const goldBefore = s.players[0].resources.gold;
const atkArmy = [{ type: 'angel', count: 5 }]; // pewne zwycięstwo
G.startCombat(s, { player: 0, isHero: true }, { player: -1, removeObj: mon.id, reward: mon.reward }, atkArmy, mon.army);
runCombat(s);
ok('walka zakończona (faza map)', s.phase === 'map');
ok('potwór usunięty z mapy', !s.map.objects[mon.id]);
ok('nagroda w złocie przyznana', s.players[0].resources.gold === goldBefore + mon.reward);
ok('armia bohatera = ocalali (anioły)', s.players[0].hero.army.length === 1 && s.players[0].hero.army[0].type === 'angel');
ok('bohater żyje', s.players[0].hero.alive);

console.log('B) Pojedynek bohaterów — przegrywający ginie');
let s2 = G.newGame([{ name: 'A' }, { name: 'B' }], 444);
G.startCombat(s2, { player: 0, isHero: true }, { player: 1, isHero: true },
  [{ type: 'angel', count: 3 }], [{ type: 'peasant', count: 5 }]);
runCombat(s2);
ok('bohater gracza 1 pokonany', s2.players[1].hero.alive === false);
ok('bohater gracza 0 żyje', s2.players[0].hero.alive === true);

console.log('C) Eliminacja → zwycięzca');
let s3 = G.newGame([{ name: 'A' }, { name: 'B' }], 555);
// gracz 1 traci bohatera i miasto
s3.players[1].hero.alive = false;
s3.map.towns[1].owner = 0;
G.checkWinner(s3);
ok('zwycięzcą został gracz 0', s3.winner === 0);

console.log('D) Tury i dochód w wielu dniach');
let s4 = G.newGame([{ name: 'A' }, { name: 'B' }], 777);
G.startPlayerDay(s4, 0); // dzień 1
ok('start: dzień 1', s4.day === 1);
G.endTurn(s4); // -> gracz 1, wciąż dzień 1
ok('po 1. endTurn: tura gracza 1', s4.turn === 1 && s4.day === 1);
G.endTurn(s4); // -> gracz 0, dzień 2
ok('po 2. endTurn: tura gracza 0, dzień 2', s4.turn === 0 && s4.day === 2);
const g0before = s4.players[0].resources.gold;
G.startPlayerDay(s4, 0); // dochód dnia 2
ok('dochód dnia 2 (+500 z miasta)', s4.players[0].resources.gold === g0before + 500);

console.log('E) Rekrutacja + przenoszenie do armii');
let s5 = G.newGame([{ name: 'A' }], 888);
const t = s5.map.towns[0];
G.startPlayerDay(s5, 0); // przyrost tygodniowy
ok('w mieście są dostępni chłopi', (t.avail.peasant || 0) > 0);
G.recruit(s5, t.id, 'archer', 2);
ok('można rekrutować łuczników (jeśli stać)', t.garrison.some(x => x.type === 'archer'));

console.log('\nWynik: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
