import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Hammer,
  Headphones,
  HeadphoneOff,
  LogOut,
  Mic,
  MicOff,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BUILD_COST,
  ISLAND_RADIUS,
  WEAPONS,
} from '../shared/gameTypes';
import type {
  BuildMaterial,
  BuildPieceType,
  ConsumableId,
  KillFeedItem,
  PlayerState,
  StormState,
  VoiceMode,
} from '../shared/gameTypes';
import type { HudTelemetry } from '../game/BattleRoyaleEngine';
import type { VoicePeerStatus } from '../game/voiceChat';

interface GameHudProps {
  hud: HudTelemetry;
  players: PlayerState[];
  selfId: string;
  roomId: string;
  storm: StormState;
  killFeed: KillFeedItem[];
  matchPhase: 'waiting' | 'active' | 'ended';
  winnerId: string | null;
  winnerName: string | null;
  voiceStatus: {
    micReady: boolean;
    micError: string | null;
    micLevel: number;
    isSpeaking: boolean;
    muted: boolean;
    deafened: boolean;
    mode: VoiceMode;
    pttActive: boolean;
    pushToTalk: boolean;
    peers: VoicePeerStatus[];
  };
  sfxMuted: boolean;
  onToggleSfx: () => void;
  onInitMic: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onVoiceModeChange: (m: VoiceMode) => void;
  onTogglePttMode: () => void;
  onTogglePeerMute: (peerId: string) => void;
  onSelectWeapon: (slot: number) => void;
  onSelectBuild: (type: BuildPieceType) => void;
  onToggleBuildMode: () => void;
  onCycleMaterial: () => void;
  onUseConsumable: (id: ConsumableId) => void;
  onRestartMatch: () => void;
  onLeaveMatch: () => void;
  onLockPointer: () => void;
}

const BUILD_PIECES: Array<{ type: BuildPieceType; label: string; keyHint: string }> = [
  { type: 'wall', label: 'Pared', keyHint: 'Z' },
  { type: 'floor', label: 'Suelo', keyHint: 'X' },
  { type: 'ramp', label: 'Rampa', keyHint: 'C' },
  { type: 'roof', label: 'Techo', keyHint: 'V' },
];

const MAT_LABELS: Record<BuildMaterial, { label: string; color: string }> = {
  wood: { label: 'Madera', color: 'text-amber-300' },
  brick: { label: 'Ladrillo', color: 'text-orange-400' },
  metal: { label: 'Metal', color: 'text-slate-200' },
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  players,
  selfId,
  roomId,
  storm,
  killFeed,
  matchPhase,
  winnerId,
  winnerName,
  voiceStatus,
  sfxMuted,
  onToggleSfx,
  onInitMic,
  onToggleMute,
  onToggleDeafen,
  onVoiceModeChange,
  onTogglePttMode,
  onTogglePeerMute,
  onSelectWeapon,
  onSelectBuild,
  onToggleBuildMode,
  onCycleMaterial,
  onUseConsumable,
  onRestartMatch,
  onLeaveMatch,
  onLockPointer,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  // H key collapses/expands bottom voice & settings dock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Draw live tactical radar minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    const scale = (size * 0.44) / ISLAND_RADIUS;

    ctx.clearRect(0, 0, size, size);

    // Ocean background
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(0, 0, size, size);

    // Island circle
    ctx.beginPath();
    ctx.arc(half, half, ISLAND_RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#166534';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fde047';
    ctx.stroke();

    // Central plaza marker
    ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.fillRect(half - 6, half - 6, 12, 12);

    // Target Safe Zone Circle (white dashed)
    ctx.beginPath();
    ctx.arc(
      half + storm.centerX * scale,
      half + storm.centerZ * scale,
      storm.targetRadius * scale,
      0,
      Math.PI * 2,
    );
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Current Storm Ring (violet)
    ctx.beginPath();
    ctx.arc(
      half + storm.centerX * scale,
      half + storm.centerZ * scale,
      Math.min(half * 1.4, storm.currentRadius * scale),
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Remote Players
    for (const p of players) {
      if (p.id === selfId || !p.alive) continue;
      const px = half + p.x * scale;
      const pz = half + p.z * scale;
      ctx.beginPath();
      ctx.arc(px, pz, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f87171';
      ctx.fill();
    }

    // Local Player Arrow
    const lx = half + hud.playerPos.x * scale;
    const lz = half + hud.playerPos.z * scale;
    ctx.save();
    ctx.translate(lx, lz);
    ctx.rotate(-hud.playerPos.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.restore();
  }, [hud.playerPos, players, selfId, storm]);

  const aliveCount = players.filter((p) => p.alive).length;
  const activeSpec = WEAPONS[hud.weaponId];
  const canPlaceBuild = (hud.materials[hud.buildMaterial] || 0) >= BUILD_COST;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Damage / Storm Vignette */}
      {(hud.damageFlash > 0.05 || hud.inStorm) && (
        <div
          className="absolute inset-0 transition-opacity duration-100"
          style={{
            boxShadow: hud.inStorm
              ? 'inset 0 0 90px rgba(168, 85, 247, 0.55)'
              : `inset 0 0 85px rgba(239, 68, 68, ${hud.damageFlash * 0.65})`,
          }}
        />
      )}

      {/* Center Crosshair & Loot Prompt */}
      {hud.alive && matchPhase !== 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Crosshair lines */}
            {!hud.buildMode ? (
              <div className="relative w-6 h-6 flex items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-white shadow" />
                <span className="absolute top-0 w-0.5 h-1.5 bg-white/85" />
                <span className="absolute bottom-0 w-0.5 h-1.5 bg-white/85" />
                <span className="absolute left-0 h-0.5 w-1.5 bg-white/85" />
                <span className="absolute right-0 h-0.5 w-1.5 bg-white/85" />
              </div>
            ) : (
              <div className="w-4 h-4 border-2 border-sky-400 rounded-sm opacity-90" />
            )}

            {/* Hitmarker Flash */}
            {hud.hitmarker !== 'none' && (
              <div
                className={`absolute w-6 h-6 pointer-events-none ${
                  hud.hitmarker === 'headshot'
                    ? 'text-amber-400'
                    : hud.hitmarker === 'build'
                      ? 'text-sky-300'
                      : 'text-red-400'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-full h-full stroke-current" strokeWidth="2.5">
                  <line x1="4" y1="4" x2="9" y2="9" />
                  <line x1="20" y1="4" x2="15" y2="9" />
                  <line x1="4" y1="20" x2="9" y2="15" />
                  <line x1="20" y1="20" x2="15" y2="15" />
                </svg>
              </div>
            )}

            {/* Nearby Loot Interaction */}
            {hud.nearbyLoot && (
              <div className="absolute top-10 whitespace-nowrap bg-slate-950/90 border border-white/20 px-3 py-1.5 rounded-md text-xs font-medium text-white">
                <span className="text-amber-400 font-mono-num mr-1.5">[E]</span>
                {hud.nearbyLoot.kind === 'weapon' && hud.nearbyLoot.weaponId
                  ? `Recoger ${WEAPONS[hud.nearbyLoot.weaponId].name}`
                  : hud.nearbyLoot.consumableId === 'medkit'
                    ? 'Recoger Botiquín'
                    : hud.nearbyLoot.consumableId === 'big_shield'
                      ? 'Recoger Escudo Grande'
                      : 'Recoger Mini Escudos'}
              </div>
            )}

            {/* Reloading Indicator */}
            {hud.reloading && (
              <div className="absolute top-8 whitespace-nowrap text-xs font-semibold text-amber-300 bg-slate-950/85 px-2.5 py-1 rounded">
                Recargando...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pointer Lock Helper Banner */}
      {!hud.pointerLocked && hud.alive && matchPhase !== 'ended' && (
        <div className="pointer-events-auto absolute top-5 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onLockPointer}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs rounded-lg shadow-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Haz clic en la pantalla para apuntar y construir (ESC para liberar ratón)
          </button>
        </div>
      )}

      {/* Top-Left: Room Roster / Voice Speakers & Kill Feed */}
      <div className="absolute top-4 left-4 flex flex-col gap-2.5 max-w-xs">
        <div className="pointer-events-auto bg-slate-950/85 border border-white/10 rounded-lg px-3.5 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-4 text-xs text-slate-300">
            <span className="font-display font-bold text-white">Sala {roomId}</span>
            <span className="font-mono-num text-slate-400">{hud.fps} FPS</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {players.map((p) => {
              const isSelf = p.id === selfId;
              const peer = voiceStatus.peers.find((vp) => vp.peerId === p.id);
              const speaking = isSelf ? voiceStatus.isSpeaking : (peer?.isSpeaking || p.isSpeaking);
              const muted = isSelf ? voiceStatus.muted : (peer?.localMuted || p.voiceMuted);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: p.skinColor }}
                    />
                    <span className={`truncate ${p.alive ? 'text-slate-100' : 'text-slate-500 line-through'}`}>
                      {p.name}{isSelf ? ' (Tú)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {speaking && !muted && (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    {!isSelf && peer && (
                      <button
                        type="button"
                        onClick={() => onTogglePeerMute(p.id)}
                        title={peer.localMuted ? 'Activar voz del jugador' : 'Silenciar jugador'}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {peer.localMuted ? <MicOff className="w-3.5 h-3.5 text-red-400" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kill Feed */}
        {killFeed.length > 0 && (
          <div className="space-y-1">
            {killFeed.slice(0, 4).map((kf) => (
              <div
                key={kf.id}
                className="bg-slate-950/80 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-200 flex items-center gap-1.5"
              >
                <span className="font-semibold text-amber-300">{kf.killerName}</span>
                <span className="text-slate-400">· {kf.weaponName} ·</span>
                <span className="text-red-300">{kf.victimName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-Right: Match Stats, Storm Timer & Live Radar Mini-Map */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div className="bg-slate-950/85 border border-white/10 rounded-lg px-3.5 py-2 flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400 mr-1.5">Vivos</span>
            <span className="font-mono-num font-bold text-white text-sm">{aliveCount}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div>
            <span className="text-slate-400 mr-1.5">Elim.</span>
            <span className="font-mono-num font-bold text-amber-400 text-sm">{hud.kills}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div>
            <span className="text-purple-300 mr-1.5">
              {storm.isShrinking ? 'Tormenta cerrando' : `Fase ${storm.phase + 1}`}
            </span>
            <span className="font-mono-num font-bold text-white">
              {storm.isShrinking ? `${Math.round(storm.currentRadius)}m` : `${Math.ceil(storm.nextShrinkIn)}s`}
            </span>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden border border-white/15 bg-slate-950 shadow-lg">
          <canvas ref={minimapRef} width={136} height={136} className="block" />
        </div>
      </div>

      {/* Bottom-Left: Shield, Health, Ammo & Consumables */}
      <div className="absolute bottom-5 left-5 flex flex-col gap-2.5 w-64">
        {/* Consumables Quick Row */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onUseConsumable('mini_shield')}
            disabled={hud.consumables.mini_shield <= 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950/85 border border-sky-500/30 rounded text-xs text-sky-300 disabled:opacity-40 cursor-pointer"
          >
            <span className="font-mono-num text-slate-400">[6]</span>
            <span>Mini</span>
            <span className="font-mono-num font-bold">{hud.consumables.mini_shield}</span>
          </button>
          <button
            type="button"
            onClick={() => onUseConsumable('big_shield')}
            disabled={hud.consumables.big_shield <= 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950/85 border border-sky-400/30 rounded text-xs text-sky-200 disabled:opacity-40 cursor-pointer"
          >
            <span className="font-mono-num text-slate-400">[7]</span>
            <span>Escudo</span>
            <span className="font-mono-num font-bold">{hud.consumables.big_shield}</span>
          </button>
          <button
            type="button"
            onClick={() => onUseConsumable('medkit')}
            disabled={hud.consumables.medkit <= 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950/85 border border-emerald-500/30 rounded text-xs text-emerald-300 disabled:opacity-40 cursor-pointer"
          >
            <span className="font-mono-num text-slate-400">[8]</span>
            <span>Botiquín</span>
            <span className="font-mono-num font-bold">{hud.consumables.medkit}</span>
          </button>
        </div>

        {/* Shield & HP Bars */}
        <div className="bg-slate-950/88 border border-white/12 rounded-lg p-3 space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-sky-300 font-medium flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Escudo
              </span>
              <span className="font-mono-num font-bold text-white">{hud.shield}</span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-100"
                style={{ width: `${Math.min(100, hud.shield)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-emerald-300 font-medium">Salud</span>
              <span className="font-mono-num font-bold text-white">{hud.hp}</span>
            </div>
            <div className="h-3 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{ width: `${Math.min(100, hud.hp)}%` }}
              />
            </div>
          </div>

          {!hud.buildMode && activeSpec && activeSpec.magSize > 0 && (
            <div className="pt-1 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-300">{activeSpec.name}</span>
              <span className="font-mono-num font-bold text-amber-300">
                {hud.ammo} / {hud.maxAmmo}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Right: Materials, Weapons & Building Palette */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2.5">
        {/* Materials */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/88 border border-white/12 rounded-lg px-3 py-1.5 text-xs">
          {(['wood', 'brick', 'metal'] as BuildMaterial[]).map((mat) => {
            const active = hud.buildMode && hud.buildMaterial === mat;
            return (
              <button
                key={mat}
                type="button"
                onClick={onCycleMaterial}
                className={`px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer ${
                  active ? 'bg-amber-500/20 border border-amber-400' : 'hover:bg-white/5'
                }`}
              >
                <span className={MAT_LABELS[mat].color}>{MAT_LABELS[mat].label}</span>
                <span className="font-mono-num font-bold text-white">{hud.materials[mat]}</span>
              </button>
            );
          })}
        </div>

        {/* Building Pieces Row */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleBuildMode}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              hud.buildMode
                ? 'bg-sky-500 border-sky-300 text-slate-950'
                : 'bg-slate-950/88 border-white/12 text-slate-200 hover:border-white/30'
            }`}
          >
            <Hammer className="w-3.5 h-3.5" />
            <span>[Q] Construir</span>
          </button>

          {BUILD_PIECES.map((bp) => {
            const active = hud.buildMode && hud.buildType === bp.type;
            return (
              <button
                key={bp.type}
                type="button"
                onClick={() => onSelectBuild(bp.type)}
                className={`px-2.5 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  active
                    ? canPlaceBuild
                      ? 'bg-sky-500/25 border-sky-400 text-white'
                      : 'bg-red-500/25 border-red-400 text-red-200'
                    : 'bg-slate-950/88 border-white/12 text-slate-300 hover:border-white/30'
                }`}
              >
                <span className="font-mono-num text-slate-400 mr-1">[{bp.keyHint}]</span>
                <span>{bp.label}</span>
              </button>
            );
          })}
        </div>

        {/* Weapon Hotbar */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {hud.weaponsUnlocked.map((wId, idx) => {
            const spec = WEAPONS[wId];
            const active = !hud.buildMode && hud.activeSlot === idx;
            return (
              <button
                key={wId}
                type="button"
                onClick={() => onSelectWeapon(idx)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  active
                    ? 'bg-amber-500/25 border-amber-400 text-white'
                    : 'bg-slate-950/88 border-white/12 text-slate-300 hover:border-white/30'
                }`}
              >
                <span className="font-mono-num text-slate-400 mr-1.5">[{idx + 1}]</span>
                <span>{spec.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom-Center Collapsible Voice & Match Dock */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((p) => !p)}
          className="px-3 py-1 bg-slate-950/90 border border-white/12 border-b-0 rounded-t-lg text-[11px] text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>Voz y Opciones [H]</span>
        </button>

        {!dockCollapsed && (
          <div className="bg-slate-950/92 border border-white/12 rounded-xl px-3.5 py-2 flex items-center gap-2 shadow-xl">
            <button
              type="button"
              onClick={voiceStatus.micReady ? onToggleMute : onInitMic}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                !voiceStatus.micReady
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : voiceStatus.muted
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {!voiceStatus.micReady || voiceStatus.muted ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
              <span>
                {!voiceStatus.micReady ? 'Activar Mic' : voiceStatus.muted ? 'Silenciado [M]' : 'Voz Activa [M]'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onVoiceModeChange(voiceStatus.mode === 'proximity' ? 'global' : 'proximity')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 hover:border-slate-500 cursor-pointer whitespace-nowrap"
            >
              {voiceStatus.mode === 'proximity' ? 'Proximidad' : 'Global'}
            </button>

            <button
              type="button"
              onClick={onTogglePttMode}
              className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer whitespace-nowrap ${
                voiceStatus.pushToTalk
                  ? voiceStatus.pttActive
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                    : 'bg-slate-900 border-amber-400/50 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              {voiceStatus.pushToTalk ? 'PTT [T]' : 'Mic Abierto'}
            </button>

            <button
              type="button"
              onClick={onToggleDeafen}
              title="Ensordecer chat de voz"
              className={`p-1.5 rounded-lg border cursor-pointer ${
                voiceStatus.deafened
                  ? 'bg-red-500/20 border-red-500/40 text-red-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {voiceStatus.deafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onToggleSfx}
              title="Silenciar efectos del juego"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              {sfxMuted ? <VolumeX className="w-4 h-4 text-red-300" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onRestartMatch}
              title="Reiniciar ronda"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onLeaveMatch}
              title="Salir al lobby"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-red-300 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Eliminated / Victory Royale Modal */}
      {(!hud.alive || matchPhase === 'ended') && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-6">
          <div className="max-w-md w-full bg-slate-900 border border-white/15 rounded-xl p-7 text-center space-y-5 shadow-2xl">
            <p className="text-xs font-semibold tracking-wider text-amber-400">
              {matchPhase === 'ended' && winnerId === selfId
                ? 'VICTORIA MAGISTRAL'
                : matchPhase === 'ended'
                  ? 'FIN DE LA PARTIDA'
                  : 'ELIMINADO'}
            </p>
            <h2 className="font-display text-3xl font-bold text-white">
              {matchPhase === 'ended' && winnerId === selfId
                ? '¡Eres el último en pie!'
                : matchPhase === 'ended' && winnerName
                  ? `Ganador: ${winnerName}`
                  : 'Has caído en combate'}
            </h2>
            <div className="flex items-center justify-center gap-6 py-3 border-y border-white/10 text-sm">
              <div>
                <div className="text-slate-400 text-xs">Eliminaciones</div>
                <div className="font-mono-num text-xl font-bold text-amber-400">{hud.kills}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Supervivientes</div>
                <div className="font-mono-num text-xl font-bold text-white">{aliveCount}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onRestartMatch}
                className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm rounded-lg cursor-pointer"
              >
                Nueva Ronda
              </button>
              <button
                type="button"
                onClick={onLeaveMatch}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm rounded-lg cursor-pointer"
              >
                Volver al Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
