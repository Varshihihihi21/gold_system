const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
} = require('electron');
const { getDeviceGuid, getPublicKey, signChallenge } = require('./device-credentials.cjs');
const { printReceipt } = require('./receipt-printer.cjs');

protocol.registerSchemesAsPrivileged([{
  scheme: 'goldline',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

const SESSION_PARTITION = 'goldline-volatile';
let mainWindow;
let quitting = false;

function getApiOrigin() {
  const apiUrl = process.env.GOLD_API_URL || 'http://localhost:4000';
  const parsed = new URL(apiUrl);
  if (app.isPackaged && parsed.protocol !== 'https:') {
    throw new Error('Set GOLD_API_URL to the production HTTPS API endpoint before launching the desktop app.');
  }
  return parsed.origin;
}


function registerIpc() {
  ipcMain.handle('device:identity', (event) => {
    assertTrustedSender(event);
    return { deviceGuid: getDeviceGuid(), publicKey: getPublicKey() };
  });
  ipcMain.handle('device:sign-challenge', (event, challenge) => {
    assertTrustedSender(event);
    return signChallenge(challenge);
  });
  ipcMain.handle('device:clear-transient-data', async (event) => {
    assertTrustedSender(event);
    const currentSession = session.fromPartition(SESSION_PARTITION);
    await Promise.all([currentSession.clearCache(), currentSession.clearStorageData()]);
  });
  ipcMain.handle('receipt:print', (event, receipt) => {
    assertTrustedSender(event);
    return printReceipt(receipt, SESSION_PARTITION);
  });
}

function assertTrustedSender(event) {
  const senderUrl = new URL(event.senderFrame.url);
  const trusted = app.isPackaged
    ? senderUrl.protocol === 'goldline:' && senderUrl.host === 'app'
    : senderUrl.origin === 'http://localhost:5173';
  if (!trusted) throw new Error('IPC request rejected from an untrusted renderer.');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition: SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    const allowed = app.isPackaged
      ? target.startsWith('goldline://app/')
      : target.startsWith('http://localhost:5173/');
    if (!allowed) event.preventDefault();
  });
  if (app.isPackaged) mainWindow.loadURL('goldline://app/index.html');
  else mainWindow.loadURL(process.env.GOLDLINE_DEV_SERVER_URL || 'http://localhost:5173');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

async function registerAppProtocol() {
  const root = path.resolve(__dirname, '..', 'dist');
  protocol.handle('goldline', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.resolve(root, `.${relativePath}`);
    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) {
      return new Response('Not found', { status: 404 });
    }
    const response = await net.fetch(pathToFileURL(filePath).toString());
    if (path.basename(filePath) !== 'index.html') return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      `connect-src 'self' ${getApiOrigin()}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'none'",
    ].join('; '));
    return new Response(response.body, { status: response.status, headers });
  });
}

async function clearSessionData() {
  const currentSession = session.fromPartition(SESSION_PARTITION);
  await Promise.all([currentSession.clearCache(), currentSession.clearStorageData()]);
}

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-application-cache');
app.setAppUserModelId('com.goldline.counter');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    if (app.isPackaged) getApiOrigin();
    await clearSessionData();
    await registerAppProtocol();
    registerIpc();
    createWindow();
  }).catch((error) => {
    console.error('Secure desktop startup failed:', error.message);
    dialog.showErrorBox('Kalash Gold could not start securely', error.message);
    app.quit();
  });
}

if (hasSingleInstanceLock) {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  clearSessionData().then(() => app.quit()).catch((error) => {
    console.error('Could not clear transient Chromium data before exit:', error.message);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
