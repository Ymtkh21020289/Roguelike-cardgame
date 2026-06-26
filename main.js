const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const UI_WIDTH = 168;
const FIELD = { x: 0, y: 0, w: WIDTH - UI_WIDTH, h: HEIGHT };

const keys = new Set();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const STAGES = [
  {
    name: "STAGE 1 / ORBIT CORE",
    boss: { name: "ORBIT CORE", hp: 160, color: "#ff5c7a", speed: 70 },
    patterns: ["radial", "aimed"],
    background: ["#061021", "#10285a"],
  },
  {
    name: "STAGE 2 / SPIRAL WITCH",
    boss: { name: "SPIRAL WITCH", hp: 220, color: "#c77dff", speed: 95 },
    patterns: ["spiral", "wall", "aimed"],
    background: ["#110722", "#35165e"],
  },
  {
    name: "STAGE 3 / SUN FORGE",
    boss: { name: "SUN FORGE", hp: 300, color: "#ffd166", speed: 115 },
    patterns: ["radial", "spiral", "flower", "wall"],
    background: ["#1d0f08", "#653416"],
  },
];

class Input {
  constructor() {
    addEventListener("keydown", (event) => {
      keys.add(event.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    });
    addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  }

  axis() {
    const left = keys.has("arrowleft") || keys.has("a");
    const right = keys.has("arrowright") || keys.has("d");
    const up = keys.has("arrowup") || keys.has("w");
    const down = keys.has("arrowdown") || keys.has("s");
    const x = Number(right) - Number(left);
    const y = Number(down) - Number(up);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }
}

class Entity {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.dead = false;
  }

  isOutside(margin = 80) {
    return this.x < -margin || this.x > FIELD.w + margin || this.y < -margin || this.y > HEIGHT + margin;
  }
}

class Player extends Entity {
  constructor() {
    super(FIELD.w / 2, HEIGHT - 78, 7, "#7dff9b");
    this.hp = 5;
    this.maxHp = 5;
    this.speed = 270;
    this.fireCooldown = 0;
    this.invincible = 0;
  }

  update(dt, input, bullets) {
    const axis = input.axis();
    this.x = clamp(this.x + axis.x * this.speed * dt, 18, FIELD.w - 18);
    this.y = clamp(this.y + axis.y * this.speed * dt, 18, HEIGHT - 18);
    this.fireCooldown -= dt;
    this.invincible = Math.max(0, this.invincible - dt);

    if (this.fireCooldown <= 0) {
      bullets.push(new Bullet(this.x - 5, this.y - 14, 0, -620, 4, "#b9fffc", "player"));
      bullets.push(new Bullet(this.x + 5, this.y - 14, 0, -620, 4, "#b9fffc", "player"));
      this.fireCooldown = 0.09;
    }
  }

  hit() {
    if (this.invincible > 0) return;
    this.hp -= 1;
    this.invincible = 1.25;
  }

  draw(ctx) {
    const blink = this.invincible > 0 && Math.floor(this.invincible * 18) % 2 === 0;
    if (blink) return;
    pixelRect(ctx, this.x - 4, this.y - 13, 8, 8, "#e8fbff");
    pixelRect(ctx, this.x - 10, this.y - 4, 20, 10, this.color);
    pixelRect(ctx, this.x - 4, this.y + 5, 8, 8, "#2ed573");
    pixelRect(ctx, this.x - 2, this.y - 2, 4, 4, "#061021");
  }
}

class Boss extends Entity {
  constructor(config) {
    super(FIELD.w / 2, 104, 28, config.color);
    this.name = config.name;
    this.maxHp = config.hp;
    this.hp = config.hp;
    this.speed = config.speed;
    this.time = 0;
    this.phaseTime = 0;
    this.patternIndex = 0;
  }

  update(dt, stage, player, enemyBullets) {
    this.time += dt;
    this.phaseTime += dt;
    this.x = FIELD.w / 2 + Math.sin(this.time * 0.95) * 250 + Math.sin(this.time * 2.2) * 42;
    this.y = 98 + Math.sin(this.time * 1.35) * 44;

    if (this.phaseTime > 4.2) {
      this.phaseTime = 0;
      this.patternIndex = (this.patternIndex + 1) % stage.patterns.length;
    }
    BulletPatterns[stage.patterns[this.patternIndex]](this, player, enemyBullets, dt);
  }

  draw(ctx) {
    pixelRect(ctx, this.x - 30, this.y - 22, 60, 44, this.color);
    pixelRect(ctx, this.x - 20, this.y - 32, 40, 14, "#f8f0ff");
    pixelRect(ctx, this.x - 16, this.y - 7, 10, 10, "#061021");
    pixelRect(ctx, this.x + 6, this.y - 7, 10, 10, "#061021");
    pixelRect(ctx, this.x - 38, this.y + 6, 12, 22, this.color);
    pixelRect(ctx, this.x + 26, this.y + 6, 12, 22, this.color);
  }
}

class Bullet extends Entity {
  constructor(x, y, vx, vy, radius, color, owner) {
    super(x, y, radius, color);
    this.vx = vx;
    this.vy = vy;
    this.owner = owner;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.dead = this.isOutside();
  }

  draw(ctx) {
    pixelRect(ctx, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2, this.color);
  }
}

const BulletPatterns = {
  radial: timedPattern(0.72, (boss, player, bullets) => {
    for (let i = 0; i < 18; i++) fireAngle(bullets, boss, (Math.PI * 2 * i) / 18 + boss.time * 0.18, 130, "#ff7a90");
  }),
  aimed: timedPattern(0.38, (boss, player, bullets) => {
    const base = Math.atan2(player.y - boss.y, player.x - boss.x);
    [-0.24, 0, 0.24].forEach((offset) => fireAngle(bullets, boss, base + offset, 210, "#ffde7a"));
  }),
  spiral: timedPattern(0.09, (boss, player, bullets) => {
    fireAngle(bullets, boss, boss.time * 5.2, 165, "#c77dff");
    fireAngle(bullets, boss, boss.time * 5.2 + Math.PI, 165, "#c77dff");
  }),
  wall: timedPattern(0.95, (boss, player, bullets) => {
    const gap = rand(90, FIELD.w - 90);
    for (let x = 30; x < FIELD.w - 10; x += 36) {
      if (Math.abs(x - gap) > 58) bullets.push(new Bullet(x, -10, 0, 175, 6, "#79f2ff", "enemy"));
    }
  }),
  flower: timedPattern(0.18, (boss, player, bullets) => {
    for (let i = 0; i < 6; i++) {
      const angle = boss.time * 2.4 + (Math.PI * 2 * i) / 6 + Math.sin(boss.time * 3) * 0.4;
      fireAngle(bullets, boss, angle, 150, "#ff9f43");
    }
  }),
};

function timedPattern(interval, shoot) {
  let elapsed = 0;
  return (boss, player, bullets, dt) => {
    elapsed += dt;
    if (elapsed < interval) return;
    elapsed = 0;
    shoot(boss, player, bullets);
  };
}

function fireAngle(bullets, boss, angle, speed, color) {
  bullets.push(new Bullet(boss.x, boss.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 5, color, "enemy"));
}

class Game {
  constructor() {
    this.input = new Input();
    this.state = "title";
    this.stageIndex = 0;
    this.player = new Player();
    this.boss = null;
    this.playerBullets = [];
    this.enemyBullets = [];
    this.stars = Array.from({ length: 120 }, () => ({ x: rand(0, FIELD.w), y: rand(0, HEIGHT), speed: rand(12, 55) }));
  }

  start() {
    this.stageIndex = 0;
    this.player = new Player();
    this.loadStage();
    this.state = "playing";
  }

  loadStage() {
    this.playerBullets = [];
    this.enemyBullets = [];
    this.boss = new Boss(STAGES[this.stageIndex].boss);
    this.player.x = FIELD.w / 2;
    this.player.y = HEIGHT - 78;
    this.player.invincible = 1.5;
  }

  update(dt) {
    if (this.state !== "playing") return;
    const stage = STAGES[this.stageIndex];
    this.stars.forEach((star) => {
      star.y += star.speed * dt;
      if (star.y > HEIGHT) Object.assign(star, { x: rand(0, FIELD.w), y: -4 });
    });
    this.player.update(dt, this.input, this.playerBullets);
    this.boss.update(dt, stage, this.player, this.enemyBullets);
    [...this.playerBullets, ...this.enemyBullets].forEach((bullet) => bullet.update(dt));
    this.handleCollisions();
    this.playerBullets = this.playerBullets.filter((bullet) => !bullet.dead);
    this.enemyBullets = this.enemyBullets.filter((bullet) => !bullet.dead);

    if (this.boss.hp <= 0) this.nextStage();
    if (this.player.hp <= 0) this.finish(false);
  }

  handleCollisions() {
    for (const bullet of this.playerBullets) {
      if (!bullet.dead && distSq(bullet, this.boss) < (bullet.radius + this.boss.radius) ** 2) {
        bullet.dead = true;
        this.boss.hp -= 1;
      }
    }
    for (const bullet of this.enemyBullets) {
      if (!bullet.dead && distSq(bullet, this.player) < (bullet.radius + this.player.radius) ** 2) {
        bullet.dead = true;
        this.player.hit();
      }
    }
  }

  nextStage() {
    if (this.stageIndex >= STAGES.length - 1) return this.finish(true);
    this.stageIndex += 1;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
    this.loadStage();
  }

  finish(win) {
    this.state = win ? "clear" : "gameover";
    showResult(win, this.stageIndex + 1);
  }

  draw(ctx) {
    drawBackground(ctx, STAGES[this.stageIndex] ?? STAGES[0], this.stars);
    if (this.boss) this.boss.draw(ctx);
    this.playerBullets.forEach((bullet) => bullet.draw(ctx));
    this.enemyBullets.forEach((bullet) => bullet.draw(ctx));
    this.player.draw(ctx);
    if (this.boss) drawHud(ctx, this);
  }
}

function pixelRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBackground(ctx, stage, stars) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, stage.background[0]);
  gradient.addColorStop(1, stage.background[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD.w, HEIGHT);
  stars.forEach((star) => pixelRect(ctx, star.x, star.y, 3, 3, "#d9f7ff"));
  ctx.strokeStyle = "#24456f";
  ctx.lineWidth = 2;
  for (let x = 0; x < FIELD.w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 80, HEIGHT);
    ctx.stroke();
  }
}

function drawHud(ctx, game) {
  const stage = STAGES[game.stageIndex];
  pixelRect(ctx, FIELD.w, 0, UI_WIDTH, HEIGHT, "#081226");
  pixelRect(ctx, FIELD.w + 8, 8, UI_WIDTH - 16, HEIGHT - 16, "#101a33");
  drawText(ctx, stage.name, FIELD.w + 18, 36, 16, "#ffe66d");
  drawText(ctx, stage.boss.name, FIELD.w + 18, 82, 16, "#e8fbff");
  drawText(ctx, "BOSS HP", FIELD.w + 18, 126, 14, "#ff9fb0");
  drawVerticalBar(ctx, FIELD.w + 54, 154, 56, 360, game.boss.hp / game.boss.maxHp, "#ff5c7a");
  drawText(ctx, `${Math.max(0, Math.ceil(game.boss.hp))}/${game.boss.maxHp}`, FIELD.w + 28, 540, 14, "#e8fbff");
  drawText(ctx, "PLAYER", FIELD.w + 18, 590, 14, "#7dff9b");
  for (let i = 0; i < game.player.maxHp; i++) {
    pixelRect(ctx, FIELD.w + 22 + i * 25, 612, 18, 18, i < game.player.hp ? "#7dff9b" : "#283a57");
  }
  drawText(ctx, "MOVE", FIELD.w + 18, 664, 13, "#79f2ff");
  drawText(ctx, "ARROWS / WASD", FIELD.w + 18, 686, 13, "#79f2ff");
}

function drawVerticalBar(ctx, x, y, w, h, ratio, color) {
  pixelRect(ctx, x - 4, y - 4, w + 8, h + 8, "#050817");
  pixelRect(ctx, x, y, w, h, "#253858");
  const fill = clamp(ratio, 0, 1) * h;
  pixelRect(ctx, x, y + h - fill, w, fill, color);
}

function drawText(ctx, text, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.font = `${size}px 'Courier New', monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

const game = new Game();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw(ctx);
  requestAnimationFrame(loop);
}

function hideOverlays() {
  document.getElementById("titleOverlay").classList.add("hidden");
  document.getElementById("resultOverlay").classList.add("hidden");
}

function showResult(win, reachedStage) {
  const overlay = document.getElementById("resultOverlay");
  document.getElementById("resultTitle").textContent = win ? "ALL STAGES CLEAR!" : "GAME OVER";
  document.getElementById("resultText").textContent = win
    ? "全てのボスを撃破しました。次はより少ない被弾で挑戦しましょう。"
    : `STAGE ${reachedStage} で撃墜されました。弾幕の隙間を見つけて再挑戦！`;
  overlay.classList.remove("hidden");
}

document.getElementById("startButton").addEventListener("click", () => {
  hideOverlays();
  game.start();
});
document.getElementById("restartButton").addEventListener("click", () => {
  hideOverlays();
  game.start();
});

requestAnimationFrame(loop);
