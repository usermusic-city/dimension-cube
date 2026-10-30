// 拼图状态机：打乱 / 交换 / 旋转 / 匹配判定
import type { TileState, LevelConfig } from './types';

export class PuzzleState {
  /** faces[faceIndex] = 该面的分片状态数组 */
  faces: TileState[][] = [];
  grid: number;
  steps = 0;

  constructor(private level: LevelConfig, faceCount: number) {
    this.grid = level.poly === 'octahedron' ? 1 : level.grid;
    for (let f = 0; f < faceCount; f++) {
      const n = this.grid * this.grid;
      const tiles: TileState[] = [];
      for (let i = 0; i < n; i++) tiles.push({ home: i, slot: i, rot: 0 });
      this.faces.push(tiles);
    }
  }

  /** 打乱：保证至少 60% 分片偏离原位，且不产生已解状态 */
  scramble(): void {
    const rotSteps = this.level.poly === 'octahedron' ? 3 : 4;
    for (const tiles of this.faces) {
      let attempts = 0;
      do {
        // 位置打乱
        if (this.level.scrambleSwap) {
          for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tiles[i].slot, tiles[j].slot] = [tiles[j].slot, tiles[i].slot];
          }
        }
        // 角度打乱
        if (this.level.scrambleRotate) {
          for (const t of tiles) t.rot = Math.floor(Math.random() * rotSteps);
        }
        attempts++;
      } while (this.isFaceSolved(tiles) && attempts < 20);
    }
    this.steps = 0;
  }

  /** 交换两个分片（同面） */
  swap(face: number, slotA: number, slotB: number): boolean {
    const tiles = this.faces[face];
    const a = tiles.find(t => t.slot === slotA);
    const b = tiles.find(t => t.slot === slotB);
    if (!a || !b || a === b) return false;
    a.slot = slotB; b.slot = slotA;
    this.steps++;
    return true;
  }

  /** 旋转分片（绕面法线 +90°/120°） */
  rotate(face: number, slot: number, rotSteps: number = 1): boolean {
    const t = this.faces[face].find(t => t.slot === slot);
    if (!t) return false;
    const mod = this.level.poly === 'octahedron' ? 3 : 4;
    t.rot = ((t.rot + rotSteps) % mod + mod) % mod;
    this.steps++;
    return true;
  }

  isTileSolved(t: TileState): boolean {
    return t.home === t.slot && t.rot === 0;
  }

  isFaceSolved(tiles: TileState[]): boolean {
    return tiles.every(t => this.isTileSolved(t));
  }

  isFaceIndexSolved(face: number): boolean {
    return this.isFaceSolved(this.faces[face]);
  }

  isSolved(): boolean {
    return this.faces.every(tiles => this.isFaceSolved(tiles));
  }

  /** 已匹配面数 */
  matchedFaceCount(): number {
    return this.faces.filter(tiles => this.isFaceSolved(tiles)).length;
  }

  /** 找一个未归位的分片槽位（提示用） */
  findHint(): { face: number; slot: number } | null {
    for (let f = 0; f < this.faces.length; f++) {
      const tiles = this.faces[f];
      for (const t of tiles) {
        if (!this.isTileSolved(t)) return { face: f, slot: t.slot };
      }
    }
    return null;
  }
}
