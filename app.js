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
    alwaysOnTop: true
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
    bubblePadding: 5,
    bubbleGap: 5,
    bubbleBorder: true,
    bubbleBorderColor: '#ffffff',
    bubbleBorderOpacity: 16
  },
  filters: {
    yt: true,
    tw: true,
    tt: true,
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
    autoConnect: true
  }
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
      addChatMessage({
        platform: 'tiktok',
        username: data.username || data.uniqueId,
        text: data.comment
      });
    });

    electronIpc.on('tiktok-gift', (event, data) => {
      const giftCount = data.repeatCount ? `x${data.repeatCount}` : '';
      addChatMessage({
        platform: 'tiktok',
        username: data.username || data.uniqueId,
        text: `🎁 Mengirim Gift ${data.giftName || 'Gift'} ${giftCount}! 🎉`
      });
    });

    electronIpc.on('tiktok-status', (event, data) => {
      if (data.status === 'connected') {
        addSystemMessage(`✅ [TikTok] Berhasil terhubung ke live chat @${data.username} (Room ID: ${data.roomId})! Menunggu komentar penonton...`);
        const stream = state.activeStreams.find(s => s.id === data.streamId);
        if (stream) {
          stream.channelOrId = `@${data.username} (Live)`;
          updateConnectedStreamsUI();
        }
      } else if (data.status === 'error') {
        let errDesc = data.error || 'Gagal terhubung';
        if (errDesc.includes('LIVE has ended') || errDesc.includes('offline') || errDesc.includes('not found') || errDesc.includes('404')) {
          addSystemMessage(`⏳ [TikTok] @${data.username} saat ini belum LIVE atau siaran telah berakhir. Pastikan akun sedang siaran langsung publik.`);
        } else {
          addSystemMessage(`⚠️ [TikTok] Info koneksi @${data.username}: ${errDesc}`);
        }
      } else if (data.status === 'disconnected') {
        addSystemMessage(`ℹ️ [TikTok] Koneksi live chat @${data.username} terputus.`);
      } else if (data.status === 'streamEnd') {
        addSystemMessage(`🔴 [TikTok] Siaran langsung @${data.username} telah berakhir.`);
      }
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

function initGlobalListeners() {
  // Chat feed scroll detection for "New Messages" float button
  const chatFeed = document.getElementById('chatFeed');
  if (chatFeed) {
    chatFeed.addEventListener('scroll', () => {
      const isAtBottom = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight < 40;
      const btnScroll = document.getElementById('btnScrollBottom');
      if (btnScroll && isAtBottom) {
        btnScroll.classList.add('hidden');
      }
    });
  }

  // Close modal with ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
    }
  });
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

  // Fallback: If user just types Twitch username or YT ID
  if (!url.includes('.')) {
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
    : 'Enter Twitch Channel URL or Username:';
  const url = prompt(promptText);
  if (url) {
    connectStreamUrl(url, platform);
  }
}

function connectStreamUrl(rawUrl, forcePlatform = 'auto') {
  const parsed = parseStreamUrl(rawUrl);
  if (!parsed && forcePlatform === 'auto') {
    playRetroSound('error');
    alert('❌ Invalid Stream URL!\nPlease enter a valid YouTube video URL or Twitch channel link.');
    return;
  }

  const platform = (forcePlatform !== 'auto') ? forcePlatform : parsed.platform;
  const channelOrId = parsed ? parsed.channelOrId : rawUrl.trim();

  // Prevent duplicate connections
  if (state.activeStreams.some(s => s.platform === platform && s.channelOrId === channelOrId)) {
    alert(`Stream [${platform.toUpperCase()}] ${channelOrId} is already connected!`);
    return;
  }

  playRetroSound('connect');

  if (platform === 'twitch') {
    connectTwitchIrc(channelOrId, rawUrl);
  } else if (platform === 'youtube') {
    connectYouTubeStream(channelOrId, rawUrl);
  }

  updateConnectedStreamsUI();
}

// --- Twitch IRC WebSocket Integration ---
function connectTwitchIrc(channelName, originalUrl) {
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  const streamObj = {
    id: `tw-${Date.now()}`,
    platform: 'twitch',
    channelOrId: channelName,
    url: originalUrl || `https://twitch.tv/${channelName}`,
    ws: ws
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
    addSystemMessage(`Connected to Twitch IRC: #${channelName}`);
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
        parseTwitchIrcLine(line, channelName);
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

function parseTwitchIrcLine(line, channelName) {
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
        twitchEmotes: tags['emotes'] || ''
      });
    }
  } catch (e) {
    console.error('Error parsing Twitch line:', e);
  }
}

// --- YouTube Live Stream Handler (Real-Time InnerTube API Fetcher) ---
function connectYouTubeStream(videoId, originalUrl) {
  const streamObj = {
    id: `yt-${Date.now()}`,
    platform: 'youtube',
    channelOrId: videoId,
    url: `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`,
    ws: null,
    pollInterval: null
  };

  state.activeStreams.push(streamObj);
  updateConnectedStreamsUI();
  addSystemMessage(`Connected YouTube Live Chat stream: www.youtube.com/live_chat?is_popout=1&v=${videoId}`);

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
            text: text
          });
        }
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
      const pClass = s.platform === 'youtube' ? 'yt' : (s.platform === 'tiktok' ? 'tt' : 'tw');
      const pLabel = s.platform === 'youtube' ? 'YT' : (s.platform === 'tiktok' ? 'TT' : 'TW');
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
}

// --- Multi-Platform Chat Aggregator Engine ---
function addChatMessage({ platform, username, text, userColor, twitchEmotes }) {
  const msgObj = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platform: platform, // 'youtube', 'twitch', or 'tiktok'
    username: username,
    text: text,
    timestamp: getFormattedTime(),
    isPinned: false,
    userColor: userColor,
    twitchEmotes: twitchEmotes || ''
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

  // 2. Process text chunks to escape HTML and apply emojis
  const parts = text.split(/(\[YTEMOJI:[^:]+:[^\]]+\])/g);
  return parts.map(part => {
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
  const badgeClass = isYt ? 'yt' : (isTt ? 'tt' : 'tw');
  const badgeText = isYt ? 'YT' : (isTt ? 'TT' : 'TW');
  const userClass = isYt ? 'yt-user' : (isTt ? 'tt-user' : 'tw-user');

  let formattedText = formatChatMessageWithEmojis(msgObj.text, msgObj);

  // Highlight search term if active
  if (state.filters.searchQuery) {
    const re = new RegExp(`(${escapeRegExp(state.filters.searchQuery)})`, 'gi');
    formattedText = formattedText.replace(re, '<mark>$1</mark>');
  }

  div.innerHTML = `
    <span class="chat-timestamp">[${msgObj.timestamp}]</span>
    <span class="chat-badge ${badgeClass}">[${badgeText}]</span>
    <span class="chat-username ${userClass}">${escapeHtml(msgObj.username)}:</span>
    <span class="chat-text">${formattedText}</span>
    <div class="chat-actions">
      <button class="btn-chat-act" onclick="pinMessage('${msgObj.id}')" title="Pin Message">📌</button>
      <button class="btn-chat-act" onclick="copyMessageText('${escapeHtml(msgObj.text)}')" title="Copy Text">📋</button>
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
  chatFeed.scrollTop = chatFeed.scrollHeight;
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
      <span class="chat-badge ${msg.platform === 'youtube' ? 'yt' : (msg.platform === 'tiktok' ? 'tt' : 'tw')}">[${msg.platform === 'youtube' ? 'YT' : (msg.platform === 'tiktok' ? 'TT' : 'TW')}]</span>
      <strong>${escapeHtml(msg.username)}:</strong>
      <span class="chat-text">${formatChatMessageWithEmojis(msg.text, msg)}</span>
    </div>
  `).join('');
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

function copyMessageText(text) {
  navigator.clipboard.writeText(text);
  playRetroSound('click');
}

function applyFilters() {
  const ytChk = document.getElementById('chkFilterYt');
  const twChk = document.getElementById('chkFilterTw');
  const ttChk = document.getElementById('chkFilterTt');
  state.filters.yt = ytChk ? ytChk.checked : true;
  state.filters.tw = twChk ? twChk.checked : true;
  state.filters.tt = ttChk ? ttChk.checked : true;
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
  if (typeof val === 'boolean') {
    state.settings.autoScroll = val;
  } else {
    state.settings.autoScroll = !state.settings.autoScroll;
  }
  const chk = document.getElementById('chkAutoScroll');
  if (chk) chk.checked = state.settings.autoScroll;
}

// --- Appearance Live Customization Engine ---
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

function onBubbleBgColorChange(hex) {
  state.appearance.bubbleBgColor = hex;
  const hexLabel = document.getElementById('bubbleBgHex');
  if (hexLabel) hexLabel.textContent = hex;
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleOpacityChange(val) {
  state.appearance.bubbleOpacity = parseInt(val, 10);
  const valLabel = document.getElementById('bubbleOpacityVal');
  if (valLabel) valLabel.textContent = `${val}%`;
  updateBubbleStyle();
  saveAppearanceSettings();
}

function onBubbleBorderToggle(checked) {
  state.appearance.bubbleBorder = checked;
  const group = document.getElementById('bubbleBorderPickerGroup');
  if (group) group.style.display = checked ? 'flex' : 'none';
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

function onBubbleRadiusChange(val) {
  state.appearance.bubbleRadius = parseInt(val, 10);
  const valLabel = document.getElementById('bubbleRadiusVal');
  if (valLabel) valLabel.textContent = `${val}px`;
  document.documentElement.style.setProperty('--bubble-border-radius', `${val}px`);
  saveAppearanceSettings();
}

function onBubblePaddingChange(val) {
  const p = parseInt(val, 10);
  state.appearance.bubblePadding = p;
  const valLabel = document.getElementById('bubblePaddingVal');
  if (valLabel) {
    valLabel.textContent = p <= 3 ? 'Rapat' : (p <= 6 ? 'Sedang' : 'Longgar');
  }
  const py = p;
  const px = Math.round(p * 2.2);
  document.documentElement.style.setProperty('--bubble-padding-y', `${py}px`);
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
  const bubbleBg = hexToRgba(state.appearance.bubbleBgColor, state.appearance.bubbleOpacity);
  root.style.setProperty('--bubble-bg-color', bubbleBg);

  if (state.appearance.bubbleBorder) {
    const borderColor = hexToRgba(state.appearance.bubbleBorderColor, state.appearance.bubbleBorderOpacity || 16);
    root.style.setProperty('--bubble-border-width', '1px');
    root.style.setProperty('--bubble-border-color', borderColor);
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
    bubblePadding: 5,
    bubbleGap: 5,
    bubbleBorder: true,
    bubbleBorderColor: '#ffffff',
    bubbleBorderOpacity: 16
  };
  applyAppearanceToDom();
  saveAppearanceSettings();
}

function saveAppearanceSettings() {
  try {
    localStorage.setItem('livechat_appearance', JSON.stringify(state.appearance));
  } catch (e) {}
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
  if (colorInput) colorInput.value = state.appearance.bgColor;
  const colorHex = document.getElementById('bgColorHex');
  if (colorHex) colorHex.textContent = state.appearance.bgColor;
  const opacitySlider = document.getElementById('bgOpacitySlider');
  if (opacitySlider) opacitySlider.value = state.appearance.bgOpacity;
  const opacityVal = document.getElementById('bgOpacityVal');
  if (opacityVal) opacityVal.textContent = `${state.appearance.bgOpacity}%`;

  // Bubble
  updateBubbleStyle();
  const bColor = document.getElementById('bubbleBgColorPicker');
  if (bColor) bColor.value = state.appearance.bubbleBgColor;
  const bHex = document.getElementById('bubbleBgHex');
  if (bHex) bHex.textContent = state.appearance.bubbleBgColor;
  const bOpacity = document.getElementById('bubbleOpacitySlider');
  if (bOpacity) bOpacity.value = state.appearance.bubbleOpacity;
  const bOpacityVal = document.getElementById('bubbleOpacityVal');
  if (bOpacityVal) bOpacityVal.textContent = `${state.appearance.bubbleOpacity}%`;
  
  const chkBorder = document.getElementById('chkBubbleBorder');
  if (chkBorder) chkBorder.checked = state.appearance.bubbleBorder;
  const borderGroup = document.getElementById('bubbleBorderPickerGroup');
  if (borderGroup) borderGroup.style.display = state.appearance.bubbleBorder ? 'flex' : 'none';
  const bBorderColor = document.getElementById('bubbleBorderColorPicker');
  if (bBorderColor) bBorderColor.value = state.appearance.bubbleBorderColor;
  const bBorderHex = document.getElementById('bubbleBorderHex');
  if (bBorderHex) bBorderHex.textContent = state.appearance.bubbleBorderColor;

  // Radius & Padding & Gap
  const bRadius = document.getElementById('bubbleRadiusSlider');
  if (bRadius) bRadius.value = state.appearance.bubbleRadius;
  const bRadiusVal = document.getElementById('bubbleRadiusVal');
  if (bRadiusVal) bRadiusVal.textContent = `${state.appearance.bubbleRadius}px`;
  root.style.setProperty('--bubble-border-radius', `${state.appearance.bubbleRadius}px`);

  const bPadding = document.getElementById('bubblePaddingSlider');
  if (bPadding) bPadding.value = state.appearance.bubblePadding;
  const py = state.appearance.bubblePadding;
  const px = Math.round(py * 2.2);
  root.style.setProperty('--bubble-padding-y', `${py}px`);
  root.style.setProperty('--bubble-padding-x', `${px}px`);

  const bGap = document.getElementById('bubbleGapSlider');
  if (bGap) bGap.value = state.appearance.bubbleGap;
  const bGapVal = document.getElementById('bubbleGapVal');
  if (bGapVal) bGapVal.textContent = `${state.appearance.bubbleGap}px`;
  root.style.setProperty('--bubble-gap', `${state.appearance.bubbleGap}px`);

  // Font & Size
  const fontSel = document.getElementById('fontSelect');
  if (fontSel) fontSel.value = state.appearance.fontFamily;
  root.style.setProperty('--chat-font-family', state.appearance.fontFamily);

  const fSize = document.getElementById('fontSizeSlider');
  if (fSize) fSize.value = state.appearance.fontSize;
  const fSizeVal = document.getElementById('fontSizeVal');
  if (fSizeVal) fSizeVal.textContent = `${state.appearance.fontSize}px`;
  root.style.setProperty('--chat-font-size', `${state.appearance.fontSize}px`);

  const tColor = document.getElementById('chatTextColorPicker');
  if (tColor) tColor.value = state.appearance.chatTextColor;
  const tHex = document.getElementById('chatTextHex');
  if (tHex) tHex.textContent = state.appearance.chatTextColor;
  root.style.setProperty('--chat-text-color', state.appearance.chatTextColor);
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

function connectTikTokStream(username) {
  playRetroSound('connect');
  const cleanUser = String(username).replace(/^@/, '').trim();
  if (!cleanUser) {
    alert('Masukkan username TikTok yang valid!');
    return;
  }

  const streamId = `tt-${Date.now()}`;
  const streamObj = {
    id: streamId,
    platform: 'tiktok',
    channelOrId: `@${cleanUser}`,
    url: `https://www.tiktok.com/@${cleanUser}/live`
  };

  // Avoid duplicate connections
  if (state.activeStreams.some(s => s.channelOrId.toLowerCase() === `@${cleanUser}`.toLowerCase())) {
    addSystemMessage(`Stream TikTok @${cleanUser} sudah terhubung.`);
    return;
  }

  state.activeStreams.push(streamObj);
  updateConnectedStreamsUI();
  addSystemMessage(`🎵 Menghubungkan ke TikTok Live @${cleanUser} via Webcast Push Service...`);

  if (electronIpc) {
    electronIpc.send('tiktok-connect', { streamId, username: cleanUser });
  } else {
    addSystemMessage(`⚠️ Fitur live chat TikTok aktif pada aplikasi desktop/portable.`);
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
  if (type === 'yt') {
    if (ytChk) ytChk.checked = true;
    if (twChk) twChk.checked = false;
    if (ttChk) ttChk.checked = false;
  } else if (type === 'tw') {
    if (ytChk) ytChk.checked = false;
    if (twChk) twChk.checked = true;
    if (ttChk) ttChk.checked = false;
  } else if (type === 'tt') {
    if (ytChk) ytChk.checked = false;
    if (twChk) twChk.checked = false;
    if (ttChk) ttChk.checked = true;
  } else {
    if (ytChk) ytChk.checked = true;
    if (twChk) twChk.checked = true;
    if (ttChk) ttChk.checked = true;
  }
  applyFilters();
}

// --- Right-Side Settings Panel Controls ---
function toggleSettingsModal() {
  playRetroSound('click');
  const panel = document.getElementById('settingsPanel') || document.getElementById('settingsModal');
  if (!panel) return;
  const isOpening = panel.classList.contains('hidden');
  
  if (isOpening) {
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }

  // Notify Electron to expand/collapse window
  if (window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('toggle-settings-panel', isOpening);
    } catch (e) {
      console.warn("Electron IPC notice:", e);
    }
  }
}

function closeSettingsModal() {
  playRetroSound('click');
  const panel = document.getElementById('settingsPanel') || document.getElementById('settingsModal');
  if (panel && !panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('toggle-settings-panel', false);
      } catch (e) {
        console.warn("Electron IPC notice:", e);
      }
    }
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
  const topBar = document.getElementById('topBar');
  const chk = document.getElementById('chkLockPosition');

  if (chk) chk.checked = state.settings.isLocked;

  if (state.settings.isLocked) {
    if (lockBtn) {
      lockBtn.classList.add('locked');
      lockBtn.title = "Posisi Terkunci (Klik untuk membuka kunci)";
    }
    if (lockIcon) lockIcon.textContent = '🔒';
    if (topBar) topBar.classList.add('locked');
    addSystemMessage('🔒 Posisi overlay dikunci (tidak dapat dipindahkan).');
  } else {
    if (lockBtn) {
      lockBtn.classList.remove('locked');
      lockBtn.title = "Kunci Posisi (Lock Orientation)";
    }
    if (lockIcon) lockIcon.textContent = '🔓';
    if (topBar) topBar.classList.remove('locked');
    addSystemMessage('🔓 Posisi overlay dibuka (dapat digeser bebas).');
  }

  try {
    localStorage.setItem('livechat_locked', state.settings.isLocked);
  } catch (e) {}

  // Send IPC to Electron
  if (window.require) {
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
  document.getElementById('statusMsgCount').textContent = `Total: ${state.stats.totalCount} msgs`;
}

function updateMsgRate() {
  const now = Date.now();
  // Filter messages in last 5 seconds
  state.stats.recentMsgTimestamps = state.stats.recentMsgTimestamps.filter(t => now - t <= 5000);
  const rate = (state.stats.recentMsgTimestamps.length / 5).toFixed(1);
  document.getElementById('statusRate').textContent = `Rate: ${rate} msg/s`;
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

// --- Streamer Account Login & Auto-Connect Engine ---
function loadSavedAccounts() {
  try {
    const raw = localStorage.getItem('livechat_saved_accounts');
    if (raw) {
      const data = JSON.parse(raw);
      state.savedAccounts = { ...state.savedAccounts, ...data };
    }
  } catch (e) {
    console.warn("Could not load saved accounts:", e);
  }
  updateSavedAccountsUI();
}

function saveSavedAccountsToStorage() {
  try {
    localStorage.setItem('livechat_saved_accounts', JSON.stringify(state.savedAccounts));
  } catch (e) {
    console.warn("Could not save accounts to storage:", e);
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
    if (accTwBtn) accTwBtn.textContent = 'Ubah Akun';
    if (accTwLogout) accTwLogout.classList.remove('hidden');
  } else {
    if (accTwUser) accTwUser.textContent = 'Tidak ada akun tersimpan';
    if (accTwStatus) {
      accTwStatus.textContent = 'Belum Disimpan';
      accTwStatus.className = 'acc-status-badge';
    }
    if (accTwBtn) accTwBtn.textContent = '🔑 Login / Simpan';
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
    if (accYtBtn) accYtBtn.textContent = 'Ubah Handle';
    if (accYtLogout) accYtLogout.classList.remove('hidden');
  } else {
    if (accYtUser) accYtUser.textContent = 'Tidak ada channel tersimpan';
    if (accYtStatus) {
      accYtStatus.textContent = 'Belum Disimpan';
      accYtStatus.className = 'acc-status-badge';
    }
    if (accYtBtn) accYtBtn.textContent = '🔑 Login / Simpan';
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
    if (accTtBtn) accTtBtn.textContent = 'Ubah Akun';
    if (accTtLogout) accTtLogout.classList.remove('hidden');
  } else {
    if (accTtUser) accTtUser.textContent = 'Tidak ada akun tersimpan';
    if (accTtStatus) {
      accTtStatus.textContent = 'Belum Disimpan';
      accTtStatus.className = 'acc-status-badge';
    }
    if (accTtBtn) accTtBtn.textContent = '🔑 Login / Simpan';
    if (accTtLogout) accTtLogout.classList.add('hidden');
  }
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

  if (platform === 'twitch') {
    title.textContent = '👾 Login / Simpan Akun Twitch';
    desc.textContent = 'Masukkan nama channel Twitch Anda. Setiap kali Anda live, chat akan otomatis tersambung tanpa perlu input ulang.';
    label.textContent = 'Username Twitch:';
    input.placeholder = 'contoh: shroud atau username_anda';
    input.value = state.savedAccounts.twitch || '';
    tip.textContent = '💡 Tips: Chat Twitch dihubungkan secara real-time via WebSocket IRC.';
  } else if (platform === 'youtube') {
    title.textContent = '▶ Login / Simpan Akun YouTube';
    desc.textContent = 'Masukkan Handle YouTube atau Channel ID Anda (contoh: @WindahBasudara atau channel ID). Aplikasi akan memantau live stream Anda.';
    label.textContent = 'Handle / Channel ID YouTube:';
    input.placeholder = 'contoh: @NamaChannel atau UCxxxxxx';
    input.value = state.savedAccounts.youtube || '';
    tip.textContent = '💡 Tips: Format handle diawali dengan tanda @ (contoh: @StreamerID).';
  } else if (platform === 'tiktok') {
    title.textContent = '🎵 Login / Simpan Akun TikTok';
    desc.textContent = 'Masukkan username TikTok Anda. Saat Anda menyalakan Live di TikTok, chat komentar akan otomatis terhubung.';
    label.textContent = 'Username TikTok:';
    input.placeholder = 'contoh: streamername (tanpa spasi)';
    input.value = state.savedAccounts.tiktok || '';
    tip.textContent = '💡 Tips: Pastikan akun Anda dapat melakukan siaran langsung publik.';
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
  if (modal) modal.classList.add('hidden');
  currentLoginPlatform = null;
}

function saveAccountFromModal() {
  const input = document.getElementById('loginModalInput');
  if (!input || !currentLoginPlatform) return;
  let val = input.value.trim();
  if (!val) {
    alert('Mohon masukkan username atau handle yang valid.');
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
  closeLoginModal();
  playRetroSound('connect');

  // Immediately connect this platform stream
  connectSavedAccountStream(currentLoginPlatform, val);
}

function logoutAccount(platform) {
  playRetroSound('click');
  if (!confirm(`Hapus akun ${platform.toUpperCase()} tersimpan?`)) return;
  state.savedAccounts[platform] = '';
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
    connectTikTokStream(state.savedAccounts.tiktok);
    connectedAny = true;
  }
  if (connectedAny) {
    addSystemMessage(`⚡ Auto-Connect: Menyambungkan ke akun streaming Anda secara otomatis.`);
  }
}

function connectYouTubeChannelOrHandle(channelOrHandle) {
  const cleanId = channelOrHandle.replace(/[\/\?].*$/, '');
  const url = cleanId.startsWith('@') 
    ? `https://www.youtube.com/${cleanId}/live` 
    : `https://www.youtube.com/channel/${cleanId}/live`;

  const streamObj = {
    id: `yt-channel-${Date.now()}`,
    platform: 'youtube',
    channelOrId: cleanId,
    url: url
  };

  // Check if already connected
  if (state.activeStreams.some(s => s.channelOrId === cleanId)) return;

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
      const res = await fetch(liveUrl);
      const html = await res.text();
      const vidMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (vidMatch && vidMatch[1]) {
        const liveVideoId = vidMatch[1];
        if (streamObj.standbyCheckInterval) {
          clearInterval(streamObj.standbyCheckInterval);
          streamObj.standbyCheckInterval = null;
        }
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
    addSystemMessage(`⏳ [YouTube] Channel ${channelIdentifier} saat ini belum LIVE. Mode Standby aktif: otomatis tersambung saat Anda mulai streaming.`);
    // Periodic standby check every 25 seconds
    if (streamObj.standbyCheckInterval) clearInterval(streamObj.standbyCheckInterval);
    streamObj.standbyCheckInterval = setInterval(async () => {
      if (!state.activeStreams.some(s => s.id === streamObj.id)) {
        clearInterval(streamObj.standbyCheckInterval);
        return;
      }
      await checkLiveStatus();
    }, 25000);
  }
}
