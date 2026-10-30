// 公共类型定义 —— 维度魔方·多面空间

export type PolyKind = 'cube' | 'octahedron';

export type PatternKind = 'concentric' | 'radial' | 'grid' | 'circuit' | 'wave' | 'triarray';

/** 单个分片的状态 */
export interface TileState {
  /** 图案身份：该分片原本所属的槽位编号（UV由此决定） */
  home: number;
  /** 当前所在槽位 */
  slot: number;
  /** 旋转步数（0-3，每步90°；八面体为0-2，每步120°） */
  rot: number;
}

/** 一个面的完整状态 */
export interface FaceState {
  tiles: TileState[];
}

export interface LevelConfig {
  id: number;
  name: string;
  poly: PolyKind;
  /** 分片密度：N×N（八面体忽略，固定1） */
  grid: number;
  /** 打乱模式 */
  scrambleRotate: boolean;
  scrambleSwap: boolean;
  pattern: PatternKind;
  /** 相似图案混淆度 0-1 */
  confusion: number;
  desc: string;
}

export interface GameStats {
  level: number;
  steps: number;
  matchedFaces: number;
  totalFaces: number;
}
