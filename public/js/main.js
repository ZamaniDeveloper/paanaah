const loginView = document.getElementById('login-view'), chatView = document.getElementById('chat-view');
const statusMessage = document.getElementById('status-message'), messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input'), fileInput = document.getElementById('file-input');
const recordBtn = document.getElementById('record-btn');
const userStatusText = document.getElementById('user-status-text');
const typingIndicator = document.getElementById('typing-indicator'),
    loginTitle = document.getElementById('login-title');
const chatHeaderTitle = document.getElementById('chat-header-title'), menuBtn = document.getElementById('menu-btn');
const dropdownMenu = document.getElementById('dropdown-menu'), clearMeBtn = document.getElementById('clear-me-btn');
const clearAllBtn = document.getElementById('clear-all-btn'), replyPreview = document.getElementById('reply-preview');
const cancelReplyBtn = document.getElementById('cancel-reply-btn'),
    notifToggleBtn = document.getElementById('notif-toggle-btn');
const notifToggleText = document.getElementById('notif-toggle-text');
const recordTimer = document.getElementById('record-timer');
const recordingUi = document.getElementById('recording-ui');
const cancelRecordingBtn = document.getElementById('cancel-recording-btn');

const otherUserInfo = document.getElementById('other-user-info');
const headerAvatar = document.getElementById('header-avatar');
const editProfileBtn = document.getElementById('edit-profile-btn');
const changeThemeBtn = document.getElementById('change-theme-btn');
const profileModal = document.getElementById('profile-modal');
const profileModalCloseBtn = document.getElementById('profile-modal-close-btn');
const profileDisplayView = document.getElementById('profile-display-view');
const profileAvatarImg = document.getElementById('profile-avatar-img');
const profileNameDisplay = document.getElementById('profile-name-display');
const profileBioDisplay = document.getElementById('profile-bio-display');
const profileEditView = document.getElementById('profile-edit-view');
const profileAvatarEditImg = document.getElementById('profile-avatar-edit-img');
const avatarInput = document.getElementById('avatar-input');
const profileNameInput = document.getElementById('profile-name-input');
const profileBioInput = document.getElementById('profile-bio-input');
const profileEditSaveBtn = document.getElementById('profile-edit-save-btn');
const profileEditCancelBtn = document.getElementById('profile-edit-cancel-btn');
const themeModal = document.getElementById('theme-modal');
const themeModalCloseBtn = document.getElementById('theme-modal-close-btn');
const themeSwatchesContainer = document.querySelector('.theme-swatches');
const authLoginTab = document.getElementById('auth-login-tab');
const authRegisterTab = document.getElementById('auth-register-tab');
const authLoginPanel = document.getElementById('auth-login-panel');
const authRegisterPanel = document.getElementById('auth-register-panel');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const registerNameInput = document.getElementById('register-name');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const contactsList = document.getElementById('contacts-list');
const contactsSearchInput = document.getElementById('contacts-search');
const contactUsernameInput = document.getElementById('contact-username-input');
const addContactBtn = document.getElementById('add-contact-btn');
const savedMessagesBtn = document.getElementById('saved-messages-btn');
const optionsBtn = document.getElementById('options-btn');
const composerOptionsMenu = document.getElementById('composer-options-menu');
const attachBtn = document.getElementById('attach-btn');
const scheduleToggle = document.getElementById('schedule-toggle');
const scheduleInput = document.getElementById('schedule-input');
const secretToggle = document.getElementById('secret-toggle');
const secretValueInput = document.getElementById('secret-value');
const secretUnitInput = document.getElementById('secret-unit');
const scheduleWrap = document.getElementById('schedule-wrap');
const secretWrap = document.getElementById('secret-wrap');
const profilePostsView = document.getElementById('profile-posts-view');
const profileStoriesView = document.getElementById('profile-stories-view');
const profileTabButtons = document.querySelectorAll('.profile-tab');
const createPostBtn = document.getElementById('create-post-btn');
const createStoryBtn = document.getElementById('create-story-btn');
const postTextInput = document.getElementById('post-text-input');
const storyTextInput = document.getElementById('story-text-input');

let socket = null;
let recordingInterval;
let wasRecordingCancelled = false;
let currentUser = null, mediaRecorder, audioChunks = [], isRecording = false, typingTimeout,
    VAPID_PUBLIC_KEY = 'BIZfuGsBxwRlSQb3WbKPgW1WzM8qOUZQTiaUHz85ZNdkbHhcsIEtWne3Ua-_vwVM7Nmg1i4DJg6asYQXbjsFafc',
    replyingTo = null;
let db, currentPage = 0, isLoadingMessages = false, hasMoreMessages = true;
let activeConversationId = null;
let activePeerProfile = {};
let activeProfileSocial = { posts: [], stories: [], canViewSocial: false };
let contacts = [];
let authMode = 'login';
let ignoreClicksUntil = 0;

let justScrolled = false;
let scrollTimer = null;
messagesDiv.addEventListener('scroll', () => {
    justScrolled = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => (justScrolled = false), 120);
}, {passive: true});

Fancybox.bind("[data-fancybox]", {

    Images: {initialSize: "fit"}, contentClick: "toggleCover", dragToClose: true
});

const themes = {
    default: {
        name: 'پیش‌فرض (تیره)',
        colors: {
            '--bg': '#0e1117',
            '--surface-0': '#161b22',
            '--surface-1': '#1c2333',
            '--surface-2': '#21262d',
            '--primary': '#3b82f6',
            '--primary-hover': '#2563eb',
            '--primary-dim': 'rgba(59,130,246,.15)',
            '--msg-out-bg': '#1d4ed8',
            '--msg-in-bg': '#1c2333',
            '--border': 'rgba(255,255,255,.07)',
            '--border-strong': 'rgba(255,255,255,.12)',
        }
    },
    telegram: {
        name: 'تلگرام',
        colors: {
            '--bg': '#0f1923',
            '--surface-0': '#17212b',
            '--surface-1': '#1c2b3a',
            '--surface-2': '#242f3d',
            '--primary': '#2b5278',
            '--primary-hover': '#1e3d5c',
            '--primary-dim': 'rgba(43,82,120,.2)',
            '--msg-out-bg': '#2b5278',
            '--msg-in-bg': '#1c2b3a',
            '--border': 'rgba(255,255,255,.07)',
            '--border-strong': 'rgba(255,255,255,.1)',
        }
    },
    ocean: {
        name: 'اقیانوس',
        colors: {
            '--bg': '#001f3f',
            '--surface-0': '#002952',
            '--surface-1': '#003366',
            '--surface-2': '#0a3d7a',
            '--primary': '#0ea5e9',
            '--primary-hover': '#0284c7',
            '--primary-dim': 'rgba(14,165,233,.15)',
            '--msg-out-bg': '#0369a1',
            '--msg-in-bg': '#003366',
            '--border': 'rgba(255,255,255,.08)',
            '--border-strong': 'rgba(255,255,255,.14)',
        }
    },
    galaxy: {
        name: 'کهکشان',
        colors: {
            '--bg': '#0d0b20',
            '--surface-0': '#13103a',
            '--surface-1': '#1a1550',
            '--surface-2': '#201a60',
            '--primary': '#9d4edd',
            '--primary-hover': '#7b2fbe',
            '--primary-dim': 'rgba(157,78,221,.15)',
            '--msg-out-bg': '#6d28d9',
            '--msg-in-bg': '#1a1550',
            '--border': 'rgba(255,255,255,.08)',
            '--border-strong': 'rgba(255,255,255,.12)',
        }
    },
    forest: {
        name: 'جنگل',
        colors: {
            '--bg': '#0a1f0a',
            '--surface-0': '#0f2b0f',
            '--surface-1': '#153615',
            '--surface-2': '#1a421a',
            '--primary': '#22c55e',
            '--primary-hover': '#16a34a',
            '--primary-dim': 'rgba(34,197,94,.15)',
            '--msg-out-bg': '#15803d',
            '--msg-in-bg': '#153615',
            '--border': 'rgba(255,255,255,.07)',
            '--border-strong': 'rgba(255,255,255,.12)',
        }
    },
    sunset: {
        name: 'غروب',
        colors: {
            '--bg': '#1a0a0a',
            '--surface-0': '#261010',
            '--surface-1': '#321515',
            '--surface-2': '#3d1a1a',
            '--primary': '#ef4444',
            '--primary-hover': '#dc2626',
            '--primary-dim': 'rgba(239,68,68,.15)',
            '--msg-out-bg': '#b91c1c',
            '--msg-in-bg': '#321515',
            '--border': 'rgba(255,255,255,.07)',
            '--border-strong': 'rgba(255,255,255,.11)',
        }
    },
    autumn: {
        name: 'پاییزی',
        colors: {
            '--bg': '#1c1008',
            '--surface-0': '#261a0a',
            '--surface-1': '#32220e',
            '--surface-2': '#3d2a12',
            '--primary': '#f97316',
            '--primary-hover': '#ea6a0a',
            '--primary-dim': 'rgba(249,115,22,.15)',
            '--msg-out-bg': '#c2410c',
            '--msg-in-bg': '#32220e',
            '--border': 'rgba(255,255,255,.07)',
            '--border-strong': 'rgba(255,255,255,.11)',
        }
    },
    tehran: {
        name: 'تهران',
        colors: {
            '--bg': '#06121c',
            '--surface-0': '#0a1a28',
            '--surface-1': '#102232',
            '--surface-2': '#162b3c',
            '--primary': '#00e6a7',
            '--primary-hover': '#00c98f',
            '--primary-dim': 'rgba(0,230,167,.15)',
            '--msg-out-bg': '#007a5a',
            '--msg-in-bg': '#102232',
            '--border': 'rgba(255,255,255,.07)',
            '--border-strong': 'rgba(255,255,255,.11)',
        }
    },
    hacker: {
        name: 'هکری',
        colors: {
            '--bg': '#000',
            '--surface-0': '#050505',
            '--surface-1': '#080808',
            '--surface-2': '#0d0d0d',
            '--primary': '#00ff41',
            '--primary-hover': '#00cc34',
            '--primary-dim': 'rgba(0,255,65,.12)',
            '--msg-out-bg': '#004d14',
            '--msg-in-bg': '#080808',
            '--border': 'rgba(0,255,65,.15)',
            '--border-strong': 'rgba(0,255,65,.25)',
            '--text-primary': '#00ff41',
            '--text-secondary': '#00cc34',
            '--text-muted': '#008020',
        }
    },
};


function applyTheme(themeName) {
    const theme = themes[themeName] || themes.default;
    const root = document.documentElement;
    // reset custom text colors first
    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--text-secondary');
    root.style.removeProperty('--text-muted');
    for (const [k, v] of Object.entries(theme.colors)) root.style.setProperty(k, v);
    localStorage.setItem('chatTheme', themeName);
    // highlight active swatch
    document.querySelectorAll('.swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.theme === themeName));
}

function loadTheme() {
    const savedTheme = localStorage.getItem('chatTheme') || 'default';
    applyTheme(savedTheme);
    themeSwatchesContainer.innerHTML = '';
    for (const [key, t] of Object.entries(themes)) {
        const sw = document.createElement('div');
        sw.className = 'swatch';
        sw.dataset.theme = key;
        sw.style.background = t.colors['--primary'] || t.colors['--primary-color'] || '#3b82f6';
        sw.title = t.name;
        if (key === savedTheme) sw.classList.add('active');
        sw.onclick = () => applyTheme(key);
        themeSwatchesContainer.appendChild(sw);
    }
}

function setViewportVars() {
    const vh = window.visualViewport ? window.visualViewport.height * 0.01 : window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    const kb = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0;
    document.documentElement.style.setProperty('--kb', `${kb}px`);
    if (kb > 0) {
        const msgBox = document.getElementById('messages');
        msgBox.scrollTop = msgBox.scrollHeight;
    }
    ignoreClicksUntil = Date.now() + 150;
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setViewportVars, {passive: true});
} else {
    window.addEventListener('resize', setViewportVars, {passive: true});
}
window.addEventListener('orientationchange', setViewportVars, {passive: true});

async function loadProfileDetails(userId) {
    if (!userId) return {profile: currentUser, posts: [], stories: [], canViewSocial: true, isSelf: true, mutual: true};
    const res = await fetch(`/api/profile/${encodeURIComponent(userId)}`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('chatToken')}`}
    });
    if (!res.ok) throw new Error('Failed to load profile');
    return await res.json();
}

function renderFeedCard(item, kind) {
    const card = document.createElement('article');
    card.className = 'feed-card';
    if (item.text) {
        const p = document.createElement('p');
        p.textContent = item.text;
        card.appendChild(p);
    }
    if (Array.isArray(item.attachments) && item.attachments.length) {
        const wrapper = document.createElement('div');
        wrapper.className = 'feed-attachments';
        item.attachments.forEach((attachment) => {
            if (/image\//.test(attachment.type || '') || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file || attachment.fileUrl || '')) {
                const img = document.createElement('img');
                img.src = attachment.file || attachment.fileUrl;
                img.alt = attachment.fileName || kind;
                wrapper.appendChild(img);
            } else if (/video\//.test(attachment.type || '') || /\.(mp4|mov|mkv|webm)$/i.test(attachment.file || attachment.fileUrl || '')) {
                const video = document.createElement('video');
                video.controls = true;
                video.src = attachment.file || attachment.fileUrl;
                wrapper.appendChild(video);
            } else {
                const link = document.createElement('a');
                link.href = attachment.file || attachment.fileUrl;
                link.textContent = attachment.fileName || 'فایل';
                link.target = '_blank';
                wrapper.appendChild(link);
            }
        });
        card.appendChild(wrapper);
    }
    const time = document.createElement('time');
    time.textContent = new Date(item.createdAt || item.timestamp || Date.now()).toLocaleString('fa-IR');
    card.appendChild(time);
    return card;
}

function renderProfileFeed(data) {
    profilePostsView.innerHTML = '';
    profileStoriesView.innerHTML = '';
    const canView = data?.canViewSocial;
    if (!canView) {
        profilePostsView.innerHTML = '<div class="feed-card">برای دیدن پست‌ها و استوری‌ها باید هر دو طرف همدیگر را به مخاطبین اضافه کرده باشید.</div>';
        profileStoriesView.innerHTML = profilePostsView.innerHTML;
        return;
    }

    const posts = Array.isArray(data.posts) ? data.posts : [];
    const stories = Array.isArray(data.stories) ? data.stories : [];

    if (!posts.length) profilePostsView.innerHTML = '<div class="feed-card">پستی ثبت نشده است.</div>';
    posts.forEach((post) => profilePostsView.appendChild(renderFeedCard(post, 'post')));

    if (!stories.length) profileStoriesView.innerHTML = '<div class="feed-card">استوری فعالی وجود ندارد.</div>';
    stories.forEach((story) => profileStoriesView.appendChild(renderFeedCard(story, 'story')));
}

function setProfileTab(tabName) {
    profileTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    profilePostsView.classList.toggle('hidden', tabName !== 'posts');
    profileStoriesView.classList.toggle('hidden', tabName !== 'stories');
}

async function createSocialItem(kind) {
    const isPost = kind === 'post';
    const text = isPost ? (postTextInput?.value || '').trim() : (storyTextInput?.value || '').trim();
    if (!text) return;
    try {
        const res = await fetch(isPost ? '/api/posts' : '/api/stories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
            },
            body: JSON.stringify({text})
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'ثبت مورد جدید ناموفق بود');
        if (isPost) postTextInput.value = '';
        else storyTextInput.value = '';
        activeProfileSocial = activeProfileSocial || {};
        if (isPost) activeProfileSocial.posts = [data, ...(activeProfileSocial.posts || [])];
        else activeProfileSocial.stories = [data, ...(activeProfileSocial.stories || [])];
        renderProfileFeed(activeProfileSocial);
        Swal.fire('موفق', isPost ? 'پست ثبت شد.' : 'استوری ثبت شد.', 'success');
    } catch (error) {
        Swal.fire('خطا', error.message, 'error');
    }
}

async function showProfileModal(userId, isMe = false) {
    profileDisplayView.classList.remove('hidden');
    profileEditView.classList.add('hidden');
    try {
        const profileData = await loadProfileDetails(isMe ? currentUser.userId : userId);
        const profile = profileData.profile || currentUser;
        activeProfileSocial = profileData;
        profileAvatarImg.src = profile.avatar || '/icons/default-avatar.png';
        profileNameDisplay.textContent = profile.name || (isMe ? currentUser.name : 'کاربر');
        profileBioDisplay.textContent = profile.bio || 'بیوگرافی تنظیم نشده است.';
        renderProfileFeed(profileData);
        setProfileTab('posts');
    } catch (error) {
        profileAvatarImg.src = '/icons/default-avatar.png';
        profileNameDisplay.textContent = 'کاربر';
        profileBioDisplay.textContent = 'بارگذاری پروفایل ناموفق بود.';
    }
    const existingEditBtn = document.getElementById('profile-display-edit-btn');
    if (existingEditBtn) existingEditBtn.remove();
    if (isMe) {
        const editBtn = document.createElement('button');
        editBtn.textContent = 'ویرایش';
        editBtn.id = 'profile-display-edit-btn';
        editBtn.onclick = showProfileEditView;
        profileDisplayView.querySelector('.modal-actions').prepend(editBtn);
    }
    profileModal.classList.remove('hidden');
}

function showProfileEditView() {
    profileDisplayView.classList.add('hidden');
    profileEditView.classList.remove('hidden');
    profileAvatarEditImg.src = currentUser.avatar || '/icons/default-avatar.png';
    profileNameInput.value = currentUser.name || '';
    profileBioInput.value = currentUser.bio || '';
}

async function saveProfile() {
    const name = profileNameInput.value;
    const bio = profileBioInput.value;
    try {
        const res = await fetch('/api/profile/update', {
            method: 'POST', headers: {
                'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
            }, body: JSON.stringify({name, bio})
        });
        if (!res.ok) throw new Error('Failed to save profile');
        currentUser.name = name;
        currentUser.bio = bio;
        if (activeProfileSocial?.profile?.userId === currentUser.userId) {
            activeProfileSocial.profile = {...activeProfileSocial.profile, name, bio};
        }
        Swal.fire('موفق', 'پروفایل شما با موفقیت به‌روزرسانی شد.', 'success');
        profileModal.classList.add('hidden');
    } catch {
        Swal.fire('خطا', 'مشکلی در ذخیره پروفایل پیش آمد.', 'error');
    }
}

async function uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    try {
        const res = await fetch('/api/profile/avatar', {
            method: 'POST', headers: {'Authorization': `Bearer ${localStorage.getItem('chatToken')}`}, body: formData
        });
        if (!res.ok) throw new Error('Failed to upload avatar');
        const {avatarUrl} = await res.json();
        currentUser.avatar = avatarUrl;
        profileAvatarEditImg.src = avatarUrl;
        if (profileModal.contains(profileAvatarImg)) profileAvatarImg.src = avatarUrl;
        Swal.fire('موفق', 'عکس پروفایل شما تغییر کرد.', 'success');
    } catch {
        Swal.fire('خطا', 'مشکلی در آپلود عکس پیش آمد.', 'error');
    }
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

function initDB() {
    const request = indexedDB.open('chatAppDB', 1);
    request.onerror = (e) => console.error("Database error:", e.target.errorCode);
    request.onsuccess = (e) => {
        db = e.target.result;
        processOutbox();
    };
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', {keyPath: 'clientMsgId'});
    };
}

async function addToOutbox(messageData) {
    console.log(db)
    if (!db) return;
    const tx = db.transaction(['outbox'], 'readwrite');
    const store = tx.objectStore('outbox');

    try {
        store.add(messageData);
    } catch {
        store.put(messageData);
    }
}

async function processOutbox() {
    if (!db || !navigator.onLine) return;
    const tx = db.transaction(['outbox'], 'readwrite');
    const store = tx.objectStore('outbox');
    store.getAll().onsuccess = (e) => {
        e.target.result.forEach(msg => {
            if (Array.isArray(msg.attachments) && msg.attachments.length) {
                const uploadPromises = msg.attachments.map(async (attachment) => {
                    if (attachment.fileUrl) return attachment;
                    if (!attachment.data) return attachment;
                    const fileBlob = new Blob([attachment.data], {type: attachment.type});
                    const file = new File([fileBlob], attachment.fileName || attachment.name || 'file', {type: attachment.type});
                    const uploaded = await uploadFileWithTus(file);
                    return {...attachment, ...uploaded};
                });
                Promise.all(uploadPromises)
                    .then((attachments) => {
                        sendMessageToServer({...msg, attachments});
                    })
                    .catch((error) => console.error('Outbox attachment upload failed:', error));
            } else if (msg.file && msg.file.data) {
                const fileBlob = new Blob([msg.file.data], {type: msg.file.type});
                uploadFileWithTus(new File([fileBlob], msg.file.name, {type: msg.file.type}))
                    .then((attachment) => sendMessageToServer({...msg, attachments: [attachment]}))
                    .catch((error) => console.error('Outbox file upload failed:', error));
            } else {
                sendMessageToServer(msg);
            }
        });
    };
}

function getSecretExpiresSeconds() {
    if (!secretToggle?.checked) return null;
    const value = Math.max(1, Number(secretValueInput?.value || 60));
    const unit = secretUnitInput?.value || 'minutes';
    if (unit === 'seconds') return value;
    if (unit === 'hours') return value * 60 * 60;
    return value * 60;
}

function setComposerOptionVisibility() {
    if (scheduleWrap) scheduleWrap.classList.toggle('hidden', !scheduleToggle?.checked);
    if (secretWrap) secretWrap.classList.toggle('hidden', !secretToggle?.checked);
}

function toggleComposerOptions(forceState = null) {
    if (!composerOptionsMenu) return;
    const shouldShow = typeof forceState === 'boolean' ? forceState : composerOptionsMenu.classList.contains('hidden');
    composerOptionsMenu.classList.toggle('hidden', !shouldShow);
}

function setAuthMode(mode) {
    authMode = mode;
    authLoginTab.classList.toggle('active', mode === 'login');
    authRegisterTab.classList.toggle('active', mode === 'register');
    authLoginPanel.classList.toggle('active', mode === 'login');
    authRegisterPanel.classList.toggle('active', mode === 'register');
    authSubmitBtn.textContent = mode === 'login' ? 'ورود' : 'ثبت‌نام';
    loginTitle.textContent = mode === 'login' ? 'ورود به پناه' : 'ساخت حساب جدید';
}

async function submitAuth() {
    try {
        statusMessage.textContent = '';
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const payload = authMode === 'login'
            ? {username: loginUsernameInput.value.trim(), password: loginPasswordInput.value}
            : {
                name: registerNameInput.value.trim(),
                username: registerUsernameInput.value.trim(),
                password: registerPasswordInput.value
            };
        if (!payload.username || !payload.password) {
            throw new Error('نام کاربری و رمز عبور الزامی است');
        }
        if (authMode === 'register' && !payload.name) {
            throw new Error('نام نمایشی را وارد کنید');
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'خطا در احراز هویت');

        localStorage.setItem('chatToken', data.token);
        if (data.vapidPublicKey) VAPID_PUBLIC_KEY = data.vapidPublicKey;
        currentUser = data.user;
        setAuthMode('login');
        setupUIForRole();
        await startSession(data);
    } catch (error) {
        statusMessage.textContent = error.message;
    }
}

function setupUIForRole() {
    document.title = 'پناه';
    loginTitle.textContent = authMode === 'login' ? 'ورود به پناه' : 'ساخت حساب جدید';
}

async function startSession(authPayload) {
    showChatView();
    initSocket();
    await loadContacts();
    const convoRes = await fetch('/api/conversations', {headers: {'Authorization': `Bearer ${localStorage.getItem('chatToken')}`}});
    if (convoRes.ok) {
        const conversations = await convoRes.json();
        if (conversations?.length) {
            const first = conversations[0];
            await openConversation(first.conversationId, first.peer, true);
        } else {
            await openConversationByUser({
                isSelf: true,
                userId: currentUser?.userId,
                username: currentUser?.username,
                name: 'پیام‌های ذخیره‌شده',
                avatar: currentUser?.avatar || '/icons/default-avatar.png',
                online: true
            });
        }
    }
    setupNotificationToggle();
}

function showChatView() {
    loginView.style.display = 'none';
    chatView.classList.remove('hidden');
    chatView.style.display = 'flex';
    window.addEventListener('focus', () => {
        if (currentUser && socket && activeConversationId) socket.emit('messagesSeen', {conversationId: activeConversationId});
    });
}

function initSocket() {
    if (socket && socket.connected) socket.disconnect();
    socket = io({auth: {token: localStorage.getItem('chatToken')}});

    socket.on('connect', () => {
        socket.emit('userOnline', {conversationId: activeConversationId});
        if (activeConversationId) {
            socket.emit('joinConversation', {conversationId: activeConversationId});
            socket.emit('messagesSeen', {conversationId: activeConversationId});
        }
    });

    socket.on('presenceChanged', ({userId, status, lastSeen}) => {
        if (activePeerProfile?.userId === userId) {
            updateUserStatusUI({status, lastSeen});
        }
        renderContacts(contacts);
    });

    socket.on('newMessage', (msg) => {
        if (!currentUser || msg.conversationId !== activeConversationId) return;
        const placeholder = msg.clientMsgId ? document.getElementById(msg.clientMsgId) : null;
        if (placeholder) {
            placeholder.replaceWith(createMessageElement(msg));
        } else {
            addMessageToUI(msg);
        }
        if (msg.fromId !== currentUser.userId) {
            if (navigator.vibrate) navigator.vibrate(200);
            socket.emit('messagesSeen', {conversationId: activeConversationId});
        }
    });

    socket.on('reactionUpdated', ({conversationId, messageId, reactions}) => {
        if (conversationId !== activeConversationId) return;
        const msgEl = document.querySelector(`[data-id="${messageId}"]`);
        if (msgEl) {
            const container = msgEl.querySelector('.reactions-container');
            const currentData = JSON.parse(msgEl.dataset.messageData);
            const emoji = Object.keys(reactions)[0];
            const users = reactions[emoji];
            if (!currentData.reactions) currentData.reactions = {};
            currentData.reactions[emoji] = users;
            if (users.length === 0) delete currentData.reactions[emoji];
            msgEl.dataset.messageData = JSON.stringify(currentData);
            if (container) updateReactionsUI(container, currentData.reactions);
        }
    });

    socket.on('messageDeleted', ({id, conversationId}) => {
        if (conversationId && conversationId !== activeConversationId) return;
        const el = document.querySelector(`[data-id="${id}"]`);
        if (el) {
            const msgData = el.dataset.messageData ? JSON.parse(el.dataset.messageData) : {};
            if (msgData.expiresAt) {
                el.classList.add('secret-vanishing');
                setTimeout(() => el.remove(), 700);
            } else {
                el.remove();
            }
        }
    });

    socket.on('messageEdited', (updatedMsg) => {
        if (updatedMsg.conversationId && updatedMsg.conversationId !== activeConversationId) return;
        const el = document.querySelector(`[data-id="${updatedMsg.id}"]`);
        if (el) el.replaceWith(createMessageElement(updatedMsg));
    });

    socket.on('chatHistoryCleared', ({conversationId}) => {
        if (conversationId && conversationId !== activeConversationId) return;
        messagesDiv.innerHTML = '';
        Swal.fire('انجام شد!', 'گفتگو توسط کاربر دیگر برای همه پاک شد.', 'success');
    });

    socket.on('userStatusChanged', (data) => {
        if (!currentUser) return;
        if (data.userId === activePeerProfile?.userId) updateUserStatusUI(data);
        renderContacts(contacts);
    });

    socket.on('messagesStatusUpdate', ({updates}) => {
        updates.forEach(update => {
            const msgEl = document.querySelector(`[data-id="${update.id}"] .message-status`);
            if (msgEl) msgEl.innerHTML = getStatusTicks(update.status);
        });
    });

    socket.on('messagesWereSeen', ({viewerId, conversationId}) => {
        if (conversationId && conversationId !== activeConversationId) return;
        if (viewerId !== currentUser.userId) {
            document.querySelectorAll('.message.sent .message-status').forEach(el => {
                if (el.innerHTML !== getStatusTicks('seen')) el.innerHTML = getStatusTicks('seen');
            });
        }
    });

    socket.on('userIsTyping', ({userId, isTyping, conversationId}) => {
        if (!currentUser) return;
        if (conversationId && conversationId !== activeConversationId) return;
        if (userId !== currentUser.userId) {
            typingIndicator.textContent = isTyping ? 'داره مینویسه ...' : '';
            typingIndicator.classList.toggle('active', isTyping);
        }
    });
}

async function setupNotificationToggle() {

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    const isEnabled = !!sub;

    updateNotifButton(isEnabled);

    notifToggleBtn.onclick = (e) => {
        e.preventDefault();
        toggleNotifications();
    };
}


function updateNotifButton(isEnabled) {
    notifToggleText.textContent = isEnabled ? 'غیرفعال کردن اعلان' : 'فعال کردن اعلان';
}

async function toggleNotifications() {

    if (!("Notification" in window)) {
        Swal.fire('خطا', 'مرورگر شما از اعلان پشتیبانی نمی‌کند', 'error');
        return;
    }

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();

    if (existing) {
        await unsubscribeFromPushNotifications();
        localStorage.setItem('notificationsEnabled', 'false');
        updateNotifButton(false);
        return;
    }

    let permission = Notification.permission;

    if (permission === "default") {
        permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
        Swal.fire('اجازه داده نشد', 'برای اعلان باید اجازه بدهید', 'warning');
        return;
    }

    await subscribeToPushNotifications();
    localStorage.setItem('notificationsEnabled', 'true');
    updateNotifButton(true);
}


async function subscribeToPushNotifications() {
    try {
        const registration = await navigator.serviceWorker.ready;

        const response = await fetch('/vapidPublicKey');
        const vapidPublicKey = await response.text();

        const applicationServerKey =
            urlBase64ToUint8Array(vapidPublicKey);

        const subscription =
            await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

        await fetch('/save-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization':
                    `Bearer ${localStorage.getItem('chatToken')}`
            },
            body: JSON.stringify({
                subscription
            })
        });

        console.log('Push subscribed');

    } catch (error) {
        console.error('Push subscribe failed:', error);
    }
}


async function unsubscribeFromPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/delete-subscription', {
                    method: 'POST', headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
                    }, body: JSON.stringify({endpoint: sub.endpoint})
                });

                await sub.unsubscribe();
            }

        }
    } catch (err) {
        console.error('Failed to unsubscribe:', err);
    }
}

function updateUserStatusUI(data) {
    const dot = document.getElementById('header-online-dot');
    if (!data) {
        userStatusText.textContent = '';
        userStatusText.className = '';
        if (dot) dot.style.display = 'none';
        return;
    }
    if (data.status === 'online') {
        userStatusText.textContent = 'آنلاین';
        userStatusText.className = 'online';
        if (dot) dot.style.display = 'block';
    } else {
        userStatusText.textContent = data.lastSeen ? `آخرین بازدید: ${formatRelativeTime(data.lastSeen)}` : 'آفلاین';
        userStatusText.className = '';
        if (dot) dot.style.display = 'none';
    }
}

async function loadContacts() {
    try {
        const res = await fetch('/api/contacts', {
            headers: {'Authorization': `Bearer ${localStorage.getItem('chatToken')}`}
        });
        if (!res.ok) throw new Error('Could not load contacts');
        contacts = await res.json();
        renderContacts(contacts);
    } catch (error) {
        console.error(error);
        contacts = [];
        if (contactsList) contactsList.innerHTML = '<div style="padding:12px;color:#a0a0a0">کاربری یافت نشد</div>';
    }
}

function renderContacts(list) {
    if (!contactsList) return;
    const q = (contactsSearchInput?.value || '').trim().toLowerCase();
    const filtered = (list || []).filter((user) => {
        if (!q) return true;
        return [user.name, user.username, user.bio].join(' ').toLowerCase().includes(q);
    });

    contactsList.innerHTML = '';
    if (!filtered.length) {
        contactsList.innerHTML = '<div style="padding:12px;color:#a0a0a0">مخاطبی پیدا نشد. نام کاربری دوستت را اضافه کن.</div>';
        return;
    }

    filtered.forEach((user) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'contact-item';
        if (activePeerProfile?.userId === user.userId) btn.classList.add('active');
        const isOnline = user.isSelf || user.online;
        const statusText = user.isSelf ? 'پیام‌های ذخیره‌شده' : (isOnline ? 'آنلاین' : (user.lastSeen ? `${formatRelativeTime(user.lastSeen)}` : 'آفلاین'));
        btn.innerHTML = `
            <div class="contact-avatar-wrap">
                <img src="${user.avatar || '/icons/default-avatar.png'}" class="contact-avatar" alt="">
                ${isOnline ? '<span class="online-dot"></span>' : ''}
            </div>
            <div class="contact-meta">
                <div class="contact-name">${user.name || user.username || 'کاربر'}</div>
                <div class="contact-status ${isOnline ? 'online' : ''}">${statusText}</div>
            </div>
        `;
        btn.onclick = () => openConversationByUser(user);
        contactsList.appendChild(btn);
    });
    renderContactsMobile(list);
}

function renderContactsMobile(list) {
    const mobileList = document.getElementById('contacts-list-mobile');
    if (!mobileList) return;
    const q = (document.getElementById('contacts-search-mobile')?.value || '').trim().toLowerCase();
    const filtered = (list || []).filter((user) => {
        if (!q) return true;
        return [user.name, user.username, user.bio].join(' ').toLowerCase().includes(q);
    });
    mobileList.innerHTML = '';
    if (!filtered.length) {
        mobileList.innerHTML = '<div style="padding:12px;color:var(--text-muted)">مخاطبی پیدا نشد.</div>';
        return;
    }
    filtered.forEach((user) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'contact-item';
        if (activePeerProfile?.userId === user.userId) btn.classList.add('active');
        const isOnline = user.isSelf || user.online;
        const statusText = user.isSelf ? 'پیام‌های ذخیره‌شده' : (isOnline ? 'آنلاین' : (user.lastSeen ? formatRelativeTime(user.lastSeen) : 'آفلاین'));
        btn.innerHTML = `
            <div class="contact-avatar-wrap">
                <img src="${user.avatar || '/icons/default-avatar.png'}" class="contact-avatar" alt="">
                ${isOnline ? '<span class="online-dot"></span>' : ''}
            </div>
            <div class="contact-meta">
                <div class="contact-name">${user.name || user.username || 'کاربر'}</div>
                <div class="contact-status ${isOnline ? 'online' : ''}">${statusText}</div>
            </div>
        `;
        btn.onclick = () => {
            closeContactsModal();
            openConversationByUser(user);
        };
        mobileList.appendChild(btn);
    });
}

function openContactsModal() {
    const modal = document.getElementById('contacts-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderContactsMobile(contacts);
    }
}

function closeContactsModal() {
    const modal = document.getElementById('contacts-modal');
    if (modal) modal.classList.add('hidden');
}

async function openConversationByUser(user) {
    try {
        if (user?.isSelf) {
            const res = await fetch('/api/conversations/direct', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
                },
                body: JSON.stringify({peerUserId: currentUser.userId})
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not open saved messages');
            await openConversation(data.conversationId, {
                userId: currentUser.userId,
                username: currentUser.username,
                name: 'پیام‌های ذخیره‌شده',
                avatar: currentUser.avatar || '/icons/default-avatar.png',
                online: true,
                isSelf: true
            }, true);
            return;
        }
        const res = await fetch('/api/conversations/direct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
            },
            body: JSON.stringify({peerUserId: user.userId})
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || 'Could not open conversation');
        }
        const data = await res.json();
        await openConversation(data.conversationId, data.peer, true);
    } catch (error) {
        Swal.fire('خطا', error.message, 'error');
    }
}

async function addContactByUsername() {
    const username = (contactUsernameInput.value || '').trim();
    if (!username) return;
    try {
        const res = await fetch('/api/contacts/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
            },
            body: JSON.stringify({username})
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'افزودن مخاطب ناموفق بود');
        contactUsernameInput.value = '';
        await loadContacts();
        if (data.contact?.userId) {
            Swal.fire('موفق', 'مخاطب به لیست شما اضافه شد.', 'success');
            if (!data.self) {
                await openConversationByUser(data.contact);
            }
        }
    } catch (error) {
        Swal.fire('خطا', error.message, 'error');
    }
}

async function openConversation(conversationId, peerProfile = null, skipContactsRefresh = false) {
    if (!conversationId) return;
    activeConversationId = conversationId;
    if (peerProfile) activePeerProfile = peerProfile;
    if (!skipContactsRefresh) {
        await loadContacts();
    }

    // پنهان کردن empty-state
    const emptyState = document.getElementById('chat-empty-state');
    if (emptyState) emptyState.remove();

    if (socket && socket.connected) {
        socket.emit('joinConversation', {conversationId});
        socket.emit('userOnline', {conversationId});
        socket.emit('messagesSeen', {conversationId});
    }

    chatHeaderTitle.textContent = activePeerProfile.isSelf ? 'پیام‌های ذخیره‌شده' : (activePeerProfile.name || activePeerProfile.username || 'گفتگو');
    headerAvatar.src = activePeerProfile.avatar || '/icons/default-avatar.png';
    updateUserStatusUI({
        status: activePeerProfile.isSelf ? 'online' : (activePeerProfile.online ? 'online' : 'offline'),
        lastSeen: activePeerProfile.lastSeen || null
    });
    currentPage = 0;
    hasMoreMessages = true;
    await loadMessages(0);
    renderContacts(contacts);
}

function handleFormSubmit(event) {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!activeConversationId) {
        Swal.fire('مخاطب را انتخاب کنید', 'ابتدا یک مخاطب را از لیست اضافه‌شده انتخاب کنید.', 'info');
        return;
    }
    if (!text && !replyingTo) return;
    const messageData = createMessageDataObject(text, null);
    const scheduleAt = scheduleToggle?.checked ? scheduleInput.value : '';
    const expiresInSeconds = getSecretExpiresSeconds();
    if (scheduleAt) messageData.sendAt = new Date(scheduleAt).toISOString();
    if (expiresInSeconds) messageData.expiresInSeconds = expiresInSeconds;
    addMessageToUI(messageData);
    if (navigator.onLine) sendMessageToServer(messageData); else addToOutbox(messageData);
    messageInput.value = '';
    scheduleToggle.checked = false;
    secretToggle.checked = false;
    if (scheduleInput) scheduleInput.value = '';
    if (secretValueInput) secretValueInput.value = '60';
    setComposerOptionVisibility();
    if (socket) {
        socket.emit('typing', {isTyping: false});
        clearTimeout(typingTimeout);
    }
    toggleComposerOptions(false);
}

function addPlaceholderMessage(id, label = 'در حال آماده‌سازی...') {
    const div = document.createElement('div');
    div.className = 'message-container sent placeholder';
    div.id = id;
    div.dataset.id = id;
    div.innerHTML = `<div class="message"><div class="message-content">${label}</div><div class="progress-container"><div class="progress-bar"></div></div></div>`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function handleFileSelect(files) {
    const selectedFiles = files instanceof File ? [files] : Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;
    if (!activeConversationId) {
        Swal.fire('مخاطب را انتخاب کنید', 'قبل از ارسال فایل، یک گفتگو را باز کنید.', 'info');
        return;
    }
    const clientMsgId = `msg-${Date.now()}`;
    addPlaceholderMessage(clientMsgId, selectedFiles.length > 1 ? `${selectedFiles.length} فایل در حال ارسال...` : selectedFiles[0].name);
    const scheduledAt = scheduleToggle?.checked ? scheduleInput.value : '';
    const expiresInSeconds = getSecretExpiresSeconds();
    if (navigator.onLine) {
        try {
            const attachments = await Promise.all(selectedFiles.map((file) => uploadFileWithTus(file)));
            const messageData = createMessageDataObject(null, null, clientMsgId);
            messageData.attachments = attachments;
            messageData.text = selectedFiles.length === 1 ? '' : `${selectedFiles.length} فایل`;
            if (scheduledAt) messageData.sendAt = new Date(scheduledAt).toISOString();
            if (expiresInSeconds) messageData.expiresInSeconds = expiresInSeconds;
            sendMessageToServer(messageData);
            toggleComposerOptions(false);
        } catch (error) {
            console.error(error);
            Swal.fire('خطا', 'آپلود فایل ناموفق بود.', 'error');
        }
    } else {
        const messageData = createMessageDataObject(null, null, clientMsgId);
        messageData.attachments = await Promise.all(selectedFiles.map(async (file) => {
            const data = await fileToArrayBuffer(file);
            return {name: file.name, type: file.type, data, fileName: file.name, fileUrl: ''};
        }));
        if (scheduledAt) messageData.sendAt = new Date(scheduledAt).toISOString();
        if (expiresInSeconds) messageData.expiresInSeconds = expiresInSeconds;
        addToOutbox(messageData);
        toggleComposerOptions(false);
    }
    fileInput.value = '';
}

function createMessageDataObject(text, file, clientMsgId = `msg-${Date.now()}`) {
    return {
        clientMsgId,
        text,
        file,
        fromId: currentUser.userId,
        timestamp: new Date().toISOString(),
        status: 'sending',
        replyTo: replyingTo,
        conversationId: activeConversationId,
        attachments: [],
        type: 'text'
    };
}

function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function uploadFileWithTus(file) {
    return new Promise((resolve, reject) => {
        const upload = new tus.Upload(file, {
            endpoint: '/files/',
            retryDelays: [0, 1000, 3000, 5000],
            metadata: {filename: encodeURIComponent(file.name), filetype: file.type || 'application/octet-stream'},
            removeFingerprintOnSuccess: true,
            onError(error) {
                console.error('Tus upload error:', error);
                reject(error);
            },
            onSuccess() {
                const uploadUrl = new URL(upload.url, window.location.origin);
                resolve({
                    fileUrl: uploadUrl.pathname.replace('/files/', '/uploads/'),
                    fileName: file.name,
                    type: file.type || 'application/octet-stream'
                });
            }
        });
        upload.start();
    });
}

async function sendMessageToServer(messageData) {
    try {
        if (!activeConversationId && !messageData.conversationId) {
            throw new Error('No active conversation selected');
        }
        const conversationId = messageData.conversationId || activeConversationId;
        if (scheduleToggle?.checked && scheduleInput.value) {
            messageData.sendAt = new Date(scheduleInput.value).toISOString();
        }
        const expiresInSeconds = getSecretExpiresSeconds();
        if (expiresInSeconds) {
            messageData.expiresInSeconds = expiresInSeconds;
        }
        const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST', headers: {
                'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('chatToken')}`
            }, body: JSON.stringify(messageData)
        });
        if (res.status === 403) {
            await Swal.fire({
                title: 'نشست شما منقضی شده',
                text: 'برای ادامه، لطفاً دوباره وارد شوید.',
                icon: 'warning',
                confirmButtonText: 'ورود مجدد'
            });
            localStorage.removeItem('chatToken');
            window.location.reload();
            return;
        }
        if (res.ok) {
            const data = await res.json();
            if (db) {
                const tx = db.transaction(['outbox'], 'readwrite');
                tx.objectStore('outbox').delete(messageData.clientMsgId);
            }
            cancelReply();
            if (data?.id) {
                const el = document.getElementById(messageData.clientMsgId);
                if (el) {
                    el.dataset.id = data.id;
                }
            } else if (data?.scheduled) {
                const el = document.getElementById(messageData.clientMsgId);
                if (el) {
                    el.querySelector('.message-content').textContent = `پیام برای ${new Date(data.sendAt).toLocaleString('fa-IR')} زمان‌بندی شد`;
                }
            }
        } else {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.error || 'Server rejected the message');
        }
    } catch (error) {
        if (!messageData.attachments?.length && !messageData.file && messageData.type !== 'gif') addToOutbox(messageData);
    }
}

async function loadMessages(page) {
    if (isLoadingMessages || !hasMoreMessages || !activeConversationId) return;
    isLoadingMessages = true;
    const loadBtn = document.getElementById('load-more-btn');
    if (loadBtn) {
        loadBtn.disabled = true;
        loadBtn.textContent = 'در حال بارگذاری...';
    }
    try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(activeConversationId)}/messages/${page}`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('chatToken')}`}
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || 'Failed to fetch messages');
        }
        const {messages, hasMore} = await res.json();
        const oldScrollHeight = messagesDiv.scrollHeight;
        if (page === 0) {
            messagesDiv.innerHTML = '';
            const container = document.createElement('div');
            container.id = 'load-more-container';
            container.innerHTML = '<button id="load-more-btn" type="button">نمایش پیام‌های قدیمی‌تر</button>';
            messagesDiv.prepend(container);
            document.getElementById('load-more-btn').addEventListener('click', () => {
                currentPage++;
                loadMessages(currentPage);
            });
        }
        messages.forEach(msg => addMessageToUI(msg, false));
        hasMoreMessages = hasMore;
        const newLoadBtn = document.getElementById('load-more-btn');
        if (newLoadBtn) {
            if (!hasMore) {
                newLoadBtn.textContent = 'به ابتدای گفتگو رسیده‌اید';
                newLoadBtn.disabled = true;
            } else {
                newLoadBtn.disabled = false;
                newLoadBtn.textContent = 'نمایش پیام‌های قدیمی‌تر';
            }
        }
        if (page === 0) messagesDiv.scrollTop = messagesDiv.scrollHeight; else messagesDiv.scrollTop = messagesDiv.scrollHeight - oldScrollHeight;
    } catch (e) {
        console.error('Failed to load messages:', e);
        Swal.fire('خطا', 'بارگذاری پیام‌ها ناموفق بود.', 'error');
    } finally {
        isLoadingMessages = false;
    }
}

function addMessageToUI(msg, isNew = true) {
    const div = createMessageElement(msg);
    if (isNew) div.classList.add('msg-animate');
    const placeholder = msg.clientMsgId ? document.getElementById(msg.clientMsgId) : null;
    if (placeholder) {
        placeholder.replaceWith(div);
    } else if (isNew) {
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
        const loadMoreContainer = document.getElementById('load-more-container');
        messagesDiv.insertBefore(div, loadMoreContainer.nextSibling);
    }
}

function createMessageElement(msg) {
    const div = document.createElement('div');
    const side = msg.fromId === currentUser.userId ? 'sent' : 'received';

    const stableId = msg.id || msg.clientMsgId;

    div.classList.add('message-container', side);
    div.dataset.id = stableId;
    div.dataset.timestamp = msg.timestamp;
    div.dataset.messageData = JSON.stringify(msg);

    const hasAttachments = (msg.attachments && msg.attachments.length > 0) || !!msg.file;
    const isMediaOnly = hasAttachments && (!msg.text || msg.text === msg.fileName || msg.text === `${msg.attachments?.length} فایل`);
    div.classList.add(hasAttachments && isMediaOnly ? 'message-media-container' : 'message');
    if (hasAttachments && !isMediaOnly) div.classList.add('has-media');

    if (msg.status === 'sending' && msg.clientMsgId) {
        div.style.opacity = '0.6';
        div.id = msg.clientMsgId;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    ['❤️', '😂', '👍', '😢', '🔥', '🐥', '🙄', '🤌', '🤏', '🫠'].forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'action-emoji';
        span.textContent = emoji;
        span.onclick = (e) => {
            e.stopPropagation();
            addReaction(stableId, emoji);
            actionsDiv.classList.remove('active');
        };
        actionsDiv.appendChild(span);
    });
    const separator = document.createElement('div');
    separator.className = 'action-separator';
    actionsDiv.appendChild(separator);

    // const replyIcon = document.createElement('span');
    // replyIcon.className = 'action-icon';
    // replyIcon.innerHTML = '<i class="fas fa-reply"></i>';
    // replyIcon.onclick = (e) => {
    //     e.stopPropagation();
    //     replyingTo = {
    //         text: msg.text || msg.fileName || 'فایل',
    //         fromName: msg.fromName,
    //         timestamp: msg.timestamp,
    //         id: stableId
    //     };
    //     showReplyPreview();
    //     actionsDiv.classList.remove('active');
    // };
    // ایجاد دکمه ریپلای مستقیم در کنار پیام
    const directReplyBtn = document.createElement('button');
    directReplyBtn.className = 'direct-reply-btn';
    directReplyBtn.innerHTML = '<i class="fas fa-reply"></i>';
    directReplyBtn.title = 'پاسخ دادن';
    directReplyBtn.onclick = (e) => {
        e.stopPropagation();
        triggerReply(msg, stableId);
    };

    if (msg.fromId === currentUser.userId) {
        if (!msg.file && msg.type !== 'gif' && !!msg.id) {
            const editIcon = document.createElement('span');
            editIcon.className = 'action-icon';
            editIcon.innerHTML = '<i class="fas fa-pen"></i>';
            editIcon.onclick = (e) => {
                e.stopPropagation();
                showEditView(stableId);
                actionsDiv.classList.remove('active');
            };
            actionsDiv.appendChild(editIcon);
        }
        const deleteIcon = document.createElement('span');
        deleteIcon.className = 'action-icon';
        deleteIcon.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteIcon.onclick = (e) => {
            e.stopPropagation();
            deleteMessage(stableId);
            actionsDiv.classList.remove('active');
        };
        actionsDiv.appendChild(deleteIcon);
    }

    let contentHTML = '';
    if (msg.replyTo) {
        contentHTML += `<div class="quoted-reply" onclick="scrollToMessageId('${msg.replyTo.id || msg.replyTo.timestamp}')"><strong>${msg.replyTo.fromName}</strong><p>${(msg.replyTo.text || 'فایل').substring(0, 50)}...</p></div>`;
    }
    let textContent = msg.text || '';
    const attachments = Array.isArray(msg.attachments) && msg.attachments.length ? msg.attachments : (msg.file ? [{
        file: msg.file,
        thumbnail: msg.thumbnail || msg.file,
        fileName: msg.fileName || textContent || 'فایل',
        type: msg.type || 'file',
        meta: msg.meta || null
    }] : []);
    if (attachments.length) {
        const mediaHtml = attachments.map((attachment) => {
            const url = attachment.file || attachment.fileUrl;
            const thumb = attachment.thumbnail || url;
            const fileName = attachment.fileName || textContent || 'فایل';
            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url) || /^image\//.test(attachment.type || '') || attachment.meta?.image) {
                const displaySrc = thumb || url;
                return `<a href="${url}" data-fancybox="gallery-${stableId}" data-caption="${fileName}"><img src="${displaySrc}" class="chat-media image" loading="lazy" onerror="this.src='/icons/default-avatar.png'"></a>`;
            }
            if (/\.(mp4|mov|mkv|webm)$/i.test(url) || /^video\//.test(attachment.type || '')) {
                const ratioAttrs = (attachment.meta && attachment.meta.videoWidth && attachment.meta.videoHeight) ? ` data-width="${attachment.meta.videoWidth}" data-height="${attachment.meta.videoHeight}" ` : '';
                const poster = thumb ? ` data-poster="${thumb}" ` : '';
                return `
        <a href="${url}" data-fancybox="gallery" ${ratioAttrs} ${poster}
           data-type="html5video" data-caption="${fileName}"
           class="chat-media video-thumb" style="background-image:url('${thumb || ''}');">
          <i class="fas fa-play"></i>
        </a>`;
            }
            if (/\.(mp3|wav|ogg|opus|webm)$/i.test(url) || /^audio\//.test(attachment.type || '')) {
                return `<audio src="${url}" controls class="chat-media audio"></audio>`;
            }
            return `<a href="${url}" target="_blank" download class="file-link"><i class="fas fa-file-alt"></i><span>دانلود: ${fileName}</span></a>`;
        }).join('');
        contentHTML += `<div class="attachment-stack">${mediaHtml}</div>`;
    }
    if (!isMediaOnly) contentHTML += `<div class="message-content">${textContent}</div>`;

    const contentContainer = document.createElement('div');
    contentContainer.innerHTML = contentHTML;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    metaDiv.innerHTML = `${msg.edited ? '<span class="edited-label">(ویرایش شده)</span>' : ''}<span>${new Date(msg.timestamp).toLocaleString('fa-IR', {timeStyle: 'short'})}</span>${side === 'sent' ? `<span class="message-status">${getStatusTicks(msg.status || 'sent')}</span>` : ''}`;

    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'reactions-container';
    updateReactionsUI(reactionsContainer, msg.reactions || {});

    div.appendChild(actionsDiv);
    div.appendChild(contentContainer);
    div.appendChild(metaDiv);
    div.appendChild(reactionsContainer);
    div.appendChild(directReplyBtn);

    // ── Swipe to reply ──
    let swipeStartX = 0, swipeStartY = 0, swipeDelta = 0, swipeFired = false;
    const SWIPE_THRESHOLD = 60;

    div.addEventListener('touchstart', (e) => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipeDelta = 0;
        swipeFired = false;
    }, { passive: true });

    div.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - swipeStartX;
        const dy = e.touches[0].clientY - swipeStartY;
        if (Math.abs(dy) > Math.abs(dx)) return;
        // برای RTL: کشیدن به راست (dx > 0) = ریپلای
        swipeDelta = dx;
        if (dx > 10 && dx < SWIPE_THRESHOLD + 20) {
            div.style.transform = `translateX(${Math.min(dx * 0.5, 35)}px)`;
            div.style.transition = 'none';
        }
    }, { passive: true });

    div.addEventListener('touchend', () => {
        div.style.transition = 'transform .25s ease';
        div.style.transform = '';
        if (swipeDelta > SWIPE_THRESHOLD && !swipeFired) {
            swipeFired = true;
            triggerReply(msg, stableId);
            if (navigator.vibrate) navigator.vibrate(30);
        }
    }, { passive: true });

    div.addEventListener('click', (e) => {
        if (justScrolled || Date.now() < ignoreClicksUntil) {
            return;
        }
        if (e.target.closest('.action-emoji, .action-icon, .reactions-container, a, img, audio, video, .quoted-reply, textarea, .direct-reply-btn, .edit-textarea, .edit-buttons')) return;
        document.querySelectorAll('.message-actions.active').forEach(menu => {
            if (menu !== actionsDiv) menu.classList.remove('active');
        });
        actionsDiv.classList.toggle('active');
    });

    return div;
}

function triggerReply(msg, stableId) {
    replyingTo = {
        text: msg.text || msg.fileName || 'فایل',
        fromName: msg.fromName || 'کاربر',
        timestamp: msg.timestamp,
        id: stableId
    };
    showReplyPreview();
    messageInput?.focus();
}

function addReaction(messageId, emoji) {
    if (socket && activeConversationId) socket.emit('addReaction', {conversationId: activeConversationId, messageId, emoji});
}

function updateReactionsUI(container, reactions) {
    container.innerHTML = '';
    for (const [emoji, users] of Object.entries(reactions)) {
        if (users.length > 0) {
            const bubble = document.createElement('span');
            bubble.className = 'reaction-bubble';
            bubble.textContent = `${emoji} ${users.length}`;
            container.appendChild(bubble);
        }
    }
}

function deleteMessage(id) {
    Swal.fire({
        title: 'چگونه پیام حذف شود؟',
        text: "این عمل غیرقابل بازگشت است!",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'برای همه',
        denyButtonText: `فقط برای من`,
        cancelButtonText: 'لغو',
        confirmButtonColor: '#d33',
        denyButtonColor: '#3085d6',
    }).then((result) => {
        if (result.isConfirmed) {
            if (socket && activeConversationId) socket.emit('deleteMessage', {conversationId: activeConversationId, id});
        } else if (result.isDenied) {
            const el = document.querySelector(`[data-id="${id}"]`);
            if (el) el.remove();
            Swal.fire('پیام حذف شد', '', 'success');
        }
    });
}

function showEditView(id) {
    const msgEl = document.querySelector(`[data-id="${id}"]`);
    if (!msgEl) return;
    const contentEl = msgEl.querySelector('.message-content');
    if (!contentEl || msgEl.querySelector('textarea')) return;
    msgEl.scrollIntoView({behavior: 'smooth', block: 'center'});
    const currentText = contentEl.innerText;
    contentEl.innerHTML = `<textarea class="edit-textarea">${currentText}</textarea><div class="edit-buttons"><button class="edit-cancel" type="button">لغو</button><button class="edit-save" type="button">ذخیره</button></div>`;
    const textarea = contentEl.querySelector('textarea');
    const saveBtn = contentEl.querySelector('.edit-save');
    const cancelBtn = contentEl.querySelector('button.edit-cancel');
    textarea.addEventListener('click', (e) => e.stopPropagation());
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    saveBtn.onclick = (e) => {
        e.stopPropagation();
        saveEdit(id);
    };
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        cancelEdit(id, currentText);
    };
}

function cancelEdit(id, originalText) {
    const msgEl = document.querySelector(`[data-id="${id}"]`);
    const contentEl = msgEl.querySelector('.message-content');
    if (contentEl) contentEl.innerText = originalText;
}

function saveEdit(id) {
    const msgEl = document.querySelector(`[data-id="${id}"]`);
    const textarea = msgEl.querySelector('textarea');
    const newText = textarea.value.trim();
    if (newText && socket && activeConversationId) socket.emit('editMessage', {conversationId: activeConversationId, id, newText});
}

function showReplyPreview() {
    if (!replyingTo) return;
    document.getElementById('reply-name').textContent = replyingTo.fromName;
    document.getElementById('reply-text').textContent = replyingTo.text;
    replyPreview.style.display = 'flex';
}

function scrollToMessageId(idOrTs) {
    const el = document.querySelector(`[data-id="${idOrTs}"], [data-timestamp="${idOrTs}"]`);
    if (el) {
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        el.style.animation = 'highlight 1s';
        setTimeout(() => {
            el.style.animation = '';
        }, 1000);
    }
}

function cancelReply() {
    replyingTo = null;
    replyPreview.style.display = 'none';
}

recordBtn.addEventListener('click', async () => {
    if (isRecording) {
        mediaRecorder.stop();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        const supportedTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
        const supportedMimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type));
        if (!supportedMimeType) {
            Swal.fire('خطا', 'هیچ فرمت صوتی پشتیبانی شده‌ای یافت نشد.', 'error');
            return;
        }
        mediaRecorder = new MediaRecorder(stream, {mimeType: supportedMimeType});
        audioChunks = [];
        isRecording = true;
        wasRecordingCancelled = false;
        let seconds = 0;
        messageInput.classList.add('slide-out');
        recordingUi.classList.remove('hidden');
        recordingUi.classList.add('slide-in');
        recordTimer.textContent = '00:00';
        recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
        recordBtn.classList.add('recording');
        recordingInterval = setInterval(() => {
            seconds++;
            const min = String(Math.floor(seconds / 60)).padStart(2, '0');
            const sec = String(seconds % 60).padStart(2, '0');
            recordTimer.textContent = `${min}:${sec}`;
        }, 1000);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            clearInterval(recordingInterval);
            messageInput.classList.remove('slide-out');
            recordingUi.classList.add('hidden');
            recordingUi.classList.remove('slide-in');
            isRecording = false;
            recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            recordBtn.classList.remove('recording');
            stream.getTracks().forEach(t => t.stop());
            if (!wasRecordingCancelled) {
                const fileExtension = supportedMimeType.split('/')[1].split(';')[0];
                const blob = new Blob(audioChunks, {type: supportedMimeType});
                const voiceFile = new File([blob], `voice_message.${fileExtension}`, {type: supportedMimeType});
                handleFileSelect(voiceFile);
            }
        };
        mediaRecorder.start();
    } catch (err) {
        console.error("Microphone access error:", err);
        Swal.fire('خطا', 'دسترسی به میکروفون امکان‌پذیر نیست.', 'error');
    }
});
cancelRecordingBtn.addEventListener('click', () => {
    if (isRecording) {
        wasRecordingCancelled = true;
        mediaRecorder.stop();
    }
});

messageInput.addEventListener('input', () => {
    clearTimeout(typingTimeout);
    if (socket && activeConversationId) {
        socket.emit('typing', {conversationId: activeConversationId, isTyping: true});
        typingTimeout = setTimeout(() => socket.emit('typing', {conversationId: activeConversationId, isTyping: false}), 2000);
    }
});

const allMessagesContainer = document.getElementById('messages');
messageInput.addEventListener('focus', () => {
    allMessagesContainer.style.pointerEvents = 'none';
    document.querySelectorAll('.message-actions.active').forEach(m => m.classList.remove('active'));
});
messageInput.addEventListener('blur', () => {
    setTimeout(() => {
        allMessagesContainer.style.pointerEvents = 'auto';
    }, 150);
});

menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdownMenu.classList.toggle('show');
});
window.addEventListener('click', (event) => {
    if (!event.target.closest('.header-menu')) {
        dropdownMenu.classList.remove('show');
    }

    const activeMenu = document.querySelector('.message-actions.active');
    if (activeMenu) {
        const parentMessage = activeMenu.closest('.message-container');

        if (parentMessage && !parentMessage.contains(event.target)) {
            activeMenu.classList.remove('active');
        }
    }
});
cancelReplyBtn.addEventListener('click', cancelReply);

clearMeBtn.addEventListener('click', () => {
    Swal.fire({
        title: 'آیا مطمئن هستید؟',
        text: "کل گفتگو فقط برای شما پاک خواهد شد.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'بله، پاک کن',
        cancelButtonText: 'لغو'
    }).then((r) => {
        if (r.isConfirmed) {
            messagesDiv.innerHTML = '';
            const container = document.createElement('div');
            container.id = 'load-more-container';
            container.innerHTML = '<button id="load-more-btn" type="button">نمایش پیام‌های قدیمی‌تر</button>';
            messagesDiv.prepend(container);
            document.getElementById('load-more-btn').addEventListener('click', () => {
                currentPage = 0;
                hasMoreMessages = true;
                loadMessages(currentPage);
            });
        }
    });
});

otherUserInfo.addEventListener('click', () => {
    if (activePeerProfile?.userId) showProfileModal(activePeerProfile.userId, !!activePeerProfile.isSelf);
});
editProfileBtn.addEventListener('click', () => showProfileModal(currentUser.userId, true));
profileModalCloseBtn.addEventListener('click', () => profileModal.classList.add('hidden'));
document.getElementById('profile-modal-close-btn-2')?.addEventListener('click', () => profileModal.classList.add('hidden'));
profileEditCancelBtn.addEventListener('click', () => {
    profileDisplayView.classList.remove('hidden');
    profileEditView.classList.add('hidden');
});
profileEditSaveBtn.addEventListener('click', saveProfile);
avatarInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadAvatar(e.target.files[0]);
});
changeThemeBtn.addEventListener('click', () => themeModal.classList.remove('hidden'));
themeModalCloseBtn.addEventListener('click', () => themeModal.classList.add('hidden'));
document.getElementById('theme-modal-close-btn-2')?.addEventListener('click', () => themeModal.classList.add('hidden'));

clearAllBtn.addEventListener('click', () => {
    Swal.fire({
        title: 'آیا کاملاً مطمئن هستید؟',
        text: "کل گفتگو برای هر دو طرف پاک خواهد شد!",
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'بله، برای همه پاک کن',
        cancelButtonText: 'لغو'
    }).then((r) => {
        if (r.isConfirmed && socket && activeConversationId) socket.emit('clearChatHistory', {conversationId: activeConversationId});
    });
});

function getStatusTicks(s) {
    if (s === 'seen')      return '<span class="seen">✓✓</span>';
    if (s === 'delivered') return '<span style="opacity:.7">✓✓</span>';
    return '<span style="opacity:.5">✓</span>';
}


function formatRelativeTime(iso) {
    if (!iso) return 'مدت‌ها قبل';
    const s = Math.floor((new Date() - new Date(iso)) / 1000);
    if (s < 5) return "همین الان";
    if (s < 60) return `${s} ثانیه قبل`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} دقیقه قبل`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ساعت قبل`;
    const d = Math.floor(h / 24);
    return d === 1 ? "دیروز" : `${d} روز قبل`;
}


// In main.js

// Utility function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/service-worker.js');
            console.log('Service Worker registered:', reg);
        } catch (err) {
            console.error('Service Worker registration failed:', err);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {



    // پیاده‌سازی شنونده سراسری برای چسباندن (Paste) تصاویر
    document.addEventListener('paste', (event) => {
        // دریافت داده‌های کلیپ‌بورد با پشتیبانی از مرورگرهای مختلف
        const clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;

        const items = clipboardData.items;
        let imageFile = null;

        // جستجو در بین آیتم‌های کلیپ‌بورد برای یافتن فایل تصویری
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                imageFile = items[i].getAsFile();
                break; // به محض یافتن اولین تصویر، حلقه متوقف می‌شود
            }
        }

        // اگر فایل تصویری یافت شد، پردازش را به تابع اصلی بسپار
        if (imageFile) {
            // جلوگیری از رفتار پیش‌فرض فقط برای تصاویر (تا متون عادی بدون مشکل Paste شوند)
            event.preventDefault();

            // بررسی وجود تابع و فراخوانی آن برای آپلود/نمایش تصویر
            if (typeof handleFileSelect === 'function') {
                handleFileSelect(imageFile);
            } else {
                console.warn('تابع handleFileSelect در دسترس نیست.');
            }
        }
    });
});


initDB();
loadTheme();
setViewportVars();

(authLoginTab && authRegisterTab) && authLoginTab.addEventListener('click', () => setAuthMode('login'));
(authLoginTab && authRegisterTab) && authRegisterTab.addEventListener('click', () => setAuthMode('register'));
if (authSubmitBtn) authSubmitBtn.addEventListener('click', submitAuth);
if (contactsSearchInput) contactsSearchInput.addEventListener('input', () => renderContacts(contacts));
if (addContactBtn) addContactBtn.addEventListener('click', addContactByUsername);
if (contactUsernameInput) {
    contactUsernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addContactByUsername();
        }
    });
}
// مودال مخاطبین موبایل
document.getElementById('contacts-mobile-btn')?.addEventListener('click', openContactsModal);
document.getElementById('contacts-modal-close')?.addEventListener('click', closeContactsModal);
document.getElementById('contacts-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('contacts-modal')) closeContactsModal();
});
document.getElementById('contacts-search-mobile')?.addEventListener('input', () => renderContactsMobile(contacts));
document.getElementById('add-contact-btn-mobile')?.addEventListener('click', async () => {
    const input = document.getElementById('contact-username-input-mobile');
    const username = (input?.value || '').trim();
    if (!username) return;
    try {
        const res = await fetch('/api/contacts/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('chatToken')}` },
            body: JSON.stringify({username})
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'افزودن مخاطب ناموفق بود');
        if (input) input.value = '';
        await loadContacts();
        if (data.contact?.userId && !data.self) {
            closeContactsModal();
            await openConversationByUser(data.contact);
        }
        Swal.fire('موفق', 'مخاطب اضافه شد.', 'success');
    } catch (error) {
        Swal.fire('خطا', error.message, 'error');
    }
});
document.getElementById('contact-username-input-mobile')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-contact-btn-mobile')?.click(); }
});
document.getElementById('saved-messages-btn-mobile')?.addEventListener('click', () => {
    closeContactsModal();
    openConversationByUser({
        isSelf: true,
        userId: currentUser?.userId,
        username: currentUser?.username,
        name: 'پیام‌های ذخیره‌شده',
        avatar: currentUser?.avatar || '/icons/default-avatar.png',
        online: true
    });
});

if (savedMessagesBtn) {
    savedMessagesBtn.addEventListener('click', () => openConversationByUser({
        isSelf: true,
        userId: currentUser?.userId,
        username: currentUser?.username,
        name: 'پیام‌های ذخیره‌شده',
        avatar: currentUser?.avatar || '/icons/default-avatar.png',
        online: true
        }));
}
if (fileInput) fileInput.addEventListener('change', () => handleFileSelect(fileInput.files));
if (optionsBtn) optionsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleComposerOptions();
});
if (attachBtn) attachBtn.addEventListener('click', () => {
    fileInput?.click();
    toggleComposerOptions(false);
});
if (scheduleToggle) scheduleToggle.addEventListener('change', () => {
    scheduleInput.disabled = !scheduleToggle.checked;
    setComposerOptionVisibility();
});
if (secretToggle) secretToggle.addEventListener('change', () => {
    secretValueInput.disabled = !secretToggle.checked;
    secretUnitInput.disabled = !secretToggle.checked;
    setComposerOptionVisibility();
});
if (scheduleInput) scheduleInput.disabled = true;
if (secretValueInput) secretValueInput.disabled = true;
if (secretUnitInput) secretUnitInput.disabled = true;
if (profileTabButtons) profileTabButtons.forEach((btn) => btn.addEventListener('click', () => setProfileTab(btn.dataset.tab)));
if (createPostBtn) createPostBtn.addEventListener('click', () => createSocialItem('post'));
if (createStoryBtn) createStoryBtn.addEventListener('click', () => createSocialItem('story'));
if (messageInput) {
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
    });
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-btn')?.click();
        }
    });
}
setComposerOptionVisibility();
window.addEventListener('click', (event) => {
    if (!event.target.closest('#composer-options-menu') && !event.target.closest('#options-btn')) {
        toggleComposerOptions(false);
    }
});

async function bootstrapFromToken() {
    const token = localStorage.getItem('chatToken');
    if (!token) {
        loginView.classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch('/api/me', {headers: {'Authorization': `Bearer ${token}`}});
        if (!res.ok) throw new Error('invalid token');
        currentUser = await res.json();
        showChatView();
        initSocket();
        await loadContacts();
    } catch (error) {
        localStorage.removeItem('chatToken');
        loginView.classList.remove('hidden');
    }
}


(async function init() {
    await bootstrapFromToken();
})()




