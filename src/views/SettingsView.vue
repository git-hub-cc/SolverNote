<template>
  <div class="settings-view">
    <div class="view-header">
      <h2>AI 设置</h2>
      <span class="sub-header">管理和配置您的本地 AI 模型。</span>
    </div>

    <!-- 推荐模型下载区域 -->
    <section class="settings-section">
      <h3 class="section-title">推荐模型 (来自 ModelScope)</h3>
      <p class="section-description">
        应用依赖以下两个模型才能完整运行。如果状态显示“未找到”，请点击下载。
        <br>
        <span class="path-info">模型将保存至: {{ modelsDir }}</span>
      </p>
      <div class="model-list">
        <!-- 模型下载卡片 -->
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
            <!-- 根据不同状态显示不同图标和文本 -->
            <DownloadCloudIcon class="icon-sm" v-if="!isDownloading(model.fileName) && !localModels.includes(model.fileName)" />
            <CheckCircle2Icon class="icon-sm success" v-if="localModels.includes(model.fileName)" />
            <span v-if="isDownloading(model.fileName)">{{ downloadProgress[model.fileName] || 0 }}%</span>
            <span v-else>{{ localModels.includes(model.fileName) ? '已下载' : '下载' }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- [核心修改] AI 服务状态面板 -->
    <section class="settings-section">
      <h3 class="section-title">AI 服务状态</h3>
      <p class="section-description">
        这里显示核心 AI 功能的当前状态。模型下载后，您可能需要**重启应用**来加载它们。
      </p>
      <div class="status-panel">
        <!-- 对话模型状态 -->
        <div class="status-item">
          <div class="status-info">
            <span class="status-name">对话模型 (LLM)</span>
            <span class="status-model-name">qwen1_5-0_5b-chat-q4_k_m.gguf</span>
          </div>
          <div class="status-indicator" :class="statusClass(modelStatuses.chat)">
            <component :is="statusIcon(modelStatuses.chat)" class="icon-sm" />
            <span>{{ formatStatusText(modelStatuses.chat) }}</span>
          </div>
        </div>
        <!-- 嵌入模型状态 -->
        <div class="status-item">
          <div class="status-info">
            <span class="status-name">嵌入与搜索模型</span>
            <span class="status-model-name">bge-small-en-v1.5.Q8_0.gguf</span>
          </div>
          <div class="status-indicator" :class="statusClass(modelStatuses.embedding)">
            <component :is="statusIcon(modelStatuses.embedding)" class="icon-sm" />
            <span>{{ formatStatusText(modelStatuses.embedding) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 全局错误/成功提示框 -->
    <section class="settings-section">
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
import { ref, onMounted, onUnmounted, computed, shallowRef } from 'vue';
import {
  DownloadCloudIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  BrainCircuitIcon
} from 'lucide-vue-next';

// --- 推荐模型列表 (保持不变) ---
const recommendedModels = [
  {
    name: 'Qwen1.5-0.5B-Chat',
    fileName: 'qwen1_5-0_5b-chat-q4_k_m.gguf',
    url: 'https://modelscope.cn/api/v1/models/qwen/Qwen1.5-0.5B-Chat-GGUF/repo?Revision=master&FilePath=qwen1_5-0_5b-chat-q4_k_m.gguf',
    size: '~380MB',
    type: '对话模型',
    description: '来自阿里云的小型、快速且功能强大的聊天模型。适合通用任务。'
  },
  {
    name: 'BGE-Small-English-v1.5',
    fileName: 'bge-small-en-v1.5.Q8_0.gguf',
    url: 'https://modelscope.cn/api/v1/models/ggml-org/bge-small-en-v1.5-Q8_0-GGUF/repo?Revision=master&FilePath=bge-small-en-v1.5-q8_0.gguf',
    size: '~290MB',
    type: '嵌入模型',
    description: '高性能的英文嵌入模型，用于语义搜索和上下文分析。'
  },
];

// --- 响应式状态 ---
const modelsDir = ref('正在加载路径...');
const localModels = ref([]);
const downloadProgress = ref({});
const globalError = ref('');
const globalSuccess = ref('');

// [新增] 存储从后端获取的模型状态
const modelStatuses = ref({
  chat: 'Uninitialized',
  embedding: 'Uninitialized'
});

let unsubscribeDownloadProgress = null;

// --- 计算属性 ---
const isDownloading = computed(() => (fileName) => {
  return fileName in downloadProgress.value;
});

// --- 方法 ---

// 获取本地已下载的模型列表
async function fetchLocalModels() {
  if (window.electronAPI) {
    localModels.value = await window.electronAPI.listLocalModels();
  }
}

// 获取模型服务的实时状态
async function fetchModelStatuses() {
  if (window.electronAPI) {
    modelStatuses.value = await window.electronAPI.getModelsStatus();
  }
}

// 下载模型
async function downloadModel(model) {
  if (!window.electronAPI) return;
  globalError.value = '';
  globalSuccess.value = '';
  downloadProgress.value[model.fileName] = 0;

  try {
    await window.electronAPI.downloadModel(model.url, model.fileName);
    await fetchLocalModels();
    // [增强] 提示用户需要重启
    globalSuccess.value = `${model.fileName} 下载成功！请重启应用以加载新模型。`;
  } catch (error) {
    globalError.value = `下载 ${model.fileName} 失败: ${error.message}`;
    console.error(error);
  } finally {
    delete downloadProgress.value[model.fileName];
    setTimeout(() => {
      globalSuccess.value = '';
      globalError.value = '';
    }, 8000); // 延长提示时间
  }
}

// --- 状态展示辅助函数 ---

// 格式化状态文本，使其对用户更友好
const formatStatusText = (status) => {
  const map = {
    'Uninitialized': '正在初始化...',
    'Loading': '加载中...',
    'Ready': '准备就绪',
    'Not Found': '未找到模型',
    'Error': '加载失败'
  };
  return map[status] || '未知状态';
};

// 根据状态返回对应的 CSS 类名
const statusClass = (status) => {
  const map = {
    'Ready': 'status-success',
    'Not Found': 'status-warning',
    'Error': 'status-danger'
  };
  return map[status] || 'status-loading';
};

// 根据状态返回对应的图标组件 (使用 shallowRef 避免不必要的深度响应)
const statusIcon = (status) => {
  const map = {
    'Ready': shallowRef(BrainCircuitIcon),
    'Not Found': shallowRef(AlertTriangleIcon),
    'Error': shallowRef(XCircleIcon)
  };
  return map[status] || shallowRef(LoaderCircleIcon);
};

// --- 生命周期钩子 ---
onMounted(async () => {
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
  if (unsubscribeDownloadProgress) {
    unsubscribeDownloadProgress();
  }
});
</script>

<style lang="scss" scoped>
/* 视图和卡片的基本样式保持不变 */
.settings-view {
  padding: 40px 10%;
  height: 100%;
  overflow-y: auto;
}
.view-header {
  margin-bottom: 32px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 16px;
  h2 { font-size: 24px; font-weight: 700; }
  .sub-header { color: var(--text-secondary); font-size: 14px; }
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
  .model-name { font-weight: 600; display: block; }
  .model-meta { font-size: 12px; color: var(--text-tertiary); margin-bottom: 8px; display: block; }
  .model-desc { font-size: 13px; color: var(--text-secondary); }
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

  &:hover { background: var(--border-light); color: var(--text-primary); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  .icon-sm { width: 16px; height: 16px; &.success { color: #10B981; } }
}
.error-box, .success-box {
  margin-top: 20px;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.error-box { background: #FEF2F2; color: #B91C1C; border: 1px solid #FCA5A5; }
.success-box { background: #F0FDF4; color: #15803D; border: 1px solid #86EFAC; }

/* [新增] 状态面板样式 */
.status-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background-color: var(--bg-app);
}
.status-info {
  .status-name {
    font-weight: 600;
    font-size: 14px;
    display: block;
  }
  .status-model-name {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
  }
}
.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;

  &.status-loading {
    color: var(--text-secondary);
    background-color: var(--bg-hover);
    .icon-sm { animation: spin 1s linear infinite; }
  }
  &.status-success {
    color: #166534; /* 深绿 */
    background-color: #DCFCE7; /* 淡绿 */
  }
  &.status-warning {
    color: #9A3412; /* 深橙 */
    background-color: #FFEDD5; /* 淡橙 */
  }
  &.status-danger {
    color: #991B1B; /* 深红 */
    background-color: #FEE2E2; /* 淡红 */
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>