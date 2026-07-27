// Test nowych funkcji: zatrudnianie bohatera, targ, obserwatorium, zapis/wczytanie
const E = require('./engine.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };

console.log('N1) Zatrudnianie bohatera');
let s = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 1 });
const t = s.map.towns[0];
const before = s.players[0].resources.gold;
ok('start: 1 bohater', s.players[0].heroes.length === 1);
const h2 = E.hireHero(s, t.id);
ok('zatrudniono bohatera', !!h2);
ok('2 bohaterów', s.players[0].heroes.length === 2);
ok('zabrano 2500 złota', s.players[0].resources.gold === before - 2500);
ok('nowy bohater żyje i ma armię', h2.alive && h2.army.length >= 1);

console.log('N2) Targ — wymiana surowców');
let s2 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 2 });
const gold0 = s2.players[0].resources.gold;
const wood0 = s2.players[0].resources.wood;
const got = E.tradeResource(s2, 0, 'wood', 'gold', 2);
ok('wymiana drewno→złoto: +1 złoto (kurs 2:1)', got === 1);
ok('drewno zmalało', s2.players[0].resources.wood === wood0 - 2);
ok('złoto wzrosło', s2.players[0].resources.gold === gold0 + 1);
// złoto → surowiec
const got2 = E.tradeResource(s2, 0, 'gold', 'ore', 10);
ok('wymiana złoto→ruda: +2 rudy (kurs 5:1)', got2 === 2);

console.log('N3) Obserwatorium — odkrycie mgły');
let s3 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 3 });
const hero = s3.players[0].heroes[0];
// wybierz daleki punkt
const fx = Math.floor(s3.W / 2), fy = Math.floor(s3.H / 2);
ok('przed: środek mapy nieodkryty', s3.fog[0].exp[fy][fx] === false);
E.revealArea(s3, 0, fx, fy, 5);
ok('po odkryciu: środek widoczny', s3.fog[0].exp[fy][fx] === true);
ok('po odkryciu: widać', s3.fog[0].vis[fy][fx] === true);

console.log('N4) Dzielenie jednostek');
let army = [{ key: 'cas1', count: 10 }];
E.splitStack(army, 0, 4, true);
ok('stos oryginalny: 6', army[0].count === 6);
ok('nowy stos: 4', army.length === 2 && army[1].count === 4);

console.log('N5) Zapis / wczytanie (serialize/deserialize)');
let s5 = E.newGame({ players: [{ name: 'A', faction: 'castle' }, { name: 'B', faction: 'dungeon' }], size: 'S', seed: 5 });
E.hireHero(s5, s5.map.towns[0].id);
const json = E.serialize(s5);
ok('stan się serializuje', json.length > 100);
const loaded = E.deserialize(json);
ok('wczytano poprawnie', loaded.players.length === 2 && loaded.players[0].heroes.length === 2);
ok('logika działa po wczytaniu', !!E.reachable(loaded, loaded.players[0].heroes[0].x, loaded.players[0].heroes[0].y, 500));
E.endTurn(loaded);
ok('tura się zmienia po wczytaniu', loaded.turn === 1);

console.log('N6) Flagowane siedlisko — zbieranie jednostek');
let s6 = E.newGame({ players: [{ name: 'A', faction: 'castle' }], size: 'S', seed: 6 });
const hero6 = s6.players[0].heroes[0];
// symuluj flagowane siedlisko
let dw = null;
for (const id in s6.map.objects) { if (s6.map.objects[id].type === 'dwelling') { dw = s6.map.objects[id]; break; } }
ok('jest siedlisko na mapie', !!dw);
if (dw) { dw.owner = 0; dw.stored = 8; delete dw.guard;
  const collected = E.collectDwelling(s6, hero6, dw.id);
  ok('zebrano 8 jednostek', collected === 8);
  ok('bohater ma jednostki z siedliska', hero6.army.some(a => a.key === dw.unitKey));
  ok('siedlisko puste', dw.stored === 0);
}

console.log('\nWynik: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
