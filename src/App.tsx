import {
  Archive,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Flag,
  Grip,
  Inbox,
  LayoutGrid,
  Lightbulb,
  ListTodo,
  Palette,
  Minus,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Target,
  TimerReset,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent, ReactNode } from "react";

type TaskType = "inbox" | "scheduled" | "deadline" | "longterm" | "idea";
type TaskStatus = "active" | "done";
type CalendarView = "month" | "year";
type ThemeId = "arcade" | "sunrise" | "paper" | "midnight" | "custom";
type TextureId = "grid" | "tape" | "spark" | "wave";
type DockPanel = "calendar" | "timer" | "today";
type BackgroundMode = "cover" | "contain" | "stretch" | "tile";

interface ExtractedTime {
  id: string;
  token: string;
  label: string;
  kind: "date" | "time" | "deadline";
  iso?: string;
  time?: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
  texture: TextureId;
}

interface Task {
  id: string;
  title: string;
  detail: string;
  type: TaskType;
  status: TaskStatus;
  groupId: string;
  scheduledDate?: string;
  dueDate?: string;
  extracted: ExtractedTime[];
  createdAt: string;
  updatedAt: string;
}

interface StickyState {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  color: string;
  opacity: number;
}

interface Preferences {
  selectedDate: string;
  calendarView: CalendarView;
  theme: ThemeId;
  texture: TextureId;
  customAccent: string;
  completedColor: string;
  backgroundImage: string;
  backgroundMode: BackgroundMode;
  backgroundOpacity: number;
  dockPanel: DockPanel;
  toolPanelOpen: boolean;
  groupsCollapsed: boolean;
  collapsedTaskGroups: Record<string, boolean>;
  sticky: StickyState;
}

interface AppState {
  groups: Group[];
  tasks: Task[];
  prefs: Preferences;
}

interface StickyPayload {
  tasks: Task[];
  groups: Group[];
  sticky: StickyState;
}

declare global {
  interface Window {
    orbitDesktop?: {
      isElectron: boolean;
      updateSticky: (payload: StickyPayload) => void;
      stickyReady: () => void;
      closeSticky: () => void;
      minimizeSticky: () => void;
      toggleStickyTask: (taskId: string) => void;
      resizeStickyStart: (payload: { edge: string; screenX: number; screenY: number }) => void;
      resizeStickyMove: (payload: { screenX: number; screenY: number }) => void;
      resizeStickyEnd: () => void;
      onStickyData: (callback: (payload: StickyPayload) => void) => () => void;
      onStickyClosed: (callback: () => void) => () => void;
      onStickyBounds: (callback: (bounds: Pick<StickyState, "x" | "y" | "width" | "height">) => void) => () => void;
      onStickyTaskToggle: (callback: (taskId: string) => void) => () => void;
    };
  }
}

type StorageStatus = "saved" | "saving" | "synced" | "imported" | "error";

interface StorageEnvelope {
  version: number;
  savedAt: string;
  sourceId: string;
  state: AppState;
}

interface StorageMeta {
  status: StorageStatus;
  message: string;
  savedAt?: string;
}

interface LoadResult {
  state: AppState;
  savedAt?: string;
  message: string;
}

interface ComposerState {
  title: string;
  detail: string;
  type: TaskType;
  groupId: string;
  scheduledDate: string;
  dueDate: string;
}

interface TaskEditDraft {
  title: string;
  detail: string;
  type: TaskType;
  groupId: string;
  scheduledDate: string;
  dueDate: string;
}

interface TimerState {
  duration: number;
  remaining: number;
  running: boolean;
}

interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

const STORAGE_KEY = "orbit-todo-state-v2";
const STORAGE_BACKUP_KEY = "orbit-todo-state-backup-v2";
const LEGACY_STORAGE_KEYS = ["orbit-todo-state-v1"];
const STORAGE_VERSION = 2;

const themeOptions: Array<{ id: ThemeId; name: string }> = [
  { id: "arcade", name: "霓虹街区" },
  { id: "sunrise", name: "晨光便签" },
  { id: "paper", name: "像素手账" },
  { id: "midnight", name: "夜航工作台" },
  { id: "custom", name: "自定义" }
];

const textureOptions: Array<{ id: TextureId; name: string }> = [
  { id: "grid", name: "网格" },
  { id: "tape", name: "胶带" },
  { id: "spark", name: "星点" },
  { id: "wave", name: "声波" }
];

const taskTypeMeta: Record<TaskType, { label: string; icon: LucideIcon }> = {
  inbox: { label: "待分配", icon: Inbox },
  scheduled: { label: "已安排", icon: CalendarCheck },
  deadline: { label: "DDL", icon: Flag },
  longterm: { label: "长期目标", icon: Target },
  idea: { label: "灵感胶囊", icon: Lightbulb }
};

const composerTaskTypes: TaskType[] = ["inbox", "deadline", "longterm", "idea"];
const taskTypeIds = Object.keys(taskTypeMeta) as TaskType[];
const taskStatusIds: TaskStatus[] = ["active", "done"];
const themeIds: ThemeId[] = ["arcade", "sunrise", "paper", "midnight", "custom"];
const textureIds: TextureId[] = ["grid", "tape", "spark", "wave"];
const dockPanelIds: DockPanel[] = ["calendar", "timer", "today"];
const backgroundModeIds: BackgroundMode[] = ["cover", "contain", "stretch", "tile"];

const quotes = [
  "今天先启动一个小动作，剩下的节奏会自己跟上。",
  "把复杂的事拆小，星星就会一颗颗亮起来。",
  "灵感不是等来的，它常常藏在第一个版本里。",
  "完成比完美更能改变今天。",
  "把注意力放回下一步，答案会变得清楚。",
  "你不需要一次抵达，只需要持续校准方向。",
  "小计划也有重量，认真记录就会长出路径。",
  "保持好奇，今天会比清单多一点光。"
];

const weekMap: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
};

const pad = (value: number) => String(value).padStart(2, "0");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const CLIENT_ID = uid("client");

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const fromISODate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
};

const isBeforeISO = (left: string, right: string) => fromISODate(left).getTime() < fromISODate(right).getTime();

const normalizeFutureMonthDay = (month: number, day: number, base: Date) => {
  let date = new Date(base.getFullYear(), month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  if (date.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) {
    date = new Date(base.getFullYear() + 1, month - 1, day);
  }
  return date;
};

const formatDateZh = (iso: string) => {
  const date = fromISODate(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatLongDateZh = (iso: string) => {
  const date = fromISODate(iso);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function getNextWeekday(base: Date, target: number) {
  const delta = (target - base.getDay() + 7) % 7 || 7;
  return addDays(base, delta);
}

function getNextWeekWeekday(base: Date, target: number) {
  const mondayOffset = (base.getDay() + 6) % 7;
  const nextMonday = addDays(base, 7 - mondayOffset);
  const targetOffset = target === 0 ? 6 : target - 1;
  return addDays(nextMonday, targetOffset);
}

function parseTimeInfo(input: string, base = new Date()) {
  const text = input.trim();
  const items: ExtractedTime[] = [];
  const seen = new Set<string>();
  const today = toISODate(base);

  const push = (token: string, label: string, kind: ExtractedTime["kind"], iso?: string, time?: string) => {
    const key = `${token}-${kind}-${iso ?? ""}-${time ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ id: uid("time"), token, label, kind, iso, time });
  };

  const relativeDates: Array<[RegExp, number, string]> = [
    [/今天/g, 0, "今天"],
    [/明天/g, 1, "明天"],
    [/大后天/g, 3, "大后天"],
    [/后天/g, 2, "后天"],
  ];

  relativeDates.forEach(([regex, offset, label]) => {
    for (const match of text.matchAll(regex)) {
      const iso = toISODate(addDays(base, offset));
      push(match[0], `${label} ${formatDateZh(iso)}`, "date", iso);
    }
  });

  for (const match of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(date.getTime())) push(match[0], formatDateZh(toISODate(date)), "date", toISODate(date));
  }

  for (const match of text.matchAll(/(?<![\d/-])(\d{1,2})[/-](\d{1,2})(?!\d)/g)) {
    const date = normalizeFutureMonthDay(Number(match[1]), Number(match[2]), base);
    if (date) push(match[0], formatDateZh(toISODate(date)), "date", toISODate(date));
  }

  for (const match of text.matchAll(/(\d{1,2})月(\d{1,2})[日号]?/g)) {
    const date = normalizeFutureMonthDay(Number(match[1]), Number(match[2]), base);
    if (date) push(match[0], formatDateZh(toISODate(date)), "date", toISODate(date));
  }

  for (const match of text.matchAll(/下周([一二三四五六日天])/g)) {
    const target = weekMap[match[1]];
    const date = getNextWeekWeekday(base, target);
    push(match[0], `下周${match[1]} ${formatDateZh(toISODate(date))}`, "date", toISODate(date));
  }

  for (const match of text.matchAll(/(?<!下)(?:本周|周|星期)([一二三四五六日天])/g)) {
    const target = weekMap[match[1]];
    const date = getNextWeekday(base, target);
    push(match[0], `周${match[1]} ${formatDateZh(toISODate(date))}`, "date", toISODate(date));
  }

  for (const match of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) {
    push(match[0], match[0], "time", undefined, match[0]);
  }

  for (const match of text.matchAll(/([01]?\d|2[0-3])点(半|[0-5]?\d分?)?/g)) {
    const hour = pad(Number(match[1]));
    const minute = match[2]?.startsWith("半") ? "30" : pad(Number(match[2]?.replace("分", "") || 0));
    push(match[0], `${hour}:${minute}`, "time", undefined, `${hour}:${minute}`);
  }

  const deadlineMatch = text.match(/(ddl|deadline|截止|到期|期限|之前|前完成|最晚)/i);
  const hasDeadline = Boolean(deadlineMatch);
  if (hasDeadline) {
    const dueDate = items.find((item) => item.iso)?.iso ?? today;
    push(deadlineMatch?.[0] ?? "DDL", `DDL ${formatDateZh(dueDate)}`, "deadline", dueDate);
  }

  return { items, hasDeadline };
}

function getMonthCells(anchor: Date): CalendarCell[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      iso: toISODate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === anchor.getMonth()
    };
  });
}

function createDefaultGroups(): Group[] {
  return [
    { id: "g-study", name: "学习", color: "#38bdf8", texture: "grid" },
    { id: "g-build", name: "创造", color: "#fb7185", texture: "spark" },
    { id: "g-life", name: "生活", color: "#a3e635", texture: "tape" },
    { id: "g-future", name: "远方", color: "#facc15", texture: "wave" }
  ];
}

function makeTask(input: Omit<Task, "id" | "status" | "createdAt" | "updatedAt" | "extracted">): Task {
  const now = new Date().toISOString();
  return {
    ...input,
    id: uid("task"),
    status: "active",
    extracted: parseTimeInfo(`${input.title} ${input.detail}`).items,
    createdAt: now,
    updatedAt: now
  };
}

function createDefaultState(): AppState {
  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));
  const nextWeek = toISODate(addDays(new Date(), 7));
  const groups = createDefaultGroups();

  return {
    groups,
    tasks: [
      makeTask({
        title: "今天 19:30 做 25 分钟项目规划",
        detail: "把星轨清单拆成文档、UI、数据和发布四块。",
        type: "scheduled",
        groupId: groups[1].id,
        scheduledDate: today
      }),
      makeTask({
        title: "明天 DDL 前整理 GitHub README",
        detail: "补运行方式、截图占位和后续路线。",
        type: "deadline",
        groupId: groups[1].id,
        dueDate: tomorrow
      }),
      makeTask({
        title: "做一个贴纸式任务皮肤",
        detail: "灵感：每个分组像一张不同材质的桌面便签。",
        type: "idea",
        groupId: groups[1].id
      }),
      makeTask({
        title: "下周一复盘长期学习目标",
        detail: "长期方向：作品集、英语、算法、开源贡献。",
        type: "longterm",
        groupId: groups[0].id,
        scheduledDate: nextWeek
      })
    ],
    prefs: {
      selectedDate: today,
      calendarView: "month",
      theme: "arcade",
      texture: "grid",
      customAccent: "#22c55e",
      completedColor: "#dcfce7",
      backgroundImage: "",
      backgroundMode: "cover",
      backgroundOpacity: 0.34,
      dockPanel: "calendar",
      toolPanelOpen: true,
      groupsCollapsed: false,
      collapsedTaskGroups: {},
      sticky: {
        x: 28,
        y: 96,
        width: 292,
        height: 360,
        visible: true,
        color: "#fef08a",
        opacity: 0.92
      }
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && taskTypeIds.includes(value as TaskType);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && taskStatusIds.includes(value as TaskStatus);
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && themeIds.includes(value as ThemeId);
}

function isTextureId(value: unknown): value is TextureId {
  return typeof value === "string" && textureIds.includes(value as TextureId);
}

function isDockPanel(value: unknown): value is DockPanel {
  return typeof value === "string" && dockPanelIds.includes(value as DockPanel);
}

function isBackgroundMode(value: unknown): value is BackgroundMode {
  return typeof value === "string" && backgroundModeIds.includes(value as BackgroundMode);
}

function normalizeState(input: unknown, fallback = createDefaultState()): AppState {
  const source = isRecord(input) ? input : {};
  const rawGroups = Array.isArray(source.groups) ? source.groups : [];
  const groups = rawGroups.flatMap((item, index): Group[] => {
    if (!isRecord(item)) return [];
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : `分组 ${index + 1}`;
    return [
      {
        id: typeof item.id === "string" && item.id ? item.id : uid("group"),
        name,
        color: typeof item.color === "string" && item.color ? item.color : fallback.groups[index]?.color ?? "#38bdf8",
        texture: isTextureId(item.texture) ? item.texture : fallback.groups[index]?.texture ?? "grid"
      }
    ];
  });
  const safeGroups = groups.length ? groups : fallback.groups;
  const groupIds = new Set(safeGroups.map((group) => group.id));
  const firstGroupId = safeGroups[0]?.id ?? "";

  const hasTaskList = Array.isArray(source.tasks);
  const rawTasks = hasTaskList ? (source.tasks as unknown[]) : [];
  const tasks = rawTasks.flatMap((item): Task[] => {
    if (!isRecord(item)) return [];
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) return [];
    const detail = typeof item.detail === "string" ? item.detail : "";
    const extracted = Array.isArray(item.extracted)
      ? item.extracted.flatMap((time): ExtractedTime[] => {
          if (!isRecord(time)) return [];
          const token = typeof time.token === "string" ? time.token : "";
          const label = typeof time.label === "string" ? time.label : token;
          const kind =
            time.kind === "date" || time.kind === "time" || time.kind === "deadline" ? time.kind : "date";
          if (!token || !label) return [];
          return [
            {
              id: typeof time.id === "string" && time.id ? time.id : uid("time"),
              token,
              label,
              kind,
              iso: typeof time.iso === "string" ? time.iso : undefined,
              time: typeof time.time === "string" ? time.time : undefined
            }
          ];
        })
      : parseTimeInfo(`${title} ${detail}`).items;

    return [
      {
        id: typeof item.id === "string" && item.id ? item.id : uid("task"),
        title,
        detail,
        type: isTaskType(item.type) ? item.type : "inbox",
        status: isTaskStatus(item.status) ? item.status : "active",
        groupId: typeof item.groupId === "string" && groupIds.has(item.groupId) ? item.groupId : firstGroupId,
        scheduledDate: typeof item.scheduledDate === "string" ? item.scheduledDate : undefined,
        dueDate: typeof item.dueDate === "string" ? item.dueDate : undefined,
        extracted,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
      }
    ];
  });

  const rawPrefs = isRecord(source.prefs) ? source.prefs : {};
  const rawSticky = isRecord(rawPrefs.sticky) ? rawPrefs.sticky : {};
  const sticky: StickyState = {
    x: typeof rawSticky.x === "number" ? rawSticky.x : fallback.prefs.sticky.x,
    y: typeof rawSticky.y === "number" ? rawSticky.y : fallback.prefs.sticky.y,
    width: typeof rawSticky.width === "number" ? rawSticky.width : fallback.prefs.sticky.width,
    height: typeof rawSticky.height === "number" ? rawSticky.height : fallback.prefs.sticky.height,
    visible: typeof rawSticky.visible === "boolean" ? rawSticky.visible : fallback.prefs.sticky.visible,
    color: typeof rawSticky.color === "string" && rawSticky.color ? rawSticky.color : fallback.prefs.sticky.color,
    opacity: typeof rawSticky.opacity === "number" ? clamp(rawSticky.opacity, 0.35, 1) : fallback.prefs.sticky.opacity
  };

  return {
    groups: safeGroups,
    tasks: hasTaskList ? tasks : fallback.tasks,
    prefs: {
      selectedDate: typeof rawPrefs.selectedDate === "string" ? rawPrefs.selectedDate : fallback.prefs.selectedDate,
      calendarView: rawPrefs.calendarView === "year" ? "year" : "month",
      theme: isThemeId(rawPrefs.theme) ? rawPrefs.theme : fallback.prefs.theme,
      texture: isTextureId(rawPrefs.texture) ? rawPrefs.texture : fallback.prefs.texture,
      customAccent:
        typeof rawPrefs.customAccent === "string" && rawPrefs.customAccent
          ? rawPrefs.customAccent
          : fallback.prefs.customAccent,
      completedColor:
        typeof rawPrefs.completedColor === "string" && rawPrefs.completedColor
          ? rawPrefs.completedColor
          : fallback.prefs.completedColor,
      backgroundImage: typeof rawPrefs.backgroundImage === "string" ? rawPrefs.backgroundImage : fallback.prefs.backgroundImage,
      backgroundMode: isBackgroundMode(rawPrefs.backgroundMode)
        ? rawPrefs.backgroundMode
        : fallback.prefs.backgroundMode,
      backgroundOpacity:
        typeof rawPrefs.backgroundOpacity === "number"
          ? Math.min(0.85, Math.max(0, rawPrefs.backgroundOpacity))
          : fallback.prefs.backgroundOpacity,
      dockPanel: isDockPanel(rawPrefs.dockPanel) ? rawPrefs.dockPanel : fallback.prefs.dockPanel,
      toolPanelOpen: typeof rawPrefs.toolPanelOpen === "boolean" ? rawPrefs.toolPanelOpen : fallback.prefs.toolPanelOpen,
      groupsCollapsed:
        typeof rawPrefs.groupsCollapsed === "boolean" ? rawPrefs.groupsCollapsed : fallback.prefs.groupsCollapsed,
      collapsedTaskGroups: isRecord(rawPrefs.collapsedTaskGroups)
        ? Object.fromEntries(
            Object.entries(rawPrefs.collapsedTaskGroups).filter((entry): entry is [string, boolean] => {
              const [key, value] = entry;
              return typeof key === "string" && typeof value === "boolean";
            })
          )
        : fallback.prefs.collapsedTaskGroups,
      sticky
    }
  };
}

function createStorageEnvelope(state: AppState, savedAt = new Date().toISOString()): StorageEnvelope {
  return {
    version: STORAGE_VERSION,
    savedAt,
    sourceId: CLIENT_ID,
    state: normalizeState(state, state)
  };
}

function parseStorageEnvelope(raw: string | null): StorageEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const parsedRecord = isRecord(parsed) ? parsed : {};
    const stateCandidate = isRecord(parsedRecord.state) ? parsedRecord.state : parsed;
    return {
      version: typeof parsedRecord.version === "number" ? parsedRecord.version : 1,
      savedAt: typeof parsedRecord.savedAt === "string" ? parsedRecord.savedAt : new Date().toISOString(),
      sourceId: typeof parsedRecord.sourceId === "string" ? parsedRecord.sourceId : "legacy",
      state: normalizeState(stateCandidate)
    };
  } catch {
    return null;
  }
}

function readLocalData(): LoadResult {
  const fallback = createDefaultState();
  if (typeof window === "undefined") {
    return { state: fallback, message: "当前环境不可读取浏览器本地存储" };
  }

  const current = parseStorageEnvelope(window.localStorage.getItem(STORAGE_KEY));
  if (current) {
    return { state: current.state, savedAt: current.savedAt, message: "已载入浏览器本地数据" };
  }

  const backup = parseStorageEnvelope(window.localStorage.getItem(STORAGE_BACKUP_KEY));
  if (backup) {
    return { state: backup.state, savedAt: backup.savedAt, message: "主数据不可用，已从自动备份恢复" };
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = parseStorageEnvelope(window.localStorage.getItem(key));
    if (legacy) {
      return { state: legacy.state, savedAt: legacy.savedAt, message: "已迁移旧版本地数据" };
    }
  }

  return { state: fallback, message: "已创建新的本地数据空间" };
}

function saveStateToLocal(state: AppState): { ok: boolean; savedAt?: string; message: string } {
  if (typeof window === "undefined") {
    return { ok: false, message: "当前环境不可写入浏览器本地存储" };
  }

  try {
    const savedAt = new Date().toISOString();
    const nextRaw = JSON.stringify(createStorageEnvelope(state, savedAt));
    const previousRaw = window.localStorage.getItem(STORAGE_KEY);
    if (previousRaw && previousRaw !== nextRaw) {
      window.localStorage.setItem(STORAGE_BACKUP_KEY, previousRaw);
    }
    window.localStorage.setItem(STORAGE_KEY, nextRaw);
    return { ok: true, savedAt, message: "自动保存到浏览器本地存储" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "写入本地存储失败"
    };
  }
}

function formatDateTimeZh(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function estimateStateBytes(state: AppState) {
  return new Blob([JSON.stringify(createStorageEnvelope(state))]).size;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片格式无法解析"));
    image.src = dataUrl;
  });
}

async function prepareBackgroundImage(file: File) {
  const supportedByName = /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(file.name);
  if (!file.type.startsWith("image/") && !supportedByName) throw new Error("请选择 JPG、PNG、WebP、GIF、BMP 或 SVG 图片");

  const originalDataUrl = await readFileAsDataUrl(file);
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) return originalDataUrl;

  const image = await loadImage(originalDataUrl);
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return originalDataUrl;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const compressed = canvas.toDataURL("image/jpeg", 0.84);
  return compressed.length < originalDataUrl.length || originalDataUrl.length > 2_500_000 ? compressed : originalDataUrl;
}

function getBackgroundCss(mode: BackgroundMode) {
  if (mode === "contain") return { size: "contain", repeat: "no-repeat" };
  if (mode === "stretch") return { size: "100% 100%", repeat: "no-repeat" };
  if (mode === "tile") return { size: "360px auto", repeat: "repeat" };
  return { size: "cover", repeat: "no-repeat" };
}

function getDailyQuote() {
  const seed = toISODate(new Date()).split("-").reduce((sum, part) => sum + Number(part), 0);
  return quotes[seed % quotes.length];
}

function getTodayTasks(tasks: Task[], today: string) {
  return tasks.filter((task) => task.scheduledDate === today || task.dueDate === today).slice(0, 8);
}

function isStickyWindowMode() {
  return new URLSearchParams(window.location.search).get("sticky") === "1";
}

function hexToRgba(hex: string, opacity: number) {
  const clean = hex.replace("#", "").trim();
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : clean;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value) || normalized.length !== 6) return `rgba(254, 240, 138, ${clamp(opacity, 0.35, 1)})`;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity, 0.35, 1)})`;
}

function HighlightText({ text, extracted }: { text: string; extracted: ExtractedTime[] }) {
  const tokens = Array.from(new Set(extracted.map((item) => item.token).filter(Boolean))).sort(
    (a, b) => b.length - a.length
  );
  if (!tokens.length) return <>{text}</>;

  const matcher = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "g");
  return (
    <>
      {text.split(matcher).map((part, index) =>
        tokens.includes(part) ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function createTaskEditDraft(task: Task): TaskEditDraft {
  return {
    title: task.title,
    detail: task.detail,
    type: task.type,
    groupId: task.groupId,
    scheduledDate: task.scheduledDate ?? "",
    dueDate: task.dueDate ?? ""
  };
}

function TaskCard({
  task,
  group,
  groups,
  selectedDate,
  isExpanded,
  onToggle,
  onExpand,
  onUpdate,
  onDelete,
  onAssign,
  onDeadline,
  onInbox
}: {
  task: Task;
  group?: Group;
  groups: Group[];
  selectedDate: string;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAssign: (id: string, date: string) => void;
  onDeadline: (id: string, date: string) => void;
  onInbox: (id: string) => void;
}) {
  const Icon = taskTypeMeta[task.type].icon;
  const isDone = task.status === "done";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TaskEditDraft>(() => createTaskEditDraft(task));

  useEffect(() => {
    if (!isEditing) setDraft(createTaskEditDraft(task));
  }, [isEditing, task]);

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const title = draft.title.trim();
    if (!title) return;
    const detail = draft.detail.trim();
    const extracted = parseTimeInfo(`${title} ${detail}`).items;

    onUpdate(task.id, {
      title,
      detail,
      type: draft.type,
      groupId: draft.groupId || groups[0]?.id || task.groupId,
      scheduledDate: draft.scheduledDate || undefined,
      dueDate: draft.dueDate || undefined,
      extracted
    });
    setIsEditing(false);
  };

  return (
    <article
      className={`task-card texture-${group?.texture ?? "grid"} ${isDone ? "is-done" : ""} ${
        isExpanded ? "is-expanded" : ""
      }`}
      role="button"
      tabIndex={0}
      onClick={() => onExpand(task.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExpand(task.id);
        }
      }}
    >
      <div className="task-card__stripe" style={{ background: group?.color ?? "#94a3b8" }} />
      <header className="task-summary">
        <button
          className={`task-check ${isDone ? "is-checked" : ""}`}
          type="button"
          title={isDone ? "标记为未完成" : "标记为完成"}
          aria-pressed={isDone}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(task.id);
          }}
        >
          {isDone && <Check size={15} />}
        </button>
        <div className="task-summary__content">
          <h3>
            <HighlightText text={task.title} extracted={task.extracted} />
          </h3>
          {isDone && <span className="done-badge">完成</span>}
        </div>
        <ChevronRight className="task-expand-icon" size={16} />
      </header>

      {isExpanded && (
        <div className="task-detail-panel">
          {isEditing ? (
            <form className="task-edit-form" onSubmit={saveEdit} onClick={(event) => event.stopPropagation()}>
              <label className="task-edit-field is-wide">
                <span>内容</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="任务内容"
                />
              </label>
              <label className="task-edit-field is-wide">
                <span>备注</span>
                <textarea
                  value={draft.detail}
                  onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value }))}
                  placeholder="补充说明"
                />
              </label>
              <label className="task-edit-field">
                <span>类型</span>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as TaskType }))}
                >
                  {taskTypeIds.map((type) => (
                    <option value={type} key={type}>
                      {taskTypeMeta[type].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-edit-field">
                <span>分组</span>
                <select
                  value={draft.groupId}
                  onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}
                >
                  {groups.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-edit-field">
                <span>安排日期</span>
                <input
                  type="date"
                  value={draft.scheduledDate}
                  onChange={(event) => setDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
                />
              </label>
              <label className="task-edit-field">
                <span>DDL 日期</span>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </label>
              <footer className="task-card__actions">
                <button className="icon-btn strong" type="submit" title="保存修改">
                  <Save size={16} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  title="取消编辑"
                  onClick={() => {
                    setDraft(createTaskEditDraft(task));
                    setIsEditing(false);
                  }}
                >
                  <X size={16} />
                </button>
              </footer>
            </form>
          ) : (
            <>
              <div className="task-card__head">
                <span className="task-card__type">
                  <Icon size={15} />
                  {taskTypeMeta[task.type].label}
                </span>
                <span className="group-pill" style={{ "--group-color": group?.color ?? "#94a3b8" } as CSSProperties}>
                  {group?.name ?? "未分组"}
                </span>
              </div>
              {task.detail && (
                <p>
                  <HighlightText text={task.detail} extracted={task.extracted} />
                </p>
              )}
              <div className="time-chip-row">
                {task.scheduledDate && <span className="time-chip">安排 {formatDateZh(task.scheduledDate)}</span>}
                {task.dueDate && <span className="time-chip is-ddl">DDL {formatDateZh(task.dueDate)}</span>}
                {task.extracted
                  .filter((item) => item.kind === "time")
                  .map((item) => (
                    <span className="time-chip" key={item.id}>
                      {item.label}
                    </span>
                  ))}
              </div>
              <footer className="task-card__actions">
                <button
                  className="icon-btn strong"
                  type="button"
                  title="编辑任务"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsEditing(true);
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  title="安排到选中日期"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAssign(task.id, selectedDate);
                  }}
                >
                  <CalendarCheck size={16} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  title="设为选中日期 DDL"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeadline(task.id, selectedDate);
                  }}
                >
                  <Flag size={16} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  title="移回待分配"
                  onClick={(event) => {
                    event.stopPropagation();
                    onInbox(task.id);
                  }}
                >
                  <Archive size={16} />
                </button>
                <button
                  className="icon-btn danger"
                  type="button"
                  title="删除"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(task.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </footer>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function TaskColumn({
  title,
  icon: Icon,
  tasks,
  empty,
  children
}: {
  title: string;
  icon: LucideIcon;
  tasks: Task[];
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="task-column">
      <header className="section-title">
        <span>
          <Icon size={18} />
          {title}
        </span>
        <strong>{tasks.length}</strong>
      </header>
      <div className="task-stack">{tasks.length ? children : <p className="empty-state">{empty}</p>}</div>
    </section>
  );
}

const stickyResizeEdges = ["n", "e", "s", "w", "ne", "nw", "se", "sw"] as const;
type StickyResizeEdge = (typeof stickyResizeEdges)[number];

function StickyResizeHandle({ edge }: { edge: StickyResizeEdge }) {
  return (
    <div
      className={`sticky-resize-handle ${edge}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const desktop = window.orbitDesktop;
        if (!desktop) return;

        desktop.resizeStickyStart({ edge, screenX: event.screenX, screenY: event.screenY });
        const onMove = (moveEvent: PointerEvent) => {
          desktop.resizeStickyMove({ screenX: moveEvent.screenX, screenY: moveEvent.screenY });
        };
        const onUp = () => {
          desktop.resizeStickyEnd();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
    />
  );
}

function StickyWindowApp() {
  const [snapshot, setSnapshot] = useState<AppState>(() => readLocalData().state);

  useEffect(() => {
    document.documentElement.classList.add("is-sticky-window");
    document.body.classList.add("is-sticky-window");
    document.title = "今日便签";
    return () => {
      document.documentElement.classList.remove("is-sticky-window");
      document.body.classList.remove("is-sticky-window");
    };
  }, []);

  useEffect(() => {
    const desktop = window.orbitDesktop;
    desktop?.stickyReady();
    return desktop?.onStickyData((payload) => {
      if (!payload) return;
      setSnapshot((current) => ({
        ...current,
        groups: payload.groups,
        tasks: payload.tasks,
        prefs: {
          ...current.prefs,
          sticky: payload.sticky
        }
      }));
    });
  }, []);

  const today = toISODate(new Date());
  const currentTasks = useMemo(() => getTodayTasks(snapshot.tasks, today), [snapshot.tasks, today]);
  const groupById = useMemo(() => new Map(snapshot.groups.map((group) => [group.id, group])), [snapshot.groups]);
  const sticky = snapshot.prefs.sticky;
  const stickyStyle = {
    "--sticky-window-bg": hexToRgba(sticky.color, sticky.opacity)
  } as CSSProperties;

  return (
    <section className="sticky-window-app" style={stickyStyle}>
      <header className="sticky-window-head">
        <div className="sticky-window-title">
          <Grip size={15} />
          <span>今日便签</span>
          <small>{formatDateZh(today)}</small>
        </div>
        <div className="sticky-window-actions">
          <button className="sticky-window-btn" type="button" title="最小化" onClick={() => window.orbitDesktop?.minimizeSticky()}>
            <Minus size={15} />
          </button>
          <button className="sticky-window-btn danger" type="button" title="删除便签" onClick={() => window.orbitDesktop?.closeSticky()}>
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      <div className="sticky-window-body">
        {currentTasks.length ? (
          currentTasks.map((task) => {
            const group = groupById.get(task.groupId);
            const isDone = task.status === "done";
            return (
              <div className={`sticky-window-task ${isDone ? "is-done" : ""}`} key={task.id}>
                <button
                  className={`task-check ${isDone ? "is-checked" : ""}`}
                  type="button"
                  title={isDone ? "标记为未完成" : "标记为完成"}
                  aria-pressed={isDone}
                  onClick={() => window.orbitDesktop?.toggleStickyTask(task.id)}
                >
                  {isDone && <Check size={14} />}
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <span style={{ "--group-color": group?.color ?? "#94a3b8" } as CSSProperties}>
                    {group?.name ?? "未分组"}
                    {task.dueDate ? ` · DDL ${formatDateZh(task.dueDate)}` : ""}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <p className="empty-state compact">今日便签是空的。</p>
        )}
      </div>
      {stickyResizeEdges.map((edge) => (
        <StickyResizeHandle edge={edge} key={edge} />
      ))}
    </section>
  );
}

function MainApp() {
  const [initialLoad] = useState<LoadResult>(() => readLocalData());
  const [state, setState] = useState<AppState>(() => initialLoad.state);
  const [storageMeta, setStorageMeta] = useState<StorageMeta>(() => ({
    status: "saved",
    message: initialLoad.message,
    savedAt: initialLoad.savedAt
  }));
  const [composer, setComposer] = useState<ComposerState>(() => ({
    title: "",
    detail: "",
    type: "inbox",
    groupId: initialLoad.state.groups[0]?.id ?? "",
    scheduledDate: "",
    dueDate: ""
  }));
  const [newGroup, setNewGroup] = useState({ name: "", color: "#22c55e", texture: "grid" as TextureId });
  const [editingGroup, setEditingGroup] = useState<null | { id: string; name: string; color: string }>(null);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [calendarCursor, setCalendarCursor] = useState(() => fromISODate(initialLoad.state.prefs.selectedDate));
  const [timer, setTimer] = useState<TimerState>({ duration: 25 * 60, remaining: 25 * 60, running: false });
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [interaction, setInteraction] = useState<null | {
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: StickyState;
  }>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const selectedDateInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    setStorageMeta((current) => ({
      ...current,
      status: "saving",
      message: "正在写入浏览器本地存储"
    }));

    const id = window.setTimeout(() => {
      const result = saveStateToLocal(state);
      setStorageMeta({
        status: result.ok ? "saved" : "error",
        message: result.message,
        savedAt: result.savedAt
      });
    }, 220);

    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      const incoming = parseStorageEnvelope(event.newValue);
      if (!incoming || incoming.sourceId === CLIENT_ID) return;

      skipNextSaveRef.current = true;
      setState(incoming.state);
      setCalendarCursor(fromISODate(incoming.state.prefs.selectedDate));
      setStorageMeta({
        status: "synced",
        message: "已同步另一个标签页中的本地修改",
        savedAt: incoming.savedAt
      });
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!timer.running) return undefined;
    const id = window.setInterval(() => {
      setTimer((current) => {
        if (current.remaining <= 1) return { ...current, remaining: 0, running: false };
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer.running]);

  useEffect(() => {
    const minutes = Math.floor(timer.remaining / 60);
    const seconds = timer.remaining % 60;
    document.title = timer.running ? `${pad(minutes)}:${pad(seconds)} · 星轨清单` : "星轨清单 Orbit Todo";
  }, [timer.remaining, timer.running]);

  useEffect(() => {
    if (!interaction) return undefined;

    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
      setState((current) => {
        const sticky = current.prefs.sticky;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let next: StickyState;

        if (interaction.mode === "move") {
          next = {
            ...sticky,
            x: Math.min(Math.max(8, interaction.origin.x + dx), viewportWidth - sticky.width - 8),
            y: Math.min(Math.max(8, interaction.origin.y + dy), viewportHeight - sticky.height - 8)
          };
        } else {
          next = {
            ...sticky,
            width: Math.min(Math.max(240, interaction.origin.width + dx), viewportWidth - sticky.x - 8),
            height: Math.min(Math.max(260, interaction.origin.height + dy), viewportHeight - sticky.y - 8)
          };
        }

        return { ...current, prefs: { ...current.prefs, sticky: next } };
      });
    };

    const onUp = () => {
      setState((current) => {
        const sticky = { ...current.prefs.sticky };
        const gap = 18;
        const threshold = 42;
        if (sticky.x < threshold) sticky.x = gap;
        if (sticky.y < threshold) sticky.y = gap;
        if (window.innerWidth - sticky.x - sticky.width < threshold) sticky.x = window.innerWidth - sticky.width - gap;
        if (window.innerHeight - sticky.y - sticky.height < threshold) sticky.y = window.innerHeight - sticky.height - gap;
        return { ...current, prefs: { ...current.prefs, sticky } };
      });
      setInteraction(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [interaction]);

  const groupById = useMemo(() => new Map(state.groups.map((group) => [group.id, group])), [state.groups]);
  const selectedDate = state.prefs.selectedDate;
  const today = toISODate(new Date());
  const dailyQuote = useMemo(() => getDailyQuote(), []);
  const parsedPreview = useMemo(() => parseTimeInfo(`${composer.title} ${composer.detail}`), [composer.title, composer.detail]);

  const taskCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    state.tasks.forEach((task) => {
      [task.scheduledDate, task.dueDate].filter(Boolean).forEach((date) => {
        counts.set(date!, (counts.get(date!) ?? 0) + 1);
      });
    });
    return counts;
  }, [state.tasks]);

  const visibleTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.tasks
      .filter((task) => groupFilter === "all" || task.groupId === groupFilter)
      .filter((task) => {
        if (!keyword) return true;
        return `${task.title} ${task.detail}`.toLowerCase().includes(keyword);
      });
  }, [groupFilter, search, state.tasks]);

  const unassignedTasks = visibleTasks.filter((task) => task.type === "inbox" && !task.scheduledDate && !task.dueDate);
  const selectedDateTasks = visibleTasks.filter(
    (task) => task.scheduledDate === selectedDate || task.dueDate === selectedDate
  );
  const deadlineTasks = visibleTasks
    .filter((task) => task.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const longTermTasks = visibleTasks.filter((task) => task.type === "longterm");
  const ideaTasks = visibleTasks.filter((task) => task.type === "idea");
  const currentTasks = useMemo(() => getTodayTasks(state.tasks, today), [state.tasks, today]);
  const isDesktopApp = Boolean(window.orbitDesktop?.isElectron);

  const updatePrefs = (patch: Partial<Preferences>) => {
    setState((current) => ({ ...current, prefs: { ...current.prefs, ...patch } }));
  };

  const selectDate = (iso: string) => {
    if (!iso) return;
    updatePrefs({ selectedDate: iso });
    setCalendarCursor(fromISODate(iso));
  };

  const openSelectedDatePicker = () => {
    const input = selectedDateInputRef.current;
    if (!input) return;
    input.focus();
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === "function") picker.showPicker();
    else input.click();
  };

  const toggleToolPanel = (panel: DockPanel) => {
    setState((current) => ({
      ...current,
      prefs: {
        ...current.prefs,
        dockPanel: panel,
        toolPanelOpen: current.prefs.dockPanel === panel ? !current.prefs.toolPanelOpen : true
      }
    }));
  };

  const getTaskGroupKey = (sectionId: string, groupId: string) => `${sectionId}:${groupId}`;

  const toggleTaskGroup = (sectionId: string, groupId: string) => {
    const key = getTaskGroupKey(sectionId, groupId);
    setState((current) => ({
      ...current,
      prefs: {
        ...current.prefs,
        collapsedTaskGroups: {
          ...current.prefs.collapsedTaskGroups,
          [key]: !current.prefs.collapsedTaskGroups[key]
        }
      }
    }));
  };

  const toggleTaskDetails = (taskId: string) => {
    setExpandedTaskIds((current) => ({ ...current, [taskId]: !current[taskId] }));
  };

  const updateTask = (taskId: string, updater: (task: Task) => Task) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...updater(task), updatedAt: new Date().toISOString() } : task
      )
    }));
  };

  useEffect(() => {
    if (!window.orbitDesktop?.isElectron) return;
    window.orbitDesktop.updateSticky({
      tasks: currentTasks,
      groups: state.groups,
      sticky: state.prefs.sticky
    });
  }, [currentTasks, state.groups, state.prefs.sticky]);

  useEffect(() => {
    const desktop = window.orbitDesktop;
    if (!desktop?.isElectron) return undefined;

    const offClosed = desktop.onStickyClosed(() => {
      setState((current) => ({
        ...current,
        prefs: {
          ...current.prefs,
          sticky: {
            ...current.prefs.sticky,
            visible: false
          }
        }
      }));
    });
    const offBounds = desktop.onStickyBounds((bounds) => {
      setState((current) => ({
        ...current,
        prefs: {
          ...current.prefs,
          sticky: {
            ...current.prefs.sticky,
            ...bounds
          }
        }
      }));
    });
    const offToggle = desktop.onStickyTaskToggle((taskId) => {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: task.status === "done" ? "active" : "done",
                updatedAt: new Date().toISOString()
              }
            : task
        )
      }));
    });

    return () => {
      offClosed();
      offBounds();
      offToggle();
    };
  }, []);

  const handleAddTask = (event: FormEvent) => {
    event.preventDefault();
    const title = composer.title.trim();
    if (!title) return;

    const parsed = parseTimeInfo(`${composer.title} ${composer.detail}`);
    const firstDate = parsed.items.find((item) => item.iso)?.iso;
    let type = composer.type;
    let scheduledDate = composer.scheduledDate || undefined;
    let dueDate = composer.dueDate || undefined;

    if (parsed.hasDeadline && firstDate && !dueDate) {
      type = "deadline";
      dueDate = firstDate;
    } else if (scheduledDate && type === "inbox") {
      type = "scheduled";
    } else if (!scheduledDate && !dueDate && firstDate) {
      if (type === "deadline") dueDate = firstDate;
      else if (type !== "longterm" && type !== "idea") {
        type = "scheduled";
        scheduledDate = firstDate;
      }
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: uid("task"),
      title,
      detail: composer.detail.trim(),
      type,
      status: "active",
      groupId: composer.groupId || state.groups[0]?.id || "",
      scheduledDate,
      dueDate,
      extracted: parsed.items,
      createdAt: now,
      updatedAt: now
    };

    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setComposer((current) => ({
      ...current,
      title: "",
      detail: "",
      scheduledDate: "",
      dueDate: ""
    }));
  };

  const handleAddGroup = (event: FormEvent) => {
    event.preventDefault();
    const name = newGroup.name.trim();
    if (!name) return;
    const group: Group = {
      id: uid("group"),
      name,
      color: newGroup.color,
      texture: newGroup.texture
    };
    setState((current) => ({ ...current, groups: [...current.groups, group] }));
    setComposer((current) => ({ ...current, groupId: group.id }));
    setEditingGroup(null);
    setPendingDeleteGroupId(null);
    setNewGroup({ name: "", color: "#22c55e", texture: "grid" });
  };

  const handleSaveGroup = (event: FormEvent) => {
    event.preventDefault();
    if (!editingGroup) return;
    const name = editingGroup.name.trim();
    if (!name) return;

    setState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === editingGroup.id ? { ...group, name, color: editingGroup.color } : group
      )
    }));
    setEditingGroup(null);
    setPendingDeleteGroupId(null);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (pendingDeleteGroupId !== groupId) {
      setPendingDeleteGroupId(groupId);
      return;
    }

    setState((current) => {
      const nextGroups = current.groups.filter((group) => group.id !== groupId);
      return {
        ...current,
        groups: nextGroups,
        prefs: {
          ...current.prefs,
          collapsedTaskGroups: Object.fromEntries(
            Object.entries(current.prefs.collapsedTaskGroups).filter(([key]) => !key.endsWith(`:${groupId}`))
          )
        }
      };
    });
    setComposer((current) => ({ ...current, groupId: current.groupId === groupId ? state.groups.find((group) => group.id !== groupId)?.id ?? "" : current.groupId }));
    if (groupFilter === groupId) setGroupFilter("all");
    setEditingGroup(null);
    setPendingDeleteGroupId(null);
  };

  const handleExportData = () => {
    const savedAt = new Date().toISOString();
    const envelope = createStorageEnvelope(state, savedAt);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbit-todo-backup-${toISODate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStorageMeta({
      status: "saved",
      message: "已导出一份 JSON 本地备份",
      savedAt
    });
  };

  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const envelope = parseStorageEnvelope(raw);
      if (!envelope) throw new Error("无法识别这个 JSON 备份文件");
      setState(envelope.state);
      setCalendarCursor(fromISODate(envelope.state.prefs.selectedDate));
      setStorageMeta({
        status: "imported",
        message: `已导入 ${file.name}`,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setStorageMeta({
        status: "error",
        message: error instanceof Error ? error.message : "导入失败",
        savedAt: storageMeta.savedAt
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleBackgroundImageImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await prepareBackgroundImage(file);
      updatePrefs({ backgroundImage: dataUrl, backgroundMode: "cover", backgroundOpacity: 0.34, theme: "custom" });
      setStorageMeta({
        status: "saved",
        message: `已导入背景 ${file.name}`,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setStorageMeta({
        status: "error",
        message: error instanceof Error ? error.message : "背景图片导入失败",
        savedAt: storageMeta.savedAt
      });
    } finally {
      event.target.value = "";
    }
  };

  const renderTaskCards = (tasks: Task[]) =>
    tasks.map((task) => (
      <TaskCard
        key={task.id}
        task={task}
        group={groupById.get(task.groupId)}
        groups={state.groups}
        selectedDate={selectedDate}
        isExpanded={Boolean(expandedTaskIds[task.id])}
        onExpand={toggleTaskDetails}
        onToggle={(id) => updateTask(id, (item) => ({ ...item, status: item.status === "done" ? "active" : "done" }))}
        onUpdate={(id, patch) => updateTask(id, (item) => ({ ...item, ...patch }))}
        onDelete={(id) =>
          setState((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== id) }))
        }
        onAssign={(id, date) => updateTask(id, (item) => ({ ...item, type: "scheduled", scheduledDate: date }))}
        onDeadline={(id, date) => updateTask(id, (item) => ({ ...item, type: "deadline", dueDate: date }))}
        onInbox={(id) =>
          updateTask(id, (item) => ({ ...item, type: "inbox", scheduledDate: undefined, dueDate: undefined }))
        }
      />
    ));

  const renderGroupedTaskCards = (sectionId: string, tasks: Task[]) => {
    const groupsWithTasks = state.groups
      .map((group) => ({
        group,
        tasks: tasks.filter((task) => task.groupId === group.id)
      }))
      .filter((item) => item.tasks.length > 0);
    const unknownTasks = tasks.filter((task) => !groupById.has(task.groupId));
    const renderGroups = unknownTasks.length
      ? [
          ...groupsWithTasks,
          {
            group: { id: "ungrouped", name: "未分组", color: "#94a3b8", texture: "grid" as TextureId },
            tasks: unknownTasks
          }
        ]
      : groupsWithTasks;

    return (
      <div className="task-group-list">
        {renderGroups.map(({ group, tasks: groupTasks }) => {
          const key = getTaskGroupKey(sectionId, group.id);
          const isCollapsed = Boolean(state.prefs.collapsedTaskGroups[key]);
          const doneCount = groupTasks.filter((task) => task.status === "done").length;

          return (
            <section className="task-group" key={key}>
              <button className="task-group__head" type="button" onClick={() => toggleTaskGroup(sectionId, group.id)}>
                <span className={`task-group__chevron ${isCollapsed ? "is-collapsed" : ""}`}>
                  <ChevronRight size={15} />
                </span>
                <span className="swatch" style={{ background: group.color }} />
                <strong>{group.name}</strong>
                <small>
                  {groupTasks.length} 项{doneCount ? ` · ${doneCount} 完成` : ""}
                </small>
              </button>
              {!isCollapsed && <div className="task-group__body">{renderTaskCards(groupTasks)}</div>}
            </section>
          );
        })}
      </div>
    );
  };

  const startTimer = () => {
    setTimer((current) => ({
      ...current,
      duration: current.remaining === 0 ? timerMinutes * 60 : current.duration,
      remaining: current.remaining === 0 ? timerMinutes * 60 : current.remaining,
      running: true
    }));
  };

  const resetTimer = () => {
    setTimer({ duration: timerMinutes * 60, remaining: timerMinutes * 60, running: false });
  };

  const timerProgress = timer.duration ? 1 - timer.remaining / timer.duration : 0;
  const timerDisplay = `${pad(Math.floor(timer.remaining / 60))}:${pad(timer.remaining % 60)}`;
  const storageFootprint = useMemo(() => formatBytes(estimateStateBytes(state)), [state]);
  const storageLabel: Record<StorageStatus, string> = {
    saved: "已保存",
    saving: "保存中",
    synced: "已同步",
    imported: "已导入",
    error: "保存异常"
  };
  const renderActiveDockPanel = () => {
    if (state.prefs.dockPanel === "calendar") {
      return (
        <div className="calendar-module">
          <header className="module-head">
            <div>
              <p className="eyebrow">时间地图</p>
              <h2>
                {calendarCursor.getFullYear()}年{calendarCursor.getMonth() + 1}月
              </h2>
            </div>
            <div className="module-actions">
              <button
                className="date-jump-btn"
                type="button"
                onClick={() => {
                  updatePrefs({ selectedDate: today });
                  setCalendarCursor(fromISODate(today));
                }}
              >
                今日
              </button>
              <button
                className="icon-btn"
                type="button"
                title="上一段"
                onClick={() =>
                  setCalendarCursor((current) =>
                    state.prefs.calendarView === "month" ? addMonths(current, -1) : addMonths(current, -12)
                  )
                }
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="icon-btn"
                type="button"
                title="下一段"
                onClick={() =>
                  setCalendarCursor((current) =>
                    state.prefs.calendarView === "month" ? addMonths(current, 1) : addMonths(current, 12)
                  )
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </header>

          <div className="segmented">
            <button
              type="button"
              className={state.prefs.calendarView === "month" ? "is-active" : ""}
              onClick={() => updatePrefs({ calendarView: "month" })}
            >
              <CalendarDays size={15} />
              月历
            </button>
            <button
              type="button"
              className={state.prefs.calendarView === "year" ? "is-active" : ""}
              onClick={() => updatePrefs({ calendarView: "year" })}
            >
              <CalendarRange size={15} />
              年历
            </button>
          </div>

          {state.prefs.calendarView === "month" ? (
            <MonthCalendar
              anchor={calendarCursor}
              selectedDate={selectedDate}
              today={today}
              counts={taskCountsByDate}
              onSelect={(iso) => {
                updatePrefs({ selectedDate: iso });
                setCalendarCursor(fromISODate(iso));
              }}
            />
          ) : (
            <YearCalendar
              year={calendarCursor.getFullYear()}
              selectedDate={selectedDate}
              today={today}
              counts={taskCountsByDate}
              onSelect={(iso) => {
                updatePrefs({ selectedDate: iso });
                setCalendarCursor(fromISODate(iso));
              }}
            />
          )}
        </div>
      );
    }

    if (state.prefs.dockPanel === "timer") {
      return (
        <div className="timer-module">
          <header className="module-head">
            <div>
              <p className="eyebrow">节奏</p>
              <h2>番茄钟</h2>
            </div>
            <Clock3 size={20} />
          </header>
          <div className="timer-face" style={{ "--progress": timerProgress } as CSSProperties}>
            <span>{timerDisplay}</span>
          </div>
          <div className="timer-controls">
            <label>
              <input
                type="number"
                min="1"
                max="180"
                value={timerMinutes}
                onChange={(event) => {
                  const minutes = Math.max(1, Math.min(180, Number(event.target.value) || 1));
                  setTimerMinutes(minutes);
                  if (!timer.running) setTimer({ duration: minutes * 60, remaining: minutes * 60, running: false });
                }}
              />
              分钟
            </label>
            {timer.running ? (
              <button
                className="icon-btn strong"
                type="button"
                title="暂停"
                onClick={() => setTimer((current) => ({ ...current, running: false }))}
              >
                <Pause size={16} />
              </button>
            ) : (
              <button className="icon-btn strong" type="button" title="开始" onClick={startTimer}>
                <Play size={16} />
              </button>
            )}
            <button className="icon-btn" type="button" title="重置" onClick={resetTimer}>
              <TimerReset size={16} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="today-module">
        <header className="module-head">
          <div>
            <p className="eyebrow">今日</p>
            <h2>{formatDateZh(today)}</h2>
          </div>
          <Pin size={18} />
        </header>
        <div className="mini-task-list">
          {currentTasks.length ? (
            currentTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="mini-task"
                onClick={() => updatePrefs({ selectedDate: task.scheduledDate ?? task.dueDate ?? today })}
              >
                <span style={{ background: groupById.get(task.groupId)?.color ?? "#94a3b8" }} />
                {task.title}
              </button>
            ))
          ) : (
            <p className="empty-state compact">今日还没有计划。</p>
          )}
        </div>
      </div>
    );
  };
  const appStyle = {
    "--custom-accent": state.prefs.customAccent,
    "--completed-color": state.prefs.completedColor,
    "--custom-bg-image": state.prefs.backgroundImage ? `url(${state.prefs.backgroundImage})` : "none",
    "--custom-bg-size": getBackgroundCss(state.prefs.backgroundMode).size,
    "--custom-bg-repeat": getBackgroundCss(state.prefs.backgroundMode).repeat,
    "--custom-bg-opacity": state.prefs.backgroundOpacity
  } as CSSProperties;

  return (
    <div className={`app theme-${state.prefs.theme} surface-${state.prefs.texture}`} style={appStyle}>
      <aside className="left-rail">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={22} />
          </div>
          <div>
            <strong>星轨清单</strong>
            <span>Orbit Todo</span>
          </div>
        </div>

        <div className="quote-panel">
          <Sparkles size={16} />
          <p>{dailyQuote}</p>
        </div>

        <section className="rail-section">
          <header className="mini-title collapsible-title">
            <span>
              <ListTodo size={16} />
              分组
            </span>
            <button
              className={`collapse-toggle ${state.prefs.groupsCollapsed ? "is-collapsed" : ""}`}
              type="button"
              title={state.prefs.groupsCollapsed ? "展开分组" : "折叠分组"}
              aria-expanded={!state.prefs.groupsCollapsed}
              onClick={() => updatePrefs({ groupsCollapsed: !state.prefs.groupsCollapsed })}
            >
              <ChevronRight size={15} />
            </button>
          </header>
          {!state.prefs.groupsCollapsed && (
            <div className="collapsible-body">
              <button
                className={`group-filter ${groupFilter === "all" ? "is-active" : ""}`}
                type="button"
                onClick={() => setGroupFilter("all")}
              >
                <span className="swatch all" />
                全部计划
              </button>
              {state.groups.map((group) =>
                editingGroup?.id === group.id ? (
                  <form className="group-edit-form" key={group.id} onSubmit={handleSaveGroup}>
                    <input
                      aria-label="分组名称"
                      value={editingGroup.name}
                      onChange={(event) =>
                        setEditingGroup((current) =>
                          current ? { ...current, name: event.target.value } : current
                        )
                      }
                    />
                    <input
                      aria-label="分组颜色"
                      className="color-input"
                      type="color"
                      value={editingGroup.color}
                      onChange={(event) =>
                        setEditingGroup((current) =>
                          current ? { ...current, color: event.target.value } : current
                        )
                      }
                    />
                    <button className="icon-btn strong" type="submit" title="保存分组">
                      <Save size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="取消编辑"
                      onClick={() => {
                        setEditingGroup(null);
                        setPendingDeleteGroupId(null);
                      }}
                    >
                      <X size={16} />
                    </button>
                    <button
                      className={`icon-btn danger ${pendingDeleteGroupId === group.id ? "confirm-delete" : ""}`}
                      type="button"
                      title={pendingDeleteGroupId === group.id ? "再次点击确认删除分组" : "删除分组"}
                      onClick={() => handleDeleteGroup(group.id)}
                    >
                      {pendingDeleteGroupId === group.id ? "删" : <Trash2 size={16} />}
                    </button>
                  </form>
                ) : (
                  <div className="group-row" key={group.id}>
                    <button
                      className={`group-filter ${groupFilter === group.id ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setGroupFilter(group.id)}
                    >
                      <span className="swatch" style={{ background: group.color }} />
                      {group.name}
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="编辑分组"
                      onClick={() => {
                        setEditingGroup({ id: group.id, name: group.name, color: group.color });
                        setPendingDeleteGroupId(null);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                )
              )}
              <form className="new-group-form" onSubmit={handleAddGroup}>
                <input
                  aria-label="分组名"
                  value={newGroup.name}
                  onChange={(event) => setNewGroup((current) => ({ ...current, name: event.target.value }))}
                  placeholder="新分组"
                />
                <input
                  aria-label="分组颜色"
                  className="color-input"
                  type="color"
                  value={newGroup.color}
                  onChange={(event) => setNewGroup((current) => ({ ...current, color: event.target.value }))}
                />
                <button className="icon-btn strong" type="submit" title="创建分组">
                  <Plus size={16} />
                </button>
              </form>
            </div>
          )}
        </section>

        <section className="rail-section">
          <header className="mini-title">
            <span>
              <LayoutGrid size={16} />
              工具
            </span>
          </header>
          <nav className="sidebar-tools" aria-label="工具切换">
            <button
              className={`group-filter tool-filter ${
                state.prefs.toolPanelOpen && state.prefs.dockPanel === "calendar" ? "is-active" : ""
              }`}
              type="button"
              aria-expanded={state.prefs.toolPanelOpen && state.prefs.dockPanel === "calendar"}
              onClick={() => toggleToolPanel("calendar")}
            >
              <CalendarDays size={16} />
              <span>
                时间地图
                <small>
                  {state.prefs.toolPanelOpen && state.prefs.dockPanel === "calendar"
                    ? "再次点击收起"
                    : `${selectedDateTasks.length} 项选中日`}
                </small>
              </span>
            </button>
            <button
              className={`group-filter tool-filter ${
                state.prefs.toolPanelOpen && state.prefs.dockPanel === "timer" ? "is-active" : ""
              }`}
              type="button"
              aria-expanded={state.prefs.toolPanelOpen && state.prefs.dockPanel === "timer"}
              onClick={() => toggleToolPanel("timer")}
            >
              <Clock3 size={16} />
              <span>
                节奏
                <small>
                  {state.prefs.toolPanelOpen && state.prefs.dockPanel === "timer" ? "再次点击收起" : timerDisplay}
                </small>
              </span>
            </button>
            <button
              className={`group-filter tool-filter ${
                state.prefs.toolPanelOpen && state.prefs.dockPanel === "today" ? "is-active" : ""
              }`}
              type="button"
              aria-expanded={state.prefs.toolPanelOpen && state.prefs.dockPanel === "today"}
              onClick={() => toggleToolPanel("today")}
            >
              <Pin size={16} />
              <span>
                今日
                <small>
                  {state.prefs.toolPanelOpen && state.prefs.dockPanel === "today"
                    ? "再次点击收起"
                    : `${currentTasks.length} 项`}
                </small>
              </span>
            </button>
          </nav>
        </section>

        <section className="rail-section">
          <header className="mini-title">
            <Palette size={16} />
            风格
          </header>
          <div className="theme-grid">
            {themeOptions.map((theme) => (
              <button
                key={theme.id}
                className={`theme-tile ${state.prefs.theme === theme.id ? "is-active" : ""}`}
                type="button"
                onClick={() => updatePrefs({ theme: theme.id })}
              >
                {theme.name}
              </button>
            ))}
          </div>
          <div className="texture-row">
            {textureOptions.map((texture) => (
              <button
                key={texture.id}
                className={`texture-btn texture-${texture.id} ${
                  state.prefs.texture === texture.id ? "is-active" : ""
                }`}
                type="button"
                onClick={() => updatePrefs({ texture: texture.id })}
              >
                {texture.name}
              </button>
            ))}
          </div>
          <label className="accent-picker">
            <span>主题色</span>
            <input
              type="color"
              value={state.prefs.customAccent}
              onChange={(event) => updatePrefs({ customAccent: event.target.value })}
            />
          </label>
          <label className="accent-picker">
            <span>完成色</span>
            <input
              type="color"
              value={state.prefs.completedColor}
              onChange={(event) => updatePrefs({ completedColor: event.target.value })}
            />
          </label>
          <label className="accent-picker">
            <span>便签色</span>
            <input
              type="color"
              value={state.prefs.sticky.color}
              onChange={(event) =>
                updatePrefs({ sticky: { ...state.prefs.sticky, color: event.target.value } })
              }
            />
          </label>
          <label className="background-control">
            <span>便签透明度</span>
            <input
              type="range"
              min="0.35"
              max="1"
              step="0.05"
              value={state.prefs.sticky.opacity}
              onChange={(event) =>
                updatePrefs({ sticky: { ...state.prefs.sticky, opacity: Number(event.target.value) } })
              }
            />
          </label>
          <div className="background-actions">
            <button className="command-btn" type="button" onClick={() => backgroundInputRef.current?.click()}>
              <Upload size={16} />
              导入背景
            </button>
            <button
              className="command-btn"
              type="button"
              disabled={!state.prefs.backgroundImage}
              onClick={() => updatePrefs({ backgroundImage: "" })}
            >
              <X size={16} />
              清除
            </button>
            <input
              ref={backgroundInputRef}
              hidden
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg"
              onChange={handleBackgroundImageImport}
            />
          </div>
          <label className="background-control">
            <span>背景大小</span>
            <select
              value={state.prefs.backgroundMode}
              disabled={!state.prefs.backgroundImage}
              onChange={(event) => updatePrefs({ backgroundMode: event.target.value as BackgroundMode })}
            >
              <option value="cover">铺满裁切</option>
              <option value="contain">完整显示</option>
              <option value="stretch">拉伸适配</option>
              <option value="tile">平铺</option>
            </select>
          </label>
          <label className="background-control">
            <span>背景透明度</span>
            <input
              type="range"
              min="0"
              max="0.85"
              step="0.05"
              value={state.prefs.backgroundOpacity}
              disabled={!state.prefs.backgroundImage}
              onChange={(event) => updatePrefs({ backgroundOpacity: Number(event.target.value) })}
            />
          </label>
        </section>

        <section className="rail-section">
          <header className="mini-title">
            <Database size={16} />
            本地数据
          </header>
          <div className={`storage-card is-${storageMeta.status}`}>
            <span className="storage-dot" />
            <strong>{storageLabel[storageMeta.status]}</strong>
            <p>{storageMeta.message}</p>
            <small>
              {storageMeta.savedAt ? `最近 ${formatDateTimeZh(storageMeta.savedAt)}` : "尚未保存"} ·{" "}
              {state.tasks.length} 项 · {storageFootprint}
            </small>
          </div>
          <div className="data-actions">
            <button className="command-btn" type="button" onClick={handleExportData}>
              <Download size={16} />
              导出
            </button>
            <button className="command-btn" type="button" onClick={() => importInputRef.current?.click()}>
              <Upload size={16} />
              导入
            </button>
            <input ref={importInputRef} hidden type="file" accept="application/json,.json" onChange={handleImportData} />
          </div>
        </section>
      </aside>

      <main className="main-stage">
        <header className="top-bar">
          <div className="focus-date-shell">
            <p className="eyebrow">当前焦点</p>
            <h1>
              <button
                className="focus-date-button"
                type="button"
                title="切换当前焦点日期"
                onClick={openSelectedDatePicker}
              >
                <span>{formatLongDateZh(selectedDate)}</span>
                <CalendarDays size={20} />
              </button>
            </h1>
            <input
              ref={selectedDateInputRef}
              className="focus-date-input"
              type="date"
              value={selectedDate}
              aria-label="选择当前焦点日期"
              onChange={(event) => selectDate(event.target.value)}
            />
          </div>
          <div className="top-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索计划"
              />
            </label>
            <button
              className="command-btn"
              type="button"
              onClick={() =>
                updatePrefs({ sticky: { ...state.prefs.sticky, visible: !state.prefs.sticky.visible } })
              }
            >
              <StickyNote size={17} />
              便签
            </button>
          </div>
        </header>

        <section className="composer-shell">
          <form className="composer" onSubmit={handleAddTask}>
            <div className="composer-main">
              <input
                value={composer.title}
                onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))}
                placeholder="输入计划，比如：明天 9点 DDL 前交作品集"
              />
              <textarea
                value={composer.detail}
                onChange={(event) => setComposer((current) => ({ ...current, detail: event.target.value }))}
                placeholder="备注、灵感、拆解步骤"
              />
            </div>
            <div className="composer-controls">
              <select
                value={composer.type}
                onChange={(event) =>
                  setComposer((current) => ({ ...current, type: event.target.value as TaskType }))
                }
              >
                {composerTaskTypes.map((type) => (
                  <option key={type} value={type}>
                    {taskTypeMeta[type].label}
                  </option>
                ))}
              </select>
              <select
                value={composer.groupId}
                onChange={(event) => setComposer((current) => ({ ...current, groupId: event.target.value }))}
              >
                {state.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={composer.scheduledDate}
                onChange={(event) => setComposer((current) => ({ ...current, scheduledDate: event.target.value }))}
                title="安排日期"
              />
              <input
                type="date"
                value={composer.dueDate}
                onChange={(event) => setComposer((current) => ({ ...current, dueDate: event.target.value }))}
                title="DDL 日期"
              />
              <button className="command-btn primary" type="submit">
                <Plus size={17} />
                添加
              </button>
            </div>
          </form>
          <div className="extract-preview">
            {parsedPreview.items.length ? (
              parsedPreview.items.slice(0, 6).map((item) => (
                <span key={item.id} className={`time-chip ${item.kind === "deadline" ? "is-ddl" : ""}`}>
                  {item.label}
                </span>
              ))
            ) : (
              <span className="subtle-chip">等待时间线索</span>
            )}
          </div>
        </section>

        {state.prefs.toolPanelOpen && <section className="utility-workspace">{renderActiveDockPanel()}</section>}

        <div className="work-grid">
          <TaskColumn
            title="待分配"
            icon={Inbox}
            tasks={unassignedTasks}
            empty="这里会收纳还没有安排日期的计划。"
          >
            {renderGroupedTaskCards("inbox", unassignedTasks)}
          </TaskColumn>

          <TaskColumn
            title={formatDateZh(selectedDate)}
            icon={CalendarCheck}
            tasks={selectedDateTasks}
            empty="选中日期暂时没有计划。"
          >
            {renderGroupedTaskCards("selected-date", selectedDateTasks)}
          </TaskColumn>

          <TaskColumn title="DDL" icon={Flag} tasks={deadlineTasks} empty="没有正在追踪的 DDL。">
            {renderGroupedTaskCards("deadline", deadlineTasks)}
          </TaskColumn>

          <TaskColumn title="长期目标" icon={Target} tasks={longTermTasks} empty="长期目标会在这里沉淀。">
            {renderGroupedTaskCards("longterm", longTermTasks)}
          </TaskColumn>

          <TaskColumn title="灵感胶囊" icon={Lightbulb} tasks={ideaTasks} empty="新奇想法会在这里发芽。">
            {renderGroupedTaskCards("idea", ideaTasks)}
          </TaskColumn>
        </div>
      </main>

      {state.prefs.sticky.visible && !isDesktopApp && (
        <div
          ref={stickyRef}
          className="magnet-sticky"
          style={{
            transform: `translate(${state.prefs.sticky.x}px, ${state.prefs.sticky.y}px)`,
            width: state.prefs.sticky.width,
            height: state.prefs.sticky.height,
            background: `linear-gradient(180deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.18)), ${hexToRgba(
              state.prefs.sticky.color,
              state.prefs.sticky.opacity
            )}`
          }}
        >
          <header
            className="sticky-head"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setInteraction({
                mode: "move",
                startX: event.clientX,
                startY: event.clientY,
                origin: state.prefs.sticky
              });
            }}
          >
            <span>
              <Grip size={16} />
              今日便签
            </span>
            <button
              className="icon-btn"
              type="button"
              title="隐藏"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => updatePrefs({ sticky: { ...state.prefs.sticky, visible: false } })}
            >
              <RefreshCw size={15} />
            </button>
          </header>
          <div className="sticky-body">
            {currentTasks.length ? (
              currentTasks.map((task) => (
                <label key={task.id} className="sticky-task">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={() =>
                      updateTask(task.id, (item) => ({ ...item, status: item.status === "done" ? "active" : "done" }))
                    }
                  />
                  <span style={{ "--group-color": groupById.get(task.groupId)?.color ?? "#94a3b8" } as CSSProperties}>
                    {task.title}
                  </span>
                </label>
              ))
            ) : (
              <p className="empty-state compact">今日便签是空的。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return isStickyWindowMode() ? <StickyWindowApp /> : <MainApp />;
}

function MonthCalendar({
  anchor,
  selectedDate,
  today,
  counts,
  onSelect
}: {
  anchor: Date;
  selectedDate: string;
  today: string;
  counts: Map<string, number>;
  onSelect: (iso: string) => void;
}) {
  const cells = getMonthCells(anchor);
  return (
    <div className="month-calendar">
      {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
        <span className="weekday" key={day}>
          {day}
        </span>
      ))}
      {cells.map((cell) => (
        <button
          key={cell.iso}
          type="button"
          className={[
            "day-cell",
            cell.inMonth ? "" : "is-muted",
            cell.iso === selectedDate ? "is-selected" : "",
            cell.iso === today ? "is-today" : ""
          ].join(" ")}
          onClick={() => onSelect(cell.iso)}
        >
          <span>{cell.day}</span>
          {(counts.get(cell.iso) ?? 0) > 0 && <em>{counts.get(cell.iso)}</em>}
        </button>
      ))}
    </div>
  );
}

function YearCalendar({
  year,
  selectedDate,
  today,
  counts,
  onSelect
}: {
  year: number;
  selectedDate: string;
  today: string;
  counts: Map<string, number>;
  onSelect: (iso: string) => void;
}) {
  return (
    <div className="year-calendar">
      {Array.from({ length: 12 }, (_, month) => {
        const anchor = new Date(year, month, 1);
        return (
          <section key={month} className="mini-month">
            <header>{month + 1}月</header>
            <div>
              {getMonthCells(anchor)
                .filter((cell) => cell.inMonth)
                .map((cell) => (
                  <button
                    key={cell.iso}
                    type="button"
                    className={[
                      "mini-day",
                      cell.iso === selectedDate ? "is-selected" : "",
                      cell.iso === today ? "is-today" : "",
                      (counts.get(cell.iso) ?? 0) > 0 ? "has-task" : ""
                    ].join(" ")}
                    onClick={() => onSelect(cell.iso)}
                    title={`${formatDateZh(cell.iso)} ${counts.get(cell.iso) ?? 0}项`}
                  >
                    {cell.day}
                  </button>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
