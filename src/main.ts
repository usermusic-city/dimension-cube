// 入口：装配引擎与 UI
import './ui/style.css';
import { GameEngine } from './core/GameEngine';
import { LEVELS } from './levels/levels';
import type { LevelConfig } from './core/types';

const $ = (id: string) => document.getElementById(id)!;

const viewport = $('viewport');
const engine = new GameEngine(viewport);

let currentLevel: LevelConfig | null = null;

// ---- HUD 绑定 ----
engine.onProgress = (steps, matched, total) => {
  $('steps').textContent = String(steps);
  $('progress-bar').style.width = `${(matched / total) * 100}%`;
  $('progress-label').textContent = `${matched} / ${total} 面`;
};

engine.onWin = (steps) => {
  $('win-steps').textContent = String(steps);
  setTimeout(() => $('win-overlay').classList.remove('hidden'), 650);
};

// ---- 关卡列表 ----
const list = $('level-list');
LEVELS.forEach(lv => {
  const item = document.createElement('div');
  item.className = 'level-item';
  item.innerHTML = `
    <div class="idx">${String(lv.id).padStart(2, '0')}</div>
    <div>
      <div class="nm">${lv.name}</div>
      <div class="ds">${lv.desc}</div>
    </div>`;
  item.addEventListener('click', () => startLevel(lv));
  list.appendChild(item);
});

function startLevel(lv: LevelConfig) {
  currentLevel = lv;
  $('menu-overlay').classList.add('hidden');
  $('win-overlay').classList.add('hidden');
  $('hud-level').querySelector('.lv-name')!.textContent = lv.name;
  $('hud-level').querySelector('.lv-desc')!.textContent = lv.desc;
  const isOcta = lv.poly === 'octahedron';
  engine.loadLevel(lv);
  toast(isOcta
    ? '双击三角面旋转 120°'
    : lv.scrambleSwap
      ? '点选两片交换 · 双击旋转'
      : '双击分片旋转 90°', 'info');
}

// ---- 按钮 ----
$('btn-rotate').addEventListener('click', () => {
  if (!currentLevel) return;
  if (currentLevel.poly === 'octahedron') {
    toast('八面体关卡：直接双击三角面旋转', 'info');
  } else {
    engine.rotateSelected();
    toast('先点选一个分片，再按旋转');
  }
});

$('btn-hint').addEventListener('click', () => {
  if (!engine.applyHint()) toast('已全部归位');
});

$('btn-reset').addEventListener('click', () => {
  engine.resetLevel();
  toast('已重新打乱');
});

$('btn-menu').addEventListener('click', () => {
  $('menu-overlay').classList.remove('hidden');
});

$('btn-next').addEventListener('click', () => {
  if (!currentLevel) return;
  const next = LEVELS.find(l => l.id === currentLevel!.id + 1);
  if (next) startLevel(next);
  else {
    toast('已通关全部关卡！', 'info');
    $('menu-overlay').classList.remove('hidden');
  }
});

$('btn-back').addEventListener('click', () => {
  $('win-overlay').classList.add('hidden');
  $('menu-overlay').classList.remove('hidden');
});

// ---- toast ----
let toastTimer = 0;
function toast(msg: string, type?: 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.className = type === 'info' ? 'show info' : 'show';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

// 初始显示菜单
$('menu-overlay').classList.remove('hidden');
