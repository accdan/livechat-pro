const { app, BrowserWindow, Menu, session, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Permanent AppData storage directory (persists across restarts and portable runs)
const baseConfigRoot = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config'));
const permanentConfigDir = path.join(baseConfigRoot, 'MultiChatStream');
const legacyConfigDir = path.join(baseConfigRoot, 'LiveChatPro');

try {
  if (!fs.existsSync(permanentConfigDir)) {
    fs.mkdirSync(permanentConfigDir, { recursive: true });
    // Migrate legacy config if exists
    const legacyFile = path.join(legacyConfigDir, 'settings.json');
    const newFile = path.join(permanentConfigDir, 'settings.json');
    if (fs.existsSync(legacyFile) && !fs.existsSync(newFile)) {
      fs.copyFileSync(legacyFile, newFile);
    }
  }
} catch (e) {
  console.warn("Permanent config dir init warning:", e);
}

// === SECURITY LAYER 1: ANTI-DEVTOOLS & SHORTCUT BLOCKER ===
function triggerTamperResponse() {
  dialog.showMessageBoxSync({
    type: 'error',
    title: 'MultiChatStream Security',
    message: 'Ish ish tak patotlah bang',
    buttons: ['Exit']
  });
  app.exit(0);
}

// === SECURITY LAYER 1: ANTI-DEVTOOLS & SHORTCUT BLOCKER ===
function blockDevTools() {
  // Disable devtools in production
  if (app.isPackaged) {
    app.on('web-contents-created', (event, contents) => {
      contents.on('devtools-opened', () => {
        contents.closeDevTools();
        triggerTamperResponse();
      });
    });
  }

  // Intercept tampering shortcuts globally
  const tamperShortcuts = [
    'F12',
    'Ctrl+Shift+I',
    'Ctrl+Shift+J',
    'Ctrl+Shift+C',
    'Ctrl+U'
  ];

  app.whenReady().then(() => {
    const { globalShortcut } = require('electron');
    tamperShortcuts.forEach(acc => {
      globalShortcut.register(acc, () => {
        triggerTamperResponse();
      });
    });
    // Swallow benign refresh shortcuts
    ['F5', 'Ctrl+R'].forEach(acc => {
      globalShortcut.register(acc, () => {});
    });
  });

  // Disable context menu (right click inspect element)
  app.on('web-contents-created', (e, wc) => {
    wc.on('context-menu', (event) => {
      event.preventDefault();
    });
  });

  // Renderer tamper IPC
  ipcMain.on('tamper-detected', () => {
    triggerTamperResponse();
  });
}

// === SECURITY LAYER 2: ANTI-DEBUGGING CLI FLAG GUARD ===
function guardCliFlags() {
  const riskyFlags = ['--inspect', '--inspect-brk', '--remote-debugging-port', '--enable-logging', '--js-flags'];
  const found = process.argv.some(arg => riskyFlags.some(flag => arg.startsWith(flag)));
  if (found) {
    triggerTamperResponse();
  }
}

// === SECURITY LAYER 4: ASAR INTEGRITY VERIFICATION ===
function verifyAsarIntegrity() {
  try {
    const asarPath = path.join(__dirname, 'app.asar');
    if (!fs.existsSync(asarPath)) return; // In dev mode there is no asar
    const data = fs.readFileSync(asarPath);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const EXPECTED_HASH = 'PLACEHOLDER_EXPECTED_HASH'; // <-- replace with real hash after build if desired
    if (EXPECTED_HASH !== 'PLACEHOLDER_EXPECTED_HASH' && hash !== EXPECTED_HASH) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'MultiChatStream Security',
        message: 'Ish ish tak patotlah bang',
        buttons: ['Exit']
      });
      app.exit(0);
    }
  } catch (e) {
    console.warn('ASAR integrity check failed:', e);
  }
}

// Execute security checks early
blockDevTools();
guardCliFlags();
verifyAsarIntegrity();
const configFilePath = path.join(permanentConfigDir, 'settings.json');

// Fix Windows Chromium cache permission conflict while keeping config permanent
const tempAppData = path.join(app.getPath('temp'), 'multichatstream-app-data');
try {
  if (!fs.existsSync(tempAppData)) {
    fs.mkdirSync(tempAppData, { recursive: true });
  }
  app.setPath('userData', tempAppData);
  app.setPath('sessionData', tempAppData);
} catch (e) {
  console.warn("Custom app data path notice:", e);
}

// Allow live donation alert audio (Tako, Saweria, etc.) to autoplay without requiring window click
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;

function createWindow() {
  // Strip X-Frame-Options and Content-Security-Policy headers so YouTube popout live chat can load seamlessly
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = Object.assign({}, details.responseHeaders);
    
    // Remove frame restriction headers
    Object.keys(responseHeaders).forEach(header => {
      if (header.toLowerCase() === 'x-frame-options' || header.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[header];
      }
    });

    callback({
      cancel: false,
      responseHeaders: responseHeaders
    });
  });

  let initialBounds = { width: 300, height: 600 };
  try {
    if (fs.existsSync(configFilePath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      if (savedConfig && savedConfig.windowBounds) {
        initialBounds = Object.assign(initialBounds, savedConfig.windowBounds);
      }
    }
  } catch (e) {}

  mainWindow = new BrowserWindow({
    width: initialBounds.width || 300,
    height: initialBounds.height || 600,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 200,
    minHeight: 140,
    maximizable: false,
    fullscreenable: false,
    title: "MultiChatStream - Stream Overlay",
    icon: path.join(__dirname, 'favicon.ico'),
    transparent: true,
    frame: false,
    alwaysOnTop: true, // Selalu di depan agar saat pindah screen / ALT+TAB tidak tertindih
    hasShadow: false,
    resizable: true,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  // Level 'screen-saver' guarantees it stays on top during ALT+TAB and across multiple monitors
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  let isSettingsOpen = false;
  let preSettingsWidth = 300;

  // Debounced auto-save window bounds so user's compact width is permanently remembered
  let saveBoundsTimeout = null;
  function debounceSaveBounds() {
    if (saveBoundsTimeout) clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || isSettingsOpen) return;
      try {
        const bounds = mainWindow.getBounds();
        let currentConfig = {};
        if (fs.existsSync(configFilePath)) {
          currentConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        }
        currentConfig.windowBounds = bounds;
        fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), 'utf8');
      } catch (e) {}
    }, 600);
  }

  mainWindow.on('resize', debounceSaveBounds);
  mainWindow.on('move', debounceSaveBounds);

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for permanent configuration storage
ipcMain.handle('load-config', async () => {
  try {
    if (fs.existsSync(configFilePath)) {
      const data = fs.readFileSync(configFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("Error reading permanent config:", e);
  }
  return null;
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (e) {
    console.warn("Error writing permanent config:", e);
    return { success: false, error: e.message };
  }
});

// IPC Handlers for window locking, always-on-top, and frameless window controls
ipcMain.on('set-always-on-top', (event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag, 'screen-saver');
  }
});

ipcMain.on('set-window-locked', (event, isLocked) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentBounds = mainWindow.getBounds();
    mainWindow.setMovable(!isLocked);
    mainWindow.setBounds(currentBounds);
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Auto-expand/collapse window width when side settings panel is toggled
ipcMain.on('toggle-settings-panel', (event, isOpen) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    isSettingsOpen = Boolean(isOpen);
    const [currentW, currentH] = mainWindow.getSize();
    const [currentX, currentY] = mainWindow.getPosition();
    const panelWidth = 370;

    if (isOpen) {
      preSettingsWidth = currentW;
      const { screen } = require('electron');
      const display = screen.getDisplayMatching(mainWindow.getBounds());
      let newW = currentW + panelWidth;
      let newX = currentX;
      if (newX + newW > display.workArea.x + display.workArea.width) {
        newX = Math.max(display.workArea.x, display.workArea.x + display.workArea.width - newW);
      }
      mainWindow.setBounds({ x: newX, y: currentY, width: newW, height: currentH });
    } else {
      mainWindow.setSize(Math.max(200, preSettingsWidth), currentH);
    }
  } catch (err) {
    console.warn("Error resizing window for settings panel:", err);
  }
});

// =========================================================================
// Standalone Live Donation Panel Window (Movable anywhere across all screens)
// =========================================================================
let donationWindow = null;

function createOrShowDonationWindow(tab = 'overlay') {
  if (donationWindow && !donationWindow.isDestroyed()) {
    donationWindow.show();
    donationWindow.focus();
    donationWindow.webContents.send('switch-donation-tab', tab);
    return;
  }

  // Load saved donation window bounds if available
  let bounds = { width: 380, height: 310 };
  try {
    if (fs.existsSync(configFilePath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      if (savedConfig && savedConfig.donationWindowBounds) {
        bounds = Object.assign(bounds, savedConfig.donationWindowBounds);
      }
    }
  } catch (e) {}

  donationWindow = new BrowserWindow({
    width: bounds.width || 380,
    height: bounds.height || 310,
    x: bounds.x,
    y: bounds.y,
    minWidth: 280,
    minHeight: 180,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    autoHideMenuBar: true,
    show: true,
    title: "Live Donation Panel - MultiChatStream",
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  donationWindow.setAlwaysOnTop(true, 'screen-saver');

  let saveDonationBoundsTimeout = null;
  function debounceSaveDonationBounds() {
    if (saveDonationBoundsTimeout) clearTimeout(saveDonationBoundsTimeout);
    saveDonationBoundsTimeout = setTimeout(() => {
      if (!donationWindow || donationWindow.isDestroyed()) return;
      try {
        const b = donationWindow.getBounds();
        let currentConfig = {};
        if (fs.existsSync(configFilePath)) {
          currentConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        }
        currentConfig.donationWindowBounds = b;
        fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), 'utf8');
      } catch (e) {}
    }, 600);
  }

  donationWindow.on('resize', debounceSaveDonationBounds);
  donationWindow.on('move', debounceSaveDonationBounds);

  donationWindow.loadFile(path.join(__dirname, 'donation.html'));

  donationWindow.webContents.on('did-finish-load', () => {
    donationWindow.webContents.send('switch-donation-tab', tab);
  });

  donationWindow.on('closed', () => {
    donationWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('donation-window-closed');
    }
  });
}

ipcMain.on('open-donation-window', (event, tab) => {
  createOrShowDonationWindow(tab || 'overlay');
});

ipcMain.on('close-donation-window', () => {
  if (donationWindow && !donationWindow.isDestroyed()) {
    donationWindow.close();
  }
});

ipcMain.on('toggle-donation-window', (event, tab) => {
  if (donationWindow && !donationWindow.isDestroyed() && donationWindow.isVisible()) {
    donationWindow.close();
  } else {
    createOrShowDonationWindow(tab || 'overlay');
  }
});

ipcMain.on('set-donation-locked', (event, isLocked) => {
  if (donationWindow && !donationWindow.isDestroyed()) {
    donationWindow.setMovable(!isLocked);
    donationWindow.setResizable(!isLocked);
  }
});

// Broadcast events between windows (mainWindow <-> donationWindow)
ipcMain.on('broadcast-donation-event', (event, data) => {
  if (donationWindow && !donationWindow.isDestroyed() && event.sender !== donationWindow.webContents) {
    donationWindow.webContents.send('donation-event', data);
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('donation-event', data);
  }
});

ipcMain.on('broadcast-medser-event', (event, data) => {
  if (donationWindow && !donationWindow.isDestroyed() && event.sender !== donationWindow.webContents) {
    donationWindow.webContents.send('medser-event', data);
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('medser-event', data);
  }
});

ipcMain.on('broadcast-leaderboard-update', (event, data) => {
  if (donationWindow && !donationWindow.isDestroyed() && event.sender !== donationWindow.webContents) {
    donationWindow.webContents.send('leaderboard-update', data);
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('leaderboard-update', data);
  }
});

ipcMain.on('broadcast-donation-urls', (event, urls) => {
  if (donationWindow && !donationWindow.isDestroyed()) {
    donationWindow.webContents.send('sync-donation-urls', urls);
  }
});

ipcMain.handle('open-external-url', async (event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
  } catch (err) {
    console.warn('Failed to open external url:', err);
  }
  return { success: false };
});


// --- Native Free TikTok LIVE Engine (Electron CDP WebSocket Interceptor) ---
// 100% Free: Connects directly via hidden background session and decodes native Webcast Protobuf frames.
// No EulerStream, no API keys, and no paid plan required.
const activeTikTokConnections = new Map();
const seenTikTokMsgKeys = new Map();

function isDuplicateTikTokMsg(user, text) {
  if (!user || !text) return false;
  const key = `${String(user).trim()}:${String(text).trim()}`;
  const now = Date.now();
  if (seenTikTokMsgKeys.has(key)) {
    const prev = seenTikTokMsgKeys.get(key);
    if (now - prev < 8000) {
      return true; // Duplicate detected within 8 seconds
    }
  }
  seenTikTokMsgKeys.set(key, now);
  if (seenTikTokMsgKeys.size > 300) {
    for (const [k, t] of seenTikTokMsgKeys.entries()) {
      if (now - t > 12000) seenTikTokMsgKeys.delete(k);
    }
  }
  return false;
}

ipcMain.on('tiktok-connect', async (event, { streamId, username }) => {
  const cleanUsername = String(username).replace(/^@/, '').trim();
  console.log(`[TikTok Free Engine] Connecting to @${cleanUsername} (streamId: ${streamId})`);

  // Close previous connection with same streamId if exists
  if (activeTikTokConnections.has(streamId)) {
    try {
      const prev = activeTikTokConnections.get(streamId);
      if (prev.win && !prev.win.isDestroyed()) {
        prev.win.destroy();
      }
    } catch (e) {}
    activeTikTokConnections.delete(streamId);
  }

  let connectionStatusSent = false;
  let hasWsStreamTraffic = false;
  let bgWin = null;

  try {
    const { deserializeWebSocketMessage } = await import('tiktok-live-connector');

    bgWin = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    });

    bgWin.webContents.setAudioMuted(true);
    bgWin.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    activeTikTokConnections.set(streamId, { win: bgWin, username: cleanUsername });

    // Attach CDP debugger to intercept WebSocket frames directly from TikTok's native webcast
    try {
      bgWin.webContents.debugger.attach('1.3');
      bgWin.webContents.debugger.sendCommand('Network.enable');

      bgWin.webContents.debugger.on('message', async (debuggerEvent, method, params) => {
        if (method === 'Network.webSocketFrameReceived') {
          const payload = params.response?.payloadData;
          if (!payload) return;

          try {
            const buffer = Buffer.from(payload, 'base64');
            const decoded = await deserializeWebSocketMessage(buffer);
            const fetchResult = decoded?.protoMessageFetchResult;

            if (!connectionStatusSent) {
              connectionStatusSent = true;
              hasWsStreamTraffic = true;
              console.log(`[TikTok Free Engine] Connected & streaming live data for @${cleanUsername}`);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tiktok-status', {
                  streamId,
                  status: 'connected',
                  roomId: cleanUsername,
                  username: cleanUsername
                });
              }
            }

            if (fetchResult?.messages?.length) {
              hasWsStreamTraffic = true;
              for (const msg of fetchResult.messages) {
                const d = msg.decodedData;
                if (!d) continue;

                if (d.type === 'WebcastChatMessage' || d.type === 'WebcastEmoteChatMessage') {
                  const uname = d.data?.user?.nickname || d.data?.user?.uniqueId || d.data?.user?.displayId || 'Penonton';
                  let comment = d.data?.content || d.data?.comment || '';

                  // Parse TikTok Emotes / Stickers if present
                  const emoteObj = d.data?.emote || (d.data?.emotes && d.data?.emotes[0]);
                  if (emoteObj) {
                    const emoteUrl = emoteObj?.image?.urlList?.[0] || emoteObj?.image?.url || '';
                    const emoteName = emoteObj?.emoteId || emoteObj?.name || 'emote';
                    if (emoteUrl) {
                      const emoteTag = `[TTEMOJI:${encodeURIComponent(emoteUrl)}:${encodeURIComponent(emoteName)}]`;
                      comment = comment ? `${comment} ${emoteTag}` : emoteTag;
                    }
                  }

                  if (!comment && d.type === 'WebcastEmoteChatMessage') {
                    comment = '😊';
                  }

                  if (comment && mainWindow && !mainWindow.isDestroyed()) {
                    if (isDuplicateTikTokMsg(uname, comment)) continue;
                    console.log(`[TikTok Chat] ${uname}: ${comment}`);
                    mainWindow.webContents.send('tiktok-chat', {
                      streamId,
                      username: uname,
                      uniqueId: d.data?.user?.uniqueId || d.data?.user?.displayId || uname,
                      comment: comment,
                      userBadges: d.data?.user?.badges || []
                    });
                  }
                } else if (d.type === 'WebcastBarrageMessage') {
                  const uname = d.data?.user?.nickname || d.data?.user?.uniqueId || 'Penonton';
                  const comment = d.data?.content || d.data?.commonBarrageContent?.content || '';
                  if (comment && mainWindow && !mainWindow.isDestroyed()) {
                    if (isDuplicateTikTokMsg(uname, comment)) continue;
                    console.log(`[TikTok Barrage] ${uname}: ${comment}`);
                    mainWindow.webContents.send('tiktok-chat', {
                      streamId,
                      username: uname,
                      uniqueId: d.data?.user?.uniqueId || uname,
                      comment: comment,
                      userBadges: d.data?.user?.badges || []
                    });
                  }
                } else if (d.type === 'WebcastGiftMessage') {
                  const uname = d.data?.user?.nickname || d.data?.user?.uniqueId || d.data?.user?.displayId || 'Penonton';
                  const giftName = d.data?.giftDetails?.giftName || d.data?.common?.displayText?.defaultPattern || 'Gift';
                  const repeatCount = d.data?.repeatCount || 1;
                  const giftIcon = d.data?.giftDetails?.giftImage?.urlList?.[0] || d.data?.giftDetails?.icon?.urlList?.[0] || '';
                  console.log(`[TikTok Gift] ${uname} sent ${giftName} x${repeatCount}`);
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tiktok-gift', {
                      streamId,
                      username: uname,
                      uniqueId: d.data?.user?.uniqueId || d.data?.user?.displayId || uname,
                      giftName,
                      repeatCount,
                      giftIcon,
                      diamondCount: d.data?.diamondCount || 0
                    });
                  }
                } else if (d.type === 'WebcastControlMessage') {
                  if (d.data?.action === 3) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('tiktok-status', {
                        streamId,
                        status: 'streamEnd',
                        username: cleanUsername
                      });
                    }
                  }
                }
              }
            }
          } catch (e) {
            // frame not protobuf or keepalive
          }
        }
      });
    } catch (dbgErr) {
      console.warn('[TikTok] Debugger attach warning:', dbgErr.message);
    }

    bgWin.webContents.on('console-message', (ev, level, message) => {
      // If native Webcast WebSocket is actively delivering chat frames, skip DOM fallback to eliminate duplicates
      if (hasWsStreamTraffic) return;

      if (message.startsWith('__TT_DOM_CHAT__:')) {
        try {
          const parsed = JSON.parse(message.replace('__TT_DOM_CHAT__:', ''));
          if (parsed.comment && mainWindow && !mainWindow.isDestroyed()) {
            if (isDuplicateTikTokMsg(parsed.user, parsed.comment)) return;
            console.log(`[TikTok DOM Chat] ${parsed.user}: ${parsed.comment}`);
            mainWindow.webContents.send('tiktok-chat', {
              streamId,
              username: parsed.user,
              uniqueId: parsed.user,
              comment: parsed.comment,
              userBadges: []
            });
          }
        } catch (e) {}
      }
    });

    // Load TikTok live URL
    const targetUrl = `https://www.tiktok.com/@${cleanUsername}/live`;
    bgWin.loadURL(targetUrl);

    // Check offline status & inject DOM fallback scanner
    bgWin.webContents.on('did-finish-load', () => {
      // Inject background scanner for DOM chat messages as backup
      bgWin.webContents.executeJavaScript(`
        (() => {
          if (window._liveChatObserverInjected) return;
          window._liveChatObserverInjected = true;
          const seen = new Set();
          function scan() {
            const container = document.querySelector('[data-e2e="live-chat-container"]') || document.querySelector('[data-e2e="public-screen-live-chat-slot"]');
            if (!container) return;
            const nodes = container.querySelectorAll('[data-e2e="chat-message"]');
            for (const n of nodes) {
              const text = n.innerText ? n.innerText.trim() : '';
              if (!text || seen.has(text)) continue;
              seen.add(text);
              if (seen.size > 200) {
                const first = seen.values().next().value;
                seen.delete(first);
              }
              const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
              if (lines.length >= 2) {
                const user = lines[0];
                const comment = lines.slice(1).join(' ');
                console.log('__TT_DOM_CHAT__:' + JSON.stringify({ user, comment }));
              }
            }
          }
          setInterval(scan, 1500);
        })()
      `).catch(() => {});

      setTimeout(async () => {
        if (!connectionStatusSent && bgWin && !bgWin.isDestroyed()) {
          try {
            const pageInfo = await bgWin.webContents.executeJavaScript(`
              (() => {
                const title = document.title || '';
                const isOffline = document.body.innerText.includes('Recommended LIVE') || 
                                  document.body.innerText.includes('Turn creativity into rewards') ||
                                  document.body.innerText.includes('Grow followers in real time') ||
                                  !title.includes('is LIVE');
                return { title, isOffline };
              })()
            `);

            if (pageInfo.isOffline && !connectionStatusSent) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tiktok-status', {
                  streamId,
                  status: 'error',
                  error: `@${cleanUsername} saat ini belum LIVE atau siaran telah berakhir.`,
                  username: cleanUsername
                });
              }
            } else if (!connectionStatusSent) {
              connectionStatusSent = true;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tiktok-status', {
                  streamId,
                  status: 'connected',
                  roomId: cleanUsername,
                  username: cleanUsername
                });
              }
            }
          } catch (e) {}
        }
      }, 7000);
    });

  } catch (err) {
    console.error('[TikTok Free Engine] Error:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tiktok-status', {
        streamId,
        status: 'error',
        error: err.message || String(err),
        username: cleanUsername
      });
    }
  }
});

ipcMain.on('tiktok-disconnect', (event, { streamId }) => {
  if (activeTikTokConnections.has(streamId)) {
    try {
      const conn = activeTikTokConnections.get(streamId);
      if (conn.win && !conn.win.isDestroyed()) {
        conn.win.destroy();
      }
    } catch (e) {}
    activeTikTokConnections.delete(streamId);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
