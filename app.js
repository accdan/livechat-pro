/* ==========================================================================
   LiveChat Pro '95 - Main Application Logic
   ========================================================================== */

// --- Electron IPC Helper ---
let electronIpc = null;
try {
  if (typeof window !== 'undefined' && window.require) {
    electronIpc = window.require('electron').ipcRenderer;
  } else if (typeof require !== 'undefined') {
    electronIpc = require('electron').ipcRenderer;
  }
} catch (e) {
  console.warn("Electron IPC not available in this environment:", e);
}

// --- Anti-Tamper & DevTools Shortcut Interceptor ---
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const isDevToolsKey = e.key === 'F12' || 
      (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
      (e.ctrlKey && (e.key === 'u' || e.key === 'U'));
    if (isDevToolsKey) {
      e.preventDefault();
      e.stopPropagation();
      if (electronIpc) {
        electronIpc.send('tamper-detected');
      }
    }
  }, true);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  }, true);
}

// --- Application State ---
const state = {
  messages: [],
  pinnedMessages: [],
  activeStreams: [],
  settings: {
    sound: true,
    autoScroll: true,
    testMode: false,
    scanlines: false,
    contrast: false,
    compact: false,
    fontSize: 'normal',
    highlightUsers: true,
    isLocked: false,
    alwaysOnTop: true,
    clickThrough: true
  },
  appearance: {
    bgMode: 'transparent',
    bgColor: '#000000',
    bgOpacity: 0,
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    chatTextColor: '#ffffff',
    bubbleBgColor: '#0e121a',
    bubbleOpacity: 78,
    bubbleRadius: 12,
    bubblePadY: 5,
    bubblePadX: 11,
    bubbleGap: 5,
    bubbleBorder: true,
    bubbleBorderColor: '#ffffff',
    bubbleBorderWidth: 1,
    bubbleShadow: 'deep',
    showTimestamp: true,
    showBadges: true,
    boldUsername: true,
    animationType: 'slide-up'
  },
  filters: {
    yt: true,
    tw: true,
    tt: true,
    dc: true,
    searchQuery: ''
  },
  stats: {
    totalCount: 0,
    startTime: Date.now(),
    recentMsgTimestamps: []
  },
  windowState: {
    isMaximized: false,
    isDragging: false,
    dragOffset: { x: 0, y: 0 }
  },
  savedAccounts: {
    twitch: '',
    youtube: '',
    tiktok: '',
    discordToken: '',
    discordChannel: '',
    autoConnect: true
  },
  donations: {
    alertEnabled: true,
    medserEnabled: true,
    leaderboardEnabled: true,
    saweriaUrl: '',
    saweriaMedserUrl: '',
    takoUrl: '',
    takoMedserUrl: '',
    customUrl: ''
  },
  leaderboard: [],
  collabPartners: []
};

// --- Web Audio API Retro Sound Effects ---
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playRetroSound(type) {
  if (!state.settings.sound) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'chat') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'connect') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.08); // C#5
      osc.frequency.setValueAtTime(659, now + 0.16); // E5
      osc.frequency.setValueAtTime(880, now + 0.24); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'donation') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.09); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.18); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.27); // C6
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  } catch (e) {
    console.warn("Audio play error:", e);
  }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initDraggableWindow();
  initGlobalListeners();
  
  // Restore saved theme & lock state
  const savedTheme = localStorage.getItem('livechat_theme') || 'bg-transparent';
  setOverlayTheme(savedTheme, false);

  const savedLock = localStorage.getItem('livechat_locked') === 'true';
  if (savedLock) {
    toggleLockPosition(true);
  }

  // Restore saved auto-scroll preference
  try {
    const savedAutoScroll = localStorage.getItem('livechat_autoscroll');
    if (savedAutoScroll !== null) {
      state.settings.autoScroll = (savedAutoScroll === 'true');
    }
  } catch (e) {}
  const chkAutoScroll = document.getElementById('chkAutoScroll');
  if (chkAutoScroll) chkAutoScroll.checked = state.settings.autoScroll;

  // Restore saved click-through preference
  try {
    const savedClickThrough = localStorage.getItem('livechat_clickthrough');
    if (savedClickThrough !== null) {
      state.settings.clickThrough = (savedClickThrough === 'true');
    }
  } catch (e) {}
  const chkClickThrough = document.getElementById('chkClickThrough');
  if (chkClickThrough) chkClickThrough.checked = state.settings.clickThrough;

  // Restore saved appearance customizations
  loadSavedAppearance();

  // Load saved streamer accounts & auto-connect if configured
  loadSavedAccounts();
  autoConnectSavedAccountsOnStartup();

  // Start simulation feed if testMode is enabled
  if (state.settings.testMode) {
    startSimulationFeed();
  }

  // Setup TikTok Live IPC event listeners
  if (electronIpc) {
    electronIpc.on('tiktok-chat', (event, data) => {
      const stream = state.activeStreams.find(s => s.id === data.streamId || s.cleanUser === (data.username || data.uniqueId));
      addChatMessage({
        platform: 'tiktok',
        username: data.username || data.uniqueId,
        text: data.comment,
        collabPartner: stream ? stream.collabPartner : null
      });
    });

    electronIpc.on('tiktok-gift', (event, data) => {
      const stream = state.activeStreams.find(s => s.id === data.streamId || s.cleanUser === (data.username || data.uniqueId));
      const giftCount = data.repeatCount ? `x${data.repeatCount}` : '';
      addChatMessage({
        platform: 'tiktok',
        username: data.username || data.uniqueId,
        text: `🎁 Mengirim Gift ${data.giftName || 'Gift'} ${giftCount}! 🎉`,
        collabPartner: stream ? stream.collabPartner : null
      });

      // Trigger animated Donation Alert Popup
      showDonationAlert({
        platform: 'TIKTOK',
        donor: data.username || data.uniqueId,
        amount: `${data.giftName || 'Gift'} ${giftCount}`,
        message: data.diamondCount ? `${data.diamondCount} 💎 Diamonds` : 'Gift TikTok Live'
      });
    });

    electronIpc.on('tiktok-status', (event, data) => {
      const stream = state.activeStreams.find(s => s.id === data.streamId || s.cleanUser === data.username);
      if (data.status === 'connected') {
        if (stream) {
          stream.isStandby = false;
          stream.channelOrId = `@${data.username} (Live)`;
          updateConnectedStreamsUI();
        }
        addSystemMessage(`✅ [TikTok] Berhasil terhubung ke live chat @${data.username}! Menunggu penonton...`);
      } else if (data.status === 'error') {
        let errDesc = data.error || 'Gagal terhubung';
        if (stream) {
          stream.isStandby = true;
          stream.channelOrId = `@${data.username} (Standby)`;
          updateConnectedStreamsUI();
        }
        if (errDesc.includes('belum LIVE') || errDesc.includes('offline') || errDesc.includes('ended')) {
          addSystemMessage(`⏳ [TikTok] @${data.username} standby: otomatis terhubung saat live dimulai.`);
        } else {
          addSystemMessage(`⚠️ [TikTok] Status @${data.username}: ${errDesc}`);
        }
      } else if (data.status === 'disconnected') {
        if (stream) {
          stream.isStandby = true;
          stream.channelOrId = `@${data.username} (Standby)`;
          updateConnectedStreamsUI();
        }
        addSystemMessage(`ℹ️ [TikTok] Koneksi live chat @${data.username} standby.`);
      } else if (data.status === 'streamEnd') {
        if (stream) {
          stream.isStandby = true;
          stream.channelOrId = `@${data.username} (Standby)`;
          updateConnectedStreamsUI();
        }
        addSystemMessage(`🔴 [TikTok] Siaran @${data.username} berakhir / standby.`);
      }
    });

    // Sync from standalone Live Donation Window
    electronIpc.on('leaderboard-update', (event, lb) => {
      if (Array.isArray(lb)) {
        state.leaderboard = lb;
        renderLeaderboard();
        renderFdwLeaderboard();
      }
    });

    electronIpc.on('donation-event', (event, data) => {
      showDonationAlert(data);
    });

    electronIpc.on('medser-event', (event, data) => {
      showMedserAlert(data);
    });
  }

  updateStatsDisplay();
  setInterval(updateMsgRate, 1000);
});

// --- Clock & Timers ---
function initClock() {
  function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;
    
    const wClock = document.getElementById('win95Clock');
    if (wClock) wClock.textContent = timeStr;
    const tClock = document.getElementById('taskbarClock');
    if (tClock) tClock.textContent = timeStr;
  }
  updateTime();
  setInterval(updateTime, 10000);
}

// --- Window Dragging & Interactivity ---
function initDraggableWindow() {
  const windowEl = document.getElementById('mainWindow');
  const titlebarEl = document.getElementById('windowTitlebar') || document.getElementById('topBar');
  if (!windowEl || !titlebarEl) return;

  titlebarEl.addEventListener('mousedown', (e) => {
    if (state.settings.isLocked) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    if (state.windowState.isMaximized) return;

    state.windowState.isDragging = true;
    state.windowState.dragOffset.x = e.clientX - windowEl.offsetLeft;
    state.windowState.dragOffset.y = e.clientY - windowEl.offsetTop;
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!state.windowState.isDragging) return;
    windowEl.style.left = `${Math.max(0, e.clientX - state.windowState.dragOffset.x)}px`;
    windowEl.style.top = `${Math.max(0, e.clientY - state.windowState.dragOffset.y)}px`;
  }

  function onMouseUp() {
    state.windowState.isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}

let isUserScrolledUp = false;
let isResizingSettings = false;

function initGlobalListeners() {
  // Chat feed scroll detection for "New Messages" float button
  const chatFeed = document.getElementById('chatFeed');
  if (chatFeed) {
    chatFeed.addEventListener('scroll', () => {
      if (isResizingSettings) return; // Prevent window resize / settings panel expansion from breaking auto-scroll
      const distanceToBottom = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight;
      const isAtBottom = distanceToBottom < 45;
      const btnScroll = document.getElementById('btnScrollBottom');
      if (isAtBottom) {
        isUserScrolledUp = false;
        if (btnScroll) btnScroll.classList.add('hidden');
      } else {
        isUserScrolledUp = true;
        if (btnScroll) btnScroll.classList.remove('hidden');
      }
    }, { passive: true });
  }

  // Keep chat pinned to bottom on window resize if user was not scrolled up
  window.addEventListener('resize', () => {
    if (state.settings.autoScroll && !isUserScrolledUp) {
      scrollToBottom(true);
    }
  });

  // Close modal with ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
    }
  });

  // Dynamic Click-Through Overlay for Transparent Areas
  window.addEventListener('mousemove', handleOverlayMouseMove);
  window.addEventListener('mouseover', handleOverlayMouseMove);
  window.addEventListener('mouseleave', () => {
    if (!electronIpc || state.settings.clickThrough === false) return;
    currentIgnoreMouseState = true;
    electronIpc.send('set-ignore-mouse-events', true, { forward: true });
  });

  // Initial click-through activation for transparent overlay background
  if (electronIpc && state.settings.clickThrough !== false) {
    currentIgnoreMouseState = true;
    electronIpc.send('set-ignore-mouse-events', true, { forward: true });
  }
}

let currentIgnoreMouseState = null;

function handleOverlayMouseMove(e) {
  if (!electronIpc) return;
  if (state.settings.clickThrough === false) {
    if (currentIgnoreMouseState !== false) {
      currentIgnoreMouseState = false;
      electronIpc.send('set-ignore-mouse-events', false);
    }
    return;
  }

  // Check if target or any ancestor is an interactive UI element or chat bubble
  const interactiveTarget = e.target && e.target.closest(
    '.chat-item, .overlay-bar, .pinned-drawer, .leaderboard-drawer, .settings-side-panel, .scroll-bottom-btn, .modal-backdrop, .settings-info-overlay, .info-modal-card, .login-modal-box, .compact-acc-row, button, input, select, textarea, a, [role="button"]'
  );

  const shouldIgnore = !interactiveTarget;

  if (currentIgnoreMouseState !== shouldIgnore) {
    currentIgnoreMouseState = shouldIgnore;
    if (shouldIgnore) {
      electronIpc.send('set-ignore-mouse-events', true, { forward: true });
    } else {
      electronIpc.send('set-ignore-mouse-events', false);
    }
  }
}

// --- Menu Bar Helpers ---
function toggleMenu(menuId) {
  playRetroSound('click');
  const targetMenu = document.getElementById(menuId);
  const isHidden = targetMenu.classList.contains('hidden');
  closeAllMenus();
  if (isHidden) {
    targetMenu.classList.remove('hidden');
  }
}

function closeAllMenus() {
  document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden'));
}

function toggleStartMenu() {
  playRetroSound('click');
  const menu = document.getElementById('startMenu');
  menu.classList.toggle('hidden');
}

// --- URL Stream Parsing & Connection Engine ---
function parseStreamUrl(url) {
  url = url.trim();
  if (!url) return null;

  // Twitch matching: twitch.tv/channelname or channelname
  const twitchRegex = /(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]{3,25})/i;
  const twitchMatch = url.match(twitchRegex);
  if (twitchMatch) {
    return { platform: 'twitch', channelOrId: twitchMatch[1].toLowerCase(), originalUrl: url };
  }

  // YouTube matching: watch?v=ID, live_chat?v=ID, live/ID, youtu.be/ID
  const ytRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?v=|live_chat\?(?:.*&)?v=|live\/|embed\/)|youtu\.be\/([a-zA-Z0-9_-]{11})/i;
  const ytMatch = url.match(ytRegex);
  if (ytMatch) {
    // Extract 11-char video ID
    const vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/\/live\/([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const videoId = vMatch ? vMatch[1] : ytMatch[1];
    return { platform: 'youtube', channelOrId: videoId, originalUrl: url };
  }

  // Discord matching: discord.com/channels/.../CHANNEL_ID
  const dcRegex = /(?:https?:\/\/)?(?:www\.)?discord\.com\/channels\/[0-9]+\/([0-9]{15,22})/i;
  const dcMatch = url.match(dcRegex);
  if (dcMatch) {
    return { platform: 'discord', channelOrId: dcMatch[1], originalUrl: url };
  }

  // Fallback: If user just types Twitch username or YT ID or Discord Channel ID (17-20 digits)
  if (!url.includes('.')) {
    if (/^[0-9]{16,21}$/.test(url)) {
      return { platform: 'discord', channelOrId: url, originalUrl: url };
    }
    if (url.length === 11) {
      return { platform: 'youtube', channelOrId: url, originalUrl: `https://www.youtube.com/watch?v=${url}` };
    }
    return { platform: 'twitch', channelOrId: url.toLowerCase(), originalUrl: `https://twitch.tv/${url}` };
  }

  return null;
}

function connectFromInput() {
  const inputEl = document.getElementById('streamUrlInput');
  const selectedPlatform = document.getElementById('platformSelect').value;
  connectStreamUrl(inputEl.value, selectedPlatform);
  inputEl.value = '';
}

function connectFromModal() {
  const inputEl = document.getElementById('modalUrlInput');
  connectStreamUrl(inputEl.value, 'auto');
  inputEl.value = '';
  closeModal('connectModal');
}

function quickAddStream(platform) {
  let promptText = platform === 'youtube' 
    ? 'Enter YouTube Live Stream URL or Video ID:' 
    : (platform === 'discord' ? 'Masukkan Discord Channel ID:' : 'Enter Twitch Channel URL or Username:');
  const url = prompt(promptText);
  if (url) {
    connectStreamUrl(url, platform);
  }
}

function connectStreamUrl(rawUrl, forcePlatform = 'auto', collabPartner = null) {
  const parsed = parseStreamUrl(rawUrl);
  if (!parsed && forcePlatform === 'auto') {
    playRetroSound('error');
    alert('❌ Invalid Stream URL!\nMasukkan URL/ID YouTube, Twitch, TikTok, atau Discord Channel.');
    return;
  }

  const platform = (forcePlatform !== 'auto') ? forcePlatform : (parsed ? parsed.platform : 'youtube');
  const channelOrId = parsed ? parsed.channelOrId : rawUrl.trim();

  // Prevent duplicate connections for identical channel/ID and role
  if (state.activeStreams.some(s => s.platform === platform && s.channelOrId === channelOrId && s.collabPartner === collabPartner)) {
    alert(`Stream [${platform.toUpperCase()}] ${channelOrId} sudah terhubung!`);
    return;
  }

  playRetroSound('connect');

  if (platform === 'twitch') {
    connectTwitchIrc(channelOrId, rawUrl, collabPartner);
  } else if (platform === 'youtube') {
    connectYouTubeStream(channelOrId, rawUrl, collabPartner);
  } else if (platform === 'tiktok') {
    connectTikTokStream(channelOrId, false, collabPartner);
  } else if (platform === 'discord') {
    if (state.savedAccounts.discordToken) {
      connectDiscordGateway(state.savedAccounts.discordToken, channelOrId, false, collabPartner);
    } else {
      openLoginModal('discord');
      const chanInput = document.getElementById('loginModalChannelInput');
      if (chanInput) chanInput.value = channelOrId;
      addSystemMessage('🔑 Masukkan Discord Bot Token Anda untuk menghubungkan channel ini.');
    }
  }

  updateConnectedStreamsUI();
}

// --- Twitch IRC WebSocket Integration ---
function connectTwitchIrc(channelName, originalUrl, collabPartner = null) {
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  const streamObj = {
    id: `tw-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platform: 'twitch',
    channelOrId: channelName,
    url: originalUrl || `https://twitch.tv/${channelName}`,
    ws: ws,
    collabPartner: collabPartner || null
  };

  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    // Anonymous Twitch Chat login credentials
    const anonNick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;
    ws.send(`PASS oauth:schmoopiie`);
    ws.send(`NICK ${anonNick}`);
    ws.send(`JOIN #${channelName}`);

    state.activeStreams.push(streamObj);
    updateConnectedStreamsUI();
    const collabTag = collabPartner ? ` [🤝 Collab: ${collabPartner}]` : '';
    addSystemMessage(`Connected to Twitch IRC: #${channelName}${collabTag}`);
  };

  ws.onmessage = (event) => {
    const rawData = event.data;
    // Handle IRC PING to maintain connection alive
    if (rawData.startsWith('PING')) {
      ws.send('PONG :tmi.twitch.tv');
      return;
    }

    // Parse IRC PRIVMSG chat lines
    const lines = rawData.split('\r\n');
    lines.forEach(line => {
      if (line.includes('PRIVMSG')) {
        parseTwitchIrcLine(line, channelName, streamObj);
      }
    });
  };

  ws.onerror = (err) => {
    console.error('Twitch WS error:', err);
  };

  ws.onclose = () => {
    state.activeStreams = state.activeStreams.filter(s => s.id !== streamObj.id);
    updateConnectedStreamsUI();
    addSystemMessage(`Disconnected from Twitch: #${channelName}`);
  };
}

function parseTwitchIrcLine(line, channelName, streamObj = null) {
  try {
    // Format: @badge-info=... :username!username@username.tmi.twitch.tv PRIVMSG #channel :Message text
    let tags = {};
    let messageText = '';
    let username = 'TwitchUser';

    if (line.startsWith('@')) {
      const spaceIdx = line.indexOf(' ');
      const rawTags = line.substring(1, spaceIdx);
      rawTags.split(';').forEach(tag => {
        const [k, v] = tag.split('=');
        tags[k] = v;
      });
      line = line.substring(spaceIdx + 1);
    }

    if (tags['display-name']) {
      username = tags['display-name'];
    } else {
      const nickMatch = line.match(/^:([^!]+)!/);
      if (nickMatch) username = nickMatch[1];
    }

    const privmsgIdx = line.indexOf(`PRIVMSG #${channelName} :`);
    if (privmsgIdx !== -1) {
      messageText = line.substring(privmsgIdx + `PRIVMSG #${channelName} :`.length);
    }

    if (messageText) {
      addChatMessage({
        platform: 'twitch',
        username: username,
        text: messageText,
        userColor: tags['color'] || '#532d8c',
        twitchEmotes: tags['emotes'] || '',
        collabPartner: streamObj ? streamObj.collabPartner : null
      });
    }
  } catch (e) {
    console.error('Error parsing Twitch line:', e);
  }
}

// --- YouTube Live Stream Handler (Real-Time InnerTube API Fetcher) ---
function connectYouTubeStream(videoId, originalUrl, collabPartner = null) {
  const streamObj = {
    id: `yt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platform: 'youtube',
    channelOrId: videoId,
    url: `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`,
    ws: null,
    pollInterval: null,
    collabPartner: collabPartner || null
  };

  state.activeStreams.push(streamObj);
  updateConnectedStreamsUI();
  const collabTag = collabPartner ? ` [🤝 Collab: ${collabPartner}]` : '';
  addSystemMessage(`Connected YouTube Live Chat stream: www.youtube.com/live_chat?is_popout=1&v=${videoId}${collabTag}`);

  startYouTubeRealtimeFetcher(videoId, streamObj);
}

async function startYouTubeRealtimeFetcher(videoId, streamObj) {
  let continuationToken = null;
  let apiKey = null;

  async function fetchInitialPage() {
    try {
      const url = `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`;
      const res = await fetch(url);
      const html = await res.text();

      // Extract API Key
      const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      if (keyMatch) apiKey = keyMatch[1];

      // Extract ytInitialData JSON
      const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s) || 
                        html.match(/window\["ytInitialData"\] = ({.*?});<\/script>/s);
      if (dataMatch) {
        const initialData = JSON.parse(dataMatch[1]);
        parseYouTubeChatData(initialData);
        continuationToken = extractContinuationToken(initialData);
      }
    } catch (e) {
      console.warn("YouTube initial page fetch notice:", e);
    }
  }

  async function pollContinuation() {
    if (!continuationToken || !apiKey) return;
    try {
      const url = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.00.00'
            }
          },
          continuation: continuationToken
        })
      });
      const data = await res.json();
      parseYouTubeChatData(data);
      continuationToken = extractContinuationToken(data) || continuationToken;
    } catch (e) {
      console.warn("YouTube continuation polling notice:", e);
    }
  }

  function parseYouTubeChatData(data) {
    let actions = [];
    if (data.continuationContents && data.continuationContents.liveChatContinuation) {
      actions = data.continuationContents.liveChatContinuation.actions || [];
    } else if (data.contents && data.contents.liveChatRenderer) {
      actions = data.contents.liveChatRenderer.actions || [];
    }

    actions.forEach(act => {
      const item = act.addChatItemAction ? act.addChatItemAction.item : null;
      if (!item) return;

      // 1. Standard text message
      const renderer = item.liveChatTextMessageRenderer;
      if (renderer) {
        const username = renderer.authorName ? (renderer.authorName.simpleText || 'YouTube User') : 'YouTube User';
        let text = '';
        if (renderer.message && renderer.message.runs) {
          text = renderer.message.runs.map(r => {
            if (r.text) return r.text;
            if (r.emoji) {
              const imgUrl = (r.emoji.image && r.emoji.image.thumbnails && r.emoji.image.thumbnails[0]) 
                ? r.emoji.image.thumbnails[0].url : '';
              const alt = (r.emoji.shortcuts && r.emoji.shortcuts[0]) || r.emoji.emojiId || 'emoji';
              if (imgUrl) {
                return `[YTEMOJI:${encodeURIComponent(imgUrl)}:${encodeURIComponent(alt)}]`;
              }
              return alt;
            }
            return '';
          }).join('');
        }

        if (text) {
          addChatMessage({
            platform: 'youtube',
            username: username,
            text: text,
            collabPartner: streamObj.collabPartner
          });
        }
      }

      // 2. Super Chat (Paid message)
      const paidMsg = item.liveChatPaidMessageRenderer;
      if (paidMsg) {
        const username = paidMsg.authorName ? (paidMsg.authorName.simpleText || 'Donatur') : 'Donatur';
        const amount = paidMsg.purchaseAmountText ? paidMsg.purchaseAmountText.simpleText : 'Super Chat';
        let text = '';
        if (paidMsg.message && paidMsg.message.runs) {
          text = paidMsg.message.runs.map(r => r.text || '').join('');
        }
        addChatMessage({
          platform: 'youtube',
          username: username,
          text: `💸 [SUPER CHAT ${amount}] ${text}`,
          collabPartner: streamObj.collabPartner
        });
        showDonationAlert({
          platform: 'YOUTUBE',
          donor: username,
          amount: amount,
          message: text || 'Super Chat'
        });
      }

      // 3. Super Sticker (Paid sticker)
      const paidSticker = item.liveChatPaidStickerRenderer;
      if (paidSticker) {
        const username = paidSticker.authorName ? (paidSticker.authorName.simpleText || 'Donatur') : 'Donatur';
        const amount = paidSticker.purchaseAmountText ? paidSticker.purchaseAmountText.simpleText : 'Super Sticker';
        const stickerUrl = (paidSticker.sticker && paidSticker.sticker.thumbnails && paidSticker.sticker.thumbnails[0])
          ? paidSticker.sticker.thumbnails[0].url : '';
        const stickerAlt = (paidSticker.sticker && paidSticker.sticker.accessibility && paidSticker.sticker.accessibility.accessibilityData)
          ? paidSticker.sticker.accessibility.accessibilityData.label : 'Sticker';
        const stickerTag = stickerUrl ? `[STICKER:${encodeURIComponent(stickerUrl)}:${encodeURIComponent(stickerAlt)}]` : '⭐';
        
        addChatMessage({
          platform: 'youtube',
          username: username,
          text: `🌟 [SUPER STICKER ${amount}] ${stickerTag}`,
          collabPartner: streamObj.collabPartner
        });
        showDonationAlert({
          platform: 'YOUTUBE',
          donor: username,
          amount: amount,
          message: 'Mengirim Super Sticker!'
        });
      }

      // 4. Membership greeting / badge
      const memberItem = item.liveChatMembershipItemRenderer;
      if (memberItem) {
        const username = memberItem.authorName ? (memberItem.authorName.simpleText || 'Member') : 'Member';
        const subtext = memberItem.headerSubtext ? (memberItem.headerSubtext.runs ? memberItem.headerSubtext.runs.map(r => r.text).join('') : '') : 'Baru bergabung membership!';
        addChatMessage({
          platform: 'youtube',
          username: username,
          text: `🎖️ [MEMBERSHIP] ${subtext}`,
          collabPartner: streamObj.collabPartner
        });
      }
    });
  }

  function extractContinuationToken(data) {
    let continuations = [];
    if (data.continuationContents && data.continuationContents.liveChatContinuation) {
      continuations = data.continuationContents.liveChatContinuation.continuations || [];
    } else if (data.contents && data.contents.liveChatRenderer) {
      continuations = data.contents.liveChatRenderer.continuations || [];
    }

    for (const c of continuations) {
      const token = (c.invalidationContinuationData && c.invalidationContinuationData.continuation) ||
                    (c.timedContinuationData && c.timedContinuationData.continuation) ||
                    (c.liveChatReplayContinuationData && c.liveChatReplayContinuationData.continuation);
      if (token) return token;
    }
    return null;
  }

  // First fetch
  await fetchInitialPage();

  // Poll loop every 2 seconds for fresh chat messages
  const interval = setInterval(async () => {
    if (!state.activeStreams.some(s => s.id === streamObj.id)) {
      clearInterval(interval);
      return;
    }
    if (continuationToken && apiKey) {
      await pollContinuation();
    } else {
      await fetchInitialPage();
    }
  }, 2000);

  streamObj.pollInterval = interval;
}

function disconnectStream(id) {
  playRetroSound('click');
  const stream = state.activeStreams.find(s => s.id === id);
  if (stream) {
    if (stream.ws) stream.ws.close();
    if (stream.pollInterval) clearInterval(stream.pollInterval);
    if (stream.standbyCheckInterval) clearInterval(stream.standbyCheckInterval);
    if (stream.heartbeatInterval) clearInterval(stream.heartbeatInterval);
    if (stream.platform === 'tiktok' && electronIpc) {
      electronIpc.send('tiktok-disconnect', { streamId: stream.id });
    }
    state.activeStreams = state.activeStreams.filter(s => s.id !== id);
    updateConnectedStreamsUI();
    addSystemMessage(`Disconnected stream [${stream.platform.toUpperCase()}] ${stream.channelOrId}`);
  }
}

function disconnectAllStreams() {
  playRetroSound('click');
  state.activeStreams.forEach(s => {
    if (s.ws) s.ws.close();
    if (s.pollInterval) clearInterval(s.pollInterval);
    if (s.standbyCheckInterval) clearInterval(s.standbyCheckInterval);
    if (s.heartbeatInterval) clearInterval(s.heartbeatInterval);
    if (s.platform === 'tiktok' && electronIpc) {
      electronIpc.send('tiktok-disconnect', { streamId: s.id });
    }
  });
  state.activeStreams = [];
  updateConnectedStreamsUI();
  addSystemMessage(`Disconnected all active stream links.`);
}

function updateConnectedStreamsUI() {
  const container = document.getElementById('connectedStreamsContainer');
  const barStreamBadge = document.getElementById('barStreamBadge');
  const statusMessage = document.getElementById('statusMessage');

  if (state.activeStreams.length === 0) {
    if (container) {
      container.innerHTML = `<span class="no-streams-notice">Tidak ada stream aktif. Hubungkan live chat melalui tab Stream di panel pengaturan.</span>`;
    }
    if (statusMessage) {
      statusMessage.innerHTML = `<span class="status-indicator online"></span> Siap menerima koneksi stream live.`;
    }
    if (barStreamBadge) {
      barStreamBadge.textContent = state.settings.testMode ? 'Test Feed' : '0 streams';
    }
    return;
  }

  if (container) {
    container.innerHTML = state.activeStreams.map(s => {
      const pClass = s.platform === 'youtube' ? 'yt' : (s.platform === 'tiktok' ? 'tt' : (s.platform === 'discord' ? 'dc' : 'tw'));
      const pLabel = s.platform === 'youtube' ? 'YT' : (s.platform === 'tiktok' ? 'TT' : (s.platform === 'discord' ? 'DC' : 'TW'));
      return `
        <div class="stream-chip ${pClass}">
          <span class="chip-status-dot"></span>
          <strong>[${pLabel}]</strong> ${s.channelOrId}
          <span class="chip-remove-btn" onclick="disconnectStream('${s.id}')" title="Putuskan stream">✕</span>
        </div>
      `;
    }).join('');
  }

  if (statusMessage) {
    statusMessage.innerHTML = `<span class="status-indicator online"></span> Terhubung: ${state.activeStreams.length} stream aktif.`;
  }
  if (barStreamBadge) {
    barStreamBadge.textContent = `${state.activeStreams.length} stream${state.activeStreams.length > 1 ? 's' : ''}`;
  }

  // Update Platform Cards Status Pills
  const twPill = document.getElementById('twitchStatusPill');
  const ytPill = document.getElementById('ytStatusPill');
  const ttPill = document.getElementById('tiktokStatusPill');

  const twStream = state.activeStreams.find(s => s.platform === 'twitch');
  const ytStream = state.activeStreams.find(s => s.platform === 'youtube');
  const ttStream = state.activeStreams.find(s => s.platform === 'tiktok');

  if (twPill) {
    if (twStream) {
      twPill.textContent = `● Terhubung: ${twStream.channelOrId}`;
      twPill.className = 'platform-status-pill connected';
    } else {
      twPill.textContent = 'Siap Connect';
      twPill.className = 'platform-status-pill';
    }
  }

  if (ytPill) {
    if (ytStream) {
      ytPill.textContent = `● Terhubung: ${ytStream.channelOrId}`;
      ytPill.className = 'platform-status-pill connected';
    } else {
      ytPill.textContent = 'Siap Connect';
      ytPill.className = 'platform-status-pill';
    }
  }

  if (ttPill) {
    if (ttStream) {
      ttPill.textContent = `● Terhubung: ${ttStream.channelOrId}`;
      ttPill.className = 'platform-status-pill connected';
    } else {
      ttPill.textContent = 'Siap Connect';
      ttPill.className = 'platform-status-pill';
    }
  }

  // Update Discord Status Pill
  const dcPill = document.getElementById('dcStatusPill') || document.getElementById('discordStatusPill');
  const dcStream = state.activeStreams.find(s => s.platform === 'discord');
  if (dcPill) {
    if (dcStream) {
      dcPill.textContent = `● Terhubung: ${dcStream.channelOrId}`;
      dcPill.className = 'platform-status-pill connected';
    } else {
      dcPill.textContent = 'Siap Connect';
      dcPill.className = 'platform-status-pill';
    }
  }

  // Synchronize Collab stream counters & lists
  renderCollabUI();
}

// --- Multi-Platform Chat Aggregator Engine ---
const clientRecentMsgs = new Map();

function isClientDuplicate(platform, user, text) {
  if (!user || !text) return false;
  const key = `${platform}:${String(user).trim()}:${String(text).trim()}`;
  const now = Date.now();
  if (clientRecentMsgs.has(key)) {
    const prev = clientRecentMsgs.get(key);
    if (now - prev < 6000) return true;
  }
  clientRecentMsgs.set(key, now);
  if (clientRecentMsgs.size > 200) {
    for (const [k, t] of clientRecentMsgs.entries()) {
      if (now - t > 10000) clientRecentMsgs.delete(k);
    }
  }
  return false;
}

function addChatMessage({ platform, username, text, userColor, twitchEmotes, collabPartner }) {
  if (isClientDuplicate(platform, username, text)) return;

  const msgObj = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platform: platform, // 'youtube', 'twitch', 'tiktok', or 'discord'
    username: username,
    text: text,
    timestamp: getFormattedTime(),
    isPinned: false,
    userColor: userColor,
    twitchEmotes: twitchEmotes || '',
    collabPartner: collabPartner || null
  };

  state.messages.push(msgObj);
  state.stats.totalCount++;
  state.stats.recentMsgTimestamps.push(Date.now());

  // Cap total in-memory message history to 500 for performance
  if (state.messages.length > 500) {
    state.messages.shift();
  }

  renderSingleChatMessage(msgObj);
  playRetroSound('chat');
  updateStatsDisplay();

  if (state.settings.autoScroll) {
    scrollToBottom();
  }
}

function addSystemMessage(text) {
  const chatFeed = document.getElementById('chatFeed');
  if (!chatFeed) return;
  const div = document.createElement('div');
  div.className = 'chat-item system-msg';
  div.style.fontStyle = 'italic';
  div.style.color = '#008080';
  div.innerHTML = `<span class="chat-timestamp">[${getFormattedTime()}]</span> ⚙️ <strong>System:</strong> ${escapeHtml(text)}`;
  chatFeed.appendChild(div);
  if (state.settings.autoScroll) scrollToBottom();
}

// --- High-Definition Emoji & Emotes Processing Engine ---
const TWITCH_GLOBAL_EMOTES = {
  'Kappa': 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0',
  'PogChamp': 'https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/1.0',
  'LUL': 'https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/1.0',
  'BibleThump': 'https://static-cdn.jtvnw.net/emoticons/v2/86/default/dark/1.0',
  'Kreygasm': 'https://static-cdn.jtvnw.net/emoticons/v2/41/default/dark/1.0',
  'ResidentSleeper': 'https://static-cdn.jtvnw.net/emoticons/v2/245/default/dark/1.0',
  'WutFace': 'https://static-cdn.jtvnw.net/emoticons/v2/28087/default/dark/1.0',
  'DansGame': 'https://static-cdn.jtvnw.net/emoticons/v2/33/default/dark/1.0',
  'CoolCat': 'https://static-cdn.jtvnw.net/emoticons/v2/58127/default/dark/1.0',
  'HeyGuys': 'https://static-cdn.jtvnw.net/emoticons/v2/30259/default/dark/1.0',
  'PopCorn': 'https://static-cdn.jtvnw.net/emoticons/v2/11/default/dark/1.0',
  'monkaS': 'https://cdn.betterttv.net/emote/56e9f494fff3cc5c35e5287e/1x',
  'catJAM': 'https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/1x',
  'KEKW': 'https://cdn.betterttv.net/emote/5e9c27987e090362f8b0b9e8/1x',
  'PepeHands': 'https://cdn.betterttv.net/emote/59f27b3f49e64f09f29d2d18/1x',
  'AYAYA': 'https://cdn.betterttv.net/emote/58493d92b545815087724860/1x',
  'OMEGALUL': 'https://cdn.betterttv.net/emote/583089f4737a8e61abb01fb2/1x',
  'widepeepoHappy': 'https://cdn.betterttv.net/emote/5c0b0d38a765242313894ccd/1x',
  'Pepega': 'https://cdn.betterttv.net/emote/5aca62163e290877d25b3edd/1x'
};

const EMOJI_SHORTCODES = {
  ':fire:': '🔥',
  ':heart:': '❤️',
  ':joy:': '😂',
  ':rofl:': '🤣',
  ':clap:': '👏',
  ':rocket:': '🚀',
  ':100:': '💯',
  ':thumbsup:': '👍',
  ':sob:': '😭',
  ':thinking:': '🤔',
  ':sunglasses:': '😎',
  ':pray:': '🙏',
  ':eyes:': '👀',
  ':party:': '🎉',
  ':rose:': '🌹',
  ':crown:': '👑',
  ':star:': '⭐',
  ':skull:': '💀',
  ':smile:': '😊',
  ':laugh:': '😆',
  ':wink:': '😉',
  ':cool:': '😎',
  ':love:': '😍',
  ':kiss:': '😘',
  ':gamer:': '🎮',
  ':gaming:': '🎮',
  ':gift:': '🎁',
  ':coffee:': '☕',
  ':gg:': '🏆',
  ':pog:': '😲',
  ':cake:': '🎂',
  ':cat:': '🐱',
  ':dog:': '🐶'
};

function emojiToCodePoints(unicodeStr) {
  const codePoints = [];
  for (const char of unicodeStr) {
    const cp = char.codePointAt(0);
    if (cp && cp !== 0xFE0F && cp !== 0xFE0E) {
      codePoints.push(cp.toString(16));
    }
  }
  return codePoints.join('-');
}

function formatChatMessageWithEmojis(rawText, msgObj = {}) {
  if (!rawText) return '';

  let text = String(rawText);

  // 1. Map Twitch IRC parsed emotes if available
  const twitchEmoteWords = {};
  if (msgObj && msgObj.twitchEmotes && typeof msgObj.twitchEmotes === 'string') {
    msgObj.twitchEmotes.split('/').forEach(part => {
      const [id, ranges] = part.split(':');
      if (id && ranges) {
        ranges.split(',').forEach(range => {
          const [start, end] = range.split('-').map(Number);
          if (!isNaN(start) && !isNaN(end)) {
            const word = rawText.substring(start, end + 1);
            if (word) {
              twitchEmoteWords[word] = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
            }
          }
        });
      }
    });
  }

  // 2. Process text chunks to escape HTML and apply emojis (YouTube, TikTok, and Stickers)
  const parts = text.split(/(\[YTEMOJI:[^:]+:[^\]]+\]|\[TTEMOJI:[^:]+:[^\]]+\]|\[STICKER:[^:]+:[^\]]+\])/g);
  return parts.map(part => {
    // YouTube Custom Channel Emotes
    if (part.startsWith('[YTEMOJI:')) {
      const match = part.match(/\[YTEMOJI:([^:]+):([^\]]+)\]/);
      if (match) {
        try {
          const imgUrl = decodeURIComponent(match[1]);
          const altText = decodeURIComponent(match[2]);
          return `<img class="chat-emoji yt-emoji" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(altText)}" title="${escapeHtml(altText)}" loading="lazy">`;
        } catch (e) {
          return '';
        }
      }
    }

    // TikTok Emotes
    if (part.startsWith('[TTEMOJI:')) {
      const match = part.match(/\[TTEMOJI:([^:]+):([^\]]+)\]/);
      if (match) {
        try {
          const imgUrl = decodeURIComponent(match[1]);
          const altText = decodeURIComponent(match[2]);
          return `<img class="chat-emoji tt-emoji" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(altText)}" title="${escapeHtml(altText)}" loading="lazy">`;
        } catch (e) {
          return '';
        }
      }
    }

    // Super Stickers (YouTube)
    if (part.startsWith('[STICKER:')) {
      const match = part.match(/\[STICKER:([^:]+):([^\]]+)\]/);
      if (match) {
        try {
          const imgUrl = decodeURIComponent(match[1]);
          const altText = decodeURIComponent(match[2]);
          return `<div class="chat-sticker-wrap"><img class="chat-sticker" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(altText)}" title="${escapeHtml(altText)}" loading="lazy"></div>`;
        } catch (e) {
          return '';
        }
      }
    }

    // Standard text chunk
    let escaped = escapeHtml(part);

    // Replace text shortcodes (:fire:, :heart:, etc.)
    for (const [code, emoji] of Object.entries(EMOJI_SHORTCODES)) {
      if (escaped.includes(code)) {
        escaped = escaped.split(code).join(emoji);
      }
    }

    // Replace Twitch IRC emotes and Global Twitch / BTTV emotes
    const words = escaped.split(/(\s+)/);
    escaped = words.map(w => {
      const trimmed = w.trim();
      if (!trimmed) return w;
      if (twitchEmoteWords[trimmed]) {
        return `<img class="chat-emoji twitch-emote" src="${twitchEmoteWords[trimmed]}" alt="${trimmed}" title="${trimmed}" loading="lazy">`;
      }
      if (TWITCH_GLOBAL_EMOTES[trimmed]) {
        return `<img class="chat-emoji twitch-emote" src="${TWITCH_GLOBAL_EMOTES[trimmed]}" alt="${trimmed}" title="${trimmed}" loading="lazy">`;
      }
      return w;
    }).join('');

    // Replace Discord Custom Emojis (<:name:id> or <a:name:id>)
    escaped = escaped.replace(/&lt;(a)?:([a-zA-Z0-9_]+):([0-9]+)&gt;/g, (match, animated, name, id) => {
      const ext = animated ? 'gif' : 'webp';
      const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;
      return `<img class="chat-emoji dc-emoji" src="${url}" alt=":${name}:" title=":${name}:" loading="lazy">`;
    });

    // Replace standard Unicode Emojis with high-resolution Twemoji SVG
    escaped = escaped.replace(/\p{Extended_Pictographic}/gu, (m) => {
      const cp = emojiToCodePoints(m);
      if (!cp) return m;
      return `<img class="chat-emoji" src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg" alt="${m}" title="${m}" onerror="this.outerHTML='${m}'" loading="lazy">`;
    });

    return escaped;
  }).join('');
}

function renderSingleChatMessage(msgObj) {
  // Check platform filters
  if (msgObj.platform === 'youtube' && !state.filters.yt) return;
  if (msgObj.platform === 'twitch' && !state.filters.tw) return;
  if (msgObj.platform === 'tiktok' && !state.filters.tt) return;
  if (msgObj.platform === 'discord' && !state.filters.dc) return;

  // Check search filter query
  if (state.filters.searchQuery) {
    const query = state.filters.searchQuery.toLowerCase();
    const matchesUser = msgObj.username.toLowerCase().includes(query);
    const matchesText = msgObj.text.toLowerCase().includes(query);
    if (!matchesUser && !matchesText) return;
  }

  const chatFeed = document.getElementById('chatFeed');
  const div = document.createElement('div');
  div.className = `chat-item ${state.settings.compact ? 'compact' : ''}`;
  div.id = msgObj.id;

  const isYt = msgObj.platform === 'youtube';
  const isTt = msgObj.platform === 'tiktok';
  const isDc = msgObj.platform === 'discord';
  const badgeClass = isYt ? 'yt' : (isTt ? 'tt' : (isDc ? 'dc' : 'tw'));
  const badgeText = isYt ? 'YT' : (isTt ? 'TT' : (isDc ? 'DC' : 'TW'));
  const userClass = isYt ? 'yt-user' : (isTt ? 'tt-user' : (isDc ? 'dc-user' : 'tw-user'));

  let formattedText = formatChatMessageWithEmojis(msgObj.text, msgObj);

  // Highlight search term if active
  if (state.filters.searchQuery) {
    const re = new RegExp(`(${escapeRegExp(state.filters.searchQuery)})`, 'gi');
    formattedText = formattedText.replace(re, '<mark>$1</mark>');
  }

  const collabBadgeHtml = msgObj.collabPartner 
    ? `<span class="chat-collab-badge" title="Collab Partner: ${escapeHtml(msgObj.collabPartner)}">🤝 ${escapeHtml(msgObj.collabPartner)}</span>` 
    : '';

  div.innerHTML = `
    <span class="chat-timestamp">[${msgObj.timestamp}]</span>
    <span class="chat-badge ${badgeClass}">[${badgeText}]</span>
    ${collabBadgeHtml}
    <span class="chat-username ${userClass}">${escapeHtml(msgObj.username)}:</span>
    <span class="chat-text">${formattedText}</span>
    <div class="chat-actions">
      <button class="btn-chat-act" onclick="pinMessage('${msgObj.id}')" title="Pin Message">📌</button>
      <button class="btn-chat-act" onclick="copyMessageText('${msgObj.id}')" title="Copy Text">📋</button>
    </div>
  `;

  chatFeed.appendChild(div);
}

function reRenderAllMessages() {
  const chatFeed = document.getElementById('chatFeed');
  chatFeed.innerHTML = '';
  state.messages.forEach(msg => renderSingleChatMessage(msg));
  if (state.settings.autoScroll) scrollToBottom();
}

function scrollToBottom(force = false) {
  const chatFeed = document.getElementById('chatFeed');
  if (!chatFeed) return;
  if (force) {
    isUserScrolledUp = false;
    const btnScroll = document.getElementById('btnScrollBottom');
    if (btnScroll) btnScroll.classList.add('hidden');
  } else if (isUserScrolledUp) {
    return;
  }
  chatFeed.scrollTop = chatFeed.scrollHeight;
  requestAnimationFrame(() => {
    if (chatFeed && (!isUserScrolledUp || force)) {
      chatFeed.scrollTop = chatFeed.scrollHeight;
    }
  });
}

// --- Simulation Feed Generator (Test Mode) ---
let simInterval = null;

const simUsersYT = ['Rizky_Stream', 'IndoGamer99', 'Siti_Gaming', 'Andi_Keren', 'YouTuber_ID', 'Dede_Play'];
const simUsersTW = ['xQc_Fan', 'Ninja_Fanboy', 'PogChamp_Guy', 'Twitcher_Pro', 'RetroGamer95', 'CyberPunk95'];

const simMsgsYT = [
  'Wkwkwk lucu banget bang!',
  'Live-nya lancar jaya mantap 👍',
  'Halo bang dari Bandung hadir!',
  'Donasi disawer bang besok!',
  'Kapan main game horor lagi?',
  'Gas terus jangan kasih kendor 🚀'
];

const simMsgsTW = [
  'PogChamp GG WP!!',
  'LUL awesome stream dude',
  'KAPPA 123',
  'Greetings from Indonesia Twitch Community! 🇮🇩',
  'Clutch moment right there 🔥',
  'HYPE HYPE HYPE!'
];

function startSimulationFeed() {
  if (simInterval) clearInterval(simInterval);
  simInterval = setInterval(() => {
    if (!state.settings.testMode) return;

    const isYt = Math.random() > 0.45;
    const platform = isYt ? 'youtube' : 'twitch';
    const users = isYt ? simUsersYT : simUsersTW;
    const msgs = isYt ? simMsgsYT : simMsgsTW;

    const username = users[Math.floor(Math.random() * users.length)];
    const text = msgs[Math.floor(Math.random() * msgs.length)];

    addChatMessage({
      platform: platform,
      username: username,
      text: text
    });
  }, 2200);
}

function toggleTestMode() {
  playRetroSound('click');
  state.settings.testMode = !state.settings.testMode;
  const statusEl = document.getElementById('testModeStatus');
  const barStreamBadge = document.getElementById('barStreamBadge');
  const menuCheck = document.getElementById('menuTestCheck');

  if (state.settings.testMode) {
    if (statusEl) statusEl.textContent = 'ON';
    if (barStreamBadge && state.activeStreams.length === 0) barStreamBadge.textContent = 'Test Feed';
    if (menuCheck) menuCheck.style.display = 'inline';
    startSimulationFeed();
    addSystemMessage('Simulation Feed activated.');
  } else {
    if (statusEl) statusEl.textContent = 'OFF';
    if (barStreamBadge && state.activeStreams.length === 0) barStreamBadge.textContent = '0 streams';
    if (menuCheck) menuCheck.style.display = 'none';
    if (simInterval) clearInterval(simInterval);
    addSystemMessage('Simulation Feed stopped.');
  }
}

// --- Pinned Messages Drawer ---
function pinMessage(msgId) {
  playRetroSound('click');
  const msg = state.messages.find(m => m.id === msgId);
  if (!msg) return;

  if (state.pinnedMessages.some(p => p.id === msgId)) return;

  state.pinnedMessages.push(msg);
  updatePinnedUI();

  // Auto-open pinned drawer if closed
  const drawer = document.getElementById('pinnedDrawer');
  if (drawer) drawer.classList.remove('hidden');
}

function clearPinnedMessages() {
  playRetroSound('click');
  state.pinnedMessages = [];
  updatePinnedUI();
}

function updatePinnedUI() {
  const count = state.pinnedMessages.length;
  const pCount = document.getElementById('pinnedCount');
  if (pCount) pCount.textContent = count;
  const pCountDrawer = document.getElementById('pinnedCountDrawer');
  if (pCountDrawer) pCountDrawer.textContent = count;

  const container = document.getElementById('pinnedContainer');
  if (!container) return;
  if (count === 0) {
    container.innerHTML = `<div class="empty-pinned-msg">Belum ada pesan tersemat. Klik 📌 pada baris pesan untuk menyematkannya di sini.</div>`;
    return;
  }

  container.innerHTML = state.pinnedMessages.map(msg => `
    <div class="chat-item">
      <span class="chat-timestamp">[${msg.timestamp}]</span>
      <span class="chat-badge ${msg.platform === 'youtube' ? 'yt' : (msg.platform === 'tiktok' ? 'tt' : (msg.platform === 'discord' ? 'dc' : 'tw'))}">[${msg.platform === 'youtube' ? 'YT' : (msg.platform === 'tiktok' ? 'TT' : (msg.platform === 'discord' ? 'DC' : 'TW'))}]</span>
      <strong>${escapeHtml(msg.username)}:</strong>
      <span class="chat-text">${formatChatMessageWithEmojis(msg.text, msg)}</span>
      <div class="chat-actions" style="opacity:1; visibility:visible; display:inline-flex; gap:3px; margin-left:auto;">
        <button class="btn-chat-act" onclick="copyMessageText('${msg.id}')" title="Copy Text">📋</button>
        <button class="btn-chat-act" onclick="unpinMessage('${msg.id}')" title="Buka Pin (Unpin)">✕</button>
      </div>
    </div>
  `).join('');
}

function unpinMessage(msgId) {
  playRetroSound('click');
  state.pinnedMessages = state.pinnedMessages.filter(p => p.id !== msgId);
  updatePinnedUI();
}

function togglePinnedDrawer() {
  playRetroSound('click');
  const drawer = document.getElementById('pinnedDrawer');
  if (drawer) drawer.classList.toggle('hidden');
}

// --- Chat Actions & Controls ---
function clearAllChat() {
  playRetroSound('click');
  state.messages = [];
  document.getElementById('chatFeed').innerHTML = '';
  updateStatsDisplay();
  addSystemMessage('Chat feed cleared.');
}

function exportChatLog() {
  playRetroSound('click');
  if (state.messages.length === 0) {
    alert('No chat messages to export!');
    return;
  }

  let textContent = `=== LiveChat Pro '95 Export Log ===\n`;
  textContent += `Generated: ${new Date().toLocaleString()}\n`;
  textContent += `Total Messages: ${state.messages.length}\n\n`;

  state.messages.forEach(m => {
    textContent += `[${m.timestamp}] [${m.platform.toUpperCase()}] ${m.username}: ${m.text}\n`;
  });

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LiveChat_Log_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyMessageText(msgIdOrText) {
  let textToCopy = msgIdOrText;
  const foundMsg = state.messages.find(m => m.id === msgIdOrText) || state.pinnedMessages.find(m => m.id === msgIdOrText);
  if (foundMsg) {
    textToCopy = foundMsg.text;
  }
  if (textToCopy) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {});
    }
    playRetroSound('click');
  }
}

function toggleClickThroughSetting(val) {
  if (typeof val === 'boolean') {
    state.settings.clickThrough = val;
  } else {
    state.settings.clickThrough = !state.settings.clickThrough;
  }
  playRetroSound('click');
  const chk = document.getElementById('chkClickThrough');
  if (chk) chk.checked = state.settings.clickThrough;

  try {
    localStorage.setItem('livechat_clickthrough', state.settings.clickThrough);
  } catch (e) {}

  if (!electronIpc) return;
  if (!state.settings.clickThrough) {
    currentIgnoreMouseState = false;
    electronIpc.send('set-ignore-mouse-events', false);
  } else {
    currentIgnoreMouseState = true;
    electronIpc.send('set-ignore-mouse-events', true, { forward: true });
  }
}

function applyFilters() {
  const ytChk = document.getElementById('chkFilterYt');
  const twChk = document.getElementById('chkFilterTw');
  const ttChk = document.getElementById('chkFilterTt');
  const dcChk = document.getElementById('chkFilterDc');
  state.filters.yt = ytChk ? ytChk.checked : true;
  state.filters.tw = twChk ? twChk.checked : true;
  state.filters.tt = ttChk ? ttChk.checked : true;
  state.filters.dc = dcChk ? dcChk.checked : true;
  reRenderAllMessages();
}

function handleSearch() {
  state.filters.searchQuery = document.getElementById('chatSearchInput').value.trim();
  reRenderAllMessages();
}

// --- Display & Preferences Toggles ---
function toggleSound() {
  state.settings.sound = !state.settings.sound;
  const btn = document.getElementById('btnSoundToggle');
  const soundIcon = document.getElementById('soundIcon');
  if (btn) {
    btn.innerHTML = `<span id="soundIcon">${state.settings.sound ? '🔊' : '🔇'}</span> Sound: ${state.settings.sound ? 'ON' : 'OFF'}`;
  }
  if (state.settings.sound) {
    playRetroSound('click');
  }
}

function toggleScanlines() {
  playRetroSound('click');
  const chk = document.getElementById('chkScanlines');
  if (chk) {
    state.settings.scanlines = chk.checked;
  } else {
    state.settings.scanlines = !state.settings.scanlines;
  }
  const crt = document.getElementById('crtOverlay');
  if (crt) {
    if (state.settings.scanlines) {
      crt.classList.remove('hidden');
    } else {
      crt.classList.add('hidden');
    }
  }
}

function toggleContrast() {
  playRetroSound('click');
  const chk = document.getElementById('chkContrast');
  if (chk) {
    state.settings.contrast = chk.checked;
  } else {
    state.settings.contrast = !state.settings.contrast;
  }
  if (state.settings.contrast) {
    document.body.classList.add('high-contrast');
  } else {
    document.body.classList.remove('high-contrast');
  }
}

function toggleCompactMode() {
  playRetroSound('click');
  const chk = document.getElementById('chkCompact');
  if (chk) {
    state.settings.compact = chk.checked;
  } else {
    state.settings.compact = !state.settings.compact;
  }
  reRenderAllMessages();
}

function toggleAutoScroll(val) {
  playRetroSound('click');
  if (typeof val === 'boolean') {
    state.settings.autoScroll = val;
  } else {
    state.settings.autoScroll = !state.settings.autoScroll;
  }
  const chk = document.getElementById('chkAutoScroll');
  if (chk) chk.checked = state.settings.autoScroll;

  try {
    localStorage.setItem('livechat_autoscroll', state.settings.autoScroll);
  } catch (e) {}

  if (state.settings.autoScroll) {
    isUserScrolledUp = false;
    scrollToBottom(true);
    addSystemMessage('Auto-scroll chat diaktifkan.');
  } else {
    addSystemMessage('Auto-scroll chat dinonaktifkan.');
  }
}

// --- Appearance Live Customization Engine ---
const SHADOW_PRESETS = {
  'none': 'none',
  'soft': '0 2px 8px rgba(0, 0, 0, 0.35)',
  'deep': '0 4px 14px rgba(0, 0, 0, 0.65)',
  'glow-white': '0 0 12px rgba(255, 255, 255, 0.4), 0 4px 12px rgba(0, 0, 0, 0.6)',
  'glow-cyan': '0 0 14px rgba(6, 182, 212, 0.6), 0 4px 12px rgba(0, 0, 0, 0.7)',
  'glow-purple': '0 0 14px rgba(168, 85, 247, 0.6), 0 4px 12px rgba(0, 0, 0, 0.7)',
  'retro-drop': '3px 3px 0px rgba(0, 0, 0, 0.95)'
};

const ANIMATION_PRESETS = {
  'slide-up': 'slideUpMsg 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
  'pop-in': 'popInMsg 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
  'fade-in': 'fadeInMsg 0.2s ease-out',
  'instant': 'none'
};

function hexToRgba(hex, alphaPercent) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const a = (alphaPercent / 100).toFixed(2);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function applyPresetBackground(preset) {
  playRetroSound('click');
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));

  if (preset === 'transparent') {
    state.appearance.bgMode = 'transparent';
    state.appearance.bgColor = '#000000';
    state.appearance.bgOpacity = 0;
    const btn = document.getElementById('themeBtnClear');
    if (btn) btn.classList.add('active');
  } else if (preset === 'glass') {
    state.appearance.bgMode = 'glass';
    state.appearance.bgColor = '#0c0f16';
    state.appearance.bgOpacity = 35;
    const btn = document.getElementById('themeBtnGlass');
    if (btn) btn.classList.add('active');
  } else if (preset === 'solid') {
    state.appearance.bgMode = 'solid';
    state.appearance.bgColor = '#0c0f16';
    state.appearance.bgOpacity = 100;
    const btn = document.getElementById('themeBtnSolid');
    if (btn) btn.classList.add('active');
  } else if (preset === 'green') {
    state.appearance.bgMode = 'green';
    state.appearance.bgColor = '#00ff00';
    state.appearance.bgOpacity = 100;
    const btn = document.getElementById('themeBtnGreen');
    if (btn) btn.classList.add('active');
  }

  // Update inputs
  const colorInput = document.getElementById('bgColorPicker');
  if (colorInput) colorInput.value = state.appearance.bgColor;
  const colorHex = document.getElementById('bgColorHex');
  if (colorHex) colorHex.textContent = state.appearance.bgColor;
  const opacitySlider = document.getElementById('bgOpacitySlider');
  if (opacitySlider) opacitySlider.value = state.appearance.bgOpacity;
  const opacityVal = document.getElementById('bgOpacityVal');
  if (opacityVal) opacityVal.textContent = `${state.appearance.bgOpacity}%`;

  updateBackgroundStyle();
  saveAppearanceSettings();
}

function onCustomBgColorChange(hex) {
  state.appearance.bgMode = 'custom';
  state.appearance.bgColor = hex;
  const hexLabel = document.getElementById('bgColorHex');
  if (hexLabel) hexLabel.textContent = hex;
  if (state.appearance.bgOpacity === 0) {
    state.appearance.bgOpacity = 100;
    const opacitySlider = document.getElementById('bgOpacitySlider');
    if (opacitySlider) opacitySlider.value = 100;
    const opacityVal = document.getElementById('bgOpacityVal');
    if (opacityVal) opacityVal.textContent = '100%';
  }
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  updateBackgroundStyle();
  saveAppearanceSettings();
}

function onBgOpacityChange(val) {
  state.appearance.bgOpacity = parseInt(val, 10);
  const opacityVal = document.getElementById('bgOpacityVal');
  if (opacityVal) opacityVal.textContent = `${val}%`;
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  updateBackgroundStyle();
  saveAppearanceSettings();
}

function updateBackgroundStyle() {
  const root = document.documentElement;
  if (state.appearance.bgOpacity === 0) {
    document.body.className = 'bg-transparent';
    root.style.setProperty('--chat-bg-color', 'transparent');
  } else {
    document.body.className = '';
    const rgba = hexToRgba(state.appearance.bgColor, state.appearance.bgOpacity);
    root.style.setProperty('--chat-bg-color', rgba);
  }
}

function onBubbleColorChange(hex) {
  state.appearance.bubbleBgColor = hex;
  const hexLabel = document.getElementById('bubbleColorHex');
  if (hexLabel) hexLabel.textContent = hex;
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleTextColorChange(hex) {
  state.appearance.chatTextColor = hex;
  const hexLabel = document.getElementById('bubbleTextColorHex');
  if (hexLabel) hexLabel.textContent = hex;
  document.documentElement.style.setProperty('--chat-text-color', hex);
  saveAppearanceSettings();
}

function onBubbleOpacityChange(val) {
  state.appearance.bubbleOpacity = parseInt(val, 10);
  const valLabel = document.getElementById('bubbleOpacityVal');
  if (valLabel) valLabel.textContent = `${val}%`;
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleRadiusChange(val) {
  const r = parseInt(val, 10);
  state.appearance.bubbleRadius = r;
  const valLabel = document.getElementById('bubbleRadiusVal');
  if (valLabel) valLabel.textContent = `${r}px`;
  document.documentElement.style.setProperty('--bubble-border-radius', `${r}px`);
  saveAppearanceSettings();
}

function onBubblePadYChange(val) {
  const py = parseInt(val, 10);
  state.appearance.bubblePadY = py;
  const valLabel = document.getElementById('bubblePadYVal');
  if (valLabel) valLabel.textContent = `${py}px`;
  document.documentElement.style.setProperty('--bubble-padding-y', `${py}px`);
  saveAppearanceSettings();
}

function onBubblePadXChange(val) {
  const px = parseInt(val, 10);
  state.appearance.bubblePadX = px;
  const valLabel = document.getElementById('bubblePadXVal');
  if (valLabel) valLabel.textContent = `${px}px`;
  document.documentElement.style.setProperty('--bubble-padding-x', `${px}px`);
  saveAppearanceSettings();
}

function onBubbleGapChange(val) {
  const g = parseInt(val, 10);
  state.appearance.bubbleGap = g;
  const valLabel = document.getElementById('bubbleGapVal');
  if (valLabel) valLabel.textContent = `${g}px`;
  document.documentElement.style.setProperty('--bubble-gap', `${g}px`);
  saveAppearanceSettings();
}

function onBubbleBorderToggle(checked) {
  state.appearance.bubbleBorder = checked;
  const colorRow = document.getElementById('bubbleBorderColorRow');
  const widthRow = document.getElementById('bubbleBorderWidthRow');
  if (colorRow) colorRow.style.display = checked ? 'flex' : 'none';
  if (widthRow) widthRow.style.display = checked ? 'flex' : 'none';
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleBorderColorChange(hex) {
  state.appearance.bubbleBorderColor = hex;
  const hexLabel = document.getElementById('bubbleBorderHex');
  if (hexLabel) hexLabel.textContent = hex;
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleBorderWidthChange(val) {
  const w = parseInt(val, 10);
  state.appearance.bubbleBorderWidth = w;
  const valLabel = document.getElementById('bubbleBorderWidthVal');
  if (valLabel) valLabel.textContent = `${w}px`;
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleShadowChange(val) {
  state.appearance.bubbleShadow = val;
  const shadowVal = SHADOW_PRESETS[val] || SHADOW_PRESETS.deep;
  document.documentElement.style.setProperty('--bubble-shadow', shadowVal);
  saveAppearanceSettings();
}

function toggleTimestampDisplay(checked) {
  state.appearance.showTimestamp = checked;
  const feed = document.getElementById('chatFeed');
  if (feed) feed.classList.toggle('hide-timestamps', !checked);
  saveAppearanceSettings();
}

function toggleBadgeDisplay(checked) {
  state.appearance.showBadges = checked;
  const feed = document.getElementById('chatFeed');
  if (feed) feed.classList.toggle('hide-badges', !checked);
  saveAppearanceSettings();
}

function toggleBoldUsername(checked) {
  state.appearance.boldUsername = checked;
  const feed = document.getElementById('chatFeed');
  if (feed) feed.classList.toggle('normal-username', !checked);
  saveAppearanceSettings();
}

function onAnimationChange(val) {
  state.appearance.animationType = val;
  const animVal = ANIMATION_PRESETS[val] || ANIMATION_PRESETS['slide-up'];
  document.documentElement.style.setProperty('--bubble-anim', animVal);
  saveAppearanceSettings();
}

// =========================================================================
// Floating Donation Window (Independent, Resizable, Multi-Tab)
// =========================================================================
let isFdwLocked = false;
let currentFdwTab = 'overlay';

function openFloatingDonationWindow(tab = 'overlay') {
  playRetroSound('click');
  // In Electron desktop app, open the standalone detached window (movable anywhere across screens)
  if (electronIpc) {
    electronIpc.send('open-donation-window', tab);
    return;
  }
  // Fallback in web browser mode
  const win = document.getElementById('floatingDonationWindow');
  if (!win) return;
  win.classList.remove('hidden');
  switchFdwTab(tab);
}

function closeFloatingDonationWindow() {
  playRetroSound('click');
  if (electronIpc) {
    electronIpc.send('close-donation-window');
  }
  const win = document.getElementById('floatingDonationWindow');
  if (win) win.classList.add('hidden');
}

function toggleFloatingDonationWindow(tab = 'overlay') {
  playRetroSound('click');
  if (electronIpc) {
    electronIpc.send('toggle-donation-window', tab);
    return;
  }
  const win = document.getElementById('floatingDonationWindow');
  if (win) {
    win.classList.toggle('hidden');
    if (!win.classList.contains('hidden')) switchFdwTab(tab);
  }
}

function switchFdwTab(tabName) {
  playRetroSound('click');
  currentFdwTab = tabName;

  const tabs = ['overlay', 'leaderboard', 'mediashare'];
  tabs.forEach(t => {
    const btn = document.getElementById(`fdwTabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const pane = document.getElementById(`fdwPane${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });

  if (tabName === 'overlay') {
    updateFdwIframe();
  } else if (tabName === 'leaderboard') {
    renderFdwLeaderboard();
  }
}

function toggleFdwLock(forceVal) {
  playRetroSound('click');
  if (typeof forceVal === 'boolean') {
    isFdwLocked = forceVal;
  } else {
    isFdwLocked = !isFdwLocked;
  }

  const win = document.getElementById('floatingDonationWindow');
  const lockBtn = document.getElementById('fdwLockBtn');
  const lockShackle = document.getElementById('fdwLockShackle');
  const lockSettingsBtn = document.getElementById('lockDonationAlert');

  if (win) win.classList.toggle('locked', isFdwLocked);
  if (lockBtn) {
    lockBtn.classList.toggle('locked', isFdwLocked);
    lockBtn.title = isFdwLocked ? 'Posisi Terkunci (Klik untuk buka)' : 'Kunci Posisi';
  }
  if (lockShackle) {
    lockShackle.setAttribute('d', isFdwLocked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1');
  }
  if (lockSettingsBtn) {
    lockSettingsBtn.classList.toggle('active', isFdwLocked);
  }

  addSystemMessage(isFdwLocked ? '🔒 Jendela mengambang donasi dikunci.' : '🔓 Jendela mengambang donasi dibuka.');
}

function reloadCurrentFdwTab() {
  playRetroSound('click');
  if (currentFdwTab === 'overlay') {
    reloadFdwIframe();
  } else if (currentFdwTab === 'leaderboard') {
    renderFdwLeaderboard();
  } else {
    triggerTestMedserAlert();
  }
}

function onFdwSourceSelectChanged() {
  updateFdwIframe();
}

function updateFdwIframe() {
  const iframe = document.getElementById('fdwOverlayIframe');
  const placeholder = document.getElementById('fdwOverlayPlaceholder');
  const select = document.getElementById('fdwOverlaySourceSelect');
  if (!iframe) return;

  const choice = select ? select.value : 'auto';
  let targetUrl = '';

  if (choice === 'tako') {
    targetUrl = state.donations.takoUrl;
  } else if (choice === 'saweria') {
    targetUrl = state.donations.saweriaUrl;
  } else if (choice === 'custom') {
    targetUrl = state.donations.customUrl;
  } else {
    // auto: pick first configured valid url
    targetUrl = state.donations.takoUrl || state.donations.saweriaUrl || state.donations.customUrl || '';
  }

  if (targetUrl && isValidHttpUrl(targetUrl)) {
    if (iframe.getAttribute('data-src') !== targetUrl) {
      iframe.src = targetUrl;
      iframe.setAttribute('data-src', targetUrl);
    }
    iframe.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
  } else {
    iframe.src = 'about:blank';
    iframe.removeAttribute('data-src');
    iframe.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
  }
}

function reloadFdwIframe() {
  playRetroSound('click');
  const iframe = document.getElementById('fdwOverlayIframe');
  if (!iframe) return;
  const currentSrc = iframe.getAttribute('data-src');
  if (currentSrc && isValidHttpUrl(currentSrc)) {
    const ts = Date.now();
    const conn = currentSrc.includes('?') ? '&' : '?';
    iframe.src = `${currentSrc}${conn}_reload=${ts}`;
    addSystemMessage('🔄 Iframe overlay donasi dimuat ulang.');
  } else {
    updateFdwIframe();
  }
}

function renderFdwLeaderboard() {
  const container = document.getElementById('fdwLeaderboardList');
  if (!container) return;

  if (!state.leaderboard || state.leaderboard.length === 0) {
    container.innerHTML = `<div class="fdw-empty-text">Belum ada donasi tercatat sesi ini.<br><span style="font-size:9.5px;color:#94a3b8;">Klik "Test Donasi" untuk mencoba.</span></div>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = state.leaderboard.map((item, idx) => {
    const rankBadge = medals[idx] || `#${idx + 1}`;
    return `
      <div class="fdw-lb-row">
        <div class="fdw-lb-left">
          <span class="fdw-lb-rank">${rankBadge}</span>
          <span class="fdw-lb-donor">${escapeHtml(item.donor)}</span>
        </div>
        <span class="fdw-lb-total">${escapeHtml(item.displayTotal || item.amount || '')}</span>
      </div>
    `;
  }).join('');
}

// Drag & Move logic for Floating Window
function initFdwDrag() {
  const handle = document.getElementById('fdwDragHandle');
  const win = document.getElementById('floatingDonationWindow');
  if (!handle || !win || handle.dataset.dragInit) return;
  handle.dataset.dragInit = 'true';

  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  handle.addEventListener('mousedown', (e) => {
    if (isFdwLocked) return;
    if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;

    isDragging = true;
    const rect = win.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = rect.left;
    initialTop = rect.top;

    win.style.left = `${initialLeft}px`;
    win.style.top = `${initialTop}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';

    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - 120, initialLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - 60, initialTop + dy));
      win.style.left = `${newLeft}px`;
      win.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// Fallback/Legacy toggle functions
function toggleFloatPanel(panelId) {
  if (panelId === 'donationAlert') {
    openFloatingDonationWindow('overlay');
  } else if (panelId === 'leaderboard') {
    openFloatingDonationWindow('leaderboard');
  } else if (panelId === 'mediashare') {
    openFloatingDonationWindow('mediashare');
  }
}

function lockFloatPanel(panelId) {
  toggleFdwLock();
}

function reloadFloatPanel(panelId) {
  reloadFdwIframe();
}

// Update submit button states (checks state.savedAccounts properly)
function updateSubmitBtnStates() {
  const map = {
    Twitch: !!(state.savedAccounts && state.savedAccounts.twitch),
    Yt: !!(state.savedAccounts && state.savedAccounts.youtube),
    TikTok: !!(state.savedAccounts && state.savedAccounts.tiktok),
    Dc: !!(state.savedAccounts && state.savedAccounts.discordToken && state.savedAccounts.discordChannel)
  };
  Object.entries(map).forEach(([platform, isSaved]) => {
    const btn = document.getElementById(`btn${platform}Submit`);
    const textEl = document.getElementById(`acc${platform}BtnText`);
    if (!btn) return;
    if (isSaved) {
      btn.classList.add('saved');
      if (textEl) textEl.textContent = 'Saved ✓';
    } else {
      btn.classList.remove('saved');
      if (textEl) textEl.textContent = 'Submit';
    }
  });
}


function onFontFamilyChange(font) {
  state.appearance.fontFamily = font;
  document.documentElement.style.setProperty('--chat-font-family', font);
  saveAppearanceSettings();
}

function onFontSizeChange(val) {
  const size = parseInt(val, 10);
  state.appearance.fontSize = size;
  const valLabel = document.getElementById('fontSizeVal');
  if (valLabel) valLabel.textContent = `${size}px`;
  document.documentElement.style.setProperty('--chat-font-size', `${size}px`);
  saveAppearanceSettings();
}

function onChatTextColorChange(hex) {
  state.appearance.chatTextColor = hex;
  const hexLabel = document.getElementById('chatTextHex');
  if (hexLabel) hexLabel.textContent = hex;
  document.documentElement.style.setProperty('--chat-text-color', hex);
  saveAppearanceSettings();
}

function updateBubbleStyle() {
  const root = document.documentElement;
  const bubbleBg = hexToRgba(state.appearance.bubbleBgColor || '#0e121a', state.appearance.bubbleOpacity !== undefined ? state.appearance.bubbleOpacity : 78);
  root.style.setProperty('--bubble-bg-color', bubbleBg);

  if (state.appearance.bubbleBorder) {
    const width = state.appearance.bubbleBorderWidth !== undefined ? state.appearance.bubbleBorderWidth : 1;
    root.style.setProperty('--bubble-border-width', `${width}px`);
    root.style.setProperty('--bubble-border-color', state.appearance.bubbleBorderColor || '#ffffff');
  } else {
    root.style.setProperty('--bubble-border-width', '0px');
    root.style.setProperty('--bubble-border-color', 'transparent');
  }
}

function resetDefaultAppearance() {
  playRetroSound('click');
  state.appearance = {
    bgMode: 'transparent',
    bgColor: '#000000',
    bgOpacity: 0,
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    chatTextColor: '#ffffff',
    bubbleBgColor: '#0e121a',
    bubbleOpacity: 78,
    bubbleRadius: 12,
    bubblePadY: 5,
    bubblePadX: 11,
    bubbleGap: 5,
    bubbleBorder: true,
    bubbleBorderColor: '#ffffff',
    bubbleBorderWidth: 1,
    bubbleShadow: 'deep',
    showTimestamp: true,
    showBadges: true,
    boldUsername: true,
    animationType: 'slide-up'
  };
  applyAppearanceToDom();
  saveAppearanceSettings();
}

let appearanceSaveDebounceTimer = null;
function saveAppearanceSettings() {
  // 1. Immediate save to localStorage
  try {
    localStorage.setItem('livechat_appearance', JSON.stringify(state.appearance));
  } catch (e) {}

  // 2. Debounced save to permanent disk via saveSavedAccountsToStorage (250ms)
  if (appearanceSaveDebounceTimer) clearTimeout(appearanceSaveDebounceTimer);
  appearanceSaveDebounceTimer = setTimeout(() => {
    if (typeof saveSavedAccountsToStorage === 'function') {
      saveSavedAccountsToStorage();
    }
  }, 250);
}

function loadSavedAppearance() {
  try {
    const saved = localStorage.getItem('livechat_appearance');
    if (saved) {
      state.appearance = Object.assign(state.appearance, JSON.parse(saved));
    }
  } catch (e) {}
  applyAppearanceToDom();
}

function applyAppearanceToDom() {
  const root = document.documentElement;
  
  // Background
  updateBackgroundStyle();
  const colorInput = document.getElementById('bgColorPicker');
  if (colorInput) colorInput.value = state.appearance.bgColor || '#000000';
  const colorHex = document.getElementById('bgColorHex');
  if (colorHex) colorHex.textContent = state.appearance.bgColor || '#000000';
  const opacitySlider = document.getElementById('bgOpacitySlider');
  if (opacitySlider) opacitySlider.value = state.appearance.bgOpacity !== undefined ? state.appearance.bgOpacity : 0;
  const opacityVal = document.getElementById('bgOpacityVal');
  if (opacityVal) opacityVal.textContent = `${state.appearance.bgOpacity || 0}%`;

  // Bubble Colors & Opacity
  updateBubbleStyle();
  const bColor = document.getElementById('bubbleColorPicker');
  if (bColor) bColor.value = state.appearance.bubbleBgColor || '#0e121a';
  const bHex = document.getElementById('bubbleColorHex');
  if (bHex) bHex.textContent = state.appearance.bubbleBgColor || '#0e121a';

  const tColor = document.getElementById('bubbleTextColorPicker');
  if (tColor) tColor.value = state.appearance.chatTextColor || '#ffffff';
  const tHex = document.getElementById('bubbleTextColorHex');
  if (tHex) tHex.textContent = state.appearance.chatTextColor || '#ffffff';
  root.style.setProperty('--chat-text-color', state.appearance.chatTextColor || '#ffffff');

  const bOpacity = document.getElementById('bubbleOpacitySlider');
  if (bOpacity) bOpacity.value = state.appearance.bubbleOpacity !== undefined ? state.appearance.bubbleOpacity : 78;
  const bOpacityVal = document.getElementById('bubbleOpacityVal');
  if (bOpacityVal) bOpacityVal.textContent = `${state.appearance.bubbleOpacity !== undefined ? state.appearance.bubbleOpacity : 78}%`;

  // Radius, Padding, Gap
  const bRadius = document.getElementById('bubbleRadiusSlider');
  if (bRadius) bRadius.value = state.appearance.bubbleRadius || 12;
  const bRadiusVal = document.getElementById('bubbleRadiusVal');
  if (bRadiusVal) bRadiusVal.textContent = `${state.appearance.bubbleRadius || 12}px`;
  root.style.setProperty('--bubble-border-radius', `${state.appearance.bubbleRadius || 12}px`);

  const py = state.appearance.bubblePadY !== undefined ? state.appearance.bubblePadY : (state.appearance.bubblePadding || 5);
  const bPadY = document.getElementById('bubblePadYSlider');
  if (bPadY) bPadY.value = py;
  const bPadYVal = document.getElementById('bubblePadYVal');
  if (bPadYVal) bPadYVal.textContent = `${py}px`;
  root.style.setProperty('--bubble-padding-y', `${py}px`);

  const px = state.appearance.bubblePadX !== undefined ? state.appearance.bubblePadX : Math.round(py * 2.2);
  const bPadX = document.getElementById('bubblePadXSlider');
  if (bPadX) bPadX.value = px;
  const bPadXVal = document.getElementById('bubblePadXVal');
  if (bPadXVal) bPadXVal.textContent = `${px}px`;
  root.style.setProperty('--bubble-padding-x', `${px}px`);

  const bGap = document.getElementById('bubbleGapSlider');
  if (bGap) bGap.value = state.appearance.bubbleGap !== undefined ? state.appearance.bubbleGap : 5;
  const bGapVal = document.getElementById('bubbleGapVal');
  if (bGapVal) bGapVal.textContent = `${state.appearance.bubbleGap !== undefined ? state.appearance.bubbleGap : 5}px`;
  root.style.setProperty('--bubble-gap', `${state.appearance.bubbleGap !== undefined ? state.appearance.bubbleGap : 5}px`);

  // Border
  const chkBorder = document.getElementById('chkBubbleBorder');
  if (chkBorder) chkBorder.checked = !!state.appearance.bubbleBorder;
  const colorRow = document.getElementById('bubbleBorderColorRow');
  const widthRow = document.getElementById('bubbleBorderWidthRow');
  if (colorRow) colorRow.style.display = state.appearance.bubbleBorder ? 'flex' : 'none';
  if (widthRow) widthRow.style.display = state.appearance.bubbleBorder ? 'flex' : 'none';

  const bBorderColor = document.getElementById('bubbleBorderColorPicker');
  if (bBorderColor) bBorderColor.value = state.appearance.bubbleBorderColor || '#ffffff';
  const bBorderHex = document.getElementById('bubbleBorderHex');
  if (bBorderHex) bBorderHex.textContent = state.appearance.bubbleBorderColor || '#ffffff';

  const bBorderWidth = document.getElementById('bubbleBorderWidthSlider');
  if (bBorderWidth) bBorderWidth.value = state.appearance.bubbleBorderWidth || 1;
  const bBorderWidthVal = document.getElementById('bubbleBorderWidthVal');
  if (bBorderWidthVal) bBorderWidthVal.textContent = `${state.appearance.bubbleBorderWidth || 1}px`;

  // Shadow preset
  const shadowSel = document.getElementById('bubbleShadowSelect');
  const shadowVal = state.appearance.bubbleShadow || 'deep';
  if (shadowSel) shadowSel.value = shadowVal;
  root.style.setProperty('--bubble-shadow', SHADOW_PRESETS[shadowVal] || SHADOW_PRESETS.deep);

  // Chat elements & animations
  const chkTimestamp = document.getElementById('chkShowTimestamp');
  const showTs = state.appearance.showTimestamp !== false;
  if (chkTimestamp) chkTimestamp.checked = showTs;

  const chkBadges = document.getElementById('chkShowBadges');
  const showBd = state.appearance.showBadges !== false;
  if (chkBadges) chkBadges.checked = showBd;

  const chkBold = document.getElementById('chkBoldUsername');
  const isBold = state.appearance.boldUsername !== false;
  if (chkBold) chkBold.checked = isBold;

  const feed = document.getElementById('chatFeed');
  if (feed) {
    feed.classList.toggle('hide-timestamps', !showTs);
    feed.classList.toggle('hide-badges', !showBd);
    feed.classList.toggle('normal-username', !isBold);
  }

  const animSel = document.getElementById('bubbleAnimSelect');
  const animVal = state.appearance.animationType || 'slide-up';
  if (animSel) animSel.value = animVal;
  root.style.setProperty('--bubble-anim', ANIMATION_PRESETS[animVal] || ANIMATION_PRESETS['slide-up']);

  // Font & Size
  const fontSel = document.getElementById('fontSelect');
  if (fontSel) fontSel.value = state.appearance.fontFamily || "'Inter', sans-serif";
  root.style.setProperty('--chat-font-family', state.appearance.fontFamily || "'Inter', sans-serif");

  const fSize = document.getElementById('fontSizeSlider');
  if (fSize) fSize.value = state.appearance.fontSize || 14;
  const fSizeVal = document.getElementById('fontSizeVal');
  if (fSizeVal) fSizeVal.textContent = `${state.appearance.fontSize || 14}px`;
  root.style.setProperty('--chat-font-size', `${state.appearance.fontSize || 14}px`);
}

// Platform Card Connect Helpers
function connectTwitchFromCard() {
  const input = document.getElementById('twitchChannelInput');
  if (!input || !input.value.trim()) {
    alert('Silakan masukkan nama channel Twitch!');
    return;
  }
  connectStreamUrl(input.value.trim(), 'twitch');
}

function connectYtFromCard() {
  const input = document.getElementById('youtubeUrlInput');
  if (!input || !input.value.trim()) {
    alert('Silakan masukkan link live video YouTube!');
    return;
  }
  connectStreamUrl(input.value.trim(), 'youtube');
}

function connectTikTokFromCard() {
  const input = document.getElementById('tiktokUsernameInput');
  if (!input || !input.value.trim()) {
    alert('Silakan masukkan @username TikTok!');
    return;
  }
  let username = input.value.trim().replace('@', '');
  connectTikTokStream(username);
}

function connectTikTokStream(username, silent = false, collabPartner = null) {
  const cleanUser = String(username).replace(/^@/, '').trim();
  if (!cleanUser) {
    if (!silent) alert('Masukkan username TikTok yang valid!');
    return;
  }

  // Avoid duplicate connections for same user & collab status
  const existing = state.activeStreams.find(s => s.platform === 'tiktok' && s.cleanUser === cleanUser && s.collabPartner === collabPartner);
  if (existing) {
    if (!silent) addSystemMessage(`Stream TikTok @${cleanUser} sudah terhubung.`);
    return;
  }

  if (!silent) playRetroSound('connect');
  const streamId = `tt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const streamObj = {
    id: streamId,
    platform: 'tiktok',
    cleanUser: cleanUser,
    channelOrId: `@${cleanUser} (Memeriksa...)`,
    url: `https://www.tiktok.com/@${cleanUser}/live`,
    isStandby: false,
    collabPartner: collabPartner || null
  };

  state.activeStreams.push(streamObj);
  updateConnectedStreamsUI();
  addSystemMessage(`🎵 [TikTok] Memeriksa live status @${cleanUser}...`);

  if (electronIpc) {
    electronIpc.send('tiktok-connect', { streamId, username: cleanUser });

    // Periodic standby auto-reconnect loop every 25 seconds
    if (streamObj.standbyCheckInterval) clearInterval(streamObj.standbyCheckInterval);
    streamObj.standbyCheckInterval = setInterval(() => {
      if (!state.activeStreams.some(s => s.id === streamObj.id)) {
        clearInterval(streamObj.standbyCheckInterval);
        return;
      }
      if (streamObj.isStandby) {
        console.log(`[TikTok Standby] Re-checking @${cleanUser}...`);
        electronIpc.send('tiktok-connect', { streamId: streamObj.id, username: cleanUser });
      }
    }, 25000);
  } else {
    addSystemMessage(`⚠️ Fitur live chat TikTok aktif pada aplikasi desktop.`);
  }
}

function setOverlayTheme(themeClass, playSound = true) {
  if (playSound) playRetroSound('click');
  if (themeClass === 'bg-transparent') applyPresetBackground('transparent');
  else if (themeClass === 'bg-dark-glass') applyPresetBackground('glass');
  else if (themeClass === 'bg-dark-solid') applyPresetBackground('solid');
  else if (themeClass === 'bg-obs-green') applyPresetBackground('green');
}

function setFilter(type) {
  playRetroSound('click');
  const ytChk = document.getElementById('chkFilterYt');
  const twChk = document.getElementById('chkFilterTw');
  const ttChk = document.getElementById('chkFilterTt');
  const dcChk = document.getElementById('chkFilterDc');
  if (type === 'yt') {
    if (ytChk) ytChk.checked = true;
    if (twChk) twChk.checked = false;
    if (ttChk) ttChk.checked = false;
    if (dcChk) dcChk.checked = false;
  } else if (type === 'tw') {
    if (ytChk) ytChk.checked = false;
    if (twChk) twChk.checked = true;
    if (ttChk) ttChk.checked = false;
    if (dcChk) dcChk.checked = false;
  } else if (type === 'tt') {
    if (ytChk) ytChk.checked = false;
    if (twChk) twChk.checked = false;
    if (ttChk) ttChk.checked = true;
    if (dcChk) dcChk.checked = false;
  } else if (type === 'dc') {
    if (ytChk) ytChk.checked = false;
    if (twChk) twChk.checked = false;
    if (ttChk) ttChk.checked = false;
    if (dcChk) dcChk.checked = true;
  } else {
    if (ytChk) ytChk.checked = true;
    if (twChk) twChk.checked = true;
    if (ttChk) ttChk.checked = true;
    if (dcChk) dcChk.checked = true;
  }
  applyFilters();
}

// --- In-Window Settings Panel Controls (No Window Widening, Preserves Lock Orientation) ---
function toggleSettingsModal() {
  playRetroSound('click');
  const panel = document.getElementById('settingsPanel') || document.getElementById('settingsModal');
  if (!panel) return;
  const isOpening = panel.classList.contains('hidden');
  
  isResizingSettings = true;

  if (isOpening) {
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }

  // Keep chat feed pinned to bottom during and after panel transition
  if (state.settings.autoScroll) {
    isUserScrolledUp = false;
    scrollToBottom(true);
    setTimeout(() => {
      scrollToBottom(true);
    }, 150);
    setTimeout(() => {
      scrollToBottom(true);
      isResizingSettings = false;
    }, 350);
  } else {
    setTimeout(() => {
      isResizingSettings = false;
    }, 350);
  }

  // Notify Electron to expand/collapse window to the right
  if (electronIpc) {
    try {
      electronIpc.send('toggle-settings-panel', isOpening);
    } catch (e) {}
  } else if (typeof window !== 'undefined' && window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('toggle-settings-panel', isOpening);
    } catch (e) {}
  }
}

function closeSettingsModal() {
  playRetroSound('click');
  const panel = document.getElementById('settingsPanel') || document.getElementById('settingsModal');
  if (panel && !panel.classList.contains('hidden')) {
    isResizingSettings = true;
    panel.classList.add('hidden');

    if (state.settings.autoScroll) {
      isUserScrolledUp = false;
      scrollToBottom(true);
      setTimeout(() => {
        scrollToBottom(true);
      }, 150);
      setTimeout(() => {
        scrollToBottom(true);
        isResizingSettings = false;
      }, 350);
    } else {
      setTimeout(() => {
        isResizingSettings = false;
      }, 350);
    }

    if (electronIpc) {
      try {
        electronIpc.send('toggle-settings-panel', false);
      } catch (e) {}
    } else if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('toggle-settings-panel', false);
      } catch (e) {}
    }
  }
}

function toggleSettingsInfoModal(forceOpen) {
  playRetroSound('click');
  const modal = document.getElementById('settingsInfoModal');
  if (!modal) return;
  if (typeof forceOpen === 'boolean') {
    if (forceOpen) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
  } else {
    modal.classList.toggle('hidden');
  }
}

function onSettingsInfoOverlayClick(event) {
  if (event.target && event.target.id === 'settingsInfoModal') {
    toggleSettingsInfoModal(false);
  }
}

function switchSettingsTab(tabId) {
  playRetroSound('click');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

  const navBtn = document.getElementById(`tabNav${tabId.replace('tab', '')}`);
  if (navBtn) navBtn.classList.add('active');

  const pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');
}

// ==========================================================================
// Multilingual (i18n) & Support Creator Engine (English & Indonesia)
// ==========================================================================
const I18N_DICTIONARY = {
  id: {
    tab_stream: 'Stream',
    tab_display: 'Tampilan',
    tab_donation: 'Donasi',
    tab_controls: 'Kontrol',
    tab_support: 'Support',
    sec_language: 'Pilihan Bahasa / Language',
    hint_language: 'Pilih bahasa antarmuka aplikasi / Select application language',
    sec_support_creator: 'Dukung Streamer & Developer',
    hint_support: 'Dukung terus live streaming dan pengembangan MultiChatStream melalui link resmi di bawah ini:',
    btn_open_yt: 'Buka Channel YouTube',
    btn_open_tako: 'Beri Dukungan di Tako',
    btn_copy: 'Salin Link',
    copied: 'Tersalin!',
    app_info_desc: 'Aplikasi agregator chat & overlay live streaming multi-platform (YouTube, Twitch, TikTok, Discord, Tako, Saweria, Trakteer).',
    creator_note_title: 'Catatan dari Pembuat',
    creator_note_body: 'Ini aplikasi iseng aja, dan dengan niat membantu para sahabat streamer yang baru mulai dengan satu monitor saja. semangat ya!',
    guide_title: 'Guide',
    guide_tag: 'Guide?',
    guide_1_title: 'Simpan Akun Otomatis',
    guide_1_desc: 'Kamu bisa save account Live kamu dengan memberikan username atau nama channel untuk disimpan dan akan otomatis menampilkan chat begitu kamu mulai Live!',
    guide_2_title: 'Tautkan Manual',
    guide_2_desc: 'Kamu juga bisa memakai cara menautkan secara manual dengan mengisi kolom link / username untuk mendapatkan akses obrolan chat yang sama.',
    guide_3_title: 'Collab Stream (Multi-Chat)',
    guide_3_desc: 'Kamu juga bisa menambahkan lebih dari satu live chat, jika kamu ingin collab stream dan menyatukan semua chat dari partner stream kamu dalam satu layar.',
    guide_4_title: 'Panel Donasi Mengambang',
    guide_4_desc: 'Buka panel donasi mengambang untuk memantau alert Tako, Saweria, atau Trakteer, leaderboard donatur, dan media share. Panel dapat dipindah bebas ke mana saja dan dikunci.'
  },
  en: {
    tab_stream: 'Stream',
    tab_display: 'Appearance',
    tab_donation: 'Donations',
    tab_controls: 'Controls',
    tab_support: 'Support',
    sec_language: 'Language Selection / Bahasa',
    hint_language: 'Select application interface language',
    sec_support_creator: 'Support Creator & Developer',
    hint_support: 'Support our live streams and MultiChatStream development via the official links below:',
    btn_open_yt: 'Open YouTube Channel',
    btn_open_tako: 'Send Support on Tako',
    btn_copy: 'Copy Link',
    copied: 'Copied!',
    app_info_desc: 'Multi-platform live streaming chat aggregator & overlay app (YouTube, Twitch, TikTok, Discord, Tako, Saweria, Trakteer).',
    creator_note_title: 'Note from Creator',
    creator_note_body: 'This is just a fun little project made with the intention to help fellow streamers who are just starting out with only a single monitor. Keep up the spirit!',
    guide_title: 'Guide',
    guide_tag: 'Guide?',
    guide_1_title: 'Auto-Save Accounts',
    guide_1_desc: 'Save your live stream accounts by providing your username or channel name. Chat will automatically connect and show messages once you go Live!',
    guide_2_title: 'Manual Link',
    guide_2_desc: 'You can also connect manually by pasting your live link or channel username to get immediate chat access.',
    guide_3_title: 'Collab Stream (Multi-Chat)',
    guide_3_desc: 'Add multiple live stream channels when collaborating with other creators to merge all audience chats into one screen.',
    guide_4_title: 'Floating Donation Panel',
    guide_4_desc: 'Open the floating panel to monitor alerts (Tako, Saweria, Trakteer), donor leaderboards, and media share. Move it anywhere and lock its position.'
  }
};

let currentAppLanguage = 'id';
try {
  const savedLang = localStorage.getItem('multichatstream_language');
  if (savedLang === 'en' || savedLang === 'id') currentAppLanguage = savedLang;
} catch (e) {}

function setAppLanguage(lang) {
  playRetroSound('click');
  if (lang !== 'id' && lang !== 'en') lang = 'id';
  currentAppLanguage = lang;
  try {
    localStorage.setItem('multichatstream_language', lang);
  } catch (e) {}

  applyAppLanguage(lang);
  saveSavedAccountsToStorage();
}

function applyAppLanguage(lang) {
  if (lang !== 'id' && lang !== 'en') lang = 'id';
  const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY['id'];

  const btnId = document.getElementById('btnLangId');
  const btnEn = document.getElementById('btnLangEn');
  if (btnId && btnEn) {
    if (lang === 'id') {
      btnId.classList.add('active');
      btnEn.classList.remove('active');
    } else {
      btnId.classList.remove('active');
      btnEn.classList.add('active');
    }
  }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  const titleEl = document.getElementById('settings-title');
  if (titleEl) {
    titleEl.textContent = 'settings';
  }
}

function openExternalLink(url) {
  playRetroSound('click');
  if (electronIpc && electronIpc.invoke) {
    electronIpc.invoke('open-external-url', url);
  } else if (typeof window !== 'undefined' && window.require) {
    try {
      const { ipcRenderer, shell } = window.require('electron');
      if (shell) shell.openExternal(url);
      else ipcRenderer.invoke('open-external-url', url);
    } catch (e) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function copySupportLink(url, btnElement) {
  playRetroSound('click');
  navigator.clipboard.writeText(url).then(() => {
    const spanEl = btnElement.querySelector('[data-i18n]');
    const origText = spanEl ? spanEl.textContent : btnElement.textContent;
    const isEn = currentAppLanguage === 'en';
    const copiedText = isEn ? '✓ Copied!' : '✓ Tersalin!';
    
    if (spanEl) {
      spanEl.textContent = copiedText;
    } else {
      btnElement.textContent = copiedText;
    }
    btnElement.classList.add('btn-copied');

    setTimeout(() => {
      if (spanEl) {
        spanEl.textContent = origText;
      } else {
        btnElement.textContent = origText;
      }
      btnElement.classList.remove('btn-copied');
    }, 2000);
  }).catch(() => {
    prompt('Link:', url);
  });
}

// --- Orientation / Lock Position & Always-On-Top Controls ---
function toggleLockPosition(val) {
  if (typeof val === 'boolean') {
    state.settings.isLocked = val;
  } else {
    state.settings.isLocked = !state.settings.isLocked;
  }

  playRetroSound('click');

  const lockBtn = document.getElementById('barLockBtn');
  const lockIcon = document.getElementById('lockIcon');
  const lockShackle = document.getElementById('lockShackle');
  const topBar = document.getElementById('topBar');
  const chk = document.getElementById('chkLockPosition');

  if (chk) chk.checked = state.settings.isLocked;

  if (state.settings.isLocked) {
    if (lockBtn) {
      lockBtn.classList.add('locked');
      lockBtn.title = "Posisi Terkunci (Klik untuk membuka kunci)";
    }
    if (lockShackle) {
      lockShackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
    }
    if (lockIcon) lockIcon.textContent = '🔒';
    if (topBar) topBar.classList.add('locked');
    addSystemMessage('🔒 Posisi overlay dikunci.');
  } else {
    if (lockBtn) {
      lockBtn.classList.remove('locked');
      lockBtn.title = "Kunci Posisi (Lock Orientation)";
    }
    if (lockShackle) {
      lockShackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 9.9-1');
    }
    if (lockIcon) lockIcon.textContent = '🔓';
    if (topBar) topBar.classList.remove('locked');
    addSystemMessage('🔓 Posisi overlay dibuka.');
  }

  try {
    localStorage.setItem('livechat_locked', state.settings.isLocked);
  } catch (e) {}

  // Send IPC to Electron
  if (electronIpc) {
    try {
      electronIpc.send('set-window-locked', state.settings.isLocked);
    } catch (e) {}
  } else if (typeof window !== 'undefined' && window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('set-window-locked', state.settings.isLocked);
    } catch (e) {
      console.warn("Electron IPC notice:", e);
    }
  }
}

function toggleAlwaysOnTop(val) {
  if (typeof val === 'boolean') {
    state.settings.alwaysOnTop = val;
  } else {
    state.settings.alwaysOnTop = !state.settings.alwaysOnTop;
  }

  playRetroSound('click');
  const chk = document.getElementById('chkAlwaysOnTop');
  if (chk) chk.checked = state.settings.alwaysOnTop;

  // Send IPC to Electron
  if (window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('set-always-on-top', state.settings.alwaysOnTop);
    } catch (e) {
      console.warn("Electron IPC notice:", e);
    }
  }

  addSystemMessage(state.settings.alwaysOnTop ? '📌 Always-On-Top aktif (selalu di paling depan layar).' : 'Always-On-Top dinonaktifkan.');
}

function minimizeAppWindow() {
  playRetroSound('click');
  if (window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('window-minimize');
      return;
    } catch (e) {
      console.warn("Electron IPC notice:", e);
    }
  }
  const win = document.getElementById('mainWindow');
  if (win) win.classList.add('hidden');
}

function closeAppWindow() {
  playRetroSound('click');
  if (window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('window-close');
      return;
    } catch (e) {
      console.warn("Electron IPC notice:", e);
    }
  }
  window.close();
}

// Compatibility fallbacks
function openConnectModal() {
  switchSettingsTab('tabStreams');
  toggleSettingsModal();
}

function openAboutModal() {
  switchSettingsTab('tabAbout');
  toggleSettingsModal();
}

function closeModal(modalId) {
  closeSettingsModal();
}

function handleUrlKeyPress(e) {
  if (e.key === 'Enter') {
    connectFromInput();
  }
}

function updateStatsDisplay() {
  const barMsgCount = document.getElementById('barMsgCount');
  if (barMsgCount) barMsgCount.textContent = `${state.stats.totalCount} msgs`;
  const statusMsgCount = document.getElementById('statusMsgCount');
  if (statusMsgCount) statusMsgCount.textContent = `${state.stats.totalCount}`;
}

// --- Utility Helpers ---
function getFormattedTime() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function updateStatsDisplay() {
  const el = document.getElementById('statusMsgCount');
  if (el) el.textContent = `Total: ${state.stats.totalCount} msgs`;
  const barMsg = document.getElementById('barMsgCount');
  if (barMsg) barMsg.textContent = `${state.stats.totalCount} msgs`;
}

function updateMsgRate() {
  const now = Date.now();
  // Filter messages in last 5 seconds
  state.stats.recentMsgTimestamps = state.stats.recentMsgTimestamps.filter(t => now - t <= 5000);
  const rate = (state.stats.recentMsgTimestamps.length / 5).toFixed(1);
  const el = document.getElementById('statusRate');
  if (el) el.textContent = `Rate: ${rate} msg/s`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Streamer Account Login & Persistent Config Engine ---
async function loadSavedAccounts() {
  // 1. Try reading from permanent disk config via Electron IPC
  if (electronIpc) {
    try {
      const diskConfig = await electronIpc.invoke('load-config');
      if (diskConfig) {
        if (diskConfig.savedAccounts) state.savedAccounts = { ...state.savedAccounts, ...diskConfig.savedAccounts };
        if (diskConfig.settings) state.settings = { ...state.settings, ...diskConfig.settings };
        if (diskConfig.appearance) state.appearance = { ...state.appearance, ...diskConfig.appearance };
        if (diskConfig.donations) state.donations = { ...state.donations, ...diskConfig.donations };
        if (diskConfig.leaderboard) state.leaderboard = diskConfig.leaderboard;
        if (diskConfig.collabPartners) state.collabPartners = diskConfig.collabPartners;
        if (diskConfig.language) currentAppLanguage = diskConfig.language;
        applyAppLanguage(currentAppLanguage);
        updateSavedAccountsUI();
        updateDonationsUI();
        applyAppearanceToDom();
        renderLeaderboard();
        renderFdwLeaderboard();
        renderCollabUI();
        initFdwDrag();
        return;
      }
    } catch (e) {
      console.warn("Permanent disk config load notice:", e);
    }
  }

  // 2. Fallback to localStorage
  try {
    const raw = localStorage.getItem('livechat_saved_accounts');
    if (raw) {
      const data = JSON.parse(raw);
      state.savedAccounts = { ...state.savedAccounts, ...data };
    }
    const rawDonations = localStorage.getItem('livechat_donations');
    if (rawDonations) {
      state.donations = { ...state.donations, ...JSON.parse(rawDonations) };
    }
    const rawLb = localStorage.getItem('livechat_leaderboard');
    if (rawLb) {
      state.leaderboard = JSON.parse(rawLb);
    }
    const rawCollab = localStorage.getItem('livechat_collab_partners');
    if (rawCollab) {
      state.collabPartners = JSON.parse(rawCollab);
    }
    const rawAppearance = localStorage.getItem('livechat_appearance');
    if (rawAppearance) {
      state.appearance = { ...state.appearance, ...JSON.parse(rawAppearance) };
      applyAppearanceToDom();
    }
    const savedLang = localStorage.getItem('multichatstream_language');
    if (savedLang === 'en' || savedLang === 'id') currentAppLanguage = savedLang;
    applyAppLanguage(currentAppLanguage);
  } catch (e) {
    console.warn("Could not load saved accounts:", e);
  }
  updateSavedAccountsUI();
  updateDonationsUI();
  renderLeaderboard();
  renderFdwLeaderboard();
  renderCollabUI();
  initFdwDrag();
}

function saveSavedAccountsToStorage() {
  // 1. Save to localStorage
  try {
    localStorage.setItem('livechat_saved_accounts', JSON.stringify(state.savedAccounts));
    localStorage.setItem('livechat_donations', JSON.stringify(state.donations));
    localStorage.setItem('livechat_leaderboard', JSON.stringify(state.leaderboard));
    localStorage.setItem('livechat_collab_partners', JSON.stringify(state.collabPartners));
    localStorage.setItem('livechat_appearance', JSON.stringify(state.appearance));
    localStorage.setItem('multichatstream_language', currentAppLanguage);
  } catch (e) {
    console.warn("Could not save accounts to storage:", e);
  }

  // 2. Save permanently to disk via Electron IPC (never wiped on restart)
  if (electronIpc) {
    try {
      const fullConfig = {
        savedAccounts: state.savedAccounts,
        settings: state.settings,
        appearance: state.appearance,
        donations: state.donations,
        leaderboard: state.leaderboard,
        collabPartners: state.collabPartners,
        language: currentAppLanguage
      };
      electronIpc.invoke('save-config', fullConfig);
    } catch (e) {
      console.warn("Error invoking save-config:", e);
    }
  }
}

function updateSavedAccountsUI() {
  const chk = document.getElementById('chkAutoConnectStreams');
  if (chk) chk.checked = state.savedAccounts.autoConnect !== false;

  // Twitch
  const twUser = state.savedAccounts.twitch;
  const accTwUser = document.getElementById('accTwitchUser');
  const accTwStatus = document.getElementById('accTwitchStatus');
  const accTwBtn = document.getElementById('accTwitchBtnText');
  const accTwLogout = document.getElementById('accTwitchLogout');
  if (twUser) {
    if (accTwUser) accTwUser.textContent = `@${twUser}`;
    if (accTwStatus) {
      accTwStatus.textContent = '● Tersimpan';
      accTwStatus.className = 'acc-status-badge connected';
    }
    if (accTwBtn) accTwBtn.textContent = 'Ubah';
    if (accTwLogout) accTwLogout.classList.remove('hidden');
  } else {
    if (accTwUser) accTwUser.textContent = 'Tidak ada akun';
    if (accTwStatus) {
      accTwStatus.textContent = 'Belum Disimpan';
      accTwStatus.className = 'acc-status-badge';
    }
    if (accTwBtn) accTwBtn.textContent = 'Simpan';
    if (accTwLogout) accTwLogout.classList.add('hidden');
  }

  // YouTube
  const ytUser = state.savedAccounts.youtube;
  const accYtUser = document.getElementById('accYtUser');
  const accYtStatus = document.getElementById('accYtStatus');
  const accYtBtn = document.getElementById('accYtBtnText');
  const accYtLogout = document.getElementById('accYtLogout');
  if (ytUser) {
    if (accYtUser) accYtUser.textContent = ytUser.startsWith('@') ? ytUser : `@${ytUser}`;
    if (accYtStatus) {
      accYtStatus.textContent = '● Tersimpan';
      accYtStatus.className = 'acc-status-badge connected';
    }
    if (accYtBtn) accYtBtn.textContent = 'Ubah';
    if (accYtLogout) accYtLogout.classList.remove('hidden');
  } else {
    if (accYtUser) accYtUser.textContent = 'Tidak ada channel';
    if (accYtStatus) {
      accYtStatus.textContent = 'Belum Disimpan';
      accYtStatus.className = 'acc-status-badge';
    }
    if (accYtBtn) accYtBtn.textContent = 'Simpan';
    if (accYtLogout) accYtLogout.classList.add('hidden');
  }

  // TikTok
  const ttUser = state.savedAccounts.tiktok;
  const accTtUser = document.getElementById('accTikTokUser');
  const accTtStatus = document.getElementById('accTikTokStatus');
  const accTtBtn = document.getElementById('accTikTokBtnText');
  const accTtLogout = document.getElementById('accTikTokLogout');
  if (ttUser) {
    if (accTtUser) accTtUser.textContent = `@${ttUser}`;
    if (accTtStatus) {
      accTtStatus.textContent = '● Tersimpan';
      accTtStatus.className = 'acc-status-badge connected';
    }
    if (accTtBtn) accTtBtn.textContent = 'Ubah';
    if (accTtLogout) accTtLogout.classList.remove('hidden');
  } else {
    if (accTtUser) accTtUser.textContent = 'Tidak ada akun';
    if (accTtStatus) {
      accTtStatus.textContent = 'Belum Disimpan';
      accTtStatus.className = 'acc-status-badge';
    }
    if (accTtBtn) accTtBtn.textContent = 'Simpan';
    if (accTtLogout) accTtLogout.classList.add('hidden');
  }

  // Discord
  const dcToken = state.savedAccounts.discordToken;
  const dcChannel = state.savedAccounts.discordChannel;
  const accDcUser = document.getElementById('accDcUser');
  const accDcStatus = document.getElementById('accDcStatus');
  const accDcBtn = document.getElementById('accDcBtnText');
  const accDcLogout = document.getElementById('accDcLogout');
  if (dcToken && dcChannel) {
    if (accDcUser) accDcUser.textContent = `#${dcChannel}`;
    if (accDcStatus) {
      accDcStatus.textContent = '● Tersimpan';
      accDcStatus.className = 'acc-status-badge connected';
    }
    if (accDcBtn) accDcBtn.textContent = 'Ubah';
    if (accDcLogout) accDcLogout.classList.remove('hidden');
  } else {
    if (accDcUser) accDcUser.textContent = 'Tidak ada bot/channel';
    if (accDcStatus) {
      accDcStatus.textContent = 'Belum Disimpan';
      accDcStatus.className = 'acc-status-badge';
    }
    if (accDcBtn) accDcBtn.textContent = 'Simpan';
    if (accDcLogout) accDcLogout.classList.add('hidden');
  }
  // Update submit button visual state
  if (typeof updateSubmitBtnStates === 'function') updateSubmitBtnStates();
}

let currentLoginPlatform = null;

function openLoginModal(platform) {
  playRetroSound('click');
  currentLoginPlatform = platform;
  const modal = document.getElementById('accountLoginModal');
  const title = document.getElementById('loginModalTitle');
  const desc = document.getElementById('loginModalDesc');
  const label = document.getElementById('loginFieldLabel');
  const input = document.getElementById('loginModalInput');
  const tip = document.getElementById('loginModalTip');
  const extraGroup = document.getElementById('discordExtraFields');
  const channelInput = document.getElementById('loginModalChannelInput');

  if (platform === 'twitch') {
    if (extraGroup) extraGroup.classList.add('hidden');
    title.textContent = '👾 Simpan Akun Twitch';
    desc.textContent = 'Masukkan channel Twitch Anda. Chat akan otomatis tersambung saat siaran langsung aktif.';
    label.textContent = 'Username Twitch:';
    input.placeholder = 'contoh: channelname';
    input.value = state.savedAccounts.twitch || '';
    tip.innerHTML = '💡 Tips: Chat Twitch dihubungkan secara real-time via IRC WebSocket.';
  } else if (platform === 'youtube') {
    if (extraGroup) extraGroup.classList.add('hidden');
    title.textContent = '▶ Simpan Akun YouTube';
    desc.textContent = 'Masukkan Handle YouTube atau Channel ID Anda (contoh: @NamaChannel). Aplikasi akan otomatis mendeteksi ketika Anda mulai streaming.';
    label.textContent = 'Handle YouTube:';
    input.placeholder = 'contoh: @StreamerID';
    input.value = state.savedAccounts.youtube || '';
    tip.innerHTML = '💡 Tips: Gunakan format handle dengan tanda @ (contoh: @StreamerName).';
  } else if (platform === 'tiktok') {
    if (extraGroup) extraGroup.classList.add('hidden');
    title.textContent = '🎵 Simpan Akun TikTok';
    desc.textContent = 'Masukkan username TikTok Anda. Saat Anda menyalakan Live, chat akan otomatis tersambung.';
    label.textContent = 'Username TikTok:';
    input.placeholder = 'contoh: username_anda';
    input.value = state.savedAccounts.tiktok || '';
    tip.innerHTML = '💡 Tips: Pastikan akun Anda dapat melakukan siaran langsung publik.';
  } else if (platform === 'discord') {
    if (extraGroup) extraGroup.classList.remove('hidden');
    title.textContent = '🎮 Simpan Akun Discord Bot';
    desc.textContent = 'Hubungkan Discord Gateway untuk membaca pesan chat dari channel server Discord Anda secara real-time.';
    label.textContent = 'Discord Bot Token:';
    input.placeholder = 'Tempel Bot Token Anda (contoh: MTAw...)';
    input.value = state.savedAccounts.discordToken || '';
    if (channelInput) channelInput.value = state.savedAccounts.discordChannel || '';
    tip.innerHTML = '💡 <strong>Panduan Cepat Discord Bot:</strong><br>' +
                    '1. Buka <u>discord.com/developers/applications</u> & buat bot baru.<br>' +
                    '2. Di menu <strong>Bot</strong>, klik <em>Reset Token</em> lalu salin tokennya.<br>' +
                    '3. Aktifkan toggle <strong>MESSAGE CONTENT INTENT</strong> di halaman Bot.<br>' +
                    '4. Invite bot ke server Anda & salin <strong>Channel ID</strong> (klik kanan channel -> Copy Channel ID).';
  }

  if (modal) modal.classList.remove('hidden');
  if (input) {
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }
}

function closeLoginModal() {
  playRetroSound('click');
  const modal = document.getElementById('accountLoginModal');
  const extraGroup = document.getElementById('discordExtraFields');
  if (extraGroup) extraGroup.classList.add('hidden');
  if (modal) modal.classList.add('hidden');
  currentLoginPlatform = null;
}

function saveAccountFromModal() {
  const input = document.getElementById('loginModalInput');
  if (!input || !currentLoginPlatform) return;
  let val = input.value.trim();
  if (!val) {
    alert('Mohon masukkan informasi yang valid.');
    return;
  }

  if (currentLoginPlatform === 'discord') {
    const channelInput = document.getElementById('loginModalChannelInput');
    const channelVal = channelInput ? channelInput.value.replace(/[^0-9]/g, '').trim() : '';
    if (!channelVal) {
      alert('Mohon masukkan Discord Channel ID yang valid (angka numerik)!');
      return;
    }
    state.savedAccounts.discordToken = val;
    state.savedAccounts.discordChannel = channelVal;
    saveSavedAccountsToStorage();
    updateSavedAccountsUI();
    closeLoginModal();
    playRetroSound('connect');
    connectDiscordGateway(state.savedAccounts.discordToken, state.savedAccounts.discordChannel);
    return;
  }

  // Clean up format
  if (currentLoginPlatform === 'twitch') {
    val = val.replace(/^@/, '').toLowerCase().trim();
  } else if (currentLoginPlatform === 'youtube') {
    if (!val.startsWith('@') && !val.startsWith('UC') && !val.includes('youtube.com')) {
      val = `@${val}`;
    }
  } else if (currentLoginPlatform === 'tiktok') {
    val = val.replace(/^@/, '').trim();
  }

  state.savedAccounts[currentLoginPlatform] = val;
  saveSavedAccountsToStorage();
  updateSavedAccountsUI();
  updateSubmitBtnStates();
  closeLoginModal();
  playRetroSound('connect');

  // Immediately connect this platform stream
  connectSavedAccountStream(currentLoginPlatform, val);
}

function logoutAccount(platform) {
  playRetroSound('click');
  if (!confirm(`Hapus akun ${platform.toUpperCase()} tersimpan?`)) return;
  if (platform === 'discord') {
    state.savedAccounts.discordToken = '';
    state.savedAccounts.discordChannel = '';
  } else {
    state.savedAccounts[platform] = '';
  }
  saveSavedAccountsToStorage();
  updateSavedAccountsUI();
  addSystemMessage(`Akun ${platform.toUpperCase()} tersimpan telah dihapus.`);
}

function toggleAutoConnectSetting(enabled) {
  playRetroSound('click');
  state.savedAccounts.autoConnect = enabled;
  saveSavedAccountsToStorage();
}

function connectSavedAccountStream(platform, identifier) {
  if (platform === 'twitch') {
    connectTwitchIrc(identifier);
  } else if (platform === 'youtube') {
    if (identifier.startsWith('@') || identifier.startsWith('UC')) {
      connectYouTubeChannelOrHandle(identifier);
    } else {
      connectYouTubeStream(identifier);
    }
  } else if (platform === 'tiktok') {
    connectTikTokStream(identifier);
  } else if (platform === 'discord') {
    if (state.savedAccounts.discordToken && state.savedAccounts.discordChannel) {
      connectDiscordGateway(state.savedAccounts.discordToken, state.savedAccounts.discordChannel);
    }
  }
}

function autoConnectSavedAccountsOnStartup() {
  if (state.savedAccounts.autoConnect === false) return;
  let connectedAny = false;
  if (state.savedAccounts.twitch) {
    connectTwitchIrc(state.savedAccounts.twitch);
    connectedAny = true;
  }
  if (state.savedAccounts.youtube) {
    connectYouTubeChannelOrHandle(state.savedAccounts.youtube);
    connectedAny = true;
  }
  if (state.savedAccounts.tiktok) {
    connectTikTokStream(state.savedAccounts.tiktok, true);
    connectedAny = true;
  }
  if (state.savedAccounts.discordToken && state.savedAccounts.discordChannel) {
    connectDiscordGateway(state.savedAccounts.discordToken, state.savedAccounts.discordChannel, true);
    connectedAny = true;
  }
  if (connectedAny) {
    addSystemMessage(`⚡ Auto-Connect: Memantau akun streaming tersimpan...`);
  }
}

// --- Refresh Chat Feature (🔄) ---
function refreshChat() {
  playRetroSound('click');
  const btn = document.getElementById('barRefreshBtn');
  if (btn) btn.classList.add('spinning');

  addSystemMessage(`🔄 Menyegarkan koneksi stream chat...`);

  // Clear deduplication cache
  clientRecentMsgs.clear();

  // Snapshot active connections
  const currentStreams = [...state.activeStreams];
  disconnectAllStreams();

  setTimeout(() => {
    if (currentStreams.length > 0) {
      currentStreams.forEach(s => {
        if (s.platform === 'twitch') {
          connectTwitchIrc(s.channelOrId.replace(/^#/, ''), s.url, s.collabPartner);
        } else if (s.platform === 'youtube') {
          if (s.cleanId || s.channelOrId.startsWith('@') || s.channelOrId.startsWith('UC')) {
            connectYouTubeChannelOrHandle(s.cleanId || s.channelOrId.split(' ')[0], s.collabPartner);
          } else {
            connectYouTubeStream(s.channelOrId.split(' ')[0], s.url, s.collabPartner);
          }
        } else if (s.platform === 'tiktok') {
          connectTikTokStream(s.cleanUser || s.channelOrId.replace(/^@/, '').split(' ')[0], true, s.collabPartner);
        } else if (s.platform === 'discord') {
          connectDiscordGateway(s.token || state.savedAccounts.discordToken, s.channelId || state.savedAccounts.discordChannel, true, s.collabPartner);
        }
      });
    } else {
      autoConnectSavedAccountsOnStartup();
    }

    if (btn) {
      setTimeout(() => btn.classList.remove('spinning'), 700);
    }
    playRetroSound('connect');
    addSystemMessage(`✅ Koneksi chat berhasil diperbarui.`);
  }, 400);
}

// --- Discord Gateway WebSocket Client Engine (v10) ---
function connectDiscordGateway(token, targetChannelId, isAutoConnect = false, collabPartner = null) {
  token = String(token || '').trim();
  targetChannelId = String(targetChannelId || '').replace(/[^0-9]/g, '').trim();

  if (!token || !targetChannelId) {
    if (!isAutoConnect) alert('Bot Token dan Channel ID Discord wajib diisi!');
    return;
  }

  // Prevent duplicate connections to the same channel with same collab status
  const existing = state.activeStreams.find(s => s.platform === 'discord' && s.channelId === targetChannelId && s.collabPartner === collabPartner);
  if (existing) {
    if (!isAutoConnect) addSystemMessage(`Discord channel #${targetChannelId} sudah terhubung.`);
    return;
  }

  const streamId = `dc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  let ws = null;
  let heartbeatTimer = null;
  let lastSequence = null;

  const streamObj = {
    id: streamId,
    platform: 'discord',
    channelOrId: `#${targetChannelId} (Connecting...)`,
    channelId: targetChannelId,
    token: token,
    url: `https://discord.com/channels/@me/${targetChannelId}`,
    ws: null,
    heartbeatInterval: null,
    botUser: 'Discord Bot',
    botId: null,
    collabPartner: collabPartner || null
  };

  try {
    ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    streamObj.ws = ws;
  } catch (err) {
    console.error('Failed to instantiate Discord WebSocket:', err);
    addSystemMessage(`❌ [Discord] Gagal membuka koneksi WebSocket: ${err.message}`);
    return;
  }

  ws.onopen = () => {
    console.log('[Discord Gateway] WebSocket connection opened.');
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const { op, d, s, t } = payload;

      if (s !== null && s !== undefined) {
        lastSequence = s;
      }

      // Opcode 10: HELLO -> Start Heartbeat & Send Identify
      if (op === 10) {
        const heartbeatInterval = d.heartbeat_interval;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        
        heartbeatTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 1, d: lastSequence }));
          }
        }, heartbeatInterval);
        streamObj.heartbeatInterval = heartbeatTimer;

        // Send Opcode 2: IDENTIFY with GUILDS (1) + GUILD_MESSAGES (512) + MESSAGE_CONTENT (32768) = 33280
        const identifyPayload = {
          op: 2,
          d: {
            token: token,
            intents: 33280,
            properties: {
              os: 'windows',
              browser: 'livechat-pro',
              device: 'livechat-pro'
            }
          }
        };
        ws.send(JSON.stringify(identifyPayload));
      }

      // Opcode 1: HEARTBEAT requested by server
      else if (op === 1) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 1, d: lastSequence }));
        }
      }

      // Opcode 7: RECONNECT requested by server
      else if (op === 7) {
        console.log('[Discord Gateway] Server requested reconnect.');
        ws.close();
      }

      // Opcode 9: INVALID_SESSION
      else if (op === 9) {
        console.warn('[Discord Gateway] Invalid session received.');
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              op: 2,
              d: {
                token: token,
                intents: 33280,
                properties: { os: 'windows', browser: 'livechat-pro', device: 'livechat-pro' }
              }
            }));
          }
        }, 1500);
      }

      // Opcode 0: DISPATCH
      else if (op === 0) {
        if (t === 'READY') {
          streamObj.botUser = d.user ? d.user.username : 'Bot';
          streamObj.botId = d.user ? d.user.id : null;
          streamObj.channelOrId = `#${targetChannelId} (${streamObj.botUser})`;
          updateConnectedStreamsUI();
          playRetroSound('connect');
          addSystemMessage(`🎮 [Discord] Terhubung sebagai ${streamObj.botUser}! Memantau channel #${targetChannelId}`);
        } else if (t === 'MESSAGE_CREATE') {
          // Check if message belongs to target channel
          if (d.channel_id !== targetChannelId) return;

          // Ignore messages sent by this bot itself to avoid echoes
          if (streamObj.botId && d.author && d.author.id === streamObj.botId) return;

          const authorName = (d.member && d.member.nick) || (d.author && (d.author.global_name || d.author.username)) || 'Discord User';
          let content = d.content || '';

          // Attachments (Images)
          if (d.attachments && d.attachments.length > 0) {
            d.attachments.forEach(att => {
              if (att.content_type && att.content_type.startsWith('image/')) {
                content += (content ? ' ' : '') + `[STICKER:${encodeURIComponent(att.url)}:Image]`;
              }
            });
          }

          // Stickers
          if (d.sticker_items && d.sticker_items.length > 0) {
            d.sticker_items.forEach(stk => {
              const stkUrl = `https://media.discordapp.net/stickers/${stk.id}.png?size=160`;
              content += (content ? ' ' : '') + `[STICKER:${encodeURIComponent(stkUrl)}:${encodeURIComponent(stk.name || 'Sticker')}]`;
            });
          }

          if (!content) return;

          addChatMessage({
            platform: 'discord',
            username: authorName,
            text: content,
            collabPartner: streamObj.collabPartner
          });
        }
      }
    } catch (err) {
      console.warn('[Discord Gateway] Error parsing payload:', err);
    }
  };

  ws.onerror = (e) => {
    console.error('[Discord Gateway] WebSocket error:', e);
  };

  ws.onclose = (event) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log(`[Discord Gateway] Disconnected (code: ${event.code}, reason: ${event.reason})`);

    // Handle authentication or intent permission failure
    if (event.code === 4004) {
      addSystemMessage('❌ [Discord] Gagal login: Bot Token tidak valid. Periksa token Anda di Discord Developer Portal.');
      disconnectStream(streamId);
      return;
    } else if (event.code === 4014) {
      addSystemMessage('❌ [Discord] Disallowed Intent: Aktifkan "MESSAGE CONTENT INTENT" di halaman Bot pada Discord Developer Portal!');
      disconnectStream(streamId);
      return;
    }

    // Auto-reconnect if still in activeStreams
    if (state.activeStreams.some(s => s.id === streamId)) {
      console.log('[Discord Gateway] Reconnecting in 5 seconds...');
      setTimeout(() => {
        if (state.activeStreams.some(s => s.id === streamId)) {
          state.activeStreams = state.activeStreams.filter(s => s.id !== streamId);
          connectDiscordGateway(token, targetChannelId, true);
        }
      }, 5000);
    }
  };

  state.activeStreams.push(streamObj);
  updateConnectedStreamsUI();
}

// --- YouTube Smart Auto-Detect Live Resolver ---
function connectYouTubeChannelOrHandle(channelOrHandle, collabPartner = null) {
  const cleanId = channelOrHandle.replace(/[\/\?].*$/, '');
  const url = cleanId.startsWith('@') 
    ? `https://www.youtube.com/${cleanId}/live` 
    : `https://www.youtube.com/channel/${cleanId}/live`;

  const streamObj = {
    id: `yt-channel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platform: 'youtube',
    channelOrId: `${cleanId} (Memeriksa...)`,
    cleanId: cleanId,
    url: url,
    isStandby: false,
    collabPartner: collabPartner || null
  };

  // Check if already connected with same collab status
  if (state.activeStreams.some(s => s.cleanId === cleanId && s.collabPartner === collabPartner)) return;

  state.activeStreams.push(streamObj);
  updateConnectedStreamsUI();
  addSystemMessage(`Memantau YouTube Live Channel ${cleanId}...`);

  resolveAndConnectYouTubeLiveChat(cleanId, url, streamObj);
}

async function resolveAndConnectYouTubeLiveChat(channelIdentifier, liveUrl, streamObj) {
  let isChecking = false;

  async function checkLiveStatus() {
    if (isChecking) return false;
    isChecking = true;
    try {
      const res = await fetch(liveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      const html = await res.text();

      // Check if actually live: look for videoId with live indicator or liveChatRenderer
      let liveVideoId = null;
      const vidMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const isLiveFlag = html.includes('"isLive":true') || html.includes('"isLiveContent":true') || html.includes('BADGE_STYLE_TYPE_LIVE_NOW') || html.includes('liveChatRenderer');

      if (vidMatch && vidMatch[1] && isLiveFlag) {
        liveVideoId = vidMatch[1];
      }

      if (liveVideoId) {
        if (streamObj.standbyCheckInterval) {
          clearInterval(streamObj.standbyCheckInterval);
          streamObj.standbyCheckInterval = null;
        }
        streamObj.isStandby = false;
        streamObj.channelOrId = `${channelIdentifier} (Live: ${liveVideoId})`;
        updateConnectedStreamsUI();
        addSystemMessage(`🔴 [YouTube] Terdeteksi LIVE aktif untuk ${channelIdentifier} [ID: ${liveVideoId}]. Menghubungkan live chat...`);
        startYouTubeRealtimeFetcher(liveVideoId, streamObj);
        return true;
      }
    } catch (e) {
      console.warn("YouTube channel resolver notice:", e);
    } finally {
      isChecking = false;
    }
    return false;
  }

  // Initial check
  const isLiveNow = await checkLiveStatus();
  if (!isLiveNow) {
    streamObj.isStandby = true;
    streamObj.channelOrId = `${channelIdentifier} (Standby)`;
    updateConnectedStreamsUI();
    addSystemMessage(`⏳ [YouTube] Channel ${channelIdentifier} standby: otomatis tersambung saat live dimulai.`);

    // Periodic standby check loop every 20 seconds
    if (streamObj.standbyCheckInterval) clearInterval(streamObj.standbyCheckInterval);
    streamObj.standbyCheckInterval = setInterval(async () => {
      if (!state.activeStreams.some(s => s.id === streamObj.id)) {
        clearInterval(streamObj.standbyCheckInterval);
        return;
      }
      if (streamObj.isStandby) {
        await checkLiveStatus();
      }
    }, 20000);
  }
}

// ==========================================================================
// Collab Stream (Multi-Chat Partner) Management Engine
// ==========================================================================
function openCollabModal() {
  playRetroSound('click');
  const modal = document.getElementById('collabModal');
  if (modal) modal.classList.remove('hidden');
  renderCollabUI();
  const idInput = document.getElementById('collabIdentifierInput');
  if (idInput) {
    setTimeout(() => {
      idInput.focus();
      idInput.select();
    }, 60);
  }
}

function closeCollabModal() {
  playRetroSound('click');
  const modal = document.getElementById('collabModal');
  if (modal) modal.classList.add('hidden');
}

function onCollabPlatformChange(platform) {
  playRetroSound('click');
  const label = document.getElementById('collabIdentifierLabel');
  const input = document.getElementById('collabIdentifierInput');
  const tip = document.getElementById('collabModalTip');

  if (platform === 'youtube') {
    if (label) label.textContent = 'Handle YouTube / Channel ID / URL Live:';
    if (input) input.placeholder = 'contoh: @PartnerHandle atau link live';
    if (tip) tip.innerHTML = '💡 Tips: Masukkan handle channel (@nama) atau URL siaran live partner Anda.';
  } else if (platform === 'twitch') {
    if (label) label.textContent = 'Username Twitch Partner:';
    if (input) input.placeholder = 'contoh: partner_channel';
    if (tip) tip.innerHTML = '💡 Tips: Masukkan username Twitch channel partner Anda (tersambung via IRC).';
  } else if (platform === 'tiktok') {
    if (label) label.textContent = 'Username TikTok Partner:';
    if (input) input.placeholder = 'contoh: username_partner';
    if (tip) tip.innerHTML = '💡 Tips: Masukkan username TikTok partner tanpa tanda @.';
  } else if (platform === 'discord') {
    if (label) label.textContent = 'Discord Channel ID Partner:';
    if (input) input.placeholder = 'contoh: 123456789012345678 (17-20 digit)';
    if (tip) tip.innerHTML = '💡 Tips: Masukkan Channel ID Discord (klik kanan channel -> Copy Channel ID). Memerlukan bot token terpasang.';
  }
}

function addCollabStreamFromModal() {
  const select = document.getElementById('collabPlatformSelect');
  const nameInput = document.getElementById('collabPartnerNameInput');
  const idInput = document.getElementById('collabIdentifierInput');

  const platform = select ? select.value : 'youtube';
  let partnerName = nameInput ? nameInput.value.trim() : '';
  const rawIdentifier = idInput ? idInput.value.trim() : '';

  if (!rawIdentifier) {
    alert('Mohon masukkan username, handle, atau URL stream partner!');
    return;
  }

  if (!partnerName) {
    // Default partner name based on identifier
    partnerName = rawIdentifier.replace(/^@/, '').split('/')[0].split('?')[0];
    if (partnerName.length > 15) partnerName = partnerName.substring(0, 15);
  }

  playRetroSound('connect');

  if (platform === 'youtube') {
    if (rawIdentifier.includes('watch?v=') || rawIdentifier.includes('youtu.be/') || rawIdentifier.includes('/live/') || rawIdentifier.length === 11) {
      const vMatch = rawIdentifier.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || 
                     rawIdentifier.match(/\/live\/([a-zA-Z0-9_-]{11})/) || 
                     rawIdentifier.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      const vidId = vMatch ? vMatch[1] : (rawIdentifier.length === 11 ? rawIdentifier : rawIdentifier);
      connectYouTubeStream(vidId, rawIdentifier, partnerName);
    } else {
      connectYouTubeChannelOrHandle(rawIdentifier, partnerName);
    }
  } else if (platform === 'twitch') {
    const cleanTwitch = rawIdentifier.replace(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\//i, '').replace(/^#/, '').toLowerCase().trim();
    connectTwitchIrc(cleanTwitch, null, partnerName);
  } else if (platform === 'tiktok') {
    const cleanTt = rawIdentifier.replace(/^@/, '').replace(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@?/i, '').split('/')[0].trim();
    connectTikTokStream(cleanTt, false, partnerName);
  } else if (platform === 'discord') {
    const cleanDc = rawIdentifier.replace(/[^0-9]/g, '').trim();
    if (!state.savedAccounts.discordToken) {
      alert('Untuk Discord, mohon atur Discord Bot Token Anda terlebih dahulu di tab Stream -> Discord!');
      return;
    }
    connectDiscordGateway(state.savedAccounts.discordToken, cleanDc, false, partnerName);
  }

  // Save to persistent collab profiles
  if (!state.collabPartners) state.collabPartners = [];
  const existingIdx = state.collabPartners.findIndex(p => p.platform === platform && p.identifier === rawIdentifier);
  if (existingIdx !== -1) {
    state.collabPartners[existingIdx].partnerName = partnerName;
  } else {
    state.collabPartners.push({ platform, partnerName, identifier: rawIdentifier });
  }
  saveSavedAccountsToStorage();

  // Clear identifier input for adding another
  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';

  addSystemMessage(`🤝 Stream partner [${partnerName}] (${platform.toUpperCase()}) berhasil ditambahkan ke collab feed!`);
  renderCollabUI();
}

function disconnectCollabStream(streamId) {
  disconnectStream(streamId);
  renderCollabUI();
}

function clearAllCollabStreams() {
  const collabStreams = state.activeStreams.filter(s => Boolean(s.collabPartner));
  if (collabStreams.length === 0) return;
  collabStreams.forEach(s => disconnectStream(s.id));
  renderCollabUI();
  addSystemMessage('🤝 Semua stream partner collab telah diputuskan.');
}

function renderCollabUI() {
  const collabStreams = state.activeStreams.filter(s => Boolean(s.collabPartner));
  const countBadge = document.getElementById('collabCountBadge');
  if (countBadge) {
    countBadge.textContent = collabStreams.length;
    countBadge.style.display = collabStreams.length > 0 ? 'inline-flex' : 'none';
  }

  const listModal = document.getElementById('collabActiveListInModal');
  const listSettings = document.getElementById('collabStreamsList');

  const renderContent = () => {
    if (collabStreams.length === 0) {
      return '<span class="no-streams-notice">Belum ada partner collab yang terhubung.</span>';
    }
    return collabStreams.map(s => {
      const isYt = s.platform === 'youtube';
      const isTt = s.platform === 'tiktok';
      const isDc = s.platform === 'discord';
      const badgeClass = isYt ? 'yt' : (isTt ? 'tt' : (isDc ? 'dc' : 'tw'));
      const badgeText = isYt ? 'YT' : (isTt ? 'TT' : (isDc ? 'DC' : 'TW'));
      return `
        <div class="collab-stream-card">
          <div class="collab-stream-card-left">
            <span class="chat-badge ${badgeClass}">[${badgeText}]</span>
            <div class="collab-channel-info">
              <span class="collab-partner-tag">🤝 ${escapeHtml(s.collabPartner || 'Partner')}</span>
              <span>${escapeHtml(s.channelOrId || '')}</span>
            </div>
          </div>
          <button class="btn-micro" onclick="disconnectCollabStream('${s.id}')" title="Putuskan stream partner">✕</button>
        </div>
      `;
    }).join('');
  };

  const html = renderContent();
  if (listModal) listModal.innerHTML = html;
  if (listSettings) listSettings.innerHTML = html;
}

// ==========================================================================
// Donation, Medser (Media Share), & Leaderboard System (Tako & Saweria Ready)
// ==========================================================================
let donationAlertTimer = null;
let medserAlertTimer = null;

function showDonationAlert({ platform = 'SAWERIA', donor = 'Donatur', amount = 'Rp 10.000', message = 'Semangat streaming!' }) {
  if (state.donations.alertEnabled === false) return;

  playRetroSound('donation');

  // Broadcast to standalone donation windows
  if (electronIpc) {
    electronIpc.send('broadcast-donation-event', {
      platform, donor, amount, message
    });
  }

  // Record to session leaderboard
  recordDonationToLeaderboard(donor, amount);
}

function showMedserAlert({ donor = 'Donatur', title = 'Video Media Share', amount = 'Rp 20.000', duration = '01:30' }) {
  if (state.donations.medserEnabled === false) return;

  playRetroSound('donation');

  // Broadcast to standalone donation windows
  if (electronIpc) {
    electronIpc.send('broadcast-medser-event', {
      donor, title, amount, duration
    });
  }
}

function recordDonationToLeaderboard(donor, amountStr) {
  if (!donor) return;
  let numeric = 0;
  const numMatch = String(amountStr).replace(/[^0-9]/g, '');
  if (numMatch) numeric = parseInt(numMatch, 10);

  const existing = state.leaderboard.find(item => item.donor.toLowerCase() === donor.toLowerCase());
  if (existing) {
    existing.totalNumeric = (existing.totalNumeric || 0) + numeric;
    existing.displayTotal = existing.totalNumeric > 0 ? `Rp ${existing.totalNumeric.toLocaleString('id-ID')}` : amountStr;
    existing.count = (existing.count || 1) + 1;
  } else {
    state.leaderboard.push({
      donor: donor,
      totalNumeric: numeric,
      displayTotal: numeric > 0 ? `Rp ${numeric.toLocaleString('id-ID')}` : amountStr,
      count: 1
    });
  }

  // Broadcast updated leaderboard to standalone donation window
  if (electronIpc) {
    electronIpc.send('broadcast-leaderboard-update', state.leaderboard);
  }

  // Sort descending by totalNumeric
  state.leaderboard.sort((a, b) => (b.totalNumeric || 0) - (a.totalNumeric || 0));

  saveSavedAccountsToStorage();
  renderLeaderboard();
  renderFdwLeaderboard();
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboardContainer');
  const badge = document.getElementById('leaderboardBadge');
  if (badge) badge.textContent = state.leaderboard.length;

  if (!container) return;
  if (state.leaderboard.length === 0) {
    container.innerHTML = `<div class="empty-leaderboard-msg">Belum ada donasi tercatat sesi ini.</div>`;
    return;
  }

  const ranks = ['🥇', '🥈', '🥉'];
  container.innerHTML = state.leaderboard.slice(0, 10).map((item, idx) => {
    const rankLabel = ranks[idx] || `#${idx + 1}`;
    return `
      <div class="leaderboard-item">
        <span class="leaderboard-rank">${rankLabel}</span>
        <span class="leaderboard-donor">${escapeHtml(item.donor)}</span>
        <span class="leaderboard-total">${escapeHtml(item.displayTotal)}</span>
      </div>
    `;
  }).join('');
}

function toggleLeaderboardDrawer() {
  playRetroSound('click');
  const drawer = document.getElementById('leaderboardDrawer');
  if (drawer) drawer.classList.toggle('hidden');
}

function clearLeaderboard() {
  playRetroSound('click');
  if (!confirm('Reset leaderboard donatur sesi ini?')) return;
  state.leaderboard = [];
  saveSavedAccountsToStorage();
  renderLeaderboard();
  renderFdwLeaderboard();
  addSystemMessage('Leaderboard donatur telah di-reset.');
}

// Test Simulation Functions for Donasi & Medser
function triggerTestDonationAlert(type = 'saweria') {
  playRetroSound('click');
  const mockDonors = ['SultanStream', 'BudiSantoso', 'GamerSejati', 'WindahFans', 'Anonim99'];
  const mockMessages = ['Semangat live-nya bang!', 'GG gaming!', 'Donasi kopi dulu ☕', 'Keren banget overlay barunya!'];
  const mockAmounts = ['Rp 10.000', 'Rp 25.000', 'Rp 50.000', 'Rp 100.000'];

  const donor = mockDonors[Math.floor(Math.random() * mockDonors.length)];
  const msg = mockMessages[Math.floor(Math.random() * mockMessages.length)];
  const amount = mockAmounts[Math.floor(Math.random() * mockAmounts.length)];

  showDonationAlert({
    platform: type.toUpperCase(),
    donor: donor,
    amount: amount,
    message: msg
  });

  addChatMessage({
    platform: type === 'saweria' ? 'youtube' : 'tiktok',
    username: donor,
    text: `🎁 [${type.toUpperCase()} ${amount}] ${msg}`
  });
}

function triggerTestMedserAlert() {
  playRetroSound('click');
  const mockVideos = ['DJ Desa Remix 2026', 'NCS - Spectre (Live)', 'Anime Opening Compilation', 'Epic Sound Effect HQ'];
  const mockDonors = ['Budi', 'RianGamer', 'Dewi', 'Alex'];
  const donor = mockDonors[Math.floor(Math.random() * mockDonors.length)];
  const title = mockVideos[Math.floor(Math.random() * mockVideos.length)];

  showMedserAlert({
    donor: donor,
    title: title,
    amount: 'Rp 25.000',
    duration: '01:45'
  });
}

function triggerTestLeaderboardUpdate() {
  playRetroSound('click');
  triggerTestDonationAlert('saweria');
}

function toggleDonationAlertSetting(val) {
  state.donations.alertEnabled = val;
  saveSavedAccountsToStorage();
}

function toggleMedserAlertSetting(val) {
  state.donations.medserEnabled = val;
  saveSavedAccountsToStorage();
}

function toggleLeaderboardSetting(val) {
  state.donations.leaderboardEnabled = val;
  saveSavedAccountsToStorage();
}

function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

function applyDonationOverlays() {
  // Overlays are managed by standalone floating donation windows, keeping chat 100% clean
  updateDonationBadges();
}

function updateDonationBadges() {
  const takoBadge = document.getElementById('takoStatusBadge');
  const saweriaBadge = document.getElementById('saweriaStatusBadge');
  const customBadge = document.getElementById('customStatusBadge');

  const takoUrl = (state.donations && state.donations.takoUrl) ? state.donations.takoUrl.trim() : '';
  const takoMedserUrl = (state.donations && state.donations.takoMedserUrl) ? state.donations.takoMedserUrl.trim() : '';
  const saweriaUrl = (state.donations && state.donations.saweriaUrl) ? state.donations.saweriaUrl.trim() : '';
  const saweriaMedserUrl = (state.donations && state.donations.saweriaMedserUrl) ? state.donations.saweriaMedserUrl.trim() : '';
  const customUrl = (state.donations && state.donations.customUrl) ? state.donations.customUrl.trim() : '';

  if (takoBadge) {
    if ((takoUrl && isValidHttpUrl(takoUrl)) || (takoMedserUrl && isValidHttpUrl(takoMedserUrl))) {
      takoBadge.className = 'overlay-status-badge active';
      takoBadge.textContent = '🟢 Aktif (Live)';
    } else {
      takoBadge.className = 'overlay-status-badge inactive';
      takoBadge.textContent = '⚪ Belum disetel';
    }
  }

  if (saweriaBadge) {
    if ((saweriaUrl && isValidHttpUrl(saweriaUrl)) || (saweriaMedserUrl && isValidHttpUrl(saweriaMedserUrl))) {
      saweriaBadge.className = 'overlay-status-badge active';
      saweriaBadge.textContent = '🟢 Aktif (Live)';
    } else {
      saweriaBadge.className = 'overlay-status-badge inactive';
      saweriaBadge.textContent = '⚪ Belum disetel';
    }
  }

  if (customBadge) {
    if (customUrl && isValidHttpUrl(customUrl)) {
      customBadge.className = 'overlay-status-badge active';
      customBadge.textContent = '🟢 Aktif (Live)';
    } else {
      customBadge.className = 'overlay-status-badge inactive';
      customBadge.textContent = '⚪ Belum disetel';
    }
  }
}

let donationInputDebounce = null;
function onDonationUrlInputChanged() {
  const saweriaInput = document.getElementById('saweriaOverlayUrl');
  const saweriaMedserInput = document.getElementById('saweriaMedserOverlayUrl');
  const takoInput = document.getElementById('takoOverlayUrl');
  const takoMedserInput = document.getElementById('takoMedserOverlayUrl');
  const customInput = document.getElementById('customOverlayUrl');

  if (saweriaInput) state.donations.saweriaUrl = saweriaInput.value.trim();
  if (saweriaMedserInput) state.donations.saweriaMedserUrl = saweriaMedserInput.value.trim();
  if (takoInput) state.donations.takoUrl = takoInput.value.trim();
  if (takoMedserInput) state.donations.takoMedserUrl = takoMedserInput.value.trim();
  if (customInput) state.donations.customUrl = customInput.value.trim();

  updateDonationBadges();

  if (donationInputDebounce) clearTimeout(donationInputDebounce);
  donationInputDebounce = setTimeout(() => {
    saveDonationIntegrationUrls(false);
  }, 600);
}

function saveDonationIntegrationUrls(showFeedback = true) {
  const saweriaInput = document.getElementById('saweriaOverlayUrl');
  const saweriaMedserInput = document.getElementById('saweriaMedserOverlayUrl');
  const takoInput = document.getElementById('takoOverlayUrl');
  const takoMedserInput = document.getElementById('takoMedserOverlayUrl');
  const customInput = document.getElementById('customOverlayUrl');

  if (saweriaInput) state.donations.saweriaUrl = saweriaInput.value.trim();
  if (saweriaMedserInput) state.donations.saweriaMedserUrl = saweriaMedserInput.value.trim();
  if (takoInput) state.donations.takoUrl = takoInput.value.trim();
  if (takoMedserInput) state.donations.takoMedserUrl = takoMedserInput.value.trim();
  if (customInput) state.donations.customUrl = customInput.value.trim();

  saveSavedAccountsToStorage();
  applyDonationOverlays();

  // Sync URLs to all open standalone floating donation windows
  if (electronIpc) {
    electronIpc.send('broadcast-donation-urls', state.donations);
  }

  if (showFeedback) {
    playRetroSound('connect');
    let activeNames = [];
    if (state.donations.takoUrl || state.donations.takoMedserUrl) activeNames.push('Tako');
    if (state.donations.saweriaUrl || state.donations.saweriaMedserUrl) activeNames.push('Saweria');
    if (state.donations.customUrl) activeNames.push('Custom');

    if (activeNames.length > 0) {
      addSystemMessage(`✅ Pengaturan URL ${activeNames.join(' & ')} tersimpan dan disinkronkan ke panel!`);
    } else {
      addSystemMessage('Pengaturan URL overlay donasi tersimpan.');
    }
  }
}

function reloadAllDonationOverlays() {
  playRetroSound('click');
  if (electronIpc) {
    electronIpc.send('broadcast-donation-urls', state.donations);
  }
  updateDonationBadges();
  addSystemMessage('🔄 Pengaturan dan panel donasi dimuat ulang.');
}

function updateDonationsUI() {
  const chkAlert = document.getElementById('chkDonationAlert');
  const chkMedser = document.getElementById('chkMedserAlert');
  const chkLb = document.getElementById('chkLeaderboard');
  const saweriaInput = document.getElementById('saweriaOverlayUrl');
  const saweriaMedserInput = document.getElementById('saweriaMedserOverlayUrl');
  const takoInput = document.getElementById('takoOverlayUrl');
  const takoMedserInput = document.getElementById('takoMedserOverlayUrl');
  const customInput = document.getElementById('customOverlayUrl');

  if (chkAlert) chkAlert.checked = state.donations.alertEnabled !== false;
  if (chkMedser) chkMedser.checked = state.donations.medserEnabled !== false;
  if (chkLb) chkLb.checked = state.donations.leaderboardEnabled !== false;
  if (saweriaInput && state.donations.saweriaUrl) saweriaInput.value = state.donations.saweriaUrl;
  if (saweriaMedserInput && state.donations.saweriaMedserUrl) saweriaMedserInput.value = state.donations.saweriaMedserUrl;
  if (takoInput && state.donations.takoUrl) takoInput.value = state.donations.takoUrl;
  if (takoMedserInput && state.donations.takoMedserUrl) takoMedserInput.value = state.donations.takoMedserUrl;
  if (customInput && state.donations.customUrl) customInput.value = state.donations.customUrl;

  applyDonationOverlays();
}
