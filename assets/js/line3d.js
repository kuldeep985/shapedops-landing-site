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
    ctx.font = '500 58px "IBM Plex Mono", monospace';
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

function crateTagTexture(orderNo, paid, renderer) {
  return canvasTexture(320, 200, (ctx, w, h) => {
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
  }, renderer);
}

async function main() {
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

  await fontsReady();

  const small = () => innerWidth < 901;
  let mobile = small();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.ink, 30, 74);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(22, 1, 1, 200);
  const target = new THREE.Vector3(1.5, 1.4, 0);

  // ---- lights
  scene.add(new THREE.HemisphereLight(0xe4ead8, 0x0c0d0a, 0.45));
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

  const stations = STAGES.map((stage, i) => {
    const x = STATION_X[i];
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(postGeo, gantryMat);
    p1.position.set(x, 1.675, 1.62);
    const p2 = p1.clone();
    p2.position.z = -1.62;
    const bar = new THREE.Mesh(barGeo, gantryMat);
    bar.position.set(x, 3.36, 0);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 3.06, 0);
    [p1, p2, bar, head].forEach((m) => { m.castShadow = true; g.add(m); });

    const lensMat = new THREE.MeshBasicMaterial({ color: C.limeDim });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(x, 2.86, 0);
    g.add(lens);

    const coneMat = new THREE.MeshBasicMaterial({
      color: C.lime, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, BELT_TOP + 0.9, 0);
    g.add(cone);

    if (stage.doc) {
      const printer = new THREE.Mesh(printerGeo, headMat);
      printer.position.set(x, 3.6, 0);
      printer.castShadow = true;
      g.add(printer);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: C.lime }));
      slot.position.set(x, 3.745, 0.2);
      g.add(slot);
    }

    const label = new THREE.Mesh(
      labelGeo,
      new THREE.MeshBasicMaterial({ map: labelTexture(i, stage, renderer), transparent: true, depthWrite: false, toneMapped: false })
    );
    label.position.set(x + 1.55, 5.0, -0.2);
    g.add(label);

    scene.add(g);
    return { x, lens, lensMat, coneMat, label, pulse: 0 };
  });

  // ---- document sheets issued at doc stations
  const docTex = {};
  STAGES.forEach((s) => { if (s.doc && !docTex[s.doc]) docTex[s.doc] = docTexture(s.doc, renderer); });
  const docGeo = new THREE.PlaneGeometry(1.1, 1.556);
  const docs = Array.from({ length: 8 }, () => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
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
    d.mat.needsUpdate = true;
    d.mesh.visible = true;
  }

  // ---- orders (crates)
  const crateGeo = new RoundedBoxGeometry(1.32, 0.96, 1.32, 3, 0.07);
  const crateMat = new THREE.MeshStandardMaterial({ color: C.kraft, roughness: 0.84, metalness: 0 });
  const tapeGeo = new THREE.BoxGeometry(1.34, 0.02, 0.3);
  const tapeMat = new THREE.MeshStandardMaterial({ color: C.tape, roughness: 0.6 });
  const tagGeo = new THREE.PlaneGeometry(0.78, 0.49);
  let nextOrder = 2041;
  const crateCount = Math.ceil(beltLen / CRATE_GAP);
  const crates = Array.from({ length: crateCount }, (_, i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(crateGeo, crateMat);
    body.castShadow = body.receiveShadow = true;
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.y = 0.485;
    const tagMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const tag = new THREE.Mesh(tagGeo, tagMat);
    tag.position.set(0.12, 0.02, 0.664);
    group.add(body, tape, tag);
    scene.add(group);
    const crate = { group, tagMat, x: LINE_END - 1.2 - i * CRATE_GAP, passed: -1, order: 0 };
    assignOrder(crate);
    crate.passed = STATION_X.filter((sx) => sx < crate.x).length - 1;
    if (crate.passed >= 6) setTag(crate, true);
    return crate;
  });
  function setTag(crate, paid) {
    if (crate.tagMat.map) crate.tagMat.map.dispose();
    crate.tagMat.map = crateTagTexture(crate.order, paid, renderer);
    crate.tagMat.needsUpdate = true;
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
    if (mobile) {
      // canvas sits in its own band below the copy — centre the line in it
      target.set(0.5, 1.8, 0);
      basePos.set(39.5, 16, 25).multiplyScalar(back * 0.78).add(target);
      camera.fov = 23;
      camera.clearViewOffset();
    } else {
      target.set(2.5, 1.4, 0);
      basePos.set(39.5, 16, 25).multiplyScalar(back).add(target);
      camera.fov = 23;
      // push the line toward the lower right, away from the headline
      camera.setViewOffset(viewW, viewH, -viewW * 0.19, -viewH * 0.1, viewW, viewH);
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

    crates.forEach((c) => {
      c.x += SPEED * dt;
      if (c.x > LINE_END - 0.6) {
        c.x = LINE_START + 0.6 + (c.x - (LINE_END - 0.6));
        assignOrder(c);
      }
      c.group.position.set(c.x, BELT_TOP + 0.51, 0);
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

    stations.forEach((s) => {
      s.pulse = Math.max(0, s.pulse - dt * 1.3);
      s.lensMat.color.copy(dimColor).lerp(limeColor, s.pulse);
      s.coneMat.opacity = s.pulse * 0.16;
    });

    docs.forEach((d) => {
      if (!d.active) return;
      d.life += dt;
      const t = Math.min(1, d.life / d.dur);
      const rise = 1 - Math.pow(1 - t, 3);
      d.mesh.position.set(d.x, 3.95 + rise * 2.6, 0.2 + rise * 0.6);
      d.mesh.quaternion.copy(camera.quaternion);
      d.mesh.rotateZ(0.05 - rise * 0.08);
      d.mesh.scale.setScalar(0.55 + rise * 0.45);
      d.mat.opacity = t < 0.12 ? t / 0.12 : t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
      if (t >= 1) { d.active = false; d.mesh.visible = false; }
    });
  }

  function heroScroll() {
    const h = hero.offsetHeight || innerHeight;
    return Math.min(1, Math.max(0, scrollY / h));
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
  render();
  canvas.classList.add("ready");
  hero.classList.add("gl-ready");

  addEventListener("resize", () => { layout(); placeCamera(heroScroll()); render(); });

  if (reduce) return;

  // ---- loop, paused when the hero is off-screen or the tab is hidden
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    if (!visible || document.hidden) return;
    step(dt);
    placeCamera(heroScroll());
    render();
  })();
}

main().catch(() => {
  document.documentElement.classList.add("no-webgl");
});
