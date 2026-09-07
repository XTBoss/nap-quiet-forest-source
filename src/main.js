import "./style.css";
import {
  DEFAULT_COMBINE,
  canCombine,
  combinableSmallTrees,
  parseCombineCount,
  pickSmallTreeToRemove,
  remainingToCombine,
} from "./forest.js";

const RING_LENGTH = 2 * Math.PI * 52;
const GRACE_MS = 2000;
const COMBINE_DELAY_MS = 1800;
const SETTINGS_KEY = "nap-quiet-forest-settings";
const FOREST_KEY = "nap-quiet-forest-session";
const SMALL_SLOTS = [14, 30, 46, 62, 78, 22, 38, 54, 70, 86, 10, 94];
const BIG_SLOTS = [18, 40, 62, 84, 28, 52, 74];

const els = {
  stars: document.getElementById("stars"),
  overlay: document.getElementById("startOverlay"),
  drawer: document.getElementById("settingsDrawer"),
  settingsBtn: document.getElementById("settingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  startMicBtn: document.getElementById("startMicBtn"),
  startDemoBtn: document.getElementById("startDemoBtn"),
  stopBtn: document.getElementById("stopBtn"),
  dbValue: document.getElementById("dbValue"),
  statusText: document.getElementById("statusText"),
  progressText: document.getElementById("progressText"),
  progressRing: document.getElementById("progressRing"),
  smallCount: document.getElementById("smallCount"),
  bigCount: document.getElementById("bigCount"),
  trees: document.getElementById("trees"),
  emptyForest: document.getElementById("emptyForest"),
  remainCount: document.getElementById("remainCount"),
  remainLabel: document.getElementById("remainLabel"),
  settingsForm: document.getElementById("settingsForm"),
  toast: document.getElementById("toast"),
  noiseBtn: document.getElementById("noiseBtn"),
  thresholdInput: document.getElementById("thresholdInput"),
  thresholdOutput: document.getElementById("thresholdOutput"),
  durationInput: document.getElementById("durationInput"),
  loseThresholdInput: document.getElementById("loseThresholdInput"),
  loseThresholdOutput: document.getElementById("loseThresholdOutput"),
  loseDurationInput: document.getElementById("loseDurationInput"),
  combineInput: document.getElementById("combineInput"),
  calibrateBtn: document.getElementById("calibrateBtn"),
  resetForestBtn: document.getElementById("resetForestBtn"),
};

const state = {
  running: false,
  demo: false,
  db: 0,
  quietMs: 0,
  loudMs: 0,
  loseMs: 0,
  lastTs: 0,
  trees: [],
  nextId: 1,
  combining: false,
  losing: false,
  loopId: 0,
  audio: null,
  demoLoud: false,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    els.thresholdInput.value = saved.threshold ?? 42;
    els.durationInput.value = saved.durationMinutes ?? 20;
    els.loseThresholdInput.value = saved.loseThreshold ?? 55;
    els.loseDurationInput.value = saved.loseDurationMinutes ?? 10;
    els.combineInput.value = saved.combineCount ?? DEFAULT_COMBINE;
  } catch {
    /* keep defaults */
  }
  syncSettingOutputs();
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      threshold: Number(els.thresholdInput.value),
      durationMinutes: Number(els.durationInput.value),
      loseThreshold: Number(els.loseThresholdInput.value),
      loseDurationMinutes: Number(els.loseDurationInput.value),
      combineCount: Number(els.combineInput.value),
    }),
  );
}

function loadForest() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FOREST_KEY) || "null");
    if (!saved) return;
    state.trees = (saved.trees ?? []).map((tree) => ({
      ...tree,
      anim: tree.anim === "tree--merge" || tree.anim === "tree--wilt" ? "" : tree.anim,
    }));
    state.nextId = saved.nextId ?? 1;
    state.quietMs = saved.quietMs ?? 0;
    state.loseMs = saved.loseMs ?? 0;
    state.combining = false;
    state.losing = false;
  } catch {
    /* start empty */
  }
}

function saveForest() {
  sessionStorage.setItem(
    FOREST_KEY,
    JSON.stringify({
      trees: state.trees,
      nextId: state.nextId,
      quietMs: state.quietMs,
      loseMs: state.loseMs,
    }),
  );
}

function settings() {
  const durationMinutes = Math.max(0.1, Number(els.durationInput.value) || 20);
  const loseDurationMinutes = Math.max(0.1, Number(els.loseDurationInput.value) || 10);
  return {
    threshold: Number(els.thresholdInput.value),
    durationMs: durationMinutes * 60 * 1000,
    loseThreshold: Number(els.loseThresholdInput.value),
    loseDurationMs: loseDurationMinutes * 60 * 1000,
    combineCount: parseCombineCount(els.combineInput.value, DEFAULT_COMBINE),
  };
}

function syncRemainLabel() {
  const need = settings().combineCount;
  const small = counts().small;
  const remain = remainingToCombine(small, need);
  if (state.combining) {
    els.remainCount.textContent = String(need);
    els.remainLabel.textContent = "棵小树正在合成 1 棵大树";
    return;
  }
  if (small === 0) {
    els.remainCount.textContent = String(need);
    els.remainLabel.textContent = "棵小树合成 1 棵大树";
    return;
  }
  els.remainCount.textContent = String(remain);
  els.remainLabel.textContent =
    remain === 0 ? "棵小树可以合成 1 棵大树" : `再种 ${remain} 棵就能合成大树`;
}

function syncSettingOutputs() {
  els.thresholdOutput.value = els.thresholdInput.value;
  els.loseThresholdOutput.value = els.loseThresholdInput.value;
  syncRemainLabel();
}

function paintStars() {
  const bits = [];
  for (let i = 0; i < 42; i += 1) {
    const left = Math.random() * 100;
    const top = Math.random() * 55;
    const delay = Math.random() * 2.8;
    const size = Math.random() > 0.8 ? 3 : 2;
    bits.push(
      `<span class="star" style="left:${left}%;top:${top}%;animation-delay:${delay}s;width:${size}px;height:${size}px"></span>`,
    );
  }
  els.stars.innerHTML = bits.join("");
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function showToast(text) {
  els.toast.hidden = false;
  els.toast.textContent = text;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2400);
}

function counts() {
  return {
    small: state.trees.filter((tree) => tree.kind === "small").length,
    big: state.trees.filter((tree) => tree.kind === "big").length,
  };
}

function renderForest() {
  const { small, big } = counts();
  els.smallCount.textContent = String(small);
  els.bigCount.textContent = String(big);
  els.emptyForest.hidden = state.trees.length > 0;
  syncRemainLabel();
  els.trees.innerHTML = state.trees
    .map(
      (tree) => `
        <div
          class="tree tree--${tree.kind} ${tree.anim ?? ""}"
          style="left:${tree.x}%; animation-delay:${tree.sway}s"
        >
          <span class="tree__crown"></span>
          <span class="tree__trunk"></span>
        </div>
      `,
    )
    .join("");
}

function nextSlot(kind) {
  const slots = kind === "big" ? BIG_SLOTS : SMALL_SLOTS;
  const used = state.trees.filter((tree) => tree.kind === kind).map((tree) => tree.x);
  const free = slots.find((x) => !used.some((value) => Math.abs(value - x) < 5));
  return free ?? slots[used.length % slots.length];
}

function plantSmallTree() {
  state.trees.push({
    id: state.nextId,
    kind: "small",
    x: nextSlot("small"),
    sway: Math.random() * 2,
    anim: "tree--sprout",
  });
  state.nextId += 1;
  renderForest();
  saveForest();
  showToast("种下一棵小树了");
  window.setTimeout(() => tryCombine(), COMBINE_DELAY_MS);
}

function loseSmallTree() {
  if (state.losing || state.combining) return;
  const victim = pickSmallTreeToRemove(state.trees);
  if (!victim) return;

  state.losing = true;
  victim.anim = "tree--wilt";
  renderForest();
  window.setTimeout(() => {
    state.trees = state.trees.filter((tree) => tree.id !== victim.id);
    state.losing = false;
    renderForest();
    saveForest();
    showToast("太吵了，少了一棵小树");
  }, 700);
}

function tryCombine() {
  if (state.combining) return;
  const need = settings().combineCount;
  if (!canCombine(state.trees, need)) return;

  const merging = combinableSmallTrees(state.trees).slice(0, need);
  if (merging.length !== need) return;

  state.combining = true;
  merging.forEach((tree) => {
    tree.anim = "tree--merge";
  });
  renderForest();
  const mergeIds = new Set(merging.map((tree) => tree.id));

  window.setTimeout(() => {
    state.trees = state.trees.filter((tree) => !mergeIds.has(tree.id));
    state.trees.push({
      id: state.nextId,
      kind: "big",
      x: nextSlot("big"),
      sway: Math.random() * 2,
      anim: "tree--bloom",
    });
    state.nextId += 1;
    state.combining = false;
    renderForest();
    saveForest();
    showToast(`${need} 棵小树合成了一棵大树`);
    tryCombine();
  }, 760);
}

function rmsToDb(rms) {
  if (rms < 1e-6) return 0;
  const dbfs = 20 * Math.log10(rms);
  return Math.max(0, Math.min(100, dbfs + 90));
}

async function startMic() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    video: false,
  });
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  state.audio = {
    stream,
    ctx,
    analyser,
    data,
    read() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return rmsToDb(Math.sqrt(sum / data.length));
    },
    stop() {
      stream.getTracks().forEach((track) => track.stop());
      ctx.close();
    },
  };
}

function startDemo() {
  state.demoLoud = false;
  els.noiseBtn.textContent = "教室开始吵";
  state.audio = {
    read() {
      if (state.demoLoud) return 68 + Math.random() * 8;
      return 28 + Math.random() * 6;
    },
    stop() {},
  };
}

function stopListening() {
  state.running = false;
  state.loopId += 1;
  state.demo = false;
  state.demoLoud = false;
  state.audio?.stop();
  state.audio = null;
  els.overlay.hidden = false;
  els.stopBtn.hidden = true;
  els.noiseBtn.hidden = true;
  els.noiseBtn.textContent = "教室开始吵";
  document.body.classList.remove("is-loud");
  els.dbValue.textContent = "--";
  els.statusText.textContent = "还没有开始听教室的声音";
  els.progressText.textContent = "设定安静时长后，小朋友午睡就能种树";
}

function begin(demo) {
  state.loopId += 1;
  const loopId = state.loopId;
  state.running = true;
  state.demo = demo;
  state.lastTs = performance.now();
  els.overlay.hidden = true;
  els.stopBtn.hidden = false;
  els.noiseBtn.hidden = !demo;
  requestAnimationFrame((now) => tick(now, loopId));
}

function tick(now, loopId) {
  if (state.loopId !== loopId || !state.running || !state.audio) return;
  const dt = Math.min(250, now - state.lastTs);
  state.lastTs = now;

  const raw = state.audio.read();
  state.db = state.db === 0 ? raw : state.db * 0.82 + raw * 0.18;
  const { threshold, durationMs, loseThreshold, loseDurationMs } = settings();
  const effectiveLose = Math.max(loseThreshold, threshold);
  const quiet = state.db < threshold;
  const tooLoud = state.db >= effectiveLose;

  if (quiet) {
    state.loudMs = 0;
    state.quietMs += dt;
  } else {
    state.loudMs += dt;
    if (state.loudMs >= GRACE_MS) {
      state.quietMs = 0;
    }
  }

  if (tooLoud && pickSmallTreeToRemove(state.trees)) {
    state.loseMs += dt;
  } else {
    state.loseMs = 0;
  }

  if (state.quietMs >= durationMs) {
    state.quietMs = 0;
    plantSmallTree();
  }

  if (state.loseMs >= loseDurationMs) {
    state.loseMs = 0;
    loseSmallTree();
  }

  const loudNow = !quiet && state.loudMs >= GRACE_MS;
  document.body.classList.toggle("is-loud", loudNow);
  els.dbValue.textContent = String(Math.round(state.db));
  els.statusText.textContent = loudNow ? "有点吵了" : "教室很安静";

  const plantRemain = Math.max(0, durationMs - state.quietMs);
  const loseRemain = Math.max(0, loseDurationMs - state.loseMs);
  const hasSmall = Boolean(pickSmallTreeToRemove(state.trees));
  if (tooLoud && hasSmall) {
    els.progressText.textContent = `再吵 ${formatClock(loseRemain)} 会少一棵小树`;
  } else if (loudNow) {
    els.progressText.textContent = "声音小下去后，种树进度会重新开始";
  } else {
    els.progressText.textContent = `再安静 ${formatClock(plantRemain)} 就能种一棵小树`;
  }

  const progress = tooLoud && hasSmall
    ? Math.min(1, state.loseMs / loseDurationMs)
    : Math.min(1, state.quietMs / durationMs);
  els.progressRing.style.strokeDasharray = String(RING_LENGTH);
  els.progressRing.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));

  if (now % 1000 < 20) saveForest();
  requestAnimationFrame((next) => tick(next, loopId));
}

els.startMicBtn.addEventListener("click", async () => {
  try {
    await startMic();
    begin(false);
  } catch {
    showToast("没有拿到麦克风权限，可先用演示模式");
  }
});

els.startDemoBtn.addEventListener("click", () => {
  startDemo();
  begin(true);
  showToast("演示中：默认是安静教室，点右下角可以让教室吵起来");
});

els.stopBtn.addEventListener("click", stopListening);
els.settingsBtn.addEventListener("click", () => {
  els.drawer.hidden = false;
});
els.closeSettingsBtn.addEventListener("click", () => {
  els.drawer.hidden = true;
});
els.drawer.addEventListener("click", (event) => {
  if (event.target === els.drawer) els.drawer.hidden = true;
});

els.thresholdInput.addEventListener("input", () => {
  syncSettingOutputs();
  saveSettings();
});
els.loseThresholdInput.addEventListener("input", () => {
  syncSettingOutputs();
  saveSettings();
});
els.durationInput.addEventListener("change", saveSettings);
els.loseDurationInput.addEventListener("change", saveSettings);
els.combineInput.addEventListener("input", () => {
  syncSettingOutputs();
  saveSettings();
});

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (chip.dataset.plantMinutes) els.durationInput.value = chip.dataset.plantMinutes;
    if (chip.dataset.loseMinutes) els.loseDurationInput.value = chip.dataset.loseMinutes;
    saveSettings();
  });
});

els.calibrateBtn.addEventListener("click", () => {
  if (!state.running) {
    showToast("请先开始监听或演示，再校准");
    return;
  }
  const next = Math.min(80, Math.max(18, Math.round(state.db + 8)));
  els.thresholdInput.value = String(next);
  syncSettingOutputs();
  saveSettings();
  showToast(`安静阈值已设为 ${next} 分贝`);
});

els.resetForestBtn.addEventListener("click", () => {
  state.trees = [];
  state.quietMs = 0;
  state.loseMs = 0;
  state.combining = false;
  state.losing = false;
  renderForest();
  saveForest();
  showToast("小森林已清空");
});

els.noiseBtn.addEventListener("click", () => {
  state.demoLoud = !state.demoLoud;
  els.noiseBtn.textContent = state.demoLoud ? "教室安静下来" : "教室开始吵";
});

loadSettings();
loadForest();
paintStars();
renderForest();
els.progressRing.style.strokeDasharray = String(RING_LENGTH);
els.progressRing.style.strokeDashoffset = String(RING_LENGTH);
