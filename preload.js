const { contextBridge, ipcRenderer } = require("electron");

// Set up contextBridge for ipcRenderer communications

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
  },
  checkUnsavedChanges: (callback) => ipcRenderer.on('check-unsaved-changes', callback),
  confirmQuit: () => ipcRenderer.send('confirm-quit')
});
