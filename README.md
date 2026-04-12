# 个人成长导师 (Personal Growth Tutor)

AI 驱动的个人成长辅导 Web 应用，帮助用户发现弱点、制定计划、逐步成长。

## 功能

- **弱点诊断**：AI 根据辅导模式动态生成诊断问题，发现知识和习惯弱点
- **成长计划**：结合弱点和用户目标，AI 生成个性化分步计划
- **学习指导**：自由对话 + AI 导师实时指导
- **步骤考核**：知识题（客观题）+ 习惯题（自我报告），通过后才能进入下一步
- **最终考核**：所有步骤完成后触发综合考核，通过后获得结业证书

## 技术栈

- 前端：React 18 + Vite + Tailwind CSS
- 后端：Node.js + Express
- 数据库：SQLite (better-sqlite3)
- AI：OpenAI 兼容 API（支持 ZhipuAI、Anthropic 等）

## 快速开始

### 1. 环境准备

```bash
# 需要 Node.js >= 18
node --version
```

### 2. 配置 AI 密钥

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入你的 API 密钥
```

`.env` 配置项：

| 变量 | 说明 | 示例 |
|------|------|------|
| `AI_PROVIDER` | AI 提供商 | `openai` 或 `anthropic` |
| `OPENAI_API_KEY` | API 密钥 | `sk-xxx` |
| `OPENAI_BASE_URL` | API 地址（兼容接口） | `https://open.bigmodel.cn/api/paas/v4` |
| `AI_MODEL` | 模型名称 | `glm-4-flash` |
| `PORT` | 后端端口 | `3001` |

### 3. 安装依赖

```bash
# 后端
cd backend && npm install

# 前端
cd ../frontend && npm install
```

### 4. 启动开发

```bash
# 终端1：启动后端
cd backend && npm run dev

# 终端2：启动前端
cd frontend && npm run dev
```

打开 http://localhost:5173 开始使用。

### 5. Docker 部署

```bash
# 在项目根目录
docker-compose up --build
```

## 项目结构

```
tutor/
├── backend/
│   ├── server.js              # Express 服务器
│   ├── db.js                  # SQLite 数据库初始化
│   ├── ai.js                  # AI 调用封装
│   ├── prompt_templates.js    # 可扩展的提示词模板
│   ├── routes/
│   │   ├── state.js           # 用户状态 API
│   │   ├── diagnose.js        # 诊断流程 API
│   │   ├── plan.js            # 计划生成 API
│   │   ├── chat.js            # 对话 API
│   │   ├── step.js            # 步骤考核 API
│   │   └── exam.js            # 最终考核 API
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # 主应用（路由控制）
│   │   ├── api.js             # API 客户端
│   │   └── components/
│   │       ├── ModeSelector.jsx   # 模式选择
│   │       ├── Diagnosis.jsx      # 诊断问答
│   │       ├── PlanEditor.jsx     # 计划编辑
│   │       ├── StudyDashboard.jsx # 学习主界面
│   │       └── FinalReport.jsx    # 结业报告
│   ├── Dockerfile
│   └── ...
├── docker-compose.yml
└── README.md
```

## 扩展提示词模板

所有 AI 提示词都在 `backend/prompt_templates.js` 中定义。要添加新的辅导模式或弱点类型：

1. **添加新的诊断模板**：在 `templates` 对象中添加新条目，如 `diagnose_creative: () => ...`
2. **添加新的考核类型**：在 `quiz_` 前缀下添加新模板，如 `quiz_project: (title) => ...`
3. **添加新的评估逻辑**：在 `evaluate_` 前缀下添加模板
4. **在 `ai.js` 中添加对应方法**：参考现有方法添加新的便捷调用

模板使用函数形式，参数化领域和上下文信息，无需硬编码。

## 辅导模式

| 模式 | 值 | 说明 |
|------|-----|------|
| 学科辅导 | `subject` | 专注知识/技能弱点 |
| 成长辅导 | `character` | 专注性格/习惯弱点 |
| 综合模式 | `integrated` | 两者并行（默认） |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/state` | 获取用户状态 |
| POST | `/api/state/set_mode` | 设置辅导模式 |
| POST | `/api/diagnose/start` | 开始诊断 |
| POST | `/api/diagnose/answer` | 提交诊断答案 |
| POST | `/api/plan/generate_plan` | 生成计划 |
| POST | `/api/plan/save_plan` | 保存计划 |
| POST | `/api/chat` | AI 对话 |
| POST | `/api/step/complete_step` | 请求步骤考核 |
| POST | `/api/step/submit_quiz` | 提交考核答案 |
| POST | `/api/final_exam` | 开始最终考核 |
| POST | `/api/final_exam/submit` | 提交最终考核 |

## License

MIT
