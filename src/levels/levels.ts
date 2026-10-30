// 关卡配置：数据驱动，难度递进
import type { LevelConfig } from '../core/types';

export const LEVELS: LevelConfig[] = [
  {
    id: 1, name: '初识·立方', poly: 'cube', grid: 2,
    scrambleRotate: true, scrambleSwap: false,
    pattern: 'concentric', confusion: 0,
    desc: '六面图案角度错乱，双击或按旋转键归位'
  },
  {
    id: 2, name: '错位·交织', poly: 'cube', grid: 2,
    scrambleRotate: true, scrambleSwap: true,
    pattern: 'radial', confusion: 0,
    desc: '角度+分片位置双重错乱，点选两片交换'
  },
  {
    id: 3, name: '回路·迷阵', poly: 'cube', grid: 3,
    scrambleRotate: true, scrambleSwap: true,
    pattern: 'circuit', confusion: 0,
    desc: '3×3 分片密度，电路纹路连续性推理'
  },
  {
    id: 4, name: '同源·混淆', poly: 'cube', grid: 3,
    scrambleRotate: true, scrambleSwap: true,
    pattern: 'grid', confusion: 0.7,
    desc: '相似色系图案，空间辨识考验'
  },
  {
    id: 5, name: '八面·棱镜', poly: 'octahedron', grid: 1,
    scrambleRotate: true, scrambleSwap: false,
    pattern: 'wave', confusion: 0,
    desc: '八面棱镜，三角面 120° 角度推理'
  },
  {
    id: 6, name: '深空·矩阵', poly: 'cube', grid: 4,
    scrambleRotate: true, scrambleSwap: true,
    pattern: 'triarray', confusion: 0,
    desc: '4×4 高密度分片，极限空间推理'
  },
  {
    id: 7, name: '终焉·回响', poly: 'cube', grid: 4,
    scrambleRotate: true, scrambleSwap: true,
    pattern: 'circuit', confusion: 0.85,
    desc: '高密度+相似图案，多维干扰终极考验'
  },
];
