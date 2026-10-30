// 游戏主引擎：场景 / 渲染 / mesh层级 / 交互 / 动画 / 匹配特效
import * as THREE from 'three';
import { buildPolyhedron, FaceData } from './PolyhedronBuilder';
import { TextureFactory } from './TextureFactory';
import { PuzzleState } from './PuzzleState';
import type { LevelConfig } from './types';

interface Tween {
  t: number; dur: number;
  onUpdate: (k: number) => void;
  onDone?: () => void;
}

interface TileUD {
  face: number; home: number; slot: number;
  isOcta: boolean;
}

export class GameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private root!: THREE.Group;          // 多面体整体（视角旋转作用对象）
  private faceGroups: THREE.Group[] = [];
  private faceData: FaceData[] = [];
  private tiles: THREE.Mesh[] = [];    // 全部tile mesh（平铺）
  private faceEdges: THREE.LineSegments[] = [];
  private faceTextures: THREE.CanvasTexture[] = [];
  private stars!: THREE.Points;

  private puzzle!: PuzzleState;
  private level!: LevelConfig;
  private texFactory = new TextureFactory();

  // 交互状态
  private dragging = false;
  private pointerStart = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private angularVel = new THREE.Vector2(0, 0);
  private downTile: THREE.Mesh | null = null;
  private selected: THREE.Mesh | null = null;
  private lastTapTime = 0;
  private lastTapTile: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();

  private tweens: Tween[] = [];
  private clock = new THREE.Clock();

  // 选中高亮框
  private selFrame!: THREE.LineSegments;

  // 回调
  onProgress?: (steps: number, matched: number, total: number) => void;
  onWin?: (steps: number) => void;

  constructor(private container: HTMLElement) {
    this.initScene();
    this.bindEvents();
    this.loop();
  }

  private initScene() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 4.4);

    // 背景星尘
    const starGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 2] = -4 - Math.random() * 10;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0x4cc9f0, size: 0.035, transparent: true, opacity: 0.55
    }));
    this.scene.add(this.stars);

    // 选中高亮框
    const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
    this.selFrame = new THREE.LineSegments(frameGeo,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.95 }));
    this.selFrame.visible = false;
    this.scene.add(this.selFrame);
  }

  /** 载入关卡 */
  loadLevel(level: LevelConfig): void {
    this.level = level;
    // 清理旧场景对象
    if (this.root) {
      this.scene.remove(this.root);
      this.tiles.forEach(t => {
        (t.material as THREE.MeshBasicMaterial).map?.dispose();
        (t.material as THREE.Material).dispose();
        t.geometry.dispose();
      });
      this.faceTextures.forEach(t => t.dispose());
    }
    this.tiles = [];
    this.faceGroups = [];
    this.faceEdges = [];
    this.faceTextures = [];
    this.faceData = buildPolyhedron(level.poly);

    const faceCount = this.faceData.length;
    this.puzzle = new PuzzleState(level, faceCount);

    this.root = new THREE.Group();
    this.root.rotation.set(0.42, -0.55, 0); // 初始展示三面
    this.scene.add(this.root);

    const isOcta = level.poly === 'octahedron';
    const grid = isOcta ? 1 : level.grid;

    this.faceData.forEach(fd => {
      // faceGroup：位于面中心，z轴=法线
      const fg = new THREE.Group();
      fg.position.copy(fd.center);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fd.normal);
      fg.quaternion.copy(quat);
      this.root.add(fg);
      this.faceGroups.push(fg);

      // 面贴图
      const canvas = this.texFactory.createFaceTexture(level.pattern, fd.index, level.confusion);
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 4;
      this.faceTextures.push(tex);

      // 面边缘描边（未完成=暗灰，完成=冰蓝）
      const edge = this.buildFaceEdge(fd, isOcta, grid);
      fg.add(edge);
      this.faceEdges.push(edge);

      // tiles
      const n = grid * grid;
      for (let i = 0; i < n; i++) {
        const mesh = isOcta
          ? this.buildOctaTile(fd, i, tex)
          : this.buildCubeTile(fd, grid, i, tex);
        (mesh.userData as TileUD) = { face: fd.index, home: i, slot: i, isOcta };
        fg.add(mesh);
        this.tiles.push(mesh);
      }
    });

    this.puzzle.scramble();
    this.applyState(true);
    this.selected = null;
    this.selFrame.visible = false;
    this.emitProgress();
  }

  private buildCubeTile(fd: FaceData, grid: number, home: number, tex: THREE.Texture): THREE.Mesh {
    const tile = fd.size / grid;
    const gap = tile * 0.02;
    const geo = new THREE.PlaneGeometry(tile - gap, tile - gap);
    // UV 切分：home 身份 → 贴图区域（canvas y向下，UV y向上）
    const cx = home % grid, cy = Math.floor(home / grid);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k,
        (uv.getX(k) + cx) / grid,
        1 - (1 - uv.getY(k) + cy) / grid
      );
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    return new THREE.Mesh(geo, mat);
  }

  private buildOctaTile(fd: FaceData, _i: number, tex: THREE.Texture): THREE.Mesh {
    const verts = fd.triVerts!;
    // 包围盒归一化到贴图中央区域
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    verts.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(9);
    const uvs = new Float32Array(6);
    verts.forEach((p, k) => {
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = 0;
      uvs[k * 2] = 0.5 + (p.x - cx) / span * 0.44;
      uvs[k * 2 + 1] = 0.5 + (p.y - cy) / span * 0.44;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }

  private buildFaceEdge(fd: FaceData, isOcta: boolean, grid: number): THREE.LineSegments {
    let geo: THREE.BufferGeometry;
    if (isOcta) {
      const pts: THREE.Vector3[] = [];
      const v = fd.triVerts!;
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3];
        pts.push(new THREE.Vector3(a.x, a.y, 0.002), new THREE.Vector3(b.x, b.y, 0.002));
      }
      geo = new THREE.BufferGeometry().setFromPoints(pts);
    } else {
      const h = fd.size / 2 * 1.005;
      geo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(h * 2, h * 2));
      geo.translate(0, 0, 0.002);
    }
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x555a66, transparent: true, opacity: 0.7
    }));
  }

  /** 将 puzzle 状态应用到 mesh（初始载入用，无动画） */
  private applyState(instant: boolean): void {
    const isOcta = this.level.poly === 'octahedron';
    const grid = isOcta ? 1 : this.level.grid;
    const angleStep = isOcta ? Math.PI * 2 / 3 : Math.PI / 2;

    for (const mesh of this.tiles) {
      const ud = mesh.userData as TileUD;
      const ts = this.puzzle.faces[ud.face].find(t => t.home === ud.home)!;
      ud.slot = ts.slot;
      if (isOcta) {
        mesh.rotation.z = ts.rot * angleStep;
      } else {
        const tile = this.faceData[ud.face].size / grid;
        const sx = ts.slot % grid, sy = Math.floor(ts.slot / grid);
        const h = this.faceData[ud.face].size / 2;
        mesh.position.set(
          -h + tile * (sx + 0.5), h - tile * (sy + 0.5), 0.001
        );
        mesh.rotation.z = ts.rot * angleStep;
      }
    }
    if (instant) this.updateFaceEdges();
  }

  private updateFaceEdges() {
    this.faceEdges.forEach((edge, f) => {
      const solved = this.puzzle.isFaceIndexSolved(f);
      const mat = edge.material as THREE.LineBasicMaterial;
      mat.color.set(solved ? 0x4cc9f0 : 0x555a66);
      mat.opacity = solved ? 1.0 : 0.45;
    });
  }

  // ============ 交互 ============

  private bindEvents() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onDown = (e: PointerEvent) => {
    this.pointerStart = { x: e.clientX, y: e.clientY };
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.dragging = false;
    this.downTile = this.pickTile(e);
    this.angularVel.set(0, 0);
  };

  private onMove = (e: PointerEvent) => {
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    const totalMove = Math.hypot(
      e.clientX - this.pointerStart.x,
      e.clientY - this.pointerStart.y
    );
    if (totalMove > 8) this.dragging = true;

    if (this.dragging) {
      this.downTile = null;
      const k = 0.0055;
      this.rotateRoot(dx * k, dy * k);
      this.angularVel.set(dx * k, dy * k);
    }
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent) => {
    if (this.dragging) { this.dragging = false; return; }
    const tile = this.downTile ?? this.pickTile(e);
    this.downTile = null;
    if (!tile) {
      this.clearSelection();
      return;
    }
    const now = performance.now();
    // 双击旋转
    if (tile === this.lastTapTile && now - this.lastTapTime < 320) {
      this.lastTapTile = null;
      this.clearSelection();
      this.rotateTile(tile);
      return;
    }
    this.lastTapTime = now;
    this.lastTapTile = tile;

    // 已有选中 → 尝试交换
    if (this.selected && this.selected !== tile) {
      const a = this.selected.userData as TileUD;
      const b = tile.userData as TileUD;
      if (a.face === b.face && !b.isOcta) {
        this.swapTiles(this.selected, tile);
        this.clearSelection();
        return;
      }
    }
    this.selectTile(tile);
  };

  private pickTile(e: PointerEvent): THREE.Mesh | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.tiles, false);
    return hits.length ? (hits[0].object as THREE.Mesh) : null;
  }

  private rotateRoot(ax: number, ay: number) {
    // 屏幕水平→绕世界Y，屏幕垂直→绕世界X（防万向锁：quaternion增量）
    const q = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(ay, ax, 0, 'XYZ'));
    this.root.quaternion.premultiply(q);
  }

  private selectTile(mesh: THREE.Mesh) {
    this.selected = mesh;
    const ud = mesh.userData as TileUD;
    if (ud.isOcta) return; // 八面体面：无框
    // 高亮框贴到tile上（faceGroup局部）
    const fg = this.faceGroups[ud.face];
    mesh.getWorldPosition(this.selFrame.position);
    // 转换到 faceGroup 局部
    fg.worldToLocal(this.selFrame.position);
    this.selFrame.position.z = 0.004;
    const scale = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
    this.selFrame.scale.setScalar(scale);
    this.selFrame.visible = true;
    this.selFrame.parent !== this.scene && this.scene.remove(this.selFrame);
    fg.add(this.selFrame);
  }

  private clearSelection() {
    this.selected = null;
    this.selFrame.visible = false;
  }

  /** 外部按钮：旋转当前选中 tile */
  rotateSelected(): void {
    if (this.selected) {
      this.rotateTile(this.selected);
      this.clearSelection();
    }
  }

  /** 提示：自动修正一个错误tile */
  applyHint(): boolean {
    const hint = this.puzzle.findHint();
    if (!hint) return false;
    const tile = this.tiles.find(t => {
      const ud = t.userData as TileUD;
      return ud.face === hint.face && ud.slot === hint.slot;
    });
    if (!tile) return false;
    const ud = tile.userData as TileUD;
    const ts = this.puzzle.faces[ud.face].find(x => x.home === ud.home)!;
    // 直接归位
    ts.slot = ts.home; ts.rot = 0;
    this.animateTileTo(tile);
    this.puzzle.steps++;
    this.afterAction();
    return true;
  }

  resetLevel(): void {
    this.puzzle.scramble();
    this.applyState(true);
    this.clearSelection();
    this.emitProgress();
  }

  // ============ 操作与动画 ============

  private swapTiles(a: THREE.Mesh, b: THREE.Mesh) {
    const ua = a.userData as TileUD, ub = b.userData as TileUD;
    if (!this.puzzle.swap(ua.face, ua.slot, ub.slot)) return;
    this.animateTileTo(a);
    this.animateTileTo(b);
    this.afterAction();
  }

  private rotateTile(mesh: THREE.Mesh) {
    const ud = mesh.userData as TileUD;
    if (!this.puzzle.rotate(ud.face, ud.slot)) return;
    this.animateTileTo(mesh);
    this.afterAction();
  }

  /** tile 位置/角度动画到当前状态值 */
  private animateTileTo(mesh: THREE.Mesh) {
    const ud = mesh.userData as TileUD;
    const isOcta = ud.isOcta;
    const grid = isOcta ? 1 : this.level.grid;
    const angleStep = isOcta ? Math.PI * 2 / 3 : Math.PI / 2;
    const ts = this.puzzle.faces[ud.face].find(t => t.home === ud.home)!;
    ud.slot = ts.slot;

    if (isOcta) {
      const from = mesh.rotation.z;
      let to = ts.rot * angleStep;
      // 就近旋转
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      this.tween(300, k => { mesh.rotation.z = from + (to - from) * k; });
    } else {
      const tile = this.faceData[ud.face].size / grid;
      const h = this.faceData[ud.face].size / 2;
      const sx = ts.slot % grid, sy = Math.floor(ts.slot / grid);
      const toX = -h + tile * (sx + 0.5), toY = h - tile * (sy + 0.5);
      const fromX = mesh.position.x, fromY = mesh.position.y;
      const fromR = mesh.rotation.z;
      let toR = ts.rot * angleStep;
      while (toR - fromR > Math.PI) toR -= Math.PI * 2;
      while (toR - fromR < -Math.PI) toR += Math.PI * 2;
      this.tween(280, k => {
        const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
        mesh.position.set(fromX + (toX - fromX) * e, fromY + (toY - fromY) * e, 0.001);
        mesh.rotation.z = fromR + (toR - fromR) * e;
      }, () => {
        if (this.puzzle.isTileSolved(ts)) this.flashTile(mesh);
      });
    }
  }

  /** 归位闪光：白光脉冲 + 缩放 */
  private flashTile(mesh: THREE.Mesh) {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const baseScale = mesh.scale.x;
    this.tween(420, k => {
      const pulse = Math.sin(k * Math.PI);
      mat.color.setRGB(1 + pulse * 1.2, 1 + pulse * 1.2, 1 + pulse * 1.2);
      mesh.scale.setScalar(baseScale * (1 + pulse * 0.06));
    }, () => {
      mat.color.setRGB(1, 1, 1);
      mesh.scale.setScalar(baseScale);
    });
  }

  private afterAction() {
    this.updateFaceEdges();
    this.emitProgress();
    if (this.puzzle.isSolved()) {
      // 通关：整体脉冲
      this.tween(900, k => {
        const pulse = Math.sin(k * Math.PI * 2) * 0.5 + 0.5;
        this.root.scale.setScalar(1 + pulse * 0.05);
      }, () => this.root.scale.setScalar(1));
      this.onWin?.(this.puzzle.steps);
    }
  }

  private emitProgress() {
    this.onProgress?.(
      this.puzzle.steps,
      this.puzzle.matchedFaceCount(),
      this.puzzle.faces.length
    );
  }

  // ============ tween & 主循环 ============

  private tween(dur: number, onUpdate: (k: number) => void, onDone?: () => void) {
    this.tweens.push({ t: 0, dur, onUpdate, onDone });
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 惯性旋转（阻尼）
    if (!this.dragging && this.angularVel.lengthSq() > 1e-8) {
      this.rotateRoot(this.angularVel.x, this.angularVel.y);
      this.angularVel.multiplyScalar(0.94);
    }

    // 推进tween
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt * 1000;
      const k = Math.min(tw.t / tw.dur, 1);
      tw.onUpdate(k);
      if (k >= 1) {
        tw.onDone?.();
        this.tweens.splice(i, 1);
      }
    }

    // 星尘缓旋
    this.stars.rotation.z += dt * 0.01;
    // 选中框呼吸
    if (this.selFrame.visible) {
      const mat = this.selFrame.material as THREE.LineBasicMaterial;
      mat.opacity = 0.6 + Math.sin(performance.now() / 200) * 0.35;
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.renderer.dispose();
    this.container.innerHTML = '';
    window.removeEventListener('resize', this.onResize);
  }
}
