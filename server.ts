import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  BUILD_COST,
  ISLAND_RADIUS,
  MATERIAL_MAX_HP,
  WEAPONS,
  buildKey,
  groundHeightAt,
} from './src/shared/gameTypes.ts';
import type {
  BuildMaterial,
  BuildPiece,
  BuildPieceType,
  ConsumableId,
  KillFeedItem,
  LootItem,
  PlayerState,
  ResourceNode,
  RoomSummary,
  StormState,
  TargetDrone,
  WeaponId,
} from './src/shared/gameTypes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ClientConn {
  id: string;
  ws: WebSocket;
  roomId: string;
}

interface RoomState {
  roomId: string;
  players: Map<string, PlayerState>;
  conns: Map<string, ClientConn>;
  builds: Map<string, BuildPiece>;
  resources: Map<string, ResourceNode>;
  loot: Map<string, LootItem>;
  targets: Map<string, TargetDrone>;
  storm: StormState;
  matchPhase: 'waiting' | 'active' | 'ended';
  winnerId: string | null;
  winnerName: string | null;
  killFeed: KillFeedItem[];
  lastTickMs: number;
  lastFireMs: Map<string, number>;
}

const STORM_PHASES = [
  { targetRadius: 95, waitSec: 35, shrinkSpeed: 1.2, dps: 2 },
  { targetRadius: 58, waitSec: 30, shrinkSpeed: 1.5, dps: 4 },
  { targetRadius: 28, waitSec: 25, shrinkSpeed: 1.4, dps: 7 },
  { targetRadius: 10, waitSec: 20, shrinkSpeed: 1.1, dps: 12 },
];

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function populateIslandWorld(room: RoomState): void {
  room.builds.clear();
  room.resources.clear();
  room.loot.clear();
  room.targets.clear();
  room.killFeed = [];
  room.winnerId = null;
  room.winnerName = null;

  const rand = seededRandom(42026);

  // 1. Trees (Wood)
  for (let i = 0; i < 64; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 16 + rand() * (ISLAND_RADIUS - 34);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const y = groundHeightAt(x, z);
    if (y < 0.4) continue;
    const id = `tree-${i}`;
    room.resources.set(id, {
      id,
      kind: 'tree',
      x: Number(x.toFixed(2)),
      y,
      z: Number(z.toFixed(2)),
      scale: Number((0.85 + rand() * 0.4).toFixed(2)),
      rotY: Number((rand() * Math.PI * 2).toFixed(2)),
      hp: 160,
      maxHp: 160,
      material: 'wood',
      yieldAmount: 35,
    });
  }

  // 2. Rocks (Brick)
  for (let i = 0; i < 34; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 14 + rand() * (ISLAND_RADIUS - 36);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const y = groundHeightAt(x, z);
    if (y < 0.4) continue;
    const id = `rock-${i}`;
    room.resources.set(id, {
      id,
      kind: 'rock',
      x: Number(x.toFixed(2)),
      y,
      z: Number(z.toFixed(2)),
      scale: Number((0.85 + rand() * 0.45).toFixed(2)),
      rotY: Number((rand() * Math.PI * 2).toFixed(2)),
      hp: 200,
      maxHp: 200,
      material: 'brick',
      yieldAmount: 35,
    });
  }

  // 3. Metal Crates (Metal)
  const crateSpots: Array<[number, number]> = [
    [-16, -12], [18, -14], [-18, 16], [15, 18],
    [32, 6], [-34, -8], [8, -36], [-10, 38],
    [48, -28], [-48, 24], [42, 36], [-44, -38],
    [0, 26], [26, 0], [-28, 0], [0, -26],
  ];
  crateSpots.forEach(([x, z], idx) => {
    const y = groundHeightAt(x, z);
    const id = `crate-${idx}`;
    room.resources.set(id, {
      id,
      kind: 'crate',
      x,
      y,
      z,
      scale: 1,
      rotY: Number((rand() * Math.PI).toFixed(2)),
      hp: 240,
      maxHp: 240,
      material: 'metal',
      yieldAmount: 40,
    });
  });

  // 4. Loot Spawns (Weapons & Consumables)
  const weaponSpawns: Array<{ w: WeaponId; x: number; z: number }> = [
    { w: 'shotgun', x: 6, z: 6 },
    { w: 'smg', x: -7, z: 5 },
    { w: 'ar', x: 4, z: -8 },
    { w: 'sniper', x: -12, z: -16 },
    { w: 'shotgun', x: 24, z: -18 },
    { w: 'ar', x: -26, z: 18 },
    { w: 'smg', x: 28, z: 22 },
    { w: 'sniper', x: 46, z: -4 },
    { w: 'ar', x: -45, z: -14 },
    { w: 'shotgun', x: 14, z: 42 },
    { w: 'sniper', x: -14, z: -48 },
    { w: 'ar', x: 54, z: 32 },
    { w: 'shotgun', x: -52, z: 34 },
    { w: 'smg', x: 38, z: -44 },
  ];
  weaponSpawns.forEach((item, idx) => {
    const id = `loot-w-${idx}`;
    room.loot.set(id, {
      id,
      kind: 'weapon',
      weaponId: item.w,
      amount: 1,
      x: item.x,
      y: groundHeightAt(item.x, item.z) + 0.65,
      z: item.z,
    });
  });

  const consumableSpawns: Array<{ c: ConsumableId; x: number; z: number; amount: number }> = [
    { c: 'mini_shield', x: -4, z: -4, amount: 2 },
    { c: 'big_shield', x: 12, z: 10, amount: 1 },
    { c: 'medkit', x: -14, z: 12, amount: 1 },
    { c: 'mini_shield', x: 22, z: -8, amount: 2 },
    { c: 'big_shield', x: -24, z: -22, amount: 1 },
    { c: 'medkit', x: 30, z: 30, amount: 1 },
    { c: 'mini_shield', x: -38, z: 10, amount: 2 },
    { c: 'big_shield', x: 4, z: 34, amount: 1 },
    { c: 'medkit', x: 42, z: -32, amount: 1 },
    { c: 'mini_shield', x: -46, z: -30, amount: 2 },
  ];
  consumableSpawns.forEach((item, idx) => {
    const id = `loot-c-${idx}`;
    room.loot.set(id, {
      id,
      kind: 'consumable',
      consumableId: item.c,
      amount: item.amount,
      x: item.x,
      y: groundHeightAt(item.x, item.z) + 0.65,
      z: item.z,
    });
  });

  // 5. Practice Target Drones on the northern ridge (synced on server)
  const targetCoords: Array<[number, number]> = [
    [-8, -22],
    [0, -25],
    [8, -22],
    [22, -16],
    [-22, -16],
  ];
  targetCoords.forEach(([x, z], idx) => {
    const id = `target-${idx}`;
    room.targets.set(id, {
      id,
      x,
      y: groundHeightAt(x, z) + 1.5,
      z,
      hp: 100,
      maxHp: 100,
      respawnAt: 0,
    });
  });

  room.storm = {
    phase: 0,
    centerX: 0,
    centerZ: 0,
    currentRadius: ISLAND_RADIUS + 18,
    targetRadius: STORM_PHASES[0].targetRadius,
    nextShrinkIn: STORM_PHASES[0].waitSec,
    isShrinking: false,
    dps: STORM_PHASES[0].dps,
  };
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(rawRoomId: string): RoomState {
  const roomId = (rawRoomId || 'isla-central').trim().toLowerCase().slice(0, 24) || 'isla-central';
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      players: new Map(),
      conns: new Map(),
      builds: new Map(),
      resources: new Map(),
      loot: new Map(),
      targets: new Map(),
      storm: {
        phase: 0,
        centerX: 0,
        centerZ: 0,
        currentRadius: ISLAND_RADIUS + 18,
        targetRadius: STORM_PHASES[0].targetRadius,
        nextShrinkIn: STORM_PHASES[0].waitSec,
        isShrinking: false,
        dps: STORM_PHASES[0].dps,
      },
      matchPhase: 'waiting',
      winnerId: null,
      winnerName: null,
      killFeed: [],
      lastTickMs: Date.now(),
      lastFireMs: new Map(),
    };
    populateIslandWorld(room);
    rooms.set(roomId, room);
  }
  return room;
}

// Pre-seed default room so /api/rooms shows it immediately
getOrCreateRoom('isla-central');

function sendTo(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastRoom(room: RoomState, type: string, payload: unknown, excludeId?: string): void {
  const msg = JSON.stringify({ type, payload });
  for (const [pid, conn] of room.conns) {
    if (pid !== excludeId && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(msg);
    }
  }
}

function spawnPointForPlayer(index: number): { x: number; y: number; z: number } {
  const angle = (index * 2.39996) % (Math.PI * 2);
  const dist = 10 + (index % 5) * 7;
  const x = Number((Math.cos(angle) * dist).toFixed(2));
  const z = Number((Math.sin(angle) * dist).toFixed(2));
  return { x, y: groundHeightAt(x, z), z };
}

function checkMatchState(room: RoomState): void {
  const players = Array.from(room.players.values());
  const alivePlayers = players.filter((p) => p.alive);

  if (players.length >= 2 && room.matchPhase === 'waiting') {
    room.matchPhase = 'active';
    broadcastRoom(room, 'match:state', {
      matchPhase: room.matchPhase,
      winnerId: null,
      winnerName: null,
    });
  } else if (room.matchPhase === 'active' && players.length >= 2 && alivePlayers.length <= 1) {
    const winner = alivePlayers[0] ?? null;
    room.matchPhase = 'ended';
    room.winnerId = winner ? winner.id : null;
    room.winnerName = winner ? winner.name : null;
    broadcastRoom(room, 'match:state', {
      matchPhase: room.matchPhase,
      winnerId: room.winnerId,
      winnerName: room.winnerName,
    });
  } else if (players.length < 2 && room.matchPhase !== 'waiting') {
    room.matchPhase = 'waiting';
    room.winnerId = null;
    room.winnerName = null;
    broadcastRoom(room, 'match:state', {
      matchPhase: room.matchPhase,
      winnerId: null,
      winnerName: null,
    });
  }
}

function eliminatePlayer(room: RoomState, victim: PlayerState, killer: PlayerState | null, weaponName: string): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  victim.shield = 0;

  if (killer && killer.id !== victim.id) {
    killer.kills += 1;
    broadcastRoom(room, 'player:stats', {
      id: killer.id,
      hp: killer.hp,
      shield: killer.shield,
      kills: killer.kills,
      alive: killer.alive,
    });
  }

  const feedItem: KillFeedItem = {
    id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    killerName: killer ? killer.name : 'La Tormenta',
    victimName: victim.name,
    weaponName,
    timestamp: Date.now(),
  };
  room.killFeed.unshift(feedItem);
  if (room.killFeed.length > 6) room.killFeed.pop();

  broadcastRoom(room, 'player:eliminated', {
    victimId: victim.id,
    killerId: killer ? killer.id : null,
    feedItem,
  });

  // Drop victim's non-pickaxe weapons as loot
  victim.weaponsUnlocked.forEach((wId, idx) => {
    if (wId === 'pickaxe') return;
    const lx = victim.x + Math.cos(idx * 1.5) * 1.4;
    const lz = victim.z + Math.sin(idx * 1.5) * 1.4;
    const lootItem: LootItem = {
      id: `drop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'weapon',
      weaponId: wId,
      amount: 1,
      x: Number(lx.toFixed(2)),
      y: groundHeightAt(lx, lz) + 0.65,
      z: Number(lz.toFixed(2)),
    };
    room.loot.set(lootItem.id, lootItem);
    broadcastRoom(room, 'loot:spawned', lootItem);
  });

  checkMatchState(room);
}

// Server simulation tick (10Hz) for Storm Circle, Storm Damage & Target Respawn
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const dt = Math.min(0.5, (now - room.lastTickMs) / 1000);
    room.lastTickMs = now;

    // Respawn destroyed practice target drones after 5s
    for (const target of room.targets.values()) {
      if (target.hp <= 0 && target.respawnAt > 0 && now >= target.respawnAt) {
        target.hp = target.maxHp;
        target.respawnAt = 0;
        broadcastRoom(room, 'target:updated', target);
      }
    }

    // Advance Storm only when at least 1 player is in the room
    if (room.players.size === 0) continue;

    const phaseCfg = STORM_PHASES[Math.min(room.storm.phase, STORM_PHASES.length - 1)];
    if (!room.storm.isShrinking) {
      room.storm.nextShrinkIn -= dt;
      if (room.storm.nextShrinkIn <= 0) {
        room.storm.isShrinking = true;
        room.storm.nextShrinkIn = 0;
      }
    } else {
      const diff = room.storm.currentRadius - room.storm.targetRadius;
      if (diff > 0.2) {
        room.storm.currentRadius = Math.max(
          room.storm.targetRadius,
          room.storm.currentRadius - phaseCfg.shrinkSpeed * dt,
        );
      } else {
        room.storm.isShrinking = false;
        if (room.storm.phase < STORM_PHASES.length - 1) {
          room.storm.phase += 1;
          const nextCfg = STORM_PHASES[room.storm.phase];
          room.storm.targetRadius = nextCfg.targetRadius;
          room.storm.nextShrinkIn = nextCfg.waitSec;
          room.storm.dps = nextCfg.dps;
        } else {
          room.storm.nextShrinkIn = 0;
        }
      }
    }

    // Broadcast storm update
    broadcastRoom(room, 'storm:update', room.storm);

    // Apply storm damage to players outside the circle
    for (const player of room.players.values()) {
      if (!player.alive) continue;
      const dist = Math.hypot(player.x - room.storm.centerX, player.z - room.storm.centerZ);
      if (dist > room.storm.currentRadius) {
        player.hp = Math.max(0, player.hp - room.storm.dps * dt);
        broadcastRoom(room, 'player:stats', {
          id: player.id,
          hp: Math.ceil(player.hp),
          shield: Math.ceil(player.shield),
          kills: player.kills,
          alive: player.alive,
          stormHit: true,
        });
        if (player.hp <= 0) {
          eliminatePlayer(room, player, null, 'Tormenta');
        }
      }
    }
  }
}, 100);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    const list: RoomSummary[] = [];
    for (const room of rooms.values()) {
      const players = Array.from(room.players.values());
      list.push({
        roomId: room.roomId,
        players: players.length,
        alive: players.filter((p) => p.alive).length,
        phase: room.matchPhase,
      });
    }
    res.json({ rooms: list });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let currentRoom: RoomState | null = null;

    ws.on('message', (raw) => {
      let msg: { type: string; payload?: any };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const { type, payload } = msg;

      if (type === 'room:join') {
        const roomId = String(payload?.roomId || 'isla-central');
        const name = String(payload?.name || 'Jugador').trim().slice(0, 18) || 'Jugador';
        const skinColor = String(payload?.skinColor || '#2563eb');

        // Clean up prior room membership if rejoining
        if (currentRoom) {
          currentRoom.players.delete(playerId);
          currentRoom.conns.delete(playerId);
          broadcastRoom(currentRoom, 'player:left', { id: playerId });
        }

        const room = getOrCreateRoom(roomId);
        currentRoom = room;

        const spawn = spawnPointForPlayer(room.players.size);
        const newPlayer: PlayerState = {
          id: playerId,
          name,
          skinColor,
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: 0,
          pitch: 0,
          hp: 100,
          shield: 50,
          alive: true,
          kills: 0,
          activeSlot: 1,
          weaponId: 'ar',
          buildMode: false,
          stance: 'idle',
          materials: { wood: 150, brick: 100, metal: 60 },
          weaponsUnlocked: ['pickaxe', 'ar'],
          consumables: { mini_shield: 2, big_shield: 0, medkit: 1 },
          isSpeaking: false,
          voiceMuted: Boolean(payload?.voiceMuted),
        };

        room.players.set(playerId, newPlayer);
        room.conns.set(playerId, { id: playerId, ws, roomId: room.roomId });

        sendTo(ws, 'room:init', {
          selfId: playerId,
          roomId: room.roomId,
          matchPhase: room.matchPhase,
          winnerId: room.winnerId,
          winnerName: room.winnerName,
          players: Array.from(room.players.values()),
          builds: Array.from(room.builds.values()),
          resources: Array.from(room.resources.values()),
          loot: Array.from(room.loot.values()),
          targets: Array.from(room.targets.values()),
          storm: room.storm,
          killFeed: room.killFeed,
        });

        broadcastRoom(room, 'player:joined', newPlayer, playerId);
        checkMatchState(room);
        return;
      }

      if (!currentRoom) return;
      const self = currentRoom.players.get(playerId);
      if (!self) return;

      if (type === 'player:move') {
        if (!self.alive) return;
        self.x = Number(payload.x);
        self.y = Number(payload.y);
        self.z = Number(payload.z);
        self.yaw = Number(payload.yaw);
        self.pitch = Number(payload.pitch || 0);
        self.stance = payload.stance || 'idle';
        self.activeSlot = Number(payload.activeSlot ?? self.activeSlot);
        self.weaponId = (payload.weaponId as WeaponId) || self.weaponId;
        self.buildMode = Boolean(payload.buildMode);

        broadcastRoom(
          currentRoom,
          'player:moved',
          {
            id: playerId,
            x: self.x,
            y: self.y,
            z: self.z,
            yaw: self.yaw,
            pitch: self.pitch,
            stance: self.stance,
            activeSlot: self.activeSlot,
            weaponId: self.weaponId,
            buildMode: self.buildMode,
          },
          playerId,
        );
        return;
      }

      if (type === 'build:place') {
        if (!self.alive) return;
        const pType = payload.type as BuildPieceType;
        const mat = payload.material as BuildMaterial;
        const gx = Math.round(Number(payload.gx));
        const gy = Math.round(Number(payload.gy));
        const gz = Math.round(Number(payload.gz));
        const rot = ((Math.round(Number(payload.rot || 0)) % 4) + 4) % 4;

        if (!['wall', 'floor', 'ramp', 'roof'].includes(pType)) return;
        if (!['wood', 'brick', 'metal'].includes(mat)) return;
        if ((self.materials[mat] || 0) < BUILD_COST) return;

        const key = buildKey(pType, gx, gy, gz, rot);
        if (currentRoom.builds.has(key)) return;

        self.materials[mat] -= BUILD_COST;
        const maxHp = MATERIAL_MAX_HP[mat];
        const piece: BuildPiece = {
          id: key,
          type: pType,
          material: mat,
          gx,
          gy,
          gz,
          rot,
          hp: maxHp,
          maxHp,
          ownerId: playerId,
        };
        currentRoom.builds.set(key, piece);

        sendTo(ws, 'player:materials', self.materials);
        broadcastRoom(currentRoom, 'build:placed', piece);
        return;
      }

      if (type === 'build:damage') {
        if (!self.alive) return;
        const buildId = String(payload.id || '');
        const dmg = Math.min(120, Math.max(1, Number(payload.damage || 25)));
        const piece = currentRoom.builds.get(buildId);
        if (!piece) return;

        piece.hp -= dmg;
        if (piece.hp <= 0) {
          currentRoom.builds.delete(buildId);
          broadcastRoom(currentRoom, 'build:destroyed', { id: buildId });
        } else {
          broadcastRoom(currentRoom, 'build:updated', { id: buildId, hp: piece.hp });
        }
        return;
      }

      if (type === 'resource:hit') {
        if (!self.alive) return;
        const resId = String(payload.id || '');
        const node = currentRoom.resources.get(resId);
        if (!node) return;

        const dmg = 55;
        node.hp = Math.max(0, node.hp - dmg);
        const gain = node.hp === 0 ? node.yieldAmount : Math.round(node.yieldAmount * 0.45);
        self.materials[node.material] = Math.min(999, (self.materials[node.material] || 0) + gain);

        sendTo(ws, 'player:materials', self.materials);
        if (node.hp <= 0) {
          currentRoom.resources.delete(resId);
          broadcastRoom(currentRoom, 'resource:destroyed', { id: resId });
        } else {
          broadcastRoom(currentRoom, 'resource:updated', { id: resId, hp: node.hp });
        }
        return;
      }

      if (type === 'loot:pickup') {
        if (!self.alive) return;
        const lootId = String(payload.id || '');
        const item = currentRoom.loot.get(lootId);
        if (!item) return;

        const dist = Math.hypot(self.x - item.x, self.z - item.z);
        if (dist > 6.5) return;

        currentRoom.loot.delete(lootId);
        if (item.kind === 'weapon' && item.weaponId) {
          if (!self.weaponsUnlocked.includes(item.weaponId)) {
            self.weaponsUnlocked.push(item.weaponId);
          }
          self.weaponId = item.weaponId;
        } else if (item.kind === 'consumable' && item.consumableId) {
          self.consumables[item.consumableId] =
            (self.consumables[item.consumableId] || 0) + item.amount;
        } else if (item.kind === 'mats' && item.material) {
          self.materials[item.material] = Math.min(999, self.materials[item.material] + item.amount);
        }

        sendTo(ws, 'player:inventory', {
          weaponsUnlocked: self.weaponsUnlocked,
          consumables: self.consumables,
          materials: self.materials,
          weaponId: self.weaponId,
        });
        broadcastRoom(currentRoom, 'loot:removed', { id: lootId });
        return;
      }

      if (type === 'player:consume') {
        if (!self.alive) return;
        const cId = payload.consumableId as ConsumableId;
        if (!self.consumables[cId] || self.consumables[cId] <= 0) return;

        let applied = false;
        if (cId === 'mini_shield' && self.shield < 50) {
          self.shield = Math.min(50, self.shield + 25);
          applied = true;
        } else if (cId === 'big_shield' && self.shield < 100) {
          self.shield = Math.min(100, self.shield + 50);
          applied = true;
        } else if (cId === 'medkit' && self.hp < 100) {
          self.hp = 100;
          applied = true;
        }

        if (!applied) return;
        self.consumables[cId] -= 1;

        sendTo(ws, 'player:inventory', {
          weaponsUnlocked: self.weaponsUnlocked,
          consumables: self.consumables,
          materials: self.materials,
          weaponId: self.weaponId,
        });
        broadcastRoom(currentRoom, 'player:stats', {
          id: self.id,
          hp: Math.ceil(self.hp),
          shield: Math.ceil(self.shield),
          kills: self.kills,
          alive: self.alive,
        });
        return;
      }

      if (type === 'player:shoot') {
        if (!self.alive) return;
        broadcastRoom(
          currentRoom,
          'player:shot',
          {
            shooterId: playerId,
            origin: payload.origin,
            endPoint: payload.endPoint,
            weaponId: payload.weaponId,
          },
          playerId,
        );
        return;
      }

      if (type === 'player:hit') {
        if (!self.alive) return;
        const targetId = String(payload.targetId || '');
        const weaponId = (payload.weaponId as WeaponId) || self.weaponId;
        const spec = WEAPONS[weaponId];
        if (!spec) return;

        const victim = currentRoom.players.get(targetId);
        if (!victim || !victim.alive || victim.id === self.id) return;

        // Basic server rate & distance sanity check
        const now = Date.now();
        const prev = currentRoom.lastFireMs.get(playerId) || 0;
        if (now - prev < Math.max(40, spec.fireRateMs * 0.5) && spec.pellets === 1) {
          return;
        }
        currentRoom.lastFireMs.set(playerId, now);

        const dist = Math.hypot(self.x - victim.x, self.z - victim.z);
        if (dist > spec.range + 8) return;

        const isHeadshot = Boolean(payload.headshot);
        const dmg = Math.round(
          Math.min(spec.damage * (isHeadshot ? 1.6 : 1), Number(payload.damage || spec.damage)),
        );

        let remaining = dmg;
        if (victim.shield > 0) {
          const absorbed = Math.min(victim.shield, remaining);
          victim.shield -= absorbed;
          remaining -= absorbed;
        }
        if (remaining > 0) {
          victim.hp = Math.max(0, victim.hp - remaining);
        }

        broadcastRoom(currentRoom, 'player:stats', {
          id: victim.id,
          hp: Math.ceil(victim.hp),
          shield: Math.ceil(victim.shield),
          kills: victim.kills,
          alive: victim.alive,
          hitBy: playerId,
        });

        if (victim.hp <= 0) {
          eliminatePlayer(currentRoom, victim, self, spec.name);
        }
        return;
      }

      if (type === 'target:hit') {
        if (!self.alive) return;
        const targetId = String(payload.id || '');
        const dmg = Math.min(180, Math.max(1, Number(payload.damage || 30)));
        const target = currentRoom.targets.get(targetId);
        if (!target || target.hp <= 0) return;

        target.hp = Math.max(0, target.hp - dmg);
        if (target.hp === 0) {
          target.respawnAt = Date.now() + 4500;
        }
        broadcastRoom(currentRoom, 'target:updated', target);
        return;
      }

      if (type === 'match:restart') {
        populateIslandWorld(currentRoom);
        let idx = 0;
        for (const p of currentRoom.players.values()) {
          const sp = spawnPointForPlayer(idx++);
          p.x = sp.x;
          p.y = sp.y;
          p.z = sp.z;
          p.hp = 100;
          p.shield = 50;
          p.alive = true;
          p.kills = 0;
          p.materials = { wood: 150, brick: 100, metal: 60 };
          p.weaponsUnlocked = ['pickaxe', 'ar'];
          p.weaponId = 'ar';
          p.activeSlot = 1;
          p.consumables = { mini_shield: 2, big_shield: 0, medkit: 1 };
        }
        currentRoom.matchPhase = currentRoom.players.size >= 2 ? 'active' : 'waiting';
        broadcastRoom(currentRoom, 'match:restarted', {
          matchPhase: currentRoom.matchPhase,
          players: Array.from(currentRoom.players.values()),
          builds: Array.from(currentRoom.builds.values()),
          resources: Array.from(currentRoom.resources.values()),
          loot: Array.from(currentRoom.loot.values()),
          targets: Array.from(currentRoom.targets.values()),
          storm: currentRoom.storm,
        });
        return;
      }

      // Voice Chat status & WebRTC Signaling
      if (type === 'voice:state') {
        self.isSpeaking = Boolean(payload.isSpeaking);
        self.voiceMuted = Boolean(payload.voiceMuted);
        broadcastRoom(
          currentRoom,
          'voice:peer_state',
          {
            id: playerId,
            isSpeaking: self.isSpeaking,
            voiceMuted: self.voiceMuted,
          },
          playerId,
        );
        return;
      }

      if (type === 'rtc:offer' || type === 'rtc:answer' || type === 'rtc:ice') {
        const targetId = String(payload.to || '');
        const targetConn = currentRoom.conns.get(targetId);
        if (targetConn) {
          sendTo(targetConn.ws, type, {
            from: playerId,
            ...payload,
          });
        }
      }
    });

    ws.on('close', () => {
      if (!currentRoom) return;
      currentRoom.players.delete(playerId);
      currentRoom.conns.delete(playerId);
      broadcastRoom(currentRoom, 'player:left', { id: playerId });
      checkMatchState(currentRoom);

      // Keep default isla-central alive, clean empty custom rooms
      if (currentRoom.players.size === 0 && currentRoom.roomId !== 'isla-central') {
        rooms.delete(currentRoom.roomId);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Royale server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
