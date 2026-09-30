const { app, BrowserWindow, Menu, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Fix Windows AppData cache permission conflict
const tempAppData = path.join(app.getPath('temp'), 'livechat-pro-app-data');
try {
  if (!fs.existsSync(tempAppData)) {
    fs.mkdirSync(tempAppData, { recursive: true });
  }
  app.setPath('userData', tempAppData);
  app.setPath('sessionData', tempAppData);
} catch (e) {
  console.warn("Custom app data path notice:", e);
}

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

  mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    minWidth: 240,
    minHeight: 140,
    title: "LiveChat Pro - Stream Overlay",
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
      webSecurity: false
    }
  });

  // Level 'screen-saver' guarantees it stays on top during ALT+TAB and across multiple monitors
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for window locking, always-on-top, and frameless window controls
ipcMain.on('set-always-on-top', (event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag, 'screen-saver');
  }
});

ipcMain.on('set-window-locked', (event, isLocked) => {
  if (mainWindow) {
    mainWindow.setMovable(!isLocked);
    mainWindow.setResizable(!isLocked);
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Auto-expand/collapse window width when side settings panel is toggled
let preSettingsWidth = 380;
ipcMain.on('toggle-settings-panel', (event, isOpen) => {
  if (!mainWindow) return;
  try {
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
      mainWindow.setSize(Math.max(260, preSettingsWidth), currentH);
    }
  } catch (err) {
    console.warn("Error resizing window for settings panel:", err);
  }
});

// --- Native Free TikTok LIVE Engine (Electron CDP WebSocket Interceptor) ---
// 100% Free: Connects directly via hidden background session and decodes native Webcast Protobuf frames.
// No EulerStream, no API keys, and no paid plan required.
const activeTikTokConnections = new Map();

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
              for (const msg of fetchResult.messages) {
                const d = msg.decodedData;
                if (!d) continue;

                if (d.type === 'WebcastChatMessage' || d.type === 'WebcastEmoteChatMessage') {
                  const uname = d.data?.user?.nickname || d.data?.user?.uniqueId || d.data?.user?.displayId || 'Penonton';
                  const comment = d.data?.content || d.data?.comment || (d.type === 'WebcastEmoteChatMessage' ? '😊' : '');
                  if (comment && mainWindow && !mainWindow.isDestroyed()) {
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
                  console.log(`[TikTok Gift] ${uname} sent ${giftName} x${repeatCount}`);
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tiktok-gift', {
                      streamId,
                      username: uname,
                      uniqueId: d.data?.user?.uniqueId || d.data?.user?.displayId || uname,
                      giftName,
                      repeatCount,
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
      if (message.startsWith('__TT_DOM_CHAT__:')) {
        try {
          const parsed = JSON.parse(message.replace('__TT_DOM_CHAT__:', ''));
          if (parsed.comment && mainWindow && !mainWindow.isDestroyed()) {
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
