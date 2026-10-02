/* ==========================================================================
   Live Donation & Widgets Standalone Window Controller
   ========================================================================== */

let electronIpc = null;
try {
  if (typeof window !== 'undefined' && window.require) {
    electronIpc = window.require('electron').ipcRenderer;
  }
} catch (e) {
  console.warn("Electron IPC not available in donation window:", e);
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

let currentPanelId = 'overlay';

let donationState = {
  isLocked: false,
  currentTab: 'overlay',
  donations: {
    takoUrl: '',
    takoMedserUrl: '',
    saweriaUrl: '',
    saweriaMedserUrl: '',
    customUrl: '',
    alertEnabled: true,
    medserEnabled: true,
    leaderboardEnabled: true
  },
  leaderboard: [],
  activeMedser: null
};

// Web Audio sound effects
let audioCtx = null;
function playSound(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'donation') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.09);
      osc.frequency.setValueAtTime(783.99, now + 0.18);
      osc.frequency.setValueAtTime(1046.50, now + 0.27);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) {}
}

function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// Initialize dedicated panel mode
function initPanelFromQueryOrIpc(panelId) {
  if (!panelId) {
    const urlParams = new URLSearchParams(window.location.search);
    panelId = urlParams.get('panel') || 'overlay';
  }
  currentPanelId = panelId;

  const titleEl = document.getElementById('fdwTitle');
  const iconSlot = document.getElementById('fdwIconSlot');
  const tabsGroup = document.getElementById('fdwTabsGroup');
  const toolbarLeft = document.getElementById('fdwToolbarLeft');

  if (panelId === 'tako-alert') {
    if (titleEl) titleEl.textContent = 'Tako - Alert Donasi';
    if (iconSlot) iconSlot.innerHTML = '🐙';
    if (tabsGroup) tabsGroup.style.display = 'none';
    if (toolbarLeft) toolbarLeft.style.display = 'none';
    switchFdwTab('overlay');
  } else if (panelId === 'tako-medser') {
    if (titleEl) titleEl.textContent = 'Tako - Media Share';
    if (iconSlot) iconSlot.innerHTML = '🎬';
    if (tabsGroup) tabsGroup.style.display = 'none';
    if (toolbarLeft) toolbarLeft.style.display = 'none';
    if (donationState.donations.takoMedserUrl && isValidHttpUrl(donationState.donations.takoMedserUrl)) {
      switchFdwTab('overlay');
    } else {
      switchFdwTab('mediashare');
    }
  } else if (panelId === 'saweria-alert') {
    if (titleEl) titleEl.textContent = 'Saweria - Alert Donasi';
    if (iconSlot) iconSlot.innerHTML = '🧁';
    if (tabsGroup) tabsGroup.style.display = 'none';
    if (toolbarLeft) toolbarLeft.style.display = 'none';
    switchFdwTab('overlay');
  } else if (panelId === 'saweria-medser') {
    if (titleEl) titleEl.textContent = 'Saweria - Media Share';
    if (iconSlot) iconSlot.innerHTML = '🎬';
    if (tabsGroup) tabsGroup.style.display = 'none';
    if (toolbarLeft) toolbarLeft.style.display = 'none';
    if (donationState.donations.saweriaMedserUrl && isValidHttpUrl(donationState.donations.saweriaMedserUrl)) {
      switchFdwTab('overlay');
    } else {
      switchFdwTab('mediashare');
    }
  } else if (panelId === 'custom-alert') {
    if (titleEl) titleEl.textContent = 'Custom - Alert Donasi';
    if (iconSlot) iconSlot.innerHTML = '🎁';
    if (tabsGroup) tabsGroup.style.display = 'none';
    if (toolbarLeft) toolbarLeft.style.display = 'none';
    switchFdwTab('overlay');
  } else if (panelId === 'leaderboard') {
    if (titleEl) titleEl.textContent = 'Leaderboard Donatur';
    if (iconSlot) iconSlot.innerHTML = '🏆';
    if (tabsGroup) tabsGroup.style.display = 'none';
    switchFdwTab('leaderboard');
  } else {
    // Default multi-tab
    if (titleEl) titleEl.textContent = 'Live Donation Panel';
    if (iconSlot) iconSlot.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';
    if (tabsGroup) tabsGroup.style.display = 'flex';
    if (toolbarLeft) toolbarLeft.style.display = 'flex';
    switchFdwTab('overlay');
  }

  updateOverlayIframe();
}

// Switch Tabs
function switchFdwTab(tabName) {
  playSound('click');
  donationState.currentTab = tabName;

  const tabs = ['overlay', 'leaderboard', 'mediashare'];
  tabs.forEach(t => {
    const btn = document.getElementById(`fdwTabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const pane = document.getElementById(`fdwPane${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });

  if (tabName === 'overlay') {
    updateOverlayIframe();
  } else if (tabName === 'leaderboard') {
    renderLeaderboard();
  }
}

// Window Controls: Lock, Reload, Close
function toggleDonationLock(forceVal) {
  playSound('click');
  if (typeof forceVal === 'boolean') {
    donationState.isLocked = forceVal;
  } else {
    donationState.isLocked = !donationState.isLocked;
  }

  const win = document.getElementById('standaloneDonationWindow');
  const lockBtn = document.getElementById('fdwLockBtn');
  const lockShackle = document.getElementById('fdwLockShackle');

  if (win) win.classList.toggle('locked', donationState.isLocked);
  if (lockBtn) {
    lockBtn.classList.toggle('locked', donationState.isLocked);
    lockBtn.title = donationState.isLocked ? 'Buka Kunci Posisi' : 'Kunci Posisi Jendela';
  }
  if (lockShackle) {
    lockShackle.setAttribute('d', donationState.isLocked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1');
  }

  if (electronIpc) {
    electronIpc.send('set-donation-locked', { panelId: currentPanelId, isLocked: donationState.isLocked });
  }
}

function reloadCurrentTab() {
  playSound('click');
  if (donationState.currentTab === 'overlay') {
    reloadOverlayIframe();
  } else if (donationState.currentTab === 'leaderboard') {
    renderLeaderboard();
  } else {
    triggerTestMedser();
  }
}

function closeDonationWindow() {
  playSound('click');
  if (electronIpc) {
    electronIpc.send('close-donation-window', currentPanelId);
  } else {
    window.close();
  }
}

// Overlay Tab Logic
function onSourceSelectChanged() {
  updateOverlayIframe();
}

function updateOverlayIframe() {
  const iframe = document.getElementById('fdwOverlayIframe');
  const placeholder = document.getElementById('fdwOverlayPlaceholder');
  const select = document.getElementById('fdwOverlaySourceSelect');
  if (!iframe) return;

  let targetUrl = '';

  if (currentPanelId === 'tako-alert') {
    targetUrl = donationState.donations.takoUrl || '';
  } else if (currentPanelId === 'tako-medser') {
    targetUrl = donationState.donations.takoMedserUrl || '';
  } else if (currentPanelId === 'saweria-alert') {
    targetUrl = donationState.donations.saweriaUrl || '';
  } else if (currentPanelId === 'saweria-medser') {
    targetUrl = donationState.donations.saweriaMedserUrl || '';
  } else if (currentPanelId === 'custom-alert') {
    targetUrl = donationState.donations.customUrl || '';
  } else {
    const choice = select ? select.value : 'auto';
    if (choice === 'tako') {
      targetUrl = donationState.donations.takoUrl;
    } else if (choice === 'saweria') {
      targetUrl = donationState.donations.saweriaUrl;
    } else if (choice === 'custom') {
      targetUrl = donationState.donations.customUrl;
    } else {
      targetUrl = donationState.donations.takoUrl || donationState.donations.saweriaUrl || donationState.donations.customUrl || '';
    }
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
    if (placeholder) {
      placeholder.classList.remove('hidden');
      const titleP = placeholder.querySelector('.fdw-placeholder-text');
      const subP = placeholder.querySelector('.fdw-placeholder-sub');
      if (currentPanelId === 'tako-alert' && titleP && subP) {
        titleP.textContent = 'Belum ada URL Alert Tako.';
        subP.textContent = 'Atur URL Tako di menu Pengaturan > Donasi > Panel Tako.';
      } else if (currentPanelId === 'saweria-alert' && titleP && subP) {
        titleP.textContent = 'Belum ada URL Alert Saweria.';
        subP.textContent = 'Atur URL Saweria di menu Pengaturan > Donasi > Panel Saweria.';
      } else if (currentPanelId === 'tako-medser' && titleP && subP) {
        titleP.textContent = 'Belum ada URL Media Share Tako.';
        subP.textContent = 'Masukkan URL Media Share Tako di menu Pengaturan > Donasi.';
      } else if (currentPanelId === 'saweria-medser' && titleP && subP) {
        titleP.textContent = 'Belum ada URL Media Share Saweria.';
        subP.textContent = 'Masukkan URL Media Share Saweria di menu Pengaturan > Donasi.';
      }
    }
  }
}

function reloadOverlayIframe() {
  playSound('click');
  const iframe = document.getElementById('fdwOverlayIframe');
  if (!iframe) return;
  const currentSrc = iframe.getAttribute('data-src');
  if (currentSrc && isValidHttpUrl(currentSrc)) {
    const ts = Date.now();
    const conn = currentSrc.includes('?') ? '&' : '?';
    iframe.src = `${currentSrc}${conn}_reload=${ts}`;
  } else {
    updateOverlayIframe();
  }
}

// Leaderboard Tab Logic
function renderLeaderboard() {
  const container = document.getElementById('fdwLeaderboardList');
  if (!container) return;

  if (!donationState.leaderboard || donationState.leaderboard.length === 0) {
    container.innerHTML = `<div class="fdw-empty-text">Belum ada donasi tercatat sesi ini.<br><span style="font-size:9.5px;color:#94a3b8;">Klik "Test Donasi" untuk mencoba simulasi.</span></div>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = donationState.leaderboard.slice(0, 15).map((item, idx) => {
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

function triggerTestDonation() {
  playSound('donation');
  const mockDonors = ['SultanStream', 'BudiSantoso', 'GamerSejati', 'WindahFans', 'Anonim99'];
  const mockAmounts = ['Rp 10.000', 'Rp 25.000', 'Rp 50.000', 'Rp 100.000'];
  const donor = mockDonors[Math.floor(Math.random() * mockDonors.length)];
  const amount = mockAmounts[Math.floor(Math.random() * mockAmounts.length)];
  const numeric = parseInt(amount.replace(/[^0-9]/g, ''), 10);

  const existing = donationState.leaderboard.find(item => item.donor.toLowerCase() === donor.toLowerCase());
  if (existing) {
    existing.totalNumeric = (existing.totalNumeric || 0) + numeric;
    existing.displayTotal = `Rp ${existing.totalNumeric.toLocaleString('id-ID')}`;
    existing.count = (existing.count || 1) + 1;
  } else {
    donationState.leaderboard.push({
      donor: donor,
      totalNumeric: numeric,
      displayTotal: amount,
      count: 1
    });
  }
  donationState.leaderboard.sort((a, b) => (b.totalNumeric || 0) - (a.totalNumeric || 0));
  renderLeaderboard();

  // Notify main window to sync leaderboard
  if (electronIpc) {
    electronIpc.send('broadcast-leaderboard-update', donationState.leaderboard);
  }
}

function resetLeaderboard() {
  playSound('click');
  if (!confirm('Reset peringkat donatur?')) return;
  donationState.leaderboard = [];
  renderLeaderboard();
  if (electronIpc) {
    electronIpc.send('broadcast-leaderboard-update', donationState.leaderboard);
  }
}

// Media Share Tab Logic
function updateMedserCard(data) {
  const fdwTitle = document.getElementById('fdwMedserTitle');
  const fdwDonor = document.getElementById('fdwMedserDonor');
  const fdwAmount = document.getElementById('fdwMedserAmount');
  const fdwDuration = document.getElementById('fdwMedserDuration');
  const fdwStatus = document.getElementById('fdwMedserStatusText');

  if (fdwTitle) fdwTitle.textContent = data.title || 'Video Media Share';
  if (fdwDonor) fdwDonor.textContent = `Donatur: ${data.donor || 'Anonim'}`;
  if (fdwAmount) fdwAmount.textContent = `Nominal: ${data.amount || 'Rp 20.000'}`;
  if (fdwDuration) fdwDuration.textContent = `Durasi: ${data.duration || '01:30'}`;
  if (fdwStatus) fdwStatus.textContent = `Sedang Diputar: ${data.donor || 'Live'}`;
}

function triggerTestMedser() {
  playSound('click');
  const mockVideos = ['DJ Desa Remix 2026', 'NCS - Spectre (Live)', 'Anime Opening Chill Mix', 'Epic Sound Effect HQ'];
  const mockDonors = ['Budi', 'RianGamer', 'Dewi', 'Alex'];
  const donor = mockDonors[Math.floor(Math.random() * mockDonors.length)];
  const title = mockVideos[Math.floor(Math.random() * mockVideos.length)];

  const medserData = {
    donor: donor,
    title: title,
    amount: 'Rp 25.000',
    duration: '01:45'
  };

  updateMedserCard(medserData);

  if (electronIpc) {
    electronIpc.send('broadcast-medser-event', medserData);
  }
}

// Initialization & IPC Listeners
document.addEventListener('DOMContentLoaded', async () => {
  if (electronIpc) {
    // 1. Load initial config from disk
    try {
      const diskConfig = await electronIpc.invoke('load-config');
      if (diskConfig) {
        if (diskConfig.donations) donationState.donations = { ...donationState.donations, ...diskConfig.donations };
        if (diskConfig.leaderboard) donationState.leaderboard = diskConfig.leaderboard;
      }
    } catch (e) {}

    // 2. Listen to dedicated widget panel initialization
    electronIpc.on('init-widget-panel', (event, panelId) => {
      initPanelFromQueryOrIpc(panelId);
    });

    electronIpc.on('switch-donation-tab', (event, tab) => {
      if (tab) {
        if (tab.includes('-')) {
          initPanelFromQueryOrIpc(tab);
        } else {
          switchFdwTab(tab);
        }
      }
    });

    // 3. Real-time broadcast sync from main chat window
    electronIpc.on('leaderboard-update', (event, lb) => {
      donationState.leaderboard = lb || [];
      renderLeaderboard();
    });

    electronIpc.on('medser-event', (event, data) => {
      updateMedserCard(data);
      if (currentPanelId === 'overlay' || currentPanelId === 'tako-medser' || currentPanelId === 'saweria-medser') {
        switchFdwTab('mediashare');
      }
    });

    electronIpc.on('donation-event', (event, data) => {
      playSound('donation');
    });

    electronIpc.on('sync-donation-urls', (event, urls) => {
      if (urls) {
        donationState.donations = { ...donationState.donations, ...urls };
        updateOverlayIframe();
      }
    });
  }

  // Initial render based on URL parameter or default
  initPanelFromQueryOrIpc();
  renderLeaderboard();
});
