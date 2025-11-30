<template>
  <div class="settings-view">
    <div class="view-header">
      <h2>AI Settings</h2>
      <span class="sub-header">Manage and configure your local AI models.</span>
    </div>

    <!-- 推荐模型下载 -->
    <section class="settings-section">
      <h3 class="section-title">Recommended Models (from ModelScope)</h3>
      <p class="section-description">
        Click to download recommended models. They will be saved to your local data directory.
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
            <CheckCircle2Icon class="icon-sm success" v-if="localModels.includes(model.fileName)" />
            <span v-if="isDownloading(model.fileName)">{{ downloadProgress[model.fileName] || 0 }}%</span>
            <span v-else>{{ localModels.includes(model.fileName) ? 'Downloaded' : 'Download' }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 本地模型配置 -->
    <section class="settings-section">
      <h3 class="section-title">Local Models Configuration</h3>
      <p class="section-description">
        Select the models to use for chat and semantic search from your downloaded files.
      </p>

      <!-- 聊天模型选择 -->
      <div class="config-item">
        <label for="chat-model-select">Chat Model (LLM)</label>
        <div class="select-wrapper">
          <select id="chat-model-select" v-model="selectedChatModel">
            <option disabled value="">-- Select a Chat Model --</option>
            <option v-for="modelFile in localModels" :key="modelFile" :value="modelFile">
              {{ modelFile }}
            </option>
          </select>
        </div>
        <button class="action-btn primary" @click="loadChatModel" :disabled="!selectedChatModel || loadingStates.chat">
          <LoaderCircleIcon class="icon-sm spin" v-if="loadingStates.chat" />
          <BrainCircuitIcon class="icon-sm" v-else />
          <span>{{ chatModelStatus }}</span>
        </button>
      </div>

      <!-- 嵌入模型提示 (当前为硬编码) -->
      <div class="config-item">
        <label>Embedding Model</label>
        <div class="info-box">
          <span>Currently uses <strong>bge-small-zh-v1.5-q4_k_m.gguf</strong>. Ensure this model is downloaded for semantic search to work.</span>
        </div>
      </div>

      <!-- 全局错误/状态提示 -->
      <div v-if="globalError" class="error-box">
        {{ globalError }}
      </div>
      <div v-if="globalSuccess" class="success-box">
        {{ globalSuccess }}
      </div>

    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { DownloadCloudIcon, CheckCircle2Icon, BrainCircuitIcon, LoaderCircleIcon } from 'lucide-vue-next';

// --- 推荐模型列表 (数据源已切换至 ModelScope) ---
const recommendedModels = [
  {
    name: 'Qwen1.5-0.5B-Chat',
    fileName: 'qwen1_5-0_5b-chat-q4_k_m.gguf',
    // [修改] URL 已指向 ModelScope
    url: 'https://modelscope.cn/api/v1/models/qwen/Qwen1.5-0.5B-Chat-GGUF/repo?Revision=master&FilePath=qwen1_5-0_5b-chat-q4_k_m.gguf',
    size: '~380MB',
    type: 'Chat Model',
    description: 'A small, fast, and capable chat model from Alibaba Cloud. Good for general tasks.'
  },
  {
    name: 'BGE-Small-Chinese-v1.5',
    fileName: 'bge-small-zh-v1.5-q4_k_m.gguf',
    // [修改] URL 已指向 ModelScope (使用了社区提供的 GGUF 版本)
    url: 'https://modelscope.cn/api/v1/models/X-D-P/bge-small-zh-v1.5-gguf/repo?Revision=main&FilePath=bge-small-zh-v1.5-q4_k_m.gguf',
    size: '~80MB',
    type: 'Embedding Model',
    description: 'High-performance embedding model for semantic search. Required for context analysis.'
  },
];

// --- 响应式状态 (保持不变) ---
const modelsDir = ref('Loading path...');
const localModels = ref([]);
const downloadProgress = ref({});
const selectedChatModel = ref('');
const loadingStates = ref({ chat: false });
const chatModelStatus = ref('Load Model');
const globalError = ref('');
const globalSuccess = ref('');

let unsubscribeDownloadProgress = null;

// --- 计算属性 (保持不变) ---
const isDownloading = computed(() => (fileName) => {
  return fileName in downloadProgress.value;
});

// --- 方法 (保持不变) ---
async function fetchLocalModels() {
  if (window.electronAPI) {
    localModels.value = await window.electronAPI.listLocalModels();
  }
}

async function downloadModel(model) {
  if (!window.electronAPI) return;
  globalError.value = '';
  downloadProgress.value[model.fileName] = 0;
  try {
    await window.electronAPI.downloadModel(model.url, model.fileName);
    await fetchLocalModels();
    globalSuccess.value = `${model.fileName} downloaded successfully!`;
  } catch (error) {
    globalError.value = `Failed to download ${model.fileName}: ${error.message}`;
    console.error(error);
  } finally {
    delete downloadProgress.value[model.fileName];
    setTimeout(() => { globalSuccess.value = '' }, 3000);
  }
}

async function loadChatModel() {
  if (!selectedChatModel.value || !window.electronAPI) return;

  loadingStates.value.chat = true;
  chatModelStatus.value = 'Loading...';
  globalError.value = '';
  globalSuccess.value = '';

  try {
    const modelsPath = await window.electronAPI.getModelsDir();
    const fullPath = `${modelsPath}/${selectedChatModel.value}`;
    const success = await window.electronAPI.loadLLM(fullPath);
    if (success) {
      chatModelStatus.value = 'Model Loaded';
      globalSuccess.value = 'Chat model loaded successfully!';
    } else {
      throw new Error('Backend failed to load the model.');
    }
  } catch (error) {
    chatModelStatus.value = 'Load Failed';
    globalError.value = `Failed to load chat model: ${error.message}`;
  } finally {
    loadingStates.value.chat = false;
    setTimeout(() => { globalSuccess.value = '' }, 3000);
  }
}

// --- 生命周期钩子 (保持不变) ---
onMounted(async () => {
  if (window.electronAPI) {
    modelsDir.value = await window.electronAPI.getModelsDir();
    await fetchLocalModels();

    unsubscribeDownloadProgress = window.electronAPI.onModelDownloadProgress((data) => {
      downloadProgress.value[data.fileName] = data.progress;
    });
  }
});

onUnmounted(() => {
  if (unsubscribeDownloadProgress) {
    unsubscribeDownloadProgress();
  }
});
</script>

<style lang="scss" scoped>
/* 样式保持不变 */
.settings-view {
  padding: 40px 10%;
  height: 100%;
  overflow-y: auto;
}

.view-header {
  margin-bottom: 32px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 16px;

  h2 {
    font-size: 24px;
    font-weight: 700;
  }
  .sub-header {
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.settings-section {
  margin-bottom: 48px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.section-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}
.path-info {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
}

.model-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.model-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.model-info {
  .model-name {
    font-weight: 600;
    display: block;
  }
  .model-meta {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-bottom: 8px;
    display: block;
  }
  .model-desc {
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: var(--border-light);
    color: var(--text-primary);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &.primary {
    background: var(--color-brand);
    color: white;
    &:hover:not(:disabled) {
      background: var(--color-brand-hover);
    }
  }
  .icon-sm {
    width: 16px;
    height: 16px;
    &.success { color: #10B981; }
  }
}

.config-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;

  label {
    font-size: 14px;
    font-weight: 500;
    width: 140px;
    flex-shrink: 0;
  }
}

.select-wrapper {
  flex: 1;
  position: relative;
  select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    font-size: 13px;
    appearance: none;
    cursor: pointer;
    &:hover { border-color: var(--border-hover); }
  }
}

.info-box {
  flex: 1;
  font-size: 13px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
}

.error-box, .success-box {
  margin-top: 20px;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.error-box {
  background: #FEF2F2;
  color: #B91C1C;
  border: 1px solid #FCA5A5;
}
.success-box {
  background: #F0FDF4;
  color: #15803D;
  border: 1px solid #86EFAC;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>