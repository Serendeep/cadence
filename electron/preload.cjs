const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  onBluetoothDevices(cb) {
    const listener = (_e, devices) => cb(devices)
    ipcRenderer.on('bluetooth-devices', listener)
    return () => ipcRenderer.off('bluetooth-devices', listener)
  },
  selectBluetoothDevice(id) {
    ipcRenderer.send('bluetooth-select', id)
  },
  onUpdate(cb) {
    const listener = (_e, msg) => cb(msg)
    ipcRenderer.on('update', listener)
    return () => ipcRenderer.off('update', listener)
  },
  installUpdate() {
    ipcRenderer.send('update-install')
  },
  signIn() {
    return ipcRenderer.invoke('auth-sign-in')
  },
})
