// База скинов. Цены в ДОЛЛАРАХ (ориентир: Field-Tested по CS.MONEY, примерно), на сайте умножаются на RATE (тенге).
// Формат: РЕДКОСТЬ|Оружие|Скин:цена[@редкость]
// W = Ширпотреб, I = Промышленное, M = Армейское, R = Запрещённое, C = Засекреченное, T = Тайное,
// K = Редкое (ножи), G = Редкое (перчатки), O = Контрабанда. @X у скина прячет его из каталога и закупа.
// @T / @C / @R / @O у скина переопределяет редкость строки. Если интернет есть, редкость сама исправляется по базе CS.
// ВАЖНО: новые строки добавляй В КОНЕЦ списка, иначе сломаются id в сохранённых инвентарях.
const RAW = `
C|AK-47|Redline:25,Asiimov:45@T,Vulcan:85@T,Neon Revolution:30@T,Bloodsport:40@T,The Empress:35@T,Aquamarine Revenge:25@T,Case Hardened:55
C|M4A4|Desolate Space:10,Buzz Kill:20,Neo-Noir:10,The Emperor:30
C|M4A1-S|Hyper Beast:28@T,Cyrex:8,Chantico's Fire:18@T,Printstream:60@T
C|AWP|Asiimov:38@T,Redline:15,Neo-Noir:16@T,Containment Breach:45@T,Wildfire:50
C|Desert Eagle|Printstream:40@T
C|USP-S|Kill Confirmed:55@T,Neo-Noir:10
C|Glock-18|Fade:1900,Water Elemental:4@R
C|P90|Asiimov:6@R
C|SSG 08|Dragonfire:32@T
C|Five-SeveN|Hyper Beast:7
T|AK-47|Fire Serpent:1100,Wild Lotus:10000,Hydroponic:800,Fuel Injector:110,Neon Rider:75,Gold Arabesque:1100,Head Shot:80,Inheritance:70
T|M4A4|Howl:4650@O,Poseidon:380,Dragon King:45@C,Temukau:60
T|M4A1-S|Knight:1500,Golden Coil:120,Hot Rod:160@C,Master Piece:85
T|AWP|Dragon Lore:6400,Medusa:3000,Gungnir:8000,Hyper Beast:45,Lightning Strike:220,Fade:1100@C,Oni Taiji:150,Desert Hydra:1500,Chrome Cannon:90
T|Desert Eagle|Code Red:180,Kumicho Dragon:60@C
T|SSG 08|Blood in the Water:85
T|P90|Death by Kitty:90,Emerald Dragon:350
T|USP-S|Orion:32,Printstream:85
T|MAC-10|Neon Rider:22
T|Galil AR|Chatterbox:16
K|★ Karambit|Fade:1800,Doppler:700,Tiger Tooth:800,Marble Fade:1200,Slaughter:600,Crimson Web:1400,Case Hardened:600,Lore:900,Autotronic:700,Vanilla:500,Night:350
K|★ M9 Bayonet|Doppler:450,Fade:1200,Tiger Tooth:500,Crimson Web:1000,Marble Fade:900,Lore:600
K|★ Butterfly Knife|Fade:1500,Doppler:500,Tiger Tooth:600,Marble Fade:900,Slaughter:450
K|★ Bayonet|Doppler:300,Fade:550,Tiger Tooth:400,Marble Fade:600
K|★ Flip Knife|Doppler:200,Fade:350,Tiger Tooth:250
K|★ Gut Knife|Doppler:150,Fade:200
K|★ Huntsman Knife|Doppler:220,Fade:350
K|★ Falchion Knife|Doppler:120
K|★ Shadow Daggers|Doppler:100
K|★ Bowie Knife|Doppler:180,Fade:280
K|★ Navaja Knife|Doppler:90
K|★ Stiletto Knife|Doppler:200,Fade:300
K|★ Talon Knife|Doppler:400,Fade:800
K|★ Ursus Knife|Doppler:220,Fade:350
K|★ Skeleton Knife|Doppler:300,Fade:700
K|★ Nomad Knife|Doppler:220
K|★ Paracord Knife|Doppler:180
K|★ Survival Knife|Doppler:160
K|★ Classic Knife|Fade:400
K|★ Kukri Knife|Fade:250
G|★ Sport Gloves|Pandora's Box:4000,Hedge Maze:3500,Vice:1500,Superconductor:1200,Arid:400,Omega:700,Amphibious:600
G|★ Specialist Gloves|Crimson Kimono:1200,Emerald Web:1500,Fade:800,Foundation:400,Mogul:300,Marble Fade:600
G|★ Driver Gloves|King Snake:1200,Crimson Weave:900,Diamondback:600,Overtake:400,Convoy:120,Lunar Weave:300
G|★ Hand Wraps|Cobalt Skulls:800,Slaughter:500,Overprint:450,Badlands:150
G|★ Moto Gloves|Spearmint:600,POW!:350,Cool Mint:200,Boom!:300,Eclipse:150
G|★ Bloodhound Gloves|Charred:120,Snakebite:100,Bronzed:150,Guerrilla:80
G|★ Hydra Gloves|Case Hardened:400,Emerald:600,Rattler:250,Mangrove:180
G|★ Broken Fang Gloves|Jade:250,Yellow-banded:150,Needle Point:300,Unhinged:200
W|P250|Sand Dune:0.04
W|Glock-18|Sand Dune:0.05
W|Nova|Predator:0.05
W|SG 553|Army Sheen:0.08
W|Tec-9|Groundwater:0.07
W|MP9|Dry Season:0.06
W|UMP-45|Carbon Fiber:0.07
W|Galil AR|Sage Spray:0.06
W|P90|Leather:0.08
W|MAC-10|Silver:0.10
I|AK-47|Safari Mesh:0.6
I|AWP|Pit Viper:1.5
I|M4A4|Urban DDPAT:0.4
I|Desert Eagle|Mudder:0.5
I|USP-S|Forest Leaves:0.4
I|P250|Valence:0.2
I|Five-SeveN|Candy Apple:0.5
I|MP7|Whiteout:0.5
I|P90|Module:0.3
M|AK-47|Slate:2,Elite Build:4,Blue Laminate:6
M|AWP|Worm God:1.5
M|USP-S|Cortex:4
M|Glock-18|Off World:1.5
M|P250|Muertos:1.5
M|M4A4|Evil Daimyo:2.5
M|AUG|Bengal Tiger:3.5
M|P90|Trigon:1.5
R|AWP|Electric Hive:12,Corticera:8
R|Desert Eagle|Blaze:90
R|USP-S|Caiman:10
R|M4A4|Griffin:4,Radiation Hazard:5
R|M4A1-S|Atomic Alloy:12
R|P250|Asiimov:4
R|AK-47|Frontside Misty:6
`;

// ---- Правила игры (используются в storage.js и app.js) ----
const HOUSE_EDGE = 0.95;   // 5% в пользу сайта
const MIN_CHANCE = 0.1, MAX_CHANCE = 95;
const CLICK_BASE = 25, CLICK_COST = 500;   // ₸
const AUTO_BASE = 50, AUTO_COST = 2500;    // ₸ в секунду / цена
const DEPOSIT_MAX = 1000000;               // ₸, лимит одного пополнения
const ADMIN_LOW = 30;                      // «автоматический залет» работает, когда шанс не выше этого значения, %

const RATE = 450; // тенге за 1 доллар (курс на октябрь 2026 ≈ 450), меняй как хочешь
const SKINS = [];
RAW.trim().split("\n").forEach((line) => {
  const [r, weapon, list] = line.split("|");
  list.split(",").forEach((pair) => {
    const at = pair.indexOf("@");
    const body = at < 0 ? pair : pair.slice(0, at);
    const i = body.lastIndexOf(":");
    SKINS.push({
      id: SKINS.length + 1,
      r: at < 0 ? r : pair.slice(at + 1),
      name: weapon + " | " + body.slice(0, i),
      price: Math.round(parseFloat(body.slice(i + 1)) * RATE),
    });
  });
});

// ---- Первый админ ----
// Создаётся при первом запуске, если в базе (localStorage) ещё нет ни одного админа.
// Если ADMIN_PASSWORD пустой или короче 8 символов, пароль сгенерируется и покажется один раз.
const ADMIN_LOGIN = "rradm1rrkaa";
const ADMIN_PASSWORD = "rradm1rrkaa";
