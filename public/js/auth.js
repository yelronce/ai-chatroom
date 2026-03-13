// 已登录则直接进入聊天室
fetch('/api/me').then(r => r.json()).then(data => {
  if (data.authenticated) window.location.href = '/chat.html';
});

const tabs = document.querySelectorAll('.tab');
const forms = document.querySelectorAll('.form');
const errorEl = document.getElementById('error');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove('active'));
    forms.forEach(f => {
      f.classList.toggle('active', f.id === target + 'Form');
    });
    tab.classList.add('active');
    errorEl.textContent = '';
  });
});

function showError(msg) {
  errorEl.textContent = msg;
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  showError('');
  if (!username || !password) {
    showError('请输入用户名和密码');
    return;
  }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      sessionStorage.setItem('socketToken', data.token);
      window.location.href = '/chat.html';
    } else if (res.ok) {
      window.location.href = '/chat.html';
    } else {
      showError(data.error || '登录失败');
    }
  } catch (err) {
    showError('网络错误，请重试');
  }
}

async function register(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  showError('');
  if (!username || !password) {
    showError('请输入用户名和密码');
    return;
  }
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      sessionStorage.setItem('socketToken', data.token);
      window.location.href = '/chat.html';
    } else if (res.ok) {
      window.location.href = '/chat.html';
    } else {
      showError(data.error || '注册失败');
    }
  } catch (err) {
    showError('网络错误，请重试');
  }
}

document.getElementById('loginForm').addEventListener('submit', login);
document.getElementById('registerForm').addEventListener('submit', register);
