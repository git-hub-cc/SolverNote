## 后续计划

### 🧠 第二阶段：注入灵魂 (Injecting Soul)
**目标**：接入真实的 LLM API，让应用名副其实（Solver），不仅仅是 Note。

1.  **AI 侧边栏交互补全**
    *   **前端 (`SolverSidebar.vue`)**:
        *   **添加输入框**：目前侧边栏底部是空的，需要添加 `<textarea>` 和发送按钮，绑定 `sendMessage`。
        *   **设置页面**：增加 `API Key` (如 OpenAI/Anthropic/DeepSeek) 和 `Base URL` 的输入框。

2.  **接入真实 LLM**
    *   **Store (`solverStore.js`)**:
        *   移除 `mockResponse` 和打字机模拟。
        *   调用 `fetch` 请求 LLM API。
        *   实现**流式传输 (Server-Sent Events)** 解析，让文字像 ChatGPT 一样逐字出现。

3.  **实现 "Context" 模式 (RAG 的雏形)**
    *   **当前逻辑**：当用户选中笔记 A，侧边栏自动分析笔记 A。
    *   **实现逻辑**：
        *   构建 Prompt：`"Context: {笔记A的内容}\n\nTask: 请简要总结这篇笔记的关键点，并给出 3 个可能的延伸思考方向。"`
        *   将这个 Prompt 发送给 LLM，显示在侧边栏的 `Context` 视图中。

---

### 🚀 第三阶段：完善体验 (Polishing Experience)
**目标**：提升编辑器体验，引入向量能力，使其达到生产级标准。

1.  **编辑器高级化 (TipTap + Markdown)**
    *   **双向同步**：目前 TipTap 输出的是 HTML 或 纯文本。需要配置 **Markdown Serializer**。
        *   读取：`.md` 文件 -> 解析为 HTML -> 载入 TipTap。
        *   保存：TipTap 内容 -> 序列化为 Markdown -> 写入 `.md` 文件。
    *   **图片支持**：实现拖拽图片到编辑器，自动保存图片到 `notes/assets` 文件夹，并插入 Markdown 图片链接 `![image](./assets/xxx.png)`。

2.  **引入向量搜索 (Vector Search)**
    *   *这是一个较大的功能点，放在最后实现。*
    *   **后端**: 当笔记保存时，调用 Embedding API (如 OpenAI `text-embedding-3-small`) 生成向量。
    *   **存储**: 使用轻量级向量库（如 `LanceDB` Node版，或者简单的 JSON 文件存储向量数组）。
    *   **搜索**: 替换 `handleSearchNotes` 中的 `includes` 字符串匹配，改为**余弦相似度**搜索。这将允许用户搜索 "会议记录" 却能搜到内容里没有这四个字但意图相关的 "周一复盘"。

3.  **标签与元数据管理**
    *   实现 `/tags` 页面，统计所有笔记 Frontmatter 中的 tags。
    *   在编辑器中支持 `#tag` 自动补全，保存时自动写入 Frontmatter。
