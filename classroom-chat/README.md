# 课堂对话小窗口

这个目录提供一个零依赖的课堂聊天页面。浏览器只访问本地代理，由代理把消息转发给 n8n，避免 CORS 和前端暴露 n8n 管理接口。

## 启动

确保 n8n 已在 `http://localhost:5678` 运行，然后执行：

```powershell
node .\classroom-chat\server.mjs
```

打开：

```text
http://127.0.0.1:4173
```

学生 workspace：

```text
http://127.0.0.1:4173/student/
```

如果 n8n 的 Webhook 地址发生变化，可以临时指定：

```powershell
$env:N8N_CHAT_WEBHOOK="http://localhost:5678/webhook/你的地址/chat"
node .\classroom-chat\server.mjs
```

## 当前能力

- 与 n8n Chat Trigger 进行多轮文字对话。
- 按会话 ID 保持 n8n Simple Memory。
- 支持 Qwen3 TTS 高级服务端语音，包含长句切分、预取和本地缓存。
- 高级语音不可用时自动回退到浏览器系统语音。
- 支持仅自动朗读老师引导、朗读每条 AI 回复、关闭自动朗读。
- 每条 AI 回复都可以单独点击朗读。
- 本地保存最近 80 条页面消息。
- 学生 workspace 提供课程中心、课程内嵌课堂对话、掌握星级、当前/历史表、查缺补漏和标注记录。
- workspace 可直接新增标注；有效标注关联知识点后自动进入 1 星并追加掌握历史。

## 后续能力

- 上传课堂文件。
- 接入豆包、MiniMax、Azure 等其他固定老师音色。
- n8n 返回 `speech.kind` 等结构化语音字段，精确区分老师引导、系统提示和普通答疑。

## 高级语音配置

高级语音配置放在本目录的 `.env` 文件中，密钥只由本地 Node 代理读取，
不会发送到浏览器：

```env
TTS_PROVIDER=qwen
TTS_QWEN_API_KEY=你的阿里云百炼 API Key
TTS_QWEN_BASE_URL=https://dashscope.aliyuncs.com/api/v1
TTS_QWEN_MODEL=qwen3-tts-flash
TTS_QWEN_VOICE=Cherry
TTS_QWEN_SPEED=1.0
```

页面右上角设置中可以切换老师音色。修改 `.env` 后无需重启页面，
下一次朗读时会自动读取新配置。

## 语音实现说明

浏览器回退方案使用 Web Speech API，交互思路参考了 MIT 许可的
[SZU-AgentEduPlatform](https://github.com/jwentong/SZU-AgentEduPlatform)
中 OpenMAIC 的浏览器原生 TTS 方案。实现只保留课堂窗口需要的最小组件，
高级语音请求格式参考同一仓库的 Qwen TTS 实现，没有引入其 Next.js、
设置仓库和完整多供应商服务端依赖。
