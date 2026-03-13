import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  allowEIO3: true
});
const PORT = process.env.PORT || 3000;

const DATA_DIR = join(__dirname, 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');
const MESSAGES_FILE = join(DATA_DIR, 'messages.json');
const MAX_MESSAGES = 200;

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadUsers() {
  if (!existsSync(USERS_FILE)) return [];
  return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadMessages() {
  if (!existsSync(MESSAGES_FILE)) return [];
  return JSON.parse(readFileSync(MESSAGES_FILE, 'utf-8'));
}

function saveMessages(msgs) {
  writeFileSync(MESSAGES_FILE, JSON.stringify(msgs.slice(-MAX_MESSAGES), null, 2));
}

let messageHistory = loadMessages();

const AI_HOST_NAME = 'AI主持人';
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

async function callZhipuAPI(messages) {
  const apiKey = process.env.ZHIPU_API_KEY;
  const model = process.env.ZHIPU_MODEL || 'glm-4-plus';
  if (!apiKey) {
    console.error('[AI] 未配置 ZHIPU_API_KEY');
    return null;
  }
  try {
    const res = await fetch(ZHIPU_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是群聊聊天室的主持人，友好、幽默、善于引导话题。用中文简短回复，1-3句话为宜。' },
          ...messages
        ],
        max_tokens: 256,
        temperature: 0.8
      })
    });
    const data = await res.json();
    if (data.error) {
      console.error('[AI] 智谱 API 错误:', data.error.message || JSON.stringify(data.error));
      return null;
    }
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error('[AI] 智谱 API 返回空内容:', JSON.stringify(data).slice(0, 200));
    }
    return content || null;
  } catch (err) {
    console.error('[AI] 智谱 API 错误:', err.message);
    return null;
  }
}

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'chatroom-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
});

app.use(cookieParser());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use(sessionMiddleware);

// Socket 认证：内存 token，不依赖 session store
const socketTokens = new Map();
const TOKEN_TTL = 24 * 60 * 60 * 1000;

function createSocketToken(username) {
  const token = randomBytes(32).toString('hex');
  socketTokens.set(token, { username, expiry: Date.now() + TOKEN_TTL });
  return token;
}

// 先建立连接，连接后再验证 token（避免握手阶段 auth 失败导致连接不建立）
io.use((socket, next) => next());

// 注册
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const name = String(username).trim();
  if (name.length < 2 || name.length > 20) {
    return res.status(400).json({ error: '用户名需 2-20 个字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const users = loadUsers();
  if (users.some(u => u.username.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: '用户名已被占用' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({ username: name, passwordHash: hash });
  saveUsers(users);
  req.session.authenticated = true;
  req.session.user = name;
  const token = createSocketToken(name);
  res.json({ success: true, username: name, token });
});

// 登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  req.session.authenticated = true;
  req.session.user = user.username;
  const token = createSocketToken(user.username);
  res.json({ success: true, username: user.username, token });
});

// 登出
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 当前用户
app.get('/api/me', (req, res) => {
  if (!req.session?.authenticated || !req.session?.user) {
    return res.json({ authenticated: false, username: null, token: null });
  }
  const token = createSocketToken(req.session.user);
  res.json({
    authenticated: true,
    username: req.session.user,
    token
  });
});

io.on('connection', (socket) => {
  console.log('[Socket] 新连接:', socket.id);
  socket.authenticated = false;

  socket.on('auth', async (token) => {
    console.log('[Socket] 收到 auth, token 长度:', token?.length);
    if (socket.authenticated) return;
    const data = socketTokens.get(token);
    if (!data || data.expiry < Date.now()) {
      console.log('[Socket] auth 失败: token 无效或已过期');
      socket.emit('auth_fail', '登录已过期');
      socket.disconnect(true);
      return;
    }
    console.log('[Socket] auth 成功:', data.username);
    socket.authenticated = true;
    socket.username = data.username;
    socket.emit('auth_ok');
    socket.broadcast.emit('user_join', { username: socket.username, time: Date.now() });

    socket.emit('history', messageHistory);

    // AI 主持人欢迎新成员
  const apiKey = process.env.ZHIPU_API_KEY;
  if (apiKey) {
    const recent = messageHistory.slice(-6).map(m => ({ role: m.username === AI_HOST_NAME ? 'assistant' : 'user', content: `${m.username}: ${m.content}` }));
    const welcome = await callZhipuAPI([
      ...recent,
      { role: 'user', content: `新成员 ${socket.username} 加入了聊天室，请作为主持人简短欢迎一下（1-2句话）。` }
    ]);
    if (welcome) {
      const aiMsg = { id: Date.now() + '-ai', username: AI_HOST_NAME, content: welcome, time: Date.now() };
      messageHistory.push(aiMsg);
      saveMessages(messageHistory);
      io.emit('message', aiMsg);
    }
  }
  });

  socket.on('message', async (content) => {
    if (!socket.authenticated || !socket.username) return;
    const text = String(content || '').trim();
    if (!text) return;
    const username = socket.username;
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2),
      username: socket.username,
      content: text,
      time: Date.now()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_MESSAGES) {
      messageHistory = messageHistory.slice(-MAX_MESSAGES);
    }
    saveMessages(messageHistory);
    io.emit('message', msg);

    // @AI 或 @主持人 时，AI 主持人回复
    const needAI = /@(AI|主持人)/i.test(text);
    if (needAI) {
      if (!process.env.ZHIPU_API_KEY) {
        const hintMsg = { id: Date.now() + '-ai', username: AI_HOST_NAME, content: 'AI 主持人未配置。请在 Railway 的 Variables 中添加 ZHIPU_API_KEY（智谱 API 密钥，获取地址: https://open.bigmodel.cn/）', time: Date.now() };
        io.emit('message', hintMsg);
        return;
      }
      const recent = messageHistory.slice(-10).map(m => ({
        role: m.username === AI_HOST_NAME ? 'assistant' : 'user',
        content: `${m.username}: ${m.content}`
      }));
      const reply = await callZhipuAPI(recent);
      if (reply) {
        const aiMsg = { id: Date.now() + '-ai', username: AI_HOST_NAME, content: reply, time: Date.now() };
        messageHistory.push(aiMsg);
        saveMessages(messageHistory);
        io.emit('message', aiMsg);
      } else {
        const errMsg = { id: Date.now() + '-ai', username: AI_HOST_NAME, content: '抱歉，AI 暂时无法回复，请检查 API 配置或稍后再试。', time: Date.now() };
        io.emit('message', errMsg);
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.authenticated && socket.username) {
      socket.broadcast.emit('user_leave', { username: socket.username, time: Date.now() });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n  群聊聊天室已启动: http://localhost:${PORT}\n`);
  console.log('  分享此链接，用户注册/登录后即可在同一聊天室聊天\n');
});
