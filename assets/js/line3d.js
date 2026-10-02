// ShapedOps homepage journey — an order line rendered in WebGL.
// At the top, orders ride the conveyor on a clock. Scrolling then takes over:
// the camera follows one order (ORD-2041) station by station while the page
// explains each stage, and documents and WhatsApp updates play out in step.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const STAGES = [
  { name: "ENQUIRY", doc: null },
  { name: "QUOTE SENT", doc: "QUOTATION" },
  { name: "PO RECEIVED", doc: "AGREEMENT" },
  { name: "IN PRODUCTION", doc: null },
  { name: "QC & DISPATCH", doc: null },
  { name: "INVOICED", doc: "INVOICE" },
  { name: "PAYMENT COLLECTED", doc: "RECEIPT" },
];

const C = {
  ink: 0x0c0d0a,
  floor: 0x121410,
  steel: 0x2a2e25,
  belt: 0x0b0c0a,
  slat: 0x1c1f18,
  lime: 0xa8ff00,
  limeDim: 0x2c3a12,
  kraft: 0xb99a6b,
  tape: 0xa2835a,
};

const SPACING = 4.3;
const STATION_X = STAGES.map((_, i) => (i - 3) * SPACING);
const BELT_TOP = 1.02;
const LINE_START = -25;
const LINE_END = 25;
const CRATE_GAP = 6.25;
const SPEED = 1.3;

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([
    Promise.all([
      document.fonts.load('500 48px "IBM Plex Mono"'),
      document.fonts.load('400 48px "IBM Plex Mono"'),
      document.fonts.load('700 48px "Archivo"'),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
}

function canvasTexture(w, h, draw, renderer) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

function labelTexture(i, stage, renderer) {
  return canvasTexture(1024, 256, (ctx) => {
    ctx.clearRect(0, 0, 1024, 256);
    ctx.textBaseline = "alphabetic";
    ctx.font = '500 44px "IBM Plex Mono", monospace';
    ctx.fillStyle = "#a8ff00";
    ctx.fillText(String(i + 1).padStart(2, "0"), 8, 70);
    ctx.fillStyle = "rgba(168,255,0,0.5)";
    ctx.fillRect(84, 52, 60, 3);
    // long stage names get a smaller size so the last label stays on screen
    ctx.font = `500 ${stage.name.length > 14 ? 46 : 58}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = "#ecebe3";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillText(stage.name, 8, 150);
    if (stage.doc) {
      ctx.font = '400 38px "IBM Plex Mono", monospace';
      ctx.fillStyle = "#8fbf2e";
      ctx.fillText("+ " + stage.doc + " PDF", 8, 214);
    }
  }, renderer);
}

function docTexture(title, renderer) {
  return canvasTexture(512, 724, (ctx, w, h) => {
    ctx.fillStyle = "#f6f4ec";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#17180f";
    ctx.font = '700 30px "Archivo", sans-serif';
    ctx.fillText("YOUR COMPANY", 40, 70);
    ctx.fillStyle = "#17180f";
    ctx.fillRect(420, 36, 52, 52);
    ctx.strokeStyle = "#a8ff00";
    ctx.lineWidth = 6;
    ctx.strokeRect(436, 52, 20, 20);
    ctx.fillRect(40, 104, 432, 4);
    ctx.font = '700 52px "Archivo", sans-serif';
    ctx.fillText(title, 40, 182);
    ctx.fillStyle = "#d9d6ca";
    for (let r = 0; r < 9; r++) {
      const y = 232 + r * 40;
      ctx.fillRect(40, y, r % 3 === 2 ? 260 : 432, 10);
    }
    ctx.fillStyle = "#17180f";
    ctx.fillRect(40, 610, 432, 4);
    ctx.font = '500 30px "IBM Plex Mono", monospace';
    ctx.fillText("TOTAL", 40, 660);
    ctx.textAlign = "right";
    ctx.fillText("₹ ——", 472, 660);
    if (title === "RECEIPT") {
      ctx.save();
      ctx.translate(330, 470);
      ctx.rotate(-0.18);
      ctx.strokeStyle = "#3f7a00";
      ctx.lineWidth = 8;
      ctx.strokeRect(-110, -44, 220, 88);
      ctx.fillStyle = "#3f7a00";
      ctx.textAlign = "center";
      ctx.font = '800 58px "Archivo", sans-serif';
      ctx.fillText("PAID", 0, 20);
      ctx.restore();
    }
  }, renderer);
}

function drawCrateTag(ctx, w, h, orderNo, paid) {
  ctx.fillStyle = paid ? "#a8ff00" : "#f3f1e8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#17180f";
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.fillText(paid ? "PAID" : "ORDER", 20, 44);
  ctx.font = '700 50px "IBM Plex Mono", monospace';
  ctx.fillText("ORD-" + orderNo, 20, 110);
  if (!paid) {
    for (let b = 0; b < 26; b++) {
      const bw = b % 3 === 0 ? 5 : 2;
      ctx.fillRect(20 + b * 10.5, 136, bw, 44);
    }
  } else {
    ctx.font = '500 28px "IBM Plex Mono", monospace';
    ctx.fillText("RECEIPT ISSUED", 20, 170);
  }
}

// hand control back to the browser between build steps so startup never
// blocks scrolling or input for long
const breathe = () => new Promise((r) => setTimeout(r, 0));
function whenIdle() {
  return new Promise((r) => {
    const go = () => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 1200 }) : setTimeout(r, 200));
    if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Story textures: the "six places" an order lives today, and the WhatsApp
// bubbles the order sends as it moves. Drawn once into canvases.
function wrapLines(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bubbleTexture(text, time, renderer) {
  return canvasTexture(1024, 360, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1f2c34";
    roundRect(ctx, 16, 16, w - 32, h - 32, 34);
    ctx.fill();
    ctx.fillStyle = "#25d366";
    ctx.font = '600 30px "IBM Plex Sans", sans-serif';
    ctx.fillText("Your Company Pvt. Ltd. · WhatsApp", 56, 74);
    ctx.fillStyle = "#e9edef";
    ctx.font = '400 38px "IBM Plex Sans", sans-serif';
    wrapLines(ctx, text, w - 112).slice(0, 4).forEach((l, i) => ctx.fillText(l, 56, 130 + i * 50));
    ctx.textAlign = "right";
    ctx.font = '400 26px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = "#8696a0";
    ctx.fillText(time, w - 120, h - 40);
    ctx.fillStyle = "#53bdeb";
    ctx.font = '600 28px "IBM Plex Sans", sans-serif';
    ctx.fillText("✓✓", w - 56, h - 40);
  }, renderer);
}

// The scattered "today" artifacts — same content as the paper versions
function artifactTexture(kind, renderer) {
  const draw = {
    register(ctx, w, h) {
      ctx.fillStyle = "#f4f0e2"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(60,90,140,0.25)"; ctx.lineWidth = 2;
      for (let y = 96; y < h; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = "rgba(200,60,60,0.45)"; ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, h); ctx.stroke();
      ctx.fillStyle = "#1d2a4a"; ctx.font = '600 30px "IBM Plex Mono", monospace';
      ctx.fillText("ORDER REGISTER — SEPT", 80, 66);
      ctx.font = '400 26px "IBM Plex Mono", monospace';
      ["12/9 Patel Castings — flange", "     DN100 × 400 · adv 50%?", "14/9 Shree Ambica — bush 250", "16/9 Patel — disp. date? call", "18/9 Mehta — coupling × 120", "     rate as per last?"]
        .forEach((l, i) => ctx.fillText(l, 80, 132 + i * 46));
    },
    excel(ctx, w, h) {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1d6f42"; ctx.fillRect(0, 0, w, 56);
      ctx.fillStyle = "#fff"; ctx.font = '500 24px "IBM Plex Sans", sans-serif';
      ctx.fillText("orders_FINAL_v3 (2).xlsx", 20, 37);
      const cols = [20, 230, 420, 500];
      const rows = [["Party", "Item", "Qty", "Status"], ["Patel Castings", "Flange DN100", "400", "in prodn?"], ["Shree Ambica", "Bush 40mm", "250", "payment??"], ["Mehta Traders", "Coupling", "120", "dispatched"], ["Patel Castings", "Flange DN80", "—", "quote sent"]];
      rows.forEach((r, i) => {
        const y = 100 + i * 52;
        if (i === 1) { ctx.fillStyle = "#fff2b3"; ctx.fillRect(500, y - 34, w - 500, 50); }
        if (i === 2) { ctx.fillStyle = "#ffd6d6"; ctx.fillRect(500, y - 34, w - 500, 50); }
        ctx.fillStyle = i === 0 ? "#555" : "#222"; ctx.font = (i === 0 ? "600 " : "400 ") + '22px "IBM Plex Sans", sans-serif';
        r.forEach((c, j) => ctx.fillText(c, cols[j], y));
        ctx.strokeStyle = "#ddd"; ctx.beginPath(); ctx.moveTo(0, y + 16); ctx.lineTo(w, y + 16); ctx.stroke();
      });
    },
    whatsapp(ctx, w, h) {
      ctx.fillStyle = "#0b141a"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1f2c34"; ctx.fillRect(0, 0, w, 86);
      ctx.fillStyle = "#e9edef"; ctx.font = '600 28px "IBM Plex Sans", sans-serif'; ctx.fillText("Dispatch — Unit 2", 28, 40);
      ctx.fillStyle = "#8696a0"; ctx.font = '400 21px "IBM Plex Sans", sans-serif'; ctx.fillText("Rakesh, Suresh, Anita +11", 28, 70);
      const msgs = [["Rakesh", "#53bdeb", "Patel ka maal kab jayega?"], ["Suresh", "#e9a23b", "kal subah, truck confirm nahi hua"], [null, null, "bill bana diya?"], ["Rakesh", "#53bdeb", "pata nahi, accounts se pucho"]];
      msgs.forEach(([who, col, txt], i) => {
        const y = 118 + i * 98;
        const me = !who;
        ctx.fillStyle = me ? "#005c4b" : "#1f2c34";
        roundRect(ctx, me ? w - 360 : 24, y, me ? 336 : w - 110, 82, 16); ctx.fill();
        if (who) { ctx.fillStyle = col; ctx.font = '600 20px "IBM Plex Sans", sans-serif'; ctx.fillText(who, 44, y + 28); }
        ctx.fillStyle = "#e9edef"; ctx.font = '400 23px "IBM Plex Sans", sans-serif';
        ctx.fillText(txt, me ? w - 340 : 44, y + (who ? 62 : 50));
      });
    },
    note(ctx, w, h) {
      ctx.fillStyle = "#f7d84a"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(0, 0, w, 40);
      ctx.fillStyle = "#3a2e00"; ctx.font = 'italic 600 40px "IBM Plex Sans", sans-serif';
      ["Call Mehulbhai —", "balance", "payment!!", "(Friday)"].forEach((l, i) => ctx.fillText(l, 34, 110 + i * 62));
    },
    slip(ctx, w, h) {
      ctx.fillStyle = "#fbfaf5"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#222"; ctx.font = '600 28px "IBM Plex Mono", monospace'; ctx.fillText("PATEL CASTINGS", 30, 56);
      ctx.fillRect(30, 76, w - 60, 2);
      ctx.font = '400 26px "IBM Plex Mono", monospace';
      [["advance", "1,64,000"], ["balance", "?"], ["chq", "pending?"]].forEach(([k, v], i) => {
        ctx.textAlign = "left"; ctx.fillText(k, 30, 130 + i * 50);
        ctx.textAlign = "right"; ctx.fillText(v, w - 30, 130 + i * 50);
      });
      ctx.textAlign = "left"; ctx.fillRect(30, 270, w - 60, 2);
      ctx.font = 'italic 400 26px "IBM Plex Mono", monospace'; ctx.fillText("ask accounts", 30, 320);
    },
  };
  const size = { register: [640, 460], excel: [720, 380], whatsapp: [560, 520], note: [380, 380], slip: [380, 360] }[kind];
  return canvasTexture(size[0], size[1], draw[kind], renderer);
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const mod = (a, n) => ((a % n) + n) % n;

async function main() {
  // loaded async, so the page may still be parsing
  if (document.readyState === "loading") await new Promise((r) => addEventListener("DOMContentLoaded", r, { once: true }));
  const canvas = document.querySelector(".journey-canvas");
  const journey = document.querySelector("#journey");
  const hero = document.querySelector(".hero");
  if (!canvas || !journey || !hero) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (err) {
    document.documentElement.classList.add("no-webgl");
    return;
  }

  await Promise.all([fontsReady(), whenIdle()]);
  await breathe();

  const small = () => innerWidth < 901;
  const stacked = () => innerWidth < 1201;   // hero stacks copy above the line (see site.css)
  let mobile = small();
  // resolution starts capped and drops further if the device can't keep up (see loop)
  let dpr = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  // shader error checks make the browser wait on every compile; the shaders
  // are fixed, so skip them in production
  renderer.debug.checkShaderErrors = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  // Only static geometry casts shadows, so the shadow map is drawn once rather
  // than every frame; moving crates get a cheap contact shadow instead.
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.ink, 30, 74);

  // reflections from a generated room environment — skipped on phones, where
  // building it is one of the most expensive startup steps
  if (!mobile) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }
  await breathe();

  const camera = new THREE.PerspectiveCamera(22, 1, 1, 200);
  // render-loop state, declared up front: scroll and resize listeners are
  // attached during the staged build and must not touch anything uninitialised
  let ready = false, visible = true, frameQueued = false, lastG = -1;
  let state = { inHero: true, today: false };
  const clock = new THREE.Clock();
  let halfRate = mobile, skip = false, acc = 0, sampleSum = 0, samples = 0;

  // ---- lights
  scene.add(new THREE.HemisphereLight(0xe4ead8, 0x0c0d0a, mobile ? 0.9 : 0.45));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.4);
  key.position.set(9, 18, 13);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 16, bottom: -16, near: 2, far: 60 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  const rim = new THREE.DirectionalLight(C.lime, 0.9);
  rim.position.set(-14, 7, -12);
  scene.add(rim);

  // ---- floor + drafting grid
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: C.floor, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(160, 80, 0x2e3526, 0x1b1f17);
  grid.position.y = 0.004;
  grid.material.transparent = true;
  grid.material.opacity = 0.75;
  // the grid spans the whole floor, so its centre is often nearer the camera
  // than the floating sheets; sorted by distance it would draw over them
  grid.renderOrder = -2;
  scene.add(grid);

  await breathe();
  // ---- conveyor
  const steel = new THREE.MeshStandardMaterial({ color: C.steel, metalness: 0.65, roughness: 0.42 });
  const beltLen = LINE_END - LINE_START;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(beltLen, 0.52, 2.72), steel);
  frame.position.set(0, BELT_TOP - 0.3, 0);
  frame.castShadow = frame.receiveShadow = true;
  scene.add(frame);

  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(beltLen, 0.06, 2.32),
    new THREE.MeshStandardMaterial({ color: C.belt, roughness: 0.95, metalness: 0.1 })
  );
  belt.position.set(0, BELT_TOP, 0);
  belt.receiveShadow = true;
  scene.add(belt);

  const SLAT_STEP = 0.7;
  const slatCount = Math.ceil(beltLen / SLAT_STEP) + 1;
  const slats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.08, 0.025, 2.28),
    new THREE.MeshStandardMaterial({ color: C.slat, roughness: 0.8, metalness: 0.2 }),
    slatCount
  );
  slats.receiveShadow = true;
  scene.add(slats);
  const m4 = new THREE.Matrix4();
  function placeSlats(offset) {
    for (let i = 0; i < slatCount; i++) {
      const x = LINE_START + mod(i * SLAT_STEP + offset, beltLen);
      m4.makeTranslation(x, BELT_TOP + 0.04, 0);
      slats.setMatrixAt(i, m4);
    }
    slats.instanceMatrix.needsUpdate = true;
  }
  placeSlats(0);

  const edge = new THREE.Mesh(new THREE.BoxGeometry(beltLen, 0.045, 0.045), new THREE.MeshBasicMaterial({ color: C.lime }));
  edge.position.set(0, BELT_TOP - 0.02, 1.38);
  scene.add(edge);
  const edgeBack = edge.clone();
  edgeBack.material = new THREE.MeshBasicMaterial({ color: 0x3a5410 });
  edgeBack.position.z = -1.38;
  scene.add(edgeBack);

  const legXs = [];
  for (let x = LINE_START + 1; x <= LINE_END - 1; x += 4) legXs.push(x);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, BELT_TOP - 0.28, 0.22), steel, legXs.length * 2);
  legXs.forEach((x, i) => {
    m4.makeTranslation(x, (BELT_TOP - 0.28) / 2, 1.12);
    legs.setMatrixAt(i * 2, m4);
    m4.makeTranslation(x, (BELT_TOP - 0.28) / 2, -1.12);
    legs.setMatrixAt(i * 2 + 1, m4);
  });
  legs.castShadow = true;
  scene.add(legs);

  await breathe();
  // ---- stations (gantry + sensor head + label)
  const gantryMat = new THREE.MeshStandardMaterial({ color: 0x33382d, metalness: 0.6, roughness: 0.38 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x14160f, metalness: 0.5, roughness: 0.5 });
  const postGeo = new THREE.BoxGeometry(0.2, 3.35, 0.2);
  const barGeo = new THREE.BoxGeometry(0.26, 0.26, 3.5);
  const headGeo = new THREE.BoxGeometry(0.74, 0.38, 0.74);
  const lensGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 24);
  const printerGeo = new THREE.BoxGeometry(0.62, 0.26, 1.0);
  const coneGeo = new THREE.ConeGeometry(0.82, 1.76, 32, 1, true);
  const labelGeo = new THREE.PlaneGeometry(4.2, 1.05);
  const dimColor = new THREE.Color(C.limeDim);
  const limeColor = new THREE.Color(C.lime);

  // Static gantry parts are instanced: one draw call per part type instead of
  // one per station, which keeps the per-frame CPU cost low on phones.
  const docStations = STAGES.map((_, i) => i).filter((i) => STAGES[i].doc);
  function instanced(geo, mat, spots, castShadow = true) {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach(([x, y, z], k) => { m4.makeTranslation(x, y, z); im.setMatrixAt(k, m4); });
    im.castShadow = castShadow;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  }
  instanced(postGeo, gantryMat, STATION_X.flatMap((x) => [[x, 1.675, 1.62], [x, 1.675, -1.62]]));
  instanced(barGeo, gantryMat, STATION_X.map((x) => [x, 3.36, 0]));
  instanced(headGeo, headMat, STATION_X.map((x) => [x, 3.06, 0]));
  instanced(printerGeo, headMat, docStations.map((i) => [STATION_X[i], 3.6, 0]));
  instanced(new THREE.BoxGeometry(0.5, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: C.lime }), docStations.map((i) => [STATION_X[i], 3.745, 0.2]), false);
  // sensor lenses: one instanced mesh with a colour per station for the glow
  const lenses = instanced(lensGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), STATION_X.map((x) => [x, 2.86, 0]), false);
  STATION_X.forEach((_, i) => lenses.setColorAt(i, dimColor));
  const lensColor = new THREE.Color();

  const stations = STAGES.map((stage, i) => {
    const x = STATION_X[i];
    const coneMat = new THREE.MeshBasicMaterial({
      color: C.lime, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, BELT_TOP + 0.9, 0);
    cone.visible = false; // only drawn while a station is glowing
    scene.add(cone);

    const labelTex = labelTexture(i, stage, renderer);
    renderer.initTexture(labelTex);
    const label = new THREE.Mesh(
      labelGeo,
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false, toneMapped: false })
    );
    // sits right of the gantry; issued sheets drift left, so they never cross
    label.position.set(x + (i === STAGES.length - 1 ? 2.2 : 2.4), 5.0, -0.2);
    scene.add(label);
    return { x, cone, coneMat, label, pulse: 0, glow: 0 };
  });

  await breathe();
  // ---- document sheets
  const docTex = {};
  for (const st of STAGES) {
    if (st.doc && !docTex[st.doc]) { docTex[st.doc] = docTexture(st.doc, renderer); renderer.initTexture(docTex[st.doc]); await breathe(); }
  }
  const docGeo = new THREE.PlaneGeometry(1.1, 1.556);
  function sheet(map) {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(docGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat };
  }
  // the hero's time-driven pool: a sheet prints whenever a crate passes a document station
  const docs = Array.from({ length: 8 }, () => Object.assign(sheet(docTex.QUOTATION), { life: 0, dur: 2.8, active: false, x: 0 }));
  function issueDoc(stationIndex, lifeStart = 0) {
    const d = docs.find((dd) => !dd.active) || docs[0];
    d.active = true;
    d.life = lifeStart;
    d.x = STATION_X[stationIndex];
    d.mat.map = docTex[STAGES[stationIndex].doc];
    d.mesh.visible = true;
  }
  // the journey's scroll-driven sheets: one per document station, for ORD-2041
  const storyDocs = docStations.map((s) => Object.assign(sheet(docTex[STAGES[s].doc]), { s }));

  await breathe();
  // ---- WhatsApp bubbles for ORD-2041 (the real default templates)
  const update = (stage) => `Hi Mehul, quick update — your order/project status has moved to: ${stage}. Let us know if you have any questions!`;
  const BUBBLES = [
    null,
    [update("Quote Sent"), "11:40"],
    ["Hi Mehul, thank you for your order! We've received it and will be in touch shortly with next steps.", "16:05"],
    [update("In Production"), "09:30"],
    [update("QC & Dispatch"), "17:45"],
    [update("Invoiced"), "17:52"],
    [update("Payment Collected"), "12:18"],
  ];
  const bubbleGeo = new THREE.PlaneGeometry(2.6, 0.914);
  const bubbles = [];
  for (let s = 0; s < BUBBLES.length; s++) {
    if (!BUBBLES[s]) { bubbles.push(null); continue; }
    const tex = bubbleTexture(BUBBLES[s][0], BUBBLES[s][1], renderer);
    renderer.initTexture(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(bubbleGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    bubbles.push({ mesh, mat });
    await breathe();
  }

  // ---- the six places an order lives today
  const artifactSpec = [
    ["register", 1.9, [-2.4, 0.5, 0.4], 0.14],
    ["excel", 2.3, [2.0, 1.1, -0.5], -0.08],
    ["whatsapp", 1.6, [2.1, -0.9, 0.9], 0.1],
    ["note", 1.0, [-1.7, -1.1, 1.3], -0.18],
    ["slip", 1.05, [0.1, -1.5, -0.1], 0.22],
  ];
  const TODAY_AT = new THREE.Vector3(STATION_X[0] - 1.0, 3.3, 2.0);
  const artifacts = [];
  for (const [kind, width, off, rz] of artifactSpec) {
    const tex = artifactTexture(kind, renderer);
    renderer.initTexture(tex);
    const aspect = tex.image.height / tex.image.width;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * aspect), mat);
    mesh.visible = false;
    scene.add(mesh);
    artifacts.push({ mesh, mat, from: new THREE.Vector3(...off).add(TODAY_AT), rz });
    await breathe();
  }

  await breathe();
  // ---- orders (crates)
  const crateGeo = new RoundedBoxGeometry(1.32, 0.96, 1.32, 3, 0.07);
  const crateMat = new THREE.MeshStandardMaterial({ color: C.kraft, roughness: 0.84, metalness: 0 });
  const tapeGeo = new THREE.BoxGeometry(1.34, 0.02, 0.3);
  const tapeMat = new THREE.MeshStandardMaterial({ color: C.tape, roughness: 0.6 });
  const tagGeo = new THREE.PlaneGeometry(0.78, 0.49);
  const blobGeo = new THREE.PlaneGeometry(2.1, 2.1);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85 });
  let nextOrder = 2042;
  const crateCount = Math.round(beltLen / CRATE_GAP);
  // crate body, tape and contact shadow are instanced (3 draw calls for all
  // crates); only the tag, which has its own texture, is a mesh per crate
  const bodies = new THREE.InstancedMesh(crateGeo, crateMat, crateCount);
  bodies.receiveShadow = true;
  const tapes = new THREE.InstancedMesh(tapeGeo, tapeMat, crateCount);
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, crateCount);
  blobs.renderOrder = -1;
  [blobs, bodies, tapes].forEach((im) => {
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
  });
  const blobRot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  function makeTag() {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 200;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, map: tex });
    const mesh = new THREE.Mesh(tagGeo, mat);
    mesh.position.set(0.12, 0.02, 0.664);
    return { ctx: c.getContext("2d"), tex, mesh };
  }
  const crates = Array.from({ length: crateCount }, (_, k) => {
    const group = new THREE.Group();
    const tag = makeTag();
    group.add(tag.mesh);
    scene.add(group);
    return { group, tag, k, x: 0, order: 0, paid: false };
  });
  function setTag(c, paid) {
    c.paid = paid;
    // redraw the crate's own tag canvas and re-upload it — no new allocations
    drawCrateTag(c.tag.ctx, 320, 200, c.order, paid);
    c.tag.tex.needsUpdate = true;
  }
  crates.forEach((c) => { c.order = nextOrder++; setTag(c, false); });

  // ORD-2041: the order the journey follows, ringed in lime
  const focus = new THREE.Group();
  focus.add(new THREE.Mesh(crateGeo, crateMat));
  const focusTape = new THREE.Mesh(tapeGeo, tapeMat);
  focusTape.position.y = 0.485;
  focus.add(focusTape);
  const focusTag = makeTag();
  focus.add(focusTag.mesh);
  const focusBlob = new THREE.Mesh(blobGeo, blobMat);
  focusBlob.rotation.x = -Math.PI / 2;
  focusBlob.position.y = -0.475;
  focus.add(focusBlob);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.08, 1.16, 64),
    new THREE.MeshBasicMaterial({ color: C.lime, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.46;
  focus.add(ring);
  focus.visible = false;
  scene.add(focus);
  let focusPaid = null;
  function setFocusTag(paid) {
    if (focusPaid === paid) return;
    focusPaid = paid;
    drawCrateTag(focusTag.ctx, 320, 200, 2041, paid);
    focusTag.tex.needsUpdate = true;
  }
  setFocusTag(false);

  // ---- scroll → journey coordinate
  // Sections tagged data-ch="0..N" (hero, today, stages, outro, then the
  // pages after the journey, where the line is a dimmed backdrop). g = index +
  // progress of the section under the middle of the viewport; each section is
  // "settled" when its middle crosses the middle of the screen (g = n + 0.5).
  const sections = [...document.querySelectorAll("[data-ch]")].sort((a, b) => a.dataset.ch - b.dataset.ch);
  const LAST = sections.length - 1;
  const STAGE0 = 2; // data-ch of the first stage (Enquiry)
  const OUTRO = 9;  // data-ch of the journey's last chapter
  let tops = [], heights = [];
  function measure() {
    const y = scrollY;
    tops = sections.map((s) => s.getBoundingClientRect().top + y);
    heights = sections.map((s) => s.offsetHeight || 1);
  }
  measure();
  let sy = scrollY;
  addEventListener("scroll", () => { sy = scrollY; requestFrame(); }, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(() => { measure(); requestFrame(); }).observe(document.body);
  function journeyG() {
    const mid = sy + innerHeight / 2;
    for (let j = LAST; j >= 0; j--) {
      if (mid >= tops[j]) return j + Math.min(1, (mid - tops[j]) / heights[j]);
    }
    return 0.5 * Math.min(1, mid / Math.max(1, tops[0] + heights[0]));
  }

  // ---- camera keyframes, one per section, rebuilt for each breakpoint
  let viewW = 1, viewH = 1;
  const KF = [];
  const kf = (pos, tgt, fov, ox, oy) => ({ pos: new THREE.Vector3(...pos), tgt: new THREE.Vector3(...tgt), fov, ox, oy });
  function stationX(n) { return STATION_X[Math.min(6, Math.max(0, n - STAGE0))]; }
  function layout() {
    mobile = small();
    viewW = canvas.clientWidth || innerWidth;
    viewH = canvas.clientHeight || innerHeight;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    const back = Math.pow(Math.max(1, 1.6 / camera.aspect), 0.9);
    KF.length = 0;
    // 0 · hero: the whole line, framed beside (or below) the headline
    if (stacked()) {
      const t = [0.5, 1.8, 0];
      KF.push(kf([39.5 * back * 0.78 + 0.5, 16 * back * 0.78 + 1.8, 25 * back * 0.78], t, 23, 0, -0.24));
    } else {
      const tight = clamp01((1600 - viewW) / 400), short = clamp01((900 - viewH) / 150), k = back * (1 + 0.12 * tight);
      KF.push(kf([39.5 * k + 2.5, 16 * k + 1.4, 25 * k], [2.5, 1.4, 0], 23, -(0.19 + 0.06 * tight), -(0.1 + 0.05 * short)));
    }
    // 1 · today: the scattered paperwork in front of the first station
    const T = TODAY_AT;
    KF.push(mobile
      ? kf([T.x + 5.2, T.y + 2.8, T.z + 16.5], [T.x + 0.3, T.y + 0.2, T.z], 40, 0, 0.17)
      : kf([T.x + 7.4, T.y + 1.9, T.z + 11.2], [T.x, T.y, T.z], 32, stacked() ? -0.12 : -0.17, -0.02));
    // 2–8 · one keyframe per station, a three-quarter view of the gantry
    for (let s = 0; s < 7; s++) {
      const x = STATION_X[s];
      KF.push(mobile
        ? kf([x + 6.2, 7.4, 16.5], [x, 3.2, 0.3], 36, 0, 0.18)
        : kf([x + 8.6, 5.6, 13.6], [x, 3.0, 0.3], 28, stacked() ? -0.14 : -0.2, -0.03));
    }
    // 9 · outro: pull back to the whole line, framed as in the hero (on
    // phones raised into the space above the card)
    const H = KF[0];
    KF.push(mobile ? kf(H.pos.toArray(), H.tgt.toArray(), H.fov + 4, 0, 0.2)
      : stacked() ? kf(H.pos.toArray(), H.tgt.toArray(), H.fov + 2, -0.16, 0) : H);
    // 10+ · the pages after the journey hold the outro view (site.css dims it),
    // so scrolling through them never re-renders the scene
    while (KF.length < sections.length) KF.push(KF[KF.length - 1]);
    measure();
  }
  layout();

  // ---- interaction state
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!reduce && matchMedia("(pointer: fine)").matches) {
    addEventListener("pointermove", (e) => {
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = (e.clientY / innerHeight) * 2 - 1;
      requestFrame();
    }, { passive: true });
  }

  // ---- per-frame state from the journey coordinate
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), tmp = new THREE.Vector3();
  let timePhase = 0, timeSlat = 0, clockT = 0;
  let prevX = crates.map(() => null);

  function apply(g, dt) {
    // anchors sit at a = 0, 1, 2… (section n settled when a = n); between
    // anchors the camera holds for a while, then glides — reading, then moving
    const a = Math.max(0, g - 0.5);
    let j = Math.min(LAST - 1, Math.floor(a));
    let u = a - j;
    if (a >= LAST) { j = LAST - 1; u = 1; }
    const e = reduce ? (u < 0.5 ? 0 : 1) : smooth(clamp01((u - 0.22) / 0.56));
    const A = KF[j], B = KF[j + 1];

    // camera
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    camPos.lerpVectors(A.pos, B.pos, e);
    camTgt.lerpVectors(A.tgt, B.tgt, e);
    camera.position.set(camPos.x + pointer.sx * 0.9, camPos.y - pointer.sy * 0.5, camPos.z);
    camera.lookAt(camTgt);
    camera.fov = A.fov + (B.fov - A.fov) * e;
    camera.setViewOffset(viewW, viewH, viewW * (A.ox + (B.ox - A.ox) * e), viewH * (A.oy + (B.oy - A.oy) * e), viewW, viewH);
    camera.updateProjectionMatrix();
    const dist = camPos.distanceTo(camTgt);
    scene.fog.near = dist * 0.75;
    scene.fog.far = dist * 2.0;

    // where ORD-2041 sits on the line (it travels with the camera between stations)
    const focusX = stationX(j) + (stationX(j + 1) - stationX(j)) * e;
    const inHero = g < 1;
    const toJourney = smooth(clamp01((g - 1.0) / 0.6)); // hero clock → scroll control

    // ambient crates: on the hero's clock at the top, then locked around ORD-2041
    if (inHero && !reduce) { timePhase += SPEED * dt; timeSlat += SPEED * dt; }
    const tPh = mod(timePhase, CRATE_GAP);
    const jPh = mod(focusX + CRATE_GAP / 2 - LINE_START, CRATE_GAP);
    const d = mod(jPh - tPh + CRATE_GAP / 2, CRATE_GAP) - CRATE_GAP / 2;
    const phase = tPh + d * toJourney;
    const cy = BELT_TOP + 0.51;
    crates.forEach((c, k) => {
      const x = LINE_START + mod(phase + k * CRATE_GAP, beltLen);
      const px = prevX[k];
      if (inHero && px !== null) {
        if (x < px - beltLen / 2) { c.order = nextOrder++; setTag(c, false); }
        else {
          for (let si = 0; si < STATION_X.length; si++) {
            if (px < STATION_X[si] && x >= STATION_X[si]) {
              stations[si].pulse = 1;
              if (STAGES[si].doc) issueDoc(si);
              if (si === 6) setTag(c, true);
              dispatchEvent(new CustomEvent("shapedops:station", { detail: { index: si } }));
            }
          }
        }
      }
      prevX[k] = x;
      c.x = x;
      c.group.position.set(x, cy, 0);
      m4.makeTranslation(x, cy, 0); bodies.setMatrixAt(k, m4);
      m4.makeTranslation(x, cy + 0.485, 0); tapes.setMatrixAt(k, m4);
      m4.copy(blobRot).setPosition(x, cy - 0.475, 0); blobs.setMatrixAt(k, m4);
    });
    bodies.instanceMatrix.needsUpdate = tapes.instanceMatrix.needsUpdate = blobs.instanceMatrix.needsUpdate = true;
    placeSlats(timeSlat + (g >= 1 ? focusX - STATION_X[0] : 0));

    // ORD-2041 forms out of the paperwork, then rides the line
    const form = smooth(clamp01((g - 2.0) / 0.3));
    focus.visible = form > 0.01;
    focus.position.set(focusX, cy, 0);
    focus.scale.setScalar(0.4 + 0.6 * form);
    ring.material.opacity = 0.85 * form;
    setFocusTag(a >= OUTRO - 1.4);

    // the paperwork: drifting in front of station 1, then folding into the order
    const showToday = clamp01((g - 0.85) / 0.3);
    const merge = smooth(clamp01((g - 1.62) / 0.55));
    clockT += dt;
    artifacts.forEach((ar, i) => {
      const o = showToday * (1 - clamp01((merge - 0.78) / 0.22));
      ar.mesh.visible = o > 0.01;
      if (!ar.mesh.visible) return;
      tmp.set(STATION_X[0], cy + 0.2, 0);
      ar.mesh.position.lerpVectors(ar.from, tmp, merge);
      if (!reduce) ar.mesh.position.y += Math.sin(clockT * 0.9 + i * 1.7) * 0.07 * (1 - merge);
      ar.mesh.quaternion.copy(camera.quaternion);
      ar.mesh.rotateZ(ar.rz * (1 - merge));
      ar.mesh.scale.setScalar(1 - 0.82 * merge);
      ar.mat.opacity = o;
    });

    // per-station glow follows the order; documents and messages follow the scroll
    let lensDirty = false;
    stations.forEach((st, s) => {
      const near = clamp01(1 - Math.abs(a - (s + STAGE0)) * 1.6) * (g >= 1.5 ? 1 : 0);
      st.pulse = Math.max(0, st.pulse - dt * 1.3);
      const glow = Math.max(near, st.pulse);
      if (Math.abs(glow - st.glow) > 0.002 || glow > 0) {
        st.glow = glow;
        lenses.setColorAt(s, lensColor.copy(dimColor).lerp(limeColor, glow));
        lensDirty = true;
        st.coneMat.opacity = glow * 0.15;
        st.cone.visible = glow > 0.01;
      }
    });
    if (lensDirty) lenses.instanceColor.needsUpdate = true;

    storyDocs.forEach((sd) => {
      const at = sd.s + STAGE0 - 0.5;           // a-value where this station settles
      const rise = reduce ? (Math.abs(a - (sd.s + STAGE0)) < 0.5 ? 1 : 0) : smooth(clamp01((a - (at + 0.05)) / 0.32));
      const fade = reduce ? rise : rise * (1 - clamp01((a - (at + 0.95)) / 0.2));
      sd.mesh.visible = fade > 0.01;
      if (!sd.mesh.visible) return;
      const x = STATION_X[sd.s];
      // phones frame the station tightly under the chapter bar: keep the sheet low and to the left
      sd.mesh.position.set(x - rise * (mobile ? 1.5 : 1.1), 3.95 + rise * (mobile ? 0.95 : 1.55), 0.25 + rise * 0.7);
      sd.mesh.quaternion.copy(camera.quaternion);
      sd.mesh.rotateZ(0.05 - rise * 0.07);
      sd.mesh.scale.setScalar(0.55 + rise * (mobile ? 0.38 : 0.5));
      sd.mat.opacity = fade;
    });

    bubbles.forEach((b, s) => {
      if (!b) return;
      const at = s + STAGE0 - 0.5;
      const up = reduce ? (Math.abs(a - (s + STAGE0)) < 0.5 ? 1 : 0) : smooth(clamp01((a - (at + 0.14)) / 0.28));
      const fade = reduce ? up : up * (1 - clamp01((a - (at + 1.0)) / 0.18));
      b.mesh.visible = fade > 0.01;
      if (!b.mesh.visible) return;
      b.mesh.position.set(STATION_X[s] + (mobile ? 0.95 : 2.0), 2.2 + up * (mobile ? 1.85 : 1.3), 1.9 + up * 0.3);
      b.mesh.quaternion.copy(camera.quaternion);
      b.mesh.scale.setScalar((0.7 + up * 0.3) * (mobile ? 0.86 : 1));
      b.mat.opacity = fade;
    });

    // the hero's time-driven sheets fade out as the journey takes over
    docs.forEach((dd) => {
      if (!dd.active) return;
      dd.life += dt;
      const t = Math.min(1, dd.life / dd.dur);
      const rise = 1 - Math.pow(1 - t, 3);
      dd.mesh.position.set(dd.x - rise * 1.0, 3.95 + rise * 2.6, 0.2 + rise * 0.6);
      dd.mesh.quaternion.copy(camera.quaternion);
      dd.mesh.rotateZ(0.05 - rise * 0.08);
      dd.mesh.scale.setScalar(0.55 + rise * 0.45);
      dd.mat.opacity = (t < 0.12 ? t / 0.12 : t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1) * (1 - toJourney);
      if (t >= 1) { dd.active = false; dd.mesh.visible = false; }
    });

    stations.forEach((st) => st.label.quaternion.copy(camera.quaternion));
    return { inHero, today: showToday > 0 && merge < 1 };
  }

  // ---- first frame
  if (reduce) issueDoc(5, 1.1);
  state = apply(journeyG(), 0);
  renderer.shadowMap.needsUpdate = true;
  // compile every shader now (including the hidden sheets, bubbles, paperwork
  // and light cones) so nothing compiles mid-scroll
  const hidden = [...docs, ...storyDocs, ...bubbles.filter(Boolean), ...artifacts].map((o) => o.mesh)
    .concat(stations.map((s) => s.cone)).filter((m) => !m.visible);
  hidden.forEach((m) => { m.visible = true; });
  const focusWasVisible = focus.visible;
  focus.visible = true;
  try {
    if (renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, camera);
    else {
      // one object at a time, yielding between, so no single compile step is long
      for (const child of scene.children.slice()) { renderer.compile(child, camera, scene); await breathe(); }
    }
  } catch (e) {}
  hidden.forEach((m) => { m.visible = false; });
  focus.visible = focusWasVisible;
  await breathe();
  state = apply(journeyG(), 0);
  renderer.render(scene, camera);
  canvas.classList.add("ready");
  journey.classList.add("gl-ready");

  // ---- rendering: continuous while the hero animates or the paperwork floats,
  // otherwise only when scroll or the pointer actually changed something
  ready = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; requestFrame(); }, { threshold: 0 }).observe(document.body);
  addEventListener("resize", () => { layout(); requestFrame(); });
  addEventListener("load", () => { measure(); requestFrame(); });

  // Phones render at 30fps so the page itself keeps the frame budget. Elsewhere:
  // if frames run long (while the hero animates, or while scrolling moves the
  // camera), first render fewer pixels — down to 0.75x on desktop — then drop
  // the hero to 30fps.
  let renderedLast = false;
  function adapt(dt) {
    sampleSum += dt; samples++;
    if (samples < 45) return;
    const avg = sampleSum / samples;
    sampleSum = 0; samples = 0;
    if (avg <= 1 / 45) return;
    const floor = mobile ? 1 : 0.75;
    if (dpr > floor) {
      dpr = Math.max(floor, +(dpr - 0.25).toFixed(2));
      renderer.setPixelRatio(dpr);
      layout();
    } else if (!halfRate) {
      halfRate = true;
    }
  }
  function requestFrame() {
    if (!ready || frameQueued || !visible || document.hidden) return;
    frameQueued = true;
    requestAnimationFrame(tick);
  }
  function tick() {
    frameQueued = false;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, clock.getDelta());
    // past the journey the view is fixed, so nothing changes to render
    const g = Math.min(journeyG(), OUTRO + 1);
    const animating = !reduce && (state.inHero || state.today);
    const pointerMoving = Math.abs(pointer.x - pointer.sx) + Math.abs(pointer.y - pointer.sy) > 0.002;
    if (!animating && !pointerMoving && Math.abs(g - lastG) < 1e-5) { renderedLast = false; return; }
    if (halfRate && animating) {
      acc += dt;
      skip = !skip;
      if (skip) { requestFrame(); return; }
    }
    const frameDt = halfRate && animating ? Math.min(0.1, acc) : dt;
    acc = 0;
    if (animating ? !halfRate : renderedLast) adapt(dt);
    renderedLast = true;
    lastG = g;
    state = apply(g, frameDt);
    renderer.render(scene, camera);
    if (!reduce && (state.inHero || state.today || pointerMoving)) requestFrame();
  }
  document.addEventListener("visibilitychange", () => { clock.getDelta(); requestFrame(); });
  requestFrame();
}

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grad.addColorStop(0, "rgba(0,0,0,0.75)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

main().catch(() => {
  document.documentElement.classList.add("no-webgl");
});
