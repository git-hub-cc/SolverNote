<template>
  <div class="settings-view">
    <!-- 1. 页面主标题 -->
    <div class="view-header">
      <h2>Settings</h2>
      <span class="sub-header">Manage application preferences and AI models.</span>
    </div>

    <!-- 2. 常规设置 (General) -->
    <section class="settings-section">
      <h3 class="section-title">General</h3>
      <!-- 笔记目录设置 -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-title">Notes Directory</span>
          <span class="label-desc">Location where your markdown files are stored.</span>
        </div>
        <div class="setting-control vertical">
          <div class="path-display-group">
            <input type="text" readonly :value="settings.notesPath" class="path-input" />
            <button class="action-btn" @click="openInExplorer" title="Open in Explorer">
              <FolderOpenIcon class="icon-sm" />
            </button>
          </div>
          <button class="action-btn secondary" @click="changeNotesDir">
            Change Location...
          </button>
          <p class="warning-text" v-if="pathChanged">
            <AlertCircleIcon class="icon-xs" />
            Note: Changing directory will trigger a full re-index.
          </p>
        </div>
      </div>
      <!-- 删除模式设置 -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-title">Deletion Behavior</span>
          <span class="label-desc">How files should be handled when deleted.</span>
        </div>
        <div class="setting-control">
          <div class="radio-group">
            <label class="radio-label">
              <input
                  type="radio"
                  value="trash"
                  v-model="settings.deleteMode"
                  @change="updateSetting('deleteMode', 'trash')"
              />
              Move to Trash (Recommended)
            </label>
            <label class="radio-label">
              <input
                  type="radio"
                  value="permanent"
                  v-model="settings.deleteMode"
                  @change="updateSetting('deleteMode', 'permanent')"
              />
              Permanently Delete
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. 外观设置 -->
    <section class="settings-section">
      <h3 class="section-title">Appearance</h3>
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-title">Theme</span>
          <span class="label-desc">Choose the application color theme.</span>
        </div>
        <div class="setting-control">
          <div class="theme-selector">
            <button
                class="theme-option"
                :class="{ active: uiStore.themePreference === 'light' }"
                @click="uiStore.setThemePreference('light')"
            >
              <SunIcon class="icon-sm"/> Light
            </button>
            <button
                class="theme-option"
                :class="{ active: uiStore.themePreference === 'dark' }"
                @click="uiStore.setThemePreference('dark')"
            >
              <MoonIcon class="icon-sm"/> Dark
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. AI 模型下载区域 -->
    <section class="settings-section">
      <h3 class="section-title">AI Models</h3>
      <p class="section-description">
        The application requires the following models to function fully.
        <br>
        <span class="path-info">Models path: {{ modelsDir }}</span>
      </p>
      <div class="model-list">
        <div v-for="model in recommendedModels" :key="model.fileName" class="model-card download-card">
          <div class="model-info">
            <span class="model-name">{{ model.name }}</span>
            <span class="model-meta">{{ model.size }} | {{ model.type }}</span>
            <p class="model-desc">{{ model.description }}</p>
          </div>
          <button
              class="action-btn"
              @click="downloadModel(model)"
              :disabled="isDownloading(model.fileName) || localModels.includes(model.fileName)">
            <DownloadCloudIcon class="icon-sm" v-if="!isDownloading(model.fileName) && !localModels.includes(model.fileName)" />
            <CheckCircle2Icon class="icon-sm success-icon" v-if="localModels.includes(model.fileName)" />
            <span v-if="isDownloading(model.fileName)">{{ downloadProgress[model.fileName] || 0 }}%</span>
            <span v-else>{{ localModels.includes(model.fileName) ? 'Downloaded' : 'Download' }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 5. AI 服务状态面板 -->
    <section class="settings-section">
      <h3 class="section-title">AI Service Status</h3>
      <div class="status-panel">
        <div class="status-item">
          <div class="status-info">
            <span class="status-name">Chat Model (LLM)</span>
            <span class="status-model-name">qwen1_5-0_5b-chat-q4_k_m.gguf</span>
          </div>
          <div class="status-indicator" :class="statusClass(modelStatuses.chat)">
            <component :is="statusIcon(modelStatuses.chat)" class="icon-sm" />
            <span>{{ formatStatusText(modelStatuses.chat) }}</span>
          </div>
        </div>
        <div class="status-item">
          <div class="status-info">
            <span class="status-name">Embedding & Search Model</span>
            <span class="status-model-name">bge-small-en-v1.5.Q8_0.gguf</span>
          </div>
          <div class="status-indicator" :class="statusClass(modelStatuses.embedding)">
            <component :is="statusIcon(modelStatuses.embedding)" class="icon-sm" />
            <span>{{ formatStatusText(modelStatuses.embedding) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 全局提示框 -->
    <section class="settings-section">
      <div v-if="globalError" class="error-box">{{ globalError }}</div>
      <div v-if="globalSuccess" class="success-box">{{ globalSuccess }}</div>
    </section>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, reactive } from 'vue';
import { useUIStore } from '@/stores/uiStore';
import { useNoteStore } from '@/stores/noteStore';
import {
  DownloadCloudIcon, CheckCircle2Icon, LoaderCircleIcon, AlertTriangleIcon, XCircleIcon,
  BrainCircuitIcon, Sun as SunIcon, Moon as MoonIcon,
  FolderOpen as FolderOpenIcon, AlertCircle as AlertCircleIcon
} from 'lucide-vue-next';

// --- 状态管理 ---
const uiStore = useUIStore();
const noteStore = useNoteStore();

// --- 通用设置状态 ---
const settings = reactive({
  notesPath: '',
  deleteMode: 'trash'
});
const pathChanged = ref(false); // 用于显示路径变更后的提示信息

// --- AI模型相关状态 ---
const recommendedModels = [
  {
    name: 'Qwen1.5-0.5B-Chat',
    fileName: 'qwen1_5-0_5b-chat-q4_k_m.gguf',
    url: 'https://modelscope.cn/api/v1/models/qwen/Qwen1.5-0.5B-Chat-GGUF/repo?Revision=master&FilePath=qwen1_5-0_5b-chat-q4_k_m.gguf',
    size: '~380MB', type: 'Chat Model', description: 'A small, fast, and capable chat model from Alibaba Cloud.'
  },
  {
    name: 'BGE-Small-English-v1.5',
    fileName: 'bge-small-en-v1.5.Q8_0.gguf',
    url: 'https://modelscope.cn/api/v1/models/ggml-org/bge-small-en-v1.5-Q8_0-GGUF/repo?Revision=master&FilePath=bge-small-en-v1.5-q8_0.gguf',
    size: '~290MB', type: 'Embedding Model', description: 'High performance English embedding model.'
  },
];
const modelsDir = ref('Loading path...'); // 模型存储目录
const localModels = ref([]); // 本地已存在的模型列表
const downloadProgress = ref({}); // 下载进度
const globalError = ref(''); // 全局错误信息
const globalSuccess = ref(''); // 全局成功信息
const modelStatuses = ref({ chat: 'Uninitialized', embedding: 'Uninitialized' }); // AI模型加载状态
let unsubscribeDownloadProgress = null; // 用于取消下载进度监听

// --- 计算属性 ---
const isDownloading = computed(() => (fileName) => fileName in downloadProgress.value);

// --- 核心方法: 设置管理 ---

/**
 * @description 从主进程加载并应用设置
 */
async function loadSettings() {
  if (window.electronAPI) {
    const data = await window.electronAPI.getSettings();
    if (data) {
      settings.notesPath = data.notesPath || '';
      settings.deleteMode = data.deleteMode || 'trash';
    }
  }
}

/**
 * @description 更新单项设置，并通知主进程
 * @param {string} key - 设置项的键
 * @param {string | boolean} value - 设置项的值
 */
async function updateSetting(key, value) {
  if (window.electronAPI) {
    await window.electronAPI.setSetting(key, value);

    // [核心修复] 如果是笔记路径发生了变更
    if (key === 'notesPath') {
      pathChanged.value = true;
      setTimeout(() => { pathChanged.value = false; }, 5000);
      // 重新加载笔记列表
      await noteStore.fetchNotes();
      // [新增] 重新加载文件树，以同步左侧导航栏的视图
      await noteStore.fetchFileTree();
    }
  }
}

/**
 * @description 打开系统对话框以选择新的笔记目录
 */
async function changeNotesDir() {
  if (window.electronAPI) {
    const newPath = await window.electronAPI.selectFolder();
    if (newPath) {
      settings.notesPath = newPath;
      await updateSetting('notesPath', newPath);
    }
  }
}

/**
 * @description 在系统文件管理器中打开笔记目录
 */
async function openInExplorer() {
  if (window.electronAPI && settings.notesPath) {
    await window.electronAPI.openPath(settings.notesPath);
  }
}

// --- 核心方法: 模型管理 ---

/**
 * @description 获取本地已下载的模型列表
 */
async function fetchLocalModels() {
  if (window.electronAPI) localModels.value = await window.electronAPI.listLocalModels();
}

/**
 * @description 获取 AI 模型服务的当前状态
 */
async function fetchModelStatuses() {
  if (window.electronAPI) modelStatuses.value = await window.electronAPI.getModelsStatus();
}

/**
 * @description 触发模型下载
 * @param {object} model - 包含模型信息（URL, 文件名等）的对象
 */
async function downloadModel(model) {
  if (!window.electronAPI) return;
  globalError.value = ''; globalSuccess.value = '';
  downloadProgress.value[model.fileName] = 0;
  try {
    await window.electronAPI.downloadModel(model.url, model.fileName);
    await fetchLocalModels();
    globalSuccess.value = `${model.fileName} downloaded! Restart app required.`;
  } catch (error) {
    globalError.value = `Failed: ${error.message}`;
  } finally {
    delete downloadProgress.value[model.fileName];
    setTimeout(() => { globalSuccess.value = ''; globalError.value = ''; }, 8000);
  }
}

// --- 辅助显示函数 ---
const formatStatusText = (s) => ({ 'Uninitialized': 'Initializing...', 'Loading': 'Loading...', 'Ready': 'Ready', 'Not Found': 'Not Found', 'Error': 'Error' }[s] || 'Unknown');
const statusClass = (s) => ({ 'Ready': 'status-success', 'Not Found': 'status-warning', 'Error': 'status-danger' }[s] || 'status-loading');
const statusIcon = (s) => ({ 'Ready': BrainCircuitIcon, 'Not Found': AlertTriangleIcon, 'Error': XCircleIcon }[s] || LoaderCircleIcon);

// --- 生命周期钩子 ---
onMounted(async () => {
  await loadSettings();
  if (window.electronAPI) {
    modelsDir.value = await window.electronAPI.getModelsDir();
    await fetchLocalModels();
    await fetchModelStatuses();
    // 监听模型下载进度
    unsubscribeDownloadProgress = window.electronAPI.onModelDownloadProgress((data) => {
      downloadProgress.value[data.fileName] = data.progress;
    });
  }
});

onUnmounted(() => {
  // 组件卸载时，清理监听器
  if (unsubscribeDownloadProgress) unsubscribeDownloadProgress();
});
</script>

<style lang="scss" scoped>
:root {
  --color-success-bg: #F0FDF4; --color-success-border: #86EFAC; --color-success-text: #15803D; --color-success-icon: #10B981;
  --color-danger-bg: #FEF2F2; --color-danger-border: #FCA5A5; --color-danger-text: #B91C1C;
  --color-warning-bg: #FFFBEB; --color-warning-border: #FDE68A; --color-warning-text: #B45309;
}
html.dark {
  --color-success-bg: #052E16; --color-success-border: #15803D; --color-success-text: #6EE7B7; --color-success-icon: #34D399;
  --color-danger-bg: #450A0A; --color-danger-border: #7F1D1D; --color-danger-text: #F87171;
  --color-warning-bg: #422006; --color-warning-border: #92400E; --color-warning-text: #FBBF24;
}
.settings-view { padding: 40px 10%; height: 100%; overflow-y: auto; }
.view-header { margin-bottom: 32px; border-bottom: 1px solid var(--border-light); padding-bottom: 16px; h2 { font-size: 24px; font-weight: 700; } .sub-header { color: var(--text-secondary); font-size: 14px; } }
.settings-section { margin-bottom: 48px; }
.section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
.section-description { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5; .path-info { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 12px; } }
.setting-item {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 20px 0; border-bottom: 1px solid var(--border-light);
  &:first-of-type { padding-top: 0; }
  &:last-of-type { border-bottom: none; }
}
.setting-label {
  max-width: 40%;
  .label-title { font-weight: 500; color: var(--text-primary); display: block; margin-bottom: 4px; }
  .label-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.4; }
}
.setting-control {
  &.vertical { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; width: 50%; }
}
.path-display-group {
  display: flex; width: 100%; gap: 8px;
  .path-input {
    flex: 1; padding: 6px 10px; font-size: 13px; font-family: var(--font-mono);
    border: 1px solid var(--border-light); border-radius: 4px;
    background: var(--bg-hover); color: var(--text-secondary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
}
.action-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 12px;
  border-radius: 6px; background: var(--bg-hover); color: var(--text-primary);
  font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; white-space: nowrap;
  &:hover { background: var(--border-light); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  &.secondary { font-size: 12px; padding: 4px 10px; background: transparent; border: 1px solid var(--border-light); }
  .success-icon { color: var(--color-success-icon); }
}
.warning-text { font-size: 12px; color: var(--color-warning-text); display: flex; align-items: center; gap: 4px; margin-top: 4px; }
.icon-xs { width: 14px; height: 14px; }
.icon-sm { width: 16px; height: 16px; }
.radio-group { display: flex; flex-direction: column; gap: 8px; }
.radio-label {
  display: flex; align-items: center; gap: 8px; font-size: 13px;
  color: var(--text-primary); cursor: pointer;
  input[type="radio"] { accent-color: var(--color-brand); }
}
.theme-selector { display: flex; background: var(--bg-hover); padding: 4px; border-radius: 8px; gap: 4px; }
.theme-option { padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: var(--text-secondary); transition: all 0.2s; &.active { background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-card); } }
.model-list { display: grid; gap: 16px; }
.model-card { background: var(--bg-card); border: 1px solid var(--border-light); padding: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.model-info { flex: 1; min-width: 200px; }
.model-name { font-weight: 600; display: block; }
.model-meta { font-size: 12px; color: var(--text-tertiary); display: block; margin: 2px 0 8px; }
.model-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.4; }
.status-panel { background: var(--bg-card); border: 1px solid var(--border-light); padding: 8px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
.status-item { display: flex; justify-content: space-between; padding: 12px 16px; background: var(--bg-app); border-radius: 4px; align-items: center; }
.status-info { display: flex; flex-direction: column; }
.status-name { font-weight: 500; }
.status-model-name { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.status-indicator { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500;
  &.status-success { background: var(--color-success-bg); color: var(--color-success-text); }
  &.status-danger { background: var(--color-danger-bg); color: var(--color-danger-text); }
  &.status-warning { background: var(--color-warning-bg); color: var(--color-warning-text); }
  &.status-loading { color: var(--text-secondary); }
}
.error-box { background: var(--color-danger-bg); border: 1px solid var(--color-danger-border); color: var(--color-danger-text); padding: 12px; border-radius: 4px; margin-top: 16px; font-size: 13px; }
.success-box { background: var(--color-success-bg); border: 1px solid var(--color-success-border); color: var(--color-success-text); padding: 12px; border-radius: 4px; margin-top: 16px; font-size: 13px; }
</style>