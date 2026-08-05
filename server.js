require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');
const { Server: SocketIOServer } = require('socket.io');
const { Server: TusServer } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const { Jimp } = require('jimp');

const { redisClient, ensureRedisConnected } = require('./lib/redisClient');
const { hashPassword, verifyPassword, normalizeUsername } = require('./lib/auth');
const {
  directConversationId,
  profileKey,
  userKey,
  usernameKey,
  conversationKey,
  messagesKey,
  reactionsKey,
  subscriptionsKey,
  presenceKey,
} = require('./lib/chat');
const {
  contactsKey,
  postsKey,
  storiesKey,
  scheduledMessagesKey,
  secretMessagesKey,
  friendRequestsInKey,
  friendRequestsOutKey,
  inboxKey,
  notificationsKey,
} = require('./lib/social');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const CUSTOMER_CODE = process.env.CUSTOMER_CODE || '';
const CHAT_EXPIRATION_SECONDS = 60 * 60 * 24 * 30;
const MESSAGE_PAGE_SIZE = 20;
const PUBLIC_DIR = path.join(__dirname, 'public');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:admin@local', vapidPublicKey, vapidPrivateKey);
}

const app = express();
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.set('trust proxy', 1);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });

const tusServer = new TusServer({
  path: '/files',
  datastore: new FileStore({ directory: './uploads' }),
  respectForwardedHeaders: true,
  relativeLocation: true,
});

const onlineUsers = new Set();
const socketUserMap = new Map();
const scheduledTimers = new Map();

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      name: user.name,
      role: user.role || 'user',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.sendStatus(401);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.sendStatus(403);
  }
}

function toPublicProfile(raw = {}) {
  if (!raw || Object.keys(raw).length === 0) return {};
  return {
    userId: raw.userId || '',
    username: raw.username || '',
    name: raw.name || raw.username || '',
    bio: raw.bio || '',
    avatar: raw.avatar || '',
    role: raw.role || 'user',
    createdAt: raw.createdAt || '',
  };
}

async function getProfile(userId) {
  return await redisClient.hGetAll(profileKey(userId));
}

async function saveProfile(userId, profile) {
  const current = await redisClient.hGetAll(profileKey(userId));
  const merged = {
    ...current,
    ...profile,
    userId,
  };
  await redisClient.hSet(profileKey(userId), merged);
  return merged;
}

async function getUserByUsername(username) {
  const userId = await redisClient.get(usernameKey(normalizeUsername(username)));
  if (!userId) return null;
  const profile = await getProfile(userId);
  if (!profile.userId) return null;
  return profile;
}

async function getUserById(userId) {
  const profile = await getProfile(userId);
  if (!profile.userId) return null;
  return profile;
}

async function listUsers() {
  const ids = await redisClient.sMembers('users:all');
  const profiles = await Promise.all(ids.map((id) => getProfile(id)));
  return profiles
    .filter((p) => p && p.userId)
    .map((p) => {
      const lastSeen = p.userId ? null : null;
      return {
        ...toPublicProfile(p),
        online: onlineUsers.has(p.userId),
        lastSeen: p.lastSeen || null,
      };
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
}

async function getContacts(userId) {
  const ids = await redisClient.sMembers(contactsKey(userId));
  const profiles = await Promise.all(ids.map((id) => getProfile(id)));
  return profiles
    .filter((profile) => profile && profile.userId)
    .map((profile) => ({
      ...toPublicProfile(profile),
      online: onlineUsers.has(profile.userId),
      lastSeen: profile.lastSeen || null,
      isSelf: profile.userId === userId,
      mutual: false,
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
}

async function areMutualContacts(userA, userB) {
  if (!userA || !userB) return false;
  if (userA === userB) return true;
  const [aHasB, bHasA] = await Promise.all([
    redisClient.sIsMember(contactsKey(userA), userB),
    redisClient.sIsMember(contactsKey(userB), userA),
  ]);
  return Boolean(aHasB && bHasA);
}

async function addContact(userId, peerId) {
  if (!userId || !peerId) return false;
  await redisClient.sAdd(contactsKey(userId), peerId);
  return true;
}

async function findUserByUsernameOrThrow(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('نام کاربری را وارد کنید');
  const user = await getUserByUsername(normalized);
  if (!user) throw new Error('کاربر پیدا نشد');
  return user;
}

function serializePost(raw) {
  const post = parseJson(raw, null);
  return post && post.id ? post : null;
}

async function loadVisiblePosts(viewerId, targetId) {
  const mutual = await areMutualContacts(viewerId, targetId);
  if (!mutual && viewerId !== targetId) return [];
  const rawItems = await redisClient.lRange(postsKey(targetId), 0, -1);
  return rawItems.map((item) => serializePost(item)).filter(Boolean).reverse();
}

async function loadVisibleStories(viewerId, targetId) {
  const mutual = await areMutualContacts(viewerId, targetId);
  if (!mutual && viewerId !== targetId) return [];
  const rawItems = await redisClient.lRange(storiesKey(targetId), 0, -1);
  const stories = rawItems.map((item) => parseJson(item, null)).filter(Boolean);
  const now = Date.now();
  return stories.filter((story) => {
    if (!story.expiresAt) return true;
    return new Date(story.expiresAt).getTime() > now;
  }).reverse();
}

async function scheduleSecretMessageRemoval(conversationId, messageId, expiresAt) {
  const key = `${conversationId}:${messageId}`;
  const dueAt = new Date(expiresAt).getTime();
  if (Number.isNaN(dueAt)) return;
  const delay = Math.max(0, dueAt - Date.now());
  if (scheduledTimers.has(key)) clearTimeout(scheduledTimers.get(key));
  const timer = setTimeout(async () => {
    try {
      const rawMessages = await redisClient.lRange(messagesKey(conversationId), 0, -1);
      for (let i = 0; i < rawMessages.length; i += 1) {
        const msg = parseJson(rawMessages[i], null);
        if (msg?.id === messageId) {
          await redisClient.lRem(messagesKey(conversationId), 1, rawMessages[i]);
          await redisClient.del(reactionsKey(messageId));
          
          // پاکسازی سوابق از لیست سراسری پیام‌های مخفی
          const secrets = await redisClient.lRange(secretMessagesKey(), 0, -1);
          for (const s of secrets) {
            const p = parseJson(s, null);
            if (p?.messageId === messageId) {
              await redisClient.lRem(secretMessagesKey(), 1, s);
              break;
            }
          }

          io.to(conversationId).emit('messageDeleted', { id: messageId, conversationId });
          break;
        }
      }
    } catch (error) {
      console.error('Secret message cleanup failed:', error);
    } finally {
      scheduledTimers.delete(key);
    }
  }, delay);
  scheduledTimers.set(key, timer);
}

async function ensureConversation(conversationId, participants) {
  const key = conversationKey(conversationId);
  const exists = await redisClient.exists(key);
  if (!exists) {
    await redisClient.hSet(key, {
      conversationId,
      type: 'direct',
      createdAt: new Date().toISOString(),
      lastMessageAt: '',
    });
  }
  if (participants && participants.length) {
    await redisClient.sAdd(`${key}:members`, participants);
    for (const userId of participants) {
      await redisClient.sAdd(`user:${userId}:conversations`, conversationId);
    }
  }
  return await redisClient.hGetAll(key);
}

async function getConversationParticipants(conversationId) {
  const members = await redisClient.sMembers(`${conversationKey(conversationId)}:members`);
  return members;
}

function directRoomId(userA, userB) {
  return directConversationId(userA, userB);
}

function isConversationParticipant(conversationId, userId) {
  return redisClient.sIsMember(`${conversationKey(conversationId)}:members`, userId);
}

async function getConversationForPair(userA, userB) {
  const conversationId = directRoomId(userA, userB);
  await ensureConversation(conversationId, [userA, userB]);
  return conversationId;
}

async function loadConversationMessages(conversationId, page = 0) {
  const start = -((page + 1) * MESSAGE_PAGE_SIZE);
  const end = -(page * MESSAGE_PAGE_SIZE) - 1;
  const rawMessages = await redisClient.lRange(messagesKey(conversationId), start, end);
  const messages = rawMessages.map((entry) => JSON.parse(entry));
  const reactionData = await Promise.all(messages.map((msg) => redisClient.hGetAll(reactionsKey(msg.id))));
  messages.forEach((msg, index) => {
    const reactions = reactionData[index] || {};
    msg.reactions = Object.entries(reactions).reduce((acc, [emoji, rawUsers]) => {
      try {
        acc[emoji] = JSON.parse(rawUsers);
      } catch {
        acc[emoji] = [];
      }
      return acc;
    }, {});
  });
  const total = await redisClient.lLen(messagesKey(conversationId));
  return {
    messages,
    hasMore: (page + 1) * MESSAGE_PAGE_SIZE < total,
  };
}

async function updateSeenStatuses(conversationId, viewerId) {
  const messageKey = messagesKey(conversationId);
  const messagesRaw = await redisClient.lRange(messageKey, 0, -1);
  const updates = [];

  for (let i = 0; i < messagesRaw.length; i += 1) {
    const msg = JSON.parse(messagesRaw[i]);
    if (msg.fromId === viewerId) continue;
    if (msg.status === 'seen') continue;
    msg.status = 'seen';
    await redisClient.lSet(messageKey, i, JSON.stringify(msg));
    updates.push({ id: msg.id, status: 'seen' });
  }

  return updates;
}

async function updateDeliveredStatuses(conversationId, recipientId) {
  const messageKey = messagesKey(conversationId);
  const messagesRaw = await redisClient.lRange(messageKey, 0, -1);
  const updates = [];

  for (let i = 0; i < messagesRaw.length; i += 1) {
    const msg = JSON.parse(messagesRaw[i]);
    if (msg.fromId === recipientId) continue;
    if (msg.status !== 'sent') continue;
    msg.status = 'delivered';
    await redisClient.lSet(messageKey, i, JSON.stringify(msg));
    updates.push({ id: msg.id, status: 'delivered' });
  }

  return updates;
}

async function getCurrentConversationId(userId, conversationId, peerId) {
  if (conversationId) return conversationId;
  if (peerId) return await getConversationForPair(userId, peerId);
  throw new Error('conversationId is required');
}

async function processAttachedFile(fileUrl, fileName) {
  try {
    const uuid = path.basename(new URL(fileUrl, 'http://localhost').pathname);
    const extension = path.extname(fileName || uuid).toLowerCase();
    const srcPath = path.join(__dirname, 'uploads', uuid);
    const renamedPath = path.join(__dirname, 'uploads', `${uuid}${extension || ''}`);

    if (fs.existsSync(srcPath) && srcPath !== renamedPath) {
      await fsp.rename(srcPath, renamedPath);
    }

    if (/\.(gif)$/i.test(renamedPath)) {
      return {
        file: `/uploads/${path.basename(renamedPath).replace(/\\/g, '/')}`,
        thumbnail: null,
        meta: { image: true, animated: true },
      };
    }

    if (/\.(jpe?g|png|webp)$/i.test(renamedPath)) {
      const optimizedPath = path.join(__dirname, 'uploads', `opt_${uuid}.jpg`);
      const thumbnailPath = path.join(__dirname, 'uploads', `thumb_${uuid}.jpg`);
      const image = await Jimp.read(renamedPath);
      await image.clone().resize({ w: 1280 }).write(optimizedPath);
      await image.clone().cover({ w: 220, h: 220 }).write(thumbnailPath);
      if (renamedPath !== optimizedPath && fs.existsSync(renamedPath)) {
        await fsp.unlink(renamedPath).catch(() => {});
      }
      return {
        file: `/uploads/opt_${uuid}.jpg`,
        thumbnail: `/uploads/thumb_${uuid}.jpg`,
        meta: { image: true },
      };
    }

    return {
      file: `/uploads/${path.basename(renamedPath).replace(/\\/g, '/')}`,
      thumbnail: null,
      meta: null,
    };
  } catch (err) {
    console.error('File processing error:', err);
    return {
      file: fileUrl,
      thumbnail: null,
      meta: null,
    };
  }
}

async function createUserAccount({ username, password, name }) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) {
    throw new Error('نام کاربری و رمز عبور الزامی است');
  }

  const existing = await getUserByUsername(normalizedUsername);
  if (existing) {
    throw new Error('این نام کاربری قبلاً ثبت شده است');
  }

  const userId = `usr_${uuidv4()}`;
  const profile = {
    userId,
    username: normalizedUsername,
    name: name || username,
    role: 'user',
    bio: '',
    avatar: '/icons/default-avatar.png',
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
  };

  await redisClient.sAdd('users:all', userId);
  await redisClient.set(usernameKey(normalizedUsername), userId);
  await redisClient.hSet(profileKey(userId), profile);
  return profile;
}

async function buildSessionPayload(userId) {
  const profile = await getProfile(userId);
  const conversations = await redisClient.sMembers(`user:${userId}:conversations`);
  const contacts = await getContacts(userId);
  return {
    user: toPublicProfile(profile),
    conversations,
    contacts,
  };
}

function createAuthResponse(user, extra = {}) {
  const token = signToken(user);
  return {
    token,
    user: toPublicProfile(user),
    ...extra,
    vapidPublicKey,
  };
}

async function getConversationSummary(conversationId, userId) {
  const participants = await getConversationParticipants(conversationId);
  const peerId = participants.find((id) => id !== userId) || participants[0];
  const peer = peerId ? await getUserById(peerId) : null;
  const last = await redisClient.lIndex(messagesKey(conversationId), -1);
  const lastMessage = last ? JSON.parse(last) : null;
  const recentRaw = await redisClient.lRange(messagesKey(conversationId), -100, -1);
  const unreadCount = recentRaw.reduce((count, raw) => {
    const message = parseJson(raw, null);
    return count + Number(Boolean(message && message.fromId !== userId && message.status !== 'seen'));
  }, 0);

  return {
    conversationId,
    peer: peer ? toPublicProfile(peer) : null,
    lastMessage,
    updatedAt: lastMessage?.timestamp || '',
    unreadCount,
  };
}

app.use('/files', (req, res) => tusServer.handle(req, res));

// Simple file upload fallback (multer)
const fileUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});
const fileUpload = multer({ storage: fileUploadStorage, limits: { fileSize: 5000 * 1024 * 1024 } });

app.post('/api/upload', authenticateToken, fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایلی انتخاب نشده' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl, fileName: req.file.originalname, size: req.file.size });
});

// Debug: test route to verify server is updated
app.get('/api/upload-test', (req, res) => {
  res.json({ ok: true, message: 'Upload route is active', time: new Date().toISOString() });
});

app.use(
  '/.well-known/acme-challenge',
  express.static(path.join(__dirname, '.well-known/acme-challenge'), {
    setHeaders: (res) => res.set('Content-Type', 'text/plain'),
  })
);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(PUBLIC_DIR));

app.get('/vapidPublicKey', (req, res) => {
  res.send(vapidPublicKey);
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name } = req.body || {};
    const user = await createUserAccount({ username, password, name });
    const payload = createAuthResponse(user, await buildSessionPayload(user.userId));
    res.status(201).json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message || 'ثبت‌نام ناموفق بود' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است' });
    }
    const payload = createAuthResponse(user, await buildSessionPayload(user.userId));
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'ورود ناموفق بود' });
  }
});

app.post('/api/auth/otp/request', async (req, res) => {
  try {
    const mobile = normalizeUsername(req.body?.mobile);
    if (!/^09\d{9}$/.test(mobile)) return res.status(400).json({ error: 'شماره موبایل نامعتبر است' });
    const user = await getUserByUsername(mobile);
    if (!user) return res.status(404).json({ error: 'حسابی با این شماره پیدا نشد' });
    const code = String(crypto.randomInt(100000, 1000000));
    const challenge = { code, userId: user.userId, expiresAt: Date.now() + 2 * 60 * 1000, attempts: 0 };
    await redisClient.set(`auth:otp:${mobile}`, JSON.stringify(challenge));
    await redisClient.expire(`auth:otp:${mobile}`, 120);
    if (process.env.OTP_WEBHOOK_URL) {
      await fetch(process.env.OTP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, code }),
      });
    }
    res.json({ success: true, expiresIn: 120, ...(process.env.NODE_ENV === 'production' ? {} : { debugCode: code }) });
  } catch (error) {
    res.status(500).json({ error: 'ارسال کد یکبار مصرف ناموفق بود' });
  }
});

app.post('/api/auth/otp/verify', async (req, res) => {
  try {
    const mobile = normalizeUsername(req.body?.mobile);
    const code = String(req.body?.code || '').trim();
    const raw = await redisClient.get(`auth:otp:${mobile}`);
    const challenge = parseJson(raw, null);
    if (!challenge || challenge.expiresAt < Date.now()) {
      await redisClient.del(`auth:otp:${mobile}`);
      return res.status(400).json({ error: 'کد منقضی یا نامعتبر است' });
    }
    if (challenge.attempts >= 5) return res.status(429).json({ error: 'تعداد تلاش‌ها بیش از حد مجاز است' });
    const expected = Buffer.from(String(challenge.code));
    const supplied = Buffer.from(code);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      challenge.attempts += 1;
      await redisClient.set(`auth:otp:${mobile}`, JSON.stringify(challenge));
      return res.status(400).json({ error: 'کد واردشده صحیح نیست' });
    }
    await redisClient.del(`auth:otp:${mobile}`);
    const user = await getUserById(challenge.userId);
    res.json(createAuthResponse(user, await buildSessionPayload(user.userId)));
  } catch (error) {
    res.status(500).json({ error: 'ورود با کد ناموفق بود' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Missing code' });

    if (code === ADMIN_CODE || code === CUSTOMER_CODE) {
      const role = code === ADMIN_CODE ? 'admin' : 'customer';
      const userId = role === 'admin' ? 'legacy_admin' : 'legacy_customer';
      const user = {
        userId,
        username: role,
        name: role === 'admin' ? 'ادمین' : 'مشتری',
        role,
        bio: '',
        avatar: '/icons/default-avatar.png',
        passwordHash: '',
      };
      await redisClient.sAdd('users:all', userId);
      await redisClient.hSet(profileKey(userId), user);
      const payload = createAuthResponse(user, await buildSessionPayload(userId));
      return res.json(payload);
    }

    return res.status(401).json({ error: 'کد ورود نامعتبر است.' });
  } catch (error) {
    console.error('Legacy login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  const profile = await getProfile(req.user.userId);
  res.json(toPublicProfile(profile));
});

app.get('/api/users', authenticateToken, async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (!query) return res.json([]);
  const users = await listUsers();
  const filtered = users.filter((user) => {
    if (user.userId === req.user.userId) return false;
    return [user.name, user.username, user.bio].join(' ').toLowerCase().includes(query.toLowerCase());
  });
  res.json(filtered.slice(0, 10));
});

app.get('/api/contacts', authenticateToken, async (req, res) => {
  const contacts = await getContacts(req.user.userId);
  const enriched = await Promise.all(
    contacts.map(async (contact) => ({
      ...contact,
      mutual: await areMutualContacts(req.user.userId, contact.userId),
    }))
  );
  enriched.unshift({
    userId: req.user.userId,
    username: req.user.username,
    name: 'Saved Messages',
    avatar: '/icons/default-avatar.png',
    online: true,
    lastSeen: null,
    isSelf: true,
    mutual: true,
  });
  res.json(enriched);
});

app.post('/api/contacts/add', authenticateToken, async (req, res) => {
  try {
    const { username, userId: directUserId } = req.body || {};
    let peer;
    if (directUserId) {
      peer = await getUserById(directUserId);
      if (!peer) throw new Error('کاربر پیدا نشد');
    } else {
      peer = await findUserByUsernameOrThrow(username);
    }
    if (peer.userId === req.user.userId) {
      return res.json({ success: true, contact: toPublicProfile(peer), self: true });
    }
    await addContact(req.user.userId, peer.userId);
    const mutual = await areMutualContacts(req.user.userId, peer.userId);
    res.json({ success: true, contact: { ...toPublicProfile(peer), mutual }, mutual });
  } catch (error) {
    res.status(400).json({ error: error.message || 'امکان افزودن مخاطب وجود ندارد' });
  }
});

app.get('/api/conversations', authenticateToken, async (req, res) => {
  const conversationIds = await redisClient.sMembers(`user:${req.user.userId}:conversations`);
  const items = await Promise.all(conversationIds.map((id) => getConversationSummary(id, req.user.userId)));
  res.json(items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
});

app.post('/api/conversations/direct', authenticateToken, async (req, res) => {
  try {
    const { peerUserId } = req.body || {};
    if (!peerUserId) return res.status(400).json({ error: 'peerUserId is required' });
    const peer = await getUserById(peerUserId);
    if (!peer) return res.status(404).json({ error: 'کاربر پیدا نشد' });
    // self conversation always allowed; otherwise check contacts
    if (peerUserId !== req.user.userId) {
      const allowed = await redisClient.sIsMember(contactsKey(req.user.userId), peerUserId);
      if (!allowed) {
        // Allow if message already exists (inbox scenario) – just open conv
        const convId = directConversationId(req.user.userId, peerUserId);
        const convExists = await redisClient.exists(conversationKey(convId));
        if (!convExists) return res.status(403).json({ error: 'ابتدا باید این کاربر را به مخاطبین خود اضافه کنید' });
      }
    }
    const conversationId = await getConversationForPair(req.user.userId, peerUserId);
    const peerProfile = toPublicProfile(peer);
    res.json({ conversationId, peer: peerProfile });
  } catch (error) {
    res.status(500).json({ error: 'Could not create conversation' });
  }
});

app.get('/api/conversations/:conversationId/messages/:page', authenticateToken, async (req, res) => {
  try {
    const { conversationId, page } = req.params;
    const allowed = await isConversationParticipant(conversationId, req.user.userId);
    if (!allowed) return res.sendStatus(403);
    const data = await loadConversationMessages(conversationId, Number(page) || 0);
    res.json(data);
  } catch (error) {
    console.error('Message load error:', error);
    res.status(500).json({ messages: [], hasMore: false });
  }
});

app.post('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      text,
      html,
      clientMsgId,
      replyTo,
      fileUrl,
      fileName,
      type,
      attachments = [],
      sendAt,
      expiresInSeconds,
    } = req.body || {};
    const allowed = await isConversationParticipant(conversationId, req.user.userId);
    if (!allowed) return res.sendStatus(403);

    const normalizedAttachments = Array.isArray(attachments) ? attachments.filter(Boolean).slice(0, 10) : [];
    if (fileUrl && fileName) {
      normalizedAttachments.unshift({
        fileUrl,
        fileName,
        type: type || 'file',
      });
    }

    const hasBody = Boolean(String(text || '').trim()) || normalizedAttachments.length > 0 || type === 'gif' || type === 'sticker';
    if (!hasBody) {
      return res.status(400).json({ error: 'پیام خالی ارسال نمی‌شود.' });
    }

    const scheduledFor = sendAt ? new Date(sendAt).getTime() : null;
    if (scheduledFor && scheduledFor > Date.now() + 1000) {
      const scheduledMessage = {
        scheduledId: `sched_${uuidv4()}`,
        conversationId,
        fromId: req.user.userId,
        text: text || '',
        replyTo: replyTo || null,
        attachments: normalizedAttachments,
        type: type || 'text',
        clientMsgId: clientMsgId || null,
        sendAt: new Date(scheduledFor).toISOString(),
        expiresInSeconds: Number(expiresInSeconds) || null,
        createdAt: nowIso(),
      };
      await redisClient.rPush(scheduledMessagesKey(), JSON.stringify(scheduledMessage));
      await redisClient.expire(scheduledMessagesKey(), CHAT_EXPIRATION_SECONDS);
      return res.status(202).json({ success: true, scheduled: true, sendAt: scheduledMessage.sendAt, scheduledId: scheduledMessage.scheduledId });
    }

    const dedupeKey = `dedupe:${conversationId}`;
    if (clientMsgId && (await redisClient.hExists(dedupeKey, clientMsgId))) {
      return res.json({ success: true, deduped: true });
    }

    const senderProfile = await getProfile(req.user.userId);
    const participantIds = await getConversationParticipants(conversationId);
    const recipientId = participantIds.find((id) => id !== req.user.userId) || null;

    const message = {
      id: uuidv4(),
      conversationId,
      fromId: req.user.userId,
      fromName: senderProfile.name || req.user.name || 'کاربر',
      text: text || fileName || '',
      html: html || null,
      timestamp: nowIso(),
      status: recipientId && onlineUsers.has(recipientId) ? 'delivered' : 'sent',
      clientMsgId: clientMsgId || null,
      replyTo: replyTo || null,
      file: null,
      thumbnail: null,
      attachments: [],
      type: type || 'text',
      edited: false,
    };

    if (normalizedAttachments.length) {
      const processedAttachments = [];
      for (const attachment of normalizedAttachments) {
        const processed = attachment.fileUrl && attachment.fileName
          ? await processAttachedFile(attachment.fileUrl, attachment.fileName)
          : null;
        const item = {
          file: processed?.file || attachment.fileUrl || '',
          thumbnail: processed?.thumbnail || attachment.thumbnail || null,
          fileName: attachment.fileName || attachment.name || '',
          type: attachment.type || attachment.fileType || 'file',
          meta: processed?.meta || attachment.meta || null,
        };
        processedAttachments.push(item);
      }
      message.attachments = processedAttachments;
      message.file = processedAttachments[0]?.file || null;
      message.thumbnail = processedAttachments[0]?.thumbnail || null;
      if (processedAttachments[0]?.meta) message.meta = processedAttachments[0].meta;
    }

    if (expiresInSeconds) {
      const expiresAt = new Date(Date.now() + Math.max(5, Number(expiresInSeconds)) * 1000).toISOString();
      message.expiresAt = expiresAt;
      await scheduleSecretMessageRemoval(conversationId, message.id, expiresAt);
      await redisClient.rPush(secretMessagesKey(), JSON.stringify({ conversationId, messageId: message.id, expiresAt }));
      await redisClient.expire(secretMessagesKey(), CHAT_EXPIRATION_SECONDS);
    }

    await redisClient.rPush(messagesKey(conversationId), JSON.stringify(message));
    await redisClient.expire(messagesKey(conversationId), CHAT_EXPIRATION_SECONDS);
    await redisClient.hSet(conversationKey(conversationId), 'lastMessageAt', message.timestamp);
    if (clientMsgId) await redisClient.hSet(dedupeKey, clientMsgId, '1');

    io.to(conversationId).emit('newMessage', message);

    if (recipientId) {
      await notifyParticipant(recipientId, req.user.userId, message);
    }

    res.json({ success: true, status: message.status, serverTimestamp: message.timestamp, id: message.id });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/profile/:userId', authenticateToken, async (req, res) => {
  try {
    const profile = await getProfile(req.params.userId);
    if (!profile.userId) return res.sendStatus(404);
    const isSelf = req.user.userId === req.params.userId;
    const mutual = await areMutualContacts(req.user.userId, req.params.userId);
    const posts = await loadVisiblePosts(req.user.userId, req.params.userId);
    const stories = await loadVisibleStories(req.user.userId, req.params.userId);
    res.json({
      profile: {
        ...toPublicProfile(profile),
        online: onlineUsers.has(profile.userId),
        lastSeen: profile.lastSeen || null,
      },
      isSelf,
      mutual,
      canViewSocial: isSelf || mutual,
      posts,
      stories,
    });
  } catch (error) {
    res.status(500).send();
  }
});

app.post('/api/profile/update', authenticateToken, async (req, res) => {
  try {
    const { name, bio } = req.body || {};
    const profile = await saveProfile(req.user.userId, {
      name: String(name || '').trim().slice(0, 64),
      bio: String(bio || '').trim().slice(0, 160),
    });
    res.json({ success: true, profile: toPublicProfile(profile) });
  } catch (error) {
    res.status(500).send();
  }
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads', 'avatars')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${req.user.userId}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error('Invalid image type'));
    }
    cb(null, true);
  },
});

app.post('/api/profile/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await saveProfile(req.user.userId, { avatar: avatarUrl });
    res.json({ success: true, avatarUrl });
  } catch (err) {
    res.status(500).send('Error processing image.');
  }
});

app.get('/api/profile/:userId/posts', authenticateToken, async (req, res) => {
  try {
    const posts = await loadVisiblePosts(req.user.userId, req.params.userId);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ posts: [] });
  }
});

app.get('/api/profile/:userId/stories', authenticateToken, async (req, res) => {
  try {
    const stories = await loadVisibleStories(req.user.userId, req.params.userId);
    res.json(stories);
  } catch (error) {
    res.status(500).json({ stories: [] });
  }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  try {
    const { text, attachments = [] } = req.body || {};
    if (!String(text || '').trim() && !attachments.length) {
      return res.status(400).json({ error: 'پست خالی مجاز نیست' });
    }
    const post = {
      id: `post_${uuidv4()}`,
      userId: req.user.userId,
      text: String(text || '').trim().slice(0, 500),
      attachments: Array.isArray(attachments) ? attachments.slice(0, 10) : [],
      createdAt: nowIso(),
    };
    await redisClient.rPush(postsKey(req.user.userId), JSON.stringify(post));
    await redisClient.expire(postsKey(req.user.userId), CHAT_EXPIRATION_SECONDS * 4);
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: 'ثبت پست ناموفق بود' });
  }
});

app.post('/api/stories', authenticateToken, async (req, res) => {
  try {
    const { text, attachments = [], expiresInHours = 24 } = req.body || {};
    if (!String(text || '').trim() && !attachments.length) {
      return res.status(400).json({ error: 'استوری خالی مجاز نیست' });
    }
    const story = {
      id: `story_${uuidv4()}`,
      userId: req.user.userId,
      text: String(text || '').trim().slice(0, 500),
      attachments: Array.isArray(attachments) ? attachments.slice(0, 10) : [],
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + Math.max(1, Number(expiresInHours) || 24) * 60 * 60 * 1000).toISOString(),
    };
    await redisClient.rPush(storiesKey(req.user.userId), JSON.stringify(story));
    await redisClient.expire(storiesKey(req.user.userId), CHAT_EXPIRATION_SECONDS);
    res.status(201).json(story);
  } catch (error) {
    res.status(500).json({ error: 'ثبت استوری ناموفق بود' });
  }
});

app.post('/save-subscription', authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await redisClient.sAdd(subscriptionsKey(req.user.userId), JSON.stringify(subscription));
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.post('/delete-subscription', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    const subs = await redisClient.sMembers(subscriptionsKey(req.user.userId));
    for (const raw of subs) {
      try {
        const sub = JSON.parse(raw);
        if (sub.endpoint === endpoint) {
          await redisClient.sRem(subscriptionsKey(req.user.userId), raw);
        }
      } catch {}
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

app.post('/api/conversations/:conversationId/presence/seen', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const allowed = await isConversationParticipant(conversationId, req.user.userId);
    if (!allowed) return res.sendStatus(403);
    const updates = await updateSeenStatuses(conversationId, req.user.userId);
    if (updates.length) io.to(conversationId).emit('messagesStatusUpdate', { updates });
    res.json({ success: true, updates });
  } catch (error) {
    res.status(500).json({ error: 'Could not update seen status' });
  }
});

app.get('/messages/:page', authenticateToken, async (req, res) => {
  const conversationIds = await redisClient.sMembers(`user:${req.user.userId}:conversations`);
  const conversationId = conversationIds[0];
  if (!conversationId) return res.json({ messages: [], hasMore: false });
  const data = await loadConversationMessages(conversationId, Number(req.params.page) || 0);
  res.json(data);
});

// ═══════════════════════════════════════════
// Friend Requests API
// ═══════════════════════════════════════════

// ارسال درخواست دوستی
app.post('/api/friend-requests/send', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body || {};
    if (!toUserId) return res.status(400).json({ error: 'toUserId الزامی است' });
    if (toUserId === req.user.userId) return res.status(400).json({ error: 'نمی‌توانید به خودتان درخواست بدهید' });

    const target = await getUserById(toUserId);
    if (!target) return res.status(404).json({ error: 'کاربر پیدا نشد' });

    const alreadyContact = await redisClient.sIsMember(contactsKey(req.user.userId), toUserId);
    if (alreadyContact) return res.status(400).json({ error: 'این کاربر از قبل در مخاطبین شماست' });

    const alreadySent = await redisClient.sIsMember(friendRequestsOutKey(req.user.userId), toUserId);
    if (alreadySent) return res.status(400).json({ error: 'درخواست قبلاً ارسال شده است' });

    const senderProfile = await getProfile(req.user.userId);
    const request = {
      id: uuidv4(),
      fromId: req.user.userId,
      fromName: senderProfile.name || req.user.username,
      fromUsername: senderProfile.username || req.user.username,
      fromAvatar: senderProfile.avatar || '/icons/default-avatar.png',
      toId: toUserId,
      createdAt: nowIso(),
    };

    await redisClient.sAdd(friendRequestsOutKey(req.user.userId), toUserId);
    await redisClient.hSet(`friend_request:${req.user.userId}:${toUserId}`, request);

    // اطلاع به گیرنده اگر آنلاین است
    io.to(`user:${toUserId}`).emit('friendRequest', { request });

    // ذخیره در اعلانات گیرنده
    const notif = {
      id: uuidv4(),
      type: 'friend_request',
      fromId: req.user.userId,
      fromName: senderProfile.name || req.user.username,
      fromAvatar: senderProfile.avatar || '/icons/default-avatar.png',
      createdAt: nowIso(),
      read: false,
    };
    await redisClient.lPush(notificationsKey(toUserId), JSON.stringify(notif));
    await redisClient.lTrim(notificationsKey(toUserId), 0, 99);

    // ارسال پوش نوتیفیکیشن وب‌پوش در صورت فعال بودن
    await notifyFriendRequestPush(toUserId, req.user.userId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// لیست درخواست‌های دریافتی
app.get('/api/friend-requests/incoming', authenticateToken, async (req, res) => {
  try {
    const senderIds = await redisClient.sMembers(friendRequestsInKey(req.user.userId));
    // بررسی کسانی که به ما درخواست داده‌اند = کسانی که ما در outbox آن‌هاییم
    const allUsers = await redisClient.sMembers('users:all');
    const requesters = [];
    for (const uid of allUsers) {
      if (uid === req.user.userId) continue;
      const sent = await redisClient.sIsMember(friendRequestsOutKey(uid), req.user.userId);
      if (sent) {
        const raw = await redisClient.hGetAll(`friend_request:${uid}:${req.user.userId}`);
        if (raw && raw.fromId) requesters.push(raw);
      }
    }
    res.json(requesters);
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// قبول درخواست
app.post('/api/friend-requests/accept', authenticateToken, async (req, res) => {
  try {
    const { fromId } = req.body || {};
    if (!fromId) return res.status(400).json({ error: 'fromId الزامی است' });

    // بررسی وجود درخواست
    const exists = await redisClient.sIsMember(friendRequestsOutKey(fromId), req.user.userId);
    if (!exists) return res.status(404).json({ error: 'درخواستی پیدا نشد' });

    // افزودن هر دو به مخاطبین یکدیگر
    await redisClient.sAdd(contactsKey(req.user.userId), fromId);
    await redisClient.sAdd(contactsKey(fromId), req.user.userId);

    // پاکسازی درخواست
    await redisClient.sRem(friendRequestsOutKey(fromId), req.user.userId);
    await redisClient.del(`friend_request:${fromId}:${req.user.userId}`);

    // اطلاع به فرستنده
    const accepterProfile = await getProfile(req.user.userId);
    io.to(`user:${fromId}`).emit('friendRequestAccepted', {
      userId: req.user.userId,
      name: accepterProfile.name,
      avatar: accepterProfile.avatar,
    });

    // اعلان برای فرستنده
    const notif = {
      id: uuidv4(),
      type: 'friend_accepted',
      fromId: req.user.userId,
      fromName: accepterProfile.name || req.user.username,
      fromAvatar: accepterProfile.avatar || '/icons/default-avatar.png',
      createdAt: nowIso(),
      read: false,
    };
    await redisClient.lPush(notificationsKey(fromId), JSON.stringify(notif));
    await redisClient.lTrim(notificationsKey(fromId), 0, 99);

    res.json({ success: true, contact: toPublicProfile(accepterProfile) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// رد درخواست
app.post('/api/friend-requests/reject', authenticateToken, async (req, res) => {
  try {
    const { fromId } = req.body || {};
    if (!fromId) return res.status(400).json({ error: 'fromId الزامی است' });
    await redisClient.sRem(friendRequestsOutKey(fromId), req.user.userId);
    await redisClient.del(`friend_request:${fromId}:${req.user.userId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// ═══════════════════════════════════════════
// Inbox: گفتگوهای از کاربران ناشناس
// ═══════════════════════════════════════════

// ارسال پیام به inbox (بدون نیاز به دوستی)
app.post('/api/inbox/send', authenticateToken, async (req, res) => {
  try {
    const { toUserId, text } = req.body || {};
    if (!toUserId || !String(text || '').trim()) {
      return res.status(400).json({ error: 'toUserId و text الزامی است' });
    }
    const target = await getUserById(toUserId);
    if (!target) return res.status(404).json({ error: 'کاربر پیدا نشد' });

    const senderProfile = await getProfile(req.user.userId);
    const inboxMsg = {
      id: uuidv4(),
      fromId: req.user.userId,
      fromName: senderProfile.name || req.user.username,
      fromAvatar: senderProfile.avatar || '/icons/default-avatar.png',
      fromUsername: senderProfile.username || req.user.username,
      text: String(text).trim().slice(0, 500),
      createdAt: nowIso(),
      read: false,
    };

    await redisClient.lPush(inboxKey(toUserId), JSON.stringify(inboxMsg));
    await redisClient.lTrim(inboxKey(toUserId), 0, 199);

    io.to(`user:${toUserId}`).emit('inboxMessage', inboxMsg);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// دریافت inbox — و خواندن همه
app.get('/api/inbox', authenticateToken, async (req, res) => {
  try {
    const raw = await redisClient.lRange(inboxKey(req.user.userId), 0, 49);
    const items = raw.map(r => parseJson(r, null)).filter(Boolean);
    // mark all as read
    for (let i = 0; i < raw.length; i++) {
      const msg = parseJson(raw[i], null);
      if (msg && !msg.read) {
        msg.read = true;
        await redisClient.lSet(inboxKey(req.user.userId), i, JSON.stringify(msg));
      }
    }
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

app.post('/api/inbox/:msgId/accept', authenticateToken, async (req, res) => {
  try {
    const raw = await redisClient.lRange(inboxKey(req.user.userId), 0, -1);
    const stored = raw.find(item => parseJson(item, null)?.id === req.params.msgId);
    const message = parseJson(stored, null);
    if (!message?.fromId) return res.status(404).json({ error: 'پیام پیدا نشد' });
    const peer = await getUserById(message.fromId);
    if (!peer) return res.status(404).json({ error: 'فرستنده پیدا نشد' });
    await redisClient.sAdd(contactsKey(req.user.userId), message.fromId);
    await redisClient.sAdd(contactsKey(message.fromId), req.user.userId);
    const conversationId = await getConversationForPair(req.user.userId, message.fromId);
    if (stored) await redisClient.lRem(inboxKey(req.user.userId), 1, stored);
    res.json({ success: true, conversationId, peer: toPublicProfile(peer) });
  } catch (error) {
    res.status(500).json({ error: 'پذیرش پیام ناموفق بود' });
  }
});

// پاک کردن یه پیام inbox
app.delete('/api/inbox/:msgId', authenticateToken, async (req, res) => {
  try {
    const { msgId } = req.params;
    const raw = await redisClient.lRange(inboxKey(req.user.userId), 0, -1);
    for (const item of raw) {
      const msg = parseJson(item, null);
      if (msg?.id === msgId) {
        await redisClient.lRem(inboxKey(req.user.userId), 1, item);
        break;
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// ═══════════════════════════════════════════
// Notifications API
// ═══════════════════════════════════════════

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const raw = await redisClient.lRange(notificationsKey(req.user.userId), 0, 49);
    const items = raw.map(r => parseJson(r, null)).filter(Boolean);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const raw = await redisClient.lRange(notificationsKey(req.user.userId), 0, -1);
    for (let i = 0; i < raw.length; i++) {
      const n = parseJson(raw[i], null);
      if (n && !n.read) {
        n.read = true;
        await redisClient.lSet(notificationsKey(req.user.userId), i, JSON.stringify(n));
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// ═══════════════════════════════════════════
// Contacts: حذف مخاطب
// ═══════════════════════════════════════════

app.delete('/api/contacts/:peerId', authenticateToken, async (req, res) => {
  try {
    const { peerId } = req.params;
    await redisClient.sRem(contactsKey(req.user.userId), peerId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطای سرور' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

io.use(async (socket, next) => {
  try {
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return next(new Error('No token'));
    const user = jwt.verify(token, JWT_SECRET);
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const user = socket.user;
  if (!user?.userId) return socket.disconnect(true);

  socket.join(`user:${user.userId}`);
  onlineUsers.add(user.userId);
  socketUserMap.set(socket.id, user.userId);
  await redisClient.hSet('user_status', user.userId, new Date().toISOString());
  io.emit('presenceChanged', {
    userId: user.userId,
    status: 'online',
  });

  socket.on('joinConversation', async ({ conversationId }) => {
    if (!conversationId) return;
    const allowed = await isConversationParticipant(conversationId, user.userId);
    if (!allowed) return;
    socket.join(conversationId);
    socket.data.conversationId = conversationId;
  });

  socket.on('userOnline', async ({ conversationId }) => {
    if (conversationId) {
      const allowed = await isConversationParticipant(conversationId, user.userId);
      if (allowed) socket.join(conversationId);
    }
    onlineUsers.add(user.userId);
    socketUserMap.set(socket.id, user.userId);
    io.emit('presenceChanged', { userId: user.userId, status: 'online' });

    const ids = await redisClient.sMembers(`user:${user.userId}:conversations`);
    for (const id of ids) {
      const updates = await updateDeliveredStatuses(id, user.userId);
      if (updates.length) io.to(id).emit('messagesStatusUpdate', { updates });
    }
  });

  socket.on('messagesSeen', async ({ conversationId }) => {
    const activeConversationId = conversationId || socket.data.conversationId;
    if (!activeConversationId) return;
    const allowed = await isConversationParticipant(activeConversationId, user.userId);
    if (!allowed) return;
    socket.to(activeConversationId).emit('messagesWereSeen', { viewerId: user.userId, conversationId: activeConversationId });
    const updates = await updateSeenStatuses(activeConversationId, user.userId);
    if (updates.length) io.to(activeConversationId).emit('messagesStatusUpdate', { updates });
  });

  socket.on('typing', async ({ conversationId, isTyping }) => {
    const activeConversationId = conversationId || socket.data.conversationId;
    if (!activeConversationId) return;
    socket.to(activeConversationId).emit('userIsTyping', {
      userId: user.userId,
      conversationId: activeConversationId,
      isTyping: !!isTyping,
    });
  });

  socket.on('addReaction', async ({ conversationId, messageId, emoji }) => {
    const activeConversationId = conversationId || socket.data.conversationId;
    if (!activeConversationId || !messageId || !emoji) return;
    const allowed = await isConversationParticipant(activeConversationId, user.userId);
    if (!allowed) return;
    const existing = await redisClient.hGet(reactionsKey(messageId), emoji);
    let users = [];
    if (existing) {
      try {
        users = JSON.parse(existing);
      } catch {
        users = [];
      }
    }
    if (users.includes(user.userId)) {
      users = users.filter((id) => id !== user.userId);
    } else {
      users.push(user.userId);
    }
    if (users.length) {
      await redisClient.hSet(reactionsKey(messageId), emoji, JSON.stringify(users));
    } else {
      await redisClient.hDel(reactionsKey(messageId), emoji);
    }
    io.to(activeConversationId).emit('reactionUpdated', {
      conversationId: activeConversationId,
      messageId,
      reactions: { [emoji]: users },
    });
  });

  socket.on('deleteMessage', async ({ conversationId, id }) => {
    const activeConversationId = conversationId || socket.data.conversationId;
    if (!activeConversationId || !id) return;
    const allowed = await isConversationParticipant(activeConversationId, user.userId);
    if (!allowed) return;
    const rawMessages = await redisClient.lRange(messagesKey(activeConversationId), 0, -1);
    for (let i = 0; i < rawMessages.length; i += 1) {
      const msg = JSON.parse(rawMessages[i]);
      if (msg.id === id && msg.fromId === user.userId) {
        await redisClient.lRem(messagesKey(activeConversationId), 1, rawMessages[i]);
        await redisClient.del(reactionsKey(id));
        io.to(activeConversationId).emit('messageDeleted', { id, conversationId: activeConversationId });
        break;
      }
    }
  });

  socket.on('clearChatHistory', async ({ conversationId }) => {
    const activeConversationId = conversationId || socket.data.conversationId;
    if (!activeConversationId) return;
    const allowed = await isConversationParticipant(activeConversationId, user.userId);
    if (!allowed) return;
    await redisClient.del(messagesKey(activeConversationId));
    io.to(activeConversationId).emit('chatHistoryCleared', { conversationId: activeConversationId });
  });

  socket.on('editMessage', async ({ conversationId, id, newText }) => {
    const activeConversationId = conversationId || socket.data.conversationId;
    if (!activeConversationId || !id || !newText) return;
    const allowed = await isConversationParticipant(activeConversationId, user.userId);
    if (!allowed) return;
    const rawMessages = await redisClient.lRange(messagesKey(activeConversationId), 0, -1);
    for (let i = 0; i < rawMessages.length; i += 1) {
      const msg = JSON.parse(rawMessages[i]);
      if (msg.id === id && msg.fromId === user.userId) {
        msg.text = newText;
        msg.html = null;
        msg.edited = true;
        await redisClient.lSet(messagesKey(activeConversationId), i, JSON.stringify(msg));
        io.to(activeConversationId).emit('messageEdited', msg);
        break;
      }
    }
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(user.userId);
    socketUserMap.delete(socket.id);
    const lastSeen = new Date().toISOString();
    await redisClient.hSet('user_status', user.userId, lastSeen);
    await saveProfile(user.userId, { lastSeen });
    io.emit('presenceChanged', {
      userId: user.userId,
      status: 'offline',
      lastSeen,
    });
  });
});

async function notifyParticipant(recipientId, senderId, message) {
  try {
    const senderProfile = await getProfile(senderId);
    const subscriptions = await redisClient.sMembers(subscriptionsKey(recipientId));
    if (!subscriptions.length) return;

    for (const raw of subscriptions) {
      try {
        const subscription = JSON.parse(raw);
        const payload = JSON.stringify({
          title: `پیام جدید از ${senderProfile.name || 'کاربر'}`,
          body: String(message.text || (message.file ? 'یک فایل ارسال شد' : 'پیام جدید')).substring(0, 120),
          tag: `message-${message.id}`,
          url: '/',
          messageId: message.id,
        });
        await webpush.sendNotification(subscription, payload);
      } catch (error) {
        if (error.statusCode === 410) {
          await redisClient.sRem(subscriptionsKey(recipientId), raw);
        }
      }
    }
  } catch (error) {
    console.error('Push notification error:', error);
  }
}

async function notifyFriendRequestPush(recipientId, senderId) {
  try {
    const senderProfile = await getProfile(senderId);
    const subscriptions = await redisClient.sMembers(subscriptionsKey(recipientId));
    if (!subscriptions.length) return;

    for (const raw of subscriptions) {
      try {
        const subscription = JSON.parse(raw);
        const payload = JSON.stringify({
          title: 'درخواست دوستی جدید',
          body: `کاربر ${senderProfile.name || 'پناه'} به شما درخواست دوستی داده است.`,
          tag: `friend-request-${senderId}`,
          url: '/',
          type: 'friend_request'
        });
        await webpush.sendNotification(subscription, payload);
      } catch (error) {
        if (error.statusCode === 410) {
          await redisClient.sRem(subscriptionsKey(recipientId), raw);
        }
      }
    }
  } catch (error) {
    console.error('Push notification error (friend request):', error);
  }
}

async function deliverQueuedMessage(payload) {
  const {
    conversationId,
    fromId,
    text,
    replyTo,
    attachments = [],
    type,
    clientMsgId,
    expiresInSeconds,
  } = payload;
  const senderProfile = await getProfile(fromId);
  const participantIds = await getConversationParticipants(conversationId);
  const recipientId = participantIds.find((id) => id !== fromId) || null;
  const message = {
    id: uuidv4(),
    conversationId,
    fromId,
    fromName: senderProfile.name || 'کاربر',
    text: text || '',
    timestamp: nowIso(),
    status: recipientId && onlineUsers.has(recipientId) ? 'delivered' : 'sent',
    clientMsgId: clientMsgId || null,
    replyTo: replyTo || null,
    attachments: [],
    file: null,
    thumbnail: null,
    type: type || 'text',
    edited: false,
  };

  if (attachments.length) {
    const processedAttachments = [];
    for (const attachment of attachments) {
      const processed = attachment.fileUrl && attachment.fileName
        ? await processAttachedFile(attachment.fileUrl, attachment.fileName)
        : null;
      processedAttachments.push({
        file: processed?.file || attachment.fileUrl || '',
        thumbnail: processed?.thumbnail || attachment.thumbnail || null,
        fileName: attachment.fileName || attachment.name || '',
        type: attachment.type || attachment.fileType || 'file',
        meta: processed?.meta || attachment.meta || null,
      });
    }
    message.attachments = processedAttachments;
    message.file = processedAttachments[0]?.file || null;
    message.thumbnail = processedAttachments[0]?.thumbnail || null;
    if (processedAttachments[0]?.meta) message.meta = processedAttachments[0].meta;
  }

  if (expiresInSeconds) {
    const expiresAt = new Date(Date.now() + Math.max(5, Number(expiresInSeconds)) * 1000).toISOString();
    message.expiresAt = expiresAt;
    await scheduleSecretMessageRemoval(conversationId, message.id, expiresAt);
  }

  await redisClient.rPush(messagesKey(conversationId), JSON.stringify(message));
  await redisClient.expire(messagesKey(conversationId), CHAT_EXPIRATION_SECONDS);
  await redisClient.hSet(conversationKey(conversationId), 'lastMessageAt', message.timestamp);
  io.to(conversationId).emit('newMessage', message);
  if (recipientId) await notifyParticipant(recipientId, fromId, message);
  return message;
}

async function processScheduledMessages() {
  try {
    const items = await redisClient.lRange(scheduledMessagesKey(), 0, -1);
    const now = Date.now();
    for (const raw of items) {
      const payload = parseJson(raw, null);
      if (!payload?.sendAt) continue;
      const sendAt = new Date(payload.sendAt).getTime();
      if (Number.isNaN(sendAt) || sendAt > now) continue;
      await redisClient.lRem(scheduledMessagesKey(), 1, raw);
      await deliverQueuedMessage(payload);
    }
  } catch (error) {
    console.error('Scheduled message processing failed:', error);
  }
}

async function rehydrateSecretTimers() {
  try {
    const secretsRaw = await redisClient.lRange(secretMessagesKey(), 0, -1);
    const now = Date.now();
    for (const raw of secretsRaw) {
      const p = parseJson(raw, null);
      if (!p || !p.expiresAt || !p.messageId || !p.conversationId) continue;
      const expiresAt = new Date(p.expiresAt).getTime();
      if (Number.isNaN(expiresAt)) continue;

      if (expiresAt <= now) {
        // پیام مخفی در زمان خاموشی سرور منقضی شده است؛ بلافاصله حذف شود
        const conversationId = p.conversationId;
        const messageId = p.messageId;
        const rawMessages = await redisClient.lRange(messagesKey(conversationId), 0, -1);
        for (let i = 0; i < rawMessages.length; i += 1) {
          const msg = parseJson(rawMessages[i], null);
          if (msg?.id === messageId) {
            await redisClient.lRem(messagesKey(conversationId), 1, rawMessages[i]);
            await redisClient.del(reactionsKey(messageId));
            break;
          }
        }
        await redisClient.lRem(secretMessagesKey(), 1, raw);
      } else {
        // زمان‌بندی مجدد حذف پیام مخفی
        scheduleSecretMessageRemoval(p.conversationId, p.messageId, p.expiresAt);
      }
    }
  } catch (error) {
    console.error('Failed to rehydrate secret timers:', error);
  }
}

async function bootstrap() {
  for (const dir of ['uploads', 'uploads/avatars']) {
    if (!fs.existsSync(dir)) {
      await fsp.mkdir(dir, { recursive: true });
    }
  }
  await ensureRedisConnected();
  await rehydrateSecretTimers();
  await processScheduledMessages();
  setInterval(processScheduledMessages, 5000);
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
  });
}

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.message === 'Invalid image type') return res.status(400).json({ error: 'Invalid image type' });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.code });
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Unexpected server error' });
});

bootstrap().catch((err) => {
  console.error('Failed to bootstrap app:', err);
  process.exit(1);
});
