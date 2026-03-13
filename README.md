# 群聊聊天室

多用户群聊聊天室，分享链接后，用户注册/登录即可在同一聊天室实时聊天。

## 功能

- 用户注册（用户名 + 密码）
- 用户登录
- 实时群聊（所有人共享同一聊天室）
- 消息历史（新加入用户可看到最近 200 条消息）
- 进出提示（谁加入/离开了聊天室）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm start
```

### 3. 分享链接

将 `http://localhost:3000`（或你的服务器地址）分享给其他人，大家注册或登录后即可在同一聊天室聊天。

## 开发模式

```bash
npm run dev
```

## AI 主持人

配置 `ZHIPU_API_KEY` 后，聊天室会有 **AI主持人**：
- 新成员加入时自动欢迎
- 输入 `@AI` 或 `@主持人` 可召唤 AI 回复

在 `.env` 中设置：
```
ZHIPU_API_KEY=你的智谱API密钥
ZHIPU_MODEL=glm-5
```

模型可选：`glm-5`、`glm-4-plus`、`glm-4-flash` 等，见 [智谱开放平台](https://open.bigmodel.cn/)。

## 数据存储

- 用户数据：`data/users.json`
- 消息历史：`data/messages.json`（保留最近 200 条）
