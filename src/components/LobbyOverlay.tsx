import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Users, Volume2, Radio, Shield, Crosshair, Hammer } from 'lucide-react';
import { SKIN_PALETTE } from '../shared/gameTypes';
import type { RoomSummary, VoiceMode } from '../shared/gameTypes';

interface LobbyOverlayProps {
  playerName: string;
  onNameChange: (name: string) => void;
  skinColor: string;
  onSkinChange: (hex: string) => void;
  roomId: string;
  onRoomChange: (roomId: string) => void;
  micReady: boolean;
  micError: string | null;
  micLevel: number;
  voiceMuted: boolean;
  voiceMode: VoiceMode;
  onInitMic: () => void;
  onToggleMute: () => void;
  onVoiceModeChange: (mode: VoiceMode) => void;
  onJoinMatch: () => void;
  connecting: boolean;
}

export const LobbyOverlay: React.FC<LobbyOverlayProps> = ({
  playerName,
  onNameChange,
  skinColor,
  onSkinChange,
  roomId,
  onRoomChange,
  micReady,
  micError,
  micLevel,
  voiceMuted,
  voiceMode,
  onInitMic,
  onToggleMute,
  onVoiceModeChange,
  onJoinMatch,
  connecting,
}) => {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      try {
        const res = await fetch('/api/rooms');
        if (!res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data.rooms)) {
          setRooms(data.rooms);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    loadRooms();
    const id = window.setInterval(loadRooms, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 md:p-10 bg-slate-950/60 overflow-y-auto">
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-8 max-w-6xl w-full mx-auto pb-4 border-b border-white/10">
        <span className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          APEX ROYALE
        </span>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <span className="whitespace-nowrap shrink-0">Battle Royale Multijugador</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">Construcción en Tiempo Real</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">Chat de Voz WebRTC</span>
        </div>
        <button
          type="button"
          onClick={onJoinMatch}
          disabled={connecting}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          {connecting ? 'Conectando...' : 'Entrar a la Isla'}
        </button>
      </header>

      {/* Main Content Split */}
      <main className="max-w-6xl w-full mx-auto my-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Match Setup & Loadout */}
        <section className="lg:col-span-7 bg-slate-900/92 border border-white/12 rounded-xl p-6 md:p-7 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-amber-400 tracking-wide mb-2">
              Despliegue en Tiempo Real · Temporada 01
            </p>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-white leading-tight [text-wrap:balance]">
              Construye tu ventaja. Domina la tormenta.
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-300 max-w-xl leading-relaxed">
              Combate multijugador en tercera persona con cuadrícula de construcción instantánea, recolección de recursos y voz espacial integrada.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="player-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nombre de jugador
              </label>
              <input
                id="player-name"
                type="text"
                maxLength={18}
                value={playerName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Tu nombre..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label htmlFor="room-code" className="block text-xs font-medium text-slate-300 mb-1.5">
                Sala / Código de partida
              </label>
              <input
                id="room-code"
                type="text"
                maxLength={24}
                value={roomId}
                onChange={(e) => onRoomChange(e.target.value)}
                placeholder="isla-central"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono-num focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Skin Selector */}
          <div>
            <span className="block text-xs font-medium text-slate-300 mb-2">
              Aspecto del operador
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {SKIN_PALETTE.map((skin) => {
                const selected = skinColor === skin.hex;
                return (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => onSkinChange(skin.hex)}
                    title={skin.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      selected
                        ? 'bg-slate-800 border-amber-400 text-white'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-sm shrink-0"
                      style={{ backgroundColor: skin.hex }}
                    />
                    <span>{skin.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Rooms Strip */}
          {rooms.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Salas activas ahora</span>
                <span className="text-xs text-slate-400 font-mono-num">{rooms.length} en línea</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {rooms.slice(0, 5).map((r) => (
                  <button
                    key={r.roomId}
                    type="button"
                    onClick={() => onRoomChange(r.roomId)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                      roomId.toLowerCase() === r.roomId
                        ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="font-mono-num">{r.roomId}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">{r.players} jug.</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right: Voice Chat Config & Controls */}
        <section className="lg:col-span-5 bg-slate-900/92 border border-white/12 rounded-xl p-6 md:p-7 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-sky-400" />
                <span>Chat de Voz Integrado</span>
              </h2>
              <span className="text-xs text-slate-400">WebRTC P2P</span>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={micReady ? onToggleMute : onInitMic}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    !micReady
                      ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                      : voiceMuted
                        ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                        : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  {voiceMuted || !micReady ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>
                    {!micReady ? 'Activar Micrófono' : voiceMuted ? 'Micrófono Silenciado' : 'Micrófono Activo'}
                  </span>
                </button>

                <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => onVoiceModeChange('proximity')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      voiceMode === 'proximity' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Proximidad
                  </button>
                  <button
                    type="button"
                    onClick={() => onVoiceModeChange('global')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      voiceMode === 'global' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Global
                  </button>
                </div>
              </div>

              {/* Live Mic Input Level Bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Nivel de entrada</span>
                  <span className="font-mono-num">{Math.round(micLevel * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-transform duration-75 origin-left"
                    style={{ transform: `scaleX(${micReady && !voiceMuted ? Math.max(0.02, micLevel) : 0})` }}
                  />
                </div>
                {micError && <p className="mt-2 text-xs text-amber-400">{micError}</p>}
              </div>
            </div>
          </div>

          {/* Controls Summary */}
          <div className="space-y-2.5 text-xs text-slate-300">
            <h3 className="font-display text-sm font-bold text-white">Controles Esenciales</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Mover / Saltar</span>
                <span className="font-mono-num text-white">WASD / Espacio</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Correr</span>
                <span className="font-mono-num text-white">Shift</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1"><Crosshair className="w-3 h-3" /> Disparar / Apuntar</span>
                <span className="font-mono-num text-white">Clic Izq / Der</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1"><Hammer className="w-3 h-3" /> Construir</span>
                <span className="font-mono-num text-white">Q · Z X C V</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Rotar / Material</span>
                <span className="font-mono-num text-white">R / G</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1"><Radio className="w-3 h-3" /> Voz / Recoger</span>
                <span className="font-mono-num text-white">M / E</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onJoinMatch}
            disabled={connecting}
            className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Shield className="w-5 h-5" />
            <span>{connecting ? 'Desplegando en la isla...' : 'Entrar a la Partida'}</span>
          </button>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <span>Isla Battle Royale · Cuadrícula 4×3m</span>
        <span>Comparte el código de sala para jugar y hablar en vivo con amigos</span>
      </footer>
    </div>
  );
};
