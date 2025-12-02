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
            <!--
              [核心修改] 移除了 "System" 主题选项按钮。
              UI 现在只提供 "Light" 和 "Dark" 两种明确的选择，
              与 store 中的新逻辑完全匹配。
            -->
          </div>
        </div>
      </div>
    </section>

    <!-- 4. AI 模型下载区域 (保持不变) -->
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

    <!-- 5. AI 服务状态面板 (保持不变) -->
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
  // [核心修改] 移除不再使用的 LaptopIcon 图标导入。
  FolderOpen as FolderOpenIcon, AlertCircle as AlertCircleIcon
} from 'lucide-vue-next';

const uiStore = useUIStore();
const noteStore = useNoteStore();

// --- 常规设置状态 ---
const settings = reactive({
  notesPath: '',
  deleteMode: 'trash'
});
const pathChanged = ref(false);

// --- 模型相关状态 (保持不变) ---
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
const modelsDir = ref('Loading path...');
const localModels = ref([]);
const downloadProgress = ref({});
const globalError = ref('');
const globalSuccess = ref('');
const modelStatuses = ref({ chat: 'Uninitialized', embedding: 'Uninitialized' });
let unsubscribeDownloadProgress = null;

const isDownloading = computed(() => (fileName) => fileName in downloadProgress.value);

// --- 核心方法: 设置管理 (保持不变) ---
async function loadSettings() {
  if (window.electronAPI) {
    const data = await window.electronAPI.getSettings();
    if (data) {
      settings.notesPath = data.notesPath || '';
      settings.deleteMode = data.deleteMode || 'trash';
    }
  }
}
async function updateSetting(key, value) {
  if (window.electronAPI) {
    await window.electronAPI.setSetting(key, value);
    if (key === 'notesPath') {
      pathChanged.value = true;
      setTimeout(() => { pathChanged.value = false; }, 5000);
      await noteStore.fetchNotes();
    }
  }
}
async function changeNotesDir() {
  if (window.electronAPI) {
    const newPath = await window.electronAPI.selectFolder();
    if (newPath) {
      settings.notesPath = newPath;
      await updateSetting('notesPath', newPath);
    }
  }
}
async function openInExplorer() {
  if (window.electronAPI && settings.notesPath) {
    await window.electronAPI.openPath(settings.notesPath);
  }
}

// --- 核心方法: 模型管理 (保持不变) ---
async function fetchLocalModels() {
  if (window.electronAPI) localModels.value = await window.electronAPI.listLocalModels();
}
async function fetchModelStatuses() {
  if (window.electronAPI) modelStatuses.value = await window.electronAPI.getModelsStatus();
}
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

// --- 辅助显示函数 (保持不变) ---
const formatStatusText = (s) => ({ 'Uninitialized': 'Initializing...', 'Loading': 'Loading...', 'Ready': 'Ready', 'Not Found': 'Not Found', 'Error': 'Error' }[s] || 'Unknown');
const statusClass = (s) => ({ 'Ready': 'status-success', 'Not Found': 'status-warning', 'Error': 'status-danger' }[s] || 'status-loading');
const statusIcon = (s) => ({ 'Ready': BrainCircuitIcon, 'Not Found': AlertTriangleIcon, 'Error': XCircleIcon }[s] || LoaderCircleIcon);

// --- 生命周期 (保持不变) ---
onMounted(async () => {
  await loadSettings();
  if (window.electronAPI) {
    modelsDir.value = await window.electronAPI.getModelsDir();
    await fetchLocalModels();
    await fetchModelStatuses();
    unsubscribeDownloadProgress = window.electronAPI.onModelDownloadProgress((data) => {
      downloadProgress.value[data.fileName] = data.progress;
    });
  }
});
onUnmounted(() => {
  if (unsubscribeDownloadProgress) unsubscribeDownloadProgress();
});
</script>

<style lang="scss" scoped>
/* 样式无需修改，保持原样 */
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
.setting-item {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 20px 0; border-bottom: 1px solid var(--border-light);
  &:first-of-type { padding-top: 0; }
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
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-radius: 6px; background: var(--bg-hover); color: var(--text-primary);
  font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
  &:hover { background: var(--border-light); }
  &.secondary { font-size: 12px; padding: 4px 10px; background: transparent; border: 1px solid var(--border-light); }
}
.warning-text { font-size: 12px; color: var(--color-warning-text); display: flex; align-items: center; gap: 4px; margin-top: 4px; }
.icon-xs { width: 14px; height: 14px; }
.radio-group { display: flex; flex-direction: column; gap: 8px; }
.radio-label {
  display: flex; align-items: center; gap: 8px; font-size: 13px;
  color: var(--text-primary); cursor: pointer;
  input[type="radio"] { accent-color: var(--color-brand); }
}
.theme-selector { display: flex; background: var(--bg-hover); padding: 4px; border-radius: 8px; gap: 4px; }
.theme-option { padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; display: flex; gap: 6px; color: var(--text-secondary); &.active { background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-card); } }
.model-list { display: grid; gap: 16px; }
.model-card { background: var(--bg-card); border: 1px solid var(--border-light); padding: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
.status-panel { background: var(--bg-card); border: 1px solid var(--border-light); padding: 8px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
.status-item { display: flex; justify-content: space-between; padding: 12px 16px; background: var(--bg-app); border-radius: 4px; align-items: center; }
.status-indicator { display: flex; gap: 8px; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; &.status-success { background: var(--color-success-bg); color: var(--color-success-text); } }
.error-box { background: var(--color-danger-bg); color: var(--color-danger-text); padding: 12px; border-radius: 4px; margin-top: 16px; }
.success-box { background: var(--color-success-bg); color: var(--color-success-text); padding: 12px; border-radius: 4px; margin-top: 16px; }
</style>