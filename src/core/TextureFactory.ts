// 程序化贴图工厂：Canvas 绘制科技风图案，跨分片连续，无旋转对称性
import type { PatternKind } from './types';

export const PALETTE = {
  bg: '#11141A',
  cyan: '#4CC9F0',
  red: '#D83A56',
  gray1: '#232730',
  gray2: '#555A66',
  white: '#F0F4F8'
};

// 每个面的主色系（冰蓝 / 猩红 / 白金 轮换，confusion 高时统一为冰蓝系制造混淆）
const HUES = ['#4CC9F0', '#D83A56', '#F0F4F8', '#7BE0FF', '#FF6B8A', '#B8C4D4'];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TextureFactory {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 512;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** 生成一个面的完整图案贴图 */
  createFaceTexture(pattern: PatternKind, faceIndex: number, confusion: number): HTMLCanvasElement {
    const ctx = this.ctx;
    const S = this.size;
    const rnd = mulberry(faceIndex * 7919 + pattern.length * 131 + 17);

    // 底色 + 微弱网格底纹
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, S, S);
    this.drawBaseGrid(rnd);

    // 混淆度高 → 统一色系（都用冰蓝变体），低 → 每面独立色
    const hue = confusion > 0.5
      ? HUES[Math.floor(rnd() * 3)] // 只用前三个近似色
      : HUES[faceIndex % HUES.length];

    switch (pattern) {
      case 'concentric': this.pConcentric(hue, rnd); break;
      case 'radial': this.pRadial(hue, rnd); break;
      case 'grid': this.pGrid(hue, rnd); break;
      case 'circuit': this.pCircuit(hue, rnd); break;
      case 'wave': this.pWave(hue, rnd); break;
      case 'triarray': this.pTriArray(hue, rnd); break;
    }

    // 方向性标记：左上角缺口 + 对角渐变（破坏旋转对称，让角度错乱可被推理）
    this.drawDirectionMark(hue);

    return this.canvas;
  }

  private drawBaseGrid(rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    ctx.strokeStyle = 'rgba(85, 90, 102, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (S / 8) * i;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
    }
  }

  /** 同心圆环 + 偏心圆破坏对称 */
  private pConcentric(hue: string, rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    const cx = S * (0.35 + rnd() * 0.3), cy = S * (0.35 + rnd() * 0.3);
    for (let r = 40; r < S * 0.9; r += 34) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = r % 68 === 0 ? hue : PALETTE.gray2;
      ctx.lineWidth = r % 68 === 0 ? 5 : 2;
      ctx.stroke();
    }
    // 中心不对称核心
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 1.5);
    ctx.fill();
  }

  /** 放射线 + 单向渐变扇区 */
  private pRadial(hue: string, rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    const cx = S / 2, cy = S / 2;
    const n = 12 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * S, cy + Math.sin(a) * S);
      ctx.strokeStyle = i % 3 === 0 ? hue : PALETTE.gray2;
      ctx.lineWidth = i % 3 === 0 ? 4 : 1.5;
      ctx.stroke();
    }
    // 渐变扇区（方向性）
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, 'rgba(76, 201, 240, 0.05)');
    grad.addColorStop(1, 'rgba(76, 201, 240, 0.30)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, S * 0.7, 0.3, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hue;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
  }

  /** 网格节点 + 十字标记 */
  private pGrid(hue: string, rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    const step = S / 6;
    for (let x = step / 2; x < S; x += step) {
      for (let y = step / 2; y < S; y += step) {
        const isKey = rnd() > 0.72;
        ctx.strokeStyle = isKey ? hue : PALETTE.gray2;
        ctx.lineWidth = isKey ? 3 : 1.5;
        const r = isKey ? 14 : 8;
        ctx.beginPath();
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
        ctx.stroke();
        if (isKey) {
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = hue; ctx.fill();
        }
      }
    }
  }

  /** 电路走线：曼哈顿路径 + 端点 */
  private pCircuit(hue: string, rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    const step = S / 8;
    const traces = 7;
    for (let t = 0; t < traces; t++) {
      let x = Math.floor(rnd() * 8) * step + step / 2;
      let y = Math.floor(rnd() * 8) * step + step / 2;
      const isMain = t < 2;
      ctx.strokeStyle = isMain ? hue : PALETTE.gray2;
      ctx.lineWidth = isMain ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segs = 4 + Math.floor(rnd() * 5);
      for (let s = 0; s < segs; s++) {
        const dir = Math.floor(rnd() * 4);
        const len = (1 + Math.floor(rnd() * 3)) * step;
        if (dir === 0) x += len; else if (dir === 1) x -= len;
        else if (dir === 2) y += len; else y -= len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, isMain ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isMain ? hue : PALETTE.gray2; ctx.fill();
    }
  }

  /** 波纹：多条正弦曲线 */
  private pWave(hue: string, rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    const lines = 6;
    for (let l = 0; l < lines; l++) {
      const isMain = l % 3 === 0;
      ctx.strokeStyle = isMain ? hue : PALETTE.gray2;
      ctx.lineWidth = isMain ? 4.5 : 2;
      const amp = 20 + rnd() * 50;
      const freq = 2 + Math.floor(rnd() * 3);
      const phase = rnd() * Math.PI * 2;
      const yBase = (S / lines) * l + S / (lines * 2);
      ctx.beginPath();
      for (let x = 0; x <= S; x += 4) {
        const y = yBase + Math.sin((x / S) * Math.PI * 2 * freq + phase) * amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** 三角阵列 + 单向倒角 */
  private pTriArray(hue: string, rnd: () => number) {
    const ctx = this.ctx, S = this.size;
    const step = S / 5;
    for (let gx = 0; gx < 5; gx++) {
      for (let gy = 0; gy < 5; gy++) {
        const x = gx * step + step / 2, y = gy * step + step / 2;
        const isMain = rnd() > 0.6;
        ctx.strokeStyle = isMain ? hue : PALETTE.gray2;
        ctx.lineWidth = isMain ? 3.5 : 1.5;
        const r = step * 0.36;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r);
        ctx.closePath();
        isMain ? (ctx.fillStyle = 'rgba(76,201,240,0.15)', ctx.fill()) : null;
        ctx.stroke();
      }
    }
  }

  /** 方向标记：左上角三角 + 对角渐变，确保任意90°旋转都能被识别 */
  private drawDirectionMark(hue: string) {
    const ctx = this.ctx, S = this.size;
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, 'rgba(240, 244, 248, 0.10)');
    grad.addColorStop(1, 'rgba(17, 20, 26, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // 左上角方向三角
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.moveTo(14, 14); ctx.lineTo(66, 14); ctx.lineTo(14, 66);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = PALETTE.bg; ctx.lineWidth = 3; ctx.stroke();
  }
}
