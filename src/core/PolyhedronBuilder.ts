// 多面体构建器：生成各面的几何描述（法线/中心/面内基），供引擎搭建 mesh 层级
import * as THREE from 'three';
import type { PolyKind } from './types';

export interface FaceData {
  index: number;
  normal: THREE.Vector3;
  center: THREE.Vector3;
  /** 面内横向基（单位向量） */
  u: THREE.Vector3;
  /** 面内纵向基（单位向量） */
  v: THREE.Vector3;
  /** 面边长（立方体）或边长（八面体三角形） */
  size: number;
  /** 三角形顶点（仅八面体），局部于面平面 */
  triVerts?: THREE.Vector2[];
}

export function buildPolyhedron(kind: PolyKind): FaceData[] {
  if (kind === 'cube') return buildCube();
  return buildOctahedron();
}

/** 立方体：6 面，每面可切 N×N 方形分片 */
function buildCube(): FaceData[] {
  const S = 1.6; // 边长
  const h = S / 2;
  const faces: FaceData[] = [];
  // [normal, u, v] —— 保证 u×v = normal（右手系，贴图不镜像）
  const defs: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],   // 前 +Z
    [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)], // 后 -Z
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],  // 右 +X
    [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],  // 左 -X
    [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],  // 上 +Y
    [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],  // 下 -Y
  ];
  defs.forEach(([n, u, v], i) => {
    faces.push({
      index: i,
      normal: n.clone(),
      center: n.clone().multiplyScalar(h),
      u: u.clone(),
      v: v.clone(),
      size: S
    });
  });
  return faces;
}

/** 正八面体：8 三角形面，整面图案 120° 旋转模式 */
function buildOctahedron(): FaceData[] {
  const R = 1.25; // 顶点半径
  const verts = [
    new THREE.Vector3(R, 0, 0), new THREE.Vector3(-R, 0, 0),
    new THREE.Vector3(0, R, 0), new THREE.Vector3(0, -R, 0),
    new THREE.Vector3(0, 0, R), new THREE.Vector3(0, 0, -R),
  ];
  // 8 个三角形面（顶点索引，保证逆时针朝外）
  const triDefs = [
    [2, 4, 0], [2, 0, 5], [2, 5, 1], [2, 1, 4],
    [3, 0, 4], [3, 5, 0], [3, 1, 5], [3, 4, 1],
  ];
  const faces: FaceData[] = [];
  triDefs.forEach((t, i) => {
    const a = verts[t[0]], b = verts[t[1]], c = verts[t[2]];
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const normal = center.clone().normalize();
    // 面内基：u = ab方向，v = u×normal（保证右手系）
    const u = b.clone().sub(a).normalize();
    const v = new THREE.Vector3().crossVectors(u, normal).normalize();
    // 三角形顶点投影到面内2D坐标（相对面中心）
    const to2D = (p: THREE.Vector3) => {
      const d = p.clone().sub(center);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    };
    faces.push({
      index: i,
      normal,
      center,
      u, v,
      size: a.distanceTo(b),
      triVerts: [to2D(a), to2D(b), to2D(c)]
    });
  });
  return faces;
}
