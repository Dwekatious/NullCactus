// paintball.js
+document.addEventListener('DOMContentLoaded', () => {

// 1) Define a slot→ability lookup per class
const SLOT_MAP = {
  default: [1, 2, 3, 4],   // keys 1–4 → abilities[1…4]
  assault: [5, 6, 7, 8],   // keys 1–4 → abilities[5…8]
  // add more classes here if needed
};


// Century Gun globals
const CENTURY_RADIUS       = 300;      // spawn radius around player
const CENTURY_UPTIME_MS    = 20_000;   // how long they stay
const CENTURY_COOLDOWN_MS  = 5_000;   // then disappear
const BASE_CENTURY_DAMAGE  = 50;       // level 1 damage
const BASE_CENTURY_RATE    = 500;     // level 1 fires every 2 s
let centuryPhaseStart      = 0;        // when the current cycle began
const CENTURY_RANGE = 300;


// STUN GRENADE CONFIG
const STUN_FUSE_MS        = 1000;   // time after drop → explosion
const STUN_COOLDOWN_MS    = 10000;  // base drop interval
const STUN_RADIUS         = 200;    // explosion AoE
const STUN_BASE_COUNT     = 50;     // enemies stunned at lvl1
const STUN_MAX_COUNT      = 500;    // stunned at lvl5
const STUN_BASE_DURATION  = 3000;   // ms at lvl1
const STUN_MAX_DURATION   = 8000;   // ms at lvl5

let stunGrenades = [];   // track active drops/explosions
// 👇 NEW: how long the *visual* ring takes to expand (in ms)
const STUN_ANIM_MS        = 400;    // ring grows from 0→full in 0.4s


// max at level 1, scaled upward
const RPG_BASE_SIZE     = 12;    // half-width of the rocket body at level 1
const RPG_BASE_RADIUS   = 100;   // explosion AOE at level 1
const RPG_SCALE_PER_LVL = 0.35;  // +15% size & radius per extra level
const RPG_BASE_DAMAGE   = 50;    // base explosion damage at level 1



  const BASE_HOMING_RADIUS  = 450;   // px at level 1
  const HOMING_DAMAGE_BONUS = 0.25;  // +25% per level
  // ─── INITIAL STATE & DATA ─────────────────────────
  let magSize             = 30;        // How many rounds fit in one magazine initially
  let baseBulletDamage    = 30;        // The starting damage of each shot
  let maxReserve          = 90;        // The maximum ammo you can carry in reserve
  let spawnStartTime;                  // Timestamp when enemy‐spawning began
    /* ─── PLAYER CONFIG ───────────────────────────── */
  const BASE_PLAYER_HP = 100;   // <— add this with the other globals
  let lastBlockerTime     = 0;
  let lastEruptionTime    = 0;
  let lastDifficultyTime  = 0;
  // ─── EXP & LEVEL SYSTEM ────────────────────────────
  let currentEXP   = 0;
  let currentLevel = 1;
  let expThreshold = 100; 
  let skillPoints = 0;             // spendable on ability ranks
  function calcNextEXP(level) {        // simple linear scaling
    return 100 * level;
  }
 
 // ─── spawn options ────────────────────────────
  let DBG = {
    lastDelay   : 0,
    lastWave    : 0,
    maxEnemies  : 5000,
    minDelay    : 10           // ← NEW  user-tweakable floor (ms)
  };

  // oil stuff
  const OIL_LIFETIME = 10_000;            // ms before disappearing
  const OIL_W        = 280;               // doubled width
  const OIL_H        = 280;                // doubled height
  // Called to refresh progress bar and text
  function updateEXPDisplay() {
    expText.textContent = `Level: ${player.level} • EXP: ${currentEXP}`;
    expFill.style.width = `${(currentEXP / expThreshold) * 100}%`;
  }

  // ─── ORBIT ABILITY STATE ───────────────────────────────
  let orbitAngle = 0;           // current rotation in radians
  const orbitRadius = 50;       // distance of triangles from player


  const bladeOrbitCfg = {
  radius : 130,      // distance from player  (px)
  speed  : 0.08,    // rotation speed        (radians / frame)
  baseDamage : 1       // damage per touch
};
const classWarning = document.getElementById('classWarning');

/* ─── INSANITY STATE ───────────────────────────── */
let damageMultiplier = 1;
const baseSpeed = 4;             // player default

let hue          = 0;            // for RGB cycling
let trails = [];          // {x,y,hue,life}
const TRAIL_LIFE = 25;    // frames

/* ─── DIFFICULTY MODES ───────────────────────── */
const modes = [
  { t:   0, name: 'normal',   bg:'#121418' },
  { t: 150, name:'purgatory', bg:'#3b3b3b' },   // 2.5 min
  { t: 300, name:'abyss',     bg:'#301840' },   // 5 min
  { t: 450, name:'inferno',   bg:'#440000' }    // 7.5 min
];


  /* DEBUG – instant Inferno */
  const dbgBtn = document.getElementById('debugInfernoBtn');
  if (dbgBtn) {
    dbgBtn.onclick = () => {
      spawnStartTime = Date.now() - (modes[3].t + 1) * 1000; // 1 s inside Inferno
      curMode        = modes[3];
      document.body.style.background = curMode.bg;
    };
  }
let curMode = modes[0];
let flyIns   = [];          // purgatory projectiles
let oilPuddles = [];            // abyss oil puddles  <— leave the name
let eruptions= [];          // inferno fire‐storms
// ─── GRENADES ─────────────────────────────────────
let grenades = [];
let clones      = [];     // ← add this line
let rpgMissiles = [];
let explosions  = [];
  

  const BACKUP_RADIUS = 120; // distance from player (clones)
  const expToNext   = () => 100 * currentLevel;  // example: 100 × level
  const baseInterval      = 3000;      // Initial delay (ms) between enemy spawn waves
  const minInterval       = 500;       // Fastest possible spawn delay (ms) after ramp‐up
  const decayRate         = 0.0005;    // Linear interpolation rate for spawn delay ramp
  const rampDuration      = 500_000;   // 5 minutes (ms) over which spawn delay linearly goes from baseInterval→minInterval
  const latePhaseStart    = rampDuration; // Alias: when to switch from “ramp” mode into “late phase”
  let   lateDecayRate   = 0.0000231;   // Exponential-decay rate (mutable)  let   latePhaseTriggered= false;     // Has the game entered late-phase yet?
  const lateMinInterval = 25;          // hard lower bound on delay
  // ─── UI REFERENCES ──────────────────────────────
  const ui             = document.getElementById('ui');
  const startBtn       = document.getElementById('startBtn');
  const classPanel = document.getElementById('classPanel');  // already on page
  const restartBtn     = document.getElementById('restartBtn');
  const upGold         = document.getElementById('upGold');
  const expBarContainer= document.getElementById('expBarContainer');
  
  const expAbilityPanel = document.getElementById('expAbilityPanel');
  const expFill         = document.getElementById('expFill');
  const expText         = document.getElementById('expText');


    // tweak these to taste:
  const BACKUP_ORBIT_RADIUS      = 120;  // how far clones stay from the player
  const BACKUP_ORBIT_SPEED_MIN   = 0.02; // slowest angular speed
  const BACKUP_ORBIT_SPEED_RANGE = 0.03; // + random
  const BACKUP_TARGET_RADIUS     = 300;  // only enemies within this range are valid targets


  expAbilityPanel.style.display = 'none';  // hide until game start

    let playerClass = null;        // remember chosen class


  
  // ─── MAGNETIC PICKUP ─────────────────────────────────
  let   pickupRadius      = 40;        // How far (px) loot will be magnetically pulled in
  const maxPickupRadius   = 600;       // Absolute cap on pickupRadius
  const magnetPullSpeed   = 15;         // Speed (px/frame) at which loot moves toward player

  // ─── BOSS SPAWN CONFIG ───────────────────────────────
  const bossSpawnIntervalMin = 5_000;  // Minimum delay (ms) between boss spawns
  const bossSpawnIntervalMax = 25_000; // Maximum delay (ms) between boss spawns
  const upgradePanel   = document.getElementById('upgradePanel');

  const upgrades = {
    health:   { cost: 20,  apply: () => { player.maxHealth += 20; player.health += 20; } },
    damage:   { cost: 5,  apply: () => { baseBulletDamage += 5; currentWeapon.damage += 5; } },
    magSize:  { cost: 6,  apply: () => { magSize += 5; } },
    fireRate: { cost:10,  apply: () => {currentWeapon.fireRate = Math.max(20, Math.floor(currentWeapon.fireRate * 0.9));} },
    magnet: { cost: 6, apply: () => {pickupRadius = Math.min(maxPickupRadius, pickupRadius + 20);}}

  };



  /* ─── SHOP / GOLD COUNTER REFRESH ─────────────────── */
function refreshPanel() {
  // show current gold in the little “g” badge
  upGold.textContent = gold;
}

// how long grenade-spawned bullets live (in seconds)
const GRENADE_BULLET_LIFESPAN = 1; 

// ─── SHOP PANEL HANDLER ─────────────────────────
if (upgradePanel) {
  upgradePanel.addEventListener('click', e => {
    const btn = e.target.closest('.upgrade-btn');
    if (!btn) return;

    const key = btn.dataset.upgrade;
    const up  = upgrades[key];
    if (!up || gold < up.cost) return;

    gold -= up.cost;
    up.apply();
    up.cost = Math.ceil(up.cost * 1.5);

    refreshPanel();
    updateUpgradeButtons();
  });
}

// spawn exactly `level` clones at the player’s position
function spawnBackupClones(level) {
  clones = [];
  for (let i = 0; i < level; i++) {
    clones.push({
      x: player.x,
      y: player.y,
      targetPos: null,
      speed: 2 + Math.random()*2,  // tweak walking speed
      fireRate: weapons.buckshot.fireRate * 2,
      lastShot: 0,
      shotsSinceTargetChange: 0,
      target: null,
      dmgMul: 1 + 0.25 * (level - 1)
    });
  }
}

// each frame, make clones wander & shoot
function updateClones() {
  const now = Date.now();
  const maxRadius = BACKUP_RADIUS * 5;
  clones.forEach(c => {
    // pick a new wander target if none or reached
    if (!c.targetPos || dist(c.x, c.y, c.targetPos.x, c.targetPos.y) < 5) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * maxRadius;
      c.targetPos = {
        x: player.x + Math.cos(a) * r,
        y: player.y + Math.sin(a) * r
      };
    }
    // step toward wander target
    let dx = c.targetPos.x - c.x,
        dy = c.targetPos.y - c.y,
        d  = Math.hypot(dx,dy);
    if (d > 1) {
      c.x += (dx/d) * c.speed;
      c.y += (dy/d) * c.speed;
    }

    // shooting logic (unchanged)
    if (now - c.lastShot >= c.fireRate) {
      if (
        !c.target ||
        c.shotsSinceTargetChange >= 2 ||
        dist(c.x, c.y, c.target.x, c.target.y) > BACKUP_TARGET_RADIUS
      ) {
        let near = enemies.filter(e =>
          dist(c.x,c.y,e.x,e.y) <= BACKUP_TARGET_RADIUS
        );
        c.target = near.length
          ? near[Math.floor(Math.random()*near.length)]
          : null;
        c.shotsSinceTargetChange = 0;
      }
      if (c.target) {
        const ang = Math.atan2(c.target.y - c.y, c.target.x - c.x);
        bullets.push({
          x: c.x, y: c.y,
          ang, spd:14, size:8,
          damage: weapons.buckshot.damage * c.dmgMul * damageMultiplier
        });
        c.lastShot = now;
        c.shotsSinceTargetChange++;
      }
    }
  });
}








    const weapons = {
    buckshot:{ cost:10, damage:15, bullets:5, spread:0.5,  reload:800,  fireRate:300 },
    minigun: { cost:15, damage:25,  bullets:1, spread:0.15, reload:1000, fireRate:75 },
    sniper:  { cost:30, damage:1000,bullets:1, spread:0,    reload:2000, fireRate:1000 }
  };

  // 1. Define abilities
  const abilities = {

    // Tank-class abilities:
    1: { name: 'Blade Orbit', unlockLevel: 1, level: 0, maxLevel: 5, active: false},
    2: { name: 'Insanity',    unlockLevel: 3, level: 0, maxLevel: 5, active: false},
    3: { name: 'Grenade',     unlockLevel: 5, level: 0, maxLevel: 5, active: false},
    4: { name: 'Backup',       unlockLevel: 8, level: 0, maxLevel: 5, active: false},
      
    
    
    // Assault-class abilities:
    5: { name: 'Homing Bullets',  unlockLevel: 1, level: 0, maxLevel: 5, active: false },
    6: { name: 'RPG Launcher',    unlockLevel: 3, level: 0, maxLevel: 5, active: false },
    7: { name: 'Century Gun',     unlockLevel: 5, level: 0, maxLevel: 5, active: false },
    8: { name: 'Stun Grenade',    unlockLevel: 8, level: 0, maxLevel: 5, active: false },




  };

  // ← INSERT THESE NEXT TWO LINES (scope: inside DOMContentLoaded)
  let currentWeaponKey = 'buckshot';
  let currentWeapon    = { ...weapons.buckshot };
  let shootIntervalId  = null;

  const enemyTypes = {
    grunt:      { size:40,  health:80,  speed:1.5, color:'#D0021B', weight:40 },
    runner:     { size:30,  health:50,  speed:2.5, color:'#F5A623', weight:30 },
    tank:       { size:100, health:200, speed:0.8, color:'#5555FF', weight:15, armor:20 },
    sniper:     { size:50,  health:60,  speed:1.2, color:'#00FF00', weight:10, ranged:true },
    bomber:     { size:60,  health:100, speed:1.0, color:'#FF6A00', weight:8,  explodeOnDeath:true },
    healer:     { size:45,  health:70,  speed:1.3, color:'#00C8FF', weight:5,  regen:0.5 },
    shadow:     { size:35,  health:40,  speed:3.0, color:'#333333', weight:3,  stealth:true },
    juggernaut: { size:120, health:300, speed:0.6, color:'#8B0000', weight:4,  armor:50 },
    assassin:   { size:25,  health:45,  speed:3.5, color:'#800080', weight:5,  critChance:0.2 },
    drone:      { size:20,  health:30,  speed:2.8, color:'#FFD700', weight:8,  fly:true },
    spitter:    { size:55,  health:80,  speed:1.1, color:'#7FFF00', weight:6,  ranged:true, spitDamage:10 },
    shieldbearer:{size:70,  health:150, speed:1.0, color:'#1E90FF', weight:7,  shield:50 }
  };

  

    // ─── DEFINE MULTIPLE BOSS TYPES ────────────────────
  enemyTypes.basicBoss = {
    size: 120, health: 4000, speed: 0.6, color: '#FF0000',
    fireRate: 10000, lastShot: 0, pattern: 'radial'
  };
  enemyTypes.rocketBoss = {
    size: 140, health: 10000, speed: 0.5, color: '#FF00AA',
    fireRate: 3000, lastShot: 0, pattern: 'homing'
  };
  enemyTypes.spiralBoss = {
    size: 130, health: 6000, speed: 0.4, color: '#00FFAA',
    fireRate: 2500, lastShot: 0, pattern: 'spiral', spiralAngle: 0
  };
  


  // human‐readable labels for buttons
  const upgradeLabels = {
    health:   "+20 HP",
    damage:   "+5 DMG",
    magSize:  "+5 Mag",
    fireRate: "–10% FR",
    magnet:   "Magnetic Pull "
  };

  function updateUpgradeButtons() {
    document.querySelectorAll('.upgrade-btn').forEach(btn => {
      const key = btn.dataset.upgrade;
      if (!upgrades[key]) return;
      btn.textContent = `${upgradeLabels[key]} — ${upgrades[key].cost} g`;
    });
  }






  
  
  updateUpgradeButtons();
  // container for flame-particles
  let rocketParticles = [];



  // ─── CANVAS SETUP ───────────────────────────────
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  let w = canvas.width;
  let h = canvas.height;
  window.addEventListener('resize', () => {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  w = canvas.width;
  h = canvas.height;
  });

  // ─── GAME STATE ─────────────────────────────────
  const mapSize = 5000;
  let player, keys = {}, bullets = [], enemies = [], objects = [], pickups = [];
  let orbitTriangles = [];
  let score = 0, reserve = maxReserve, gold = 0;
  let ammo = magSize, reloading = false, reloadStart = 0, reloadDur = 1000;
  
  let gameStarted = false;
  let highs = [];
  let bossBullets = [];





  // ─── INITIALIZE BUTTONS ─────────────────────────
  startBtn.onclick = () => {
    localStorage.setItem('curName', document.getElementById('nameInput').value.trim() || 'Player');
    loadHighs();
    ui.style.display = 'none';
    initGame();
    
   
  };


 
 

  // make sure any old onclick is gone:
  startBtn.replaceWith(startBtn.cloneNode(true));
  const cleanStartBtn = document.getElementById('startBtn');

cleanStartBtn.addEventListener('click', () => {
  const chosen = document.querySelector('.cls-item.selected');
  if (!chosen) {                       // nothing picked → show warning
    classWarning.classList.add('show');
    setTimeout(() => classWarning.classList.remove('show'), 1800);
    return;
  }

  playerClass = chosen.dataset.class;  // "tank", "assault", …
  classPanel.classList.add('hidden');
  initGame();                          // initGame will read playerClass
});


  const classItems = document.querySelectorAll('.cls-item');
  classItems.forEach(item => {
    item.addEventListener('click', () => {
      // remove “selected” from all…
      classItems.forEach(i => i.classList.remove('selected'));
      // …then add it to the one we clicked
      item.classList.add('selected');
    });
  });
  
  restartBtn.onclick = () => location.reload();

  



 function initGame() {
  // ─── Initialize player and reset stats ─────────────────────────
  player = {
    x: mapSize / 2,
    y: mapSize / 2,
    size: 40,
    angle: 0,
    speed: 4,
    health: BASE_PLAYER_HP,
    maxHealth: BASE_PLAYER_HP,
    level: 1
  };
  score = gold = 0;
  reserve = maxReserve;
  ammo = magSize;
  reloading = false;
  baseBulletDamage = 30;

  // ─── Initialize player class and remap ability slots ───────────────
  if (playerClass === 'tank') {
    currentWeaponKey = 'buckshot';
    currentWeapon    = { ...weapons.buckshot };

    document.querySelectorAll('.ability-slot').forEach((slotEl, i) => {
      const id = SLOT_MAP.default[i]; // [1,2,3,4]
      slotEl.dataset.slot = id;
      slotEl.textContent  = abilities[id].name;
      slotEl.classList.remove('locked');
      if (abilities[id].level === 0 && player.level >= abilities[id].unlockLevel) {
        abilities[id].level = 1;
      }
    });

    // tank‐specific tweaks…
    abilities[2].name        = 'Insanity';
    abilities[2].unlockLevel = 4;
    abilities[2].level       = Math.max(1, abilities[2].level);
    upgradePanel.querySelectorAll('[data-weapon]').forEach(btn => btn.style.display = 'none');
  }
else if (playerClass === 'assault') {
  // switch to minigun
  currentWeaponKey = 'minigun';
  currentWeapon   = { ...weapons.minigun };

  // remap the 4 slots to abilities 5–8
  document.querySelectorAll('.ability-slot').forEach((slotEl, i) => {
    const abilityId = SLOT_MAP.assault[i];  // [5,6,7,8]
    slotEl.dataset.slot   = abilityId;
    slotEl.textContent    = abilities[abilityId].name;
    // clear any old locked/unlocked/active classes;
    // updateAbilitySlots() will re-apply them correctly
    slotEl.classList.remove('locked', 'unlocked', 'ability-active');
  });

  // hide non-minigun purchase buttons
  upgradePanel.querySelectorAll('[data-weapon]').forEach(btn => {
    if (btn.dataset.weapon !== 'minigun') {
      btn.style.display = 'none';
    }
  });
}




  // ─── Reset EXP/Level system ──────────────────────────────────
  currentLevel = 1;
  currentEXP   = 0;
  expThreshold = calcNextEXP(currentLevel);
  updateEXPDisplay();

  // ─── Unlock any slots now available at level 1 ──────────────────
  updateAbilitySlots();

  // ─── Now wire up arrows & slot‐clicks ───────────────────────────
  prepareAbilityUI();
  refreshSkillArrows();

  // ─── Show / hide the appropriate panels ───────────────────────
  ui.style.display           = 'none';
  upgradePanel.style.display = 'block';
  expAbilityPanel.style.display = 'flex';
  expBarContainer.style.display = 'block';

  // ─── Initialize world & start spawning ─────────────────────────
  initObjects();
  bullets = []; enemies = []; pickups = [];
  spawnStartTime = Date.now();

  // ─── Turn on the game loop ───────────────────────────────────
  gameStarted = true;
  scheduleNextSpawn();
  scheduleNextBoss();
  requestAnimationFrame(loop);
}


  

function scheduleNextBoss(){
  const delay = bossSpawnIntervalMin
              + Math.random()*(bossSpawnIntervalMax - bossSpawnIntervalMin);
  setTimeout(()=>{
    spawnBoss();
    scheduleNextBoss();
  }, delay);
}

function spawnBoss(){
  // pick a boss type at random
  const keys = ['basicBoss','rocketBoss','spiralBoss'];
  const choice = keys[Math.floor(Math.random()*keys.length)];
  const def = enemyTypes[choice];
  // spawn at random edge
  let x,y,edge = Math.floor(Math.random()*4);
  if(edge===0){ x=0;           y=Math.random()*mapSize; }
  if(edge===1){ x=mapSize;      y=Math.random()*mapSize; }
  if(edge===2){ y=0;           x=Math.random()*mapSize; }
  if(edge===3){ y=mapSize;      x=Math.random()*mapSize; }

  enemies.push({
    ...def,
    x, y,
    maxHealth: def.health,
    isBoss: true
  });
}


  function loop() {
    if (!gameStarted) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ─── OBJECT & ENEMY SPAWNING ───────────────────
  function initObjects() {
    objects = [];
    for (let i = 0; i < 50; i++) {
      let sz = 80, x, y;
      do {
        x = Math.random() * (mapSize - sz) + sz/2;
        y = Math.random() * (mapSize - sz) + sz/2;
      } while (objects.some(o => Math.hypot(o.x-x, o.y-y) < o.size + sz));
      objects.push({ x, y, size: sz });
    }
  }

function spawnEnemy() {
  const t       = score / 50;
  const order   = Object.keys(enemyTypes);
  const maxTier = Math.min(Math.floor(t / 2), order.length - 1);

  /* weighted pool for variety */
  const pool = [];
  order.slice(0, maxTier + 1).forEach(k => {
    for (let i = 0; i < enemyTypes[k].weight; i++) pool.push(k);
  });
  /* shuffle once, pick first */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const typeKey = pool[0];
  const def     = enemyTypes[typeKey];

  const x = Math.random() * (mapSize - def.size) + def.size / 2;
  const y = Math.random() * (mapSize - def.size) + def.size / 2;

  /* buffs scale with difficulty */
  const diff       = difficultyT(Date.now() - spawnStartTime);
  const hpBuff     = 1 + diff * 0.4;   // up to ×2.6
  const speedBuff  = 1 + diff * 0.15;  // up to ×1.6

  enemies.push({
    x, y,
    size: def.size,
    health:    def.health * hpBuff,
    maxHealth: def.health * hpBuff,
    speed:     def.speed  * speedBuff,
    color:     def.color,
    type:      typeKey
  });
}


/* difficulty helper – 0 → 4 curve shaped like the sketch */
function difficultyT(elapsedMs) {
  const m = elapsedMs / 60000;          // minutes
  if (m <= 5)  return m / 5;            // 0–1  gentle → steep bump
  if (m <= 10) return 1;                // flat plateau
  if (m <= 15) return 1 + (m - 10) / 5; // 1–2 steady climb
  /* 15-20 min: quadratic spike → 4 */
  return 2 + Math.pow((m - 15) / 5, 2) * 2;
}

/* ─── NEW SPAWN-SCHEDULER ─────────────────────────── */
function update() {
  if (!player) return;

  const now        = Date.now();
  const elapsedMs  = now - spawnStartTime;
  const elapsedSec = elapsedMs / 1000;

  const elapsed    = elapsedSec;        // ← one-liner fix
  updateMode(elapsedSec);

}



  // ─── INPUT HANDLING ────────────────────────────
  document.addEventListener('keydown', e => keys[e.key] = true);
  document.addEventListener('keyup',   e => keys[e.key] = false);
  canvas.addEventListener('mousemove', e => {
    if (!player) return;
    player.angle = Math.atan2(
      e.clientY - (player.y - viewY),
      e.clientX - (player.x - viewX)
    );
  });
   // new: start shooting on mousedown
  canvas.addEventListener('mousedown', () => {
    if (!gameStarted || ammo <= 0 || reloading) return;
    shoot();
    if (currentWeaponKey === 'minigun') {
      clearInterval(shootIntervalId);
      shootIntervalId = setInterval(() => {
        if (ammo > 0 && !reloading) shoot();
        else                      clearInterval(shootIntervalId);
      }, currentWeapon.fireRate);
    }
  });
  canvas.addEventListener('mouseup', () => {
    clearInterval(shootIntervalId);
  });





function shoot() {
  const now = Date.now();
  if (now - (player.lastShot || 0) < currentWeapon.fireRate) return;
  player.lastShot = now;

  // only Assault gets homing
  let level = 0;
  if (playerClass === 'assault') {
    const homingId = SLOT_MAP.assault[0];      // first button → ability 5
    const hb       = abilities[homingId];
    if (hb && hb.active && hb.level > 0) {
      level = hb.level;
    }
  }

  const radius = BASE_HOMING_RADIUS * level;
  const dmgMul = level > 0
               ? 1 + HOMING_DAMAGE_BONUS * (level - 1)
               : 1;

  for (let i = 0; i < currentWeapon.bullets; i++) {
    let ang;
    if (level > 0) {
      // perfect‐lock homing
      let target = null, best = Infinity;
      for (const e of enemies) {
        const d = dist(player.x, player.y, e.x, e.y);
        if (d < best && d <= radius) {
          best   = d;
          target = e;
        }
      }
      ang = target
        ? Math.atan2(target.y - player.y, target.x - player.x)
        : player.angle + (Math.random() - 0.5) * currentWeapon.spread;
    } else {
      ang = player.angle + (Math.random() - 0.5) * currentWeapon.spread;
    }

    bullets.push({
      x:            player.x,
      y:            player.y,
      ang,
      spd:          14,
      size:         8,
      damage:       currentWeapon.damage * damageMultiplier * dmgMul,
      homing:       level > 0,
      homingRadius: radius,
      target:       null
    });
  }

  ammo--;
  updateUI();
  if (ammo === 0) startReload();
}










  function startReload() {
    reloading = true;
    reloadStart = Date.now();
  }

  
/* ─── PURGATORY: flying spikes ─────────── */
function spawnFlyingInsanity(){
  const ang = Math.random()*Math.PI*2;
  flyIns.push({
    x: player.x + Math.cos(ang)*1200,
    y: player.y + Math.sin(ang)*1200,
    vx: -Math.cos(ang)*9,
    vy: -Math.sin(ang)*9,
    life: 400          // frames
  });
}

/* ─── ABYSS: blocking pillars ──────────── */
  function spawnOilPuddle() {
    if (oilPuddles.length >= 5) return;    // ← never more than 5 puddles
    const ang  = player.angle + (Math.random() - 0.5) * 0.8;
    const dist = 260 + Math.random() * 120;
    oilPuddles.push({
      x:    player.x + Math.cos(ang) * dist,
      y:    player.y + Math.sin(ang) * dist,
      w:    120,      // make them a bit larger if you like
      h:    120,
      rot:  ang,
      born: Date.now()
    });
  }
// in your blockers‐cleanup (already in update):
oilPuddles = oilPuddles.filter(b => Date.now() - b.born < 10000 + Math.random() * 5000);

/* ─── INFERNO: fire sweeps ─────────────── */
function spawnEruption(){
  const vertical = Math.random()<0.5;
  const pos = vertical ? {x:Math.random()*mapSize,y:-200} :
                         {x:-200,y:Math.random()*mapSize};
  eruptions.push({
    ...pos, vertical,
    speed: 10,
    life: 450
  });
  }



 let viewX = 0, viewY = 0;
function update() {
  if (!player) return;

  const sg = abilities[8];

  // ─── TIMING & DIFFICULTY ─────────────────────────────
  const now        = Date.now();
  const elapsedMs  = now - spawnStartTime;
  const elapsedSec = elapsedMs / 1000;
  updateMode(elapsedSec);
  updateClones();

    // ─── PROCESS STUN GRENADES ─────────────────────────────
  for (let i = stunGrenades.length - 1; i >= 0; i--) {
    const g   = stunGrenades[i];
    const age = Date.now() - g.born;

    // explode
    if (!g.exploded && age >= STUN_FUSE_MS) {
      g.exploded = true;

      // interpolate count & duration by level
      const lerp = (lvl) => (min, max) => min + (max - min) * (lvl - 1) / (abilities[8].maxLevel - 1);
      const byLvlCount    = lerp(sg.level)(STUN_BASE_COUNT,    STUN_MAX_COUNT);
      const byLvlDuration = lerp(sg.level)(STUN_BASE_DURATION, STUN_MAX_DURATION);

      // stun nearest N enemies in radius
      const inRange = enemies
        .filter(e => dist(e.x, e.y, g.x, g.y) <= g.radius)
        .sort((a,b) => dist(a.x,a.y,g.x,g.y) - dist(b.x,b.y,g.x,g.y))
        .slice(0, Math.round(byLvlCount));

      inRange.forEach(e => {
        e.stunnedUntil = Date.now() + byLvlDuration;
      });
    }

    // cleanup after explosion is done
    if (age >= STUN_FUSE_MS + STUN_MAX_DURATION) {
      stunGrenades.splice(i, 1);
    }
  }

  // ─── PREVENT STUNNED ENEMIES FROM ACTING ─────────────────
  enemies.forEach(e => {
    if (e.stunnedUntil && Date.now() < e.stunnedUntil) {
      // skip movement/shooting this frame
      e._skip = true;
    } else {
      delete e._skip;
    }
  });

  // ─── PROCESS STUN GRENADES ─────────────────────────────
for (let i = stunGrenades.length - 1; i >= 0; i--) {
  const g   = stunGrenades[i];
  const age = Date.now() - g.born;

  // explode
  if (!g.exploded && age >= STUN_FUSE_MS) {
    g.exploded = true;

    // interpolate count & duration by level
    const lerp = (lvl) => (min, max) => min + (max - min) * (lvl - 1) / (abilities[8].maxLevel - 1);
    const byLvlCount    = lerp(sg.level)(STUN_BASE_COUNT,    STUN_MAX_COUNT);
    const byLvlDuration = lerp(sg.level)(STUN_BASE_DURATION, STUN_MAX_DURATION);

    // stun nearest N enemies in radius
    const inRange = enemies
      .filter(e => dist(e.x, e.y, g.x, g.y) <= STUN_RADIUS)
      .sort((a,b) => dist(a.x,a.y,g.x,g.y) - dist(b.x,b.y,g.x,g.y))
      .slice(0, Math.round(byLvlCount));

    inRange.forEach(e => {
      e.stunnedUntil = Date.now() + byLvlDuration;
    });
  }

  // cleanup after explosion is done
  if (age >= STUN_FUSE_MS + STUN_MAX_DURATION) {
    stunGrenades.splice(i, 1);
  }
}

// ─── PREVENT STUNNED ENEMIES FROM ACTING ─────────────────
enemies.forEach(e => {
  if (e.stunnedUntil && Date.now() < e.stunnedUntil) {
    // skip movement/shooting this frame
    e._skip = true;
  } else {
    delete e._skip;
  }
});


  // ─── OIL PUDDLE SLOWDOWN ─────────────────────────────
  // 'oilPuddles' are now oil puddles
  let inOil = false;
  oilPuddles.forEach(b => {
    const dx  = player.x - b.x;
    const dy  = player.y - b.y;
    const sin = Math.sin(b.rot);
    const cos = Math.cos(b.rot);
    // project into puddle local space
    const localX = Math.abs(dx * cos + dy * sin);
    const localY = Math.abs(-dx * sin + dy * cos);
    if (localX < b.w/2 && localY < b.h/2) {
      inOil = true;
    }
  });

  // ─── INSANITY SPEED MULTIPLIER ────────────────────────
  // baseSpeed ×2 if Insanity is active, otherwise baseSpeed
  const base     = baseSpeed * (abilities[2].active ? 2 : 1);
  // oil puddle cuts speed in half
  player.speed  = inOil ? base * 0.5 : base;

  // ─── PLAYER MOVEMENT ──────────────────────────────────
  if (keys['w']) player.y -= player.speed;
  if (keys['s']) player.y += player.speed;
  if (keys['a']) player.x -= player.speed;
  if (keys['d']) player.x += player.speed;

  // ─── COLLIDE WITH STATIC OBJECTS ──────────────────────
  objects.forEach(o => {
    const dx   = player.x - o.x;
    const dy   = player.y - o.y;
    const dist = player.size/2 + o.size/2;
    if (Math.hypot(dx, dy) < dist) {
      const ang = Math.atan2(dy, dx);
      player.x = o.x + Math.cos(ang) * dist;
      player.y = o.y + Math.sin(ang) * dist;
    }
  });

  // ─── BOUNDS & CAMERA ─────────────────────────────────
  player.x = Math.max(player.size/2,
              Math.min(mapSize-player.size/2, player.x));
  player.y = Math.max(player.size/2,
              Math.min(mapSize-player.size/2, player.y));
  viewX    = Math.max(0,
              Math.min(mapSize-w, player.x - w/2));
  viewY    = Math.max(0,
              Math.min(mapSize-h, player.y - h/2));

  // ─── MODE-SPECIFIC SPAWNS ────────────────────────────
  // PURGATORY (2.5–5m): random spikes
  if (curMode.name === 'purgatory' && Math.random() < 0.015) {
    spawnFlyingInsanity();
    lastBlockerTime = now;
  }
  // ABYSS (5–7.5m): one oil puddle every 1–2s
  if (curMode.name === 'abyss') {
    if (now - lastBlockerTime > 1000 + Math.random() * 1000) {
      spawnOilPuddle();
      lastBlockerTime = now;
    }
  }


  // ─── RELOAD FINISH ────────────────────────────────────
  if (reloading && now - reloadStart >= reloadDur) {
    reloading = false;
    const take = Math.min(magSize, reserve);
    reserve   -= take;
    ammo       = take;
    updateUI();
  }

  // ─── ENEMY MOVEMENT (skip stunned) ───────────────────
  enemies.forEach(e => {
    if (e._skip) return;      // freeze stunned enemies
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(ang) * e.speed;
    e.y += Math.sin(ang) * e.speed;
  });
// ─── BULLET MOVEMENT, PERFECT HOMING & COLLISIONS ─────────────────
for (let i = bullets.length - 1; i >= 0; i--) {
  const b = bullets[i];

  // 1) Remove expired grenade bullets
  if (b.isGrenadeBullet && Date.now() - b.birthTime > b.ttl) {
    bullets.splice(i, 1);
    continue;
  }

  // 2) Perfect homing adjustment
  if (b.homing) {
    // if we don’t have a live target or it’s out of range, find the nearest valid one
    if (
      !b.target ||
      !enemies.includes(b.target) ||
      dist(b.x, b.y, b.target.x, b.target.y) > b.homingRadius
    ) {
      let nearest    = null;
      let nearestD   = Infinity;
      for (const e of enemies) {
        const d = dist(b.x, b.y, e.x, e.y);
        if (d < nearestD && d <= b.homingRadius) {
          nearestD = d;
          nearest  = e;
        }
      }
      b.target = nearest;
    }
    // if we now have a valid target, snap our angle straight at it
    if (b.target) {
      b.ang = Math.atan2(b.target.y - b.y, b.target.x - b.x);
    }
  }

  // 3) Move bullet
  b.x += Math.cos(b.ang) * b.spd;
  b.y += Math.sin(b.ang) * b.spd;

  // 4) Despawn off‐map
  if (b.x < 0 || b.x > mapSize || b.y < 0 || b.y > mapSize) {
    bullets.splice(i, 1);
    continue;
  }

  // 5) Hit‐test
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    if (dist(b.x, b.y, e.x, e.y) < b.size + e.size / 2) {
      e.health -= b.damage;
      bullets.splice(i, 1);
      if (e.health <= 0) handleEnemyDeath(j);
      break;
    }
  }
}








    
  

  // ─── MOVE + COLLIDE bossBullets ────────────────────
  bossBullets.forEach((b,i) => {
    // homing adjustment
    if (b.homing) {
      const desired = Math.atan2(player.y-b.y, player.x-b.x);
      b.ang += (desired - b.ang)*0.08;  // a bit more responsive
    }

    // step
    const dx = Math.cos(b.ang)*b.spd;
    const dy = Math.sin(b.ang)*b.spd;
    b.x += dx;
    b.y += dy;
    b.life++;

    // emit a flame-particle behind the rocket
    if (b.homing) {
      rocketParticles.push({
        x: b.x - dx*0.5,
        y: b.y - dy*0.5,
        life: 0, maxLife: 30 + Math.random()*20
      });
    }

    // collision with map objects
    for (const o of objects) {
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size/2) {
        bossBullets.splice(i,1);
        return;
      }
    }
    // expire if life or out of bounds
    if (
      b.life > b.maxLife ||
      b.x < -50 || b.x > mapSize+50 ||
      b.y < -50 || b.y > mapSize+50
    ) {
      bossBullets.splice(i,1);
    }

    trails.forEach(t => t.life--);
    trails = trails.filter(t => t.life > 0);

  });


  // ─── BOSS BULLETS MOVEMENT ─────────────────────────────────────
  bossBullets.forEach((b,i) => {
    if (b.homing) {
      const desired = Math.atan2(player.y-b.y, player.x-b.x);
      b.ang += (desired - b.ang) * 0.05;
    }
    b.x += Math.cos(b.ang)*b.spd;
    b.y += Math.sin(b.ang)*b.spd;
    b.life++;
    // expire
    if (b.life > b.maxLife || b.x<0||b.x>mapSize||b.y<0||b.y>mapSize) {
      bossBullets.splice(i,1);
    }
  });

  // ─── BOSS BULLETS → PLAYER ONLY ────────────────────────────────
  bossBullets.forEach((b,i) => {
    if (Math.hypot(player.x-b.x, player.y-b.y) < player.size/2 + b.size) {
      player.health -= 20;     // boss bullet damage
      bossBullets.splice(i,1);
    }
  });



  // ─── MAGNETIC PULL ─────────────────────
  pickups.forEach(p=>{
    const dx = player.x - p.x,
          dy = player.y - p.y,
          d  = Math.hypot(dx,dy);
    if (d < pickupRadius && d > 1) {
      p.x += (dx/d) * magnetPullSpeed;
      p.y += (dy/d) * magnetPullSpeed;
    }
  });
  // ─── PICKUPS & ENEMY CONTACT ───────────────────────────────────
  pickups.forEach((p,i) => {
    if (Math.hypot(player.x-p.x, player.y-p.y) < player.size/2 + p.size/2) {
      if (p.type==='ammo')   reserve += p.value;
      if (p.type==='health') player.health = Math.min(player.maxHealth, player.health+p.value);
      if (p.type==='gold')   gold    += p.value;
      pickups.splice(i,1);
    }
  });
  enemies.forEach(e => {
    if (Math.hypot(player.x-e.x, player.y-e.y) < player.size/2 + e.size/2) {
      player.health--;
    }
  });

  // ─── DEATH CHECK ───────────────────────────────────────────────
  if (player.health <= 0) {
    gameStarted = false;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').style.display = 'block';
    expBarContainer.style.display = 'none';
    expAbilityPanel.style.display    = 'none';
    upgradePanel.style.display = 'none';
    expAbilityPanel.style.display = 'none';
    saveHigh(score);
  }
  


  /* move + collide flying spikes */
  flyIns.forEach((s,i)=>{
    s.x+=s.vx; s.y+=s.vy; s.life--;
    if(dist(s.x,s.y,player.x,player.y)<30){ player.health-=40; flyIns.splice(i,1); }
    if(s.life<=0)flyIns.splice(i,1);
  });

  /* oilPuddles decay */
  oilPuddles = oilPuddles.filter(p => Date.now() - p.born < OIL_LIFETIME);

  /* eruptions sweep */
  eruptions.forEach((e,i)=>{
    if(e.vertical) e.y+=e.speed; else e.x+=e.speed;
    e.life--;
    /* damage zone 200px wide behind front */
    const hit = e.vertical ?
        player.y>e.y-200 && player.y<e.y+20 :
        player.x>e.x-200 && player.x<e.x+20;
    if(hit) player.health-=60;
    if(e.life<=0) eruptions.splice(i,1);
  });




  // ─── PROCESS GRENADES ───────────────────────────
for (let i = grenades.length - 1; i >= 0; i--) {
  const g   = grenades[i];
  const age = Date.now() - g.born;
  if (age >= g.fuse) {
    // explosion!
    const lvl   = abilities[3].level;
    const count = lvl * 15;               // 500,1000,…,2500 bullets
    const dmg   = lvl * 10 ;           // 50,75,…,150 damage
    const now   = Date.now();

    for (let j = 0; j < count; j++) {
      const ang = (Math.PI * 2 * j) / count;
      bullets.push({
        x: g.x,
        y: g.y,
        ang: ang,                       // ← use ang, not angle
        spd: 8,
        size: 6,
        damage: dmg * damageMultiplier, // ← use your local dmg

        // new properties for TTL
        isGrenadeBullet: true,
        birthTime: now,
        ttl: GRENADE_BULLET_LIFESPAN * 1000  // ms
      });
    }

    grenades.splice(i, 1);
  }
}
  // ─── MOVE & DETONATE RPGS ───────────────────────
  for (let i = rpgMissiles.length - 1; i >= 0; i--) {
    const m = rpgMissiles[i];
    m.x += Math.cos(m.ang) * m.spd;
    m.y += Math.sin(m.ang) * m.spd;
    // hit any enemy?
    const hitIdx = enemies.findIndex(e =>
      dist(m.x, m.y, e.x, e.y) < (m.size + e.size/2)
    );
    if (hitIdx !== -1) {
      // spawn one explosion
      explosions.push({ x: m.x, y: m.y, radius: m.radius, damage: m.damage, life: 12, handled: false });
      rpgMissiles.splice(i, 1);
      continue;
    }
    // out of bounds?
    if (m.x < 0 || m.x > mapSize || m.y < 0 || m.y > mapSize) {
      rpgMissiles.splice(i, 1);
    }
  }

  // ─── RESOLVE EXPLOSIONS ──────────────────────────
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    // deal damage only once when it first spawns
    if (!ex.handled) {
      enemies.forEach((e, j) => {
        if (dist(ex.x, ex.y, e.x, e.y) <= ex.radius) {
          e.health -= ex.damage;
          if (e.health <= 0) handleEnemyDeath(j);
        }
      });
      ex.handled = true;
    }
    ex.life--;
    if (ex.life <= 0) explosions.splice(i, 1);
  }


  updateUI();

  // ─── BOSS SHOOTING (unchanged) ────────────────────────────────
  enemies.forEach(boss => {
    if (!boss.isBoss) return;
    const now = Date.now();
    if (now - boss.lastShot < boss.fireRate) return;
    boss.lastShot = now;

    if (boss.pattern === 'radial') {
      for (let i=0; i<8; i++) {
        const angle = (Math.PI*2/8)*i;
        bossBullets.push({
          x: boss.x, y: boss.y,
          ang: angle, spd: 8, size: 8,
          color: '#FF4500',
          life: 0, maxLife: 200, homing: false
        });
      }
    } else {
      const angleToPlayer = Math.atan2(player.y-boss.y, player.x-boss.x);
      bossBullets.push({
        x: boss.x, y: boss.y,
        ang: angleToPlayer, spd: 2, size: 12,
        color: '#FF00FF',
        life: 0, maxLife: 300, homing: true
      });
    }
  });
  updateAbilities();

}



  // ─── DRAW ───────────────────────────────────────
  function draw() {
    if (!player) return;

    // ─── BACKGROUND & GRID ─────────────────────────────
    ctx.fillStyle = curMode.bg;   // use current mode colour
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = -viewX % 50; x < w; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -viewY % 50; y < h; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

      /* oilPuddles */
    ctx.fillStyle = 'rgba(30, 80, 30, 0.6)'; // oily green
    oilPuddles.forEach(b => {
      ctx.save();
      ctx.translate(b.x - viewX, b.y - viewY);
      ctx.rotate(b.rot);
      ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h);
      ctx.restore();
    });
    /* flying spikes */
    ctx.fillStyle='crimson';
    flyIns.forEach(s=>{
      ctx.beginPath();
      ctx.arc(s.x-viewX,s.y-viewY,12,0,Math.PI*2);
      ctx.fill();
    });

/* eruptions (with fade & hue shift) */
eruptions.forEach(e => {
  ctx.save();
  // fade out as e.life ticks down
  ctx.globalAlpha = 0.6 * (e.life / 450);
  // subtle hue shift per eruption
  ctx.fillStyle   = `hsl(${30 + Math.random() * 10},100%,50%)`;

  if (e.vertical) {
    ctx.fillRect(
      e.x - viewX - 100,
      e.y - viewY - 200,
      200,
      220
    );
  } else {
    ctx.fillRect(
      e.x - viewX - 200,
      e.y - viewY - 100,
      220,
      200
    );
  }

  ctx.restore();
});

  // draw oil puddles with fade
  oilPuddles.forEach(o => {
    const age   = Date.now() - o.born;
    const alpha = 1 - age / OIL_LIFETIME;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = 'rgba(40, 40, 20, 1)';  // a dark oily yellow
    ctx.translate(o.x - viewX, o.y - viewY);
    ctx.rotate(o.rot);
    ctx.fillRect(-o.w/2, -o.h/2, o.w, o.h);
    ctx.restore();
  });

    // ─── MAP OBJECTS ────────────────────────────────────
    ctx.fillStyle = '#2A2C33';
    objects.forEach(o => {
      ctx.fillRect(
        o.x - viewX - o.size/2,
        o.y - viewY - o.size/2,
        o.size, o.size
      );
    });



    trails.forEach(t => {
      const alpha = t.life / TRAIL_LIFE;
      ctx.fillStyle = `hsla(${t.hue},100%,55%,${alpha})`;
      ctx.fillRect(
        t.x - viewX - player.size/2,
        t.y - viewY - player.size/2,
        player.size, player.size
      );
    });


    // ─── PLAYER ─────────────────────────────────────────
    const px = player.x - viewX,
          py = player.y - viewY;
  
    const insaneActive = abilities[2].active && abilities[2].level > 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.fillStyle = insaneActive
                    ? `hsl(${hue},100%,55%)`
                    : '#4A90E2';

                
                 
    ctx.fillRect(-player.size/2, -player.size/2, player.size, player.size);
    ctx.restore();





  // draw each clone, 35% transparent:
  ctx.globalAlpha = 0.65;
  clones.forEach(c => {
    ctx.save();
      ctx.translate(c.x - viewX, c.y - viewY);
      ctx.rotate(player.angle);
      ctx.fillStyle = '#4A90E2';
      ctx.fillRect(-player.size/2, -player.size/2, player.size, player.size);
    ctx.restore();
  });
  ctx.globalAlpha = 1;   // reset alpha so everything else draws normally


    // ─── RELOAD BAR ─────────────────────────────────────
    if (reloading) {
      const pct = Math.min((Date.now() - reloadStart)/reloadDur, 1);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(px - 50, py - player.size - 10, 100 * pct, 6);
    }

      // ─── DRAW GRENADES (FLASHING CIRCLE) ───────────
    grenades.forEach(g => {
      const age   = Date.now() - g.born;
      const flash = Math.floor(age / 200) % 2 === 0;
      ctx.beginPath();
      ctx.arc(
        g.x - viewX,
        g.y - viewY,
        12, 0, Math.PI * 2
      );
      ctx.fillStyle = flash
        ? 'rgba(255,  0,  0, 0.7)'
        : 'rgba(255,255,  0, 0.7)';
      ctx.fill();
    });

    // ─── PLAYER BULLETS ──────────────────────────────────
    ctx.fillStyle = '#F5A623';
    bullets.forEach(b => {
      ctx.fillRect(
        b.x - viewX - b.size/2,
        b.y - viewY - b.size/2,
        b.size, b.size
      );
    });

    // ─── ENEMIES ─────────────────────────────────────────
    enemies.forEach(e => {
      const ex = e.x - viewX,
            ey = e.y - viewY;
      // body
      ctx.fillStyle = e.color;
      ctx.fillRect(ex - e.size/2, ey - e.size/2, e.size, e.size);
      // health bar
      const pct = Math.max(0, e.health) / e.maxHealth;
      ctx.fillStyle = '#555';
      ctx.fillRect(ex - e.size/2, ey - e.size/2 - 8, e.size, 6);
      ctx.fillStyle = '#0F0';
      ctx.fillRect(ex - e.size/2, ey - e.size/2 - 8, e.size * pct, 6);
    });

    // ─── PICKUPS ─────────────────────────────────────────
    pickups.forEach(p => {
      const x = p.x - viewX,
            y = p.y - viewY;
      ctx.fillStyle =
        p.type === 'ammo'   ? '#F5A623' :
        p.type === 'health' ? '#0F0'    :
                              '#FFD700';
      ctx.fillRect(x - p.size/2, y - p.size/2, p.size, p.size);
    });

  const blade = abilities[1];
  if (blade && blade.active && blade.level > 0) {
    ctx.fillStyle = 'crimson';
    ctx.strokeStyle = '#fafafa';
    ctx.lineWidth = 2;

    const bladeCount = 2 + (blade.level - 1);
    for (let i = 0; i < bladeCount; i++) {
     const ang = orbitAngle + i * (Math.PI * 2 / bladeCount);
      const tx  = player.x + Math.cos(ang) * bladeOrbitCfg.radius;
      const ty  = player.y + Math.sin(ang) * bladeOrbitCfg.radius;

      ctx.save();
      ctx.translate(tx - viewX, ty - viewY);
      ctx.rotate(ang + Math.PI / 2);

      ctx.beginPath();
      ctx.moveTo(0, -14);   // taller tip
      ctx.lineTo(10, 14);   // wider base
      ctx.lineTo(-10, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();         // thin white outline
      ctx.restore();
    }
  }

    // ─── ROCKET FLAME PARTICLES ─────────────────────────
    rocketParticles.forEach((p, i) => {
      // advance life
      p.life++;
      // compute alpha fade
      const alpha = 1 - p.life / p.maxLife;
      if (alpha <= 0) {
        rocketParticles.splice(i, 1);
        return;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgba(255,150,0,${alpha})`;
      ctx.beginPath();
      ctx.arc(
        p.x - viewX,
        p.y - viewY,
        4 + 2 * alpha,
        0, Math.PI * 2
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // ─── BOSS BULLETS & ROCKETS ─────────────────────────
    bossBullets.forEach(b => {
      const bx = b.x - viewX,
            by = b.y - viewY;

      if (b.homing) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(b.ang);

        // body rectangle (now twice as long)
        const bodyW = b.size * 2,
              bodyH = b.size / 2;
        ctx.fillStyle = b.color;
        ctx.fillRect(-bodyW/2, -bodyH/2, bodyW, bodyH);

        // nose triangle (scaled to match)
        ctx.beginPath();
        ctx.moveTo(bodyW/2, 0);
        ctx.lineTo(bodyW/2 + bodyW/2, -bodyH/2);
        ctx.lineTo(bodyW/2 + bodyW/2,  bodyH/2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      } else {
        // radial bullet as circle
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(bx, by, b.size, 0, Math.PI*2);
        ctx.fill();
      }
    });

// ─── DRAW CENTURY TURRETS ────────────────────────────────
const cg = abilities[7];
if (cg && cg.turrets) {
  cg.turrets.forEach(t => {
    const dx = t.x - viewX, dy = t.y - viewY;
    ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(t.angle);

      // Base platform (circle)
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI*2);
      ctx.fill();

      // Body
      ctx.fillStyle = '#8A2BE2';
      ctx.fillRect(-10, -6, 20, 12);

      // Barrel
      ctx.fillStyle = '#DDA0DD';
      ctx.fillRect(0, -4, 28, 8);

      // Muzzle flash ring (small)
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI*2);
      ctx.stroke();
    ctx.restore();
  });
}



  // ─── DRAW RPG MISSILES ────────────────────────────
  rpgMissiles.forEach((m, i) => {
    // 1️⃣ move
    m.x += Math.cos(m.ang) * m.spd;
    m.y += Math.sin(m.ang) * m.spd;

    // 2️⃣ render rocket body + correct-facing nose
    ctx.save();
    ctx.translate(m.x - viewX, m.y - viewY);
    ctx.rotate(m.ang);

    // body (rectangle)
    ctx.fillStyle = 'purple';
    ctx.fillRect(-m.size/2, -m.size/2, m.size, m.size);

    // nose (triangle pointing right)
    ctx.beginPath();
    ctx.moveTo(m.size/2, -m.size/3);           // top of base
    ctx.lineTo(m.size/2 + m.size, 0);           // tip forward
    ctx.lineTo(m.size/2,  m.size/3);           // bottom of base
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 3️⃣ TODO: collision detection & explosion when it hits…
    //     Use `m.radius` for your AOE and `m.damage` for damage dealt.
  });


    // ─── DRAW EXPLOSIONS ─────────────────────────────
    explosions.forEach(ex => {
      const t = ex.life / 12;           // 1 → 0
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = `rgba(255,150,0,${t})`;
      ctx.lineWidth   = 4;
      ctx.beginPath();
      // let the circle shrink as life ticks
      ctx.arc(
        ex.x - viewX,
        ex.y - viewY,
        ex.radius * (1 - t),
        0,
        Math.PI*2
      );
      ctx.stroke();
      ctx.restore();
    });



// ─── DRAW STUN GRENADES ─────────────────────────
stunGrenades.forEach(g => {
  const age = Date.now() - g.born;

  if (!g.exploded) {
    // (unchanged) draw the little rotating grenade icon
    const px = g.x - viewX, py = g.y - viewY;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((age / STUN_FUSE_MS) * Math.PI * 2);
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(0, -8);
      ctx.translate(0, -8);
      ctx.rotate((Math.PI * 2 / 5));
      ctx.lineTo(0, 8);
      ctx.translate(0, 8);
      ctx.rotate(-(Math.PI * 6 / 5));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  } else {
    // draw expanding stun ring
    const explodeAge   = age - STUN_FUSE_MS;
    // clamp between 0–1
    const animProgress = Math.min(Math.max(explodeAge / STUN_ANIM_MS, 0), 1);
    const radius       = STUN_RADIUS * animProgress;
    const alpha        = 1 - animProgress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#0ff';
    // fade line‐width as it expands
    ctx.lineWidth   = 4 * (1 - animProgress);
    ctx.beginPath();
    ctx.arc(
      g.x - viewX,
      g.y - viewY,
      radius,
      0, Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }
});



  }


  // ─── UI UPDATE HELPERS ──────────────────────────
  function pop(el) {
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 300);
  }
  function updateUI() {
    ['score','gold','ammo','reserve','healthText','maxHealthText']
      .forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id==='healthText')    e.textContent = Math.floor(player.health);
        else if (id==='maxHealthText') e.textContent = player.maxHealth;
        else e.textContent = eval(id); // score, gold, ammo, reserve
        pop(e);
      });
    document.getElementById('healthBar').style.width =
      (player.health/player.maxHealth*100) + '%';
    refreshPanel();
  }

  // ─── HIGH-SCORE STORAGE ─────────────────────────
  function saveHigh(sc) {
    highs = JSON.parse(localStorage.getItem('hs')||'[]');
    highs.push({ name: localStorage.getItem('curName'), score: sc });
    highs.sort((a,b) => b.score - a.score);
    localStorage.setItem('hs', JSON.stringify(highs));
    renderLeader();
  }
  function loadHighs() {
    highs = JSON.parse(localStorage.getItem('hs')||'[]');
    renderLeader();
  }
function renderLeader(){
  const ul = document.getElementById('lbList');
  ul.innerHTML = '';
  highs.slice(0,5).forEach(h => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="name">${h.name}</span>
      <span class="score">${h.score}</span>
    `;
    ul.appendChild(li);
  });

  
}

  loadHighs();


    // — EXP BAR helper —
  // call this whenever player gains XP:
  function setExpPercent(pct) {   // pct: 0 → 100
    document.getElementById('expBarInner').style.width = pct + '%';
  }




  // 2. On game init or level change, unlock slots:
  function updateAbilitySlots() {
    document.querySelectorAll('.ability-slot').forEach(slot => {
      const key = +slot.dataset.slot;
      const ab  = abilities[key];
      if (!ab) return;
      if (player.level >= ab.unlockLevel) {
        slot.classList.remove('locked');
        slot.classList.add('unlocked');
        if (ab.level === 0) ab.level = 1;      // auto‑learn first rank
      }
    });
    refreshSkillArrows();
  }

  // 3. Hook into EXP gain/level-up
  function addEXP(amount) {
    currentEXP += amount;
    while (currentEXP >= expThreshold) {
      currentEXP -= expThreshold;
      currentLevel++;
      player.level = currentLevel;
      expThreshold = calcNextEXP(currentLevel);
      skillPoints++;                     // ← gain 1 point
      updateEXPDisplay();
      updateAbilitySlots();
      refreshSkillArrows();
      
    }
    updateEXPDisplay();
  }



 








  // 5. In game loop update: orbit logic
  // in paintball.js, near the other update-clones / update-spawns calls:


// paintball.js

// these timers must live outside the function so they accumulate:
let poisonTimer      = 0;
let homingDrainTimer = 0;

function updateAbilities() {
  // ─── BLADE ORBIT ─────────────────────────────
  const blade = abilities[1];
  if (blade && blade.active && blade.level > 0) {
    const bladeCount = 2 + (blade.level - 1);
    const bladeDmg   = bladeOrbitCfg.baseDamage * blade.level;

    orbitAngle += bladeOrbitCfg.speed;
    for (let i = 0; i < bladeCount; i++) {
      const ang = orbitAngle + i * (Math.PI * 2 / bladeCount);
      const tx  = player.x + Math.cos(ang) * bladeOrbitCfg.radius;
      const ty  = player.y + Math.sin(ang) * bladeOrbitCfg.radius;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (dist(tx, ty, e.x, e.y) < e.size / 2 + 12) {
          e.health -= bladeDmg * damageMultiplier;
          if (e.health <= 0) handleEnemyDeath(j);
        }
      }
    }
  }

  // ─── INSANITY ─────────────────────────────────
  const ins = abilities[2];
  if (ins && ins.active && ins.level > 0) {
    // auto-disable if too low
    if (player.health <= 25) {
      ins.active        = false;
      damageMultiplier  = 1;
      player.speed      = baseSpeed;
    } else {
      damageMultiplier  = 1 + 0.5 * ins.level;
      player.speed      = baseSpeed * 2;
      poisonTimer     += 16;
      if (poisonTimer >= 1000) {
        player.health = Math.max(1, player.health - 25);
        poisonTimer   = 0;
      }
      // rainbow trail...
      hue = (hue + 3) % 360;
      trails.push({ x: player.x, y: player.y, hue, life: TRAIL_LIFE });
      if (trails.length > 150) trails.shift();
    }
  } else {
    // reset when off
    damageMultiplier = 1;
    player.speed     = baseSpeed;
    hue              = 0;
  }

  // ─── HOMING BULLETS ────────────────────────────
  const hb = abilities[5];
  if (hb && hb.active && hb.level > 0) {
    // auto-disable if too low
    if (player.health <= 1) {
      hb.active = false;
    } else {
      homingDrainTimer += 16;
      if (homingDrainTimer >= 1000) {
        player.health    = Math.max(1, player.health - 1);
        homingDrainTimer = 0;
      }
    }
  }

  // ─── GRENADES (slot 3) ─────────────────────────
  const gren = abilities[3];
  if (gren && gren.active && gren.level > 0) {
    const now = Date.now();
    if (!gren.lastThrow) gren.lastThrow = 0;
    const cds = [null,5000,4000,3000,2000,1000];
    if (now - gren.lastThrow >= cds[gren.level]) {
      gren.lastThrow = now;
      grenades.push({ x: player.x, y: player.y, born: now, fuse: 1000 });
    }
  }



  // ─── RPG LAUNCHER ────────────────────────────
  const rpg = abilities[6];
  if (rpg && rpg.active && rpg.level > 0) {
    const now = Date.now();
    if (!rpg.lastFire) rpg.lastFire = 0;

    // level1 → 5000ms, lvl2 → 4000ms, …, lvl5 → 1000ms
    const interval = (6 - rpg.level) * 1000;
    if (now - rpg.lastFire >= interval) {
      rpg.lastFire = now;

      // calculate scaled properties
      const scale   = 1 + RPG_SCALE_PER_LVL * (rpg.level - 1);
      const size    = RPG_BASE_SIZE   * scale;    // rocket half-width
      const radius  = RPG_BASE_RADIUS * scale;    // explosion AOE
      const damage  = RPG_BASE_DAMAGE * (1 +  (rpg.level - 1));

      rpgMissiles.push({ x: player.x, y: player.y, ang: player.angle, spd: 8, size, damage, radius });
    }
  }
    // ─── CENTURY GUN ─────────────────────────────────────────
    const cg = abilities[7];
    if (cg && cg.active && cg.level > 0) {
      const now       = Date.now();
      const cycle     = CENTURY_UPTIME_MS + CENTURY_COOLDOWN_MS;
      if (!cg.phaseStart) cg.phaseStart = now;
      const elapsed   = (now - cg.phaseStart) % cycle;
      const inUpTime  = elapsed < CENTURY_UPTIME_MS;

      if (inUpTime) {
        if (!cg.turrets) {
          cg.turrets = [];
          for (let i = 0; i < cg.level; i++) {
            const a = Math.random() * Math.PI * 2;
            cg.turrets.push({
              x: player.x + Math.cos(a) * CENTURY_RADIUS,
              y: player.y + Math.sin(a) * CENTURY_RADIUS,
              lastShot: 0,
              angle: a
            });
          }
        }

        const interval = BASE_CENTURY_RATE / Math.pow(1.5, cg.level - 1);
        const damage   = BASE_CENTURY_DAMAGE * (1 + 0.15 * (cg.level - 1));

        cg.turrets.forEach(t => {
          // find nearest enemy within CENTURY_RANGE
          let nearest = null, nd = Infinity;
          enemies.forEach(e => {
            const d = dist(t.x, t.y, e.x, e.y);
            if (d < nd && d <= CENTURY_RANGE) {
              nd = d;
              nearest = e;
            }
          });

          // only aim/fire if there's someone in range
          if (nearest) {
            t.angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
            if (now - t.lastShot >= interval) {
              bullets.push({
                x:    t.x + Math.cos(t.angle) * 20,
                y:    t.y + Math.sin(t.angle) * 20,
                ang:  t.angle,
                spd:  10,
                size: 8,
                damage
              });
              t.lastShot = now;
            }
          }
        });
      } else {
        delete cg.turrets;
      }
    } else {
      delete abilities[7].turrets;
    }


  // ─── STUN GRENADE (slot 8) ─────────────────────────
  const sg = abilities[8];
  if (sg && sg.active && sg.level > 0) {
    const now = Date.now();
    if (!sg.lastDrop) sg.lastDrop = 0;

    if (now - sg.lastDrop >= STUN_COOLDOWN_MS) {
      // compute a bigger radius per level (+30% per extra level, tweak as you like)
      const radius = STUN_RADIUS * (1 + 0.3 * (sg.level - 1));
      stunGrenades.push({
        x:       player.x,
        y:       player.y,
        born:    now,
        exploded:false,
        radius
      });
      sg.lastDrop = now;
    }
  }
  // after all your ability logic, add: returns buttons to untoggled state
  document.querySelectorAll('.ability-slot').forEach(slotEl => {
    const id = +slotEl.dataset.slot;
    const ab = abilities[id];
    slotEl.classList.toggle('ability-active', !!ab && ab.active);
  });



}


  function drawOrbitTriangles() {
    ctx.fillStyle = 'crimson';
    orbitTriangles.forEach(t => {
      ctx.save();
      ctx.translate(t.x - viewX, t.y - viewY);
      ctx.rotate(t.rot);
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(5, 10);
      ctx.lineTo(-5, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }
  function drawTriangle(x, y, rot) {
  ctx.save();
  ctx.translate(x - viewX, y - viewY);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(5, 10);
  ctx.lineTo(-5, 10);
  ctx.closePath();
  ctx.fillStyle = 'crimson';
  ctx.fill();
  ctx.restore();
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}
  /* ─── NEW: centralised death handler ─────────────────────────────── */
  function handleEnemyDeath(idx) {
    const e = enemies[idx];

    if (e.isBoss) {
      score += 100;
      addEXP(100);
      const drop = Math.floor(score / 10);
      pickups.push({ x: e.x, y: e.y, size: 20, type: 'gold', value: drop });
    } else {
      score += 10;
      addEXP(10);

      // random pickup
      let r = Math.random(), type = null;
      if (r < 0.5)        type = null;
      else if (r < 0.8)   type = 'gold';
      else if (r < 0.95)  type = 'ammo';
      else                type = 'health';
      if (type) {
        const val =
          type === 'ammo'   ? 100 :
          type === 'health' ?  30 :
          (e.size > 60 ? 10 : e.size > 40 ? 5 : 2);
        pickups.push({ x: e.x, y: e.y, size: 20, type, value: val });
      }
    }

    enemies.splice(idx, 1);        // remove from array
  }
// 1) Set up each slot exactly once, *after* your slots have been remapped & unlocked
// 1) Set up each slot exactly once, *after* your slots have been remapped & unlocked
function prepareAbilityUI() {
  document.querySelectorAll('.ability-slot').forEach(slotEl => {
    const raw = slotEl.dataset.slot;
    if (!raw || isNaN(raw)) return;           // ← skip uninitialized slots
    const abilityId = +raw;

    // position context for the arrow
    slotEl.style.position = 'relative';

    // inject a little green arrow, if we haven’t yet
    let arrow = slotEl.querySelector('.skill-up-btn');
    if (!arrow) {
      arrow = document.createElement('div');
      arrow.className = 'skill-up-btn';
      slotEl.appendChild(arrow);

      // spend a point when I click *the arrow*, but don’t bubble up
      arrow.addEventListener('click', e => {
        e.stopPropagation();
        attemptUpgrade(abilityId, arrow);
      });
    }

    // clicking *the rest* of the slot toggles active/inactive
    slotEl.addEventListener('click', () => {
      const ab = abilities[abilityId];
      if (!ab || player.level < ab.unlockLevel) return;
      ab.active = !ab.active;
      slotEl.classList.toggle('ability-active', ab.active);
      if (ab.name === 'Backup') {
        if (ab.active) spawnBackupClones(ab.level);
        else            clones = [];
      }
    });
  });
}

// call *this* every time you gain XP, level up, or spend a point:
function refreshSkillArrows() {
  document.querySelectorAll('.skill-up-btn').forEach(btn => {
    // the arrow’s parent is exactly the .ability-slot
    const abilityId = +btn.parentElement.dataset.slot;
    const ab        = abilities[abilityId];
    const canSpend  = skillPoints > 0
                   && ab.level < ab.maxLevel
                   && player.level >= ab.unlockLevel;

    btn.classList.toggle('show',     canSpend);
    btn.classList.toggle('disabled', !canSpend);
  });
}

// actually spend a point:
function attemptUpgrade(abilityId, arrowEl) {
  const ab = abilities[abilityId];
  if (!ab || ab.level >= ab.maxLevel || skillPoints === 0) return;

  ab.level++;
  skillPoints--;

  // if Backup is already active, bump clones immediately
  if (ab.name === 'Backup' && ab.active) {
    spawnBackupClones(ab.level);
  }

  // re-unlock any newly available ranks, refresh arrows
  updateAbilitySlots();
  refreshSkillArrows();
}


 /* ── Toggle arrow visibility based on points / max rank ─ */
  function refreshSkillArrows() {
    document.querySelectorAll('.skill-up-btn').forEach(btn => {
      const slot = +btn.parentElement.dataset.slot;
      const ab   = abilities[slot];
      if (!ab) { btn.classList.add('disabled'); return; }
      const can = skillPoints>0 && ab.level < 5 && player.level >= ab.unlockLevel;
      btn.classList.toggle('show',     can);
      btn.classList.toggle('disabled', !can);
    });
  }

  function attemptUpgrade(slotKey, arrowEl) {
    const ab = abilities[slotKey];
    if (!ab || ab.level >= 5 || skillPoints === 0) return;
    ab.level++;
    if (slotKey === 4 && ab.active) {
      spawnBackupClones(ab.level);
      }
    skillPoints--;
    arrowEl.classList.remove('show');   // hide until next point
    refreshSkillArrows();


      // If Backup (slot 4) is active, rebuild clones at the new level:
    if (slotKey === 4 && ab.active) {
      spawnBackupClones(ab.level);
    }
  }


  /* difficulty helper – returns 0-1 scalar */
  function difficultyT(elapsed) {          // elapsed in ms
    const m = elapsed / 60000;              // → minutes
    if (m <= 5)   return m / 5;             // 0 → 1
    if (m <= 10)  return 1;                 // plateau
    if (m <= 15)  return 1 + (m - 10) / 5;  // 1 → 2
    // 15-20: shoots up to 4
    return 2 + Math.pow((m - 15) / 5, 2) * 2;   // 2 → 4 (quad curve)
  }

  /* ─── NEW SPAWN-SCHEDULER ───────────────────────── */
  function scheduleNextSpawn() {
    const now        = Date.now();
    const elapsedMs  = now - spawnStartTime;
    const elapsedSec = elapsedMs / 1000;

    updateMode(elapsedSec);

    /* base wave & delay – gets harder the longer you play */
    const diff      = 0.6 + difficultyT(elapsedMs);
    let   baseDelay = 3000 / (1 + diff * 2);        // 3 s → ~375 ms
    let   baseWave  = 1 + Math.floor(diff * 1.5);   // 1 → 7

    /* ── INFERNO tweaks ───────────────────────────── */
    if (curMode.name === 'inferno') {
      const infernoSecs = elapsedSec - modes[3].t;          // time *in* Inferno
      const bursts      = Math.min(6, Math.floor(infernoSecs / 30));

      baseWave   = Math.min(baseWave + bursts, 40);         // +1 each burst
      const k    = 1 - bursts * 0.15;                       // 1, 0.85, 0.70…
      baseDelay  = Math.max(baseDelay * k, DBG.minDelay);  // user floor
    }
    DBG.lastWave  = baseWave;
    DBG.lastDelay = baseDelay;
    /* ── fire wave after the computed delay ───────── */
    setTimeout(() => {
      const MAX_LIVE_ENEMIES = DBG.maxEnemies;
      if (enemies.length < DBG.maxEnemies) {
        for (let i = 0; i < baseWave; i++) spawnEnemy();
      }
      scheduleNextSpawn();          // recurse
    }, baseDelay);
  }





  function updateMode(elapsedSec){
  const next = [...modes].reverse().find(m => elapsedSec >= m.t);
  if (next !== curMode){
    curMode = next;
    document.body.style.background = next.bg;
  }
  }


  function increaseDifficulty(){
    baseBulletDamage *= 1.08;
    lateDecayRate    *= 1.15;
  }


  function rectOverlap(a, b) {
  const ra = Math.hypot(a.w, a.h) / 2;
  const rb = Math.hypot(b.w, b.h) / 2;
  return Math.hypot(a.x - b.x, a.y - b.y) < ra + rb;
  }

  function spawnOilPuddle() {
  let tries = 0;
  do {
    const ang  = player.angle + (Math.random() - 0.5) * 0.8; // ±23°
    const dist = 260 + Math.random() * 120;                 // 260–380px ahead
    const x    = player.x + Math.cos(ang) * dist;
    const y    = player.y + Math.sin(ang) * dist;

    const candidate = {
      x, y,
      w:   OIL_W,
      h:   OIL_H,
      rot: ang,
      born: Date.now()
    };

    // if it doesn’t overlap existing puddles, we’re good
    if (!oilPuddles.some(o => rectOverlap(candidate, o))) {
      oilPuddles.push(candidate);
      break;
    }
    tries++;
  } while (tries < 10);
  }






  /* ─── DEBUG HELPER STATE ─────────────────────────── 

/* 1.  Toggle panel visibility 
document.getElementById('dbgToggle').onclick = () => {
  const p = document.getElementById('dbgPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
};

/* 2.  Cheat buttons 
document.getElementById('dbgInfGold').onclick = () => {
  gold = 9_999_999;  refreshPanel();
};
document.getElementById('dbgInfHP').onclick = () => {
  player.health = player.maxHealth = 9_999_999;
  updateUI();
};

/* 3.  Phase selector 
const sel = document.getElementById('dbgPhaseSelect');
modes.forEach((m,i)=> {
  const o=document.createElement('option');
  o.value=i; o.textContent=m.name; sel.appendChild(o);
});
sel.onchange = e => {
  const idx = +e.target.value;
  spawnStartTime = Date.now() - modes[idx].t * 1000 - 1;
  curMode = modes[idx];
  document.body.style.background = curMode.bg;
};

/* 4.  Change max live-enemy cap 
document.getElementById('dbgSaveMax').onclick = () => {
  DBG.maxEnemies = +document.getElementById('dbgMaxEnemies').value||DBG.maxEnemies;
};

/* 5.  Force-spawn N enemies instantly 
document.getElementById('dbgSpawnN').onclick = () => {
  const n = +document.getElementById('dbgForceSpawn').value||1;
  for (let i=0;i<n;i++) spawnEnemy();
};

/* 6.  Insta-kill everything currently alive 
document.getElementById('dbgKillAll').onclick = ()=> {
  enemies.slice().forEach((_,i)=>handleEnemyDeath(i));
};

/* 7.  Update live stats once per second 
setInterval(()=> {
  const box   = document.getElementById('dbgStats');
  box.innerHTML =
    `enemies: ${enemies.length}<br>`+
    `maxWave: ${DBG.lastWave||0}<br>`+
    `spawnDelay: ${Math.round(DBG.lastDelay)} ms`;
},1000);
  /* set new min-spawn delay 
  document.getElementById('dbgSaveDelay').onclick = () => {
    const v = +document.getElementById('dbgMinDelay').value || DBG.minDelay;
    DBG.minDelay = Math.max(50, v);        // hard floor 50 ms so game can’t lock
  };

  /* when user edits the enemy cap input, keep the number in sync visually too   
  document.getElementById('dbgMaxEnemies').value = DBG.maxEnemies;
  document.getElementById('dbgMinDelay' ).value = DBG.minDelay;
*/





});
