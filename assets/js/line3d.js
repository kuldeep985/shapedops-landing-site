// ShapedOps hero — an order line rendered in WebGL.
// Orders ride a conveyor through the seven stages of the manufacturing
// template; document stages issue a sheet as each order passes.
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

async function main() {
  // loaded async, so the page may still be parsing
  if (document.readyState === "loading") await new Promise((r) => addEventListener("DOMContentLoaded", r, { once: true }));
  const canvas = document.querySelector(".hero-canvas");
  const hero = document.querySelector(".hero");
  if (!canvas || !hero) return;

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
  const target = new THREE.Vector3(1.5, 1.4, 0);

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
      let x = LINE_START + ((i * SLAT_STEP + offset) % beltLen);
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
  // sensor lenses: one instanced mesh with a colour per station for the pulse
  const lenses = instanced(lensGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), STATION_X.map((x) => [x, 2.86, 0]), false);
  STATION_X.forEach((_, i) => lenses.setColorAt(i, dimColor));
  const lensColor = new THREE.Color();

  const stations = STAGES.map((stage, i) => {
    const x = STATION_X[i];
    const g = new THREE.Group();

    const coneMat = new THREE.MeshBasicMaterial({
      color: C.lime, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, BELT_TOP + 0.9, 0);
    cone.visible = false; // only drawn while a station is glowing
    g.add(cone);

    const labelTex = labelTexture(i, stage, renderer);
    renderer.initTexture(labelTex);
    const label = new THREE.Mesh(
      labelGeo,
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false, toneMapped: false })
    );
    // sits right of the gantry; issued sheets drift left, so they never cross
    label.position.set(x + (i === STAGES.length - 1 ? 2.2 : 2.4), 5.0, -0.2);
    g.add(label);

    scene.add(g);
    return { x, cone, coneMat, label, pulse: 0 };
  });

  await breathe();
  // ---- document sheets issued at doc stations
  const docTex = {};
  for (const st of STAGES) {
    if (st.doc && !docTex[st.doc]) { docTex[st.doc] = docTexture(st.doc, renderer); renderer.initTexture(docTex[st.doc]); await breathe(); }
  }
  const docGeo = new THREE.PlaneGeometry(1.1, 1.556);
  const docs = Array.from({ length: 8 }, () => {
    const mat = new THREE.MeshBasicMaterial({ map: docTex.QUOTATION, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(docGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, life: 0, dur: 2.8, active: false, x: 0 };
  });
  function issueDoc(stationIndex, lifeStart = 0) {
    const d = docs.find((dd) => !dd.active) || docs[0];
    d.active = true;
    d.life = lifeStart;
    d.x = STATION_X[stationIndex];
    d.mat.map = docTex[STAGES[stationIndex].doc];
    d.mesh.visible = true;
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
  let nextOrder = 2041;
  const crateCount = Math.ceil(beltLen / CRATE_GAP);
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
  const crates = Array.from({ length: crateCount }, (_, i) => {
    const group = new THREE.Group();
    const tagCanvas = document.createElement("canvas");
    tagCanvas.width = 320; tagCanvas.height = 200;
    const tagTex = new THREE.CanvasTexture(tagCanvas);
    tagTex.colorSpace = THREE.SRGBColorSpace;
    tagTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const tagMat = new THREE.MeshStandardMaterial({ roughness: 0.7, map: tagTex });
    const tag = new THREE.Mesh(tagGeo, tagMat);
    tag.position.set(0.12, 0.02, 0.664);
    group.add(tag);
    scene.add(group);
    const crate = { group, tagMat, tagCtx: tagCanvas.getContext("2d"), tagTex, x: LINE_END - 1.2 - i * CRATE_GAP, passed: -1, order: 0 };
    assignOrder(crate);
    crate.passed = STATION_X.filter((sx) => sx < crate.x).length - 1;
    if (crate.passed >= 6) setTag(crate, true);
    return crate;
  });
  function setTag(crate, paid) {
    // redraw the crate's own tag canvas and re-upload it — no new allocations
    drawCrateTag(crate.tagCtx, 320, 200, crate.order, paid);
    crate.tagTex.needsUpdate = true;
  }
  function assignOrder(crate) {
    crate.order = nextOrder++;
    crate.passed = -1;
    setTag(crate, false);
  }

  // ---- layout / camera framing
  let viewW = 1, viewH = 1;
  const basePos = new THREE.Vector3();
  function layout() {
    mobile = small();
    viewW = canvas.clientWidth || innerWidth;
    viewH = canvas.clientHeight || innerHeight;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    // framed for a 16:10 viewport; back off on narrower screens so the
    // whole line (all seven stations) stays in shot
    const back = Math.pow(Math.max(1, 1.6 / camera.aspect), 0.9);
    if (stacked()) {
      // canvas sits in its own band below the copy — centre the line in it
      target.set(0.5, 1.8, 0);
      basePos.set(39.5, 16, 25).multiplyScalar(back * 0.78).add(target);
      camera.fov = 23;
      camera.clearViewOffset();
    } else {
      // on narrower laptops (1200–1600px) the copy column takes more of the
      // width: pull the camera back a little and slide the line further right
      const tight = Math.min(1, Math.max(0, (1600 - viewW) / 400));
      const short = Math.min(1, Math.max(0, (900 - viewH) / 150));
      target.set(2.5, 1.4, 0);
      basePos.set(39.5, 16, 25).multiplyScalar(back * (1 + 0.12 * tight)).add(target);
      camera.fov = 23;
      // push the line toward the lower right, away from the headline
      camera.setViewOffset(viewW, viewH, -viewW * (0.19 + 0.06 * tight), -viewH * (0.1 + 0.05 * short), viewW, viewH);
    }
    camera.updateProjectionMatrix();
    const dist = basePos.distanceTo(target);
    scene.fog.near = dist * 0.72;
    scene.fog.far = dist * 1.75;
  }
  layout();

  // ---- interaction state
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!reduce && matchMedia("(pointer: fine)").matches) {
    addEventListener("pointermove", (e) => {
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  const tmp = new THREE.Vector3();
  function placeCamera(scrollP) {
    pointer.sx += (pointer.x - pointer.sx) * 0.04;
    pointer.sy += (pointer.y - pointer.sy) * 0.04;
    camera.position.set(
      basePos.x + pointer.sx * 1.6,
      basePos.y - pointer.sy * 0.9 + scrollP * 5,
      basePos.z - scrollP * 3
    );
    tmp.copy(target);
    tmp.y -= scrollP * 1.5;
    camera.lookAt(tmp);
  }

  function billboards() {
    stations.forEach((s) => s.label.quaternion.copy(camera.quaternion));
  }

  // ---- simulation step
  let slatOffset = 0;
  function step(dt) {
    slatOffset = (slatOffset + SPEED * dt) % beltLen;
    placeSlats(slatOffset);

    crates.forEach((c, k) => {
      c.x += SPEED * dt;
      if (c.x > LINE_END - 0.6) {
        c.x = LINE_START + 0.6 + (c.x - (LINE_END - 0.6));
        assignOrder(c);
      }
      const cy = BELT_TOP + 0.51;
      c.group.position.set(c.x, cy, 0);
      m4.makeTranslation(c.x, cy, 0); bodies.setMatrixAt(k, m4);
      m4.makeTranslation(c.x, cy + 0.485, 0); tapes.setMatrixAt(k, m4);
      m4.copy(blobRot).setPosition(c.x, cy - 0.475, 0); blobs.setMatrixAt(k, m4);
      for (let si = c.passed + 1; si < STATION_X.length; si++) {
        if (c.x >= STATION_X[si]) {
          c.passed = si;
          const st = stations[si];
          st.pulse = 1;
          if (STAGES[si].doc) issueDoc(si);
          if (si === 6) setTag(c, true);
          dispatchEvent(new CustomEvent("shapedops:station", { detail: { index: si } }));
        } else break;
      }
    });

    bodies.instanceMatrix.needsUpdate = tapes.instanceMatrix.needsUpdate = blobs.instanceMatrix.needsUpdate = true;

    let lensDirty = false;
    stations.forEach((s, i) => {
      if (s.pulse <= 0) return;
      s.pulse = Math.max(0, s.pulse - dt * 1.3);
      lenses.setColorAt(i, lensColor.copy(dimColor).lerp(limeColor, s.pulse));
      lensDirty = true;
      s.coneMat.opacity = s.pulse * 0.16;
      s.cone.visible = s.pulse > 0.005;
    });
    if (lensDirty) lenses.instanceColor.needsUpdate = true;

    docs.forEach((d) => {
      if (!d.active) return;
      d.life += dt;
      const t = Math.min(1, d.life / d.dur);
      const rise = 1 - Math.pow(1 - t, 3);
      d.mesh.position.set(d.x - rise * 1.0, 3.95 + rise * 2.6, 0.2 + rise * 0.6);
      d.mesh.quaternion.copy(camera.quaternion);
      d.mesh.rotateZ(0.05 - rise * 0.08);
      d.mesh.scale.setScalar(0.55 + rise * 0.45);
      d.mat.opacity = t < 0.12 ? t / 0.12 : t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
      if (t >= 1) { d.active = false; d.mesh.visible = false; }
    });
  }

  // scroll position and hero height are cached from events, so the render loop
  // never forces a style/layout pass in the middle of a frame
  let sy = scrollY, heroH = hero.offsetHeight || innerHeight;
  addEventListener("scroll", () => { sy = scrollY; }, { passive: true });
  addEventListener("resize", () => { heroH = hero.offsetHeight || innerHeight; });
  function heroScroll() {
    return Math.min(1, Math.max(0, sy / heroH));
  }

  function render() {
    billboards();
    renderer.render(scene, camera);
  }

  // ---- first frame
  step(0);
  placeCamera(heroScroll());
  if (reduce) {
    // a representative still: one sheet mid-air over Invoiced
    issueDoc(5, 1.1);
    step(0);
  }
  renderer.shadowMap.needsUpdate = true;
  // compile shaders without blocking the main thread where the GPU allows it
  // compile every shader now (including the hidden document sheets and light
  // cones) so nothing compiles mid-animation
  docs.forEach((d) => { d.mesh.visible = true; });
  stations.forEach((st) => { st.cone.visible = true; });
  try {
    if (renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, camera);
    else {
      // one object at a time, yielding between, so no single compile step is long
      for (const child of scene.children.slice()) { renderer.compile(child, camera, scene); await breathe(); }
    }
  } catch (e) {}
  docs.forEach((d) => { d.mesh.visible = d.active; });
  stations.forEach((st) => { st.cone.visible = st.pulse > 0.005; });
  await breathe();
  render();
  canvas.classList.add("ready");
  hero.classList.add("gl-ready");

  addEventListener("resize", () => { layout(); placeCamera(heroScroll()); render(); });

  if (reduce) return;

  // ---- loop, paused when the hero is off-screen or the tab is hidden
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  const clock = new THREE.Clock();
  // Phones render the line at 30fps so the page itself keeps the frame budget.
  // Elsewhere: if frames run long, first render fewer pixels, then drop to 30fps.
  let halfRate = mobile, skip = false;
  let sampleSum = 0, samples = 0;
  function adapt(dt) {
    sampleSum += dt; samples++;
    if (samples < 45) return;
    const avg = sampleSum / samples;
    sampleSum = 0; samples = 0;
    if (avg <= 1 / 45) return;
    if (dpr > 1) {
      dpr = Math.max(1, +(dpr - 0.25).toFixed(2));
      renderer.setPixelRatio(dpr);
      layout();
    } else if (!halfRate) {
      halfRate = true;
    }
  }
  let acc = 0;
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    if (!visible || document.hidden) return;
    if (halfRate) {
      acc += dt;
      skip = !skip;
      if (skip) return;
    }
    const frameDt = halfRate ? Math.min(0.1, acc) : dt;
    acc = 0;
    if (!halfRate) adapt(dt);
    step(frameDt);
    placeCamera(heroScroll());
    render();
  })();
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
