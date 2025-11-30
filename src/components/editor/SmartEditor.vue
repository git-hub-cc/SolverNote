<template>
  <!-- 智能编辑器根容器 -->
  <div
      class="smart-editor"
      :class="{
      'is-focused': isFocused || isTagInputFocused, // 聚焦时添加高亮样式
      'is-edit-mode': isEditMode                     // 编辑模式下添加特定样式
    }"
  >
    <!-- 1. 顶部 Tab 切换区 -->
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

      <!-- 编辑模式下的提示与取消按钮 -->
      <div v-if="isEditMode" class="edit-mode-indicator">
        <span>Editing Note</span>
        <button class="cancel-link" @click="handleCancel">Cancel</button>
      </div>
    </div>

    <!-- 2. 核心内容区域 -->
    <div class="editor-body">

      <!-- Write 模式: 纯文本源码输入框 -->
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

      <!-- Preview 模式: Markdown 渲染结果 -->
      <div
          v-show="activeTab === 'preview'"
          class="preview-container markdown-body"
          v-html="previewHtml"
      ></div>

      <!-- 标签输入区域 (根据 shouldShowTags 动态显示) -->
      <div class="tags-input-area" v-if="shouldShowTags">
        <div v-for="(tag, index) in localTags" :key="index" class="tag-chip">
          #{{ tag }}
          <span class="remove-tag" @click="removeTag(index)">×</span>
        </div>

        <!-- 仅在 Write 模式下允许添加标签 -->
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

    <!-- 3. 底部操作栏 -->
    <div class="editor-footer">
      <!-- 左侧工具栏：仅在 Write 模式显示 -->
      <div class="actions-left">
        <template v-if="activeTab === 'write'">
          <!-- 基础工具 -->
          <button class="icon-btn" @click="focusTagInput" title="Add Tag">
            <HashIcon class="icon-sm" />
          </button>
          <span class="divider"></span>

          <!-- Markdown 快捷插入按钮 -->
          <button class="icon-btn" @click="insertMarkdown('**', '**')" title="Bold">
            <BoldIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('*', '*')" title="Italic">
            <ItalicIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('~~', '~~')" title="Strikethrough">
            <StrikethroughIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('`', '`')" title="Inline Code">
            <CodeIcon class="icon-sm" />
          </button>
          <span class="divider"></span>
          <button class="icon-btn" @click="insertMarkdown('## ', '', true)" title="Heading 2">
            <Heading2Icon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('> ', '', true)" title="Quote">
            <QuoteIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('- ', '', true)" title="Bullet List">
            <ListIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('- [ ] ', '', true)" title="Task List">
            <ListChecksIcon class="icon-sm" />
          </button>
          <button class="icon-btn" @click="insertMarkdown('[', '](url)')" title="Link">
            <LinkIcon class="icon-sm" />
          </button>
        </template>

        <!-- 预览模式下的提示文本 -->
        <span v-else class="preview-hint">
          Preview Mode (Read-only)
        </span>
      </div>

      <!-- 右侧发送/更新按钮 -->
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
  Italic as ItalicIcon,
  Strikethrough as StrikethroughIcon,
  Code as CodeIcon,
  List as ListIcon,
  ListChecks as ListChecksIcon,
  Heading2 as Heading2Icon,
  Link as LinkIcon,
  Quote as QuoteIcon,
  Hash as HashIcon,
  Send as SendIcon,
  Save as SaveIcon,
} from 'lucide-vue-next'

import { renderMarkdown } from '@/utils/markdownRenderer'
import { insertSyntax, autoResizeTextarea } from '@/utils/markdownInputHelper'

// --- Props 和 Emits 定义 ---
const props = defineProps({
  isSending: Boolean,
  initialContent: { type: String, default: '' },
  initialTags: { type: Array, default: () => [] },
  isEditMode: { type: Boolean, default: false }
})
const emit = defineEmits(['save', 'cancel'])

// --- 响应式状态定义 ---
const activeTab = ref('write')
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
  return localTags.value.length > 0 || isTagInputFocused.value
})

// --- 辅助函数 ---
const resizeTextarea = () => {
  nextTick(() => {
    if (textareaRef.value) {
      autoResizeTextarea(textareaRef.value, '120px')
    }
  })
}

const switchTab = (tab) => {
  activeTab.value = tab
  if (tab === 'write') {
    resizeTextarea()
    nextTick(() => textareaRef.value?.focus())
  }
}

const insertMarkdown = (prefix, suffix, multiline = false) => {
  if (!textareaRef.value) return

  const result = insertSyntax(textareaRef.value, prefix, suffix, multiline)
  if (result) {
    localContent.value = result.text
    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.focus()
        textareaRef.value.setSelectionRange(result.newCursorStart, result.newCursorEnd)
        resizeTextarea()
      }
    })
  }
}

// --- Watchers ---
watch(() => props.initialContent, (newVal) => {
  localContent.value = newVal || ''
  resizeTextarea()
}, { immediate: true })

watch(() => props.initialTags, (newTags) => {
  localTags.value = [...newTags]
}, { immediate: true })

const handleInput = () => {
  resizeTextarea()
}

// --- 事件处理器 ---
const handleFocus = () => isFocused.value = true
const handleBlur = () => {
  setTimeout(() => { isFocused.value = false }, 200)
}

const handleKeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    handleSave()
  }
  if (e.key === 'Escape' && props.isEditMode) {
    handleCancel()
  }
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

// --- 标签相关逻辑 ---
const focusTagInput = () => {
  if (activeTab.value !== 'write') {
    switchTab('write')
  }
  isTagInputFocused.value = true
  nextTick(() => tagInputRef.value?.focus())
}

const handleTagInputBlur = () => {
  if (tagInput.value.trim()) {
    addTag()
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

// --- 生命周期钩子 ---
onMounted(() => {
  resizeTextarea()
})

// --- 暴露给父组件的公共方法 ---
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
</script>

<style lang="scss" scoped>
/*
 * [新增] 为编辑模式定义一个专用的背景色变量
 * 这样就可以在 _variables.scss 中为亮色和深色模式分别定义
 */
:root {
  --bg-edit-mode: #FAFAFF;
}
html.dark {
  --bg-edit-mode: rgba(99, 102, 241, 0.05); /* 深色模式下使用带透明度的品牌色 */
}

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

  // 聚焦状态
  &.is-focused {
    border-color: var(--border-hover);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }

  // 编辑模式状态
  &.is-edit-mode {
    border-color: var(--color-brand);
    /* [核心修改] 使用 CSS 变量替换硬编码颜色 */
    background-color: var(--bg-edit-mode);

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
  flex-shrink: 0;
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
  min-height: 0;
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
  flex-shrink: 0;

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