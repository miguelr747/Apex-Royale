import * as THREE from 'three';

export interface ProceduralTextureSet {
  wood: THREE.CanvasTexture;
  brick: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  blueprint: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
}

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(canvas: HTMLCanvasElement, maxAniso: number, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

  // 1. Wood planks
  const [wCanvas, wCtx] = makeCanvas(256);
  wCtx.fillStyle = '#a47148';
  wCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    wCtx.fillStyle = row % 2 === 0 ? '#9c6644' : '#b07d52';
    wCtx.fillRect(0, y + 2, 256, 60);
    wCtx.fillStyle = '#6f4528';
    wCtx.fillRect(0, y, 256, 3);
    for (let g = 0; g < 16; g++) {
      wCtx.fillStyle = 'rgba(72, 42, 20, 0.22)';
      wCtx.fillRect(0, y + 8 + g * 3, 256, 1.5);
    }
    // Nails
    wCtx.fillStyle = '#3f3f46';
    wCtx.fillRect(14, y + 14, 5, 5);
    wCtx.fillRect(236, y + 44, 5, 5);
  }
  const wood = finalizeTexture(wCanvas, maxAniso, 1);

  // 2. Brick masonry
  const [bCanvas, bCtx] = makeCanvas(256);
  bCtx.fillStyle = '#cbd5e1';
  bCtx.fillRect(0, 0, 256, 256);
  const brickH = 32;
  const brickW = 64;
  for (let r = 0; r < 8; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let c = -1; c < 5; c++) {
      const shade = 148 + ((r * 7 + c * 13) % 28);
      bCtx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.45)}, ${Math.round(shade * 0.36)})`;
      bCtx.fillRect(c * brickW + offset + 2, r * brickH + 2, brickW - 4, brickH - 4);
    }
  }
  const brick = finalizeTexture(bCanvas, maxAniso, 1);

  // 3. Ribbed Steel Metal
  const [mCanvas, mCtx] = makeCanvas(256);
  mCtx.fillStyle = '#64748b';
  mCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const x = i * 32;
    mCtx.fillStyle = '#94a3b8';
    mCtx.fillRect(x + 2, 0, 12, 256);
    mCtx.fillStyle = '#475569';
    mCtx.fillRect(x + 14, 0, 18, 256);
  }
  mCtx.strokeStyle = '#334155';
  mCtx.lineWidth = 4;
  mCtx.strokeRect(4, 4, 248, 248);
  // Rivets
  mCtx.fillStyle = '#e2e8f0';
  for (let i = 16; i < 256; i += 48) {
    mCtx.fillRect(i, 12, 4, 4);
    mCtx.fillRect(i, 240, 4, 4);
  }
  const metal = finalizeTexture(mCanvas, maxAniso, 1);

  // 4. Blueprint grid
  const [bpCanvas, bpCtx] = makeCanvas(256);
  bpCtx.fillStyle = '#0284c7';
  bpCtx.fillRect(0, 0, 256, 256);
  bpCtx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
  bpCtx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    bpCtx.beginPath();
    bpCtx.moveTo(i, 0);
    bpCtx.lineTo(i, 256);
    bpCtx.stroke();
    bpCtx.beginPath();
    bpCtx.moveTo(0, i);
    bpCtx.lineTo(256, i);
    bpCtx.stroke();
  }
  const blueprint = finalizeTexture(bpCanvas, maxAniso, 1);

  // 5. Stylized Terrain Detail
  const [gCanvas, gCtx] = makeCanvas(256);
  gCtx.fillStyle = '#ffffff';
  gCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    gCtx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    gCtx.fillRect(x, y, 4, 6);
  }
  const grass = finalizeTexture(gCanvas, maxAniso, 28);

  return { wood, brick, metal, blueprint, grass };
}
