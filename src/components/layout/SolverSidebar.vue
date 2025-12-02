<template>
  <aside class="solver-sidebar">
    <!-- 头部: 标题与状态指示 + 关闭按钮 -->
    <div class="solver-header">
      <div class="header-left">
        <span class="title">{{ currentTitle }}</span>
        <div class="status-dot" :class="{ active: solverStore.isThinking }"></div>
      </div>

      <button class="close-btn" @click="$emit('close')" title="Close Sidebar">
        <PanelRightCloseIcon class="icon-sm" />
      </button>
    </div>

    <!-- 内容主体: 聊天记录或上下文关联 -->
    <div class="solver-content" ref="contentAreaRef">
      <!-- 1. 聊天模式 -->
      <div v-if="solverStore.mode === 'chat'" class="chat-view">
        <div v-for="(msg, index) in solverStore.chatHistory" :key="index" class="chat-bubble-wrapper">
          <div class="chat-bubble" :class="msg.role">
            <div v-if="msg.role === 'ai'" class="bubble-actions">
              <button @click="handleCopyToClipboard(msg.text)" title="Copy"><CopyIcon class="icon-xs" /></button>
              <button @click="handleInsertIntoNote(msg.text)" title="Insert into Note"><CornerDownLeftIcon class="icon-xs" /></button>
            </div>
            <div class="bubble-text" v-html="renderMarkdown(msg.text)"></div>
          </div>
        </div>

        <div v-if="solverStore.streamingText" class="chat-bubble-wrapper">
          <div class="chat-bubble ai streaming">
            <div class="bubble-text">{{ solverStore.streamingText }}<span class="cursor">|</span></div>
          </div>
        </div>
      </div>

      <!-- 2. 上下文模式 (智能关联) -->
      <div v-else-if="solverStore.mode === 'context'" class="context-view">
        <div class="context-meta">
          {{ contextMetaText }}
        </div>
        <div v-if="solverStore.isThinking" class="loading-state">
          Thinking...
        </div>
        <div v-else-if="solverStore.relatedContexts.length === 0" class="empty-state">
          No related content found.
        </div>
        <div v-else>
          <router-link
              v-for="ref in solverStore.relatedContexts"
              :key="ref.id"
              :to="{ name: 'note-view', params: { noteId: ref.id } }"
              class="ref-card"
              title="Click to view note"
          >
            <div class="ref-header">
              <span class="ref-title">{{ ref.title || ref.id }}</span>
              <span class="ref-score">{{ ref.similarity }}%</span>
            </div>
            <div class="ref-snippet">{{ ref.snippet }}</div>
          </router-link>
        </div>
      </div>
    </div>

    <!-- 底部: 错误提示与输入区域 -->
    <footer class="solver-footer">
      <div v-if="solverStore.error" class="solver-error-box">
        <p>{{ solverStore.error }}</p>
      </div>

      <div v-if="isContextSwitchVisible" class="context-toggle-wrapper">
        <label for="context-toggle" class="toggle-label">
          <input
              id="context-toggle"
              type="checkbox"
              :checked="solverStore.isContextToggleOn"
              @change="solverStore.toggleContextInclusion()"
              class="toggle-checkbox"
          />
          <span class="toggle-switch"></span>
          Include {{ currentViewName }} context
        </label>
      </div>


      <div v-if="solverStore.mode === 'chat'" class="chat-input-area">
        <textarea
            ref="textareaRef"
            v-model="chatInput"
            placeholder="Ask Solver..."
            class="chat-textarea"
            :disabled="solverStore.isThinking"
            @input="autoResizeTextarea"
            @keydown.enter.exact.prevent="sendMessage"
        ></textarea>
        <button class="send-button" @click="sendMessage" :disabled="!chatInput.trim() || solverStore.isThinking">
          <SendIcon class="icon-sm" />
        </button>
      </div>

      <div v-else class="context-actions">
        <button class="switch-to-chat-btn" @click="handleSwitchToChat">
          <MessageSquarePlusIcon class="icon-sm"/>
          <span>Ask AI</span>
        </button>
      </div>
    </footer>
  </aside>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useSolverStore } from '@/stores/solverStore'
import { useNoteStore } from '@/stores/noteStore'
// [新增] 引入 UI Store
import { useUIStore } from '@/stores/uiStore'
import { renderMarkdown } from '@/utils/markdownRenderer'
import {
  Send as SendIcon,
  Copy as CopyIcon,
  CornerDownLeft as CornerDownLeftIcon,
  PanelRightClose as PanelRightCloseIcon,
  MessageSquarePlus as MessageSquarePlusIcon
} from 'lucide-vue-next'

defineEmits(['close'])

const solverStore = useSolverStore()
const noteStore = useNoteStore()
const uiStore = useUIStore() // [新增]
const route = useRoute()

const chatInput = ref('')
const textareaRef = ref(null)
const contentAreaRef = ref(null)

const currentViewName = computed(() => {
  if (route.name === 'note-view') return 'note'
  if (route.name === 'home') return 'draft'
  return ''
});

const isContextSwitchVisible = computed(() => {
  return ['home', 'note-view'].includes(route.name);
});

const currentTitle = computed(() => {
  return solverStore.mode === 'chat' ? 'AI Assistant (Solver)' : 'Context (Related)'
})

const contextMetaText = computed(() => {
  if (route.name === 'note-view') {
    return 'CONTEXT BASED ON CURRENT NOTE'
  }
  if (route.name === 'home') {
    return 'CONTEXT BASED ON CURRENT DRAFT'
  }
  return 'RELATED CONTEXT'
});

const autoResizeTextarea = () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(() => [solverStore.chatHistory.length, solverStore.streamingText], async () => {
  await nextTick()
  if (contentAreaRef.value) {
    contentAreaRef.value.scrollTop = contentAreaRef.value.scrollHeight
  }
}, { deep: true })

const sendMessage = () => {
  const text = chatInput.value.trim()
  if (!text || solverStore.isThinking) return

  // 1. 确定上下文内容
  let contextContent = null;
  if (route.name === 'note-view' && route.params.noteId) {
    const currentNote = noteStore.getNoteById(route.params.noteId);
    contextContent = currentNote ? currentNote.content : null;
  }
  else if (route.name === 'home') {
    contextContent = solverStore.draftContext;
  }

  // 2. 调用 store action
  solverStore.sendMessage(text, contextContent);

  // 3. 清理输入框
  chatInput.value = ''
  nextTick(autoResizeTextarea)
}

const handleSwitchToChat = () => {
  solverStore.switchToChatMode();
}

const handleCopyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    // [可选优化] 这里也可以加上 uiStore.showNotification('Copied!', 'success')
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const handleInsertIntoNote = (text) => {
  if (route.name === 'note-view' && route.params.noteId) {
    // [修改] 使用 Toast 替代 alert
    uiStore.showNotification('Insertion feature is under development!', 'info');
  } else if (route.name === 'home') {
    const currentDraft = solverStore.draftContext;
    solverStore.setDraftContext(currentDraft + `\n\n${text}`);
    uiStore.showNotification('Inserted into draft', 'success'); // 顺便加个成功提示
  }
}

</script>

<style lang="scss" scoped>
/* 样式保持不变... */
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

.solver-sidebar { display: flex; flex-direction: column; height: 100%; background-color: var(--bg-card); }
.solver-header { height: 48px; flex-shrink: 0; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.header-left { display: flex; align-items: center; gap: 8px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: var(--border-light); transition: all 0.3s; &.active { background-color: #10B981; animation: pulse 2s infinite; } }
.close-btn { color: var(--text-tertiary); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; &:hover { background-color: var(--bg-hover); color: var(--text-secondary); } }
.solver-content { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }

/* 聊天视图样式 */
.chat-bubble-wrapper { display: flex; flex-direction: column; margin-bottom: 12px; }
.chat-bubble { font-size: 14px; line-height: 1.6; padding: 10px 14px; border-radius: 12px; max-width: 90%; position: relative; }
.chat-bubble.user { align-self: flex-end; background: var(--color-brand); color: white; }
.chat-bubble.ai { align-self: flex-start; background: var(--bg-hover); color: var(--text-primary); &:hover .bubble-actions { opacity: 1; } }
.bubble-actions { position: absolute; top: -10px; right: 0; display: flex; gap: 4px; background: var(--bg-card); padding: 4px; border-radius: 6px; box-shadow: var(--shadow-float); opacity: 0; transition: opacity 0.2s; }
.bubble-actions button { color: var(--text-tertiary); cursor: pointer; &:hover { color: var(--text-primary); } }
.icon-xs { width: 14px; height: 14px; }
.cursor { display: inline-block; animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* 上下文视图样式 */
.context-meta { font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px; }
.ref-card { background: var(--bg-app); border: 1px solid transparent; border-radius: var(--radius-sm); padding: 12px; cursor: pointer; transition: all 0.2s; text-decoration: none; display: block; &:hover { background: var(--bg-card); border-color: var(--color-brand-light); box-shadow: var(--shadow-card); transform: translateY(-1px); } }
.ref-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.ref-score { color: var(--color-brand); font-size: 11px; }
.ref-snippet { font-size: 12px; color: var(--text-secondary); line-height: 1.4; }
.loading-state, .empty-state { font-size: 13px; color: var(--text-tertiary); text-align: center; padding: 20px 0; }

/* 底部区域样式 */
.solver-footer { flex-shrink: 0; border-top: 1px solid var(--border-light); padding: 12px 16px; }
.solver-error-box { padding: 12px; background-color: var(--color-danger-bg); border: 1px solid var(--color-danger-border); color: var(--color-danger-text); font-size: 12px; line-height: 1.4; border-radius: var(--radius-sm); margin-bottom: 8px; }

/* 上下文开关样式 */
.context-toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 12px;
}
.toggle-label {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}
.toggle-checkbox {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  background-color: var(--bg-active);
  border-radius: 9px;
  transition: background-color 0.2s;
  margin-right: 8px;
}
.toggle-switch::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 2px;
  width: 14px;
  height: 14px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.2s;
}
.toggle-checkbox:checked + .toggle-switch {
  background-color: var(--color-brand);
}
.toggle-checkbox:checked + .toggle-switch::before {
  transform: translateX(14px);
}

/* 输入区样式 */
.chat-input-area { display: flex; align-items: flex-end; gap: 8px; background-color: var(--bg-hover); border-radius: var(--radius-md); padding: 8px; }
.chat-textarea { flex: 1; border: none; outline: none; background: transparent; font-size: 14px; resize: none; max-height: 150px; overflow-y: auto; line-height: 1.5; color: var(--text-primary); &::placeholder { color: var(--text-tertiary); } &:disabled { background-color: transparent; } }
.send-button { width: 32px; height: 32px; border-radius: 8px; background-color: var(--color-brand); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.2s; &:hover:not(:disabled) { background-color: var(--color-brand-hover); } &:disabled { background-color: var(--bg-active); cursor: not-allowed; } }
.icon-sm { width: 16px; height: 16px; }

.context-actions { display: flex; justify-content: center; align-items: center; }
.switch-to-chat-btn { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: var(--radius-md); background-color: var(--bg-hover); color: var(--text-primary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; width: 100%; justify-content: center; &:hover { background-color: var(--color-brand-light); color: var(--color-brand); } }
</style>