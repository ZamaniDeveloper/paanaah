/* Panah SPA v5 - built directly on the ten UI templates. */
'use strict';

const app = {
  user: null,
  token: '',
  socket: null,
  conversations: [],
  contacts: [],
  requests: [],
  notifications: [],
  inbox: [],
  activeConversation: null,
  activePeer: null,
  messages: [],
  conversationFilter: 'all',
  notificationFilter: 'all',
  replyTo: null,
  recorder: null,
  recordingChunks: [],
  recording: false,
  upload: null,
  previousPage: 'conversations',
  activeUploads: [],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function sanitizeHtml(html) {
  // Allow only safe formatting tags
  const div = document.createElement('div');
  div.innerHTML = html;
  // Remove script/style/iframe/object
  div.querySelectorAll('script,style,iframe,object,embed,form').forEach(el => el.remove());
  // Only keep allowed tags, strip dangerous attributes
  const allowed = ['b','strong','i','em','u','a','br','div','span','p'];
  div.querySelectorAll('*').forEach(el => {
    if (!allowed.includes(el.tagName.toLowerCase())) {
      el.replaceWith(...el.childNodes);
    } else {
      // Remove all attributes except href on <a>
      [...el.attributes].forEach(attr => {
        if (!(el.tagName === 'A' && attr.name === 'href')) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
    }
  });
  return div.innerHTML;
}

function storedToken() {
  return localStorage.getItem('chatToken') || sessionStorage.getItem('chatToken') || '';
}

function saveToken(token, persistent = true) {
  localStorage.removeItem('chatToken');
  sessionStorage.removeItem('chatToken');
  (persistent ? localStorage : sessionStorage).setItem('chatToken', token);
  app.token = token;
}

function clearToken() {
  localStorage.removeItem('chatToken');
  sessionStorage.removeItem('chatToken');
  app.token = '';
}

async function api(method, path, body) {
  const options = { method, headers: {} };
  if (app.token) options.headers.Authorization = `Bearer ${app.token}`;
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearToken();
    showPage('login');
  }
  if (!response.ok) throw new Error(data.error || `خطای ${response.status}`);
  return data;
}

function showToast(page, message, type = '') {
  const toast = $(`#${page}-toast`);
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function showPage(name, options = {}) {
  if (!app.token && !['login', 'signup'].includes(name)) name = 'login';
  const current = $('.screen:not(.hidden)')?.dataset.page;
  if (current && current !== name && !['login', 'signup'].includes(current)) app.previousPage = current;
  $$('.screen').forEach(page => page.classList.toggle('hidden', page.dataset.page !== name));
  // Update bottom nav active state
  const navMap = { profile: 'پروفایل', notifications: 'اعلان‌ها', conversations: 'گفتگوها', contacts: 'مخاطبین', states: 'گفتگوها', chat: 'گفتگوها', inbox: 'گفتگوها', 'peer-profile': 'مخاطبین', 'edit-profile': 'پروفایل' };
  const activeLabel = navMap[name];
  if (activeLabel) {
    const activePage = $(`#page-${name}`) || $(`.screen[data-page="${name}"]`);
    if (activePage) {
      $$('.bottom-nav .nav-item', activePage).forEach(item => {
        item.classList.toggle('active', $('span', item)?.textContent.trim() === activeLabel);
      });
    }
  }
  if (options.peer) app.activePeer = options.peer;
  const loaders = {
    conversations: loadConversations,
    contacts: loadContactsPage,
    notifications: loadNotifications,
    profile: loadMyProfile,
    'edit-profile': () => {},
    'peer-profile': () => loadPeerProfile(options.userId || app.activePeer?.userId),
    inbox: loadInbox,
    states: setupStatesPage,
  };
  loaders[name]?.();
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
}

function relativeTime(value) {
  if (!value) return '';
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'هم‌اکنون';
  if (seconds < 3600) return `${Math.floor(seconds / 60).toLocaleString('fa-IR')} دقیقه پیش`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600).toLocaleString('fa-IR')} ساعت پیش`;
  return new Date(value).toLocaleDateString('fa-IR');
}

function isIranMobile(value) {
  return /^09\d{9}$/.test(String(value || '').trim());
}

async function completeAuth(payload, persistent) {
  saveToken(payload.token, persistent);
  app.user = payload.user;
  connectSocket();
  await Promise.all([loadContacts(), loadConversations(false)]);
  showPage('conversations');
  
  // Auto-renew or restore Web Push subscription silently on login if previously enabled
  const savedNotifState = localStorage.getItem('panahPushNotifications') || 'disabled';
  if (savedNotifState === 'enabled' && Notification.permission === 'granted') {
    subscribeUserToPush(true).catch(() => {});
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const mobile = $('#login-mobile').value.trim();
  const password = $('#login-password').value;
  if (!isIranMobile(mobile)) return showToast('login', 'شماره موبایل نامعتبر است.', 'error');
  if (password.length < 8) return showToast('login', 'رمز عبور باید حداقل ۸ کاراکتر باشد.', 'error');
  const button = $('#login-loginBtn');
  button.classList.add('loading'); button.disabled = true;
  try {
    const payload = await api('POST', '/api/auth/login', { username: mobile, password });
    await completeAuth(payload, $('#login-remember').checked);
  } catch (error) {
    showToast('login', error.message, 'error');
  } finally {
    button.classList.remove('loading'); button.disabled = false;
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const name = $('#signup-fullname').value.trim();
  const mobile = $('#signup-mobile').value.trim();
  const password = $('#signup-password').value;
  const confirm = $('#signup-confirmPassword').value;
  if (!name) return showToast('signup', 'نام و نام خانوادگی را وارد کنید.', 'error');
  if (!isIranMobile(mobile)) return showToast('signup', 'شماره موبایل نامعتبر است.', 'error');
  if (password.length < 8) return showToast('signup', 'رمز عبور باید حداقل ۸ کاراکتر باشد.', 'error');
  if (password !== confirm) return showToast('signup', 'رمز عبور و تکرار آن یکسان نیست.', 'error');
  const button = $('#signup-registerBtn');
  button.classList.add('loading'); button.disabled = true;
  try {
    const payload = await api('POST', '/api/auth/register', { username: mobile, password, name });
    await completeAuth(payload, true);
    const avatar = $('#signup-avatarUpload').files?.[0];
    if (avatar) await uploadAvatar(avatar);
  } catch (error) {
    showToast('signup', error.message, 'error');
  } finally {
    button.classList.remove('loading'); button.disabled = false;
  }
}



async function loadConversations(render = true) {
  try {
    app.conversations = await api('GET', '/api/conversations');
    if (render) renderConversations();
  } catch (error) {
    if (render) showToast('conversations', error.message, 'error');
  }
}

function conversationType(item) {
  const types = ['all'];
  if (Number(item.unreadCount || 0)) types.push('unread');
  if (item.type === 'group') types.push('group');
  if (item.type === 'channel') types.push('channel');
  return types;
}

function renderConversations() {
  const list = $('#conversations-chatList');
  const query = $('#conversations-searchInput').value.trim().toLowerCase();
  const items = app.conversations.filter(item => {
    const matchesQuery = `${item.peer?.name || ''} ${item.peer?.username || ''}`.toLowerCase().includes(query);
    const matchesFilter = conversationType(item).includes(app.conversationFilter);
    return matchesQuery && matchesFilter;
  });
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div class="dynamic-empty"><i class="fa-solid fa-message"></i><strong>گفتگویی پیدا نشد</strong><span>از مخاطبین یک گفتگوی تازه شروع کنید.</span></div>';
    return;
  }
  items.forEach(item => {
    const peer = item.peer || {};
    const last = item.lastMessage || {};
    const preview = last.text || (last.attachments?.length ? '<i class="fa-solid fa-file-lines"></i> فایل پیوست' : 'گفتگو را شروع کنید');
    const node = document.createElement('div');
    node.className = 'chat-item';
    node.dataset.type = conversationType(item).join(' ');
    node.innerHTML = `<div class="avatar-container ${peer.online ? 'is-online' : ''}"><img src="${escapeHtml(peer.avatar || '/icons/default-avatar.png')}" alt="" class="avatar">${peer.online ? '<div class="online-dot"></div>' : ''}</div><div class="chat-info"><div class="chat-header"><span class="chat-name">${escapeHtml(peer.name || peer.username || 'کاربر')}</span><span class="chat-time">${formatTime(item.updatedAt)}</span></div><div class="chat-message-row"><span class="chat-preview">${preview}</span>${item.unreadCount ? `<span class="unread-badge">${Number(item.unreadCount).toLocaleString('fa-IR')}</span>` : ''}</div></div>`;
    node.addEventListener('click', () => openConversation(item.conversationId, peer));
    list.appendChild(node);
  });
}

async function openConversation(conversationId, peer) {
  app.activeConversation = conversationId;
  app.activePeer = peer || {};
  showPage('chat');
  const page = $('#page-chat');
  $('.user-info .avatar', page).src = peer?.avatar || '/icons/default-avatar.png';
  $('.details h2', page).textContent = peer?.name || peer?.username || 'گفتگو';
  const statusEl = $('.details .status', page);
  statusEl.textContent = peer?.online ? 'آنلاین' : 'آخرین بازدید اخیراً';
  statusEl.classList.toggle('online', Boolean(peer?.online));
  // Clear reply bar
  hideReplyBar();

  // Load from offline IndexedDB cache instantly
  try {
    const cachedMessages = await dbHelper.getMessages(conversationId);
    if (cachedMessages && cachedMessages.length > 0) {
      app.messages = cachedMessages;
      renderMessages();
    } else {
      app.messages = [];
      const area = $('#chat-chatArea');
      area.innerHTML = '<div class="dynamic-empty"><i class="fa-solid fa-spinner fa-spin"></i><span>در حال بارگذاری گفتگو...</span></div>';
    }
  } catch (dbError) {
    console.error('Failed to read messages from IndexedDB:', dbError);
  }

  // Fetch live messages in background
  try {
    const data = await api('GET', `/api/conversations/${encodeURIComponent(conversationId)}/messages/0`);
    const fetchedMessages = data.messages || [];
    
    // Save live messages to IndexedDB
    await dbHelper.saveMessages(fetchedMessages);

    // Merge in any pending offline outbox messages
    const outbox = await dbHelper.getOutbox();
    const unsentForThisConv = outbox.filter(m => m.conversationId === conversationId);
    app.messages = [...fetchedMessages, ...unsentForThisConv];
    
    renderMessages();
    app.socket?.emit('joinConversation', { conversationId });
    app.socket?.emit('messagesSeen', { conversationId });
  } catch (error) {
    if (app.messages.length > 0) {
      const outbox = await dbHelper.getOutbox();
      const unsentForThisConv = outbox.filter(m => m.conversationId === conversationId);
      const existingIds = new Set(app.messages.map(m => m.id));
      const uniqueUnsent = unsentForThisConv.filter(m => !existingIds.has(m.id));
      if (uniqueUnsent.length > 0) {
        app.messages = [...app.messages, ...uniqueUnsent];
        renderMessages();
      }
    }
    showToast('chat', 'خطا در بارگذاری پیام‌های جدید (حالت آفلاین فعال است)', 'warning');
  }
}

async function openConversationByUser(peer) {
  try {
    const data = await api('POST', '/api/conversations/direct', { peerUserId: peer.userId });
    await openConversation(data.conversationId, data.peer || peer);
  } catch (error) {
    showToast('contacts', error.message, 'error');
  }
}

function messageAttachment(attachment) {
  const url = attachment.file || attachment.fileUrl || '';
  const type = attachment.type || '';
  if (!url) return `<div class="upload-pending"><i class="fa-solid fa-spinner fa-spin"></i> در حال پردازش...</div>`;
  if (/^image\//.test(type) || /\.(png|jpe?g|gif|webp)$/i.test(url)) return `<img src="${escapeHtml(url)}" alt="تصویر">`;
  if (/^audio\//.test(type) || /\.(webm|mp3|m4a|ogg|wav)$/i.test(url)) return `<div class="voice-player" data-src="${escapeHtml(url)}"><button class="vp-play"><i class="fa-solid fa-play"></i></button><div class="vp-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="vp-time">00:00</span></div>`;
  if (/^video\//.test(type) || /\.(mp4|mov|mkv)$/i.test(url)) {
    return `
      <div class="custom-video-player" data-src="${escapeHtml(url)}">
        <video src="${escapeHtml(url)}" playsinline preload="metadata"></video>
        <button class="cvp-big-play"><i class="fa-solid fa-play"></i></button>
        <div class="cvp-controls">
          <button class="cvp-play-btn"><i class="fa-solid fa-play"></i></button>
          <span class="cvp-time">۰۰:۰۰ / ۰۰:۰۰</span>
          <div class="cvp-progress-container">
            <div class="cvp-progress-bar">
              <div class="cvp-progress-fill"></div>
            </div>
          </div>
          <button class="cvp-mute-btn"><i class="fa-solid fa-volume-high"></i></button>
          <button class="cvp-fullscreen-btn"><i class="fa-solid fa-expand"></i></button>
        </div>
      </div>
    `;
  }
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="file-link"><i class="fa-solid fa-file-arrow-down"></i><span>${escapeHtml(attachment.fileName || 'فایل')}</span></a>`;
}

function renderMessages() {
  const area = $('#chat-chatArea');
  area.innerHTML = '<div class="date-divider"><span>امروز</span></div>';
  if (!app.messages.length) area.innerHTML += '<div class="dynamic-empty"><i class="fa-solid fa-message"></i><strong>هنوز پیامی نیست</strong><span>اولین پیام را شما بفرستید.</span></div>';
  app.messages.forEach(message => area.appendChild(createMessageNode(message)));
  
  // Robust and progressive scroll to bottom
  area.scrollTop = area.scrollHeight;
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 30);
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 100);
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 300);

  // Init voice players
  initVoicePlayers();
  // Init custom video players
  initVideoPlayers();
}

function initVoicePlayers() {
  $$('.voice-player').forEach(vp => {
    if (vp._inited) return;
    vp._inited = true;
    const audio = new Audio(vp.dataset.src);
    const playBtn = vp.querySelector('.vp-play');
    const timeEl = vp.querySelector('.vp-time');
    const waves = vp.querySelectorAll('.vp-wave span');
    let playing = false;

    audio.addEventListener('loadedmetadata', () => {
      timeEl.textContent = formatDuration(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
      timeEl.textContent = formatDuration(audio.currentTime);
      const pct = audio.duration ? audio.currentTime / audio.duration : 0;
      waves.forEach((w, i) => w.style.opacity = i / waves.length < pct ? '1' : '.3');
    });
    audio.addEventListener('ended', () => {
      playing = false;
      playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      waves.forEach(w => w.style.opacity = '.3');
    });
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (playing) { audio.pause(); playing = false; playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'; }
      else { audio.play(); playing = true; playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'; }
    };
  });
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function initVideoPlayers() {
  $$('.custom-video-player').forEach(player => {
    if (player.classList.contains('initialized')) return;
    player.classList.add('initialized');

    const video = player.querySelector('video');
    const bigPlayBtn = player.querySelector('.cvp-big-play');
    const playBtn = player.querySelector('.cvp-play-btn');
    const timeDisplay = player.querySelector('.cvp-time');
    const progressContainer = player.querySelector('.cvp-progress-container');
    const progressFill = player.querySelector('.cvp-progress-fill');
    const muteBtn = player.querySelector('.cvp-mute-btn');
    const fullscreenBtn = player.querySelector('.cvp-fullscreen-btn');
    const controls = player.querySelector('.cvp-controls');

    const formatTimePersian = (seconds) => {
      if (isNaN(seconds)) return '۰۰:۰۰';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      const pad = (val) => val.toString().padStart(2, '0');
      const timeStr = `${pad(m)}:${pad(s)}`;
      return timeStr.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    };

    const updatePlayState = () => {
      if (video.paused) {
        bigPlayBtn.style.display = 'flex';
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        player.classList.remove('playing');
      } else {
        bigPlayBtn.style.display = 'none';
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        player.classList.add('playing');
      }
    };

    const togglePlay = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (video.paused) {
        $$('video, audio').forEach(el => { if (el !== video) el.pause(); });
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      updatePlayState();
    };

    bigPlayBtn.addEventListener('click', togglePlay);
    playBtn.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);

    video.addEventListener('play', updatePlayState);
    video.addEventListener('pause', updatePlayState);

    video.addEventListener('timeupdate', () => {
      const cur = video.currentTime;
      const dur = video.duration || 0;
      timeDisplay.textContent = `${formatTimePersian(cur)} / ${formatTimePersian(dur)}`;
      if (dur > 0) {
        const pct = (cur / dur) * 100;
        progressFill.style.width = `${pct}%`;
      }
    });

    video.addEventListener('loadedmetadata', () => {
      timeDisplay.textContent = `${formatTimePersian(0)} / ${formatTimePersian(video.duration)}`;
    });

    muteBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      video.muted = !video.muted;
      if (video.muted) {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
      } else {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
      }
    });

    fullscreenBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!document.fullscreenElement) {
        player.requestFullscreen?.() || player.webkitRequestFullscreen?.() || video.requestFullscreen?.();
      } else {
        document.exitFullscreen?.() || document.webkitExitFullscreen?.();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement === player) {
        player.classList.add('fullscreen');
        fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
      } else {
        player.classList.remove('fullscreen');
        fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
      }
    });

    const setVideoProgress = (clientX) => {
      const rect = progressContainer.getBoundingClientRect();
      const pos = (clientX - rect.left) / rect.width;
      const pct = Math.max(0, Math.min(1, pos));
      progressFill.style.width = `${pct * 100}%`;
      if (video.duration) {
        video.currentTime = pct * video.duration;
      }
    };

    let isDragging = false;

    progressContainer.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      isDragging = true;
      setVideoProgress(e.clientX);
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        setVideoProgress(e.clientX);
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) isDragging = false;
    });

    progressContainer.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      isDragging = true;
      setVideoProgress(e.touches[0].clientX);
    }, { passive: true });

    progressContainer.addEventListener('touchmove', (e) => {
      if (isDragging) {
        setVideoProgress(e.touches[0].clientX);
      }
    }, { passive: true });

    progressContainer.addEventListener('touchend', () => {
      if (isDragging) isDragging = false;
    });

    let hideTimeout;
    const showControls = () => {
      controls.classList.add('visible');
      player.style.cursor = 'default';
      clearTimeout(hideTimeout);
      if (!video.paused) {
        hideTimeout = setTimeout(() => {
          controls.classList.remove('visible');
          player.style.cursor = 'none';
        }, 2500);
      }
    };

    player.addEventListener('mousemove', showControls);
    player.addEventListener('touchstart', showControls, { passive: true });
    video.addEventListener('play', showControls);
    video.addEventListener('pause', showControls);

    showControls();
  });
}

function createMessageNode(message) {
  const sent = message.fromId === app.user?.userId;
  const node = document.createElement('div');
  const hasMedia = message.attachments?.length > 0;
  const hasImage = message.attachments?.some(a => /^image\//.test(a.type || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.file || a.fileUrl || ''));
  const hasVideo = message.attachments?.some(a => /^video\//.test(a.type || '') || /\.(mp4|mov|mkv|webm)$/i.test(a.file || a.fileUrl || ''));
  node.className = `message ${sent ? 'sent' : 'received'}${hasImage ? ' image-msg' : ''}${hasVideo ? ' video-msg' : ''}`;
  node.dataset.messageId = message.id;
  const reply = message.replyTo ? `<span class="reply-to"><i class="fa-solid fa-reply"></i> ${escapeHtml(message.replyTo.text || message.replyTo.fromName || 'پاسخ به پیام')}</span>` : '';
  const attachments = (message.attachments || []).map(messageAttachment).join('');
  const reactions = Object.entries(message.reactions || {}).filter(([, users]) => users?.length).map(([emoji, users]) => `<button class="reaction-chip" data-reaction="${emoji}">${emoji} ${users.length.toLocaleString('fa-IR')}</button>`).join('');
  const textContent = message.html ? sanitizeHtml(message.html) : escapeHtml(message.text || '').replace(/\n/g, '<br>');
  
  // Build bubble content
  let bubbleContent = reply;
  bubbleContent += attachments;
  if (textContent && hasMedia) {
    bubbleContent += `<div class="media-caption">${textContent}</div>`;
  } else if (textContent) {
    bubbleContent += `<div class="text-content">${textContent}</div>`;
  }
  if (reactions) bubbleContent += `<div class="message-reactions">${reactions}</div>`;
  
  let statusTick = '';
  if (sent) {
    if (message.status === 'unsent') {
      statusTick = '<i class="fa-regular fa-clock unsent"></i>';
    } else if (message.status === 'seen') {
      statusTick = '<i class="fa-solid fa-check-double read"></i>';
    } else {
      statusTick = '<i class="fa-solid fa-check"></i>';
    }
  }
  
  node.innerHTML = `<span class="swipe-indicator left"><i class="fa-solid fa-reply"></i></span><span class="swipe-indicator right"><i class="fa-solid fa-trash"></i></span><div class="msg-bubble">${bubbleContent}</div><span class="msg-time">${formatTime(message.timestamp)} ${statusTick}</span>`;
  node.addEventListener('click', event => {
    if (event.target.closest('a,audio,video,.reaction-chip')) return;
    showReactionPopup(message, node, event);
  });
  node.querySelectorAll('.reaction-chip').forEach(chip => chip.onclick = (e) => {
    e.stopPropagation();
    app.socket?.emit('addReaction', { conversationId: app.activeConversation, messageId: message.id, emoji: chip.dataset.reaction });
  });
  // Swipe gesture
  setupSwipeGesture(node, message, sent);
  return node;
}

function showReactionPopup(message, node, event) {
  const popup = $('#chat-reactionPopup');
  const bubble = node.querySelector('.msg-bubble');
  const rect = bubble.getBoundingClientRect();
  const containerRect = $('#page-chat .app-container').getBoundingClientRect();
  popup.classList.add('active');
  const popupWidth = popup.offsetWidth || 260;
  popup.style.top = `${rect.top - containerRect.top - 45}px`;
  popup.style.left = `${Math.max(10, Math.min(rect.left - containerRect.left, containerRect.width - popupWidth - 10))}px`;
  popup.dataset.messageId = message.id;
  // Hide on next click outside
  setTimeout(() => {
    const hideHandler = (e) => { if (!popup.contains(e.target)) { popup.classList.remove('active'); document.removeEventListener('click', hideHandler); } };
    document.addEventListener('click', hideHandler);
  }, 10);
}

function setupSwipeGesture(node, message, sent) {
  let startX = 0, startY = 0, currentX = 0, currentY = 0, swiping = false, verticalSwiping = false;
  node.addEventListener('touchstart', e => { 
    startX = e.touches[0].clientX; 
    startY = e.touches[0].clientY; 
    swiping = false; 
    verticalSwiping = false; 
  }, { passive: true });
  node.addEventListener('touchmove', e => {
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;
    if (!swiping && !verticalSwiping) {
      if (Math.abs(diffX) > 15) {
        swiping = true;
      } else if (Math.abs(diffY) > 15 && sent) {
        verticalSwiping = true;
      }
    }
    
    if (swiping) {
      node.classList.add('swiping');
      node.style.transform = `translateX(${Math.max(-60, Math.min(60, diffX))}px)`;
    } else if (verticalSwiping) {
      node.classList.add('swiping-vertical');
      node.style.transform = `translateY(${Math.max(-20, Math.min(60, diffY))}px)`;
    }
  }, { passive: true });
  node.addEventListener('touchend', () => {
    const diffX = currentX - startX;
    const diffY = currentY - startY;
    node.style.transform = '';
    node.classList.remove('swiping');
    node.classList.remove('swiping-vertical');
    if (swiping) {
      if (diffX < -50) { // Swipe left → reply
        showReplyBar(message);
      } else if (diffX > 50 && sent) { // Swipe right → delete (own messages only)
        showDeleteConfirm(node, message);
      }
    } else if (verticalSwiping && sent) {
      if (diffY > 40) { // Swipe down → edit (own messages only)
        showEditBar(message);
      }
    }
    startX = 0; startY = 0; currentX = 0; currentY = 0; swiping = false; verticalSwiping = false;
  });
}

function showDeleteConfirm(node, message) {
  // Remove any existing confirm
  $$('.delete-confirm-bubble').forEach(el => el.remove());
  const bubble = document.createElement('div');
  bubble.className = 'delete-confirm-bubble';
  bubble.innerHTML = `<span>حذف شود؟</span><button class="confirm-yes"><i class="fa-solid fa-check"></i></button><button class="confirm-no"><i class="fa-solid fa-xmark"></i></button>`;
  node.appendChild(bubble);
  $('.confirm-yes', bubble).onclick = (e) => { e.stopPropagation(); app.socket?.emit('deleteMessage', { conversationId: app.activeConversation, id: message.id }); bubble.remove(); };
  $('.confirm-no', bubble).onclick = (e) => { e.stopPropagation(); bubble.remove(); };
  // Auto remove after 4s
  setTimeout(() => bubble.remove(), 4000);
}



async function sendMessage(extra = {}) {
  if (!app.activeConversation) return showToast('chat', 'ابتدا یک گفتگو انتخاب کنید.', 'error');
  const editor = $('#chat-messageInput');
  const text = extra.text ?? (editor.innerText || '').trim();
  const html = extra.text ? null : editor.innerHTML;
  
  if (app.editingMessageId) {
    if (!text) return hideEditBar();
    app.socket?.emit('editMessage', {
      conversationId: app.activeConversation,
      id: app.editingMessageId,
      newText: text
    });
    editor.innerHTML = '';
    hideEditBar();
    return;
  }
  
  if (!text && !extra.attachments?.length) return startOrStopRecording();
  const tempId = `msg-${Date.now()}`;
  const optimistic = { 
    id: tempId, 
    conversationId: app.activeConversation, 
    fromId: app.user.userId, 
    fromName: app.user.name, 
    text, 
    html: html || text, 
    timestamp: new Date().toISOString(), 
    status: 'unsent', 
    replyTo: app.replyTo, 
    attachments: extra.attachments || [], 
    reactions: {} 
  };
  
  app.messages.push(optimistic); 
  renderMessages();
  editor.innerHTML = ''; 
  app.replyTo = null; 
  hideReplyBar(); 
  updateSendIcon();
  
  try {
    if (!navigator.onLine) {
      throw new Error('Offline');
    }
    await api('POST', `/api/conversations/${encodeURIComponent(app.activeConversation)}/messages`, { 
      text, 
      html: html || undefined, 
      clientMsgId: tempId, 
      replyTo: optimistic.replyTo, 
      attachments: extra.attachments || [], 
      sendAt: extra.sendAt, 
      expiresInSeconds: extra.expiresInSeconds 
    });
    optimistic.status = 'sent';
    await dbHelper.saveMessages([optimistic]);
    const idx = app.messages.findIndex(item => item.id === tempId);
    if (idx !== -1) {
      app.messages[idx].status = 'sent';
    }
    renderMessages();
  } catch (error) {
    console.warn('Could not send message immediately, queuing for offline sync:', error);
    optimistic.status = 'unsent';
    await dbHelper.addToOutbox(optimistic);
    await dbHelper.saveMessages([optimistic]);
    const idx = app.messages.findIndex(item => item.id === tempId);
    if (idx !== -1) {
      app.messages[idx].status = 'unsent';
    }
    renderMessages();
    showToast('chat', 'پیام در صف ارسال آفلاین قرار گرفت.', 'warning');
  }
}

async function syncOutbox() {
  if (!navigator.onLine) return;
  try {
    const outbox = await dbHelper.getOutbox();
    if (!outbox || !outbox.length) return;
    
    console.log(`Syncing ${outbox.length} unsent messages...`);
    
    for (const msg of outbox) {
      try {
        let attachmentsToUpload = [];
        
        for (const att of (msg.attachments || [])) {
          if (att._offlineFile) {
            const uploadedAtt = await uploadFile(att._offlineFile, true);
            if (uploadedAtt) {
              attachmentsToUpload.push(uploadedAtt);
            } else {
              throw new Error('Failed to upload offline file');
            }
          } else {
            attachmentsToUpload.push(att);
          }
        }
        
        await api('POST', `/api/conversations/${encodeURIComponent(msg.conversationId)}/messages`, {
          text: msg.text,
          html: msg.html || undefined,
          clientMsgId: msg.id,
          replyTo: msg.replyTo,
          attachments: attachmentsToUpload,
          sendAt: msg.sendAt,
          expiresInSeconds: msg.expiresInSeconds
        });
        
        await dbHelper.removeFromOutbox(msg.id);
        
        msg.status = 'sent';
        msg.attachments = attachmentsToUpload;
        msg.attachments.forEach(a => delete a._offlineFile);
        await dbHelper.saveMessages([msg]);
        
        if (app.activeConversation === msg.conversationId) {
          const idx = app.messages.findIndex(m => m.id === msg.id);
          if (idx !== -1) {
            app.messages[idx].status = 'sent';
            app.messages[idx].attachments = attachmentsToUpload;
          }
        }
      } catch (err) {
        console.error('Failed to sync message:', msg.id, err);
        break;
      }
    }
    
    if (app.activeConversation) {
      renderMessages();
    }
  } catch (error) {
    console.error('Outbox sync error:', error);
  }
}

function hideReplyBar() {
  app.replyTo = null;
  const bar = $('#chat-replyBar');
  if (bar) bar.style.display = 'none';
}

function showReplyBar(message) {
  app.replyTo = { id: message.id, text: message.text, fromName: message.fromName };
  const bar = $('#chat-replyBar');
  bar.style.display = 'flex';
  $('#chat-replyText').textContent = `${message.fromName || 'پیام'}: ${(message.text || '').substring(0, 40)}`;
  $('#chat-messageInput').focus();
}

function showEditBar(message) {
  app.editingMessageId = message.id;
  app.replyTo = null;
  hideReplyBar();
  const bar = $('#chat-editBar');
  if (bar) {
    bar.style.display = 'flex';
    $('#chat-editText').textContent = `در حال ویرایش: ${(message.text || '').substring(0, 40)}`;
  }
  const editor = $('#chat-messageInput');
  editor.innerHTML = message.text || '';
  editor.focus();
  // Move cursor to the end
  try {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {}
  updateSendIcon();
}

function hideEditBar() {
  app.editingMessageId = null;
  const bar = $('#chat-editBar');
  if (bar) bar.style.display = 'none';
  const editor = $('#chat-messageInput');
  if (editor) editor.innerHTML = '';
  updateSendIcon();
}

function updateActiveThemeUI() {
  const currentTheme = Number(localStorage.getItem('panahThemeIndex') || 3);
  $$('.theme-color').forEach(btn => {
    const index = Number(btn.dataset.themeIndex);
    btn.classList.toggle('active', index === currentTheme);
  });
}

function applyTheme(index) {
  localStorage.setItem('panahThemeIndex', index);
  const themes = ['gold', 'purple', 'green', ''];
  const theme = themes[index];
  if (theme) {
    document.body.setAttribute('data-theme', theme);
  } else {
    document.body.removeAttribute('data-theme');
  }
  updateActiveThemeUI();
}

function insertTextAtCursor(el, text, shouldFocus = true) {
  if (shouldFocus) {
    el.focus();
  }
  const sel = window.getSelection();
  if (sel.getRangeAt && sel.rangeCount) {
    let range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range = range.cloneRange();
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }
  el.appendChild(document.createTextNode(text));
}


function updateSendIcon() {
  const editor = $('#chat-messageInput');
  const hasText = (editor?.innerText || '').trim().length > 0;
  if (app.editingMessageId) {
    $('#chat-sendBtn').innerHTML = '<i class="fa-solid fa-check"></i>';
  } else {
    $('#chat-sendBtn').innerHTML = hasText ? '<i class="fa-solid fa-paper-plane"></i>' : `<i class="fa-solid ${app.recording ? 'fa-stop' : 'fa-microphone'}"></i>`;
  }
}

async function uploadFile(file, forceOnline = false) {
  if (!file) return null;
  
  if (!navigator.onLine && !forceOnline) {
    const localUrl = URL.createObjectURL(file);
    return { fileUrl: localUrl, fileName: file.name, type: file.type || 'file', _offlineFile: file };
  }
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    
    const uploadId = Math.random().toString(36).substring(2, 9);
    app.activeUploads.push({ id: uploadId, name: file.name, percent: 0, xhr: xhr });
    renderUploadProgress();
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        const active = app.activeUploads.find(u => u.id === uploadId);
        if (active) {
          active.percent = percent;
          renderUploadProgress();
        }
      }
    };
    xhr.onload = () => {
      app.activeUploads = app.activeUploads.filter(u => u.id !== uploadId);
      renderUploadProgress();
      
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve({ fileUrl: data.fileUrl, fileName: data.fileName || file.name, type: file.type || 'file' });
      } else {
        if (!forceOnline) {
          const localUrl = URL.createObjectURL(file);
          resolve({ fileUrl: localUrl, fileName: file.name, type: file.type || 'file', _offlineFile: file });
        } else {
          const err = JSON.parse(xhr.responseText || '{}');
          showToast('chat', err.error || 'آپلود ناموفق بود', 'error');
          resolve(null);
        }
      }
    };
    xhr.onerror = () => {
      app.activeUploads = app.activeUploads.filter(u => u.id !== uploadId);
      renderUploadProgress();
      
      if (!forceOnline) {
        const localUrl = URL.createObjectURL(file);
        resolve({ fileUrl: localUrl, fileName: file.name, type: file.type || 'file', _offlineFile: file });
      } else {
        showToast('chat', 'خطا در ارتباط', 'error');
        resolve(null);
      }
    };
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${app.token}`);
    xhr.send(form);
  });
}

function renderUploadProgress() {
  let bar = $('#chat-uploadBar');
  if (app.activeUploads.length === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }
  
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'chat-uploadBar';
    bar.className = 'upload-bar';
    bar.innerHTML = `<div class="upload-bar-info"><i class="fa-solid fa-file-arrow-up"></i><span class="upload-bar-name"></span><span class="upload-bar-percent"></span></div><div class="upload-bar-track"><div class="upload-bar-fill"></div></div><button class="upload-bar-cancel"><i class="fa-solid fa-xmark"></i></button>`;
    $('#page-chat .app-container').appendChild(bar);
    bar.querySelector('.upload-bar-cancel').onclick = () => {
      app.activeUploads.forEach(u => u.xhr?.abort());
      app.activeUploads = [];
      renderUploadProgress();
      showToast('chat', 'آپلودها لغو شدند.');
    };
  }
  
  bar.style.display = 'flex';
  if (app.activeUploads.length === 1) {
    const u = app.activeUploads[0];
    bar.querySelector('.upload-bar-name').textContent = u.name.length > 20 ? u.name.substring(0, 18) + '...' : u.name;
    bar.querySelector('.upload-bar-percent').textContent = `${u.percent.toLocaleString('fa-IR')}٪`;
    bar.querySelector('.upload-bar-fill').style.width = `${u.percent}%`;
  } else {
    const count = app.activeUploads.length;
    const avgPercent = Math.round(app.activeUploads.reduce((sum, u) => sum + u.percent, 0) / count);
    bar.querySelector('.upload-bar-name').textContent = `در حال آپلود ${count.toLocaleString('fa-IR')} فایل...`;
    bar.querySelector('.upload-bar-percent').textContent = `${avgPercent.toLocaleString('fa-IR')}٪`;
    bar.querySelector('.upload-bar-fill').style.width = `${avgPercent}%`;
  }
}

function hideUploadProgress() {
  const bar = $('#chat-uploadBar');
  if (bar) bar.style.display = 'none';
}

async function chooseAndSendFile(accept = '*/*') {
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = accept; picker.multiple = true;
  picker.addEventListener('change', async () => {
    const files = [...(picker.files || [])];
    if (!files.length) return;
    files.forEach(async (file) => {
      try {
        const attachment = await uploadFile(file);
        if (attachment) await sendMessage({ attachments: [attachment] });
      } catch (err) {
        console.error('File upload failed:', err);
      }
    });
  });
  picker.click();
}

async function startOrStopRecording() {
  // If already recording, handle pause/stop
  if (app.recording) {
    if (app.recordingPaused) {
      // Resume
      app.recorder.resume();
      app.recordingPaused = false;
      updateRecordingUI();
    } else {
      // Stop and send
      app.recorder.stop();
      app.recording = false;
      app.recordingPaused = false;
      clearInterval(app.recordingTimer);
      hideRecordingUI();
      updateSendIcon();
    }
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    app.recordingChunks = [];
    app.recordingSeconds = 0;
    app.recordingPaused = false;
    
    // تشخیص نوع فرمت صوتی پشتیبانی‌شده توسط سیستم‌عامل (مخصوصاً iOS Safari)
    let mimeType = 'audio/webm';
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = ''; // اجازه دهیم مرورگر خودش بهترین فرمت را انتخاب کند
        }
      }
    } else {
      mimeType = ''; // برای مرورگرهای فاقد متد بررسی
    }

    const options = mimeType ? { mimeType } : {};
    app.recorder = new MediaRecorder(stream, options);
    app.recorder.ondataavailable = event => { if (event.data.size) app.recordingChunks.push(event.data); };
    app.recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      hideRecordingUI();
      if (app.recordingCancelled) {
        app.recordingCancelled = false;
        app.recordingChunks = [];
        return;
      }
      if (!app.recordingChunks.length) return;
      
      const recordedMime = app.recorder.mimeType || mimeType || 'audio/webm';
      const extension = recordedMime.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([new Blob(app.recordingChunks, { type: recordedMime })], `voice-${Date.now()}.${extension}`, { type: recordedMime });
      const attachment = await uploadFile(file);
      if (attachment) await sendMessage({ attachments: [attachment] });
    };
    app.recorder.start();
    app.recording = true;
    updateSendIcon();
    showRecordingUI();
    // Timer
    app.recordingTimer = setInterval(() => {
      if (!app.recordingPaused) {
        app.recordingSeconds++;
        updateRecordingUI();
      }
    }, 1000);
  } catch { showToast('chat', 'دسترسی میکروفون داده نشد یا خطا رخ داد.', 'error'); }
}

function pauseRecording() {
  if (!app.recording || app.recordingPaused) return;
  app.recorder.pause();
  app.recordingPaused = true;
  updateRecordingUI();
}

function cancelRecording() {
  if (!app.recording) return;
  app.recordingCancelled = true;
  app.recordingChunks = [];
  app.recorder.stop();
  app.recording = false;
  app.recordingPaused = false;
  clearInterval(app.recordingTimer);
  hideRecordingUI();
  updateSendIcon();
  showToast('chat', 'ضبط لغو شد.');
}

function showRecordingUI() {
  let ui = $('#chat-recordBar');
  if (!ui) {
    ui = document.createElement('div');
    ui.id = 'chat-recordBar';
    ui.className = 'record-bar';
    ui.innerHTML = `<div class="record-dot"></div><span class="record-time">۰۰:۰۰</span><button class="record-pause"><i class="fa-solid fa-pause"></i></button><button class="record-cancel"><i class="fa-solid fa-trash"></i></button>`;
    $('#page-chat .app-container').appendChild(ui);
    ui.querySelector('.record-pause').onclick = () => {
      if (app.recordingPaused) { app.recorder.resume(); app.recordingPaused = false; }
      else { app.recorder.pause(); app.recordingPaused = true; }
      updateRecordingUI();
    };
    ui.querySelector('.record-cancel').onclick = cancelRecording;
  }
  ui.style.display = 'flex';
  updateRecordingUI();
}

function hideRecordingUI() {
  const ui = $('#chat-recordBar');
  if (ui) ui.style.display = 'none';
}

function updateRecordingUI() {
  const ui = $('#chat-recordBar');
  if (!ui) return;
  const mins = String(Math.floor(app.recordingSeconds / 60)).padStart(2, '0');
  const secs = String(app.recordingSeconds % 60).padStart(2, '0');
  ui.querySelector('.record-time').textContent = `${mins}:${secs}`.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const dot = ui.querySelector('.record-dot');
  dot.classList.toggle('paused', app.recordingPaused);
  const pauseBtn = ui.querySelector('.record-pause i');
  pauseBtn.className = app.recordingPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
}

async function loadContacts() {
  try { app.contacts = await api('GET', '/api/contacts'); } catch { app.contacts = []; }
}

async function loadContactsPage() {
  try {
    const [contacts, requests] = await Promise.all([api('GET', '/api/contacts'), api('GET', '/api/friend-requests/incoming')]);
    app.contacts = contacts; app.requests = requests;
    renderContacts();
  } catch (error) { showToast('contacts', error.message, 'error'); }
}

function renderContacts(searchResults = null) {
  const page = $('#page-contacts');
  const requestSection = $('#contacts-requestsSection');
  $('#contacts-requestCount').textContent = app.requests.length.toLocaleString('fa-IR');
  requestSection.style.display = app.requests.length ? '' : 'none';
  $$('.request-item', requestSection).forEach(node => node.remove());
  const requestHeader = $('.section-header', requestSection);
  app.requests.forEach(request => {
    const node = document.createElement('div'); node.className = 'contact-item request-item';
    node.innerHTML = `<div class="avatar-container"><img src="${escapeHtml(request.fromAvatar || '/icons/default-avatar.png')}" class="avatar" alt=""></div><div class="contact-info"><span class="contact-name">${escapeHtml(request.fromName || request.fromUsername)}</span><span class="contact-sub">درخواست دوستی</span></div><div class="request-actions"><button class="action-btn btn-accept">تایید</button><button class="action-btn btn-delete">حذف</button></div>`;
    $('.btn-accept', node).onclick = () => respondFriendRequest(request.fromId, true, node);
    $('.btn-delete', node).onclick = () => respondFriendRequest(request.fromId, false, node);
    requestHeader.after(node);
  });
  const section = $('#contacts-myContactsSection');
  $$('.contact-item', section).forEach(node => node.remove());
  const header = $('.section-header', section);
  const list = searchResults || app.contacts;
  list.forEach(contact => {
    const isResult = !app.contacts.some(item => item.userId === contact.userId);
    const isSelf = contact.isSelf;
    const node = document.createElement('div'); node.className = 'contact-item my-contact';
    node.innerHTML = `<div class="avatar-container ${contact.online ? 'is-online' : ''}"><img src="${escapeHtml(contact.avatar || '/icons/default-avatar.png')}" class="avatar" alt="">${contact.online ? '<div class="online-dot"></div>' : ''}</div><div class="contact-info"><span class="contact-name">${escapeHtml(isSelf ? 'پیام‌های ذخیره‌شده' : (contact.name || contact.username))}</span><span class="contact-sub ${contact.online ? 'online-text' : ''}">${isResult ? `@${escapeHtml(contact.username || '')}` : (isSelf ? 'پیام به خودم' : (contact.online ? 'آنلاین' : relativeTime(contact.lastSeen)))}</span></div>${isSelf ? '' : `<button class="options-btn"><i class="fa-solid ${isResult ? 'fa-user-plus' : 'fa-ellipsis-vertical'}"></i></button>`}`;
    node.onclick = event => { if (!event.target.closest('.options-btn')) { if (isSelf) openConversationByUser(contact); else showPage('peer-profile', { userId: contact.userId, peer: contact }); } };
    if (!isSelf) { const optBtn = $('.options-btn', node); if (optBtn) optBtn.onclick = event => { event.stopPropagation(); isResult ? sendFriendRequest(contact.userId, node) : deleteContact(contact.userId, node); }; }
    header.after(node);
  });
}

async function searchContacts(query) {
  const local = app.contacts.filter(item => `${item.name} ${item.username}`.toLowerCase().includes(query.toLowerCase()));
  if (query.length < 3) return renderContacts(local);
  try { renderContacts(await api('GET', `/api/users?query=${encodeURIComponent(query)}`)); } catch { renderContacts(local); }
}

async function respondFriendRequest(fromId, accept, node) {
  try {
    await api('POST', `/api/friend-requests/${accept ? 'accept' : 'reject'}`, { fromId });
    node.style.animation = 'fadeOut .3s forwards'; setTimeout(() => node.remove(), 280);
    app.requests = app.requests.filter(item => item.fromId !== fromId);
    if (accept) await loadContacts();
    $('#contacts-requestCount').textContent = app.requests.length.toLocaleString('fa-IR');
    showToast('contacts', accept ? 'درخواست تایید شد.' : 'درخواست حذف شد.');
  } catch (error) { showToast('contacts', error.message, 'error'); }
}

async function sendFriendRequest(userId, node) {
  try { await api('POST', '/api/friend-requests/send', { toUserId: userId }); node?.remove(); showToast('contacts', 'درخواست دوستی ارسال شد.'); } catch (error) { showToast('contacts', error.message, 'error'); }
}

async function deleteContact(userId, node) {
  if (!confirm('آیا از حذف این مخاطب مطمئن هستید؟')) return;
  try { await api('DELETE', `/api/contacts/${encodeURIComponent(userId)}`); node.remove(); app.contacts = app.contacts.filter(item => item.userId !== userId); showToast('contacts', 'مخاطب حذف شد.'); } catch (error) { showToast('contacts', error.message, 'error'); }
}

async function loadNotifications() {
  try { app.notifications = await api('GET', '/api/notifications'); renderNotifications(); } catch (error) { showToast('notifications', error.message, 'error'); }
}

function renderNotifications() {
  const list = $('#notifications-notifList');
  const items = app.notificationFilter === 'unread' ? app.notifications.filter(item => !item.read) : app.notifications;
  list.innerHTML = '';
  if (!items.length) { list.innerHTML = '<div class="dynamic-empty"><i class="fa-solid fa-bell"></i><strong>اعلانی ندارید</strong><span>هنوز اعلان جدیدی دریافت نکرده‌اید.</span></div>'; return; }
  const newItems = items.filter(n => !n.read);
  const oldItems = items.filter(n => n.read);
  if (newItems.length) {
    list.innerHTML += '<div class="date-section">جدید</div>';
    newItems.forEach(item => list.appendChild(createNotifNode(item)));
  }
  if (oldItems.length) {
    list.innerHTML += '<div class="date-section" style="margin-top:10px;">قدیمی‌تر</div>';
    oldItems.forEach(item => list.appendChild(createNotifNode(item)));
  }
  if (!newItems.length && !oldItems.length) {
    items.forEach(item => list.appendChild(createNotifNode(item)));
  }
  const unread = app.notifications.filter(item => !item.read).length;
  const badge = $('#notifications-mainNavBadge');
  if (badge) { badge.textContent = unread ? unread.toLocaleString('fa-IR') : ''; badge.style.display = unread ? '' : 'none'; }
}

function createNotifNode(item) {
  const isSystem = item.type === 'system' || (!item.fromAvatar && !item.fromId);
  const node = document.createElement('div');
  node.className = `notif-item ${item.read ? '' : 'unread-bg'}`;
  node.innerHTML = `<div class="avatar-container">${isSystem ? `<div class="system-icon"><i class="fa-solid fa-shield-halved"></i></div>` : `<img src="${escapeHtml(item.fromAvatar || '/icons/default-avatar.png')}" class="avatar" alt="">`}</div><div class="notif-content"><span class="notif-title">${escapeHtml(item.fromName || 'سیستم پناه')}</span><span class="notif-desc">${item.type === 'friend_request' ? 'برای شما درخواست دوستی فرستاد' : item.type === 'friend_accepted' ? 'درخواست دوستی شما را پذیرفت' : 'پیام جدیدی ارسال شد'}</span></div><div class="notif-meta"><span class="notif-time">${relativeTime(item.createdAt)}</span>${item.read ? '' : '<div class="unread-indicator dot"></div>'}</div>`;
  node.onclick = () => { item.read = true; node.classList.remove('unread-bg'); const dot = node.querySelector('.unread-indicator'); if (dot) dot.style.animation = 'popOut 0.3s forwards'; };
  return node;
}

async function loadMyProfile() {
  try { app.user = await api('GET', '/api/me'); renderMyProfile(); } catch (error) { showToast('profile', error.message, 'error'); }
}

function renderMyProfile() {
  const page = $('#page-profile');
  $('.profile-card .avatar', page).src = app.user.avatar || '/icons/default-avatar.png';
  $('.user-name', page).textContent = app.user.name || 'کاربر پناه';
  $('.user-phone', page).textContent = app.user.username || '';
  $('.user-bio', page).innerHTML = `<i class="fa-solid fa-seedling" style="color:#4caf50"></i> ${escapeHtml(app.user.bio || 'بیوگرافی خود را اضافه کنید')}`;
  
  const notifToggle = $('#profile-notif-toggle');
  if (notifToggle) {
    const savedNotifState = localStorage.getItem('panahPushNotifications') || 'disabled';
    notifToggle.checked = (savedNotifState === 'enabled' && Notification.permission === 'granted');
  }
}

async function editMyProfile() {
  showPage('edit-profile');
  $('#editprofile-name').value = app.user.name || '';
  $('#editprofile-bio').value = app.user.bio || '';
  $('#editprofile-avatar').src = app.user.avatar || '/icons/default-avatar.png';
}

async function saveMyProfile() {
  const name = $('#editprofile-name').value.trim();
  const bio = $('#editprofile-bio').value.trim();
  if (!name) return showToast('editprofile', 'نام نمی‌تواند خالی باشد.', 'error');
  try {
    const data = await api('POST', '/api/profile/update', { name, bio });
    app.user = data.profile;
    showToast('editprofile', 'پروفایل ذخیره شد.');
    setTimeout(() => showPage('profile'), 600);
  } catch (error) { showToast('editprofile', error.message, 'error'); }
}

async function uploadAvatar(file) {
  const form = new FormData(); form.append('avatar', file);
  const response = await fetch('/api/profile/avatar', { method: 'POST', headers: { Authorization: `Bearer ${app.token}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'آپلود آواتار ناموفق بود');
  app.user.avatar = data.avatarUrl;
  if (!$('#page-profile').classList.contains('hidden')) renderMyProfile();
}

async function loadPeerProfile(userId) {
  if (!userId) return showPage('contacts');
  const page = $('#page-peer-profile');
  // Reset to skeleton state
  $('.user-name', page).textContent = '‌‌‌‌‌‌‌‌‌‌‌‌';
  $('.user-name', page).classList.add('skeleton-text');
  $('.online-status', page).textContent = '‌‌‌‌‌';
  $('.online-status', page).classList.add('skeleton-text');
  const bioSpan = $('#peer-profile-bioText span', page);
  if (bioSpan) { bioSpan.textContent = '‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌‌'; bioSpan.classList.add('skeleton-text'); }
  $$('.info-value', page).forEach(el => { el.textContent = '‌‌‌‌‌‌‌‌‌‌'; el.classList.add('skeleton-text'); });
  $('.profile-card .avatar', page).classList.add('skeleton-img');
  try {
    const data = await api('GET', `/api/profile/${encodeURIComponent(userId)}`);
    app.activePeer = data.profile; renderPeerProfile(data);
  } catch (error) { showToast('peer-profile', error.message, 'error'); }
}

function renderPeerProfile(data) {
  const peer = data.profile; const page = $('#page-peer-profile');
  // Remove skeleton states
  $$('.skeleton-text', page).forEach(el => el.classList.remove('skeleton-text'));
  $$('.skeleton-img', page).forEach(el => el.classList.remove('skeleton-img'));
  
  $('.profile-card .avatar', page).src = peer.avatar || '/icons/default-avatar.png';
  $('.user-name', page).textContent = peer.name || peer.username;
  $('.online-status', page).textContent = peer.online ? 'آنلاین' : relativeTime(peer.lastSeen);
  $('.online-status', page).style.color = peer.online ? 'var(--online-color)' : 'var(--text-muted)';
  const bioSpan = $('#peer-profile-bioText span', page);
  if (bioSpan) bioSpan.textContent = peer.bio || 'بیوگرافی ثبت نشده است';
  const values = $$('.info-value', page);
  if (values[0]) values[0].textContent = peer.username || '';
  if (values[1]) values[1].textContent = `@${peer.username || ''}`;
  const buttons = $$('.action-buttons .btn', page);
  if (data.mutual) {
    buttons[0].textContent = 'حذف از مخاطبین';
    buttons[0].className = 'btn btn-outline';
    buttons[0].onclick = async () => { try { await api('DELETE', `/api/contacts/${encodeURIComponent(peer.userId)}`); showToast('peer-profile', 'مخاطب حذف شد.'); buttons[0].textContent = 'افزودن به مخاطبین'; buttons[0].onclick = () => sendFriendRequest(peer.userId); } catch (error) { showToast('peer-profile', error.message, 'error'); } };
  } else {
    buttons[0].textContent = 'افزودن به مخاطبین';
    buttons[0].className = 'btn btn-outline';
    buttons[0].onclick = () => sendFriendRequest(peer.userId);
  }
  buttons[1].textContent = 'پیام';
  buttons[1].onclick = () => openConversationByUser(peer);
}

async function loadInbox() {
  try { app.inbox = await api('GET', '/api/inbox'); renderInbox(); } catch (error) { showToast('inbox', error.message, 'error'); }
}

function renderInbox() {
  const list = $('#inbox-requestList'); list.innerHTML = '';
  if (!app.inbox.length) {
    list.innerHTML = `
      <div class="dynamic-empty">
        <i class="fa-solid fa-envelope-open" style="font-size: 3rem; margin-bottom: 8px;"></i>
        <strong>صندوق ورودی شما خالی است.</strong>
        <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0 0;">هیچ پیام ناشناسی در حال حاضر وجود ندارد.</p>
      </div>
    `;
    return;
  }
  app.inbox.forEach(item => {
    const node = document.createElement('div'); node.className = 'request-card';
    node.innerHTML = `
      <div class="req-header">
        <div class="req-user-info">
          <img src="${escapeHtml(item.fromAvatar || '/icons/default-avatar.png')}" class="avatar" alt="">
          <span class="req-name">${escapeHtml(item.fromName || 'کاربر ناشناس')}</span>
        </div>
        <span class="req-time">${relativeTime(item.createdAt)}</span>
      </div>
      <div class="req-message">${escapeHtml(item.text)}</div>
      <div class="req-actions">
        <button class="action-btn btn-accept"><i class="fa-solid fa-check"></i> پذیرش</button>
        <button class="action-btn btn-ignore"><i class="fa-solid fa-xmark"></i> نادیده گرفتن</button>
      </div>
    `;
    $('.btn-accept', node).onclick = () => acceptInbox(item, node);
    $('.btn-ignore', node).onclick = () => deleteInbox(item.id, node);
    list.appendChild(node);
  });
}

async function acceptInbox(item, node) {
  try {
    const data = await api('POST', `/api/inbox/${encodeURIComponent(item.id)}/accept`);
    node.remove(); app.inbox = app.inbox.filter(entry => entry.id !== item.id);
    await openConversation(data.conversationId, data.peer);
  } catch (error) { showToast('inbox', error.message, 'error'); }
}

async function deleteInbox(id, node) {
  try { await api('DELETE', `/api/inbox/${encodeURIComponent(id)}`); node.style.animation = 'fadeOut .3s forwards'; setTimeout(() => node.remove(), 280); app.inbox = app.inbox.filter(item => item.id !== id); if (!app.inbox.length) setTimeout(renderInbox, 300); } catch (error) { showToast('inbox', error.message, 'error'); }
}

function setupStatesPage() {
  updateActiveThemeUI();
}

function openScheduleModal() {
  if (!app.activeConversation) return showToast('chat', 'ابتدا یک گفتگو انتخاب کنید.', 'error');
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  $('#chat-scheduleDate').value = tomorrow.toISOString().split('T')[0];
  $('#chat-scheduleText').value = '';
  $('#chat-scheduleModal').classList.add('active');
}

function openSecretModal() {
  if (!app.activeConversation) return showToast('chat', 'ابتدا یک گفتگو انتخاب کنید.', 'error');
  $('#chat-secretText').value = '';
  $('#chat-secretModal').classList.add('active');
}

async function clearChatHistory() {
  if (!app.activeConversation) return;
  if (!confirm('تمام پیام‌های این گفتگو حذف می‌شود. مطمئنید؟')) return;
  app.socket?.emit('clearChatHistory', { conversationId: app.activeConversation });
  app.messages = [];
  renderMessages();
}

async function submitScheduleMessage() {
  const text = $('#chat-scheduleText').value.trim();
  if (!text) return showToast('chat', 'متن پیام را وارد کنید.', 'error');
  const dateVal = $('#chat-scheduleDate').value;
  const timeVal = $('#chat-scheduleTime').value || '10:00';
  if (!dateVal) return showToast('chat', 'تاریخ را انتخاب کنید.', 'error');
  const sendAt = new Date(`${dateVal}T${timeVal}:00`).toISOString();
  try {
    await api('POST', `/api/conversations/${encodeURIComponent(app.activeConversation)}/messages`, { text, clientMsgId: `sched-${Date.now()}`, sendAt });
    $('#chat-scheduleModal').classList.remove('active');
    showToast('chat', 'پیام زمان‌بندی شد.');
  } catch (error) { showToast('chat', error.message, 'error'); }
}

async function submitSecretMessage() {
  const text = $('#chat-secretText').value.trim();
  if (!text) return showToast('chat', 'متن پیام مخفی را وارد کنید.', 'error');
  const timer = Number($('input[name="chatSecretTimer"]:checked')?.value || 10);
  try {
    await api('POST', `/api/conversations/${encodeURIComponent(app.activeConversation)}/messages`, { text, clientMsgId: `secret-${Date.now()}`, expiresInSeconds: timer });
    $('#chat-secretModal').classList.remove('active');
    showToast('chat', `پیام مخفی ارسال شد (${timer} ثانیه).`);
  } catch (error) { showToast('chat', error.message, 'error'); }
}

function selectTheme(row, index) {
  $$('.theme-option-row', $('#page-states')).forEach(node => node.classList.toggle('active', node === row));
  applyTheme(index);
  const themeNames = ['طلایی لوکس', 'ارغوانی ملایم', 'سبز زیتونی', 'استاندارد پناه'];
  showToast('states', `تم ${themeNames[index]} فعال شد.`);
  setTimeout(() => showPage(app.previousPage || 'conversations'), 600);
}

async function scheduleMessageFromState() {
  // Deprecated - use chat inline modal instead
  submitScheduleMessage();
}

async function sendSecretMessageFromState() {
  // Deprecated - use chat inline modal instead
  submitSecretMessage();
}

function showFormatBarIfSelection() {
  const sel = window.getSelection();
  const formatBar = $('#chat-formatBar');
  if (sel && sel.toString().trim().length > 0 && $('#chat-messageInput').contains(sel.anchorNode)) {
    formatBar.classList.add('active');
  } else {
    formatBar.classList.remove('active');
  }
}

function connectSocket() {
  app.socket?.disconnect();
  app.socket = io({ auth: { token: app.token } });
  app.socket.on('connect', () => { 
    if (app.activeConversation) app.socket.emit('joinConversation', { conversationId: app.activeConversation }); 
    syncOutbox(); 
  });
  app.socket.on('newMessage', message => {
    if (message.conversationId === app.activeConversation) {
      const optimisticIndex = app.messages.findIndex(item => item.id === message.clientMsgId);
      if (optimisticIndex >= 0) app.messages[optimisticIndex] = message; else app.messages.push(message);
      renderMessages();
      app.socket?.emit('messagesSeen', { conversationId: app.activeConversation });
    }
    loadConversations(false);
  });
  app.socket.on('messagesWereSeen', async ({ viewerId, conversationId }) => {
    if (conversationId === app.activeConversation) {
      const updatedMessages = [];
      app.messages.forEach(msg => {
        if (msg.fromId !== viewerId && msg.status !== 'seen') {
          msg.status = 'seen';
          updatedMessages.push(msg);
        }
      });
      if (updatedMessages.length > 0) {
        renderMessages();
        await dbHelper.saveMessages(updatedMessages);
      }
    }
  });
  app.socket.on('messageEdited', async message => {
    const index = app.messages.findIndex(item => item.id === message.id);
    if (index >= 0) {
      app.messages[index] = message;
      renderMessages();
    }
    await dbHelper.saveMessages([message]);
  });
  app.socket.on('messageDeleted', async ({ id }) => {
    app.messages = app.messages.filter(item => item.id !== id);
    renderMessages();
    await dbHelper.deleteMessage(id);
  });
  app.socket.on('chatHistoryCleared', ({ conversationId }) => { if (conversationId === app.activeConversation) { app.messages = []; renderMessages(); } loadConversations(false); });
  app.socket.on('reactionUpdated', ({ messageId, reactions }) => {
    const item = app.messages.find(message => message.id === messageId);
    if (item) {
      if (!item.reactions) item.reactions = {};
      for (const [emoji, users] of Object.entries(reactions)) {
        if (!users || users.length === 0) {
          delete item.reactions[emoji];
        } else {
          item.reactions[emoji] = users;
        }
      }
      renderMessages();
    }
  });
  let peerTypingTimeout;
  app.socket.on('userIsTyping', ({ userId, isTyping }) => {
    if (app.activePeer?.userId !== userId) return;
    const status = $('#page-chat .details .status');
    if (isTyping) {
      status.textContent = 'در حال نوشتن...';
      status.classList.add('online');
      clearTimeout(peerTypingTimeout);
      peerTypingTimeout = setTimeout(() => {
        const isOnline = Boolean(app.activePeer?.online);
        status.textContent = isOnline ? 'آنلاین' : 'آخرین بازدید اخیراً';
        status.classList.toggle('online', isOnline);
      }, 4000);
    } else {
      clearTimeout(peerTypingTimeout);
      const isOnline = Boolean(app.activePeer?.online);
      status.textContent = isOnline ? 'آنلاین' : 'آخرین بازدید اخیراً';
      status.classList.toggle('online', isOnline);
    }
  });
  app.socket.on('presenceChanged', ({ userId, status }) => {
    if (app.activePeer?.userId === userId) {
      app.activePeer.online = (status === 'online');
      const el = $('#page-chat .details .status');
      el.textContent = status === 'online' ? 'آنلاین' : 'آخرین بازدید اخیراً';
      el.classList.toggle('online', status === 'online');
    }
  });
  app.socket.on('friendRequest', () => loadContactsPage());
  app.socket.on('inboxMessage', () => { if (!$('#page-inbox').classList.contains('hidden')) loadInbox(); });
}

function bindNavigation() {
  const routes = { 'پروفایل': 'profile', 'اعلان‌ها': 'notifications', 'گفتگوها': 'conversations', 'مخاطبین': 'contacts' };
  $$('.bottom-nav .nav-item').forEach(link => {
    link.addEventListener('click', event => { event.preventDefault(); showPage(routes[$('span', link)?.textContent.trim()] || 'conversations'); });
  });
  $('#page-signup .login-prompt a').onclick = event => { event.preventDefault(); showPage('login'); };
  $('#page-peer-profile .page-header .icon-btn').onclick = () => showPage(app.previousPage || 'contacts');
  $('#inbox-backBtn').onclick = () => showPage('conversations');
  $('#page-profile .page-header .icon-btn').onclick = () => showPage('conversations');
  $('#conv-menuBtn').onclick = () => $('#conversations-menuModal').classList.add('active');
  $('#conversations-menuModal .modal-overlay-bg').onclick = () => $('#conversations-menuModal').classList.remove('active');
  $$('#conversations-menuModal .option-item').forEach(item => item.onclick = () => {
    $('#conversations-menuModal').classList.remove('active');
    const action = item.dataset.action;
    if (action === 'inbox') showPage('inbox');
    else if (action === 'saved') { const self = app.contacts.find(c => c.isSelf); if (self) openConversationByUser(self); else showToast('conversations', 'پیام ذخیره‌شده‌ای ندارید.'); }
    else if (action === 'theme') showPage('states');
    else if (action === 'logout') { if (confirm('از حساب خارج می‌شوید؟')) { clearToken(); app.socket?.disconnect(); showPage('login'); } }
  });
  $('#page-conversations .page-header .icon-btn:last-child').onclick = () => $('#conversations-searchInput').focus();
  $('#page-conversations .fab').onclick = () => showPage('contacts');
  $('#contacts-addBtn').onclick = () => {
    $('#contacts-addInput').value = '';
    $('#contacts-addResult').innerHTML = '';
    $('#contacts-addModal').classList.add('active');
    setTimeout(() => $('#contacts-addInput').focus(), 100);
  };
  $('#contacts-addModal .modal-overlay-bg').onclick = () => $('#contacts-addModal').classList.remove('active');
  $('#contacts-addModal .close-btn').onclick = () => $('#contacts-addModal').classList.remove('active');
  $('#contacts-addSubmit').onclick = async () => {
    const query = $('#contacts-addInput').value.trim();
    if (!query) return showToast('contacts', 'مقداری وارد کنید.', 'error');
    try {
      const users = await api('GET', `/api/users?query=${encodeURIComponent(query)}`);
      const container = $('#contacts-addResult');
      if (!users.length) { container.innerHTML = '<p style="text-align:center;color:#888;font-size:12px;padding:10px;">کاربری پیدا نشد.</p>'; return; }
      container.innerHTML = '';
      users.forEach(user => {
        const item = document.createElement('div'); item.className = 'result-item';
        item.innerHTML = `<img src="${escapeHtml(user.avatar || '/icons/default-avatar.png')}" alt=""><div class="result-info"><div class="result-name">${escapeHtml(user.name || user.username)}</div><div class="result-username">@${escapeHtml(user.username || '')}</div></div><button class="add-btn">افزودن</button>`;
        $('.add-btn', item).onclick = async (e) => { e.stopPropagation(); await sendFriendRequest(user.userId); item.remove(); showToast('contacts', 'درخواست دوستی ارسال شد.'); };
        container.appendChild(item);
      });
    } catch (error) { showToast('contacts', error.message, 'error'); }
  };
  $('#contacts-addInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#contacts-addSubmit').click(); });
}

function bindEvents() {
  bindNavigation();
  window.addEventListener('online', syncOutbox);
  $('#login-loginForm').addEventListener('submit', handleLogin);
  $('#signup-registerForm').addEventListener('submit', handleSignup);
  $('#login-signupBtn').addEventListener('click', () => showPage('signup'));
  $('#signup-avatarUpload').addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast('signup', 'حجم تصویر بیشتر از ۵ مگابایت است.', 'error');
    $('#signup-avatarPreview').src = URL.createObjectURL(file); $('#signup-avatarPreview').style.display = 'block'; $('#signup-avatarPlaceholder').style.display = 'none';
  });
  $$('#page-signup .toggle-password').forEach((button, index) => button.onclick = () => { const input = index ? $('#signup-confirmPassword') : $('#signup-password'); input.type = input.type === 'password' ? 'text' : 'password'; $('i', button).classList.toggle('fa-eye'); $('i', button).classList.toggle('fa-eye-slash'); });
  $('#conversations-searchInput').addEventListener('input', renderConversations);
  $$('#conversations-tabsContainer .tab-btn').forEach(button => button.onclick = () => { $$('#conversations-tabsContainer .tab-btn').forEach(node => node.classList.toggle('active', node === button)); app.conversationFilter = button.dataset.filter; $('#conversations-searchInput').value = ''; renderConversations(); });
  let typingTimeout;
  let isCurrentlyTyping = false;
  $('#chat-messageInput').addEventListener('input', () => {
    updateSendIcon();
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      app.socket?.emit('typing', { conversationId: app.activeConversation, isTyping: true });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isCurrentlyTyping = false;
      app.socket?.emit('typing', { conversationId: app.activeConversation, isTyping: false });
    }, 3000);
  });
  $('#chat-messageInput').addEventListener('keydown', event => {
    // Enter alone = new line, Ctrl+Enter or meta+Enter = send
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); sendMessage(); }
  });
  // Paste image support
  $('#chat-messageInput').addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) { try { const att = await uploadFile(file); if (att) await sendMessage({ attachments: [att] }); } catch {} }
        return;
      }
    }
  });
  const hideEmojiPicker = () => {
    if (app.emojiInserting) return;
    const picker = $('#chat-emojiPicker');
    if (picker) {
      picker.classList.remove('active');
      picker.style.display = 'none';
    }
  };
  // Show format bar on text selection
  $('#chat-messageInput').addEventListener('mouseup', showFormatBarIfSelection);
  $('#chat-messageInput').addEventListener('keyup', showFormatBarIfSelection);
  $('#chat-messageInput').addEventListener('focus', hideEmojiPicker);
  $('#chat-messageInput').addEventListener('keydown', hideEmojiPicker);
  // Emoji button - toggle custom emoji picker
  $('#page-chat .emoji-btn').onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const picker = $('#chat-emojiPicker');
    const isActive = picker.classList.toggle('active');
    picker.style.display = isActive ? 'block' : 'none';
  };
  // Custom Emoji Picker click handlers
  $$('#chat-emojiPicker .emoji-item').forEach(item => {
    const handleEmojiSelect = (e) => {
      e.preventDefault();
      e.stopPropagation();
      app.emojiInserting = true;
      const editor = $('#chat-messageInput');
      const emoji = item.dataset.emoji;
      insertTextAtCursor(editor, emoji, false);
      updateSendIcon();
      setTimeout(() => { app.emojiInserting = false; }, 50);
    };
    item.addEventListener('mousedown', handleEmojiSelect);
    item.addEventListener('touchstart', handleEmojiSelect, { passive: false });
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  // Close emoji picker and attachment panel when clicking/touching outside of them
  const closeFloatingPanels = (e) => {
    const picker = $('#chat-emojiPicker');
    if (picker && picker.classList.contains('active') && !picker.contains(e.target) && !e.target.closest('.emoji-btn')) {
      picker.classList.remove('active');
      picker.style.display = 'none';
    }
    const attachPanel = $('#chat-attachPanel');
    if (attachPanel && attachPanel.classList.contains('active') && !attachPanel.contains(e.target) && !e.target.closest('.attach-btn')) {
      attachPanel.classList.remove('active');
    }
  };
  document.addEventListener('click', closeFloatingPanels);
  document.addEventListener('touchstart', closeFloatingPanels, { passive: true });
  $('#chat-sendBtn').onclick = () => sendMessage();
  $('#page-chat .attach-btn').onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    $('#chat-attachPanel').classList.toggle('active');
  };

  // Back button
  $('#chat-backBtn').onclick = () => showPage('conversations');
  // Click on user name → open peer profile
  $('#page-chat .user-info').onclick = () => { if (app.activePeer?.userId) showPage('peer-profile', { userId: app.activePeer.userId, peer: app.activePeer }); };
  // Reply bar close
  $('#chat-replyClose').onclick = () => hideReplyBar();
  // Edit bar close
  $('#chat-editClose').onclick = () => hideEditBar();
  // Reaction popup buttons with touchstart and click protection to eliminate ghost clicks
  $$('#chat-reactionPopup .reaction-btn').forEach(btn => {
    const handleReaction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const popup = $('#chat-reactionPopup');
      const msgId = popup.dataset.messageId;
      if (msgId) app.socket?.emit('addReaction', { conversationId: app.activeConversation, messageId: msgId, emoji: btn.dataset.emoji });
      popup.classList.remove('active');
    };
    btn.addEventListener('click', handleReaction);
    btn.addEventListener('touchstart', handleReaction, { passive: false });
  });
  // Format bar buttons
  $$('#chat-formatBar button').forEach(btn => btn.onclick = () => {
    const cmd = btn.dataset.cmd;
    if (cmd === 'link') {
      const url = prompt('آدرس لینک:');
      if (url) document.execCommand('createLink', false, url);
    } else {
      document.execCommand(cmd, false, null);
    }
    $('#chat-messageInput').focus();
  });
  const attachItems = $$('.attach-item', $('#chat-attachPanel'));
  attachItems[0].onclick = () => { $('#chat-attachPanel').classList.remove('active'); chooseAndSendFile('image/*,video/*'); };
  attachItems[1].onclick = () => { $('#chat-attachPanel').classList.remove('active'); startOrStopRecording(); };
  attachItems[2].onclick = () => { $('#chat-attachPanel').classList.remove('active'); chooseAndSendFile('*/*'); };
  attachItems[3].onclick = () => { $('#chat-attachPanel').classList.remove('active'); navigator.geolocation?.getCurrentPosition(position => sendMessage({ text: `📍 موقعیت من:\nhttps://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}` }), () => showToast('chat', 'دسترسی موقعیت داده نشد.', 'error')); };
  attachItems[4].onclick = () => { $('#chat-attachPanel').classList.remove('active'); sendMessage({ text: `👤 کارت تماس:\n${app.user.name}\n${app.user.username}` }); };
  attachItems[5].onclick = () => { $('#chat-attachPanel').classList.remove('active'); openScheduleModal(); };
  attachItems[6].onclick = () => { $('#chat-attachPanel').classList.remove('active'); openSecretModal(); };
  const chatHeaderButtons = $$('#page-chat .header-actions .icon-btn');
  chatHeaderButtons[0].onclick = () => { if (app.activePeer?.username) location.href = `tel:${app.activePeer.username}`; else showToast('chat', 'شماره تماس ثبت نشده.'); };
  chatHeaderButtons[1].onclick = () => $('#chat-optionsModal').classList.add('active');
  // Close chat options overlay
  $('#chat-optionsModal .modal-overlay-bg').onclick = () => $('#chat-optionsModal').classList.remove('active');
  $$('#chat-optionsModal .option-item').forEach(item => item.onclick = () => {
    $('#chat-optionsModal').classList.remove('active');
    const action = item.dataset.action;
    if (action === 'theme') $('#chat-themeModal').classList.add('active');
    else if (action === 'schedule') openScheduleModal();
    else if (action === 'secret') openSecretModal();
    else if (action === 'clear') clearChatHistory();
    else if (action === 'profile') showPage('peer-profile', { userId: app.activePeer?.userId, peer: app.activePeer });
  });
  $('#chat-themeModal .modal-overlay-bg').onclick = () => $('#chat-themeModal').classList.remove('active');
  
  // Unified theme selector binding for all theme-color dots across both views
  $$('.theme-color').forEach(btn => {
    btn.onclick = () => {
      const index = Number(btn.dataset.themeIndex);
      applyTheme(index);
      
      const themeNames = {
        0: 'طلایی لوکس',
        1: 'ارغوانی ملایم',
        2: 'سبز زیتونی',
        3: 'استاندارد پناه'
      };
      
      const activeName = themeNames[index] || 'استاندارد پناه';
      
      // If states page is open (meaning it doesn't have class hidden)
      if (!$('#page-states').classList.contains('hidden')) {
        showToast('states', `تم ${activeName} فعال شد.`);
        setTimeout(() => showPage(app.previousPage || 'conversations'), 600);
      } else {
        showToast('chat', `تم ${activeName} فعال شد.`);
        $('#chat-themeModal').classList.remove('active');
      }
    };
  });
  // Schedule modal bindings
  $('#chat-scheduleModal .modal-overlay-bg').onclick = () => $('#chat-scheduleModal').classList.remove('active');
  $('#chat-scheduleSubmit').onclick = submitScheduleMessage;
  // Secret modal bindings
  $('#chat-secretModal .modal-overlay-bg').onclick = () => $('#chat-secretModal').classList.remove('active');
  $('#chat-secretSubmit').onclick = submitSecretMessage;
  let contactTimer;
  $('#contacts-searchInput').addEventListener('input', event => { clearTimeout(contactTimer); contactTimer = setTimeout(() => searchContacts(event.target.value.trim()), 250); });
  $('#notif-filterBtn').onclick = async () => {
    app.notificationFilter = app.notificationFilter === 'all' ? 'unread' : 'all';
    renderNotifications();
    showToast('notifications', app.notificationFilter === 'unread' ? 'فقط خوانده‌نشده‌ها' : 'نمایش همه');
    // Mark all as read when switching back to all
    if (app.notificationFilter === 'all') {
      try { await api('POST', '/api/notifications/read-all'); app.notifications.forEach(n => n.read = true); } catch {}
    }
  };
  $('#page-profile .camera-badge').onclick = () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = async () => { try { await uploadAvatar(input.files?.[0]); renderMyProfile(); showToast('profile', 'آواتار تغییر کرد.'); } catch (error) { showToast('profile', error.message, 'error'); } }; input.click(); };
  $('#page-profile .edit-name-btn').onclick = editMyProfile;
  $$('#page-profile .setting-item').forEach((item) => {
    if (item.id === 'setting-notif-row') return;
    item.onclick = () => {
      const spanText = $('span', item)?.textContent.trim();
      if (spanText === 'اطلاعات حساب') editMyProfile();
      else if (spanText === 'حریم خصوصی') showToast('profile', 'تنظیمات حریم خصوصی فعال است.');
      else if (spanText === 'تنظیمات گفتگو') showPage('states');
      else if (spanText === 'پیام‌های ذخیره‌شده') {
        const self = app.contacts.find(c => c.isSelf);
        if (self) openConversationByUser(self);
        else showToast('profile', 'در حال بارگذاری...');
      }
      else if (spanText === 'دستگاه‌های متصل') {
        if (confirm('آیا می‌خواهید از حساب خود خارج شوید؟')) { clearToken(); app.socket?.disconnect(); showPage('login'); }
      }
      else if (spanText === 'بررسی بروزرسانی') {
        checkAppUpdateManual();
      }
    };
  });

  const notifRow = $('#setting-notif-row');
  if (notifRow) {
    const notifToggle = $('#profile-notif-toggle');
    notifRow.onclick = async (e) => {
      notifToggle.checked = !notifToggle.checked;
      if (notifToggle.checked) {
        const success = await subscribeUserToPush();
        if (success) {
          showToast('profile', 'اعلانات مرورگر با موفقیت فعال شد.');
        } else {
          notifToggle.checked = false;
        }
      } else {
        await unsubscribeUserFromPush();
        showToast('profile', 'اعلانات مرورگر غیرفعال شد.');
      }
    };
    notifToggle.onclick = async (e) => {
      e.stopPropagation();
      if (notifToggle.checked) {
        const success = await subscribeUserToPush();
        if (success) {
          showToast('profile', 'اعلانات مرورگر با موفقیت فعال شد.');
        } else {
          notifToggle.checked = false;
        }
      } else {
        await unsubscribeUserFromPush();
        showToast('profile', 'اعلانات مرورگر غیرفعال شد.');
      }
    };
  }
  // Edit profile page bindings
  $('#editprofile-back').onclick = () => showPage('profile');
  $('#editprofile-save').onclick = saveMyProfile;
  $('#editprofile-avatarInput').onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { await uploadAvatar(file); $('#editprofile-avatar').src = app.user.avatar; showToast('editprofile', 'آواتار تغییر کرد.'); } catch (error) { showToast('editprofile', error.message, 'error'); }
  };
  $('#page-peer-profile .copy-btn').onclick = async () => { await navigator.clipboard.writeText($('#peer-profile-bioText span').textContent); showToast('peer-profile', 'متن کپی شد.'); };
  $('#states-backBtn').onclick = () => showPage(app.previousPage || 'conversations');

  // Unified, ultra-robust click and touchstart handlers for all modal overlays
  $$('.modal-overlay').forEach(modal => {
    const bg = $('.modal-overlay-bg', modal);
    if (bg) {
      const closeModal = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        modal.classList.remove('active');
      };
      bg.onclick = closeModal;
      bg.addEventListener('touchstart', closeModal, { passive: false });
    }
  });
}

function initVisualViewportHandler() {
  if (!window.visualViewport) return;

  const resetScroll = () => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  };

  const handleResize = () => {
    const vpHeight = window.visualViewport.height;
    document.documentElement.style.setProperty('--viewport-height', `${vpHeight}px`);
    
    // Prevent mobile keyboard from panning/shifting the entire viewport
    resetScroll();
    
    const isKeyboardOpen = (window.innerHeight - vpHeight) > 150;
    $$('.app-container').forEach(el => {
      el.classList.toggle('keyboard-open', isKeyboardOpen);
    });
    
    if (app.activeConversation && $('#page-chat') && !$('#page-chat').classList.contains('hidden')) {
      const chatArea = $('#chat-chatArea');
      if (chatArea) {
        setTimeout(() => {
          chatArea.scrollTop = chatArea.scrollHeight;
        }, 80);
      }
    }
  };

  window.visualViewport.addEventListener('resize', handleResize);
  window.visualViewport.addEventListener('scroll', handleResize);
  
  // Permanent global scroll-to-zero lock on document/window layout viewport scrolling
  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      resetScroll();
    }
  }, { passive: true });

  // Reset viewport layout shift on any text inputs focus
  document.addEventListener('focusin', () => {
    setTimeout(resetScroll, 20);
    setTimeout(resetScroll, 100);
    setTimeout(resetScroll, 250);
  });

  const editor = $('#chat-messageInput');
  if (editor) {
    editor.addEventListener('focus', () => {
      setTimeout(resetScroll, 30);
      setTimeout(resetScroll, 120);
      setTimeout(resetScroll, 300);
    });
    editor.addEventListener('input', resetScroll);
  }

  handleResize();
}

async function checkAppUpdateManual() {
  if (!('serviceWorker' in navigator)) {
    return showToast('profile', 'بروزرسانی در این مرورگر پشتیبانی نمی‌شود.', 'error');
  }
  
  showToast('profile', 'در حال بررسی بروزرسانی...');
  
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return showToast('profile', 'سیستم بروزرسانی غیرفعال است.', 'error');
    }
    
    let updateFound = false;
    
    const onUpdateFound = () => {
      updateFound = true;
      const newWorker = reg.installing || reg.waiting;
      if (newWorker) {
        showUpdatePrompt(newWorker);
        showToast('profile', 'نسخه جدید پیدا شد!');
      }
    };
    
    reg.addEventListener('updatefound', onUpdateFound);
    
    // Trigger service worker manual check
    await reg.update();
    
    setTimeout(() => {
      reg.removeEventListener('updatefound', onUpdateFound);
      
      // If there's an already downloaded worker waiting to activate
      if (reg.waiting) {
        showUpdatePrompt(reg.waiting);
        showToast('profile', 'نسخه جدید در انتظار اعمال است.');
      } else if (!updateFound) {
        showToast('profile', 'برنامه شما بروز است.');
      }
    }, 1500);
    
  } catch (error) {
    console.error('Manual update check failed:', error);
    showToast('profile', 'خطا در بررسی بروزرسانی.', 'error');
  }
}

function showUpdatePrompt(worker) {
  // Create a highly premium bottom floating update banner
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="ub-content">
      <i class="fa-solid fa-cloud-arrow-down"></i>
      <span>نسخه جدیدی از برنامه در دسترس است!</span>
    </div>
    <div class="ub-actions">
      <button class="ub-btn-apply">بروزرسانی</button>
      <button class="ub-btn-close"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
  document.body.appendChild(banner);
  
  banner.querySelector('.ub-btn-apply').onclick = () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
  banner.querySelector('.ub-btn-close').onclick = () => {
    banner.remove();
  };
}

async function bootstrap() {
  bindEvents();
  initVisualViewportHandler();
  // Apply saved theme
  const savedTheme = Number(localStorage.getItem('panahThemeIndex') || 3);
  applyTheme(savedTheme);
  
  // Always show login - user must enter credentials
  clearToken();
  showPage('login');
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      // Check for updates on load or on interval
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt(newWorker);
          }
        });
      });
    }).catch(() => {});
    
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUserToPush(isSilent = false) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (!isSilent) showToast('profile', 'مرورگر شما از اعلانات پیشرفته پشتیبانی نمی‌کند.', 'error');
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (!isSilent) showToast('profile', 'اجازه دسترسی به اعلانات مرورگر داده نشد.', 'warning');
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const vapidKeyResponse = await fetch('/vapidPublicKey');
      const vapidPublicKey = await vapidKeyResponse.text();
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }
    await api('POST', '/save-subscription', { subscription: sub });
    localStorage.setItem('panahPushNotifications', 'enabled');
    return true;
  } catch (error) {
    console.error('Subscription failed:', error);
    if (!isSilent) showToast('profile', 'خطا در فعال‌سازی اعلانات بر روی این دستگاه.', 'error');
    return false;
  }
}

async function unsubscribeUserFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    localStorage.setItem('panahPushNotifications', 'disabled');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await api('POST', '/delete-subscription', { endpoint });
    }
  } catch (error) {
    console.error('Unsubscription failed:', error);
  } finally {
    localStorage.setItem('panahPushNotifications', 'disabled');
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
