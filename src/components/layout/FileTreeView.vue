<template>
  <div
      class="file-tree-view"
      @dragover.prevent
      @drop="handleRootDrop"
  >
    <!-- 头部 -->
    <div class="nav-group-title tree-header">
      <span>Files</span>
      <div class="header-actions">
        <button class="icon-btn" @click="handleCreateFile(null)" title="New File">
          <PlusIcon class="icon-xs"/>
        </button>
        <button class="icon-btn" @click="handleCreateFolder(null)" title="New Folder">
          <FolderPlusIcon class="icon-xs"/>
        </button>
      </div>
    </div>

    <!-- 树形列表 -->
    <nav class="tree-content">
      <div v-if="isLoading" class="loading-state">Loading...</div>

      <template v-else>
        <!-- 递归渲染所有根节点 -->
        <FileTreeItem
            v-for="node in treeData"
            :key="node.id"
            :item="node"
            @context-menu="openContextMenu"
            @move-item="handleMoveItem"
        />

        <!-- 空白提示 -->
        <div v-if="treeData.length === 0" class="empty-state">
          No files yet.
        </div>
      </template>
    </nav>

    <!-- 右键菜单 (Context Menu) -->
    <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
    >
      <div class="menu-item disabled-label">{{ contextMenu.targetName }}</div>
      <div class="divider"></div>

      <!-- 文件夹特有操作 -->
      <template v-if="contextMenu.targetType === 'folder'">
        <div class="menu-item" @click="handleCreateFile(contextMenu.targetId)">New Note</div>
        <div class="menu-item" @click="handleCreateFolder(contextMenu.targetId)">New Folder</div>
        <div class="divider"></div>
      </template>

      <div class="menu-item" @click="handleRename(contextMenu.targetId)">Rename</div>
      <div class="menu-item danger" @click="handleDelete(contextMenu.targetId)">Delete</div>
    </div>

    <!-- 全局点击遮罩，用于关闭右键菜单 -->
    <div
        v-if="contextMenu.visible"
        class="menu-overlay"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
    ></div>

    <!-- [修复] 自定义输入弹窗 (替代 prompt) -->
    <div v-if="inputDialog.visible" class="modal-overlay" @click.self="closeInputDialog">
      <div class="modal-card">
        <h3 class="modal-title">{{ inputDialog.title }}</h3>
        <input
            ref="dialogInputRef"
            v-model="inputDialog.value"
            class="modal-input"
            type="text"
            @keyup.enter="submitInputDialog"
            @keyup.esc="closeInputDialog"
        />
        <div class="modal-actions">
          <button class="modal-btn" @click="closeInputDialog">Cancel</button>
          <button class="modal-btn primary" @click="submitInputDialog">Confirm</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, reactive } from 'vue';
import { useNoteStore } from '@/stores/noteStore';
import FileTreeItem from './FileTreeItem.vue';
import { Plus as PlusIcon, FolderPlus as FolderPlusIcon } from 'lucide-vue-next';

const noteStore = useNoteStore();

// --- 状态 ---
const isLoading = ref(false);
const treeData = computed(() => noteStore.fileTree);

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  targetId: null,
  targetType: null,
  targetName: ''
});

// [修复] 输入框弹窗状态
const inputDialog = reactive({
  visible: false,
  title: '',
  value: '',
  resolve: null // Promise resolve function
});
const dialogInputRef = ref(null);

// --- 生命周期 ---
onMounted(() => {
  loadTree();
});

const loadTree = async () => {
  isLoading.value = true;
  await noteStore.fetchFileTree();
  isLoading.value = false;
};

// --- 交互处理 ---

const openContextMenu = ({ event, item }) => {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    targetId: item.id,
    targetType: item.type,
    targetName: item.name
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

// --- [修复] 自定义弹窗逻辑 ---

const openInputDialog = (title, initialValue = '') => {
  return new Promise((resolve) => {
    inputDialog.title = title;
    inputDialog.value = initialValue;
    inputDialog.visible = true;
    inputDialog.resolve = resolve;

    // 自动聚焦输入框
    nextTick(() => {
      if (dialogInputRef.value) {
        dialogInputRef.value.focus();
        dialogInputRef.value.select();
      }
    });
  });
};

const closeInputDialog = () => {
  inputDialog.visible = false;
  if (inputDialog.resolve) inputDialog.resolve(null); // 返回 null 表示取消
};

const submitInputDialog = () => {
  if (inputDialog.resolve) inputDialog.resolve(inputDialog.value.trim());
  inputDialog.visible = false;
};

// --- 文件操作 Actions ---

const handleCreateFile = async (parentPath) => {
  closeContextMenu();
  // 调用 store action 创建新笔记并定位 (自动生成名字，无需弹窗)
  await noteStore.createNoteInFolder(parentPath);
};

const handleCreateFolder = async (parentPath) => {
  closeContextMenu();
  // [修复] 使用自定义弹窗替代 prompt
  const name = await openInputDialog("Enter folder name:");

  if (name) {
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    await noteStore.createFolder(fullPath);
  }
};

const handleRename = async (oldPath) => {
  closeContextMenu();
  // 简单起见，从完整路径中提取旧文件名
  const oldName = oldPath.split('/').pop();

  // [修复] 使用自定义弹窗替代 prompt
  const newName = await openInputDialog("Rename to:", oldName);

  if (newName && newName !== oldName) {
    // 构造新路径 (替换最后一段)
    const pathParts = oldPath.split('/');
    pathParts.pop();
    pathParts.push(newName);
    const newPath = pathParts.join('/');

    await noteStore.renamePath(oldPath, newPath);
  }
};

const handleDelete = async (id) => {
  closeContextMenu();
  // 删除仍然使用 confirm，因为它是原生支持的，除非你想做的更漂亮也可以换成弹窗
  if (confirm("Delete this item?")) {
    await noteStore.deleteNote(id);
    await loadTree();
  }
};

// --- 拖拽处理 ---

const handleMoveItem = async ({ sourceId, targetDir }) => {
  await noteStore.movePath(sourceId, targetDir);
};

// 拖到根目录空白处
const handleRootDrop = async (e) => {
  try {
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    // 目标设为 null 或 '' 表示根目录
    await noteStore.movePath(data.id, '');
  } catch (err) {
    // ignore
  }
};
</script>

<style lang="scss" scoped>
.file-tree-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative; /* 用于菜单定位参考 */
}

.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  margin-top: 24px;
  margin-bottom: 8px;

  .header-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .header-actions {
    opacity: 1;
  }
}

.icon-btn {
  padding: 2px;
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;
  &:hover { background: var(--bg-hover); color: var(--text-primary); }
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 2px; }
}

.loading-state, .empty-state {
  padding: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

/* 上下文菜单样式 */
.menu-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 99;
}

.context-menu {
  position: fixed;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 140px;
  padding: 4px 0;
  animation: fadeIn 0.1s ease;
}

.menu-item {
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;

  &:hover { background: var(--bg-hover); }
  &.danger { color: var(--color-danger); }
  &.disabled-label {
    color: var(--text-tertiary);
    font-size: 11px;
    cursor: default;
    background: transparent;
    border-bottom: 1px solid var(--border-light);
    padding-bottom: 4px;
    margin-bottom: 2px;
  }
}

.divider {
  height: 1px;
  background: var(--border-light);
  margin: 4px 0;
}

/* [修复] 模态窗样式 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

.modal-card {
  background: var(--bg-card);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: slideUp 0.15s ease;
  border: 1px solid var(--border-light);
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: var(--bg-app);
  color: var(--text-primary);
  font-size: 13px;

  &:focus {
    border-color: var(--color-brand);
    outline: none;
    box-shadow: 0 0 0 2px var(--bg-active);
  }
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: var(--bg-hover);
  color: var(--text-primary);
  transition: all 0.2s;

  &:hover { background: var(--border-hover); }

  &.primary {
    background: var(--color-brand);
    color: white;
    &:hover { background: var(--color-brand-hover); }
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.icon-xs { width: 14px; height: 14px; }
</style>