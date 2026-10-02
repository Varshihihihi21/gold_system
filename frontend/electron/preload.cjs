const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goldline', Object.freeze({
  getDeviceIdentity: () => ipcRenderer.invoke('device:identity'),
  signChallenge: (challenge) => ipcRenderer.invoke('device:sign-challenge', challenge),
  clearTransientData: () => ipcRenderer.invoke('device:clear-transient-data'),
  printReceipt: (receipt) => ipcRenderer.invoke('receipt:print', receipt),
}));
