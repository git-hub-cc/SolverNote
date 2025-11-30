<template>
  <div
      class="smart-editor"
      :class="{
      'is-focused': isFocused || isTagInputFocused,
      'is-edit-mode': isEditMode
    }"
  >
    <!--
      1. 顶部 Tab 切换区
      用于在源码编辑和预览渲染之间切换
    -->
    <div class="editor-header">
      <div class="tabs">
        <button
            class="tab-btn"
            :class="{ active: activeTab === 'write' }"
            @click="switchTab('write')"
        >
          Write
        </button>
        <button
            class="tab-btn"
            :class="{ active: activeTab === 'preview' }"
            @click="switchTab('preview')"
        >
          Preview
        </button>
      </div>

      <!-- 编辑模式下的取消按钮 -->
      <div v-if="isEditMode" class="edit-mode-indicator">
        <span>Editing Note</span>
        <button class="cancel-link" @click="handleCancel">Cancel</button>
      </div>
    </div>

    <!--
      2. 核心内容区域
      包含 Textarea (Write模式) 和 HTML容器 (Preview模式)
    -->
    <div class="editor-body">

      <!-- Write Mode: 纯文本源码输入 -->
      <textarea
          v-show="activeTab === 'write'"
          ref="textareaRef"
          v-model="localContent"
          class="source-textarea"
          placeholder="What's on your mind? (Markdown supported)"
          @focus="handleFocus"
          @blur="handleBlur"
          @input="handleInput"
          @keydown="handleKeydown"
      ></textarea>

      <!-- Preview Mode: Markdown 渲染结果 -->
      <div
          v-show="activeTab === 'preview'"
          class="preview-container markdown-body"
          v-html="previewHtml"
      ></div>

      <!-- 标签输入区域 (保持原有逻辑) -->
      <div class="tags-input-area" v-if="shouldShowTags">
        <div v-for="(tag, index) in localTags" :key="index" class="tag-chip">
          #{{ tag }}
          <span class="remove-tag" @click="removeTag(index)">×</span>
        </div>

        <!-- 仅在 Write 模式下允许添加标签，预览模式下隐藏输入框但保留已有标签展示 -->
        <input
            v-if="activeTab === 'write'"
            ref="tagInputRef"
            type="text"
            v-model="tagInput"
            @focus="isTagInputFocused = true"
            @blur="handleTagInputBlur"
            @keydown.enter.prevent="addTag"
            @keydown.backspace="handleBackspace"
            placeholder="Add tag (Enter to add)..."
            class="tag-input"
        />
      </div>
    </div>

    <!--
      3. 底部操作栏
    -->
    <div class="editor-footer">
      <!-- 左侧工具栏：仅在 Write 模式显示 -->
      <div class="actions-left">
        <template v-if="activeTab === 'write'">
          <button class="icon-btn" @click="focusTagInput" title="Add Tag (Only in Write mode)">
            <HashIcon class="icon-sm" />
          </button>

          <span class="divider"></span>

          <!-- Markdown 快捷插入按钮 -->
          <button class="icon-btn" @click="insertMarkdown('**', '**')" title="Bold">
            <BoldIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('`', '`')" title="Inline Code">
            <CodeIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('- ', '', true)" title="Bullet List">
            <ListIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('> ', '', true)" title="Quote">
            <QuoteIcon class="icon-sm" />
          </button>
        </template>

        <span v-else class="preview-hint">
          Preview Mode (Read-only)
        </span>
      </div>

      <!-- 右侧发送按钮 -->
      <div class="actions-right">
        <button
            class="send-btn"
            :class="{ 'update-btn': isEditMode }"
            @click="handleSave"
            :disabled="isEmpty || isSending"
        >
          <SaveIcon v-if="isEditMode" class="icon-sm" />
          <SendIcon v-else class="icon-sm" />
          <span class="btn-text">{{ isEditMode ? 'Update' : 'Post' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import {
  Bold as BoldIcon,
  Code as CodeIcon,
  List as ListIcon,
  Send as SendIcon,
  Save as SaveIcon,
  Hash as HashIcon,
  Quote as QuoteIcon
} from 'lucide-vue-next'

// 引入工具函数
import { renderMarkdown } from '@/utils/markdownRenderer'
import { insertSyntax, autoResizeTextarea } from '@/utils/markdownInputHelper'

const props = defineProps({
  isSending: Boolean,
  initialContent: { type: String, default: '' },
  initialTags: { type: Array, default: () => [] },
  isEditMode: { type: Boolean, default: false }
})

const emit = defineEmits(['save', 'cancel'])

// --- 状态定义 ---
const activeTab = ref('write') // 'write' | 'preview'
const localContent = ref('')
const localTags = ref([])
const textareaRef = ref(null)

const isFocused = ref(false)
const isTagInputFocused = ref(false)
const tagInput = ref('')
const tagInputRef = ref(null)

// --- 计算属性 ---

const previewHtml = computed(() => {
  if (!localContent.value) return '<span class="empty-preview">Nothing to preview</span>'
  return renderMarkdown(localContent.value)
})

const isEmpty = computed(() => !localContent.value.trim())

const shouldShowTags = computed(() => {
  return localTags.value.length > 0 || isFocused.value || isTagInputFocused.value
})

// --- ⚠️ 关键修正：函数定义必须在 Watch 调用之前 ---

// 自动高度工具封装
const resizeTextarea = () => {
  nextTick(() => {
    // 增加防护，防止 DOM 未挂载时调用报错
    if (textareaRef.value) {
      autoResizeTextarea(textareaRef.value, '120px')
    }
  })
}

// 切换 Tab
const switchTab = (tab) => {
  activeTab.value = tab
  if (tab === 'write') {
    resizeTextarea()
    nextTick(() => textareaRef.value?.focus())
  }
}

// 插入 Markdown 语法
const insertMarkdown = (prefix, suffix, multiline = false) => {
  if (!textareaRef.value) return

  const result = insertSyntax(textareaRef.value, prefix, suffix, multiline)

  if (result) {
    localContent.value = result.text
    nextTick(() => {
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(result.newCursorStart, result.newCursorEnd)
      resizeTextarea() // 插入内容后重新计算高度
    })
  }
}

// --- Watchers (必须放在函数定义之后) ---

// 初始化与 Props 监听
watch(() => props.initialContent, (newVal) => {
  localContent.value = newVal || ''
  // 此时 resizeTextarea 已定义，可以安全调用
  resizeTextarea()
}, { immediate: true })

watch(() => props.initialTags, (newTags) => {
  localTags.value = [...newTags]
}, { immediate: true })

// 监听内容变化自动调整高度
const handleInput = () => {
  resizeTextarea()
}

// --- 事件处理 ---

const handleFocus = () => isFocused.value = true
const handleBlur = () => {
  setTimeout(() => { isFocused.value = false }, 200)
}

const handleKeydown = (e) => {
  // Ctrl/Cmd + Enter 发送
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    handleSave()
  }
  // Escape 取消
  if (e.key === 'Escape' && props.isEditMode) {
    handleCancel()
  }
  // Tab 键缩进
  if (e.key === 'Tab') {
    e.preventDefault()
    insertMarkdown('  ', '')
  }
}

const handleSave = () => {
  if (isEmpty.value) return
  emit('save', {
    content: localContent.value,
    tags: localTags.value
  })
}

const handleCancel = () => {
  emit('cancel')
}

// --- 标签逻辑 ---

const focusTagInput = () => {
  if (activeTab.value !== 'write') {
    switchTab('write')
  }
  isTagInputFocused.value = true
  nextTick(() => tagInputRef.value?.focus())
}

const handleTagInputBlur = () => {
  // 关键修改：当输入框失焦时，如果里面有内容，则自动添加为标签
  if (tagInput.value.trim()) {
    addTag();
  }
  setTimeout(() => { isTagInputFocused.value = false }, 200)
}

const addTag = () => {
  const val = tagInput.value.trim()
  if (val && !localTags.value.includes(val)) {
    localTags.value.push(val)
  }
  tagInput.value = ''
}

const removeTag = (index) => {
  localTags.value.splice(index, 1)
}

const handleBackspace = () => {
  if (tagInput.value === '' && localTags.value.length > 0) {
    localTags.value.pop()
  }
}

// --- 外部接口 ---
const clearEditor = () => {
  localContent.value = ''
  localTags.value = []
  tagInput.value = ''
  activeTab.value = 'write'
  resizeTextarea()
}

defineExpose({
  clearEditor
})

onMounted(() => {
  resizeTextarea()
})
</script>

<style lang="scss" scoped>
.smart-editor {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;

  &.is-focused {
    border-color: var(--border-hover);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }

  &.is-edit-mode {
    border-color: var(--color-brand);
    background: #FAFAFF;

    .editor-header {
      border-bottom-color: rgba(99, 102, 241, 0.1);
    }
  }
}

/* --- Header & Tabs --- */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border-light);
}

.tabs {
  display: flex;
  gap: 4px;
  background: var(--border-light);
  padding: 3px;
  border-radius: 6px;
}

.tab-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--text-primary);
  }

  &.active {
    background: var(--bg-card);
    color: var(--color-brand);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
}

.edit-mode-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-brand);

  .cancel-link {
    cursor: pointer;
    color: var(--text-tertiary);
    text-decoration: underline;
    &:hover { color: var(--text-secondary); }
  }
}

/* --- Body --- */
.editor-body {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.source-textarea {
  width: 100%;
  height: 120px;
  min-height: 120px;
  max-height: 500px;
  resize: none;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.6;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
    font-family: var(--font-family);
  }
}

.preview-container {
  min-height: 120px;
  max-height: 500px;
  overflow-y: auto;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.6;

  :deep(.empty-preview) {
    color: var(--text-tertiary);
    font-style: italic;
    font-size: 14px;
  }
}

/* --- Tags Area --- */
.tags-input-area {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px dashed var(--border-light);
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.tag-chip {
  display: flex;
  align-items: center;
  font-size: 12px;
  background: var(--color-brand-light);
  color: var(--color-brand);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  user-select: none;

  .remove-tag {
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.5;
    &:hover { opacity: 1; }
  }
}

.tag-input {
  flex: 1;
  min-width: 80px;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
  padding: 2px 0;
  &::placeholder { color: var(--text-tertiary); }
}

/* --- Footer --- */
.editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px 16px 16px;
  border-top: 1px solid transparent;

  .is-focused & {
    border-top-color: var(--bg-hover);
  }
}

.actions-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preview-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--border-light);
  margin: 0 6px;
}

.icon-btn {
  padding: 6px;
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }
}

.send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--border-light);
    color: var(--text-primary);
  }

  &.update-btn {
    background: var(--color-brand);
    color: white;
    &:hover { background: var(--color-brand-hover); }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.icon-sm {
  width: 16px;
  height: 16px;
}
</style>