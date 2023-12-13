const { app, BrowserWindow, ipcMain } = require('electron');
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const path = require('path');

let openPort = null;

function createWindow () {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'logo.ico')
  });

  win.loadFile('index.html');
  
  function refreshPorts() {
    SerialPort.list().then(ports => {
        win.webContents.send('list-ports', ports);
    }).catch(err => {
        console.error("Error listing ports:", err);
    });
}

// Periodically refresh ports every 2 seconds (or your preferred interval)
  setInterval(refreshPorts, 2000);

  ipcMain.on('start-daq', (event, selectedPort) => {
    if (openPort) {
      openPort.close(err => {
          if (err) {
              console.log("Error closing port:", err.message);
          } else {
              console.log("Port closed successfully");
              openPort = null;
              win.webContents.send('port-closed');
          }
      });
  } else if (selectedPort) {
      const port = new SerialPort(selectedPort, { baudRate: 115200 });

      ipcMain.on('send-to-arduino', (event, dataString) => {
        port.write(dataString);
        console.log("Sent to Arduino: ", dataString);
      });

      const parser = port.pipe(new Readline({ delimiter: '\n' }));

      parser.on('data', (data) => {
        // console.log('Received data:', data);
        win.webContents.send('serial-data', data);
      });
      openPort = port;
    } else {
      console.log("No port selected. Make sure to select a port.");
    }
  });
}

app.whenReady().then(createWindow);
