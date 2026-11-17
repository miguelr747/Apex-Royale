import type { VoiceMode } from '../shared/gameTypes';

export interface VoicePeerStatus {
  peerId: string;
  connected: boolean;
  isSpeaking: boolean;
  mutedBySelf: boolean;
  localMuted: boolean;
  distance: number;
}

type SignalSender = (type: string, payload: Record<string, unknown>) => void;
type StatusListener = (status: {
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
}) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerEntry {
  peerId: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
  gainNode: GainNode | null;
  audioEl: HTMLAudioElement | null;
  connected: boolean;
  isSpeaking: boolean;
  mutedBySelf: boolean;
  localMuted: boolean;
  distance: number;
}

export class VoiceChatManager {
  private selfId = '';
  private sendSignal: SignalSender;
  private onStatus: StatusListener;

  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Uint8Array<ArrayBuffer> | null = null;
  private vadTimer: number | null = null;

  private peers = new Map<string, PeerEntry>();
  private micReady = false;
  private micError: string | null = null;
  private micLevel = 0;
  private isSpeaking = false;
  private muted = false;
  private deafened = false;
  private mode: VoiceMode = 'proximity';
  private pushToTalk = false;
  private pttHeld = false;

  constructor(sendSignal: SignalSender, onStatus: StatusListener) {
    this.sendSignal = sendSignal;
    this.onStatus = onStatus;
  }

  public setSelfId(id: string): void {
    this.selfId = id;
  }

  public async initMicrophone(): Promise<boolean> {
    if (this.localStream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.micError = 'Navegador sin soporte de micrófono (solo escucha).';
      this.emitStatus();
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.localStream = stream;
      this.micReady = true;
      this.micError = null;
      this.syncTrackEnabled();

      // Attach local stream to existing peer connections
      for (const peer of this.peers.values()) {
        const senders = peer.pc.getSenders();
        for (const track of stream.getAudioTracks()) {
          if (!senders.some((s) => s.track === track)) {
            peer.pc.addTrack(track, stream);
          }
        }
        // Renegotiate if polite initiator
        if (this.selfId && this.selfId < peer.peerId) {
          this.createAndSendOffer(peer).catch(() => {});
        }
      }

      // Setup VAD analyser
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = this.audioCtx || new AudioCtx();
        const src = this.audioCtx.createMediaStreamSource(stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        src.connect(this.analyser);
        this.analyserBuf = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      }

      if (this.vadTimer === null) {
        this.vadTimer = window.setInterval(() => this.sampleMicLevel(), 80);
      }

      this.emitStatus();
      return true;
    } catch {
      this.micReady = false;
      this.micError = 'Permiso de micrófono denegado (modo solo escucha activo).';
      this.emitStatus();
      return false;
    }
  }

  private sampleMicLevel(): void {
    let level = 0;
    const canTransmit = !this.muted && (!this.pushToTalk || this.pttHeld);

    if (this.analyser && this.analyserBuf && canTransmit) {
      this.analyser.getByteTimeDomainData(this.analyserBuf);
      let sum = 0;
      for (let i = 0; i < this.analyserBuf.length; i++) {
        const v = (this.analyserBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.analyserBuf.length);
      level = Math.min(1, rms * 4.5);
    }

    const speakingNow = canTransmit && level > 0.08;
    const speakingChanged = speakingNow !== this.isSpeaking;
    this.micLevel = level;
    this.isSpeaking = speakingNow;

    if (speakingChanged && this.selfId) {
      this.sendSignal('voice:state', {
        isSpeaking: this.isSpeaking,
        voiceMuted: this.muted,
      });
    }
    this.emitStatus();
  }

  private syncTrackEnabled(): void {
    const active = !this.muted && (!this.pushToTalk || this.pttHeld);
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = active;
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncTrackEnabled();
    if (this.selfId) {
      this.sendSignal('voice:state', {
        isSpeaking: this.isSpeaking && !muted,
        voiceMuted: this.muted,
      });
    }
    this.emitStatus();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    this.updateAllGains();
    this.emitStatus();
  }

  public setMode(mode: VoiceMode): void {
    this.mode = mode;
    this.updateAllGains();
    this.emitStatus();
  }

  public setPushToTalk(enabled: boolean): void {
    this.pushToTalk = enabled;
    this.syncTrackEnabled();
    this.emitStatus();
  }

  public setPttHeld(held: boolean): void {
    if (this.pttHeld === held) return;
    this.pttHeld = held;
    this.syncTrackEnabled();
    this.emitStatus();
  }

  public toggleLocalPeerMute(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.localMuted = !peer.localMuted;
    this.applyPeerGain(peer);
    this.emitStatus();
  }

  public updatePeerSpeaking(peerId: string, isSpeaking: boolean, voiceMuted: boolean): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.isSpeaking = isSpeaking;
      peer.mutedBySelf = voiceMuted;
      this.emitStatus();
    }
  }

  public updatePeerDistances(distances: Map<string, number>): void {
    for (const [peerId, dist] of distances) {
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.distance = dist;
        this.applyPeerGain(peer);
      }
    }
  }

  private applyPeerGain(peer: PeerEntry): void {
    let vol = 1;
    if (this.deafened || peer.localMuted) {
      vol = 0;
    } else if (this.mode === 'proximity') {
      // Full volume within 14m, smooth falloff to 0 at 68m
      const d = peer.distance;
      if (d <= 14) vol = 1;
      else if (d >= 68) vol = 0;
      else vol = Math.pow(1 - (d - 14) / 54, 1.5);
    }

    if (peer.gainNode) {
      peer.gainNode.gain.value = vol;
    }
    if (peer.audioEl) {
      peer.audioEl.volume = vol;
      peer.audioEl.muted = vol === 0;
    }
  }

  private updateAllGains(): void {
    for (const peer of this.peers.values()) {
      this.applyPeerGain(peer);
    }
  }

  public ensurePeer(peerId: string): void {
    if (!this.selfId || peerId === this.selfId || this.peers.has(peerId)) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const entry: PeerEntry = {
      peerId,
      pc,
      remoteStream: null,
      gainNode: null,
      audioEl: null,
      connected: false,
      isSpeaking: false,
      mutedBySelf: false,
      localMuted: false,
      distance: 10,
    };
    this.peers.set(peerId, entry);

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      // Receive-only transceiver so listener-only peers still receive remote voice
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal('rtc:ice', {
          to: peerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      entry.connected = pc.connectionState === 'connected';
      this.emitStatus();
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      entry.remoteStream = stream;
      this.attachRemoteAudio(entry, stream);
    };

    if (this.selfId < peerId) {
      this.createAndSendOffer(entry).catch(() => {});
    }

    this.emitStatus();
  }

  private attachRemoteAudio(entry: PeerEntry, stream: MediaStream): void {
    if (!entry.audioEl) {
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = stream;
      entry.audioEl = audio;
      audio.play().catch(() => {});
    }

    if (this.audioCtx) {
      try {
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
        const src = this.audioCtx.createMediaStreamSource(stream);
        const gain = this.audioCtx.createGain();
        src.connect(gain).connect(this.audioCtx.destination);
        entry.gainNode = gain;
        // Mute raw HTMLAudioElement to prevent double playback when WebAudio routes it
        if (entry.audioEl) entry.audioEl.muted = true;
      } catch {
        // Fallback to HTMLAudioElement volume
      }
    }
    this.applyPeerGain(entry);
  }

  private async createAndSendOffer(entry: PeerEntry): Promise<void> {
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    this.sendSignal('rtc:offer', {
      to: entry.peerId,
      sdp: offer,
    });
  }

  public async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    this.ensurePeer(fromId);
    const entry = this.peers.get(fromId);
    if (!entry) return;

    await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    this.sendSignal('rtc:answer', {
      to: fromId,
      sdp: answer,
    });
  }

  public async handleAnswer(fromId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(fromId);
    if (!entry) return;
    if (entry.pc.signalingState !== 'stable') {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  public async handleIce(fromId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const entry = this.peers.get(fromId);
    if (!entry) return;
    try {
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Ignore late ICE candidates
    }
  }

  public removePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.pc.close();
    if (entry.audioEl) {
      entry.audioEl.srcObject = null;
      entry.audioEl = null;
    }
    this.peers.delete(peerId);
    this.emitStatus();
  }

  public dispose(): void {
    if (this.vadTimer !== null) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    for (const id of Array.from(this.peers.keys())) {
      this.removePeer(id);
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  private emitStatus(): void {
    this.onStatus({
      micReady: this.micReady,
      micError: this.micError,
      micLevel: this.micLevel,
      isSpeaking: this.isSpeaking,
      muted: this.muted,
      deafened: this.deafened,
      mode: this.mode,
      pttActive: this.pttHeld,
      pushToTalk: this.pushToTalk,
      peers: Array.from(this.peers.values()).map((p) => ({
        peerId: p.peerId,
        connected: p.connected,
        isSpeaking: p.isSpeaking,
        mutedBySelf: p.mutedBySelf,
        localMuted: p.localMuted,
        distance: p.distance,
      })),
    });
  }
}
