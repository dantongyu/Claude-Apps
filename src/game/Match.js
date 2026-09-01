import * as THREE from 'three';
import { Random } from '../core/Random.js';
import { buildArena } from './Arena.js';
import { PlayerController } from './PlayerController.js';
import { Weapon } from './Weapon.js';
import { Effects } from './Effects.js';
import { Enemy } from './Enemy.js';
import { LootSystem } from './Loot.js';
import { Objectives } from './Objectives.js';
import { Inventory } from '../inventory/Inventory.js';
import { itemDef, itemName } from '../inventory/Item.js';
import { ENEMIES } from '../data/enemies.js';
import { Hud } from '../ui/hud/Hud.js';

const RESPAWN_DELAY = 2.2;
const EXTRACT_RADIUS = 3.4;

// One playable mission. Owns its scene graph entirely and tears all of it down
// in dispose(), so lobby -> match -> lobby can repeat without leaking.
export class Match {
  constructor({ renderer, mission, profile, loadout, hudRoot, input, onFinish }) {
    this.renderer = renderer;
    this.mission = mission;
    this.profile = profile;
    this.input = input;
    this.onFinish = onFinish;
    this.finished = false;

    this.rng = new Random(mission.seed ^ 0x9e3779b9);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fb6c4);
    this.scene.fog = new THREE.Fog(0x9fb6c4, mission.arena.size * 0.55, mission.arena.size * 1.5);

    this.camera = new THREE.PerspectiveCamera(
      profile.settings.fov, window.innerWidth / window.innerHeight, 0.05, 600,
    );
    this.scene.add(this.camera);

    this.arena = buildArena(mission.arena, mission.seed);
    this.scene.add(this.arena.group);

    this.effects = new Effects(this.scene);

    this.player = new PlayerController(this.camera, this.arena.colliders, this.arena.half);
    this.player.spawn(this.arena.playerSpawn);

    // Loadout items are cloned so a failed run cannot corrupt the stash.
    const carried = loadout.map((it) => ({ ...it }));
    this.inventory = new Inventory(carried, { ...profile.ammo });

    this.hud = new Hud(hudRoot);
    this.weapon = null;

    const luck = Math.min(0.9, (mission.level - 1) * 0.09);
    this.loot = new LootSystem(this.scene, this.rng, luck, this.inventory, {
      onPickup: (text, color) => this.hud.toast(text, color),
      onBlocked: (text) => this.hud.toast(text, '#ff6a6a'),
      onChestOpened: () => {
        this.stats.chests++;
        this.objectives.onChestOpened();
        this.hud.toast('Chest opened', '#d8b04a');
      },
    });
    this.loot.spawnChests(this.arena.chestSpots);

    this.objectives = new Objectives(mission);
    this.objectives.on('complete', () => this.finish(true));
    this.objectives.on('objective', (o) => this.hud.toast(`Objective: ${o.label}`, '#4fd66f'));

    this.enemies = [];
    this.spawnedCount = 0;
    this.spawnTimer = 1.5;
    this.stats = { kills: 0, chests: 0, headshots: 0, damage: 0, time: 0 };

    this.useTimer = 0;
    this.useItem = null;
    this.deathTimer = 0;
    this.paused = false;

    this._equipFirstWeapon();
    this.hud.setBanner(mission.name, mission.brief);
    this.hud.objectiveList(this.objectives.view());
  }

  // --- weapons ---------------------------------------------------------------

  _weaponCtx() {
    return {
      camera: this.camera,
      scene: this.scene,
      effects: this.effects,
      arena: this.arena,
      enemies: this.enemies,
      player: this.player,
      inventory: this.inventory,
      onDamage: (info) => this._onEnemyDamaged(info),
      onKill: (enemy) => this._onEnemyKilled(enemy),
    };
  }

  _equipFirstWeapon() {
    const idx = this.inventory.slots.findIndex((i) => i && i.kind === 'weapon');
    this.inventory.select(idx === -1 ? 0 : idx);
    this._syncWeapon();
  }

  // Rebuilds the held weapon when the active slot changes.
  _syncWeapon() {
    const item = this.inventory.activeItem;
    const same = this.weapon && this.weapon.item === item;
    if (same) return;
    this.weapon?.dispose();
    this.weapon = null;
    if (item && item.kind === 'weapon') {
      this.weapon = new Weapon(item, this._weaponCtx());
    }
  }

  // --- combat callbacks ------------------------------------------------------

  _onEnemyDamaged({ enemy, damage, isHead, point }) {
    this.stats.damage += damage;
    if (isHead) this.stats.headshots++;
    this.hud.hitMark(isHead);
    const p = point.clone().project(this.camera);
    if (p.z < 1) {
      this.hud.damageNumber(
        (p.x * 0.5 + 0.5) * window.innerWidth,
        (-p.y * 0.5 + 0.5) * window.innerHeight,
        damage, isHead,
      );
    }
  }

  _onEnemyKilled(enemy) {
    this.stats.kills++;
    this.objectives.onKill();
    this.loot.dropFromEnemy(enemy.pos);
    this.hud.kill(`Eliminated ${enemy.def.name}`);
  }

  _onPlayerDamaged(amount, fromPos) {
    if (!this.player.alive) return;
    this.player.takeDamage(amount, fromPos);
    this.hud.tookDamage(this.player.damageIndicatorAngle());
    if (!this.player.alive) {
      this.deathTimer = RESPAWN_DELAY;
      this.hud.setBanner('You went down', 'Mission failed');
    }
  }

  // --- spawning --------------------------------------------------------------

  _spawnTick(dt) {
    const cfg = this.mission.spawns;
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive >= cfg.maxAlive) return;
    if (this.spawnedCount >= cfg.budget) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.rng.range(1.2, 3.0);

    // Spawn out of the player's immediate view so bots don't pop in on top of them.
    const candidates = this.arena.enemySpawns
      .filter((s) => s.distanceTo(this.player.pos) > 18)
      .sort(() => this.rng.next() - 0.5);
    const spot = candidates[0] ?? this.rng.pick(this.arena.enemySpawns);

    const typeId = this.rng.pick(cfg.types);
    const enemy = new Enemy(ENEMIES[typeId], spot, {
      scene: this.scene,
      colliders: this.arena.colliders,
      arenaHalf: this.arena.half,
      player: this.player,
      effects: this.effects,
      onPlayerDamaged: (dmg, from) => this._onPlayerDamaged(dmg, from),
    });
    this.enemies.push(enemy);
    this.spawnedCount++;
  }

  // --- input -----------------------------------------------------------------

  _handleActions(dt) {
    const input = this.input;

    const slot = input.takeSlotRequest();
    if (slot >= 0) {
      this.inventory.select(slot);
      this._syncWeapon();
      this._cancelUse();
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      this.inventory.cycle(wheel > 0 ? 1 : -1);
      this._syncWeapon();
      this._cancelUse();
    }

    if (input.pressed('reload')) this.weapon?.startReload();

    if (input.pressed('drop')) {
      const item = this.inventory.removeAt(this.inventory.active);
      if (item) {
        this.loot.dropAt(this.player.pos.clone().addScaledVector(this.player.forwardVector(), 1.4), item);
        this.hud.toast(`Dropped ${itemName(item)}`, '#9aa0a6');
        this._syncWeapon();
      }
    }

    // Chest interaction.
    const chest = this.loot.chestNear(this.player.pos);
    if (chest && input.pressed('interact')) this.loot.openChest(chest);

    // Held-F consumable use.
    const active = this.inventory.activeItem;
    const usable = active && active.kind === 'consumable';
    if (usable && input.down('use')) {
      if (this.useItem !== active) {
        this.useItem = active;
        this.useTimer = itemDef(active).useTime;
      }
      this.useTimer -= dt;
      if (this.useTimer <= 0) this._finishUse();
    } else if (this.useItem) {
      this._cancelUse();
    }

    // Prompt priority: using > chest > nothing.
    if (this.useItem) {
      const def = itemDef(this.useItem);
      const pct = Math.round((1 - this.useTimer / def.useTime) * 100);
      this.hud.setPrompt(`Using ${def.name}… ${pct}%`);
    } else if (chest) {
      this.hud.setPrompt('[E] Open chest');
    } else if (usable) {
      this.hud.setPrompt(`[F] Use ${itemDef(active).name}`);
    } else {
      this.hud.setPrompt(null);
    }
  }

  _cancelUse() {
    this.useItem = null;
    this.useTimer = 0;
  }

  _finishUse() {
    const item = this.useItem;
    const def = itemDef(item);
    this._cancelUse();
    const slot = this.inventory.slots.indexOf(item);
    if (slot === -1) return;
    if (def.heal) {
      const healed = this.player.heal(def.heal, def.cap);
      this.hud.toast(`+${Math.round(healed)} health`, '#4fd66f');
    }
    if (def.shield) {
      const gained = this.player.addShield(def.shield, def.shieldCap);
      this.hud.toast(`+${Math.round(gained)} shield`, '#4aa9ff');
    }
    this.inventory.consumeAt(slot);
    this._syncWeapon();
  }

  // --- loop ------------------------------------------------------------------

  update(dt) {
    if (this.finished) return;

    if (this.paused || !this.input.locked) {
      // Still drain edge-triggered input so nothing queues up while paused.
      this.input.endFrame();
      return;
    }

    this.stats.time += dt;

    if (this.player.alive) {
      const look = this.input.takeMouseDelta();
      this.player.look(look.x, look.y, this.profile.settings.invertY);
      this.player.update(dt, this.input);
      this._handleActions(dt);
      this.weapon?.update(dt, this.input.mouseDown && !this.useItem);
    } else {
      this.deathTimer -= dt;
      this.hud.setPrompt(null);
      if (this.deathTimer <= 0) {
        this.finish(false);
        this.input.endFrame();
        return;
      }
    }

    this._spawnTick(dt);
    for (const e of this.enemies) e.update(dt, this.player.pos, this.player.alive);

    // Reap corpses once their topple animation has played out.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive && e.deathTime > 3) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }

    this.loot.update(dt, this.player.pos);
    this.effects.update(dt);

    const atExtract = this.arena.extractPos.distanceTo(this.player.pos) < EXTRACT_RADIUS;
    this.objectives.tick(dt, atExtract);
    // tick() can complete the mission, which disposes this match immediately.
    if (this.finished) return;
    const pad = this.arena.extractPad;
    if (this.objectives.extractEntry) {
      pad.visible = this.objectives.extractUnlocked;
      if (pad.visible) pad.material.opacity = 0.35 + Math.sin(this.stats.time * 3) * 0.2;
    }

    this.hud.vitals(this.player.health, this.player.shield);
    this.hud.ammo(this.weapon);
    this.hud.hotbarState(this.inventory);
    this.hud.objectiveList(this.objectives.view());
    this.hud.update(dt);

    this.input.endFrame();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setPaused(paused) {
    this.paused = paused;
  }

  // --- ending ----------------------------------------------------------------

  finish(success) {
    if (this.finished) return;
    this.finished = true;
    this.weapon?.syncItem();

    const result = {
      mission: this.mission,
      success,
      kills: this.stats.kills,
      chests: this.stats.chests,
      headshots: this.stats.headshots,
      damage: Math.round(this.stats.damage),
      time: this.stats.time,
      // On success everything in the backpack extracts with you; on a wipe you
      // keep only what you brought in.
      carried: success ? this.inventory.items().map((i) => ({ ...i })) : null,
      ammo: { ...this.inventory.ammo },
      objectives: this.objectives.view(),
    };
    this.onFinish?.(result);
  }

  dispose() {
    this.weapon?.dispose();
    this.weapon = null;
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.loot.dispose();
    this.effects.dispose();
    this.arena.dispose();
    this.hud.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
        else m?.dispose?.();
      }
    });
    this.scene.clear();
  }
}
