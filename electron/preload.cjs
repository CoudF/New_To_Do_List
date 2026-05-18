const { contextBridge, ipcRenderer } = require("electron");

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("orbitDesktop", {
  isElectron: true,
  updateSticky: (payload) => ipcRenderer.send("sticky:update", payload),
  stickyReady: () => ipcRenderer.send("sticky:ready"),
  closeSticky: () => ipcRenderer.send("sticky:close"),
  minimizeSticky: () => ipcRenderer.send("sticky:minimize"),
  toggleStickyTask: (taskId) => ipcRenderer.send("sticky:toggle-task", taskId),
  resizeStickyStart: (payload) => ipcRenderer.send("sticky:resize-start", payload),
  resizeStickyMove: (payload) => ipcRenderer.send("sticky:resize-move", payload),
  resizeStickyEnd: () => ipcRenderer.send("sticky:resize-end"),
  onStickyData: (callback) => on("sticky:data", callback),
  onStickyClosed: (callback) => on("sticky:closed", callback),
  onStickyBounds: (callback) => on("sticky:bounds", callback),
  onStickyTaskToggle: (callback) => on("sticky:toggle-task", callback)
});
