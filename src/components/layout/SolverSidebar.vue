<template>
  <aside class="solver-sidebar">
    <!-- Header -->
    <div class="solver-header">
      <span class="title">{{ currentTitle }}</span>
      <div class="status-dot" :class="{ active: solverStore.isThinking }"></div>
    </div>

    <!-- Content Body -->
    <div class="solver-content">
      <!-- ... (内容部分保持不变) ... -->
      <!-- 1. 聊天模式 -->
      <div v-if="solverStore.mode === 'chat'" class="chat-view">
        <div v-for="(msg, index) in solverStore.chatHistory" :key="index" class="chat-bubble" :class="msg.role">
          <div class="bubble-text" v-html="renderMarkdown(msg.text)"></div>
        </div>
        <!-- 流式输出中的消息 -->
        <div v-if="solverStore.streamingText" class="chat-bubble ai streaming">
          <div class="bubble-text">{{ solverStore.streamingText }}<span class="cursor">|</span></div>
        </div>
      </div>
      <!-- 2. 上下文模式 (智能关联) -->
      <div v-else-if="solverStore.mode === 'context'" class="context-view">
        <div class="context-meta">
          Based on selection
        </div>
        <div v-if="solverStore.isThinking" class="loading-state">
          Thinking...
        </div>
        <div v-else-if="solverStore.relatedContexts.length === 0" class="empty-state">
          No related context found.
        </div>
        <div
            v-else
            v-for="ref in solverStore.relatedContexts"
            :key="ref.id"
            class="ref-card"
        >
          <div class="ref-header">
            <span class="ref-title">{{ ref.title }}</span>
            <span class="ref-score">{{ ref.similarity }}%</span>
          </div>
          <div class="ref-snippet">{{ ref.snippet }}</div>
        </div>
      </div>
    </div>

    <!-- [新增] 底部错误提示区域 -->
    <div v-if="solverStore.error" class="solver-footer-error">
      <p>{{ solverStore.error }}</p>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useSolverStore } from '@/stores/solverStore'
const renderMarkdown = (text) => text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

const solverStore = useSolverStore()

const currentTitle = computed(() => {
  return solverStore.mode === 'chat' ? 'The Solver' : 'Context (Auto)'
})
</script>

<style lang="scss" scoped>
.solver-sidebar {
  display: flex;
  flex-direction: column;
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

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--border-light);
    transition: all 0.3s;

    &.active {
      background-color: #10B981; /* Emerald-500 */
      animation: pulse 2s infinite;
    }
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

/* [新增] 底部错误样式 */
.solver-footer-error {
  flex-shrink: 0;
  padding: 12px 16px;
  background-color: #FEF2F2;
  border-top: 1px solid #FCA5A5;
  color: #B91C1C;
  font-size: 12px;
  line-height: 1.4;
}

/* --- 以下为原有样式，保持不变 --- */
.chat-bubble {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;

  &.user { color: var(--text-secondary); text-align: right; }
  &.ai { background: var(--bg-hover); padding: 12px; border-radius: 8px; color: var(--text-primary); }
}

.cursor { display: inline-block; animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

.context-meta { font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px; }
.ref-card { background: var(--bg-app); border: 1px solid transparent; border-radius: var(--radius-sm); padding: 12px; cursor: pointer; transition: all 0.2s; &:hover { background: #fff; border-color: var(--border-light); box-shadow: var(--shadow-card); } }
.ref-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; font-weight: 600; }
.ref-score { color: var(--color-brand); font-size: 11px; }
.ref-snippet { font-size: 12px; color: var(--text-secondary); line-height: 1.4; }
</style>