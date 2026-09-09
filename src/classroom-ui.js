import "./classroom.css";
import { createIcons, Trees, Smile, Frown, UsersRound, Undo2, Maximize, Minimize, Settings2, Plus, Minus, X, History, ArrowUp, ArrowDown, Pencil, Archive, RotateCcw, Upload, Download, Check } from "lucide";
import { CLASSROOM_KEY, newClassroom, validateClassroom, addStudents, recordAction, undoAction, balancesFor, faces, lastAction, MAX_STUDENTS, PRESET_AVATARS } from "./classroom.js";

const icons = { Trees, Smile, Frown, UsersRound, Undo2, Maximize, Minimize, Settings2, Plus, Minus, X, History, ArrowUp, ArrowDown, Pencil, Archive, RotateCcw, Upload, Download, Check };
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const paintIcons = (root = document) => createIcons({ icons, root, attrs: { "stroke-width": 1.8 } });
const avatarCache = new Map();

function avatarSource(value) {
  if (!value.startsWith("preset:")) return value;
  if (avatarCache.has(value)) return avatarCache.get(value);
  const index = Number(value.slice(7));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const backgrounds = ["#dcecdf", "#f6e7b5", "#e2e5f3", "#f7e0dc", "#d9edf0", "#e6ebd3", "#eadff0", "#e1ebf4", "#f4dfc9", "#d9e6fa"];
  const shirts = ["#568b6e", "#c99848", "#7e81a8", "#c97f81", "#55969b", "#90a253", "#9d7fa5", "#6088b1", "#b66755", "#587f94", "#9f8052", "#6e9367"];
  const skins = ["#f5d4b5", "#edc19d", "#dca983", "#c78d67", "#a96f50"];
  const hairs = ["#332c2a", "#5a3d2e", "#7a573b", "#252b35", "#8a6448", "#47342e"];
  const group = Math.floor(index / 10);
  const style = index % 10;
  const skin = skins[(index * 3 + group) % skins.length];
  const hair = hairs[(index + group * 2) % hairs.length];
  const ellipse = (x, y, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  const line = (points, color, width = 3) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); points.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
  ctx.fillStyle = backgrounds[(index + group) % backgrounds.length]; ctx.fillRect(0, 0, 128, 128);
  if (group === 1 || group === 4) {
    ctx.globalAlpha = .22;
    for (let x = -20; x < 150; x += 24) line([[x, 0], [x + 60, 128]], "#ffffff", 8);
    ctx.globalAlpha = 1;
  } else if (group === 2 || group === 5) {
    ctx.globalAlpha = .22;
    for (const [x, y] of [[18, 22], [106, 30], [25, 104], [101, 99]]) ellipse(x, y, 10, 10, "#ffffff");
    ctx.globalAlpha = 1;
  }
  ellipse(64, 128, 47, 40, shirts[(index * 5 + group) % shirts.length]);
  if (style === 3 || style === 8) { ellipse(25, 67, 14, 24, hair); ellipse(103, 67, 14, 24, hair); }
  if (style === 4) { ellipse(36, 30, 13, 15, hair); ellipse(92, 30, 13, 15, hair); }
  if (style === 6) { ellipse(97, 41, 17, 20, hair); }
  ellipse(64, 61, 35 + (style % 3), 41, hair);
  ellipse(64, 94, 10, 13, skin);
  ellipse(34, 66, 7, 10, skin); ellipse(94, 66, 7, 10, skin);
  ellipse(64, 66, 29 + (style % 2), 33, skin);
  if (style === 0) { ellipse(50, 40, 22, 13, hair); ellipse(80, 39, 20, 12, hair); }
  if (style === 1) { ellipse(64, 39, 31, 13, hair); line([[43, 43], [47, 54]], hair, 8); }
  if (style === 2) { for (let x = 40; x <= 88; x += 12) ellipse(x, 40 + Math.abs(64 - x) / 10, 9, 10, hair); }
  if (style === 3) { ellipse(53, 40, 22, 13, hair); ellipse(80, 41, 18, 12, hair); }
  if (style === 4) { ellipse(64, 40, 31, 12, hair); line([[50, 42], [54, 53]], hair, 7); line([[78, 42], [74, 53]], hair, 7); }
  if (style === 5) { line([[38, 46], [49, 34], [57, 46], [68, 33], [77, 45], [91, 36]], hair, 11); }
  if (style === 6) { ellipse(54, 39, 24, 13, hair); ellipse(82, 43, 15, 12, hair); }
  if (style === 7) { ellipse(64, 39, 32, 12, hair); for (let x = 40; x <= 88; x += 12) line([[x, 39], [x + 5, 50]], hair, 5); }
  if (style === 8) { ellipse(50, 41, 21, 14, hair); ellipse(81, 40, 19, 12, hair); }
  if (style === 9) { for (const [x, y] of [[41, 43], [51, 36], [63, 38], [75, 35], [87, 43]]) ellipse(x, y, 10, 10, hair); }
  const eyeColor = "#3f3835";
  if (group === 3) {
    ctx.strokeStyle = "#55616f"; ctx.lineWidth = 2.2;
    for (const x of [51, 77]) { ctx.beginPath(); ctx.ellipse(x, 65, 10, 8, 0, 0, Math.PI * 2); ctx.stroke(); }
    line([[61, 65], [67, 65]], "#55616f", 2);
  }
  ellipse(52, 65, 2.5, 3, eyeColor); ellipse(77, 65, 2.5, 3, eyeColor);
  ellipse(44, 76, 6, 3, "#df9d89"); ellipse(84, 76, 6, 3, "#df9d89");
  ctx.strokeStyle = "#805443"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(64, 76, 8, .2, Math.PI - .2); ctx.stroke();
  if (group === 1) { line([[43, 32], [64, 24], [87, 32]], shirts[(index + 3) % shirts.length], 7); }
  if (group === 2) { ellipse(90, 91, 4, 4, "#f1cc63"); }
  if (group === 4) { line([[49, 102], [64, 115], [79, 102]], "#ffffff", 3); }
  if (group === 5) { ellipse(37, 90, 5, 5, "#ffffff"); ellipse(91, 90, 5, 5, "#ffffff"); }
  const source = canvas.toDataURL("image/png");
  avatarCache.set(value, source);
  return source;
}

async function photoSource(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10_000_000) throw new Error("请选择 10MB 以内的 JPG、PNG 或 WebP 图片");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", .8);
}

export function initClassroom() {
  const $ = (id) => document.getElementById(id);
  const root = $("classroomModule");
  const grid = $("studentGrid");
  const dialog = $("classDialog");
  const body = $("classDialogBody");
  let data = newClassroom();
  let ready = false;
  let fileMode = false;
  let blocked = false;
  let dirty = false;
  let saving = false;
  let localSaved = true;
  let baseRevision = 0;
  let generation = 0;
  let selected = new Set();
  let display = false;
  let toastTimer;
  let fitFrame;

  function toast(message) {
    $("classToast").textContent = message;
    $("classToast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("classToast").hidden = true; }, 2800);
  }

  function warning(message = "") {
    $("classWarningText").textContent = message;
    $("classWarning").hidden = !message;
  }

  function cache() {
    try {
      localStorage.setItem(CLASSROOM_KEY, JSON.stringify({ data, dirty, baseRevision }));
      localSaved = true;
    } catch {
      localSaved = false;
      warning("浏览器保存空间不足，请导出备份。关闭前请确认本地文件已保存。");
    }
  }

  async function request(method, payload) {
    const response = await fetch("/api/classroom", {
      method,
      headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("本地保存服务不可用");
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "本地保存失败");
      error.status = response.status;
      throw error;
    }
    if (result.data !== null) validateClassroom(result.data);
    return result.data;
  }

  async function flush() {
    if (saving || !fileMode || blocked || !dirty) return;
    saving = true;
    $("classSaveStatus").textContent = "保存中";
    try {
      while (dirty && !blocked) {
        const currentGeneration = generation;
        const saved = await request("PUT", { data, baseRevision });
        baseRevision = saved.revision;
        data = { ...data, revision: baseRevision };
        dirty = currentGeneration !== generation;
        cache();
      }
      $("classSaveStatus").textContent = "已保存到本地文件";
      if (localSaved) warning();
    } catch (error) {
      blocked = true;
      cache();
      $("classSaveStatus").textContent = localSaved ? "已保存到浏览器" : "保存失败";
      warning(error.status === 409 ? "其他窗口已更新班级数据。请先导出当前数据，再重新连接并载入最新版本。" : "本地文件保存失败。当前更改" + (localSaved ? "已保留在浏览器，请重新连接。" : "尚未保存，请立即导出备份。"));
    } finally {
      saving = false;
      refreshControls();
    }
  }

  function commit(next, message) {
    if (!ready || blocked) throw new Error("请先重新连接班级数据");
    data = validateClassroom(next);
    dirty = true;
    generation += 1;
    cache();
    render();
    if (fileMode) void flush();
    else $("classSaveStatus").textContent = localSaved ? "已保存到浏览器" : "保存失败";
    if (message) toast(message);
  }

  async function load(reconnect = false) {
    if (saving) return;
    ready = false;
    refreshControls();
    $("classSaveStatus").textContent = "正在读取";
    let cached;
    let cacheError = false;
    if (reconnect) cached = { data, dirty, baseRevision };
    else {
      try {
        const raw = localStorage.getItem(CLASSROOM_KEY);
        if (raw) {
          cached = JSON.parse(raw);
          validateClassroom(cached.data);
          if (!Number.isSafeInteger(cached.baseRevision) || typeof cached.dirty !== "boolean") throw new Error("invalid cache");
        }
      } catch { cached = null; cacheError = true; }
    }
    if (cached) { data = cached.data; dirty = cached.dirty; baseRevision = cached.baseRevision; }
    try {
      const remote = await request("GET");
      fileMode = true;
      blocked = false;
      if (cached?.dirty && (remote?.revision ?? 0) !== baseRevision) {
        const same = remote && JSON.stringify({ ...remote, revision: 0 }) === JSON.stringify({ ...data, revision: 0 });
        if (!same) {
          blocked = true;
          warning("浏览器中的待保存数据与本地文件不一致，请导出备份后载入最新版本。");
          $("classSaveStatus").textContent = "数据需要确认";
          showConflict(remote);
        } else { data = remote; baseRevision = remote.revision; dirty = false; }
      } else if (!cached?.dirty && remote) {
        data = remote; baseRevision = remote.revision; dirty = false;
      } else if (!remote) {
        baseRevision = 0;
        dirty = Boolean(cached);
      }
      if (!blocked) {
        cache();
        warning();
        $("classSaveStatus").textContent = "已保存到本地文件";
      }
    } catch (error) {
      fileMode = false;
      blocked = Boolean(error.status && error.status !== 404) || (cacheError && !cached);
      $("classSaveStatus").textContent = blocked ? "读取失败" : "仅保存在浏览器";
      warning(blocked ? "保存的数据未能读取，请先检查备份文件后重新连接。" : "本地文件服务未连接，当前数据仅保存在此浏览器中。");
    }
    ready = true;
    render();
    if (!blocked && dirty && fileMode) void flush();
  }

  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `班级笑脸墙-${data.className.replace(/[\\/:*?"<>|]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showConflict(remote) {
    openDialog("选择班级数据", `<p>当前浏览器有尚未同步的更改，本地文件也已更新。</p><div class="c-actions"><button type="button" class="c-button" id="conflictExport">${icon("download")}导出当前数据</button><button type="button" class="c-button c-primary" id="conflictLoad">载入本地文件版本</button></div>`);
    $("conflictExport").onclick = exportData;
    $("conflictLoad").onclick = () => {
      if (!window.confirm("载入本地文件版本将替换当前浏览器数据。未同步的更改请先导出备份。继续？")) return;
      data = remote || newClassroom(); baseRevision = data.revision; dirty = false; blocked = false;
      cache(); warning(); render(); dialog.close(); $("classSaveStatus").textContent = "已保存到本地文件";
    };
  }

  function describe(event, withNames = true) {
    const names = event.studentIds.map((id) => data.students.find((student) => student.id === id)?.name || "已移出学生");
    const who = withNames ? (names.length > 3 ? `${names.slice(0, 2).join("、")}等 ${names.length} 人` : names.join("、")) + "：" : "";
    const labels = {
      award: `加 ${event.amount} 分`, deduct: `扣 ${event.amount} 分`, redeem: `兑换 ${event.stickers} 张贴纸，使用 ${event.amount} 个笑脸`,
      "clear-smile": `消除 ${event.amount} 个笑脸`, "clear-frown": `消除 ${event.amount} 个苦脸`, undo: "撤销上一步",
    };
    return who + labels[event.type] + (event.reason && event.type !== "undo" ? ` · ${event.reason}` : "");
  }

  function refreshControls() {
    const activeStudents = data.students.filter((student) => !student.archived);
    selected = new Set([...selected].filter((id) => activeStudents.some((student) => student.id === id)));
    const locked = !ready || blocked;
    for (const id of ["classRoster", "classAddFirst", "classSettings"]) $(id).disabled = locked;
    $("classUndo").disabled = locked || !lastAction(data);
    $("classBatchPlus").disabled = $("classBatchMinus").disabled = locked || selected.size === 0;
    $("classSelectAll").disabled = locked || !activeStudents.length;
    $("classSelectAll").checked = activeStudents.length > 0 && selected.size === activeStudents.length;
    $("classSelectAll").indeterminate = selected.size > 0 && selected.size < activeStudents.length;
    $("classSelectionCount").textContent = selected.size ? `已选 ${selected.size} 人` : "未选择";
    grid.querySelectorAll("button, input").forEach((element) => { element.disabled = locked; });
  }

  function fitGrid() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      if (root.hidden) return;
      const count = data.students.filter((student) => !student.archived).length;
      root.classList.remove("is-dense", "is-compact");
      if (window.innerWidth <= 600 || count === 0) return;
      for (const [mode, minimum] of [["", 168], ["is-dense", 140], ["is-compact", 100]]) {
        root.classList.remove("is-dense", "is-compact");
        if (mode) root.classList.add(mode);
        const columns = Math.min(count, Math.max(3, Math.floor((grid.clientWidth + 10) / (minimum + 10))));
        grid.style.setProperty("--class-columns", columns);
        if (grid.getBoundingClientRect().bottom <= innerHeight - 48) break;
      }
    });
  }

  function render() {
    const focus = document.activeElement;
    const focusId = focus?.closest("[data-student]")?.dataset.student;
    const focusAction = focus?.dataset.action;
    const balances = balancesFor(data);
    const students = data.students.filter((student) => !student.archived);
    $("className").textContent = data.className;
    $("studentCount").textContent = `${students.length} 位同学`;
    $("classEmpty").hidden = students.length > 0 || !ready;
    $("classToolbar").hidden = students.length === 0;
    grid.innerHTML = students.map((student, index) => {
      const face = faces(balances.get(student.id));
      const progress = (kind, amount, label) => `<div><span class="progress-label"><span class="progress-name">${label}</span><span>${amount}/5</span></span><div class="progress-dots ${kind}" aria-hidden="true">${Array.from({ length: 5 }, (_, n) => `<i class="${n < amount ? "on" : ""}"></i>`).join("")}</div></div>`;
      return `<article class="student-card ${selected.has(student.id) ? "is-selected" : ""}" data-student="${escape(student.id)}" aria-label="${escape(student.name)}">
        <div class="student-meta"><span class="student-number">${String(index + 1).padStart(2, "0")}</span><label class="student-check"><input type="checkbox" data-select="${escape(student.id)}" aria-label="选择${escape(student.name)}" ${selected.has(student.id) ? "checked" : ""} ${display ? 'tabindex="-1"' : ""}></label></div>
        <img class="student-avatar" src="${escape(avatarSource(student.avatar))}" alt="${escape(student.name)}的头像" width="52" height="52">
        <button type="button" class="student-name" data-action="profile" ${display ? 'tabindex="-1"' : ""}>${escape(student.name)}</button>
        <div class="student-actions"><button type="button" class="c-button c-plus" data-action="award" aria-label="给${escape(student.name)}加分">${icon("plus")}<span>加分</span></button><button type="button" class="c-button c-minus" data-action="deduct" aria-label="给${escape(student.name)}扣分">${icon("minus")}<span>扣分</span></button></div>
        <div class="student-faces"><button type="button" class="face-button" data-action="smile" aria-label="${escape(student.name)}的笑脸 ${face.smiles} 个，兑换或消除" ${display ? 'tabindex="-1"' : ""}>${icon("smile")}<strong>${face.smiles}</strong></button><button type="button" class="face-button frown" data-action="frown" aria-label="${escape(student.name)}的苦脸 ${face.frowns} 个，消除" ${display ? 'tabindex="-1"' : ""}>${icon("frown")}<strong>${face.frowns}</strong></button></div>
        <div class="student-progress">${progress("plus", face.plusProgress, "加分")}${progress("minus", face.minusProgress, "扣分")}</div>
      </article>`;
    }).join("");
    paintIcons(grid);
    $("classLatest").textContent = data.events.length ? describe(data.events.at(-1)) : "暂无积分记录";
    refreshControls();
    if (focusId && focusAction) [...grid.querySelectorAll("[data-student]")].find((card) => card.dataset.student === focusId)?.querySelector(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true });
    fitGrid();
  }

  function openDialog(title, html) {
    $("classDialogTitle").textContent = title;
    body.innerHTML = html;
    paintIcons(body);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  function formError(error) {
    const output = body.querySelector(".c-error");
    if (output) output.textContent = error.message;
    else toast(error.message);
  }

  function openRoster() {
    const active = data.students.filter((student) => !student.archived);
    const archived = data.students.filter((student) => student.archived);
    openDialog("学生管理", `<form class="c-form" id="addStudentsForm"><label class="c-field">添加学生<textarea id="studentNames" placeholder="学生姓名，每行一位" required maxlength="3000"></textarea></label><p class="c-error" role="alert"></p><div class="c-actions"><span class="c-muted">${active.length} 位在班 · ${data.students.length}/${MAX_STUDENTS} 个名额</span><button class="c-button c-primary" type="submit">${icon("plus")}添加到班级</button></div></form>
      <div class="roster-list">${active.map((student, index) => `<div class="roster-row" data-id="${escape(student.id)}"><img class="student-avatar" src="${escape(avatarSource(student.avatar))}" alt=""><input aria-label="${escape(student.name)}的姓名" maxlength="24" value="${escape(student.name)}"><button type="button" class="c-button" data-roster="edit" aria-label="编辑${escape(student.name)}" data-tip="编辑头像">${icon("pencil")}</button><button type="button" class="c-button" data-roster="up" aria-label="上移${escape(student.name)}" data-tip="上移" ${index === 0 ? "disabled" : ""}>${icon("arrow-up")}</button><button type="button" class="c-button" data-roster="down" aria-label="下移${escape(student.name)}" data-tip="下移" ${index === active.length - 1 ? "disabled" : ""}>${icon("arrow-down")}</button><button type="button" class="c-button" data-roster="archive" aria-label="移出${escape(student.name)}" data-tip="移出班级">${icon("archive")}</button></div>`).join("")}</div>
      ${archived.length ? `<section class="c-section"><h3>已移出学生</h3>${archived.map((student) => `<div class="roster-archived"><span>${escape(student.name)}</span><button type="button" class="c-button" data-restore="${escape(student.id)}">${icon("rotate-ccw")}恢复</button></div>`).join("")}</section>` : ""}`);
    $("addStudentsForm").onsubmit = (event) => {
      event.preventDefault();
      try {
        const names = $("studentNames").value.split(/[\n,，;；\t]+/).map((name) => name.trim()).filter(Boolean);
        commit(addStudents(data, names), `已添加 ${names.length} 位同学`);
        openRoster();
      } catch (error) { formError(error); }
    };
    body.querySelectorAll(".roster-row input").forEach((input) => {
      input.onchange = () => {
        try {
          const next = structuredClone(data);
          next.students.find((student) => student.id === input.closest("[data-id]").dataset.id).name = input.value.trim();
          commit(next, "姓名已保存"); openRoster();
        } catch (error) { formError(error); }
      };
    });
    body.querySelectorAll("[data-roster]").forEach((button) => {
      button.onclick = () => {
        const id = button.closest("[data-id]").dataset.id;
        const action = button.dataset.roster;
        if (action === "edit") return openStudent(id);
        try {
          const next = structuredClone(data);
          const index = next.students.findIndex((student) => student.id === id);
          if (action === "archive") {
            if (!window.confirm(`将${next.students[index].name}移出班级？积分和记录会保留，可在学生管理中恢复。`)) return;
            next.students[index].archived = true;
          } else {
            const offset = action === "up" ? -1 : 1;
            const neighbor = active[active.findIndex((student) => student.id === id) + offset];
            if (!neighbor) return;
            const other = next.students.findIndex((student) => student.id === neighbor.id);
            [next.students[index], next.students[other]] = [next.students[other], next.students[index]];
          }
          commit(next); openRoster();
        } catch (error) { formError(error); }
      };
    });
    body.querySelectorAll("[data-restore]").forEach((button) => {
      button.onclick = () => {
        try {
          const next = structuredClone(data);
          next.students.find((student) => student.id === button.dataset.restore).archived = false;
          commit(next, "学生已恢复"); openRoster();
        } catch (error) { formError(error); }
      };
    });
  }

  function openStudent(id) {
    const student = data.students.find((item) => item.id === id);
    let avatar = student.avatar;
    openDialog("编辑学生", `<form class="c-form" id="studentEditForm"><label class="c-field">姓名<input id="editStudentName" value="${escape(student.name)}" required maxlength="24"></label><div class="c-profile"><img id="editAvatar" class="student-avatar" src="${escape(avatarSource(avatar))}" alt="学生头像"><label class="c-button">${icon("upload")}上传照片<input type="file" id="studentPhoto" accept="image/png,image/jpeg,image/webp" hidden></label></div><div><span class="c-muted">选择卡通头像（60 张）</span><div class="avatar-choices">${Array.from({ length: PRESET_AVATARS }, (_, n) => `<button type="button" class="c-button ${avatar === `preset:${n}` ? "is-active" : ""}" data-avatar="preset:${n}" aria-label="头像 ${n + 1}"><img src="${avatarSource(`preset:${n}`)}" alt=""></button>`).join("")}</div></div><p class="c-error" role="alert"></p><div class="c-actions"><button class="c-button c-primary" id="saveStudent" type="submit">保存</button></div></form>`);
    body.querySelectorAll("[data-avatar]").forEach((button) => {
      button.onclick = () => {
        avatar = button.dataset.avatar; $("editAvatar").src = avatarSource(avatar);
        body.querySelectorAll("[data-avatar]").forEach((choice) => choice.classList.toggle("is-active", choice === button));
      };
    });
    $("studentPhoto").onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const save = $("saveStudent"); save.disabled = true;
      try {
        const source = await photoSource(file);
        if (!save.isConnected) return;
        avatar = source; $("editAvatar").src = avatar;
        body.querySelectorAll("[data-avatar]").forEach((choice) => choice.classList.remove("is-active"));
      } catch (error) { formError(error); }
      finally { save.disabled = false; }
    };
    $("studentEditForm").onsubmit = (event) => {
      event.preventDefault();
      try {
        const next = structuredClone(data);
        Object.assign(next.students.find((item) => item.id === id), { name: $("editStudentName").value.trim(), avatar });
        commit(next, "学生信息已保存"); openRoster();
      } catch (error) { formError(error); }
    };
  }

  function historyHtml(id) {
    const events = data.events.filter((event) => !id || event.studentIds.includes(id));
    const undone = new Set(data.events.filter((event) => event.type === "undo").map((event) => event.targetId));
    if (!events.length) return '<p class="c-muted">暂无记录</p>';
    return `<ul class="c-history">${events.slice(-200).reverse().map((event) => `<li><span class="${undone.has(event.id) ? "is-undone" : ""}">${escape(describe(event, !id))}</span>${undone.has(event.id) ? ' <span class="c-muted">已撤销</span>' : ""}<time datetime="${escape(event.at)}">${escape(new Date(event.at).toLocaleString("zh-CN", { hour12: false }))}</time></li>`).join("")}</ul>${events.length > 200 ? '<p class="c-muted">最近 200 条，完整记录包含在导出备份中。</p>' : ""}`;
  }

  function openHistory(id) {
    const student = data.students.find((item) => item.id === id);
    const balance = student ? balancesFor(data).get(id) : null;
    const heading = student ? `<div class="c-profile"><img class="student-avatar" src="${escape(avatarSource(student.avatar))}" alt=""><div><strong>${escape(student.name)}</strong><p>累计加分 ${balance.positive} · 累计扣分 ${balance.negative}</p><p>已兑换 ${balance.stickers} 张贴纸</p></div></div><section class="c-section">${historyHtml(id)}</section>` : historyHtml();
    openDialog(student ? "个人记录" : "操作记录", heading);
  }

  function openFaces(id, kind) {
    const student = data.students.find((item) => item.id === id);
    const balance = faces(balancesFor(data).get(id));
    const isSmile = kind === "smile";
    const available = isSmile ? balance.smiles : balance.frowns;
    openDialog(`${student.name} · ${isSmile ? "笑脸" : "苦脸"}`, `<div class="c-balance">${icon(isSmile ? "smile" : "frown")}<strong>${available}</strong><span class="c-muted">个可用${isSmile ? "笑脸" : "苦脸"}</span></div><form class="c-form" id="faceForm">${isSmile ? `<label class="c-field">操作<select id="faceOperation"><option value="redeem">兑换贴纸</option><option value="clear-smile">消除笑脸</option></select></label>` : ""}<label class="c-field"><span id="faceQuantityLabel">${isSmile ? "贴纸数量" : "消除数量"}</span><input type="number" id="faceQuantity" min="1" step="1" value="1" required></label><p id="faceCost" class="c-muted"></p><label class="c-field">备注（选填）<input id="faceReason" maxlength="120" placeholder="${isSmile ? "" : "例如：表现进步"}"></label><p class="c-error" role="alert"></p><div class="c-actions"><button type="submit" class="c-button c-primary" id="faceConfirm">确认${isSmile ? "兑换" : "消除"}</button></div></form>`);
    const update = () => {
      const redeem = isSmile && $("faceOperation").value === "redeem";
      const max = redeem ? Math.floor(available / data.smilesPerSticker) : available;
      $("faceQuantity").max = max;
      $("faceQuantityLabel").textContent = redeem ? "贴纸数量" : "消除数量";
      const quantity = Number($("faceQuantity").value);
      $("faceCost").textContent = redeem ? `${data.smilesPerSticker} 个笑脸 / 张 · 本次使用 ${quantity * data.smilesPerSticker || 0} 个笑脸` : `本次消除 ${quantity || 0} 个${isSmile ? "笑脸" : "苦脸"}`;
      $("faceConfirm").textContent = redeem ? "确认兑换" : "确认消除";
      $("faceConfirm").disabled = max < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > max || blocked;
    };
    if (isSmile) $("faceOperation").onchange = update;
    $("faceQuantity").oninput = update;
    update();
    $("faceForm").onsubmit = (event) => {
      event.preventDefault();
      try {
        const type = isSmile ? $("faceOperation").value : "clear-frown";
        const count = Number($("faceQuantity").value);
        const amount = type === "redeem" ? count * data.smilesPerSticker : count;
        const next = recordAction(data, type, [id], amount, $("faceReason").value.trim(), type === "redeem" ? count : undefined);
        commit(next, describe(next.events.at(-1))); dialog.close();
      } catch (error) { formError(error); }
    };
  }

  function openSettings() {
    openDialog("班级设置", `<form class="c-form" id="classSettingsForm"><label class="c-field">班级名称<input id="editClassName" value="${escape(data.className)}" maxlength="32" required></label><label class="c-field">兑换 1 张贴纸需要的笑脸<input type="number" id="editRatio" value="${data.smilesPerSticker}" min="1" max="100" step="1" required></label><p class="c-error" role="alert"></p><div class="c-actions"><button type="submit" class="c-button c-primary">保存设置</button></div></form><section class="c-section"><h3>数据备份</h3><div class="c-actions"><button type="button" class="c-button" id="exportClass">${icon("download")}导出备份</button><button type="button" class="c-button" id="importClass">${icon("upload")}导入备份</button></div><input id="importClassFile" type="file" accept="application/json,.json" hidden></section>`);
    $("classSettingsForm").onsubmit = (event) => {
      event.preventDefault();
      try { commit({ ...data, className: $("editClassName").value.trim(), smilesPerSticker: Number($("editRatio").value) }, "班级设置已保存"); dialog.close(); }
      catch (error) { formError(error); }
    };
    $("exportClass").onclick = exportData;
    $("importClass").onclick = () => $("importClassFile").click();
    $("importClassFile").onchange = async (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        if (file.size > 12_000_000) throw new Error("备份文件超过 12MB");
        const incoming = validateClassroom(JSON.parse(await file.text()));
        if (!window.confirm(`导入「${incoming.className}」的 ${incoming.students.length} 名学生及 ${incoming.events.length} 条记录，将替换当前班级。请先导出当前备份。继续？`)) return;
        selected.clear(); commit({ ...incoming, revision: baseRevision }, "班级备份已导入"); dialog.close();
      } catch (error) { formError(error); }
    };
  }

  function score(type, ids) {
    try {
      const next = recordAction(data, type, ids);
      commit(next, describe(next.events.at(-1)));
    } catch (error) { toast(error.message); }
  }

  grid.addEventListener("click", (event) => {
    if (display || !ready || blocked) return;
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.closest("[data-student]").dataset.student;
    const action = button.dataset.action;
    if (action === "award" || action === "deduct") score(action, [id]);
    if (action === "profile") openHistory(id);
    if (action === "smile" || action === "frown") openFaces(id, action);
  });
  grid.addEventListener("change", (event) => {
    const id = event.target.dataset.select;
    if (!id) return;
    if (event.target.checked) selected.add(id); else selected.delete(id);
    event.target.closest("[data-student]").classList.toggle("is-selected", event.target.checked);
    refreshControls();
  });
  $("classSelectAll").onchange = (event) => {
    selected = event.target.checked ? new Set(data.students.filter((student) => !student.archived).map((student) => student.id)) : new Set();
    render();
  };
  $("classBatchPlus").onclick = () => score("award", [...selected]);
  $("classBatchMinus").onclick = () => score("deduct", [...selected]);
  $("classUndo").onclick = () => {
    try { commit(undoAction(data), "已撤销上一步"); } catch (error) { toast(error.message); }
  };
  $("classRoster").onclick = $("classAddFirst").onclick = openRoster;
  $("classSettings").onclick = openSettings;
  $("classHistory").onclick = () => openHistory();
  $("classDisplay").onchange = (event) => {
    display = event.target.checked; selected.clear();
    root.classList.toggle("is-display", display); dialog.close(); render();
  };
  $("classFullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toast("此浏览器暂不支持全屏"); }
  };
  document.addEventListener("fullscreenchange", () => {
    const name = document.fullscreenElement ? "退出全屏" : "全屏";
    $("classFullscreen").innerHTML = icon(document.fullscreenElement ? "minimize" : "maximize");
    $("classFullscreen").setAttribute("aria-label", name); $("classFullscreen").dataset.tip = name;
    paintIcons($("classFullscreen")); fitGrid();
  });
  $("classDialogClose").onclick = () => dialog.close();
  dialog.addEventListener("click", (event) => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  $("classRetry").onclick = () => void load(true);
  $("classRescue").onclick = exportData;
  window.addEventListener("resize", fitGrid);
  window.addEventListener("classroom-layout", fitGrid);
  window.addEventListener("hashchange", () => dialog.close());
  window.addEventListener("online", () => { if (!saving && dirty) void load(true); });
  window.addEventListener("beforeunload", (event) => {
    if (dirty && !localSaved) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== CLASSROOM_KEY || !event.newValue || !ready) return;
    if (!fileMode) {
      blocked = true;
      warning("其他窗口更新了班级数据，请导出当前数据后重新连接。");
      refreshControls();
      return;
    }
    try {
      const incoming = JSON.parse(event.newValue);
      if (!incoming.dirty && !dirty && !saving && incoming.baseRevision !== baseRevision) void load(true);
    } catch { /* A malformed cache cannot replace the current classroom. */ }
  });
  paintIcons();
  void load();
}
