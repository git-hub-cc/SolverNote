<template>
  <aside class="solver-sidebar">
    <!-- 头部: 标题与状态指示 + 关闭按钮 -->
    <div class="solver-header">
      <div class="header-left">
        <span class="title">{{ currentTitle }}</span>
        <div class="status-dot" :class="{ active: solverStore.isThinking }"></div>
      </div>

      <button class="close-btn" @click="$emit('close')" title="关闭侧边栏">
        <PanelRightCloseIcon class="icon-sm" />
      </button>
    </div>

    <!-- 内容主体: 聊天记录或上下文关联 -->
    <div class="solver-content" ref="contentAreaRef">
      <!-- 1. 聊天模式 -->
      <div v-if="solverStore.mode === 'chat'" class="chat-view">
        <div v-for="(msg, index) in solverStore.chatHistory" :key="index" class="chat-bubble-wrapper">
          <div class="chat-bubble" :class="msg.role">
            <!-- AI 消息的操作按钮 (悬停显示) -->
            <div v-if="msg.role === 'ai'" class="bubble-actions">
              <button @click="handleCopyToClipboard(msg.text)" title="复制"><CopyIcon class="icon-xs" /></button>
              <button @click="handleInsertIntoNote(msg.text)" title="插入到笔记"><CornerDownLeftIcon class="icon-xs" /></button>
            </div>
            <!-- 渲染后的消息文本 -->
            <div class="bubble-text" v-html="renderMarkdown(msg.text)"></div>
          </div>
        </div>

        <!-- 流式输出中的消息 -->
        <div v-if="solverStore.streamingText" class="chat-bubble-wrapper">
          <div class="chat-bubble ai streaming">
            <div class="bubble-text">{{ solverStore.streamingText }}<span class="cursor">|</span></div>
          </div>
        </div>
      </div>

      <!-- 2. 上下文模式 (智能关联) -->
      <div v-else-if="solverStore.mode === 'context'" class="context-view">
        <div class="context-meta">
          基于当前选中笔记的智能关联
        </div>
        <div v-if="solverStore.isThinking" class="loading-state">
          思考中...
        </div>
        <div v-else-if="solverStore.relatedContexts.length === 0" class="empty-state">
          未找到相关内容。
        </div>
        <div v-else>
          <!-- 点击卡片跳转 -->
          <div
              v-for="ref in solverStore.relatedContexts"
              :key="ref.id"
              class="ref-card"
              @click="handleRefCardClick(ref.id)"
              title="点击跳转到该笔记"
          >
            <div class="ref-header">
              <span class="ref-title">{{ ref.title || ref.id }}</span>
              <span class="ref-score">{{ ref.similarity }}%</span>
            </div>
            <div class="ref-snippet">{{ ref.snippet }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部: 错误提示与输入区域 -->
    <footer class="solver-footer">
      <!-- 错误提示 -->
      <div v-if="solverStore.error" class="solver-error-box">
        <p>{{ solverStore.error }}</p>
      </div>

      <!-- [核心修改] 根据模式条件渲染输入框或切换按钮 -->

      <!-- 1. 聊天模式下，显示输入框 -->
      <div v-if="solverStore.mode === 'chat'" class="chat-input-area">
        <textarea
            ref="textareaRef"
            v-model="chatInput"
            placeholder="向 Solver 提问..."
            class="chat-textarea"
            :disabled="solverStore.isThinking"
            @input="autoResizeTextarea"
            @keydown.enter.exact.prevent="sendMessage"
        ></textarea>
        <button class="send-button" @click="sendMessage" :disabled="!chatInput.trim() || solverStore.isThinking">
          <SendIcon class="icon-sm" />
        </button>
      </div>

      <!-- 2. 上下文模式下，显示切换到聊天的按钮 -->
      <div v-else class="context-actions">
        <button class="switch-to-chat-btn" @click="handleSwitchToChat">
          <MessageSquarePlusIcon class="icon-sm"/>
          <span>向 AI 提问</span>
        </button>
      </div>
    </footer>
  </aside>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useSolverStore } from '@/stores/solverStore'
import { useNoteStore } from '@/stores/noteStore'
import { renderMarkdown } from '@/utils/markdownRenderer'
// [新增] 引入 MessageSquarePlusIcon 图标
import {
  Send as SendIcon,
  Copy as CopyIcon,
  CornerDownLeft as CornerDownLeftIcon,
  PanelRightClose as PanelRightCloseIcon,
  MessageSquarePlus as MessageSquarePlusIcon
} from 'lucide-vue-next'

defineEmits(['close'])

// Store 实例
const solverStore = useSolverStore()
const noteStore = useNoteStore()

// 响应式引用
const chatInput = ref('')
const textareaRef = ref(null)
const contentAreaRef = ref(null)

// 计算属性，根据模式返回不同标题
const currentTitle = computed(() => {
  return solverStore.mode === 'chat' ? '智能助手 (Solver)' : '智能关联 (Context)'
})

// 自动调整文本框高度
const autoResizeTextarea = () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// 监听聊天记录变化，自动滚动到底部
watch(() => [solverStore.chatHistory.length, solverStore.streamingText], async () => {
  await nextTick()
  if (contentAreaRef.value) {
    contentAreaRef.value.scrollTop = contentAreaRef.value.scrollHeight
  }
}, { deep: true })

// 发送消息
const sendMessage = () => {
  const text = chatInput.value.trim()
  if (!text || solverStore.isThinking) return
  solverStore.sendMessage(text)
  chatInput.value = ''
  nextTick(autoResizeTextarea)
}

// [新增] 处理切换到聊天模式的事件
const handleSwitchToChat = () => {
  solverStore.switchToChatMode();
}

// 点击关联卡片，跳转到对应笔记
const handleRefCardClick = (noteId) => {
  noteStore.scrollToNote(noteId)
}

// 复制 AI 回答到剪贴板
const handleCopyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 将 AI 回答插入到当前正在编辑的笔记中
const handleInsertIntoNote = (text) => {
  noteStore.insertTextIntoNote(text)
}
</script>

<style lang="scss" scoped>
// 主题变量 (用于错误提示框)
:root {
  --color-danger-bg: #FEF2F2;
  --color-danger-border: #FCA5A5;
  --color-danger-text: #B91C1C;
}
html.dark {
  --color-danger-bg: #450A0A;
  --color-danger-border: #7F1D1D;
  --color-danger-text: #F87171;
}

.solver-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-card);
}

.solver-header {
  height: 48px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--border-light);
    transition: all 0.3s;
    &.active {
      background-color: #10B981;
      animation: pulse 2s infinite;
    }
  }
}

.close-btn {
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-secondary);
  }
}

.solver-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* --- 聊天视图样式 --- */
.chat-bubble-wrapper {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}
.chat-bubble {
  font-size: 14px;
  line-height: 1.6;
  padding: 10px 14px;
  border-radius: 12px;
  max-width: 90%;
  position: relative;

  &.user {
    align-self: flex-end;
    background: var(--color-brand);
    color: white;
  }
  &.ai {
    align-self: flex-start;
    background: var(--bg-hover);
    color: var(--text-primary);

    &:hover .bubble-actions {
      opacity: 1;
    }
  }
}

.bubble-actions {
  position: absolute;
  top: -10px;
  right: 0;
  display: flex;
  gap: 4px;
  background: var(--bg-card);
  padding: 4px;
  border-radius: 6px;
  box-shadow: var(--shadow-float);
  opacity: 0;
  transition: opacity 0.2s;

  button {
    color: var(--text-tertiary);
    cursor: pointer;
    &:hover { color: var(--text-primary); }
  }
  .icon-xs { width: 14px; height: 14px; }
}

.cursor { display: inline-block; animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* --- 上下文视图样式 --- */
.context-meta { font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px; }
.ref-card { background: var(--bg-app); border: 1px solid transparent; border-radius: var(--radius-sm); padding: 12px; cursor: pointer; transition: all 0.2s; &:hover { background: var(--bg-card); border-color: var(--color-brand-light); box-shadow: var(--shadow-card); transform: translateY(-1px); } }
.ref-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; font-weight: 600; }
.ref-score { color: var(--color-brand); font-size: 11px; }
.ref-snippet { font-size: 12px; color: var(--text-secondary); line-height: 1.4; }
.loading-state, .empty-state {
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 20px 0;
}

/* --- 底部区域样式 --- */
.solver-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--border-light);
  padding: 12px 16px;
}
.solver-error-box {
  padding: 12px;
  background-color: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  color: var(--color-danger-text);
  font-size: 12px;
  line-height: 1.4;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background-color: var(--bg-hover);
  border-radius: var(--radius-md);
  padding: 8px;
}

.chat-textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  resize: none;
  max-height: 150px;
  overflow-y: auto;
  line-height: 1.5;
  color: var(--text-primary);

  &::placeholder {
    color: var(--text-tertiary);
  }
  &:disabled {
    background-color: transparent;
  }
}

.send-button {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background-color: var(--color-brand);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--color-brand-hover);
  }
  &:disabled {
    background-color: var(--bg-active);
    cursor: not-allowed;
  }
  .icon-sm { width: 16px; height: 16px; }
}

/* [新增] 上下文模式下的操作区样式 */
.context-actions {
  display: flex;
  justify-content: center;
  align-items: center;
}

.switch-to-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background-color: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;

  &:hover {
    background-color: var(--color-brand-light);
    color: var(--color-brand);
  }

  .icon-sm {
    width: 16px;
    height: 16px;
  }
}
</style>