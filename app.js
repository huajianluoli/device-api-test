'use strict';
/* =============================================================================
 * DSH Device API Lab（纯前端版）— 浏览器设备 API 检测
 *
 * 100% 在浏览器本地运行：没有后端、没有网络请求、没有第三方资源。
 * 直接用 file:// 打开本文件即可使用（浏览器把本地文件视为安全上下文），
 * 结果通过「导出 JSON / Markdown / 复制 / 分享码 / 本机历史」带走。
 * ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ICON = { pass: '✅', fail: '❌', warn: '⚠️', unsupported: '⛔', blocked: '🔒', info: 'ℹ️', pending: '⏳' };
const SECURE = window.isSecureContext === true;

const state = {
  results: new Map(),      // key -> {section,name,status,detail,ts}
  logs: [],
  live: {},                // 导出时附带的实时读数快照
  logEnabled: true,
};

/* --------------------------------------------------------------- 结果记录 */
function ok(detail = '可用') { return { status: 'pass', detail }; }
function no(detail = '不可用') { return { status: 'fail', detail }; }
function unsup(detail = '浏览器不支持') { return { status: 'unsupported', detail }; }
function blocked(detail = '需要 HTTPS 安全上下文，HTTP 下被浏览器禁用') { return { status: 'blocked', detail }; }
function warn(detail) { return { status: 'warn', detail }; }
function info(detail) { return { status: 'info', detail }; }

function norm(v) {
  if (v && typeof v === 'object' && typeof v.status === 'string') return v;
  if (v === true) return ok();
  if (v === false || v === undefined || v === null) return no();
  if (typeof v === 'string') return ok(v);
  if (typeof v === 'number') return ok(String(v));
  return info(JSON.stringify(v));
}

function put(section, name, status, detail) {
  if (status && typeof status === 'object') { detail = status.detail; status = status.status; }
  const key = section + '::' + name;
  const rec = { section, name, status, detail: detail === undefined ? '' : String(detail), ts: Date.now() };
  state.results.set(key, rec);
  renderRow(rec);
  updateSummary();
}

const rowEls = new Map(); // key -> 结果行元素（用 Map 复用，避免依赖 innerHTML 解析）

function rowEl(rec, key) {
  let el = rowEls.get(key);
  if (!el) {
    const host = document.getElementById('rows-' + rec.section);
    if (!host) return null;
    el = document.createElement('div');
    el.className = 'row';
    el.dataset.key = key;
    const ico = document.createElement('span');
    ico.className = 'ico';
    const name = document.createElement('span');
    name.className = 'name';
    const val = document.createElement('span');
    val.className = 'val';
    el.appendChild(ico);
    el.appendChild(name);
    el.appendChild(val);
    el._ico = ico; el._name = name; el._val = val;
    rowEls.set(key, el);
    host.appendChild(el);
  }
  el.className = 'row ' + rec.status;
  el._ico.textContent = ICON[rec.status] || rec.status;
  el._name.textContent = rec.name;
  el._val.textContent = rec.detail;
  return el;
}

function renderRow(rec) { rowEl(rec, rec.section + '::' + rec.name); }

function renderAllRows() {
  const host = $('#rows-all');
  host.innerHTML = '';
  const cnt = $('#allCount');
  if (cnt) cnt.textContent = state.results.size;
  for (const [key, rec] of state.results) {
    const el = document.createElement('div');
    el.className = 'row ' + rec.status;
    el.dataset.key = key;
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.textContent = ICON[rec.status] || rec.status;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `[${rec.section}] ${rec.name}`;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = rec.detail;
    el.appendChild(ico);
    el.appendChild(name);
    el.appendChild(val);
    host.appendChild(el);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateSummary() {
  const counts = {};
  for (const r of state.results.values()) counts[r.status] = (counts[r.status] || 0) + 1;
  const order = ['pass', 'fail', 'warn', 'unsupported', 'blocked', 'info'];
  const labels = { pass: '通过', fail: '失败', warn: '注意', unsupported: '不支持', blocked: 'HTTPS 受限', info: '信息' };
  $('#summary').innerHTML =
    `<span class="pill">共 <b>${state.results.size}</b> 项</span>` +
    order.filter((k) => counts[k]).map((k) => `<span class="pill ${k}">${ICON[k]} ${labels[k]} <b>${counts[k]}</b></span>`).join('');
  $('#badge-log').textContent = state.logs.length ? state.logs.length + ' 条事件' : '';
}

/* ------------------------------------------------------------------- 日志 */
function logLine(text, kind = '') {
  const t = new Date();
  const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
  state.logs.push(`[${ts}] ${text}`);
  if (state.logs.length > 500) state.logs.splice(0, state.logs.length - 500);
  if (!state.logEnabled) return;
  const el = document.createElement('div');
  el.innerHTML = `<span class="t">${ts}</span> <span class="${kind}">${escapeHtml(text)}</span>`;
  const box = $('#log');
  box.appendChild(el);
  while (box.childElementCount > 300) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  updateSummary();
}

/* --------------------------------------------------------------- 错误提示 */
function showError(title, msg) {
  const box = document.getElementById('errBanner');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'banner err';
  div.innerHTML = `<strong>${escapeHtml(title)}</strong> — ${escapeHtml(msg)}<br><span class="tiny">（这是页面脚本错误，请把这一行内容截图/复制反馈）</span>`;
  box.appendChild(div);
  box.dataset.hasError = '1';
}

/* --------------------------------------------------------------- 工具函数 */
function has(path) {
  try {
    let o = window;
    for (const p of path.split('.')) {
      if (o === undefined || o === null) return false;
      o = o[p];
    }
    return o !== undefined && o !== null;
  } catch { return false; }
}

/** 安全上下文受限的 API 清单：HTTP 下缺失时提示为“被限制”而不是“不支持” */
const SECURE_ONLY = [
  'MediaDevices', 'AmbientLightSensor', 'Accelerometer', 'Gyroscope', 'Magnetometer',
  'LinearAccelerationSensor', 'GravitySensor', 'AbsoluteOrientationSensor', 'RelativeOrientationSensor',
  'ProximitySensor', 'DeviceMotionEvent', 'DeviceOrientationEvent', 'Notification', 'PublicKeyCredential',
  'IdleDetector', 'EyeDropper', 'BarcodeDetector', 'FaceDetector', 'WebTransport',
];

function feat(section, name, path, note) {
  if (has(path)) return ok(note || '存在');
  const root = path.split('.')[0];
  if (!SECURE && SECURE_ONLY.includes(root)) return blocked();
  return unsup('不存在');
}

function num(v, digits = 2) {
  if (v === undefined || v === null || Number.isNaN(v)) return '–';
  return Number(v).toFixed(digits);
}

/* ------------------------------------------------------------ 环境信息表 */
function kv(table, rows) {
  const el = typeof table === 'string' ? $(table) : table;
  el.innerHTML = rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v === undefined || v === null ? '–' : escapeHtml(String(v))}</td></tr>`).join('');
}

function envSnapshot() {
  const s = window.screen || {};
  const nav = navigator;
  const uad = nav.userAgentData;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform || (uad && uad.platform),
    vendor: nav.vendor,
    appVersion: nav.appVersion,
    languages: (nav.languages || []).join(','),
    language: nav.language,
    timeZone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(),
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
    isSecureContext: SECURE,
    protocol: location.protocol,
    origin: location.origin,
    href: location.href,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    pdfViewerEnabled: nav.pdfViewerEnabled,
    onLine: nav.onLine,
    screen: `${s.width}x${s.height}`,
    availScreen: `${s.availWidth}x${s.availHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    colorDepth: s.colorDepth,
    pixelDepth: s.pixelDepth,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    userAgentData: uad ? `${uad.mobile ? '移动设备' : '桌面'} / ${uad.platform} / ${(uad.brands || []).map((b) => b.brand + ' ' + b.version).join(', ')}` : undefined,
    now: new Date().toString(),
    tzOffset: -new Date().getTimezoneOffset(),
  };
}

function fillEnv() {
  const e = envSnapshot();
  state.live.env = e;
  $('#hostInfo').textContent = `${location.host} · ${SECURE ? '安全上下文 ✅' : '非安全上下文 ⚠️'}`;
  $('#footInfo').textContent = `本机时间 ${new Date().toLocaleString('zh-CN')} · ${e.userAgentData || e.platform || ''}`;

  kv('#envTable', [
    ['用户代理 UA', e.userAgent],
    ['UA-CH', e.userAgentData],
    ['平台', e.platform],
    ['厂商', e.vendor],
    ['语言 / 时区', `${e.language} (${e.languages}) / ${e.timeZone} (UTC${e.tzOffset >= 0 ? '+' : ''}${e.tzOffset / 60})`],
    ['CPU 核心数', e.hardwareConcurrency],
    ['设备内存 (deviceMemory)', e.deviceMemory ? e.deviceMemory + ' GB' : '未暴露'],
    ['屏幕 / 可用', `${e.screen} / ${e.availScreen} @ DPR ${e.devicePixelRatio}`],
    ['颜色深度', `${e.colorDepth} bit`],
    ['视口', e.viewport],
    ['最大触控点', e.maxTouchPoints],
    ['协议 / 安全上下文', `${e.protocol} / ${e.isSecureContext ? '是' : '否'}`],
    ['页面地址', e.href],
    ['Cookie 启用 / DNT', `${e.cookieEnabled} / ${e.doNotTrack || '未设置'}`],
    ['PDF 内置查看器', e.pdfViewerEnabled],
    ['在线状态', e.onLine],
    ['页面加载时间', e.now],
  ]);

  // 屏幕参数表
  const o = (screen.orientation) || {};
  kv('#screenTable', [
    ['screen.width × height', `${screen.width} × ${screen.height}`],
    ['availWidth × availHeight', `${screen.availWidth} × ${screen.availHeight}`],
    ['devicePixelRatio', window.devicePixelRatio],
    ['物理像素（估算）', `${screen.width * window.devicePixelRatio} × ${screen.height * window.devicePixelRatio}`],
    ['colorDepth / pixelDepth', `${screen.colorDepth} / ${screen.pixelDepth}`],
    ['screen.orientation.type', o.type],
    ['screen.orientation.angle', o.angle],
    ['screen.isExtended', screen.isExtended],
    ['visualViewport', window.visualViewport ? `${num(window.visualViewport.width, 0)} × ${num(window.visualViewport.height, 0)} scale ${num(window.visualViewport.scale, 2)}` : '不支持'],
    ['屏幕亮度 API', 'screen.brightness' in screen ? String(screen.brightness) : '不存在（Android Chrome 不提供）'],
  ]);

  // 网络信息表
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  kv('#netTable', [
    ['NetworkInformation', c.effectiveType ? '支持' : '不支持'],
    ['effectiveType', c.effectiveType],
    ['downlink', c.downlink !== undefined ? c.downlink + ' Mbps' : undefined],
    ['downlinkMax', c.downlinkMax !== undefined ? c.downlinkMax + ' Mbps' : undefined],
    ['rtt', c.rtt !== undefined ? c.rtt + ' ms' : undefined],
    ['saveData', c.saveData],
    ['type', c.type],
    ['onLine', navigator.onLine],
    ['页面地址', location.href],
    ['打开方式', location.protocol === 'file:' ? '本地文件 file://（浏览器视为安全上下文）' : location.protocol === 'https:' ? 'HTTPS（安全上下文）' : 'HTTP（非安全上下文）'],
  ]);
}

/* --------------------------------------------------------------- 顶部横幅 */
function renderBanner() {
  const box = $('#ctxBanner');
  const how = location.protocol === 'file:' ? '本地文件 file://' : location.protocol === 'https:' ? 'HTTPS' : location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'localhost' : '未知';
  if (SECURE) {
    box.innerHTML = `<div class="banner ok">✅ 已在<strong>安全上下文</strong>中运行（${escapeHtml(how)}，<code>${escapeHtml(String(location.href).slice(0, 90))}</code>），
      传感器、麦克风、摄像头、剪贴板、定位等接口都可以正常申请权限。</div>`;
    return;
  }
  box.innerHTML = `<div class="banner err">
    ⚠️ 当前<strong>不是安全上下文</strong>（<code>${escapeHtml(location.origin)}</code>），
    浏览器会把下面的接口全部禁用 —— 页面里会显示成“🔒 HTTPS 受限”：
    <ul>
      <li>运动/方向传感器（加速度计、陀螺仪、磁力计）、环境光传感器</li>
      <li>麦克风（音量检测）、摄像头</li>
      <li>地理位置、剪贴板、通知、屏幕常亮 (Wake Lock)、Service Worker</li>
      <li>蓝牙 / USB / 串口 / NFC 等</li>
    </ul>
    三种解决办法（任选其一，都不需要任何后端）：
    <ul>
      <li><strong>最省事：把这个 HTML 文件下载到平板上，用浏览器直接打开本地文件</strong>（地址栏是 <code>file:///...</code>）。
          浏览器把本地文件视为安全上下文，全部接口都能用，而且完全离线。</li>
      <li>把文件放到任意<strong>静态 HTTPS 托管</strong>（GitHub Pages / Vercel / 对象存储 / 内网 nginx），用 https 打开。</li>
      <li>或在平板 Chrome 打开 <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>，
          填入 <code>${escapeHtml(location.origin)}</code>，选 <strong>Enabled</strong>，重启浏览器。</li>
    </ul>
  </div>`;
}

/* ============================================================================
 * 一、能力检测清单
 * ========================================================================== */
const CHECKS = [];
const add = (section, name, fn) => CHECKS.push([section, name, fn]);

/* ---- 运行环境 ---------------------------------------------------------- */
add('env', '安全上下文 isSecureContext', () => (SECURE ? ok('是') : blocked('否 — 大量设备接口不可用')));
add('env', '跨源隔离 crossOriginIsolated', () => (window.crossOriginIsolated ? ok('是') : warn('否（SharedArrayBuffer/高精度计时受限）')));
add('env', 'SharedArrayBuffer', () => feat('env', '', 'SharedArrayBuffer'));
add('env', 'Web Worker', () => feat('env', '', 'Worker'));
add('env', 'Intl 国际化', () => feat('env', '', 'Intl'));
add('env', 'structuredClone', () => feat('env', '', 'structuredClone'));
add('env', 'requestIdleCallback', () => feat('env', '', 'requestIdleCallback'));
add('env', 'performance.now 计时精度', () => {
  const a = performance.now(), b = performance.now();
  const granularity = (() => {
    let min = Infinity;
    for (let i = 0; i < 2000; i++) {
      const x = performance.now(), y = performance.now();
      if (y > x) min = Math.min(min, y - x);
    }
    return min;
  })();
  return ok(`粗粒度 ≈ ${granularity === Infinity ? '<0.001' : granularity.toFixed(4)} ms（越大越防侧信道追踪）`);
});
add('env', 'CSS.supports 现代特性', () => {
  const tests = {
    'grid': 'display:grid', 'flex-gap': 'gap:1rem', 'container': 'container-type:inline-size',
    'color-mix': 'color:color-mix(in srgb,red,blue)', 'oklch': 'color:oklch(50% 0.1 200)',
    'backdrop-filter': 'backdrop-filter:blur(2px)', 'aspect-ratio': 'aspect-ratio:1',
    'dvh': 'height:100dvh', 'view-transition': 'view-transition-name:x',
  };
  const yes = Object.entries(tests).filter(([, v]) => CSS.supports(v)).map(([k]) => k);
  return ok(`${yes.length}/${Object.keys(tests).length} 支持: ${yes.join(', ')}`);
});
add('env', '媒体查询偏好', () => {
  const q = (s) => (window.matchMedia(s).matches ? '✔' : '✘');
  return ok(`深色模式 ${q('(prefers-color-scheme: dark)')} | 减少动效 ${q('(prefers-reduced-motion: reduce)')} | 高对比 ${q('(prefers-contrast: more)')} | 精细指针 ${q('(pointer: fine)')} | 粗指针 ${q('(pointer: coarse)')} | 可悬停 ${q('(hover: hover)')}`);
});
add('env', '颜色色域 / 动态范围', () => {
  const q = (s) => (window.matchMedia(s).matches ? '✔' : '✘');
  return ok(`P3 广色域 ${q('(color-gamut: p3)')} | rec2020 ${q('(color-gamut: rec2020)')} | HDR ${q('(dynamic-range: high)')}`);
});
add('env', '存储配额 navigator.storage.estimate()', async () => {
  if (!navigator.storage || !navigator.storage.estimate) return unsup();
  const e = await navigator.storage.estimate();
  state.live.storage = { quota: e.quota, usage: e.usage };
  const gb = (n) => (n / 1073741824).toFixed(2) + ' GB';
  return ok(`配额 ${gb(e.quota)}，已用 ${gb(e.usage || 0)}（${((e.usage / e.quota) * 100).toFixed(2)}%）`);
});

/* ---- 运动与方向传感器 ------------------------------------------------ */
add('motion', 'DeviceMotionEvent 构造器', () => feat('motion', '', 'DeviceMotionEvent'));
add('motion', 'DeviceOrientationEvent 构造器', () => feat('motion', '', 'DeviceOrientationEvent'));
add('motion', 'ondeviceorientationabsolute', () => (('ondeviceorientationabsolute' in window) ? ok('存在（可读绝对方向/指南针）') : unsup('不存在')));
add('motion', 'DeviceMotionEvent.requestPermission', () => (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' ? ok('存在（iOS 13+ 需要显式授权）') : info('不存在（Android 无需显式授权）')));
add('motion', 'Devicemotion 事件实际到达（2.5 秒）', async () => {
  return await new Promise((resolve) => {
    if (typeof DeviceMotionEvent === 'undefined') return resolve(blocked('无 DeviceMotionEvent'));
    let n = 0, first = null;
    const h = (e) => { n++; if (!first) { first = e; } };
    window.addEventListener('devicemotion', h);
    setTimeout(() => {
      window.removeEventListener('devicemotion', h);
      if (!n) return resolve(SECURE ? no('2.5 秒内未收到任何事件（设备可能无加速度计或权限被拒）') : blocked('未收到事件：HTTP 下被浏览器拦截'));
      const iv = first && first.interval;
      const a = first && first.accelerationIncludingGravity;
      resolve(ok(`收到 ${n} 个事件 (${(n / 2.5).toFixed(1)} Hz)，interval=${iv === undefined ? '未提供' : num(iv, 2) + 'ms'}，` +
        `a=(${num(a && a.x, 2)}, ${num(a && a.y, 2)}, ${num(a && a.z, 2)})`));
    }, 2500);
  });
});
add('motion', 'Deviceorientation 事件实际到达（2.5 秒）', async () => {
  return await new Promise((resolve) => {
    if (typeof DeviceOrientationEvent === 'undefined') return resolve(blocked('无 DeviceOrientationEvent'));
    let n = 0, first = null;
    const h = (e) => { n++; if (!first) first = e; };
    window.addEventListener('deviceorientation', h);
    setTimeout(() => {
      window.removeEventListener('deviceorientation', h);
      if (!n) return resolve(SECURE ? no('2.5 秒内未收到事件') : blocked('未收到事件：HTTP 下被浏览器拦截'));
      resolve(ok(`收到 ${n} 个事件，alpha=${num(first.alpha, 1)}° beta=${num(first.beta, 1)}° gamma=${num(first.gamma, 1)}° absolute=${first.absolute}`));
    }, 2500);
  });
});
add('motion', '通用传感器：加速度计 Accelerometer', () => feat('gsensor', 'Accelerometer（线性加速度）', 'Accelerometer'));
add('motion', '通用传感器：陀螺仪 Gyroscope', () => feat('gsensor', 'Gyroscope（角速度）', 'Gyroscope'));
add('motion', '通用传感器：磁力计 Magnetometer', () => feat('gsensor', 'Magnetometer（磁场）', 'Magnetometer'));
add('motion', '通用传感器：LinearAccelerationSensor', () => feat('gsensor', 'LinearAccelerationSensor', 'LinearAccelerationSensor'));
add('motion', '通用传感器：GravitySensor', () => feat('gsensor', 'GravitySensor', 'GravitySensor'));
add('motion', '通用传感器：AbsoluteOrientationSensor', () => feat('gsensor', 'AbsoluteOrientationSensor', 'AbsoluteOrientationSensor'));
add('motion', '通用传感器：RelativeOrientationSensor', () => feat('gsensor', 'RelativeOrientationSensor', 'RelativeOrientationSensor'));
add('motion', '通用传感器：AmbientLightSensor（环境光）', () => feat('gsensor', 'AmbientLightSensor（环境光）', 'AmbientLightSensor'));
add('motion', '通用传感器：ProximitySensor（接近）', () => feat('gsensor', 'ProximitySensor（接近）', 'ProximitySensor'));

/* ---- 光线 / 亮度 ------------------------------------------------------ */
add('light', '环境光传感器 AmbientLightSensor', () => feat('light', '', 'AmbientLightSensor'));
add('light', 'screen.brightness（屏幕亮度读取）', () => (('brightness' in screen) ? ok('支持，当前 ' + screen.brightness) : unsup('不存在：Android Chrome 未开放屏幕亮度读写')));
add('light', 'navigator.screenBrightness', () => (('screenBrightness' in navigator) ? ok(String(navigator.screenBrightness)) : unsup('不存在')));
add('light', 'window.screenBrightness', () => (('screenBrightness' in window) ? ok(String(window.screenBrightness)) : unsup('不存在')));
add('light', '屏幕亮度可由网页调节（setBrightness 类）', () => unsup('标准 Web 平台没有该接口（只有部分定制 WebView/ChromeOS 私有扩展）'));
add('light', '摄像头测光替代方案可用性', () => (has('navigator.mediaDevices.getUserMedia') ? (SECURE ? ok('可用（用后置摄像头估算环境亮度）') : blocked()) : unsup()));
add('light', '环境光媒体查询（prefers-color-scheme）', () => ok('可用于跟随系统深浅色，但不提供照度数值'));

/* ---- 音频 / 音量 ------------------------------------------------------ */
add('audio', 'AudioContext', () => feat('audio', '', 'AudioContext'));
add('audio', 'OfflineAudioContext', () => feat('audio', '', 'OfflineAudioContext'));
add('audio', 'AudioWorklet', () => (has('AudioContext') && !!(window.AudioContext.prototype && 'audioWorklet' in AudioContext.prototype) ? ok() : unsup()));
add('audio', 'HTMLMediaElement.volume 可写', () => {
  const a = document.createElement('audio');
  a.volume = 0.33;
  return Math.abs(a.volume - 0.33) < 0.01 ? ok('可写（页面内音量，非系统音量）') : no('不可写');
});
add('audio', 'HTMLMediaElement.muted', () => ok('支持静音属性'));
add('audio', 'navigator.audioSession（音量会话语义）', () => (('audioSession' in navigator) ? ok('存在，type=' + navigator.audioSession.type) : unsup('不存在（系统音量对网页不可见）')));
add('audio', '读取系统音量 / 硬件音量键', () => unsup('Web 平台不提供；音量键通常也不会传给网页（可用下方“硬件音量键监听”实测）'));
add('audio', '麦克风 getUserMedia(audio)', () => (has('navigator.mediaDevices.getUserMedia') ? (SECURE ? ok('可用') : blocked()) : unsup()));
add('audio', 'AnalyserNode 频谱/电平分析', () => (has('AudioContext') ? ok('可用（用于 dBFS 音量表）') : unsup()));
add('audio', 'MediaRecorder', () => feat('audio', '', 'MediaRecorder'));
add('audio', '音频输出设备枚举', () => (has('navigator.mediaDevices.enumerateDevices') ? ok('enumerateDevices 可用（audiooutput 数量需授权后可见）') : unsup()));
add('audio', '语音合成 SpeechSynthesis', () => feat('audio', '', 'speechSynthesis'));
add('audio', '语音识别 webkitSpeechRecognition', () => ((('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window)) ? ok() : unsup()));
add('audio', '音频解码 audio/mpeg', () => {
  const el = document.createElement('audio');
  if (typeof el.canPlayType !== 'function') return unsup('该浏览器没有 canPlayType()');
  const r = el.canPlayType('audio/mpeg; codecs="mp3"');
  return r ? ok('支持 (' + r + ')') : unsup();
});

/* ---- 屏幕 / 显示 ------------------------------------------------------ */
add('screen', 'screen.orientation + lock()', () => {
  if (!screen.orientation) return unsup();
  return ok(`type=${screen.orientation.type} angle=${screen.orientation.angle}${typeof screen.orientation.lock === 'function' ? '，支持 lock()' : '，无 lock()'}`);
});
add('screen', 'Fullscreen API', () => (document.fullscreenEnabled ? ok('可用（fullscreenEnabled=true）') : warn('不可用（可能被 iframe 策略或权限限制）')));
add('screen', 'Screen Wake Lock（屏幕常亮）', () => (has('navigator.wakeLock') ? (SECURE ? ok('可用') : blocked()) : unsup()));
add('screen', 'visibilityState 页面可见性', () => ok(`当前 ${document.visibilityState}，支持 visibilitychange`));
add('screen', '检测屏幕亮度', () => unsup('无标准 API；用下方“亮度测试卡”人工判断，或用摄像头测光估算环境光'));
add('screen', '调整屏幕亮度', () => unsup('无标准 API；只能由系统设置/快捷开关调节'));
add('screen', 'DevicePosture（折叠形态）', () => (has('navigator.devicePosture') ? ok() : unsup()));
add('screen', 'CSS 视口单位 dvh/lvh', () => (CSS.supports('height:100dvh') ? ok() : unsup()));

/* ---- 网络 ------------------------------------------------------------- */
add('network', 'fetch / Request / Response / AbortController', () => (has('fetch') && has('Request') && has('AbortController') ? ok() : unsup()));
add('network', 'navigator.connection（NetworkInformation）', () => {
  const c = navigator.connection || navigator.webkitConnection;
  return c ? ok(`effectiveType=${c.effectiveType} downlink=${c.downlink}Mbps rtt=${c.rtt}ms saveData=${c.saveData} type=${c.type}`) : unsup('不存在（Android Chrome 通常支持）');
});
add('network', 'WebSocket', () => feat('network', '', 'WebSocket'));
add('network', 'Server-Sent Events (EventSource)', () => feat('network', '', 'EventSource'));
add('network', 'WebTransport', () => feat('network', '', 'WebTransport'));
add('network', 'navigator.sendBeacon', () => feat('network', '', 'navigator.sendBeacon'));
add('network', 'WebRTC RTCPeerConnection', () => feat('network', '', 'RTCPeerConnection'));
add('network', 'Service Worker', () => (has('navigator.serviceWorker') ? (SECURE ? ok() : blocked()) : unsup()));
add('network', 'Streams / ReadableStream', () => feat('network', '', 'ReadableStream'));
add('network', 'CompressionStream', () => feat('network', '', 'CompressionStream'));
add('network', 'Cache Storage', () => (has('caches') ? (SECURE ? ok() : blocked()) : unsup()));
add('network', '页面加载性能（Navigation Timing）', () => {
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (!nav) return unsup('拿不到 navigation timing');
  state.live.pageLoad = { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd || performance.now()), ttfb: Math.round(nav.responseStart) };
  return ok(`TTFB ${Math.round(nav.responseStart)}ms，DOMContentLoaded ${Math.round(nav.domContentLoadedEventEnd)}ms，load ${Math.round(nav.loadEventEnd || performance.now())}ms，传输 ${(nav.transferSize / 1024).toFixed(1)}KB`);
});

/* ---- 输入 ------------------------------------------------------------- */
add('input', 'TouchEvent / 触摸支持', () => (('ontouchstart' in window) || navigator.maxTouchPoints > 0 ? ok(`支持，maxTouchPoints=${navigator.maxTouchPoints}`) : unsup('无触摸支持')));
add('input', 'PointerEvent', () => feat('input', '', 'PointerEvent'));
add('input', '多点触控（multi-touch）', () => (navigator.maxTouchPoints >= 2 ? ok(`最多 ${navigator.maxTouchPoints} 点同时触控`) : warn(`maxTouchPoints=${navigator.maxTouchPoints}`)));
add('input', 'Touch.pressure / radius（压感与触点面积）', () => ok('取决于触屏固件，部分平板恒为 0'));
add('input', 'KeyboardEvent / Keyboard API', () => (has('navigator.keyboard') ? ok('navigator.keyboard.getLayoutMap 可用') : ok('KeyboardEvent 可用，navigator.keyboard 不存在')));
add('input', '虚拟键盘 navigator.virtualKeyboard', () => (has('navigator.virtualKeyboard') ? ok() : unsup('不存在')));
add('input', 'Gamepad API', () => feat('input', '', 'Gamepad'));
add('input', '剪贴板事件 copy/paste', () => ok('支持（需 safe 上下文才可读写内容）'));
add('input', '鼠标 hover 能力', () => (window.matchMedia('(hover: hover)').matches ? ok('支持悬停') : warn('不支持悬停（纯触屏）')));

/* ---- 摄像头 / 媒体 ---------------------------------------------------- */
add('media', 'getUserMedia', () => (has('navigator.mediaDevices.getUserMedia') ? (SECURE ? ok() : blocked()) : unsup()));
add('media', 'getDisplayMedia（屏幕共享）', () => (has('navigator.mediaDevices.getDisplayMedia') ? (SECURE ? ok() : blocked()) : unsup()));
add('media', 'enumerateDevices', () => (has('navigator.mediaDevices.enumerateDevices') ? ok() : unsup()));
add('media', 'ImageCapture', () => (has('ImageCapture') ? ok('可用于拍照/torch/缩放') : unsup()));
add('media', 'MediaStreamTrack.getCapabilities（torch/zoom）', () => ok('运行时探测（见摄像头面板）'));
add('media', 'requestVideoFrameCallback', () => (has('HTMLVideoElement') && 'requestVideoFrameCallback' in HTMLVideoElement.prototype ? ok() : unsup()));
add('media', 'canvas.captureStream()', () => {
  try { const c = document.createElement('canvas'); return typeof c.captureStream === 'function' ? ok() : unsup(); } catch { return unsup(); }
});
add('media', 'MediaSource / MSE', () => feat('media', '', 'MediaSource'));
add('media', 'WebCodecs VideoDecoder', () => feat('media', '', 'VideoDecoder'));
add('media', 'MediaCapabilities', () => feat('media', '', 'navigator.mediaCapabilities'));
add('media', 'Picture-in-Picture', () => (document.pictureInPictureEnabled ? ok() : unsup('不支持')));
add('media', 'MediaSession（媒体控制中心）', () => feat('media', '', 'navigator.mediaSession'));
add('media', 'BarcodeDetector（条码/二维码）', () => feat('media', '', 'BarcodeDetector'));
add('media', 'FaceDetector', () => feat('media', '', 'FaceDetector'));

/* ---- 存储 ------------------------------------------------------------- */
add('storage', 'localStorage 读写', () => {
  try {
    const k = '__test_' + Date.now();
    localStorage.setItem(k, 'v');
    const v = localStorage.getItem(k);
    localStorage.removeItem(k);
    return v === 'v' ? ok('可读可写') : no('写入后读不到');
  } catch (e) { return no('异常: ' + e.message); }
});
add('storage', 'sessionStorage', () => (has('sessionStorage') ? ok() : unsup()));
add('storage', 'IndexedDB', async () => {
  if (!has('indexedDB')) return unsup();
  return await new Promise((resolve) => {
    const req = indexedDB.open('__dsh_test__', 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('t')) db.createObjectStore('t'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('t', 'readwrite');
      tx.objectStore('t').put({ hello: 'world' }, 'k');
      tx.oncomplete = () => { db.close(); indexedDB.deleteDatabase('__dsh_test__'); resolve(ok('可打开、可读写（已清理测试库）')); };
      tx.onerror = () => { db.close(); resolve(no('事务失败: ' + (tx.error && tx.error.message))); };
    };
    req.onerror = () => resolve(no('打开失败: ' + (req.error && req.error.message)));
    setTimeout(() => resolve(warn('超时未响应')), 4000);
  });
});
add('storage', 'indexedDB.databases()', async () => {
  if (!has('indexedDB')) return unsup('没有 indexedDB');
  if (!indexedDB.databases) return unsup();
  const dbs = await indexedDB.databases();
  return ok(`共 ${dbs.length} 个库: ${dbs.map((d) => d.name + ' v' + d.version).join(', ') || '（空）'}`);
});
add('storage', 'Cache Storage', () => (has('caches') ? (SECURE ? ok() : blocked()) : unsup()));
add('storage', 'navigator.storage.persist()（持久化）', () => (has('navigator.storage.persist') ? ok('可请求持久化存储') : unsup()));
add('storage', 'File System Access (showOpenFilePicker)', () => (has('showOpenFilePicker') ? ok() : unsup('不存在（Android Chrome 支持有限）')));
add('storage', 'Origin Private File System (OPFS)', () => (has('navigator.storage.getDirectory') ? ok() : unsup()));
add('storage', 'File / Blob / FileReader', () => (has('File') && has('Blob') && has('FileReader') ? ok() : unsup()));
add('storage', 'WebSQL', () => (has('openDatabase') ? ok('存在（已废弃）') : unsup('已移除')));

/* ---- 现代 API / 权限 -------------------------------------------------- */
add('modern', 'Notification API', () => (has('Notification') ? (SECURE ? ok('权限: ' + Notification.permission) : blocked()) : unsup()));
add('modern', 'Permissions API', () => (has('navigator.permissions.query') ? ok('可查询') : unsup()));
add('modern', 'Clipboard API (read/write)', () => (has('navigator.clipboard.writeText') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'ClipboardItem', () => (has('ClipboardItem') ? ok() : unsup()));
add('modern', 'Web Share API', () => (has('navigator.share') ? ok('可调用系统分享' + (navigator.canShare ? '，支持文件分享检测' : '')) : unsup()));
add('modern', 'Vibration API（震动）', () => (has('navigator.vibrate') ? ok('可用') : unsup('不支持（多数 iOS/桌面无）')));
add('modern', 'Battery Status API', () => (has('navigator.getBattery') ? ok() : unsup('不存在（Chrome 已对部分平台移除）')));
add('modern', 'Geolocation API', () => (has('navigator.geolocation') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'WebAuthn PublicKeyCredential', () => (has('PublicKeyCredential') ? (SECURE ? ok('支持指纹/人脸/PIN 认证') : blocked()) : unsup()));
add('modern', 'Credential Management API', () => (has('navigator.credentials') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'Web Bluetooth', () => (has('navigator.bluetooth') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'Web USB', () => (has('navigator.usb') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'Web Serial', () => (has('navigator.serial') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'WebHID', () => (has('navigator.hid') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'Web NFC', () => (has('NDEFReader') ? (SECURE ? ok() : blocked()) : unsup('不存在（Android Chrome 需开 flag）')));
add('modern', 'Idle Detection', () => (has('IdleDetector') ? (SECURE ? ok() : blocked()) : unsup()));
add('modern', 'Payment Request', () => (has('PaymentRequest') ? ok() : unsup()));
add('modern', 'Web Locks / BroadcastChannel', () => (has('navigator.locks') && has('BroadcastChannel') ? ok() : unsup()));
add('modern', 'Contact Picker', () => (has('navigator.contacts') ? ok() : unsup()));
add('modern', 'EyeDropper（取色器）', () => (has('EyeDropper') ? ok() : unsup()));
add('modern', 'ReportingObserver', () => (has('ReportingObserver') ? ok() : unsup()));
add('modern', 'Observer 三件套（Intersection/Resize/Mutation）', () => (has('IntersectionObserver') && has('ResizeObserver') && has('MutationObserver') ? ok() : unsup()));
add('modern', 'scheduler.postTask', () => (has('scheduler.postTask') ? ok() : unsup()));
add('modern', '存储访问 API（Storage Access）', () => (has('document.hasStorageAccess') ? ok() : unsup()));

/* ---- 图形 / 性能 ------------------------------------------------------ */
add('graphics', 'Canvas 2D', () => {
  try { return document.createElement('canvas').getContext('2d') ? ok() : no('getContext("2d") 返回空'); } catch (e) { return no(e.message); }
});
add('graphics', 'WebGL', () => {
  try { return document.createElement('canvas').getContext('webgl') ? ok() : unsup('无 WebGL'); } catch { return unsup(); }
});
add('graphics', 'WebGL2', () => {
  try { return document.createElement('canvas').getContext('webgl2') ? ok() : unsup('无 WebGL2'); } catch { return unsup(); }
});
add('graphics', 'WebGPU', async () => {
  if (!navigator.gpu) return unsup('navigator.gpu 不存在');
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return warn('存在 navigator.gpu 但没有可用适配器');
    let info = '';
    try { const ai = a.info || (a.requestAdapterInfo && (await a.requestAdapterInfo())); if (ai) info = ` [${ai.vendor || ''} ${ai.architecture || ''} ${ai.description || ''}]`; } catch {}
    return ok('可用' + info);
  } catch (e) { return no(e.message); }
});
add('graphics', 'OffscreenCanvas', () => feat('graphics', '', 'OffscreenCanvas'));
add('graphics', 'WebAssembly', () => (typeof WebAssembly === 'object' ? ok('支持' + (WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])) ? '' : '（异常）')) : unsup()));
add('graphics', 'createImageBitmap', () => feat('graphics', '', 'createImageBitmap'));
add('graphics', 'ImageDecoder', () => feat('graphics', '', 'ImageDecoder'));
add('graphics', 'WebXR navigator.xr', () => (has('navigator.xr') ? ok() : unsup()));
add('graphics', '性能内存 performance.memory', () => (performance.memory ? ok(`已用 ${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB / 上限 ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB`) : unsup('未暴露')));
add('graphics', '图片格式支持', async () => {
  const c = document.createElement('canvas'); c.width = c.height = 2;
  let webp = false;
  try { webp = c.toDataURL('image/webp').startsWith('data:image/webp'); } catch {}
  const supported = async (type) => {
    if (window.ImageDecoder && ImageDecoder.isTypeSupported) {
      try { return await ImageDecoder.isTypeSupported(type); } catch { return null; }
    }
    return null;
  };
  const avif = await supported('image/avif');
  const jxl = await supported('image/jxl');
  const mark = (v) => (v === null ? '?' : v ? '✔' : '✘');
  return ok(`WebP ${mark(webp)} | AVIF ${mark(avif)} | JPEG XL ${mark(jxl)} | PNG/GIF/JPEG/BMP ✔（? = 无法探测）`);
});

/* ---- 媒体格式 -------------------------------------------------------- */
const CODECS = [
  ['video/mp4; codecs="avc1.42E01E"', 'H.264 Baseline MP4'],
  ['video/mp4; codecs="avc1.64001F"', 'H.264 High MP4'],
  ['video/mp4; codecs="hev1.1.6.L93.B0"', 'HEVC / H.265'],
  ['video/mp4; codecs="av01.0.05M.08"', 'AV1'],
  ['video/webm; codecs="vp8"', 'VP8 WebM'],
  ['video/webm; codecs="vp9"', 'VP9 WebM'],
  ['video/webm; codecs="av01.0.05M.08"', 'AV1 WebM'],
  ['video/3gpp', '3GPP'],
  ['application/x-mpegURL', 'HLS (m3u8)'],
  ['application/dash+xml', 'MPEG-DASH'],
  ['audio/mpeg', 'MP3'],
  ['audio/mp4; codecs="mp4a.40.2"', 'AAC (MP4)'],
  ['audio/ogg; codecs="vorbis"', 'Ogg Vorbis'],
  ['audio/ogg; codecs="opus"', 'Opus (Ogg)'],
  ['audio/webm; codecs="opus"', 'Opus (WebM)'],
  ['audio/flac', 'FLAC'],
  ['audio/wav; codecs="1"', 'WAV/PCM'],
  ['audio/aac', 'AAC 原生'],
];
function checkCodecs() {
  const v = document.createElement('video');
  for (const [type, label] of CODECS) {
    let r = '';
    try { r = v.canPlayType(type); } catch { r = ''; }
    const status = r === 'probably' ? 'pass' : r === 'maybe' ? 'warn' : 'unsupported';
    const text = r === 'probably' ? '很可能支持 (probably)' : r === 'maybe' ? '可能支持 (maybe)' : '不支持';
    put('codec', label, { status, detail: text + ' — ' + type });
  }
}

/* ------------------------------------------------------------------- 全量运行 */
async function runAll() {
  const btn = $('#btnRun');
  btn.disabled = true;
  const total = CHECKS.length;
  let i = 0;
  logLine(`开始运行全部检测（共 ${total} 项）`, 'ev');
  for (const [section, name, fn] of CHECKS) {
    i++;
    btn.textContent = `⏳ 检测中 ${i}/${total}`;
    try {
      let v = fn();
      if (v && typeof v.then === 'function') v = await v;
      const r = norm(v);
      put(section, name, r.status, r.detail);
    } catch (e) {
      put(section, name, 'fail', '异常: ' + (e && e.message ? e.message : e));
    }
  }
  updateGpuTable();
  renderAllRows();
  updateSummary();
  btn.disabled = false;
  btn.textContent = '▶ 运行全部检测';
  const counts = {};
  for (const r of state.results.values()) counts[r.status] = (counts[r.status] || 0) + 1;
  logLine(`检测完成：通过 ${counts.pass || 0}，失败 ${counts.fail || 0}，不支持 ${counts.unsupported || 0}，HTTPS 受限 ${counts.blocked || 0}`, 'ev');
}

function updateGpuTable() {
  const rows = [];
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      rows.push(['WebGL 版本', gl.getParameter(gl.VERSION)]);
      rows.push(['WebGL GLSL', gl.getParameter(gl.SHADING_LANGUAGE_VERSION)]);
      rows.push(['GPU 厂商', dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)]);
      rows.push(['GPU 型号', dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)]);
      rows.push(['最大纹理尺寸', gl.getParameter(gl.MAX_TEXTURE_SIZE)]);
      rows.push(['最大渲染缓冲', gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)]);
      const exts = gl.getSupportedExtensions() || [];
      rows.push(['扩展数量', exts.length + ' 个']);
      rows.push(['关键扩展', ['EXT_color_buffer_float', 'OES_texture_float', 'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_debug_renderer_info', 'EXT_disjoint_timer_query_webgl2'].map((e) => e.replace('WEBGL_', 'W_').replace('_webgl2', '') + (exts.includes(e) ? '✔' : '✘')).join(' ')]);
      rows.push(['抗锯齿样本', gl.getParameter(gl.SAMPLES)]);
      rows.push(['可用显存(估)', (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(gl.MAX_VIEWPORT_DIMS).join(' × '); })()]);
    } else rows.push(['WebGL', '不可用']);
  } catch (e) { rows.push(['错误', e.message]); }
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    rows.push(['音频采样率', ac.sampleRate + ' Hz']);
    if (ac.baseLatency !== undefined) rows.push(['音频基础延迟', (ac.baseLatency * 1000).toFixed(1) + ' ms']);
    if (ac.outputLatency !== undefined) rows.push(['音频输出延迟', (ac.outputLatency * 1000).toFixed(1) + ' ms']);
    if (ac.destination && ac.destination.maxChannelCount) rows.push(['最大声道数', ac.destination.maxChannelCount]);
    ac.close();
  } catch { /* ignore */ }
  rows.push(['硬件并发', navigator.hardwareConcurrency + ' 核']);
  kv('#gpuTable', rows);
}

/* ============================================================================
 * 二、交互式测试部件
 * ========================================================================== */

/* ---------------------------------------------------------- 运动传感器面板 */
const motion = {
  active: false,
  samples: [],
  peakAcc: 0,
  peakRot: 0,
  count: 0,
  lastTs: 0,
  handlerM: null,
  handlerO: null,
  raf: null,
};

function setBar(id, value, max, bipolar) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = Math.max(-max, Math.min(max, value || 0));
  if (bipolar) {
    const pct = Math.min(50, (Math.abs(v) / max) * 50);
    el.style.width = pct * 2 + '%';
    el.style.marginLeft = v < 0 ? 50 - pct * 2 + '%' : '50%';
  } else {
    el.style.width = Math.max(0, Math.min(100, (v / max) * 100)) + '%';
  }
}

function startMotion() {
  if (motion.active) return;
  motion.active = true;
  motion.samples = [];
  motion.peakAcc = 0;
  motion.peakRot = 0;
  motion.count = 0;
  $('#motionState').textContent = '监听中 …';
  $('#btnMotion').classList.add('on');

  motion.handlerM = (e) => {
    motion.count++;
    const a = e.accelerationIncludingGravity || {};
    const r = e.rotationRate || {};
    const now = performance.now();
    if (motion.lastTs) {
      const hz = 1000 / (now - motion.lastTs);
      $('#accHz').textContent = num(hz, 1);
    }
    motion.lastTs = now;
    if (a.x !== null && a.x !== undefined) {
      $('#accX').textContent = num(a.x, 2);
      $('#accY').textContent = num(a.y, 2);
      $('#accZ').textContent = num(a.z, 2);
      setBar('accXb', a.x, 20, true);
      setBar('accYb', a.y, 20, true);
      setBar('accZb', a.z, 20, true);
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      $('#accMag').textContent = num(mag, 2);
      motion.peakAcc = Math.max(motion.peakAcc, mag);
      $('#accPeak').textContent = num(motion.peakAcc, 2);
      state.live.acceleration = { x: a.x, y: a.y, z: a.z, magnitude: +mag.toFixed(3) };
      motion.samples.push({ t: now, x: a.x, y: a.y, z: a.z });
      if (motion.samples.length > 1200) motion.samples.splice(0, 400);
    }
    const rr = [r.alpha, r.beta, r.gamma];
    $('#rotA').textContent = num(r.alpha, 1);
    $('#rotB').textContent = num(r.beta, 1);
    $('#rotG').textContent = num(r.gamma, 1);
    const rmax = Math.max(...rr.map((v) => Math.abs(v || 0)));
    motion.peakRot = Math.max(motion.peakRot, rmax);
    $('#rotPeak').textContent = num(motion.peakRot, 1);
    state.live.rotationRate = { alpha: r.alpha, beta: r.beta, gamma: r.gamma };
  };

  motion.handlerO = (e) => {
    $('#oriA').textContent = num(e.alpha, 1);
    $('#oriB').textContent = num(e.beta, 1);
    $('#oriG').textContent = num(e.gamma, 1);
    $('#oriAbs').textContent = e.absolute === true ? '绝对' : e.absolute === false ? '相对' : '未提供';
    if (e.webkitCompassHeading !== undefined) $('#oriCompass').textContent = num(e.webkitCompassHeading, 1) + '°';
    state.live.orientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: e.absolute };
  };

  window.addEventListener('devicemotion', motion.handlerM);
  window.addEventListener('deviceorientation', motion.handlerO);
  window.addEventListener('deviceorientationabsolute', motion.handlerO);
  logLine('开始监听 devicemotion / deviceorientation', 'ev');
  drawAccChart();
}

function stopMotion() {
  if (!motion.active) return;
  motion.active = false;
  window.removeEventListener('devicemotion', motion.handlerM);
  window.removeEventListener('deviceorientation', motion.handlerO);
  window.removeEventListener('deviceorientationabsolute', motion.handlerO);
  if (motion.raf) cancelAnimationFrame(motion.raf);
  motion.raf = null;
  $('#motionState').textContent = `已停止（共收到 ${motion.count} 个运动事件）`;
  $('#btnMotion').classList.remove('on');
  logLine(`停止监听传感器，共 ${motion.count} 个事件`, 'ev');
}

function drawAccChart() {
  const cv = $('#accChart');
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  };
  resize();
  const loop = () => {
    if (!motion.active) return;
    if (cv.width !== cv.clientWidth * dpr) resize();
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#1b2230';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke();
    }
    const now = performance.now();
    const windowMs = 6000;
    const pts = motion.samples.filter((s) => now - s.t <= windowMs);
    const colors = { x: '#ff6b6b', y: '#4c9aff', z: '#2ecc71' };
    for (const axis of ['x', 'y', 'z']) {
      ctx.beginPath();
      pts.forEach((s, idx) => {
        const px = w - ((now - s.t) / windowMs) * w;
        const scale = h / 40; // ±20 m/s²
        const py = h / 2 - (s[axis] || 0) * scale;
        idx ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = colors[axis];
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }
    ctx.fillStyle = '#8b98a8';
    ctx.font = `${11 * dpr}px monospace`;
    ctx.fillText('x 红  y 蓝  z 绿   ±20 m/s²', 8 * dpr, 14 * dpr);
    motion.raf = requestAnimationFrame(loop);
  };
  loop();
}

async function requestMotionPermission() {
  const out = [];
  for (const Ctor of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
    if (!Ctor) { out.push('构造器不存在'); continue; }
    if (typeof Ctor.requestPermission === 'function') {
      try { out.push(Ctor.name + ': ' + (await Ctor.requestPermission())); }
      catch (e) { out.push(Ctor.name + ' 失败: ' + e.message); }
    } else out.push(Ctor.name + ': 无需授权');
  }
  put('motion', 'requestPermission 调用结果', 'info', out.join(' | '));
  logLine('请求传感器权限: ' + out.join(' | '), 'ev');
}

/* ------------------------------------------------------------- 环境光传感器 */
function startLux() {
  if (!window.AmbientLightSensor) {
    const d = SECURE ? '浏览器未实现 AmbientLightSensor（Chrome 需 chrome://flags/#enable-generic-sensor-extra-classes）' : '需要 HTTPS 安全上下文';
    $('#luxNote').textContent = d;
    put('light', 'AmbientLightSensor 启动结果', SECURE ? 'unsupported' : 'blocked', d);
    return;
  }
  try {
    const s = new AmbientLightSensor({ frequency: 5 });
    let n = 0;
    const t0 = performance.now();
    s.addEventListener('reading', () => {
      n++;
      $('#luxVal').textContent = num(s.illuminance, 1);
      $('#luxHz').textContent = num((n / ((performance.now() - t0) / 1000)), 1) + ' Hz';
      state.live.illuminance = s.illuminance;
    });
    s.addEventListener('error', (e) => {
      $('#luxNote').textContent = '错误: ' + (e.error && e.error.message);
      put('light', 'AmbientLightSensor 启动结果', 'fail', (e.error && e.error.message) || '未知错误');
    });
    s.start();
    $('#luxNote').textContent = '已启动，遮住/照亮屏幕上方感应区观察数值变化';
    put('light', 'AmbientLightSensor 启动结果', 'pass', '已启动，正在读取照度');
    logLine('AmbientLightSensor 已启动', 'ev');
  } catch (e) {
    $('#luxNote').textContent = '启动失败: ' + e.message;
    put('light', 'AmbientLightSensor 启动结果', 'fail', e.message);
  }
}

/* ----------------------------------------------------------- 摄像头测光 */
const camMeter = { stream: null, timer: null, canvas: null };

async function startCamMeter() {
  if (camMeter.stream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    camMeter.stream = stream;
    const v = document.createElement('video');
    v.srcObject = stream;
    v.muted = true;
    v.playsInline = true;
    await v.play();
    camMeter.video = v;
    camMeter.canvas = document.createElement('canvas');
    camMeter.canvas.width = 32;
    camMeter.canvas.height = 24;
    camMeter.ctx = camMeter.canvas.getContext('2d', { willReadFrequently: true });
    const face = stream.getVideoTracks()[0].getSettings().facingMode || 'environment';
    logLine(`摄像头测光已启动（${face}）`, 'ev');
    put('light', '摄像头测光', 'pass', '运行中，正在估算环境亮度');
    camMeter.timer = setInterval(() => {
      try {
        camMeter.ctx.drawImage(camMeter.video, 0, 0, 32, 24);
        const d = camMeter.ctx.getImageData(0, 0, 32, 24).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const lum = sum / (d.length / 4);
        const luxEst = Math.pow(lum / 255, 2.2) * 20000; // 粗略经验换算
        $('#camLum').textContent = num(lum, 1);
        $('#camLuxEst').textContent = luxEst < 1 ? '<1' : num(luxEst, 0);
        setBar('camLumBar', lum, 255, false);
        const label = luxEst < 5 ? '很暗（夜间/遮挡）' : luxEst < 60 ? '昏暗室内' : luxEst < 500 ? '正常室内' : luxEst < 5000 ? '明亮 / 阴天室外' : '强光 / 直射阳光';
        $('#camLightLabel').textContent = label;
        state.live.cameraLuminance = { raw: +lum.toFixed(1), estimatedLux: Math.round(luxEst), label };
      } catch (e) { /* 忽略单帧错误 */ }
    }, 250);
  } catch (e) {
    put('light', '摄像头测光', 'fail', '无法打开摄像头: ' + (e.name || '') + ' ' + e.message);
    logLine('摄像头测光失败: ' + e.message, 'er');
  }
}

function stopCamMeter() {
  if (camMeter.timer) clearInterval(camMeter.timer);
  camMeter.timer = null;
  if (camMeter.stream) camMeter.stream.getTracks().forEach((t) => t.stop());
  camMeter.stream = null;
  put('light', '摄像头测光', 'info', '已停止');
}

/* ------------------------------------------------------------- 亮度测试卡 */
function showBright(spec) {
  const stage = $('#brightStage');
  if (spec === 'close') { stage.innerHTML = ''; return; }
  if (spec === 'ramp') {
    stage.innerHTML = '<div class="ramp">' + Array.from({ length: 16 }, (_, i) => {
      const v = Math.round((i / 15) * 255);
      const c = `rgb(${v},${v},${v})`;
      return `<div style="background:${c}"></div>`;
    }).join('') + '</div>';
    return;
  }
  const [r, g, b] = spec.split(',').map(Number);
  stage.innerHTML = `<div class="brightcard" style="background:rgb(${r},${g},${b});color:${r > 128 ? '#333' : '#999'}">rgb(${r},${g},${b}) — 用系统亮度滑块对比观察</div>`;
}

/* ------------------------------------------------------------- 扬声器测试 */
const tone = { ctx: null, osc: null, gain: null, sweep: false };

function ensureAudio() {
  if (!tone.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('浏览器不支持 AudioContext');
    tone.ctx = new AC();
  }
  if (tone.ctx.state === 'suspended') tone.ctx.resume();
  return tone.ctx;
}

function playTone(freq, vol) {
  const ctx = ensureAudio();
  stopTone(true);
  tone.osc = ctx.createOscillator();
  tone.gain = ctx.createGain();
  tone.osc.type = 'sine';
  tone.osc.frequency.value = freq;
  tone.gain.gain.value = vol;
  tone.osc.connect(tone.gain).connect(ctx.destination);
  tone.osc.start();
  $('#spkCh').textContent = ctx.destination.channelCount;
  $('#spkRate').textContent = ctx.sampleRate;
  if (ctx.baseLatency !== undefined) $('#spkLat').textContent = num((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000, 1);
  logLine(`播放测试音 ${freq}Hz，音量 ${(vol * 100).toFixed(0)}%`, 'ev');
}

function stopTone(keepSilent) {
  if (tone.osc) { try { tone.osc.stop(); } catch {} tone.osc.disconnect(); tone.osc = null; }
  if (tone.gain) { tone.gain.disconnect(); tone.gain = null; }
  if (!keepSilent) logLine('停止播放', 'ev');
}

function playSweep(vol) {
  const ctx = ensureAudio();
  stopTone(true);
  tone.osc = ctx.createOscillator();
  tone.gain = ctx.createGain();
  tone.osc.type = 'sine';
  tone.gain.gain.value = vol;
  const t0 = ctx.currentTime;
  tone.osc.frequency.setValueAtTime(20, t0);
  tone.osc.frequency.exponentialRampToValueAtTime(18000, t0 + 12);
  tone.osc.connect(tone.gain).connect(ctx.destination);
  tone.osc.start();
  tone.osc.stop(t0 + 12);
  logLine('播放 20Hz → 18kHz 对数扫频（12 秒）', 'ev');
  put('audio', '对数扫频播放', 'info', '已开始，注意听各频段是否都能出声');
}

/* --------------------------------------------------------------- 麦克风音量 */
const mic = { stream: null, ctx: null, analyser: null, buf: null, raf: null, peak: -Infinity, sum: 0, n: 0, lastLog: 0 };

async function startMic() {
  if (mic.stream) return;
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    put('audio', '麦克风权限', 'fail', `${e.name}: ${e.message}`);
    logLine('麦克风授权失败: ' + e.message, 'er');
    return;
  }
  const track = mic.stream.getAudioTracks()[0];
  const st = track.getSettings ? track.getSettings() : {};
  $('#micDevice').textContent = (track.label || '未知') + (st.sampleRate ? ` @${st.sampleRate}Hz` : '');
  mic.ctx = ensureAudio();
  const src = mic.ctx.createMediaStreamSource(mic.stream);
  mic.analyser = mic.ctx.createAnalyser();
  mic.analyser.fftSize = 2048;
  mic.analyser.smoothingTimeConstant = 0.2;
  src.connect(mic.analyser);
  mic.buf = new Float32Array(mic.analyser.fftSize);
  mic.peak = -Infinity; mic.sum = 0; mic.n = 0;
  put('audio', '麦克风权限', 'pass', '已授权，正在实时测量环境音量');
  logLine('麦克风已开启，开始测量环境音量', 'ev');
  const loop = () => {
    if (!mic.analyser) return;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < mic.buf.length; i++) { const v = mic.buf[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    const rms = Math.sqrt(sum / mic.buf.length);
    const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;
    const clamped = Math.max(-100, Math.min(0, dbfs));
    mic.peak = Math.max(mic.peak, clamped);
    mic.sum += clamped; mic.n++;
    $('#micDb').textContent = num(clamped, 1);
    $('#micPeak').textContent = num(mic.peak, 1);
    $('#micAvg').textContent = num(mic.sum / mic.n, 1);
    const pct = ((clamped + 100) / 100) * 100;
    $('#micBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('#micBarTxt').textContent = num(clamped, 1) + ' dBFS';
    const label = clamped > -20 ? '很响（近距离说话/拍手）' : clamped > -35 ? '正常交谈' : clamped > -50 ? '轻声/远处说话' : clamped > -65 ? '安静房间' : '极安静 / 可能静音';
    $('#micLabel').textContent = label;
    state.live.microphone = { dBFS: +clamped.toFixed(1), peakdBFS: +mic.peak.toFixed(1), label };
    const t = performance.now();
    if (t - mic.lastLog > 3000) { mic.lastLog = t; logLine(`麦克风电平 ${clamped.toFixed(1)} dBFS（${label}）`); }
    mic.raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopMic() {
  if (mic.raf) cancelAnimationFrame(mic.raf);
  mic.raf = null;
  if (mic.stream) mic.stream.getTracks().forEach((t) => t.stop());
  mic.stream = null; mic.analyser = null;
  put('audio', '麦克风权限', 'info', '已停止测量');
  logLine('麦克风已停止', 'ev');
}

/* --------------------------------------------------------------- 音量键监听 */
function watchVolumeKeys() {
  const codes = new Set(['AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute', 'VolumeUp', 'VolumeDown', 'VolumeMute']);
  const keys = new Set(['AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute']);
  const hits = [];
  const onKey = (e) => {
    if (codes.has(e.code) || keys.has(e.key) || /volume/i.test(e.key)) hits.push(`${e.key}/${e.code}`);
  };
  window.addEventListener('keydown', onKey, true);
  $('#volKeyResult').textContent = '监听中… 现在按平板的音量 +/- 键（5 秒）';
  let left = 5;
  const iv = setInterval(() => { left--; $('#volKeyResult').textContent = `监听中… 剩余 ${left} 秒，已捕获 ${hits.length} 次`; }, 1000);
  setTimeout(() => {
    clearInterval(iv);
    window.removeEventListener('keydown', onKey, true);
    if (hits.length) {
      $('#volKeyResult').textContent = `✅ 捕获到 ${hits.length} 次音量键事件：${hits.join(', ')}`;
      put('audio', '硬件音量键可被网页捕获', 'pass', `捕获 ${hits.length} 次: ${hits.join(', ')}`);
    } else {
      $('#volKeyResult').textContent = '❌ 未捕获到音量键事件 —— 该浏览器/系统不把音量键传给网页（Android 常见行为），网页无法检测音量按键。';
      put('audio', '硬件音量键可被网页捕获', 'unsupported', '5 秒内未收到任何音量键事件（系统独占，网页无法监听）');
    }
  }, 5000);
}

/* --------------------------------------------------------------- 屏幕控制 */
let wakeLock = null;

async function toggleWakeLock() {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      $('#wakeState').textContent = '未启用';
      $('#btnWake').classList.remove('on');
      put('screen', 'Wake Lock 状态', 'info', '已释放');
      return;
    }
    wakeLock = await navigator.wakeLock.request('screen');
    $('#wakeState').textContent = '已启用（屏幕不自动熄灭）';
    $('#btnWake').classList.add('on');
    wakeLock.addEventListener('release', () => {
      $('#wakeState').textContent = '已被系统释放';
      $('#btnWake').classList.remove('on');
      wakeLock = null;
    });
    put('screen', 'Wake Lock 状态', 'pass', '已获取屏幕常亮锁');
    logLine('Wake Lock 已获取', 'ev');
  } catch (e) {
    $('#wakeState').textContent = '失败: ' + e.message;
    put('screen', 'Wake Lock 状态', 'fail', e.name + ': ' + e.message);
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {
    put('screen', '全屏切换', 'fail', e.name + ': ' + e.message);
    logLine('全屏失败: ' + e.message, 'er');
  }
}

async function lockOrientation(mode) {
  if (!screen.orientation || !screen.orientation.lock) {
    put('screen', '方向锁定', 'unsupported', '不支持 screen.orientation.lock()');
    return;
  }
  try {
    if (mode === 'unlock') { screen.orientation.unlock(); put('screen', '方向锁定', 'info', '已解除锁定'); return; }
    await screen.orientation.lock(mode);
    put('screen', '方向锁定', 'pass', '已锁定为 ' + mode);
  } catch (e) {
    put('screen', '方向锁定', 'fail', e.name + ': ' + e.message);
  }
}

/* --------------------------------------------------------------- 刷新率测量 */
function measureFps() {
  const btn = $('#btnFps');
  btn.disabled = true;
  btn.textContent = '测量中…';
  const gaps = [];
  let last = performance.now();
  let count = 0;
  const start = last;
  const tick = () => {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
    count++;
    if (now - start < 2000) requestAnimationFrame(tick);
    else {
      gaps.shift();
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
      const fps = 1000 / mean;
      $('#fpsVal').textContent = num(fps, 1);
      $('#fpsGap').textContent = num(mean, 2);
      $('#fpsJitter').textContent = num(sd, 2);
      put('screen', '实测刷新率', 'pass', `${num(fps, 1)} fps（帧间隔 ${num(mean, 2)}ms，抖动 ${num(sd, 2)}ms，${count} 帧）`);
      state.live.refreshRate = +fps.toFixed(2);
      updateGpuTable();
      btn.disabled = false;
      btn.textContent = '测量刷新率';
      logLine(`刷新率实测 ${fps.toFixed(1)} fps`, 'ev');
    }
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------- 主线程 / 定时器 精度测量 */
async function measureTimerJitter() {
  const deltas = [];
  for (let i = 0; i < 120; i++) {
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 0));
    deltas.push(performance.now() - t0);
  }
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const sd = Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length);
  let gran = Infinity;
  for (let i = 0; i < 4000; i++) {
    const x = performance.now();
    const y = performance.now();
    if (y > x) gran = Math.min(gran, y - x);
  }
  $('#rttVal').textContent = num(median, 2);
  $('#rttJitter').textContent = num(sd, 2);
  const granularity = gran === Infinity ? '<0.001' : gran.toFixed(4);
  put('network', '主线程定时器调度精度', 'pass',
    `setTimeout(0) 延迟中位数 ${num(median, 2)}ms，最大 ${num(deltas[deltas.length - 1], 2)}ms，标准差 ${num(sd, 2)}ms；performance.now 粒度 ${granularity}ms`);
  state.live.timerJitter = { medianMs: +median.toFixed(2), sdMs: +sd.toFixed(2), nowGranularityMs: granularity };
  logLine(`定时器抖动中位数 ${median.toFixed(2)} ms`, 'ev');
}

/* --------------------------------------------- 本地吞吐测试（完全离线可测） */
async function measureLocalThroughput() {
  const btn = $('#btnSpeed');
  btn.disabled = true;
  btn.textContent = '测试中…';
  try {
    const size = 32 * 1024 * 1024;
    const buf = new Uint8Array(size);
    try { crypto.getRandomValues(buf.subarray(0, 65536)); } catch { buf.fill(0x5a, 0, 65536); }
    for (let i = 65536; i < size; i += 65536) buf.copyWithin(i, 0, Math.min(65536, size - i));

    const t0 = performance.now();
    const ab = await new Blob([buf]).arrayBuffer();
    const t1 = performance.now();
    let digestMs = null;
    if (crypto.subtle && crypto.subtle.digest) {
      const t2 = performance.now();
      await crypto.subtle.digest('SHA-256', ab);
      digestMs = performance.now() - t2;
    }
    const dt = (t1 - t0) / 1000;
    const mbs = ab.byteLength / 1048576 / dt;
    $('#speedVal').textContent = num(mbs, 0);
    put('network', '本地内存吞吐（Blob→ArrayBuffer）', 'pass',
      `${num(mbs, 0)} MB/s（32 MB / ${num(dt, 3)} s）` + (digestMs !== null ? `；SHA-256(32MB) ${num(digestMs, 0)} ms` : '；无 crypto.subtle（非安全上下文）'));
    state.live.localThroughputMBs = Math.round(mbs);
    logLine(`本地吞吐 ${mbs.toFixed(0)} MB/s`, 'ev');
  } catch (e) {
    put('network', '本地内存吞吐（Blob→ArrayBuffer）', 'fail', e.message);
  }
  btn.disabled = false;
  btn.textContent = '测本地吞吐（32 MB）';
}

/* ----------------------------------- 外部 URL 下载测速（可选，需对方允许跨域） */
async function measureRemoteSpeed() {
  const url = $('#remoteUrl').value.trim();
  const out = $('#remoteSpeedVal');
  if (!url) { out.textContent = '请先填写一个允许跨域(CORS)的文件地址'; return; }
  out.textContent = '测速中…';
  const btn = $('#btnRemoteSpeed');
  btn.disabled = true;
  try {
    const t0 = performance.now();
    const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let got = 0;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; }
    } else got = (await res.arrayBuffer()).byteLength;
    const dt = (performance.now() - t0) / 1000;
    const mbps = (got * 8) / dt / 1e6;
    out.textContent = `✅ ${num(mbps, 1)} Mbps（${(got / 1048576).toFixed(2)} MB / ${num(dt, 2)} s）`;
    put('network', '外部 URL 下载测速', 'pass', `${num(mbps, 1)} Mbps，下载 ${(got / 1048576).toFixed(2)} MB — ${url}`);
  } catch (e) {
    out.textContent = `❌ ${e.name}: ${e.message}（跨域测试需要对方服务器允许 CORS）`;
    put('network', '外部 URL 下载测速', 'fail', `${e.name}: ${e.message}（通常是 CORS 限制，并非设备问题）`);
  }
  btn.disabled = false;
}

function collectIce() {
  const out = $('#rtcOut');
  if (!window.RTCPeerConnection) { out.textContent = '不支持 RTCPeerConnection'; return; }
  out.textContent = '收集中…';
  const found = [];
  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.createDataChannel('t');
  pc.onicecandidate = (e) => {
    if (e.candidate) { found.push(e.candidate.candidate); out.textContent = found.join('\n'); }
  };
  pc.createOffer().then((o) => pc.setLocalDescription(o));
  setTimeout(() => {
    pc.close();
    const ips = [...new Set(found.map((c) => (c.split(' ')[4] || '')))].filter(Boolean);
    put('network', 'WebRTC ICE 候选', found.length ? 'pass' : 'warn', `收集到 ${found.length} 个候选，地址: ${ips.join(', ') || '无'}（现代浏览器多为 mDNS 混淆地址）`);
    if (!found.length) out.textContent = '未收集到候选（可能被策略阻止）';
  }, 3500);
}

/* --------------------------------------------------------------- 触控画布 */
function setupTouchpad() {
  const cv = $('#touchpad');
  const ctx = cv.getContext('2d');
  if (!ctx) { $('#touchInfo').textContent = '本浏览器不支持 Canvas 2D，触控可视化不可用（仍可用手指点击，事件日志里会记录）'; return; }
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
  };
  resize();
  window.addEventListener('resize', resize);

  const points = new Map();
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#1b2230';
    for (let x = 0; x < cv.width; x += 40 * dpr) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
    for (let y = 0; y < cv.height; y += 40 * dpr) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
    for (const [id, p] of points) {
      const r = Math.max(8 * dpr, (p.radiusX || 12) * dpr);
      ctx.beginPath();
      ctx.arc(p.x * dpr, p.y * dpr, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${(id * 67) % 360},85%,60%,${0.25 + 0.55 * (p.force || 0.5)})`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${(id * 67) % 360},90%,70%,1)`;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.fillStyle = '#e6edf3';
      ctx.font = `${12 * dpr}px monospace`;
      ctx.fillText(`#${id} ${Math.round(p.x)},${Math.round(p.y)}`, p.x * dpr + r + 4, p.y * dpr - r - 2);
    }
  };

  const update = (e) => {
    points.clear();
    const list = e.touches ? Array.from(e.touches) : [e];
    for (const t of list) {
      const rect = cv.getBoundingClientRect();
      points.set(t.identifier === undefined ? 0 : t.identifier, {
        x: t.clientX - rect.left, y: t.clientY - rect.top,
        force: t.force, radiusX: t.radiusX, radiusY: t.radiusY,
      });
    }
    draw();
    const info = list.map((t) => {
      const rect = cv.getBoundingClientRect();
      return `#${t.identifier === undefined ? 0 : t.identifier} (${Math.round(t.clientX - rect.left)},${Math.round(t.clientY - rect.top)}) 压力=${num(t.force, 2)} 半径=${num(t.radiusX, 1)}×${num(t.radiusY, 1)} 倾角=${num(t.rotationAngle, 0)}°`;
    });
    $('#touchInfo').textContent = `同时 ${list.length} 个触点：` + info.join('； ');
    state.live.touch = { count: list.length };
  };

  cv.addEventListener('touchstart', (e) => { e.preventDefault(); update(e); logLine(`触摸开始，${e.touches.length} 个触点`, 'ev'); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { e.preventDefault(); update(e); }, { passive: false });
  cv.addEventListener('touchend', (e) => { e.preventDefault(); update(e); }, { passive: false });
  cv.addEventListener('touchcancel', (e) => { points.clear(); draw(); $('#touchInfo').textContent = '触摸取消'; });
  cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') update({ clientX: e.clientX, clientY: e.clientY, force: 0.5, radiusX: 10, radiusY: 10 }); });
  draw();
}

/* --------------------------------------------------------------- 按键日志 */
function setupKeys() {
  const box = $('#keyLog');
  const recent = [];
  window.addEventListener('keydown', (e) => {
    const line = `keydown key="${e.key}" code="${e.code}" keyCode=${e.keyCode} which=${e.which} repeat=${e.repeat} mods=${[e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean).join('+') || '-'}`;
    recent.push(line);
    if (recent.length > 12) recent.shift();
    box.textContent = recent.join('\n');
    state.live.lastKeys = recent.slice(-5);
  }, true);
}

/* --------------------------------------------------------------- 摄像头 */
const cam = { stream: null, facing: 'environment', torchOn: false, track: null };

async function openCamera(facing = cam.facing) {
  closeCamera();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    cam.stream = stream;
    cam.facing = facing;
    cam.track = stream.getVideoTracks()[0];
    const v = $('#video');
    v.srcObject = stream;
    v.style.display = 'block';
    await v.play();
    const st = cam.track.getSettings();
    $('#camRes').textContent = `${st.width}×${st.height}`;
    $('#camLabel').textContent = `${cam.track.label || '未知'} (${st.facingMode || facing})`;
    const caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
    $('#camFps').textContent = st.frameRate ? num(st.frameRate, 0) : '–';
    state.live.camera = { label: cam.track.label, settings: st, capabilities: caps };
    put('media', '摄像头打开', 'pass', `${st.width}×${st.height} @${num(st.frameRate, 0)}fps，torch=${!!caps.torch}，zoom=${caps.zoom ? caps.zoom.min + '~' + caps.zoom.max : '不支持'}`);
    logLine(`摄像头已打开: ${cam.track.label} ${st.width}x${st.height}`, 'ev');
    $('#btnTorch').classList.toggle('on', false);
    cam.torchOn = false;
    // 实测帧率
    let frames = 0;
    const t0 = performance.now();
    const countFrames = () => {
      if (!cam.stream) return;
      frames++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(countFrames);
      else $('#camFps').textContent = num((frames / ((performance.now() - t0) / 1000)), 1);
    };
    requestAnimationFrame(countFrames);
  } catch (e) {
    put('media', '摄像头打开', 'fail', `${e.name}: ${e.message}`);
    logLine('摄像头打开失败: ' + e.message, 'er');
  }
}

function closeCamera() {
  if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
  cam.stream = null; cam.track = null;
  $('#video').srcObject = null;
}

async function toggleTorch() {
  if (!cam.track) { put('media', '手电筒 torch', 'fail', '请先打开摄像头'); return; }
  const caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
  if (!caps.torch) { put('media', '手电筒 torch', 'unsupported', '该摄像头不支持 torch 约束'); return; }
  cam.torchOn = !cam.torchOn;
  try {
    await cam.track.applyConstraints({ advanced: [{ torch: cam.torchOn }] });
    $('#btnTorch').classList.toggle('on', cam.torchOn);
    put('media', '手电筒 torch', 'pass', cam.torchOn ? '已打开' : '已关闭');
  } catch (e) {
    put('media', '手电筒 torch', 'fail', e.message);
  }
}

function shot() {
  const v = $('#video');
  if (!v.videoWidth) { put('media', '拍照', 'fail', '没有视频画面'); return; }
  const c = $('#shotCanvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.style.display = 'block';
  c.getContext('2d').drawImage(v, 0, 0);
  put('media', '拍照（canvas 抓帧）', 'pass', `${c.width}×${c.height} 已抓取，见下方预览`);
}

async function listDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const lines = devs.map((d, i) => `${i + 1}. ${d.kind} — ${d.label || '(未授权，标签隐藏)'} [${d.deviceId.slice(0, 12)}…] group=${d.groupId.slice(0, 8)}`);
    $('#deviceList').innerHTML = escapeHtml(lines.join('\n')).replace(/\n/g, '<br>');
    const byKind = devs.reduce((a, d) => ((a[d.kind] = (a[d.kind] || 0) + 1), a), {});
    put('media', '设备枚举结果', 'pass', Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(', ') + `（共 ${devs.length} 个）`);
    state.live.devices = devs.map((d) => ({ kind: d.kind, label: d.label }));
  } catch (e) {
    put('media', '设备枚举结果', 'fail', e.message);
  }
}

/* --------------------------------------------------------------- 存储测试 */
async function fillStorageTable() {
  const rows = [];
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const e = await navigator.storage.estimate();
      rows.push(['配额 quota', (e.quota / 1073741824).toFixed(2) + ' GB (' + e.quota + ' B)']);
      rows.push(['已用 usage', (e.usage / 1048576).toFixed(2) + ' MB (' + e.usage + ' B)']);
      rows.push(['是否持久化 persisted()', navigator.storage.persisted ? String(await navigator.storage.persisted()) : '不支持']);
    } catch (e) { rows.push(['storage.estimate', '❌ ' + e.message]); }
  } else rows.push(['storage.estimate', '⛔ 不支持']);
  rows.push(['提示', '点「运行存储测试」实测 localStorage / IndexedDB / Cache / OPFS 读写']);
  kv('#storageTable', rows);
}

async function runStorageTest(del) {
  const rows = [];
  const t = (name, fn) => {
    try { rows.push([name, fn()]); } catch (e) { rows.push([name, '❌ ' + e.message]); }
  };
  if (del) {
    try { localStorage.removeItem('__dsh_test__'); indexedDB.deleteDatabase('__dsh_test__'); } catch {}
    rows.push(['清理', '已删除测试数据']);
    kv('#storageTable', rows);
    put('storage', '存储读写实测', 'info', '测试数据已清理');
    return;
  }

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const e = await navigator.storage.estimate();
      rows.push(['配额 quota', (e.quota / 1073741824).toFixed(2) + ' GB (' + e.quota + ' B)']);
      rows.push(['已用 usage', (e.usage / 1048576).toFixed(2) + ' MB (' + e.usage + ' B)']);
      rows.push(['是否持久化 persisted()', navigator.storage.persisted ? String(await navigator.storage.persisted()) : '不支持']);
    } catch (e) { rows.push(['storage.estimate', '❌ ' + e.message]); }
  }

  try {
    const payload = 'x'.repeat(100 * 1024);
    const t0 = performance.now();
    localStorage.setItem('__dsh_test__', payload);
    const back = localStorage.getItem('__dsh_test__');
    const t1 = performance.now();
    localStorage.removeItem('__dsh_test__');
    rows.push(['localStorage 100KB 写入+读取', back.length === payload.length ? `✅ 成功，耗时 ${num(t1 - t0, 1)} ms` : '❌ 数据不一致']);
  } catch (e) { rows.push(['localStorage', '❌ ' + e.message]); }

  try {
    const t0 = performance.now();
    const db = await new Promise((res, rej) => { const r = indexedDB.open('__dsh_test__', 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('t', 'readwrite');
    tx.objectStore('t').put(new Blob(['hello']), 'blob');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    rows.push(['IndexedDB 写入 Blob', `✅ 成功，耗时 ${num(performance.now() - t0, 1)} ms`]);
    db.close();
    indexedDB.deleteDatabase('__dsh_test__');
  } catch (e) { rows.push(['IndexedDB', '❌ ' + e.message]); }

  if (typeof caches !== 'undefined') {
    try {
      const c = await caches.open('__dsh_test__');
      const probe = new Request('./__dsh_cache_probe__');
      await c.put(probe, new Response('x'));
      const hit = await c.match(probe);
      await caches.delete('__dsh_test__');
      rows.push(['Cache Storage', hit ? '✅ 写入并命中' : '❌ 未命中']);
    } catch (e) { rows.push(['Cache Storage', '❌ ' + e.message]); }
  } else rows.push(['Cache Storage', '⛔ 不可用' + (SECURE ? '（file:// 源无 Cache Storage）' : '（需要安全上下文）')]);

  if (navigator.storage && navigator.storage.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle('__dsh_test__.txt', { create: true });
      const w = await fh.createWritable();
      await w.write('hello opfs');
      await w.close();
      const f = await fh.getFile();
      rows.push(['OPFS 文件写入', `✅ 成功，读取到 "${(await f.text()).slice(0, 20)}"`]);
      await root.removeEntry('__dsh_test__.txt');
    } catch (e) { rows.push(['OPFS', '❌ ' + e.message]); }
  } else rows.push(['OPFS', '⛔ 不可用']);

  kv('#storageTable', rows);
  put('storage', '存储读写实测', 'pass', `${rows.length} 项测试完成，见左侧表格`);
  logLine('存储读写测试完成', 'ev');
}

/* --------------------------------------------------------------- 现代 API 交互 */
function out(text) { $('#modernOut').textContent = text; }

async function testVibrate() {
  if (!navigator.vibrate) { out('⛔ 不支持 Vibration API'); return; }
  const r = navigator.vibrate([200, 100, 200, 100, 400]);
  out('震动调用返回 ' + r + '（true=已接受）。若平板无振动马达则无感。');
  put('modern', '震动实测', r ? 'pass' : 'warn', 'navigator.vibrate([200,100,200,100,400]) 返回 ' + r);
}

function testGeo() {
  if (!navigator.geolocation) { out('⛔ 不支持 Geolocation'); return; }
  out('定位中…（首次会弹权限请求）');
  const t0 = performance.now();
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const c = p.coords;
      const txt = `纬度 ${c.latitude.toFixed(6)}，经度 ${c.longitude.toFixed(6)}，精度 ±${c.accuracy.toFixed(1)} m，海拔 ${c.altitude === null ? '–' : c.altitude.toFixed(1) + ' m'}，速度 ${c.speed === null ? '–' : c.speed + ' m/s'}，耗时 ${(performance.now() - t0).toFixed(0)} ms，时间戳 ${new Date(p.timestamp).toLocaleTimeString('zh-CN')}`;
      out('✅ ' + txt);
      put('modern', '定位实测', 'pass', txt);
      put('modern', '定位精度评估', c.accuracy < 20 ? 'pass' : 'warn', `水平精度 ±${c.accuracy.toFixed(1)} m` + (c.accuracy < 20 ? '（已启用 GPS/高精度）' : '（可能只用 Wi-Fi/基站定位）'));
      state.live.geolocation = { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy };
    },
    (e) => { out('❌ 定位失败: ' + e.message + ' (code ' + e.code + ')'); put('modern', '定位实测', 'fail', e.message); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

async function testClipRead() {
  try {
    const txt = await navigator.clipboard.readText();
    out('剪贴板内容：' + (txt || '(空)'));
    put('modern', '剪贴板读取实测', 'pass', `读到 ${txt.length} 个字符`);
  } catch (e) { out('❌ 读取失败: ' + e.name + ' ' + e.message); put('modern', '剪贴板读取实测', 'fail', e.name + ': ' + e.message); }
}

async function testClipWrite() {
  try {
    await navigator.clipboard.writeText('DSH Device Lab 剪贴板测试 ' + new Date().toLocaleString('zh-CN'));
    out('✅ 已写入剪贴板，可粘贴到别处验证');
    put('modern', '剪贴板写入实测', 'pass', '写入成功');
  } catch (e) { out('❌ 写入失败: ' + e.name + ' ' + e.message); put('modern', '剪贴板写入实测', 'fail', e.name + ': ' + e.message); }
}

async function testNotify() {
  if (!('Notification' in window)) { out('⛔ 不支持 Notification'); return; }
  const p = await Notification.requestPermission();
  out('通知权限: ' + p);
  put('modern', '通知权限实测', p === 'granted' ? 'pass' : 'warn', 'permission = ' + p);
  if (p === 'granted') {
    try { new Notification('DSH Device Lab', { body: '通知测试成功 ' + new Date().toLocaleTimeString('zh-CN') }); } catch (e) { out('通知构造失败: ' + e.message); }
  }
}

async function testShare() {
  if (!navigator.share) { out('⛔ 不支持 Web Share'); return; }
  try {
    await navigator.share({ title: 'DSH Device Lab', text: '设备 API 测试台', url: location.href });
    out('✅ 分享面板已调用');
    put('modern', '系统分享实测', 'pass', '调起成功');
  } catch (e) { out('分享取消/失败: ' + e.name + ' ' + e.message); put('modern', '系统分享实测', e.name === 'AbortError' ? 'info' : 'fail', e.name + ': ' + e.message); }
}

async function testBattery() {
  if (!navigator.getBattery) { out('⛔ 不支持 Battery Status API'); return; }
  const b = await navigator.getBattery();
  const txt = `电量 ${(b.level * 100).toFixed(0)}%，充电中: ${b.charging}，充满剩余 ${b.chargingTime === Infinity ? '–' : b.chargingTime + 's'}，可用 ${b.dischargingTime === Infinity ? '–' : Math.round(b.dischargingTime / 60) + 'min'}`;
  out(txt);
  put('modern', '电池状态实测', 'pass', txt);
  state.live.battery = { level: b.level, charging: b.charging };
}

const PERM_NAMES = ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'clipboard-write', 'persistent-storage', 'push', 'midi', 'background-sync', 'accelerometer', 'gyroscope', 'magnetometer', 'ambient-light-sensor', 'screen-wake-lock', 'payment-handler', 'storage-access', 'bluetooth', 'idle-detection', 'local-fonts', 'window-management', 'display-capture'];

async function queryPerms() {
  if (!navigator.permissions || !navigator.permissions.query) { put('modern', '权限查询', 'unsupported', '不支持 Permissions API'); return; }
  let supported = 0;
  for (const name of PERM_NAMES) {
    try {
      const st = await navigator.permissions.query({ name });
      supported++;
      const status = st.state === 'granted' ? 'pass' : st.state === 'denied' ? 'fail' : 'info';
      put('perm', name, { status, detail: st.state + (st.state === 'prompt' ? '（尚未请求，弹窗时会询问）' : '') });
      st.onchange = () => put('perm', name, { status: st.state === 'granted' ? 'pass' : st.state === 'denied' ? 'fail' : 'info', detail: st.state + '（状态变化）' });
    } catch {
      put('perm', name, 'unsupported', '该浏览器不识别此权限名');
    }
  }
  put('modern', '权限查询', 'pass', `查询了 ${PERM_NAMES.length} 个权限名，其中 ${supported} 个被识别`);
  logLine(`权限查询完成，识别 ${supported}/${PERM_NAMES.length}`, 'ev');
}

/* --------------------------------------------------------------- 结果收集 */
function collectReport() {
  const results = Array.from(state.results.values()).map((r) => ({ section: r.section, name: r.name, status: r.status, detail: r.detail }));
  return {
    env: envSnapshot(),
    results,
    liveReadings: state.live,
    userNote: $('#userNote').value.trim(),
    logs: state.logs.slice(-200),
    clientTime: new Date().toISOString(),
  };
}

/* ============================================================================
 * 二·五、结果导出（纯前端：没有服务器，报告通过文件/剪贴板/分享码/本机历史带走）
 * ========================================================================== */
const HISTORY_KEY = 'dsh-device-lab-history-v1';
const HISTORY_MAX = 10;

function tsName(ext) {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `device-api-report-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.${ext}`;
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function statusText() { return $('#reportOut'); }

/** 把报告渲染成人类可读的 Markdown（纯前端实现，取代服务端的汇总） */
function toMarkdown(report) {
  const e = report.env || {};
  const rows = report.results || [];
  const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const L = [];
  L.push(`# 设备 API 测试报告`);
  L.push('');
  L.push(`- 生成时间: ${report.clientTime}`);
  L.push(`- 用户代理: \`${e.userAgent || 'n/a'}\``);
  L.push(`- 平台: ${e.platform || 'n/a'} | 厂商: ${e.vendor || 'n/a'}`);
  L.push(`- 屏幕: ${e.screen || 'n/a'} @ DPR ${e.devicePixelRatio === undefined ? 'n/a' : e.devicePixelRatio} | 视口 ${e.viewport || 'n/a'}`);
  L.push(`- 语言/时区: ${e.language || 'n/a'} / ${e.timeZone || 'n/a'}`);
  L.push(`- CPU 核心: ${e.hardwareConcurrency === undefined ? 'n/a' : e.hardwareConcurrency} | 设备内存: ${e.deviceMemory === undefined ? '未暴露' : e.deviceMemory + ' GB'}`);
  L.push(`- 安全上下文: ${e.isSecureContext ? '是' : '否'} | 协议: ${e.protocol || 'n/a'}`);
  L.push(`- 触控点: ${e.maxTouchPoints === undefined ? 'n/a' : e.maxTouchPoints} | 在线: ${e.onLine}`);
  L.push(`- 页面地址: ${e.href || 'n/a'}`);
  if (e.userAgentData) L.push(`- UA-CH: ${e.userAgentData}`);
  L.push('');
  L.push('## 结果统计');
  L.push('');
  L.push(Object.keys(ICON).filter((k) => counts[k]).map((k) => `${ICON[k]} ${k}: ${counts[k]}`).join(' | '));
  L.push('');
  L.push(`## 明细（共 ${rows.length} 项）`);
  L.push('');
  L.push('| 状态 | 分类 | 项目 | 结果 |');
  L.push('| --- | --- | --- | --- |');
  for (const r of rows) {
    const detail = String(r.detail === undefined ? '' : r.detail).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
    L.push(`| ${ICON[r.status] || r.status} | ${r.section || ''} | ${r.name || ''} | ${detail} |`);
  }
  L.push('');
  const live = report.liveReadings || {};
  if (Object.keys(live).length) {
    L.push('## 实时读数快照');
    L.push('');
    for (const [k, v] of Object.entries(live)) L.push(`- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    L.push('');
  }
  if (report.userNote) {
    L.push('## 用户备注');
    L.push('');
    L.push(report.userNote);
    L.push('');
  }
  return L.join('\n');
}

function exportJson() {
  downloadText(tsName('json'), JSON.stringify(collectReport(), null, 2), 'application/json');
  statusText().textContent = '✅ 已导出 JSON 文件（浏览器下载目录）';
  logLine('已导出 JSON 报告', 'ev');
}

function exportMarkdown() {
  const md = toMarkdown(collectReport());
  downloadText(tsName('md'), md, 'text/markdown;charset=utf-8');
  statusText().textContent = '✅ 已导出 Markdown 报告（浏览器下载目录）';
  logLine('已导出 Markdown 报告', 'ev');
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    statusText().textContent = '✅ ' + okMsg;
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      statusText().textContent = ok ? '✅ ' + okMsg + '（回退方式）' : '❌ 复制失败，请手动选择文本框内容复制';
      return ok;
    } catch (e) {
      statusText().textContent = '❌ 复制失败: ' + e.message;
      return false;
    }
  }
}

function plainTextReport() {
  return Array.from(state.results.values()).map((r) => `${ICON[r.status]} [${r.section}] ${r.name}: ${r.detail}`).join('\n');
}

async function copyResults() {
  const txt = `DSH Device API Lab 设备检测结果\n${new Date().toLocaleString('zh-CN')}\n设备: ${navigator.userAgent}\n\n${plainTextReport()}`;
  await copyText(txt, '结果已复制到剪贴板');
}

/* ---------------------------------------------------------------- 分享码 */
/* 把 JSON 用 gzip 压缩后 Base64 编码，得到一段纯文本，可通过聊天工具发到电脑，
   再用 tools/decode-sharecode.js 还原成 JSON / Markdown。全程不经过任何服务器。 */
function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** 不依赖 TextEncoder 的 UTF-8 编码（兼容老 WebView） */
function utf8Bytes(str) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(str);
  const bin = unescape(encodeURIComponent(str));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function makeShareCode() {
  const json = JSON.stringify(collectReport());
  const raw = utf8Bytes(json);
  let packed = raw;
  let how = 'raw';
  try {
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
      packed = new Uint8Array(await new Response(stream).arrayBuffer());
      how = 'gzip';
    }
  } catch { packed = raw; how = 'raw'; }
  return { code: `DSHLAB1-${how}:${bytesToBase64(packed)}`, rawBytes: raw.length, packedBytes: packed.length, how };
}

async function copyShareCode() {
  statusText().textContent = '生成分享码中…';
  const { code, rawBytes, packedBytes, how } = await makeShareCode();
  $('#shareCodeBox').style.display = 'block';
  $('#shareCodeBox').value = code;
  const saved = ((1 - packedBytes / rawBytes) * 100).toFixed(0);
  statusText().textContent = `✅ 分享码已生成（${how} 压缩，${(rawBytes / 1024).toFixed(1)}KB → ${(packedBytes / 1024).toFixed(1)}KB，省 ${saved}%）。已填入下方文本框，可直接复制发到电脑。`;
  await copyText(code, '分享码已复制到剪贴板');
  logLine(`已生成分享码（${how}，${packedBytes}B）`, 'ev');
}

/* ---------------------------------------------------------------- 本机历史 */
function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function writeHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); return true; }
  catch (e) {
    // 配额不够时丢弃最旧的一半再试一次
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, Math.max(1, Math.floor(list.length / 2))))); return true; }
    catch { statusText().textContent = '❌ 本机存储写入失败: ' + e.message; return false; }
  }
}

function saveToHistory() {
  const report = collectReport();
  const counts = report.results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const list = readHistory();
  list.unshift({ ts: report.clientTime, ua: report.env.userAgent, counts, total: report.results.length, report });
  if (writeHistory(list.slice(0, HISTORY_MAX))) {
    renderHistory();
    statusText().textContent = `✅ 已保存到本机历史（最多保留 ${HISTORY_MAX} 份，存于 localStorage）`;
    logLine('报告已保存到本机历史', 'ev');
  }
}

function deleteHistory(i) {
  const list = readHistory();
  list.splice(i, 1);
  writeHistory(list);
  renderHistory();
}

function historyDownload(i, kind) {
  const item = readHistory()[i];
  if (!item) return;
  if (kind === 'md') downloadText(`device-api-report-${item.ts.replace(/[:.]/g, '-')}.md`, toMarkdown(item.report), 'text/markdown;charset=utf-8');
  else if (kind === 'txt') downloadText(`device-api-report-${item.ts.replace(/[:.]/g, '-')}.txt`, (item.report.results || []).map((r) => `${ICON[r.status]} [${r.section}] ${r.name}: ${r.detail}`).join('\n'));
  else downloadText(`device-api-report-${item.ts.replace(/[:.]/g, '-')}.json`, JSON.stringify(item.report, null, 2), 'application/json');
}

function renderHistory() {
  const host = $('#historyList');
  const list = readHistory();
  host.innerHTML = '';
  if (!list.length) {
    host.innerHTML = '<div class="tiny">本机还没有保存过报告。点「💾 保存到本机历史」即可把当前结果留在浏览器里（离线可用）。</div>';
    return;
  }
  list.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'histrow';
    const c = item.counts || {};
    const info = document.createElement('div');
    info.className = 'histinfo';
    const when = document.createElement('div');
    when.className = 'mono';
    when.textContent = new Date(item.ts).toLocaleString('zh-CN');
    const meta = document.createElement('div');
    meta.className = 'tiny';
    meta.textContent = `${item.total} 项 · ✅${c.pass || 0} ❌${c.fail || 0} ⛔${c.unsupported || 0} 🔒${c.blocked || 0} · ${String(item.ua || '').slice(0, 46)}…`;
    info.appendChild(when);
    info.appendChild(meta);
    const btns = document.createElement('div');
    btns.className = 'histbtns';
    for (const [label, kind] of [['JSON', 'json'], ['MD', 'md'], ['TXT', 'txt']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => historyDownload(i, kind);
      btns.appendChild(b);
    }
    const del = document.createElement('button');
    del.textContent = '删除';
    del.className = 'danger';
    del.onclick = () => deleteHistory(i);
    btns.appendChild(del);
    row.appendChild(info);
    row.appendChild(btns);
    host.appendChild(row);
  });
}

/* ============================================================================
 * 三、初始化
 * ========================================================================== */
function setupCards() {
  $$('[data-card]').forEach((h) => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
  });
}

function setupEvents() {
  window.addEventListener('online', () => logLine('网络已连接（online 事件）', 'ev'));
  window.addEventListener('offline', () => logLine('网络已断开（offline 事件）', 'er'));
  window.addEventListener('orientationchange', () => { $('#orientState').textContent = `${screen.orientation ? screen.orientation.type : '?'} ${screen.orientation ? screen.orientation.angle : ''}°`; logLine('方向变化: ' + (screen.orientation ? screen.orientation.type : '?'), 'ev'); });
  if (screen.orientation) screen.orientation.addEventListener('change', () => { $('#orientState').textContent = `${screen.orientation.type} ${screen.orientation.angle}°`; });
  document.addEventListener('visibilitychange', () => {
    $('#visState').textContent = document.visibilityState;
    logLine('页面可见性: ' + document.visibilityState, 'ev');
  });
  document.addEventListener('fullscreenchange', () => {
    $('#fsState').textContent = document.fullscreenElement ? '是' : '否';
    put('screen', '全屏切换', document.fullscreenElement ? 'pass' : 'info', document.fullscreenElement ? '已进入全屏' : '已退出全屏');
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.absolute !== undefined) state.live.orientationAbsolute = e.absolute;
  });
  if (navigator.connection) {
    navigator.connection.addEventListener('change', () => {
      logLine(`网络类型变化: ${navigator.connection.effectiveType} / ${navigator.connection.downlink}Mbps`, 'ev');
      fillEnv();
    });
  }
  document.addEventListener('error', (e) => {
    const msg = (e.message || e.type) + (e.filename ? ` @ ${e.filename}:${e.lineno}` : '');
    logLine('页面错误: ' + msg, 'er');
    if (e.message) showError('脚本错误', msg);
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    logLine('未处理的 Promise 拒绝: ' + msg, 'er');
  });
}

function setupButtons() {
  $('#btnRun').onclick = runAll;
  $('#btnStop').onclick = () => { stopMotion(); stopMic(); stopCamMeter(); stopTone(); closeCamera(); logLine('已停止所有传感器/媒体', 'ev'); };
  // 纯前端导出：没有服务器，报告靠文件 / 剪贴板 / 分享码 / 本机历史带走
  $('#btnExport').onclick = exportJson;
  $('#btnExport2').onclick = exportJson;
  $('#btnExportMd').onclick = exportMarkdown;
  $('#btnExportMd2').onclick = exportMarkdown;
  $('#btnCopy').onclick = copyResults;
  $('#btnCopy2').onclick = copyResults;
  $('#btnShareCode').onclick = copyShareCode;
  $('#btnShareCode2').onclick = copyShareCode;
  $('#btnSaveHist').onclick = saveToHistory;
  $('#btnSaveHist2').onclick = saveToHistory;
  $('#btnCollapse').onclick = () => $$('.card').forEach((c) => c.classList.toggle('collapsed'));

  $('#btnMotion').onclick = startMotion;
  $('#btnMotionStop').onclick = stopMotion;
  $('#btnPermMotion').onclick = requestMotionPermission;

  $('#btnLux').onclick = startLux;
  $('#btnCamMeter').onclick = startCamMeter;
  $('#btnCamMeterStop').onclick = stopCamMeter;
  $$('[data-bright]').forEach((b) => (b.onclick = () => showBright(b.dataset.bright)));

  $('#btnTone').onclick = () => playTone(Number($('#toneFreq').value), Number($('#toneVol').value) / 100);
  $('#btnToneStop').onclick = () => stopTone();
  $('#btnSweep').onclick = () => playSweep(Number($('#toneVol').value) / 100);
  $('#toneVol').oninput = (e) => { $('#toneVolVal').textContent = e.target.value + '%'; if (tone.gain) tone.gain.gain.value = e.target.value / 100; };
  $('#toneFreq').oninput = (e) => { $('#toneFreqVal').textContent = e.target.value + ' Hz'; if (tone.osc) tone.osc.frequency.value = Number(e.target.value); };

  $('#btnMic').onclick = startMic;
  $('#btnMicStop').onclick = stopMic;
  $('#btnMicReset').onclick = () => { mic.peak = -Infinity; mic.sum = 0; mic.n = 0; put('audio', '麦克风峰值', 'info', '已重置'); };
  $('#btnVolKeys').onclick = watchVolumeKeys;

  $('#btnFps').onclick = measureFps;
  $('#btnFs').onclick = toggleFullscreen;
  $('#btnWake').onclick = toggleWakeLock;
  $('#btnOrientLock').onclick = () => lockOrientation('portrait');
  $('#btnOrientUnlock').onclick = () => lockOrientation('unlock');

  $('#btnRtt').onclick = measureTimerJitter;
  $('#btnSpeed').onclick = measureLocalThroughput;
  $('#btnRemoteSpeed').onclick = measureRemoteSpeed;
  $('#btnRtc').onclick = collectIce;

  $('#btnCamFront').onclick = () => openCamera('user');
  $('#btnCamBack').onclick = () => openCamera('environment');
  $('#btnCamStop').onclick = () => { closeCamera(); put('media', '摄像头打开', 'info', '已关闭'); };
  $('#btnTorch').onclick = toggleTorch;
  $('#btnShot').onclick = shot;
  $('#btnDevices').onclick = listDevices;

  $('#btnStorage').onclick = () => runStorageTest(false);
  $('#btnStorageClear').onclick = () => runStorageTest(true);

  $('#btnPerms').onclick = queryPerms;
  $('#btnVibrate').onclick = testVibrate;
  $('#btnGeo').onclick = testGeo;
  $('#btnClipRead').onclick = testClipRead;
  $('#btnClipWrite').onclick = testClipWrite;
  $('#btnNotify').onclick = testNotify;
  $('#btnShare').onclick = testShare;
  $('#btnBattery').onclick = testBattery;

  $('#btnLogClear').onclick = () => { state.logs = []; $('#log').innerHTML = ''; updateSummary(); };
  $('#btnLogCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(state.logs.join('\n')); $('#reportOut').textContent = '✅ 日志已复制'; }
    catch { $('#reportOut').textContent = '❌ 复制日志失败'; }
  };
  $('#chkLog').onchange = (e) => { state.logEnabled = e.target.checked; };

  $('#toneVol').oninput({ target: $('#toneVol') });
  $('#toneFreq').oninput({ target: $('#toneFreq') });
}

async function init() {
  // 每一步都独立兜底：任何一步失败都不会让整页瘫痪，并会在页面上显示原因
  const step = async (name, fn) => {
    try { await fn(); }
    catch (e) {
      logLine(`初始化步骤「${name}」失败: ${e && e.message}`, 'er');
      showError(`初始化失败（${name}）`, (e && e.message) || String(e));
    }
  };

  await step('卡片折叠', setupCards);
  await step('按钮绑定', setupButtons);
  await step('事件监听', setupEvents);
  await step('触控画布', setupTouchpad);
  await step('按键日志', setupKeys);
  await step('环境信息', fillEnv);
  await step('安全上下文提示', renderBanner);
  await step('屏幕状态', () => {
    $('#orientState').textContent = screen.orientation ? `${screen.orientation.type} ${screen.orientation.angle}°` : '不支持';
    $('#visState').textContent = document.visibilityState;
  });
  await step('GPU 信息', updateGpuTable);
  await step('媒体格式', checkCodecs);
  await step('存储概览', fillStorageTable);
  await step('本机历史', renderHistory);
  await step('汇总', updateSummary);

  logLine('页面已加载: ' + location.href, 'ev');
  logLine('安全上下文: ' + SECURE + '（' + location.protocol + '）', 'ev');
  setTimeout(() => {
    runAll().catch((e) => {
      logLine('检测过程出错: ' + e.message, 'er');
      showError('批量检测中断', e.message);
    });
  }, 300);
  window.__DSH_REPORT__ = collectReport;
  window.__DSH_SHARE__ = makeShareCode;   // 供 tools/smoke-dom.js 做分享码端到端自检
  window.__DSH_MARKDOWN__ = () => toMarkdown(collectReport());
  window.__DSH_STATE__ = state;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
