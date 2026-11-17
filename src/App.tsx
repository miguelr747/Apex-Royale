/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { LobbyOverlay } from './components/LobbyOverlay';
import { BattleRoyaleEngine } from './game/BattleRoyaleEngine';
import type { HudTelemetry } from './game/BattleRoyaleEngine';
import { soundEngine } from './game/sound';
import { VoiceChatManager } from './game/voiceChat';
import type { VoicePeerStatus } from './game/voiceChat';
import { SKIN_PALETTE } from './shared/gameTypes';
import type {
  KillFeedItem,
  PlayerState,
  StormState,
  VoiceMode,
} from './shared/gameTypes';

const INITIAL_HUD: HudTelemetry = {
  hp: 100,
  shield: 50,
  kills: 0,
  alive: true,
  ammo: 30,
  maxAmmo: 30,
  reloading: false,
  activeSlot: 1,
  weaponId: 'ar',
  weaponsUnlocked: ['pickaxe', 'ar'],
  buildMode: false,
  buildType: 'wall',
  buildMaterial: 'wood',
  buildRot: 0,
  materials: { wood: 150, brick: 100, metal: 60 },
  consumables: { mini_shield: 2, big_shield: 0, medkit: 1 },
  nearbyLoot: null,
  hitmarker: 'none',
  damageFlash: 0,
  inStorm: false,
  pointerLocked: false,
  fps: 60,
  playerPos: { x: 0, z: 8, yaw: 0 },
};

const INITIAL_STORM: StormState = {
  phase: 0,
  centerX: 0,
  centerZ: 0,
  currentRadius: 148,
  targetRadius: 95,
  nextShrinkIn: 35,
  isShrinking: false,
  dps: 2,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BattleRoyaleEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const voiceRef = useRef<VoiceChatManager | null>(null);

  const [screen, setScreen] = useState<'lobby' | 'playing'>('lobby');
  const [connecting, setConnecting] = useState(false);
  const [playerName, setPlayerName] = useState(() => {
    const num = Math.floor(100 + Math.random() * 899);
    return `Agente-${num}`;
  });
  const [skinColor, setSkinColor] = useState(SKIN_PALETTE[0].hex);
  const [roomId, setRoomId] = useState('isla-central');

  const [selfId, setSelfId] = useState('');
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [storm, setStorm] = useState<StormState>(INITIAL_STORM);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [matchPhase, setMatchPhase] = useState<'waiting' | 'active' | 'ended'>('waiting');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [hud, setHud] = useState<HudTelemetry>(INITIAL_HUD);
  const [sfxMuted, setSfxMuted] = useState(false);

  const [voiceStatus, setVoiceStatus] = useState<{
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
  }>({
    micReady: false,
    micError: null,
    micLevel: 0,
    isSpeaking: false,
    muted: false,
    deafened: false,
    mode: 'proximity',
    pttActive: false,
    pushToTalk: false,
    peers: [],
  });

  const sendWs = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Initialize Three.js engine & VoiceChatManager once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const voice = new VoiceChatManager(
      (type, payload) => sendWs(type, payload),
      (status) => setVoiceStatus(status),
    );
    voiceRef.current = voice;

    const engine = new BattleRoyaleEngine(
      container,
      (type, payload) => sendWs(type, payload),
      (nextHud) => setHud(nextHud),
      (distances) => voice.updatePeerDistances(distances),
      (held) => voice.setPttHeld(held),
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
      voice.dispose();
      voiceRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sendWs]);

  // Global 'M' shortcut for Mic Mute
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.code === 'KeyM') {
        voiceRef.current?.toggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const joinMatch = useCallback(() => {
    if (connecting) return;
    setConnecting(true);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      sendWs('room:join', {
        roomId: roomId.trim() || 'isla-central',
        name: playerName.trim() || 'Jugador',
        skinColor,
        voiceMuted: voiceStatus.muted,
      });
    };

    ws.onmessage = (event) => {
      let msg: { type: string; payload: any };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const { type, payload } = msg;
      const engine = engineRef.current;
      const voice = voiceRef.current;

      if (type === 'room:init') {
        selfIdRef.current = payload.selfId;
        setSelfId(payload.selfId);
        setPlayers(payload.players);
        setStorm(payload.storm);
        setKillFeed(payload.killFeed || []);
        setMatchPhase(payload.matchPhase);
        setWinnerId(payload.winnerId || null);
        setWinnerName(payload.winnerName || null);

        voice?.setSelfId(payload.selfId);
        for (const p of payload.players as PlayerState[]) {
          if (p.id !== payload.selfId) {
            voice?.ensurePeer(p.id);
          }
        }

        engine?.syncRoomInit(payload);
        engine?.setInMatch(true);
        setConnecting(false);
        setScreen('playing');
        setTimeout(() => engine?.requestPointerLock(), 80);
      } else if (type === 'player:joined') {
        const p = payload as PlayerState;
        setPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
        engine?.addRemotePlayer(p);
        voice?.ensurePeer(p.id);
      } else if (type === 'player:left') {
        const id = String(payload.id);
        setPlayers((prev) => prev.filter((p) => p.id !== id));
        engine?.removeRemotePlayer(id);
        voice?.removePeer(id);
      } else if (type === 'player:moved') {
        engine?.updateRemoteMove(payload);
        setPlayers((prev) =>
          prev.map((p) => (p.id === payload.id ? { ...p, x: payload.x, y: payload.y, z: payload.z } : p)),
        );
      } else if (type === 'player:stats') {
        engine?.updatePlayerStats(payload);
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === payload.id
              ? { ...p, hp: payload.hp, shield: payload.shield, kills: payload.kills, alive: payload.alive }
              : p,
          ),
        );
      } else if (type === 'player:materials') {
        engine?.updateSelfMaterials(payload);
      } else if (type === 'player:inventory') {
        engine?.updateSelfInventory(payload);
      } else if (type === 'player:shot') {
        engine?.spawnRemoteShot(payload.origin, payload.endPoint, payload.weaponId);
      } else if (type === 'player:eliminated') {
        if (payload.killerId && payload.killerId === selfIdRef.current) {
          soundEngine.playElimination();
        }
        setKillFeed((prev) => [payload.feedItem, ...prev].slice(0, 5));
        setPlayers((prev) =>
          prev.map((p) => (p.id === payload.victimId ? { ...p, alive: false, hp: 0, shield: 0 } : p)),
        );
      } else if (type === 'build:placed') {
        engine?.addBuildPiece(payload);
      } else if (type === 'build:updated') {
        engine?.updateBuildPiece(payload.id, payload.hp);
      } else if (type === 'build:destroyed') {
        engine?.removeBuildPiece(payload.id);
      } else if (type === 'resource:updated') {
        engine?.updateResourceNode(payload.id, payload.hp);
      } else if (type === 'resource:destroyed') {
        engine?.removeResourceNode(payload.id);
      } else if (type === 'loot:spawned') {
        engine?.addLootItem(payload);
      } else if (type === 'loot:removed') {
        engine?.removeLootItem(payload.id);
      } else if (type === 'target:updated') {
        engine?.updateTargetDrone(payload);
      } else if (type === 'storm:update') {
        setStorm(payload);
        engine?.updateStorm(payload);
      } else if (type === 'match:state') {
        setMatchPhase(payload.matchPhase);
        setWinnerId(payload.winnerId);
        setWinnerName(payload.winnerName);
      } else if (type === 'match:restarted') {
        setPlayers(payload.players);
        setStorm(payload.storm);
        setKillFeed([]);
        setMatchPhase(payload.matchPhase);
        setWinnerId(null);
        setWinnerName(null);
        engine?.syncRoomInit({ selfId: selfIdRef.current, ...payload });
      } else if (type === 'voice:peer_state') {
        voice?.updatePeerSpeaking(payload.id, payload.isSpeaking, payload.voiceMuted);
      } else if (type === 'rtc:offer') {
        voice?.handleOffer(payload.from, payload.sdp);
      } else if (type === 'rtc:answer') {
        voice?.handleAnswer(payload.from, payload.sdp);
      } else if (type === 'rtc:ice') {
        voice?.handleIce(payload.from, payload.candidate);
      }
    };

    ws.onerror = () => {
      setConnecting(false);
    };

    ws.onclose = () => {
      setConnecting(false);
    };
  }, [connecting, playerName, roomId, selfId, sendWs, skinColor, voiceStatus.muted]);

  const leaveMatch = useCallback(() => {
    engineRef.current?.setInMatch(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setPlayers([]);
    setScreen('lobby');
  }, []);

  // Keep selfId synced cleanly on match restart
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* Dedicated isolated WebGL canvas mount container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {screen === 'lobby' && (
        <LobbyOverlay
          playerName={playerName}
          onNameChange={setPlayerName}
          skinColor={skinColor}
          onSkinChange={(hex) => {
            setSkinColor(hex);
            engineRef.current?.updateSkinColor(hex);
          }}
          roomId={roomId}
          onRoomChange={setRoomId}
          micReady={voiceStatus.micReady}
          micError={voiceStatus.micError}
          micLevel={voiceStatus.micLevel}
          voiceMuted={voiceStatus.muted}
          voiceMode={voiceStatus.mode}
          onInitMic={() => voiceRef.current?.initMicrophone()}
          onToggleMute={() => voiceRef.current?.toggleMute()}
          onVoiceModeChange={(m) => voiceRef.current?.setMode(m)}
          onJoinMatch={joinMatch}
          connecting={connecting}
        />
      )}

      {screen === 'playing' && (
        <GameHud
          hud={hud}
          players={players}
          selfId={selfId}
          roomId={roomId}
          storm={storm}
          killFeed={killFeed}
          matchPhase={matchPhase}
          winnerId={winnerId}
          winnerName={winnerName}
          voiceStatus={voiceStatus}
          sfxMuted={sfxMuted}
          onToggleSfx={() => {
            const next = !sfxMuted;
            setSfxMuted(next);
            soundEngine.setMuted(next);
          }}
          onInitMic={() => voiceRef.current?.initMicrophone()}
          onToggleMute={() => voiceRef.current?.toggleMute()}
          onToggleDeafen={() => voiceRef.current?.setDeafened(!voiceStatus.deafened)}
          onVoiceModeChange={(m) => voiceRef.current?.setMode(m)}
          onTogglePttMode={() => voiceRef.current?.setPushToTalk(!voiceStatus.pushToTalk)}
          onTogglePeerMute={(pid) => voiceRef.current?.toggleLocalPeerMute(pid)}
          onSelectWeapon={(slot) => engineRef.current?.selectWeaponSlot(slot)}
          onSelectBuild={(bType) => engineRef.current?.selectBuildPiece(bType)}
          onToggleBuildMode={() => engineRef.current?.toggleBuildMode()}
          onCycleMaterial={() => engineRef.current?.cycleMaterial()}
          onUseConsumable={(cId) => engineRef.current?.useConsumable(cId)}
          onRestartMatch={() => sendWs('match:restart')}
          onLeaveMatch={leaveMatch}
          onLockPointer={() => engineRef.current?.requestPointerLock()}
        />
      )}
    </div>
  );
}
