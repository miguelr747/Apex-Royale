import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILD_COST,
  CELL_SIZE,
  ISLAND_RADIUS,
  WALL_HEIGHT,
  WEAPONS,
  buildKey,
  groundHeightAt,
} from '../shared/gameTypes';
import type {
  BuildMaterial,
  BuildPiece,
  BuildPieceType,
  ConsumableId,
  PlayerState,
  ResourceNode,
  StormState,
  TargetDrone,
  WeaponId,
  LootItem,
} from '../shared/gameTypes';
import {
  animateCharacter,
  createBuildPieceMesh,
  createCrateGroup,
  createLootMesh,
  createPlayerCharacter,
  createRockGroup,
  createTargetDroneGroup,
  createTreeGroup,
  createWeaponMesh,
} from './models';
import type { PlayerRig } from './models';
import { soundEngine } from './sound';
import { createProceduralTextures } from './textures';
import type { ProceduralTextureSet } from './textures';

export interface HudTelemetry {
  hp: number;
  shield: number;
  kills: number;
  alive: boolean;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  activeSlot: number;
  weaponId: WeaponId;
  weaponsUnlocked: WeaponId[];
  buildMode: boolean;
  buildType: BuildPieceType;
  buildMaterial: BuildMaterial;
  buildRot: number;
  materials: Record<BuildMaterial, number>;
  consumables: Record<ConsumableId, number>;
  nearbyLoot: LootItem | null;
  hitmarker: 'none' | 'normal' | 'headshot' | 'build';
  damageFlash: number;
  inStorm: boolean;
  pointerLocked: boolean;
  fps: number;
  playerPos: { x: number; z: number; yaw: number };
}

interface RemotePlayerEntity {
  state: PlayerState;
  rig: PlayerRig;
  targetPos: THREE.Vector3;
  targetYaw: number;
  hitbox: THREE.Mesh;
  headHitbox: THREE.Mesh;
}

interface TracerEffect {
  line: THREE.Line;
  expiresAt: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  expiresAt: number;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _camDir = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class BattleRoyaleEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private sunLight: THREE.DirectionalLight;
  private isSoftwareGl: boolean;

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private inMatch = false;
  private selfId = '';
  private sendMsg: (type: string, payload: Record<string, unknown>) => void;
  private onHudUpdate: (hud: HudTelemetry) => void;
  private onDistancesUpdate: (distances: Map<string, number>) => void;
  private onPttChange: (held: boolean) => void;

  // Local player physics & state
  private pos = new THREE.Vector3(0, groundHeightAt(0, 0), 8);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.15;
  private grounded = true;
  private hp = 100;
  private shield = 50;
  private kills = 0;
  private alive = true;
  private activeSlot = 1;
  private weaponId: WeaponId = 'ar';
  private weaponsUnlocked: WeaponId[] = ['pickaxe', 'ar'];
  private consumables: Record<ConsumableId, number> = { mini_shield: 2, big_shield: 0, medkit: 1 };
  private materials: Record<BuildMaterial, number> = { wood: 150, brick: 100, metal: 60 };
  private buildMode = false;
  private buildType: BuildPieceType = 'wall';
  private buildMaterial: BuildMaterial = 'wood';
  private buildRot = 0;

  private ammoMap: Record<WeaponId, number> = {
    pickaxe: 0,
    ar: WEAPONS.ar.magSize,
    shotgun: WEAPONS.shotgun.magSize,
    smg: WEAPONS.smg.magSize,
    sniper: WEAPONS.sniper.magSize,
  };
  private reloadingUntil = 0;
  private lastFireAt = 0;
  private swingTimer = 0;
  private isAds = false;
  private pointerLocked = false;
  private mouseDownLeft = false;

  private localRig: PlayerRig;
  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();

  // World entities
  private remotePlayers = new Map<string, RemotePlayerEntity>();
  private builds = new Map<string, { data: BuildPiece; group: THREE.Group }>();
  private resources = new Map<string, { data: ResourceNode; group: THREE.Group }>();
  private lootMeshes = new Map<string, { data: LootItem; group: THREE.Group }>();
  private targetMeshes = new Map<string, { data: TargetDrone; group: THREE.Group; hitbox: THREE.Mesh }>();

  private previewGroup: THREE.Group | null = null;
  private previewSignature = '';
  private previewTarget = { gx: 0, gy: 0, gz: 0, rot: 0, valid: false };

  private stormWall: THREE.Mesh;
  private stormState: StormState = {
    phase: 0,
    centerX: 0,
    centerZ: 0,
    currentRadius: ISLAND_RADIUS + 18,
    targetRadius: 95,
    nextShrinkIn: 35,
    isShrinking: false,
    dps: 2,
  };

  private tracers: TracerEffect[] = [];
  private sparks: SparkParticle[] = [];
  private sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

  private hitmarkerState: 'none' | 'normal' | 'headshot' | 'build' = 'none';
  private hitmarkerUntil = 0;
  private damageFlash = 0;
  private lastNetMoveAt = 0;
  private lastHudAt = 0;
  private fpsCounter = 60;
  private fpsFrames = 0;
  private fpsAccum = 0;

  // Event handler refs for cleanup
  private boundResize: () => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundPointerLockChange: () => void;

  constructor(
    container: HTMLElement,
    sendMsg: (type: string, payload: Record<string, unknown>) => void,
    onHudUpdate: (hud: HudTelemetry) => void,
    onDistancesUpdate: (distances: Map<string, number>) => void,
    onPttChange: (held: boolean) => void,
  ) {
    this.container = container;
    this.sendMsg = sendMsg;
    this.onHudUpdate = onHudUpdate;
    this.onDistancesUpdate = onDistancesUpdate;
    this.onPttChange = onPttChange;

    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7dd3fc);
    this.scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0042);

    this.camera = new THREE.PerspectiveCamera(
      68,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      550,
    );

    // Mandatory studio/environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.textures = createProceduralTextures(this.renderer);

    // Lighting rig: Warm Sun + Cool Sky/Ground Hemisphere + Rim Light
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x3f6212, 0.72);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.sunLight.position.set(45, 75, 38);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 190;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    rimLight.position.set(-50, 28, -45);
    this.scene.add(rimLight);

    // Build stylized island terrain, ocean, and central POI
    this.buildIslandEnvironment();

    // Storm Cylinder Wall
    const stormGeo = new THREE.CylinderGeometry(1, 1, 140, 48, 1, true);
    const stormMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.stormWall = new THREE.Mesh(stormGeo, stormMat);
    this.stormWall.position.y = 40;
    this.stormWall.scale.set(this.stormState.currentRadius, 1, this.stormState.currentRadius);
    this.scene.add(this.stormWall);

    // Local Player Rig
    this.localRig = createPlayerCharacter('#2563eb');
    this.equipWeaponMesh(this.localRig, 'ar');
    this.scene.add(this.localRig.root);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind events
    this.boundResize = this.handleResize.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundContextMenu = (e: MouseEvent) => e.preventDefault();
    this.boundPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      if (!this.pointerLocked) {
        this.mouseDownLeft = false;
        this.isAds = false;
      }
      this.emitHud(true);
    };

    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('mousemove', this.boundMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    this.renderer.domElement.addEventListener('wheel', this.boundWheel, { passive: true });
    this.renderer.domElement.addEventListener('contextmenu', this.boundContextMenu);
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);

    this.tick();
  }

  private buildIslandEnvironment(): void {
    // Displaced Terrain with Vertex Colors
    const segs = 88;
    const size = ISLAND_RADIUS * 2.25;
    const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const cGrass1 = new THREE.Color(0x22c55e);
    const cGrass2 = new THREE.Color(0x15803d);
    const cSand = new THREE.Color(0xfde047);
    const cPlaza = new THREE.Color(0x64748b);
    const cRock = new THREE.Color(0x475569);
    const temp = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const y = groundHeightAt(x, z);
      posAttr.setY(i, y);

      const dist = Math.hypot(x, z);
      if (y < 0.7) {
        temp.copy(cSand);
      } else if (dist < 13) {
        temp.copy(cPlaza);
      } else if (y > 5.2) {
        temp.copy(cRock);
      } else {
        const blend = (Math.sin(x * 0.14) + Math.cos(z * 0.14)) * 0.25 + 0.5;
        temp.copy(cGrass1).lerp(cGrass2, blend);
      }
      colors[i * 3] = temp.r;
      colors[i * 3 + 1] = temp.g;
      colors[i * 3 + 2] = temp.b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.textures.grass,
      roughness: 0.88,
      metalness: 0.02,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);

    // Expansive Ocean Perimeter
    const oceanGeo = new THREE.PlaneGeometry(1200, 1200);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.18,
      metalness: 0.35,
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.position.y = -0.35;
    ocean.receiveShadow = true;
    this.scene.add(ocean);

    // Central POI Plaza Landmark (Watchtower + Timber Cover)
    const towerGroup = new THREE.Group();
    const tY = groundHeightAt(0, -14);
    towerGroup.position.set(0, tY, -14);

    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.78 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.brick, roughness: 0.85 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.2, 5.5), stoneMat);
    base.position.y = 1.6;
    base.castShadow = true;
    base.receiveShadow = true;

    const mid = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 4.2), woodMat);
    mid.position.y = 5.0;
    mid.castShadow = true;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.3, 5.8), woodMat);
    deck.position.y = 6.95;
    deck.castShadow = true;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.4, 2.4, 4),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 8.3;
    roof.castShadow = true;

    towerGroup.add(base, mid, deck, roof);
    this.scene.add(towerGroup);
  }

  public setInMatch(inMatch: boolean): void {
    this.inMatch = inMatch;
    if (!inMatch && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  public requestPointerLock(): void {
    if (this.inMatch && this.alive && this.renderer.domElement.requestPointerLock) {
      this.renderer.domElement.requestPointerLock();
    }
  }

  public updateSkinColor(hex: string): void {
    const pos = this.localRig.root.position.clone();
    this.scene.remove(this.localRig.root);
    this.localRig = createPlayerCharacter(hex);
    this.localRig.root.position.copy(pos);
    this.equipWeaponMesh(this.localRig, this.buildMode ? 'blueprint' : this.weaponId);
    this.scene.add(this.localRig.root);
  }

  private equipWeaponMesh(rig: PlayerRig, id: WeaponId | 'blueprint'): void {
    if (rig.currentWeaponId === id) return;
    while (rig.weaponMount.children.length > 0) {
      rig.weaponMount.remove(rig.weaponMount.children[0]);
    }
    const wMesh = createWeaponMesh(id);
    rig.weaponMount.add(wMesh);
    rig.currentWeaponId = id;
  }

  public syncRoomInit(payload: {
    selfId: string;
    players: PlayerState[];
    builds: BuildPiece[];
    resources: ResourceNode[];
    loot: LootItem[];
    targets: TargetDrone[];
    storm: StormState;
  }): void {
    this.selfId = payload.selfId;

    // Clear existing entities
    for (const rp of this.remotePlayers.values()) this.scene.remove(rp.rig.root);
    this.remotePlayers.clear();
    for (const b of this.builds.values()) this.scene.remove(b.group);
    this.builds.clear();
    for (const r of this.resources.values()) this.scene.remove(r.group);
    this.resources.clear();
    for (const l of this.lootMeshes.values()) this.scene.remove(l.group);
    this.lootMeshes.clear();
    for (const t of this.targetMeshes.values()) this.scene.remove(t.group);
    this.targetMeshes.clear();

    for (const p of payload.players) {
      if (p.id === this.selfId) {
        this.pos.set(p.x, p.y, p.z);
        this.vel.set(0, 0, 0);
        this.hp = p.hp;
        this.shield = p.shield;
        this.kills = p.kills;
        this.alive = p.alive;
        this.materials = { ...p.materials };
        this.weaponsUnlocked = [...p.weaponsUnlocked];
        this.consumables = { ...p.consumables };
        this.weaponId = p.weaponId;
        this.updateSkinColor(p.skinColor);
      } else {
        this.addRemotePlayer(p);
      }
    }

    payload.builds.forEach((b) => this.addBuildPiece(b));
    payload.resources.forEach((r) => this.addResourceNode(r));
    payload.loot.forEach((l) => this.addLootItem(l));
    payload.targets.forEach((t) => this.addTargetDrone(t));
    this.stormState = { ...payload.storm };
    this.emitHud(true);
  }

  public addRemotePlayer(p: PlayerState): void {
    if (p.id === this.selfId || this.remotePlayers.has(p.id)) return;
    const rig = createPlayerCharacter(p.skinColor);
    rig.root.position.set(p.x, p.y, p.z);
    rig.root.visible = p.alive;
    this.equipWeaponMesh(rig, p.buildMode ? 'blueprint' : p.weaponId);

    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.45, 0.75), hitboxMat);
    hitbox.position.y = 0.85;
    hitbox.userData = { playerHit: p.id, headshot: false };
    rig.root.add(hitbox);

    const headHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), hitboxMat);
    headHitbox.position.y = 1.75;
    headHitbox.userData = { playerHit: p.id, headshot: true };
    rig.root.add(headHitbox);

    this.scene.add(rig.root);
    this.remotePlayers.set(p.id, {
      state: p,
      rig,
      targetPos: new THREE.Vector3(p.x, p.y, p.z),
      targetYaw: p.yaw,
      hitbox,
      headHitbox,
    });
  }

  public removeRemotePlayer(id: string): void {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    this.scene.remove(rp.rig.root);
    this.remotePlayers.delete(id);
  }

  public updateRemoteMove(data: Partial<PlayerState> & { id: string }): void {
    const rp = this.remotePlayers.get(data.id);
    if (!rp) return;
    Object.assign(rp.state, data);
    rp.targetPos.set(rp.state.x, rp.state.y, rp.state.z);
    rp.targetYaw = rp.state.yaw;
    this.equipWeaponMesh(rp.rig, rp.state.buildMode ? 'blueprint' : rp.state.weaponId);
  }

  public updatePlayerStats(data: {
    id: string;
    hp: number;
    shield: number;
    kills: number;
    alive: boolean;
    stormHit?: boolean;
  }): void {
    if (data.id === this.selfId) {
      if (data.hp < this.hp || data.shield < this.shield) {
        this.damageFlash = 1;
      }
      this.hp = data.hp;
      this.shield = data.shield;
      this.kills = data.kills;
      this.alive = data.alive;
      if (!this.alive && document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
      this.emitHud(true);
    } else {
      const rp = this.remotePlayers.get(data.id);
      if (rp) {
        rp.state.hp = data.hp;
        rp.state.shield = data.shield;
        rp.state.kills = data.kills;
        rp.state.alive = data.alive;
        rp.rig.root.visible = data.alive;
      }
    }
  }

  public updateSelfMaterials(mats: Record<BuildMaterial, number>): void {
    this.materials = { ...mats };
    this.emitHud(true);
  }

  public updateSelfInventory(data: {
    weaponsUnlocked: WeaponId[];
    consumables: Record<ConsumableId, number>;
    materials: Record<BuildMaterial, number>;
    weaponId: WeaponId;
  }): void {
    this.weaponsUnlocked = [...data.weaponsUnlocked];
    this.consumables = { ...data.consumables };
    this.materials = { ...data.materials };
    soundEngine.playPickup();
    this.emitHud(true);
  }

  public addBuildPiece(piece: BuildPiece): void {
    if (this.builds.has(piece.id)) return;
    const group = createBuildPieceMesh(piece.type, piece.material, this.textures, false, true);
    group.position.set(piece.gx * CELL_SIZE, piece.gy * WALL_HEIGHT, piece.gz * CELL_SIZE);
    group.rotation.y = piece.rot * (Math.PI / 2);
    group.traverse((obj) => {
      obj.userData.buildId = piece.id;
    });
    this.scene.add(group);
    this.builds.set(piece.id, { data: piece, group });
  }

  public updateBuildPiece(id: string, hp: number): void {
    const b = this.builds.get(id);
    if (!b) return;
    b.data.hp = hp;
    const ratio = Math.max(0.35, hp / b.data.maxHp);
    b.group.scale.setScalar(0.95 + ratio * 0.05);
  }

  public removeBuildPiece(id: string): void {
    const b = this.builds.get(id);
    if (!b) return;
    this.spawnSparks(b.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 6);
    this.scene.remove(b.group);
    this.builds.delete(id);
  }

  public addResourceNode(node: ResourceNode): void {
    if (this.resources.has(node.id)) return;
    const group =
      node.kind === 'tree'
        ? createTreeGroup(node.scale)
        : node.kind === 'rock'
          ? createRockGroup(node.scale)
          : createCrateGroup(this.textures);
    group.position.set(node.x, node.y, node.z);
    group.rotation.y = node.rotY;
    group.traverse((obj) => {
      obj.userData.resourceId = node.id;
    });
    this.scene.add(group);
    this.resources.set(node.id, { data: node, group });
  }

  public updateResourceNode(id: string, hp: number): void {
    const r = this.resources.get(id);
    if (!r) return;
    r.data.hp = hp;
    const pulse = r.data.scale * 0.92;
    r.group.scale.setScalar(pulse);
    setTimeout(() => {
      if (this.resources.has(id)) r.group.scale.setScalar(r.data.scale);
    }, 90);
  }

  public removeResourceNode(id: string): void {
    const r = this.resources.get(id);
    if (!r) return;
    this.spawnSparks(r.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 8);
    this.scene.remove(r.group);
    this.resources.delete(id);
  }

  public addLootItem(item: LootItem): void {
    if (this.lootMeshes.has(item.id)) return;
    const group = createLootMesh(item.kind, item.weaponId, item.consumableId);
    group.position.set(item.x, item.y, item.z);
    this.scene.add(group);
    this.lootMeshes.set(item.id, { data: item, group });
  }

  public removeLootItem(id: string): void {
    const l = this.lootMeshes.get(id);
    if (!l) return;
    this.scene.remove(l.group);
    this.lootMeshes.delete(id);
  }

  public addTargetDrone(target: TargetDrone): void {
    if (this.targetMeshes.has(target.id)) return;
    const group = createTargetDroneGroup();
    group.position.set(target.x, target.y, target.z);
    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hitbox.userData = { targetDroneId: target.id };
    group.add(hitbox);
    this.scene.add(group);
    this.targetMeshes.set(target.id, { data: target, group, hitbox });
  }

  public updateTargetDrone(target: TargetDrone): void {
    const t = this.targetMeshes.get(target.id);
    if (!t) return;
    t.data = target;
    t.group.visible = target.hp > 0;
  }

  public updateStorm(storm: StormState): void {
    this.stormState = storm;
    this.stormWall.position.x = storm.centerX;
    this.stormWall.position.z = storm.centerZ;
    this.stormWall.scale.set(storm.currentRadius, 1, storm.currentRadius);
  }

  public spawnRemoteShot(origin: [number, number, number], endPoint: [number, number, number], weaponId: WeaponId): void {
    const o = new THREE.Vector3(...origin);
    const e = new THREE.Vector3(...endPoint);
    this.addTracer(o, e, weaponId === 'sniper' ? 0xf59e0b : 0xfef08a);
  }

  // Controls & Actions exposed to React HUD too
  public selectWeaponSlot(slot: number): void {
    if (slot < 0 || slot >= this.weaponsUnlocked.length) return;
    this.buildMode = false;
    this.activeSlot = slot;
    this.weaponId = this.weaponsUnlocked[slot];
    this.reloadingUntil = 0;
    this.equipWeaponMesh(this.localRig, this.weaponId);
    this.emitHud(true);
  }

  public selectBuildPiece(type: BuildPieceType): void {
    this.buildMode = true;
    this.buildType = type;
    this.isAds = false;
    this.equipWeaponMesh(this.localRig, 'blueprint');
    this.emitHud(true);
  }

  public toggleBuildMode(): void {
    this.buildMode = !this.buildMode;
    this.isAds = false;
    this.equipWeaponMesh(this.localRig, this.buildMode ? 'blueprint' : this.weaponId);
    this.emitHud(true);
  }

  public cycleMaterial(): void {
    const order: BuildMaterial[] = ['wood', 'brick', 'metal'];
    const next = order[(order.indexOf(this.buildMaterial) + 1) % order.length];
    this.buildMaterial = next;
    this.emitHud(true);
  }

  public useConsumable(cId: ConsumableId): void {
    if (!this.alive || !this.consumables[cId] || this.consumables[cId] <= 0) return;
    soundEngine.playPickup();
    this.sendMsg('player:consume', { consumableId: cId });
  }

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.inMatch) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    this.keys.add(e.code);

    if (e.code === 'KeyT') {
      this.onPttChange(true);
    }

    if (!this.alive) return;

    if (e.code === 'KeyQ') {
      this.toggleBuildMode();
    } else if (e.code === 'Digit1') {
      if (this.buildMode) this.selectBuildPiece('wall');
      else this.selectWeaponSlot(0);
    } else if (e.code === 'Digit2') {
      if (this.buildMode) this.selectBuildPiece('floor');
      else this.selectWeaponSlot(1);
    } else if (e.code === 'Digit3') {
      if (this.buildMode) this.selectBuildPiece('ramp');
      else this.selectWeaponSlot(2);
    } else if (e.code === 'Digit4') {
      if (this.buildMode) this.selectBuildPiece('roof');
      else this.selectWeaponSlot(3);
    } else if (e.code === 'Digit5') {
      this.selectWeaponSlot(4);
    } else if (e.code === 'KeyZ') {
      this.selectBuildPiece('wall');
    } else if (e.code === 'KeyX') {
      this.selectBuildPiece('floor');
    } else if (e.code === 'KeyC' && this.buildMode) {
      this.selectBuildPiece('ramp');
    } else if (e.code === 'KeyV' && this.buildMode) {
      this.selectBuildPiece('roof');
    } else if (e.code === 'KeyG') {
      this.cycleMaterial();
    } else if (e.code === 'KeyR') {
      if (this.buildMode) {
        this.buildRot = (this.buildRot + 1) % 4;
        this.emitHud(true);
      } else {
        this.startReload();
      }
    } else if (e.code === 'KeyE') {
      this.tryPickupNearbyLoot();
    } else if (e.code === 'Digit6') {
      this.useConsumable('mini_shield');
    } else if (e.code === 'Digit7') {
      this.useConsumable('big_shield');
    } else if (e.code === 'Digit8') {
      this.useConsumable('medkit');
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (e.code === 'KeyT') {
      this.onPttChange(false);
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked || !this.inMatch) return;
    const sens = this.isAds && this.weaponId === 'sniper' ? 0.0011 : 0.0021;
    this.yaw -= e.movementX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sens, -1.15, 1.15);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.inMatch || !this.alive) return;
    if (!this.pointerLocked) {
      this.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      this.mouseDownLeft = true;
      if (this.buildMode) {
        this.tryPlaceBuild();
      } else {
        this.tryFireWeapon();
      }
    } else if (e.button === 2) {
      if (this.buildMode) {
        this.cycleMaterial();
      } else {
        this.isAds = true;
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.mouseDownLeft = false;
    if (e.button === 2) this.isAds = false;
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.inMatch || !this.alive) return;
    if (this.buildMode) {
      const order: BuildPieceType[] = ['wall', 'floor', 'ramp', 'roof'];
      const dir = e.deltaY > 0 ? 1 : -1;
      const idx = (order.indexOf(this.buildType) + dir + order.length) % order.length;
      this.selectBuildPiece(order[idx]);
    } else {
      const count = this.weaponsUnlocked.length;
      if (count <= 1) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = (this.activeSlot + dir + count) % count;
      this.selectWeaponSlot(next);
    }
  }

  private startReload(): void {
    const spec = WEAPONS[this.weaponId];
    if (!spec || spec.magSize === 0) return;
    if (this.ammoMap[this.weaponId] >= spec.magSize) return;
    const now = performance.now();
    if (this.reloadingUntil > now) return;
    this.reloadingUntil = now + spec.reloadMs;
    this.emitHud(true);
  }

  private tryPickupNearbyLoot(): void {
    const near = this.findNearbyLoot();
    if (!near) return;
    this.sendMsg('loot:pickup', { id: near.id });
  }

  private findNearbyLoot(): LootItem | null {
    let best: LootItem | null = null;
    let bestDist = 3.6;
    for (const l of this.lootMeshes.values()) {
      const d = Math.hypot(this.pos.x - l.data.x, this.pos.z - l.data.z);
      if (d < bestDist && Math.abs(this.pos.y - l.data.y) < 3.0) {
        best = l.data;
        bestDist = d;
      }
    }
    return best;
  }

  private computeBuildPlacement(): void {
    if (!this.buildMode || !this.alive) {
      if (this.previewGroup) this.previewGroup.visible = false;
      return;
    }

    this.camera.getWorldDirection(_camDir);
    const lookPoint = _vec3A.copy(this.pos).add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(_camDir, 4.6);

    const gx = Math.round(lookPoint.x / CELL_SIZE);
    const gz = Math.round(lookPoint.z / CELL_SIZE);
    const baseTerrain = groundHeightAt(gx * CELL_SIZE, gz * CELL_SIZE);
    const minGy = Math.floor(baseTerrain / WALL_HEIGHT);
    const gy = Math.max(minGy, Math.floor((lookPoint.y + 0.4) / WALL_HEIGHT));

    const playerRot = (((Math.round(-this.yaw / (Math.PI / 2)) + this.buildRot) % 4) + 4) % 4;
    const key = buildKey(this.buildType, gx, gy, gz, playerRot);
    const hasMats = (this.materials[this.buildMaterial] || 0) >= BUILD_COST;
    const valid = hasMats && !this.builds.has(key);

    this.previewTarget = { gx, gy, gz, rot: playerRot, valid };

    const sig = `${this.buildType}:${this.buildMaterial}:${valid}`;
    if (this.previewSignature !== sig || !this.previewGroup) {
      if (this.previewGroup) this.scene.remove(this.previewGroup);
      this.previewGroup = createBuildPieceMesh(
        this.buildType,
        this.buildMaterial,
        this.textures,
        true,
        valid,
      );
      this.scene.add(this.previewGroup);
      this.previewSignature = sig;
    }

    this.previewGroup.visible = true;
    this.previewGroup.position.set(gx * CELL_SIZE, gy * WALL_HEIGHT, gz * CELL_SIZE);
    this.previewGroup.rotation.y = playerRot * (Math.PI / 2);
  }

  private tryPlaceBuild(): void {
    const now = performance.now();
    if (now - this.lastFireAt < 140) return;
    this.computeBuildPlacement();
    if (!this.previewTarget.valid) return;

    this.lastFireAt = now;
    soundEngine.playBuild(this.buildMaterial);
    this.sendMsg('build:place', {
      type: this.buildType,
      material: this.buildMaterial,
      gx: this.previewTarget.gx,
      gy: this.previewTarget.gy,
      gz: this.previewTarget.gz,
      rot: this.previewTarget.rot,
    });
  }

  private tryFireWeapon(): void {
    const now = performance.now();
    const spec = WEAPONS[this.weaponId];
    if (!spec) return;
    if (now - this.lastFireAt < spec.fireRateMs) return;

    if (spec.magSize > 0) {
      if (this.reloadingUntil > now) return;
      if (this.ammoMap[this.weaponId] <= 0) {
        this.startReload();
        return;
      }
      this.ammoMap[this.weaponId] -= 1;
      if (this.ammoMap[this.weaponId] === 0) {
        this.startReload();
      }
    }

    this.lastFireAt = now;
    if (this.weaponId === 'pickaxe') {
      this.swingTimer = 1.0;
    }
    soundEngine.playShoot(this.weaponId, 0.38);

    // Build list of raycast targets
    const hitTargets: THREE.Object3D[] = [];
    for (const rp of this.remotePlayers.values()) {
      if (rp.state.alive) {
        hitTargets.push(rp.hitbox, rp.headHitbox);
      }
    }
    for (const t of this.targetMeshes.values()) {
      if (t.data.hp > 0) hitTargets.push(t.hitbox);
    }
    for (const b of this.builds.values()) {
      hitTargets.push(b.group);
    }
    if (this.weaponId === 'pickaxe') {
      for (const r of this.resources.values()) {
        hitTargets.push(r.group);
      }
    }

    // Muzzle origin from local player right shoulder
    const muzzle = _vec3B.copy(this.pos).add(new THREE.Vector3(0, 1.48, 0));
    this.camera.getWorldDirection(_camDir);

    let showedHitmarker = false;
    const spreadScale = this.isAds ? 0.38 : 1.0;

    for (let p = 0; p < spec.pellets; p++) {
      const dir = _vec3C.copy(_camDir);
      dir.x += (Math.random() - 0.5) * spec.spread * spreadScale;
      dir.y += (Math.random() - 0.5) * spec.spread * spreadScale;
      dir.z += (Math.random() - 0.5) * spec.spread * spreadScale;
      dir.normalize();

      this.raycaster.set(this.camera.position, dir);
      this.raycaster.far = spec.range + 6;

      const hits = this.raycaster.intersectObjects(hitTargets, true);
      let endPt = _vec3A.copy(this.camera.position).addScaledVector(dir, spec.range);

      if (hits.length > 0) {
        const hit = hits[0];
        endPt.copy(hit.point);
        const ud = hit.object.userData;

        if (ud.playerHit) {
          const isHead = Boolean(ud.headshot);
          this.sendMsg('player:hit', {
            targetId: ud.playerHit,
            weaponId: this.weaponId,
            headshot: isHead,
            damage: Math.round(spec.damage * (isHead ? 1.6 : 1)),
          });
          if (!showedHitmarker) {
            this.triggerHitmarker(isHead ? 'headshot' : 'normal');
            soundEngine.playHitmarker(isHead);
            showedHitmarker = true;
          }
          this.spawnSparks(hit.point, 5);
        } else if (ud.targetDroneId) {
          this.sendMsg('target:hit', { id: ud.targetDroneId, damage: spec.damage });
          if (!showedHitmarker) {
            this.triggerHitmarker('normal');
            soundEngine.playHitmarker(false);
            showedHitmarker = true;
          }
          this.spawnSparks(hit.point, 6);
        } else if (ud.buildId) {
          this.sendMsg('build:damage', { id: ud.buildId, damage: spec.buildDamage });
          if (!showedHitmarker) {
            this.triggerHitmarker('build');
            soundEngine.playHitmarker(false);
            showedHitmarker = true;
          }
          this.spawnSparks(hit.point, 4);
        } else if (ud.resourceId && this.weaponId === 'pickaxe') {
          this.sendMsg('resource:hit', { id: ud.resourceId });
          if (!showedHitmarker) {
            this.triggerHitmarker('build');
            soundEngine.playHitmarker(false);
            showedHitmarker = true;
          }
          this.spawnSparks(hit.point, 6);
        }
      }

      if (this.weaponId !== 'pickaxe') {
        this.addTracer(muzzle, endPt, this.weaponId === 'sniper' ? 0xf59e0b : 0xfef08a);
        if (p === 0) {
          this.sendMsg('player:shoot', {
            origin: [muzzle.x, muzzle.y, muzzle.z],
            endPoint: [endPt.x, endPt.y, endPt.z],
            weaponId: this.weaponId,
          });
        }
      }
    }

    this.emitHud(true);
  }

  private triggerHitmarker(kind: 'normal' | 'headshot' | 'build'): void {
    this.hitmarkerState = kind;
    this.hitmarkerUntil = performance.now() + 170;
  }

  private addTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, expiresAt: performance.now() + 85 });
  }

  private spawnSparks(origin: THREE.Vector3, count: number): void {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.copy(origin);
      this.scene.add(m);
      this.sparks.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6),
        expiresAt: now + 260,
      });
    }
  }

  /**
   * Computes highest walkable surface (Terrain + Floors + Ramps + Roofs) under (x, y, z).
   */
  private getSupportHeight(x: number, y: number, z: number): number {
    let support = groundHeightAt(x, z);

    for (const b of this.builds.values()) {
      const { type, gx, gy, gz, rot } = b.data;
      const cx = gx * CELL_SIZE;
      const cz = gz * CELL_SIZE;
      const by = gy * WALL_HEIGHT;

      if (Math.abs(x - cx) > CELL_SIZE * 0.52 || Math.abs(z - cz) > CELL_SIZE * 0.52) continue;

      if (type === 'floor') {
        const top = by + 0.12;
        if (y >= top - 0.85 && top > support) support = top;
      } else if (type === 'ramp') {
        // Local offset in rotated ramp space
        const dx = x - cx;
        const dz = z - cz;
        const angle = -rot * (Math.PI / 2);
        const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
        const t = THREE.MathUtils.clamp((localZ + CELL_SIZE / 2) / CELL_SIZE, 0, 1);
        // Note: deck rotated -angle in createBuildPieceMesh slopes up toward -Z (t=0 -> high, t=1 -> low)
        const rampY = by + (1 - t) * WALL_HEIGHT + 0.1;
        if (y >= rampY - 1.0 && rampY > support) support = rampY;
      } else if (type === 'roof') {
        const dx = Math.abs(x - cx) / (CELL_SIZE / 2);
        const dz = Math.abs(z - cz) / (CELL_SIZE / 2);
        const slope = Math.max(0, 1 - Math.max(dx, dz));
        const roofY = by + slope * (WALL_HEIGHT * 0.75);
        if (y >= roofY - 0.85 && roofY > support) support = roofY;
      }
    }

    return support;
  }

  private resolveWallCollisions(nextX: number, y: number, nextZ: number): { x: number; z: number } {
    let rx = nextX;
    let rz = nextZ;
    const radius = 0.45;

    for (const b of this.builds.values()) {
      if (b.data.type !== 'wall') continue;
      const by = b.data.gy * WALL_HEIGHT;
      if (y + 1.6 < by || y > by + WALL_HEIGHT - 0.15) continue;

      const cx = b.data.gx * CELL_SIZE;
      const cz = b.data.gz * CELL_SIZE;
      const rot = b.data.rot % 2; // 0: spans X, 1: spans Z

      const halfW = rot === 0 ? CELL_SIZE / 2 + radius : 0.18 + radius;
      const halfD = rot === 0 ? 0.18 + radius : CELL_SIZE / 2 + radius;

      const dx = rx - cx;
      const dz = rz - cz;
      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        const penX = halfW - Math.abs(dx);
        const penZ = halfD - Math.abs(dz);
        if (penX < penZ) {
          rx += dx >= 0 ? penX : -penX;
        } else {
          rz += dz >= 0 ? penZ : -penZ;
        }
      }
    }

    return { x: rx, z: rz };
  }

  private updatePhysics(dt: number, now: number): void {
    // Check reload completion
    if (this.reloadingUntil > 0 && now >= this.reloadingUntil) {
      const spec = WEAPONS[this.weaponId];
      if (spec) this.ammoMap[this.weaponId] = spec.magSize;
      this.reloadingUntil = 0;
    }

    // Auto-fire / turbo-build while holding left mouse
    if (this.mouseDownLeft && this.pointerLocked && this.alive) {
      if (this.buildMode) {
        this.tryPlaceBuild();
      } else if (WEAPONS[this.weaponId]?.auto) {
        this.tryFireWeapon();
      }
    }

    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt * 4.2);
    }

    // Movement input
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const crouching = !this.buildMode && (this.keys.has('ControlLeft') || this.keys.has('KeyC'));

    let moveSpeed = 0;
    let stance: PlayerState['stance'] = 'idle';

    if (this.alive && (forward !== 0 || strafe !== 0)) {
      const baseSpeed = crouching ? 4.4 : sprinting ? 9.8 : 7.0;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);

      // Camera looks along (-sinY, -cosY)
      const dirX = -sinY * forward + cosY * strafe;
      const dirZ = -cosY * forward - sinY * strafe;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = (dirX / len) * baseSpeed;
      const nz = (dirZ / len) * baseSpeed;

      const resolved = this.resolveWallCollisions(this.pos.x + nx * dt, this.pos.y, this.pos.z + nz * dt);
      this.pos.x = resolved.x;
      this.pos.z = resolved.z;

      // Clamp to island outer ocean perimeter
      const distFromCenter = Math.hypot(this.pos.x, this.pos.z);
      if (distFromCenter > ISLAND_RADIUS + 8) {
        const scale = (ISLAND_RADIUS + 8) / distFromCenter;
        this.pos.x *= scale;
        this.pos.z *= scale;
      }

      moveSpeed = baseSpeed;
      stance = crouching ? 'crouch' : 'run';
    }

    // Jump & Gravity
    if (this.alive && this.grounded && this.keys.has('Space')) {
      this.vel.y = 9.4;
      this.grounded = false;
    }

    this.vel.y -= 23.5 * dt;
    this.pos.y += this.vel.y * dt;

    const supportY = this.getSupportHeight(this.pos.x, this.pos.y, this.pos.z);
    if (this.pos.y <= supportY) {
      this.pos.y = supportY;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      stance = 'jump';
    }

    // Update Local Character Rig
    this.localRig.root.position.copy(this.pos);
    this.localRig.root.rotation.y = this.yaw + Math.PI;
    this.localRig.root.visible = this.alive;
    animateCharacter(
      this.localRig,
      this.clock.elapsedTime,
      moveSpeed,
      this.grounded,
      this.swingTimer,
      this.buildMode,
      this.pitch,
    );

    // Update sun shadow frustum around player
    this.sunLight.position.set(this.pos.x + 42, this.pos.y + 68, this.pos.z + 35);
    this.sunLight.target.position.copy(this.pos);
    this.sunLight.target.updateMatrixWorld();

    // Broadcast movement to server at ~25Hz
    if (now - this.lastNetMoveAt > 40 && this.selfId && this.alive) {
      this.lastNetMoveAt = now;
      this.sendMsg('player:move', {
        x: Number(this.pos.x.toFixed(2)),
        y: Number(this.pos.y.toFixed(2)),
        z: Number(this.pos.z.toFixed(2)),
        yaw: Number(this.yaw.toFixed(3)),
        pitch: Number(this.pitch.toFixed(3)),
        stance,
        activeSlot: this.activeSlot,
        weaponId: this.weaponId,
        buildMode: this.buildMode,
      });
    }
  }

  private updateCamera(dt: number): void {
    if (!this.inMatch) {
      // Orbiting scenic Island camera for Lobby background
      const t = this.clock.elapsedTime * 0.11;
      this.camera.position.set(Math.sin(t) * 62, 26, Math.cos(t) * 62);
      this.camera.lookAt(0, 4, -8);
      return;
    }

    const spec = WEAPONS[this.weaponId];
    const targetFov = this.isAds && !this.buildMode && spec ? spec.adsFov : 68;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    const dist = this.isAds ? 2.6 : 4.5;
    const rightOffset = this.isAds ? 0.65 : 0.85;
    const pivotY = this.pos.y + 1.65;

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    const camX = this.pos.x + sinY * cosP * dist + cosY * rightOffset;
    const camY = Math.max(groundHeightAt(camX, this.pos.z) + 0.55, pivotY - sinP * dist);
    const camZ = this.pos.z + cosY * cosP * dist - sinY * rightOffset;

    this.camera.position.set(
      THREE.MathUtils.damp(this.camera.position.x, camX, 24, dt),
      THREE.MathUtils.damp(this.camera.position.y, camY, 24, dt),
      THREE.MathUtils.damp(this.camera.position.z, camZ, 24, dt),
    );

    const lookX = this.pos.x - sinY * 14 + cosY * rightOffset * 0.6;
    const lookY = pivotY + sinP * 14;
    const lookZ = this.pos.z - cosY * 14 - sinY * rightOffset * 0.6;
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  private updateEffectsAndEntities(dt: number, now: number): void {
    const t = this.clock.elapsedTime;

    // Animate remote players smoothly + compute proximity distances for Voice Chat
    const distMap = new Map<string, number>();
    for (const [id, rp] of this.remotePlayers) {
      const prevX = rp.rig.root.position.x;
      const prevZ = rp.rig.root.position.z;
      rp.rig.root.position.lerp(rp.targetPos, 1 - Math.exp(-14 * dt));
      const speed = Math.hypot(rp.rig.root.position.x - prevX, rp.rig.root.position.z - prevZ) / Math.max(dt, 0.001);
      rp.rig.root.rotation.y = rp.targetYaw + Math.PI;
      animateCharacter(
        rp.rig,
        t,
        speed,
        rp.state.stance !== 'jump',
        0,
        rp.state.buildMode,
        rp.state.pitch,
      );
      distMap.set(id, this.pos.distanceTo(rp.rig.root.position));
    }
    this.onDistancesUpdate(distMap);

    // Floating Loot animation
    for (const l of this.lootMeshes.values()) {
      l.group.rotation.y += dt * 1.4;
      l.group.position.y = l.data.y + Math.sin(t * 2.5 + l.data.x) * 0.12;
    }

    // Hovering Target Drones
    for (const td of this.targetMeshes.values()) {
      if (td.data.hp > 0) {
        td.group.position.y = td.data.y + Math.sin(t * 2.2 + td.data.x) * 0.25;
        td.group.lookAt(this.pos.x, td.group.position.y, this.pos.z);
      }
    }

    // Clean expired tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (now >= this.tracers[i].expiresAt) {
        this.scene.remove(this.tracers[i].line);
        this.tracers[i].line.geometry.dispose();
        (this.tracers[i].line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Update & clean sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      if (now >= s.expiresAt) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      } else {
        s.vel.y -= 14 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
      }
    }

    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    }
    if (this.hitmarkerUntil > 0 && now >= this.hitmarkerUntil) {
      this.hitmarkerState = 'none';
      this.hitmarkerUntil = 0;
    }
  }

  private emitHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudAt < 65) return;
    this.lastHudAt = now;

    const spec = WEAPONS[this.weaponId];
    const inStorm =
      Math.hypot(this.pos.x - this.stormState.centerX, this.pos.z - this.stormState.centerZ) >
      this.stormState.currentRadius;

    this.onHudUpdate({
      hp: Math.ceil(this.hp),
      shield: Math.ceil(this.shield),
      kills: this.kills,
      alive: this.alive,
      ammo: spec ? this.ammoMap[this.weaponId] : 0,
      maxAmmo: spec ? spec.magSize : 0,
      reloading: this.reloadingUntil > now,
      activeSlot: this.activeSlot,
      weaponId: this.weaponId,
      weaponsUnlocked: this.weaponsUnlocked,
      buildMode: this.buildMode,
      buildType: this.buildType,
      buildMaterial: this.buildMaterial,
      buildRot: this.buildRot,
      materials: this.materials,
      consumables: this.consumables,
      nearbyLoot: this.findNearbyLoot(),
      hitmarker: this.hitmarkerState,
      damageFlash: this.damageFlash,
      inStorm,
      pointerLocked: this.pointerLocked,
      fps: this.fpsCounter,
      playerPos: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();

    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fpsCounter = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    if (this.inMatch) {
      this.updatePhysics(dt, now);
      this.computeBuildPlacement();
    }
    this.updateCamera(dt);
    this.updateEffectsAndEntities(dt, now);

    this.renderer.render(this.scene, this.camera);

    if (this.inMatch) {
      this.emitHud(false);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('mousemove', this.boundMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mouseup', this.boundMouseUp);
    this.renderer.domElement.removeEventListener('wheel', this.boundWheel);
    this.renderer.domElement.removeEventListener('contextmenu', this.boundContextMenu);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
