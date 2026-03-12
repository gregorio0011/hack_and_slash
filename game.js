const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Input Handling ---
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });
const mouse = { x: 0, y: 0, clicked: false };
window.addEventListener('mousedown', e => { if(e.button === 0) mouse.clicked = true; });
window.addEventListener('mouseup', e => { if(e.button === 0) mouse.clicked = false; });

// --- Game Constants & Globals ---
const GRAVITY = 0.5;
const FRICTION = 0.8;
const MAX_FALL_SPEED = 12;
const TILE_SIZE = 40;

const MAP = [
    "1111111111111111111111111",
    "1000000000000000000000001",
    "1000000000000000000000001",
    "1000000000220000000000001",
    "1000000000000000022200001",
    "1000022220000000000000001",
    "1000000000000222000000001",
    "1000000000000000000002201",
    "1000220002220000000000001",
    "1000000000000000000000001",
    "1111111111111111111111111"
];

let platforms = [];
for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[y].length; x++) {
        if (MAP[y][x] !== '0') {
            platforms.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, type: MAP[y][x] });
        }
    }
}

// --- Utils ---
function AABB(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

// --- Effects ---
class ScreenShake {
    constructor() {
        this.duration = 0;
        this.intensity = 0;
    }
    trigger(intensity, duration) {
        this.intensity = intensity;
        this.duration = duration;
    }
    update(dt) {
        if (this.duration > 0) {
            this.duration -= dt;
        }
    }
    getOffset() {
        if (this.duration > 0) {
            return {
                x: (Math.random() - 0.5) * this.intensity,
                y: (Math.random() - 0.5) * this.intensity
            };
        }
        return { x: 0, y: 0 };
    }
}
const cameraShake = new ScreenShake();

class Particle {
    constructor(x, y, color, speed, life) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = Math.random() * 3 + 2;
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= dt;
        this.size = Math.max(0, this.size - dt * 0.1);
    }
    draw(ctx, camX, camY) {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillRect(this.x - camX, this.y - camY, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y;
        this.text = text;
        this.color = color;
        this.life = 30;
        this.vy = -1;
    }
    update(dt) {
        this.y += this.vy;
        this.life -= dt;
    }
    draw(ctx, camX, camY) {
        ctx.fillStyle = this.color;
        ctx.font = "bold 16px Courier New";
        ctx.globalAlpha = Math.max(0, this.life / 30);
        ctx.fillText(this.text, this.x - camX, this.y - camY);
        ctx.globalAlpha = 1;
    }
}

class Orb {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 8; this.h = 8;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = -Math.random() * 4 - 2;
        this.life = 600;
        this.collected = false;
    }
    update(dt) {
        this.vy += GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;

        // Platform collision
        for (let p of platforms) {
            if (AABB(this, p)) {
                this.y = p.y - this.h;
                this.vy = -this.vy * 0.5; // Bounce
                this.vx *= 0.8;
            }
        }
        
        // Attraction to player
        let dx = player.x + player.w/2 - this.x;
        let dy = player.y + player.h/2 - this.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 100) {
            this.vx += (dx / dist) * 0.5;
            this.vy += (dy / dist) * 0.5;
        }

        this.life -= dt;
    }
    draw(ctx, camX, camY) {
        ctx.fillStyle = "#0ff";
        ctx.fillRect(this.x - camX, this.y - camY, this.w, this.h);
        // Glow
        ctx.fillStyle = "rgba(0, 255, 255, 0.3)";
        ctx.fillRect(this.x - camX - 2, this.y - camY - 2, this.w + 4, this.h + 4);
    }
}

// --- Entities ---
class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y;
        this.w = w; this.h = h;
        this.vx = 0; this.vy = 0;
        this.grounded = false;
        this.facingRight = true;
        this.hp = 100;
        this.maxHp = 100;
        this.color = "#fff";
        this.flashTimer = 0;
    }
    move(dt) {
        this.vy += GRAVITY;
        if(this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        this.x += this.vx;
        this.checkCollisionX();
        
        this.y += this.vy;
        this.checkCollisionY();
        
        if (this.flashTimer > 0) this.flashTimer -= dt;
    }
    checkCollisionX() {
        for (let p of platforms) {
            if (AABB(this, p)) {
                if (this.vx > 0) { this.x = p.x - this.w; this.vx = 0; }
                else if (this.vx < 0) { this.x = p.x + p.w; this.vx = 0; }
            }
        }
    }
    checkCollisionY() {
        this.grounded = false;
        for (let p of platforms) {
            if (AABB(this, p)) {
                if (this.vy > 0) { 
                    this.y = p.y - this.h; 
                    this.vy = 0; 
                    this.grounded = true; 
                }
                else if (this.vy < 0) { 
                    this.y = p.y + p.h; 
                    this.vy = 0; 
                }
            }
        }
    }
    draw(ctx, camX, camY) {
        ctx.fillStyle = this.flashTimer > 0 ? "#fff" : this.color;
        ctx.fillRect(this.x - camX, this.y - camY, this.w, this.h);
        // Eye direction indicator
        ctx.fillStyle = "#000";
        let eyeX = this.facingRight ? this.x + this.w - 8 : this.x + 4;
        ctx.fillRect(eyeX - camX, this.y + 4 - camY, 4, 4);
    }
}

class Player extends Entity {
    constructor(x, y) {
        super(x, y, 20, 32);
        this.color = "#4a90e2";
        this.speed = 4;
        this.jumpForce = 10;
        
        // Progression
        this.level = 1;
        this.xp = 0;
        this.xpNext = 100;
        this.score = 0;
        
        // Attack stats
        this.baseDamage = 20;
        this.attackSpeedMult = 1.0;
        
        // Combat state
        this.attacking = false;
        this.attackTimer = 0;
        this.comboStep = 0;
        this.comboWaitTimer = 0; // Time window to hit next combo
        
        this.justClicked = false;
    }
    
    update(dt) {
        // Input Handling
        if (keys['KeyA'] || keys['ArrowLeft']) { this.vx = -this.speed; this.facingRight = false; }
        else if (keys['KeyD'] || keys['ArrowRight']) { this.vx = this.speed; this.facingRight = true; }
        else { this.vx *= FRICTION; }
        
        if ((keys['Space'] || keys['KeyW'] || keys['ArrowUp']) && this.grounded) {
            this.vy = -this.jumpForce;
            this.grounded = false;
        }

        let attackInput = (keys['KeyZ'] || mouse.clicked);
        if (attackInput && !this.justClicked) {
            this.justClicked = true;
            this.triggerAttack();
        } else if (!attackInput) {
            this.justClicked = false;
        }

        // Processing timers
        if (this.attacking) {
            this.attackTimer -= dt * this.attackSpeedMult;
            this.vx *= 0.5; // Slow down while attacking
            if (this.attackTimer <= 0) {
                this.attacking = false;
                this.comboWaitTimer = 20; // window to continue combo
                this.doDamage();
            }
        }

        if (this.comboWaitTimer > 0 && !this.attacking) {
            this.comboWaitTimer -= dt;
            if (this.comboWaitTimer <= 0) {
                this.comboStep = 0; // reset combo
            }
        }

        this.move(dt);
    }

    triggerAttack() {
        if (this.attacking) return;
        this.attacking = true;
        this.comboStep = (this.comboStep + 1) % 4;
        if (this.comboStep === 0) this.comboStep = 1;
        
        // Attack timings based on combo step
        this.attackTimer = this.comboStep === 3 ? 15 : 10;
        
        // Visual cue / sound (particles)
        // Dash forward slightly on attack
        this.vx += this.facingRight ? 3 : -3;
    }

    doDamage() {
        let hitbox = {
            x: this.facingRight ? this.x + this.w : this.x - 40,
            y: this.y - 10,
            w: 40,
            h: this.h + 20
        };

        let damage = this.baseDamage + (this.comboStep === 3 ? this.baseDamage * 0.5 : 0);
        let crit = Math.random() < 0.2;
        if (crit) { damage *= 2; cameraShake.trigger(5, 5); }

        // Spawn hit effect
        for(let i=0; i<5; i++) {
            particles.push(new Particle(
                hitbox.x + Math.random() * hitbox.w,
                hitbox.y + Math.random() * hitbox.h,
                "#fff", 2, 10
            ));
        }

        // Check enemies
        for (let enemy of enemies) {
            if (AABB(hitbox, enemy)) {
                enemy.takeDamage(damage, this.facingRight);
                if (crit) {
                    cameraShake.trigger(5, 10);
                }
            }
        }
    }

    gainXp(amount) {
        this.xp += amount;
        this.score += amount * 10;
        if (this.xp >= this.xpNext) {
            this.levelUp();
        }
    }

    levelUp() {
        this.xp -= this.xpNext;
        this.level++;
        this.xpNext = Math.floor(this.xpNext * 1.5);
        this.hp = this.maxHp; // Heal on level up
        
        // Shadow Blade Level Rules
        if (this.level >= 2 && this.level <= 5) {
            this.attackSpeedMult += 0.10;
        } else if (this.level >= 6) {
            this.baseDamage += 5;
        }
        
        texts.push(new FloatingText(this.x, this.y - 20, "LEVEL UP!", "#ff0"));
        for(let i=0; i<20; i++) {
            particles.push(new Particle(this.x + this.w/2, this.y + this.h, "#ff0", 4, 30));
        }
    }

    draw(ctx, camX, camY) {
        super.draw(ctx, camX, camY);
        // Draw sword / attack arc
        if (this.attacking) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            let progress = 1 - (this.attackTimer / (this.comboStep === 3 ? 15 : 10));
            // Simple swing arc representations
            let sx = this.facingRight ? this.x + this.w : this.x;
            let sy = this.y + 16;
            let length = 30 + (this.comboStep === 3 ? 10 : 0);
            
            ctx.save();
            ctx.translate(sx - camX, sy - camY);
            
            let angle = 0;
            if (this.comboStep === 1) angle = Math.PI/2 - progress * Math.PI; // Top to bot
            else if (this.comboStep === 2) angle = -Math.PI/2 + progress * Math.PI; // Bot to top
            else if (this.comboStep === 3) angle = 0; // Thrust

            if (!this.facingRight && this.comboStep !== 3) {
                 // inverse angles for left
                 angle = -angle + Math.PI;
            } else if (!this.facingRight) {
                 angle = Math.PI;
            }

            ctx.rotate(angle);
            ctx.fillRect(0, -2, length, 4);
            ctx.restore();
        }
    }
}

class Enemy extends Entity {
    constructor(x, y) {
        super(x, y, 20, 24);
        this.color = "#e74c3c";
        this.speed = 1.5;
        this.hp = 50;
        this.maxHp = 50;
        this.patrolTimer = 60;
    }
    update(dt) {
        // Basic AI
        this.patrolTimer -= dt;
        if (this.patrolTimer <= 0) {
            this.patrolTimer = 60 + Math.random() * 60;
            this.facingRight = !this.facingRight;
        }
        
        this.vx = this.facingRight ? this.speed : -this.speed;
        
        // Edge detection (simple)
        let edgeX = this.facingRight ? this.x + this.w + 5 : this.x - 5;
        let edgeY = this.y + this.h + 5;
        let onGround = false;
        for (let p of platforms) {
            if (edgeX > p.x && edgeX < p.x + p.w && edgeY > p.y && edgeY < p.y + p.h) {
                onGround = true;
                break;
            }
        }
        if (!onGround && this.grounded) {
            this.facingRight = !this.facingRight;
            this.patrolTimer = 60;
        }

        // Damage player on touch
        if (AABB(this, player) && player.flashTimer <= 0) {
            player.hp -= 10;
            player.flashTimer = 30;
            player.vx = this.facingRight ? 5 : -5;
            player.vy = -5;
            cameraShake.trigger(8, 10);
            for(let i=0; i<10; i++) particles.push(new Particle(player.x+10, player.y+16, "#f00", 3, 20));
        }

        this.move(dt);
    }
    takeDamage(amt, hitRight) {
        this.hp -= amt;
        this.flashTimer = 5;
        this.vx = hitRight ? 5 : -5; // Knockback
        this.vy = -3;
        
        texts.push(new FloatingText(this.x, this.y, Math.floor(amt), "#fff"));
        for(let i=0; i<5; i++) {
            particles.push(new Particle(this.x+10, this.y+10, "#e74c3c", 4, 15)); // Blood
        }
        
        if (this.hp <= 0) {
            // Die
            for(let i=0; i<3; i++) {
                orbs.push(new Orb(this.x + 10, this.y + 10)); // Drop XP
            }
            for(let i=0; i<15; i++) {
                particles.push(new Particle(this.x+10, this.y+10, "#e74c3c", 6, 20)); // Gore
            }
        }
    }
}

// --- Globals ---
let player = new Player(100, 100);
let enemies = [
    new Enemy(300, 200),
    new Enemy(500, 300),
    new Enemy(600, 300),
    new Enemy(400, 150)
];
let particles = [];
let texts = [];
let orbs = [];

// Game Loop
let lastTime = performance.now();
const TARGET_FPS = 60;
const TIME_STEP = 1000 / TARGET_FPS;

function update(dt) {
    player.update(dt);
    
    // Manage enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update(dt);
        if (enemies[i].hp <= 0) {
            enemies.splice(i, 1);
        }
    }
    
    // Spawn enemies
    if (Math.random() < 0.01 && enemies.length < 8) {
        enemies.push(new Enemy(200 + Math.random() * 400, 50));
    }

    // Orbs
    for (let i = orbs.length - 1; i >= 0; i--) {
        orbs[i].update(dt);
        if (AABB(orbs[i], player)) {
            player.gainXp(20);
            orbs.splice(i, 1);
            continue;
        }
        if (orbs[i].life <= 0) orbs.splice(i, 1);
    }

    // Particles & Texts
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
        texts[i].update(dt);
        if (texts[i].life <= 0) texts.splice(i, 1);
    }

    cameraShake.update(dt);
}

function draw() {
    ctx.fillStyle = "#1a1a2e"; // Dark background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Camera follow
    let targetCamX = player.x + player.w/2 - canvas.width / 2;
    let targetCamY = player.y + player.h/2 - canvas.height / 2;
    
    // Bounds
    targetCamX = Math.max(0, Math.min(targetCamX, MAP[0].length * TILE_SIZE - canvas.width));
    targetCamY = Math.max(0, Math.min(targetCamY, MAP.length * TILE_SIZE - canvas.height));

    let shakeOffset = cameraShake.getOffset();
    let camX = targetCamX + shakeOffset.x;
    let camY = targetCamY + shakeOffset.y;

    // Draw Map
    ctx.fillStyle = "#16213e";
    for (let p of platforms) {
        ctx.fillRect(p.x - camX, p.y - camY, p.w, p.h);
        // Top border
        ctx.fillStyle = "#0f3460";
        ctx.fillRect(p.x - camX, p.y - camY, p.w, 4);
        ctx.fillStyle = "#16213e";
    }

    // Draw Entities
    for (let orb of orbs) orb.draw(ctx, camX, camY);
    for (let enemy of enemies) enemy.draw(ctx, camX, camY);
    player.draw(ctx, camX, camY);
    
    for (let p of particles) p.draw(ctx, camX, camY);
    for (let t of texts) t.draw(ctx, camX, camY);

    // Context / UI Space
    drawHUD();
}

function drawHUD() {
    // Health Bar
    ctx.fillStyle = "#333";
    ctx.fillRect(20, 20, 150, 15);
    ctx.fillStyle = "#e74c3c";
    let hpRatio = Math.max(0, player.hp / player.maxHp);
    ctx.fillRect(20, 20, 150 * hpRatio, 15);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(20, 20, 150, 15);
    ctx.fillStyle = "#fff";
    ctx.font = "12px Courier New";
    ctx.fillText("HP", 25, 32);

    // XP Bar
    ctx.fillStyle = "#333";
    ctx.fillRect(20, 45, 150, 10);
    ctx.fillStyle = "#0ff";
    let xpRatio = player.xp / player.xpNext;
    ctx.fillRect(20, 45, 150 * xpRatio, 10);
    ctx.strokeRect(20, 45, 150, 10);
    
    // Level
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Courier New";
    ctx.fillText("LVL " + player.level, 20, 75);

    // Score (Top Right)
    ctx.textAlign = "right";
    ctx.font = "bold 20px Courier New";
    ctx.fillStyle = "#ffd700";
    ctx.fillText("SCORE: " + player.score, canvas.width - 20, 30);
    ctx.textAlign = "left"; // Reset
    
    // Game Over
    if (player.hp <= 0) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "bold 40px Courier New";
        ctx.fillText("VICTORY DEFEATED", canvas.width/2, canvas.height/2);
        ctx.font = "20px Courier New";
        ctx.fillText("F5 to Restart", canvas.width/2, canvas.height/2 + 40);
        ctx.textAlign = "left";
    }
}

function loop(timestamp) {
    requestAnimationFrame(loop);
    let dt = timestamp - lastTime;
    
    // Prevent huge jumps if tab is inactive
    if (dt > 100) dt = 100;
    
    // Fixed time step updates for physics stability
    // Normalizing dt relative to 60fps base
    let steps = dt / TIME_STEP;
    
    if (player.hp > 0) {
        update(steps);
    }
    
    draw();
    lastTime = timestamp;
}

requestAnimationFrame(loop);
