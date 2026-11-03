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
})
