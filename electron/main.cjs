const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const distIndex = path.join(rootDir, "dist", "index.html");
const iconPath = path.join(rootDir, "assets", "orbit-todo.svg");
const preloadPath = path.join(__dirname, "preload.cjs");

let mainWindow = null;
let stickyWindow = null;
let latestStickyPayload = null;
let stickyResize = null;

app.setName("星轨清单");

function loadApp(win, query) {
  if (fs.existsSync(distIndex)) {
    win.loadFile(distIndex, query ? { query } : undefined);
  } else {
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("请先运行 npm run build"));
  }
}

function sendStickyBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || !stickyWindow || stickyWindow.isDestroyed()) return;
  mainWindow.webContents.send("sticky:bounds", stickyWindow.getBounds());
}

function sendStickyData() {
  if (!stickyWindow || stickyWindow.isDestroyed() || !latestStickyPayload) return;
  stickyWindow.webContents.send("sticky:data", latestStickyPayload);
}

function createStickyWindow(payload) {
  const sticky = payload?.sticky ?? {};
  const bounds = {
    x: Number.isFinite(sticky.x) ? Math.round(sticky.x) : undefined,
    y: Number.isFinite(sticky.y) ? Math.round(sticky.y) : undefined,
    width: Number.isFinite(sticky.width) ? Math.max(240, Math.round(sticky.width)) : 292,
    height: Number.isFinite(sticky.height) ? Math.max(260, Math.round(sticky.height)) : 360
  };

  stickyWindow = new BrowserWindow({
    ...bounds,
    minWidth: 240,
    minHeight: 260,
    title: "今日便签",
    frame: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  stickyWindow.once("ready-to-show", () => {
    stickyWindow.show();
    sendStickyData();
  });

  stickyWindow.webContents.on("did-finish-load", sendStickyData);
  stickyWindow.on("move", sendStickyBounds);
  stickyWindow.on("resize", sendStickyBounds);
  stickyWindow.on("closed", () => {
    stickyWindow = null;
    stickyResize = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sticky:closed");
  });

  loadApp(stickyWindow, { sticky: "1" });
}

function updateStickyWindow(payload) {
  latestStickyPayload = payload;
  if (!payload?.sticky?.visible) {
    if (stickyWindow && !stickyWindow.isDestroyed()) stickyWindow.close();
    return;
  }

  if (!stickyWindow || stickyWindow.isDestroyed()) {
    createStickyWindow(payload);
    return;
  }

  if (!stickyWindow.isMinimized() && !stickyWindow.isVisible()) stickyWindow.show();
  sendStickyData();
}

function resizeStickyWindow(screenX, screenY) {
  if (!stickyResize || !stickyWindow || stickyWindow.isDestroyed()) return;
  const dx = screenX - stickyResize.startX;
  const dy = screenY - stickyResize.startY;
  const minWidth = 240;
  const minHeight = 260;
  const next = { ...stickyResize.startBounds };

  if (stickyResize.edge.includes("e")) next.width = Math.max(minWidth, stickyResize.startBounds.width + dx);
  if (stickyResize.edge.includes("s")) next.height = Math.max(minHeight, stickyResize.startBounds.height + dy);
  if (stickyResize.edge.includes("w")) {
    const width = Math.max(minWidth, stickyResize.startBounds.width - dx);
    next.x = stickyResize.startBounds.x + stickyResize.startBounds.width - width;
    next.width = width;
  }
  if (stickyResize.edge.includes("n")) {
    const height = Math.max(minHeight, stickyResize.startBounds.height - dy);
    next.y = stickyResize.startBounds.y + stickyResize.startBounds.height - height;
    next.height = height;
  }

  stickyWindow.setBounds(next);
  sendStickyBounds();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "星轨清单 Orbit Todo",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#eef5ff",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow = win;

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    mainWindow = null;
    if (stickyWindow && !stickyWindow.isDestroyed()) stickyWindow.close();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  loadApp(win);
}

const menu = Menu.buildFromTemplate([
  {
    label: "星轨清单",
    submenu: [
      { role: "about", label: "关于" },
      { type: "separator" },
      { role: "quit", label: "退出" }
    ]
  },
  {
    label: "视图",
    submenu: [
      { role: "reload", label: "重新载入" },
      { role: "togglefullscreen", label: "全屏" },
      { type: "separator" },
      { role: "zoomIn", label: "放大" },
      { role: "zoomOut", label: "缩小" },
      { role: "resetZoom", label: "重置缩放" }
    ]
  }
]);

app.whenReady().then(() => {
  Menu.setApplicationMenu(menu);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("sticky:update", (_event, payload) => updateStickyWindow(payload));
ipcMain.on("sticky:ready", sendStickyData);
ipcMain.on("sticky:close", () => {
  if (stickyWindow && !stickyWindow.isDestroyed()) stickyWindow.close();
});
ipcMain.on("sticky:minimize", () => {
  if (stickyWindow && !stickyWindow.isDestroyed()) stickyWindow.minimize();
});
ipcMain.on("sticky:toggle-task", (_event, taskId) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sticky:toggle-task", taskId);
});
ipcMain.on("sticky:resize-start", (_event, payload) => {
  if (!stickyWindow || stickyWindow.isDestroyed()) return;
  stickyResize = {
    edge: String(payload.edge),
    startX: Number(payload.screenX),
    startY: Number(payload.screenY),
    startBounds: stickyWindow.getBounds()
  };
});
ipcMain.on("sticky:resize-move", (_event, payload) => {
  resizeStickyWindow(Number(payload.screenX), Number(payload.screenY));
});
ipcMain.on("sticky:resize-end", () => {
  stickyResize = null;
});
