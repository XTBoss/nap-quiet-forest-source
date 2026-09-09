export const CLASSROOM_KEY = "quiet-forest-classroom-v1";
export const POINTS_PER_FACE = 5;
export const MAX_STUDENTS = 120;
export const PRESET_AVATARS = 60;
const TYPES = new Set(["award", "deduct", "redeem", "clear-smile", "clear-frown"]);

export function newClassroom() {
  return { version: 1, revision: 0, className: "我的班级", smilesPerSticker: 1, students: [], events: [] };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const integer = (value, max = 1_000_000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const shortText = (value, max) => typeof value === "string" && value.length <= max;
const identifier = (value) => shortText(value, 80) && value.length > 0;

export function emptyBalance() {
  return { positive: 0, negative: 0, spent: 0, clearedSmiles: 0, clearedFrowns: 0, stickers: 0 };
}

export function faces(balance) {
  return {
    smiles: Math.floor(balance.positive / POINTS_PER_FACE) - balance.spent - balance.clearedSmiles,
    frowns: Math.floor(balance.negative / POINTS_PER_FACE) - balance.clearedFrowns,
    plusProgress: balance.positive % POINTS_PER_FACE,
    minusProgress: balance.negative % POINTS_PER_FACE,
  };
}

function applyEvent(balances, event, direction = 1) {
  for (const id of event.studentIds) {
    const balance = balances.get(id);
    const amount = event.amount * direction;
    if (event.type === "award") balance.positive += amount;
    if (event.type === "deduct") balance.negative += amount;
    if (event.type === "clear-smile") balance.clearedSmiles += amount;
    if (event.type === "clear-frown") balance.clearedFrowns += amount;
    if (event.type === "redeem") {
      balance.spent += amount;
      balance.stickers += event.stickers * direction;
    }
    const available = faces(balance);
    check(Object.values(balance).every((value) => integer(value)), "积分数量超出范围");
    check(available.smiles >= 0, "可用笑脸不足");
    check(available.frowns >= 0, "可用苦脸不足");
  }
}

// Replay the ledger so imported balances, redemption and undo obey the same rules.
function replay(data, validate = false) {
  const balances = new Map(data.students.map((student) => [student.id, emptyBalance()]));
  const active = [];
  const ids = new Set();
  for (const event of data.events) {
    if (validate) {
      check(event && identifier(event.id) && !ids.has(event.id), "操作记录编号无效或重复");
      check(shortText(event.at, 40) && Number.isFinite(Date.parse(event.at)), "操作时间无效");
      check(shortText(event.reason, 120), "操作备注过长");
      check(Array.isArray(event.studentIds) && event.studentIds.length > 0 && event.studentIds.length <= MAX_STUDENTS, "操作对象无效");
      check(new Set(event.studentIds).size === event.studentIds.length && event.studentIds.every((id) => balances.has(id)), "操作对象不存在或重复");
    }
    ids.add(event.id);
    if (event.type === "undo") {
      const target = active.pop();
      check(target && target.id === event.targetId, "撤销记录顺序无效");
      check(JSON.stringify(event.studentIds) === JSON.stringify(target.studentIds), "撤销对象无效");
      applyEvent(balances, target, -1);
    } else {
      if (validate) {
        check(TYPES.has(event.type) && integer(event.amount, 1000) && event.amount > 0, "积分操作无效");
        if (event.type === "redeem") {
          check(integer(event.stickers, 1000) && event.stickers > 0 && event.amount % event.stickers === 0 && event.amount / event.stickers <= 100, "兑换比例无效");
        }
      }
      applyEvent(balances, event);
      active.push(event);
    }
  }
  return { balances, active };
}

export function validateClassroom(value) {
  check(value && value.version === 1, "不是有效的班级备份文件");
  check(integer(value.revision), "班级版本无效");
  check(shortText(value.className, 32) && value.className.trim().length > 0, "班级名称不能为空，最多 32 个字");
  check(integer(value.smilesPerSticker, 100) && value.smilesPerSticker > 0, "每张贴纸需要 1 至 100 个笑脸");
  check(Array.isArray(value.students) && value.students.length <= MAX_STUDENTS, "最多可保存 120 名学生（含已移出学生）");
  const ids = new Set();
  for (const student of value.students) {
    check(student && identifier(student.id) && !ids.has(student.id), "学生编号无效或重复");
    check(shortText(student.name, 24) && student.name.trim().length > 0, "学生姓名不能为空，最多 24 个字");
    check(typeof student.archived === "boolean", "学生状态无效");
    check(typeof student.avatar === "string" && ( /^preset:(?:[0-9]|[1-5][0-9])$/.test(student.avatar) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(student.avatar) && student.avatar.length <= 24000), "学生头像无效或过大");
    ids.add(student.id);
  }
  check(Array.isArray(value.events) && value.events.length <= 50000, "操作记录已超过 50000 条，请先备份并建立新班级");
  replay(value, true);
  return value;
}

export const balancesFor = (data) => replay(data).balances;
export const lastAction = (data) => replay(data).active.at(-1);

export function addStudents(data, names) {
  const next = structuredClone(data);
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  check(cleaned.length > 0, "请填写学生姓名");
  for (const name of cleaned) {
    next.students.push({ id: crypto.randomUUID(), name, avatar: `preset:${next.students.length % PRESET_AVATARS}`, archived: false });
  }
  return validateClassroom(next);
}

export function recordAction(data, type, studentIds, amount = 1, reason = "", stickers) {
  check(TYPES.has(type), "不支持的操作");
  check(studentIds.every((id) => data.students.some((student) => student.id === id && !student.archived)), "学生已移出班级");
  const event = { id: crypto.randomUUID(), at: new Date().toISOString(), type, studentIds, amount, reason };
  if (type === "redeem") event.stickers = stickers;
  return validateClassroom({ ...data, events: [...data.events, event] });
}

export function undoAction(data) {
  const target = lastAction(data);
  check(target, "没有可撤销的操作");
  return validateClassroom({ ...data, events: [...data.events, {
    id: crypto.randomUUID(), at: new Date().toISOString(), type: "undo", studentIds: target.studentIds,
    targetId: target.id, reason: "撤销上一步",
  }] });
}
