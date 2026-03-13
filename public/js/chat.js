const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const logoutBtn = document.getElementById('logoutBtn');
const usernameEl = document.getElementById('username');
const statusEl = document.getElementById('connectionStatus');

let socket = null;
let myUsername = '';
let socketReady = false;

async function checkAuth() {
  const res = await fetch('/api/me', { credentials: 'include' });
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = '/';
    return false;
  }
  myUsername = data.username;
  usernameEl.textContent = myUsername;
  if (data.token) sessionStorage.setItem('socketToken', data.token);
  return data.token || sessionStorage.getItem('socketToken');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function addMessage(msg, isMe = false) {
  const isAI = msg.username === 'AI主持人';
  const div = document.createElement('div');
  div.className = `msg ${isMe ? 'me' : isAI ? 'ai' : 'other'}`;
  const avatar = (msg.username || '?').slice(0, 1);
  div.innerHTML = `
    <span class="avatar">${escapeHtml(avatar)}</span>
    <div>
      <div class="name">${escapeHtml(msg.username || '')}</div>
      <div class="content">${escapeHtml(msg.content || '')}</div>
      <div class="time">${formatTime(msg.time)}</div>
    </div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.innerHTML = `<span class="system-text">${escapeHtml(text)}</span>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function connectSocket(token) {
  if (!token) {
    addSystemMessage('登录已过期，请重新登录');
    setTimeout(() => { window.location.href = '/'; }, 1500);
    return;
  }
  socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    connectionErrorShown = false;
    statusEl.textContent = '验证中...';
    socket.emit('auth', token);
    document.getElementById('retryBtn').style.display = 'inline-block';
    clearTimeout(window._authTimeout);
    window._authTimeout = setTimeout(() => {
      if (!socketReady) {
        statusEl.textContent = '验证超时';
        statusEl.className = 'connection-status error';
        if (!connectionErrorShown) {
          connectionErrorShown = true;
          addSystemMessage('验证超时，请点击「重试连接」');
        }
      }
    }, 10000);
  });

  socket.on('auth_ok', () => {
    clearTimeout(window._authTimeout);
    socketReady = true;
    statusEl.textContent = '已连接';
    statusEl.className = 'connection-status connected';
    document.getElementById('retryBtn').style.display = 'none';
  });

  socket.on('auth_fail', (msg) => {
    addSystemMessage(msg || '登录已过期，请重新登录');
    setTimeout(() => { window.location.href = '/'; }, 1500);
  });

  socket.on('disconnect', () => {
    socketReady = false;
    statusEl.textContent = '未连接';
    statusEl.className = 'connection-status';
    document.getElementById('retryBtn').style.display = 'inline-block';
  });

  socket.on('history', (history) => {
    history.forEach(msg => addMessage(msg, msg.username === myUsername));
  });

  socket.on('message', (msg) => {
    addMessage(msg, msg.username === myUsername);
  });

  socket.on('user_join', (data) => {
    addSystemMessage(`${data.username} 加入了聊天室`);
  });

  socket.on('user_leave', (data) => {
    addSystemMessage(`${data.username} 离开了聊天室`);
  });

  socket.on('connect_error', () => {
    socketReady = false;
    statusEl.textContent = '连接失败';
    statusEl.className = 'connection-status error';
    document.getElementById('retryBtn').style.display = 'inline-block';
    if (!connectionErrorShown) {
      connectionErrorShown = true;
      addSystemMessage('连接失败，请点击「重试连接」或退出重新登录');
    }
  });
}

async function retryConnect() {
  const btn = document.getElementById('retryBtn');
  btn.style.display = 'none';
  btn.disabled = true;
  const token = await checkAuth();
  if (token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    connectSocket(token);
  } else {
    window.location.href = '/';
  }
  btn.disabled = false;
}

let connectionErrorShown = false;

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  if (!socketReady) {
    if (!connectionErrorShown) {
      connectionErrorShown = true;
      addSystemMessage('连接未就绪，请等待验证完成或点击「重试连接」');
    }
    return;
  }

  inputEl.value = '';
  socket.emit('message', text);
  inputEl.focus();
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

document.getElementById('retryBtn').addEventListener('click', retryConnect);

logoutBtn.addEventListener('click', async () => {
  sessionStorage.removeItem('socketToken');
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

(async () => {
  const token = await checkAuth();
  if (!token) return;
  connectSocket(token);
  inputEl.focus();
})();
