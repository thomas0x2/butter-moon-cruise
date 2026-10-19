// Standalone desktop wrapper. Install once with `npm i -D electron`, then `npm run desktop`.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    backgroundColor: '#1b3b5a',
    title: 'Butter Moon Cruise',
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
