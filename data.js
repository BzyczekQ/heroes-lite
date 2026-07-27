/* ============================================================
   HEROES LITE — DANE GRY (frakcje, jednostki, surowce, czary)
   Współdzielone między przeglądarką (window.H3DATA) a Node (exports).
   ============================================================ */
(function (mod) {
  'use strict';

  // 7 surowców jak w HoMM3
  mod.RESOURCES = ['gold', 'wood', 'ore', 'mercury', 'sulfur', 'crystal', 'gems'];
  mod.RES_INFO = {
    gold:    { name: 'Złoto',    emoji: '🪙' },
    wood:    { name: 'Drewno',   emoji: '🪵' },
    ore:     { name: 'Ruda',     emoji: '🪨' },
    mercury: { name: 'Rtęć',     emoji: '🔷' },
    sulfur:  { name: 'Siarka',   emoji: '🟡' },
    crystal: { name: 'Kryształ', emoji: '🔴' },
    gems:    { name: 'Klejnoty', emoji: '💎' }
  };

  // --- FRAKCJE (każda 7 poziomów jednostek, jak w HoMM3) ---
  mod.FACTIONS = {
    castle: {
      name: 'Zamek', emoji: '🏰', hero: '🤺', color: '#3a7be0',
      units: [
        { key: 'cas1', name: 'Pikinier',    tier: 1, atk: 5,  def: 4,  dmg: [3, 5],   hp: 10,  speed: 4, growth: 14, cost: { gold: 60,  ore: 1 },            emoji: '🛡️' },
        { key: 'cas2', name: 'Łucznik',     tier: 2, atk: 6,  def: 3,  dmg: [2, 3],   hp: 10,  speed: 5, growth: 9,  cost: { gold: 100, wood: 1 },          ranged: true, shots: 24, emoji: '🏹' },
        { key: 'cas3', name: 'Gryf',        tier: 3, atk: 8,  def: 8,  dmg: [3, 6],   hp: 25,  speed: 6, growth: 4,  cost: { gold: 240 },                   flying: true, emoji: '🦅' },
        { key: 'cas4', name: 'Zbrojny',     tier: 4, atk: 10, def: 12, dmg: [7, 9],   hp: 35,  speed: 5, growth: 3,  cost: { gold: 300 },                   emoji: '⚔️' },
        { key: 'cas5', name: 'Mnich',       tier: 5, atk: 9,  def: 8,  dmg: [10, 12], hp: 30,  speed: 5, growth: 3,  cost: { gold: 400 },                   ranged: true, shots: 12, emoji: '🙏' },
        { key: 'cas6', name: 'Kawalerzysta',tier: 6, atk: 15, def: 15, dmg: [7, 13],  hp: 60,  speed: 7, growth: 2,  cost: { gold: 1000 },                  emoji: '🐎' },
        { key: 'cas7', name: 'Anioł',       tier: 7, atk: 20, def: 20, dmg: [50, 60], hp: 180, speed: 9, growth: 1,  cost: { gold: 3000, gems: 1 },         flying: true, emoji: '😇' }
      ]
    },
    dungeon: {
      name: 'Loch', emoji: '🕯️', hero: '🧙', color: '#9b59b6',
      units: [
        { key: 'dun1', name: 'Troglodyta', tier: 1, atk: 4,  def: 3,  dmg: [2, 3],   hp: 5,   speed: 4, growth: 14, cost: { gold: 50 },                    emoji: '🦎' },
        { key: 'dun2', name: 'Harpi',      tier: 2, atk: 6,  def: 4,  dmg: [2, 4],   hp: 14,  speed: 6, growth: 9,  cost: { gold: 130 },                   flying: true, emoji: '🦇' },
        { key: 'dun3', name: 'Złe Oko',    tier: 3, atk: 9,  def: 7,  dmg: [3, 5],   hp: 22,  speed: 5, growth: 8,  cost: { gold: 250 },                   ranged: true, shots: 12, emoji: '👁️' },
        { key: 'dun4', name: 'Minotaur',   tier: 4, atk: 12, def: 12, dmg: [6, 11],  hp: 50,  speed: 6, growth: 3,  cost: { gold: 400 },                   emoji: '🐂' },
        { key: 'dun5', name: 'Meduza',     tier: 5, atk: 9,  def: 10, dmg: [6, 10],  hp: 25,  speed: 5, growth: 3,  cost: { gold: 500 },                   ranged: true, shots: 8, emoji: '🐍' },
        { key: 'dun6', name: 'Mantykora',  tier: 6, atk: 14, def: 13, dmg: [12, 14], hp: 80,  speed: 7, growth: 2,  cost: { gold: 1000, sulfur: 1 },       flying: true, emoji: '🦁' },
        { key: 'dun7', name: 'Smok',       tier: 7, atk: 19, def: 19, dmg: [40, 60], hp: 180, speed: 9, growth: 1,  cost: { gold: 2500, sulfur: 1 },       flying: true, emoji: '🐉' }
      ]
    },
    necro: {
      name: 'Nekropolia', emoji: '💀', hero: '🧟', color: '#43b85a',
      units: [
        { key: 'nec1', name: 'Szkielet',   tier: 1, atk: 5,  def: 4,  dmg: [1, 3],   hp: 6,   speed: 4, growth: 14, cost: { gold: 60 },                    emoji: '💀' },
        { key: 'nec2', name: 'Zombie',     tier: 2, atk: 5,  def: 5,  dmg: [2, 3],   hp: 15,  speed: 3, growth: 9,  cost: { gold: 100 },                   emoji: '🧟' },
        { key: 'nec3', name: 'Widmo',      tier: 3, atk: 7,  def: 7,  dmg: [4, 6],   hp: 18,  speed: 7, growth: 4,  cost: { gold: 200 },                   flying: true, emoji: '👻' },
        { key: 'nec4', name: 'Wampir',     tier: 4, atk: 10, def: 9,  dmg: [6, 10],  hp: 30,  speed: 6, growth: 3,  cost: { gold: 360 },                   emoji: '🧛' },
        { key: 'nec5', name: 'Lisz',       tier: 5, atk: 11, def: 9,  dmg: [8, 12],  hp: 40,  speed: 5, growth: 3,  cost: { gold: 500 },                   emoji: '🪰' },
        { key: 'nec6', name: 'Czarny Ryc.',tier: 6, atk: 16, def: 16, dmg: [12, 15], hp: 70,  speed: 7, growth: 2,  cost: { gold: 1200 },                  emoji: '🏇' },
        { key: 'nec7', name: 'Kościany Smok',tier:7, atk:17, def: 18, dmg: [25, 45], hp: 150, speed: 9, growth: 1,  cost: { gold: 2500, mercury: 1 },      flying: true, emoji: '🦴' }
      ]
    }
  };

  // koszt budowy siedliska (budynku) dla danego poziomu
  mod.DWELLING_COST = {
    1: { gold: 400,  wood: 5 },
    2: { gold: 600,  wood: 5 },
    3: { gold: 1000, wood: 5 },
    4: { gold: 1500, ore: 5 },
    5: { gold: 2000, crystal: 3 },
    6: { gold: 3000, gems: 3 },
    7: { gold: 5000, gems: 2, sulfur: 2 }
  };

  // ulepszenia ratusza (dochód dzienny)
  mod.HALL_LEVELS = [
    { name: 'Wieś',     income: 500 },
    { name: 'Ratusz',   income: 1000 },
    { name: 'Kapitol',  income: 2000 }
  ];
  mod.HALL_UPGRADE_COST = { gold: 2500 };

  // --- NEUTRALNE POTWORY (strażnicy mapy) ---
  mod.NEUTRALS = [
    { key: 'peasant', name: 'Chłopi',    atk: 1,  def: 1,  dmg: [1, 1],   hp: 3,   speed: 3, emoji: '🧑‍🌾' },
    { key: 'goblin',  name: 'Gobliny',   atk: 3,  def: 2,  dmg: [1, 3],   hp: 5,   speed: 5, emoji: '👺' },
    { key: 'wolf',    name: 'Wilki',     atk: 7,  def: 5,  dmg: [3, 5],   hp: 15,  speed: 6, emoji: '🐺' },
    { key: 'ogre',    name: 'Ogary',     atk: 9,  def: 9,  dmg: [6, 8],   hp: 40,  speed: 4, emoji: '👹' },
    { key: 'golem',   name: 'Golemy',    atk: 10, def: 10, dmg: [4, 6],   hp: 35,  speed: 3, emoji: '🗿' },
    { key: 'ghost',   name: 'Duchy',     atk: 10, def: 10, dmg: [8, 12],  hp: 30,  speed: 5, flying: true, emoji: '👻' },
    { key: 'giant',   name: 'Giganci',   atk: 15, def: 13, dmg: [20, 30], hp: 120, speed: 5, emoji: '🦣' }
  ];

  // --- CZARY BOJOWE (uproszczone) ---
  mod.SPELLS = {
    magicArrow: { name: 'Magiczna Strzała', mana: 3, effect: 'damage', dmg: [15, 25], school: 'Powietrze' },
    lightning:  { name: 'Piorun',           mana: 10, effect: 'damage', dmg: [40, 60], school: 'Powietrze' },
    cure:       { name: 'Leczenie',         mana: 6,  effect: 'heal',   heal: [25, 40], school: 'Woda' },
    bloodlust:  { name: 'Żądza Krwi',       mana: 3,  effect: 'buff',   buff: 'atk', amount: 6, school: 'Ogień' }
  };

  // mapa wszystkich jednostek (frakcyjne + neutralne) do szybkiego lookupu
  mod.ALL_UNITS = {};
  for (const f in mod.FACTIONS) mod.FACTIONS[f].units.forEach(u => mod.ALL_UNITS[u.key] = Object.assign({ faction: f }, u));
  mod.NEUTRALS.forEach(u => mod.ALL_UNITS[u.key] = Object.assign({ neutral: true }, u));

  mod.HERO_BASE_MP = 1600;     // bazowe punkty ruchu na turę
  mod.STARTING_RESOURCES = { gold: 5000, wood: 10, ore: 10, mercury: 5, sulfur: 5, crystal: 5, gems: 5 };
  mod.PLAYER_COLORS = ['#3a7be0', '#e0524a', '#43b85a', '#b85ad0', '#e0a52a', '#3ab8b8'];
  mod.MAP_SIZES = {
    S: { w: 22, h: 22, name: 'Mała' },
    M: { w: 30, h: 30, name: 'Średnia' },
    L: { w: 40, h: 40, name: 'Duża' }
  };

})(typeof module !== 'undefined' ? module.exports : (window.H3DATA = window.H3DATA || {}));
