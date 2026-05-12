const App = {
  QUICK_FOLDER: '速记',
  state: {
    pin: null,
    tree: [],
    currentNote: null,   // { path, content, sha }
    editingSha: null,
    sidebarOpen: true,
    darkMode: false,
    capturePin: null
  },

  // ── Init ──────────────────────────────────────────────────────────────────

  async init() {
    this.state.darkMode = localStorage.getItem('ob_dark') === 'true';
    if (this.state.darkMode) document.documentElement.setAttribute('data-theme', 'dark');

    const config = localStorage.getItem('ob_config');
    if (!config) {
      this.showScreen('setup');
      this.renderNumpad('setup-numpad', 'setup');
    } else {
      this.showScreen('login');
      this.renderNumpad('login-numpad', 'login');
    }

    this.bindStaticEvents();
    this.loadDraft();
    MD.onLinkClick = (target) => this.openWikiLink(target);
  },

  // ── Screens ───────────────────────────────────────────────────────────────

  showScreen(name) {
    document.getElementById('login-screen').classList.toggle('hidden', name === 'app');
    document.getElementById('app-screen').classList.toggle('hidden', name !== 'app');
    if (name === 'setup') {
      document.getElementById('setup-form').classList.remove('hidden');
      document.getElementById('login-form').classList.add('hidden');
    } else if (name === 'login') {
      document.getElementById('setup-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
    }
  },

  // ── Numpad ────────────────────────────────────────────────────────────────

  renderNumpad(containerId, mode) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const keys = [1,2,3,4,5,6,7,8,9,'',0,'⌫'];
    const buf = [];
    const displayId = mode === 'setup' ? 'setup-pin-display' : 'login-pin-display';

    const updateDisplay = () => {
      const dots = document.querySelectorAll(`#${displayId} span`);
      dots.forEach((d, i) => d.classList.toggle('filled', i < buf.length));
    };

    keys.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'numpad-key';
      btn.textContent = k === '' ? '' : k;
      btn.disabled = k === '';
      if (k !== '') {
        btn.addEventListener('click', async () => {
          if (k === '⌫') { buf.pop(); }
          else if (buf.length < 4) { buf.push(String(k)); }
          updateDisplay();
          if (buf.length === 4) {
            const pin = buf.join('');
            buf.length = 0;
            updateDisplay();
            if (mode === 'setup') await this.handleSetupPin(pin);
            else await this.handleLogin(pin);
          }
        });
      }
      container.appendChild(btn);
    });
  },

  // ── Setup (first time) ────────────────────────────────────────────────────

  async handleSetupPin(pin) {
    const pat = document.getElementById('setup-pat').value.trim();
    if (!pat) { this.toast('請先輸入 GitHub Token'); return; }

    try {
      GitHub.setToken(pat);
      await GitHub.listDir('');  // validate token
    } catch {
      this.toast('Token 無效，請檢查');
      return;
    }

    const pinData = await Crypto.hashPin(pin);
    const encPat = await Crypto.encrypt(pat, pin);
    localStorage.setItem('ob_config', JSON.stringify({ pinHash: pinData.hash, pinSalt: pinData.salt, encPat }));
    this.state.pin = pin;
    await this.loadApp(pat);
  },

  // ── Login ─────────────────────────────────────────────────────────────────

  async handleLogin(pin) {
    const config = JSON.parse(localStorage.getItem('ob_config'));
    const ok = await Crypto.verifyPin(pin, config.pinHash, config.pinSalt);
    if (!ok) {
      document.getElementById('login-error').classList.remove('hidden');
      setTimeout(() => document.getElementById('login-error').classList.add('hidden'), 2000);
      return;
    }
    try {
      const pat = await Crypto.decrypt(config.encPat, pin);
      this.state.pin = pin;
      GitHub.setToken(pat);
      await this.loadApp(pat);
    } catch {
      this.toast('解密失敗');
    }
  },

  // ── Main App ──────────────────────────────────────────────────────────────

  async loadApp() {
    this.showScreen('app');
    this.toast('載入筆記中...');
    try {
      this.state.tree = await GitHub.buildTree();
      this.renderTree(this.state.tree, document.getElementById('file-tree'), '');
      this.toast('載入完成');
    } catch (e) {
      this.toast('載入失敗: ' + e.message);
    }
  },

  // ── File Tree ─────────────────────────────────────────────────────────────

  renderTree(nodes, container, parentPath) {
    container.innerHTML = '';
    nodes.forEach(node => {
      const el = document.createElement('div');
      if (node.type === 'dir') {
        el.className = 'tree-folder';
        const header = document.createElement('div');
        header.className = 'tree-folder-header';
        header.innerHTML = `<span class="tree-arrow">▶</span><span class="folder-icon">📁</span>${node.name}`;
        const children = document.createElement('div');
        children.className = 'tree-children collapsed';
        this.renderTree(node.children || [], children, node.path);
        header.addEventListener('click', () => {
          const open = !children.classList.contains('collapsed');
          children.classList.toggle('collapsed', open);
          header.querySelector('.tree-arrow').textContent = open ? '▶' : '▼';
          header.querySelector('.folder-icon').textContent = open ? '📁' : '📂';
        });
        el.appendChild(header);
        el.appendChild(children);
      } else {
        el.className = 'tree-file';
        el.textContent = node.name.replace(/\.md$/, '');
        el.addEventListener('click', () => this.openNote(node.path));
      }
      container.appendChild(el);
    });
  },

  // ── Note View ─────────────────────────────────────────────────────────────

  async openNote(path) {
    this.toast('載入...');
    try {
      const file = await GitHub.getFile(path);
      this.state.currentNote = file;
      document.getElementById('note-title').textContent = path.split('/').pop().replace(/\.md$/, '');
      const content = document.getElementById('note-content');
      content.innerHTML = MD.render(file.content, path);
      MD.bind(content);
      this.showNotePanel('view');
      if (window.innerWidth < 768) this.closeSidebar();
    } catch (e) {
      this.toast('載入失敗: ' + e.message);
    }
  },

  async openWikiLink(target) {
    const found = this.findInTree(this.state.tree, target);
    if (found) { await this.openNote(found); return; }
    // Try with .md extension
    const withExt = this.findInTree(this.state.tree, target + '.md');
    if (withExt) { await this.openNote(withExt); return; }
    this.toast(`找不到筆記: ${target}`);
  },

  findInTree(nodes, name, result = { path: null }) {
    for (const n of nodes) {
      if (n.type === 'file' && (n.name === name || n.name === name + '.md' || n.path === name)) {
        return n.path;
      }
      if (n.children) {
        const found = this.findInTree(n.children, name, result);
        if (found) return found;
      }
    }
    return null;
  },

  showNotePanel(mode) {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('note-view').classList.toggle('hidden', mode !== 'view');
    document.getElementById('note-edit').classList.toggle('hidden', mode !== 'edit');
  },

  // ── Edit ──────────────────────────────────────────────────────────────────

  startEdit() {
    const note = this.state.currentNote;
    if (!note) return;
    document.getElementById('edit-title').value = note.path.split('/').pop().replace(/\.md$/, '');
    document.getElementById('edit-content').value = note.content;
    this.state.editingSha = note.sha;
    this.showNotePanel('edit');
  },

  async saveNote() {
    const note = this.state.currentNote;
    const content = document.getElementById('edit-content').value;
    const title = document.getElementById('edit-title').value.trim();
    if (!title) { this.toast('標題不能為空'); return; }

    const dir = note.path.split('/').slice(0, -1).join('/');
    const newPath = dir ? `${dir}/${title}.md` : `${title}.md`;

    // Conflict check
    try {
      const latest = await GitHub.getFile(note.path);
      if (latest.sha !== this.state.editingSha) {
        this.showConflict(newPath, content, latest.sha);
        return;
      }
    } catch {}

    await this._doSave(newPath, content, this.state.editingSha, note.path !== newPath ? null : this.state.editingSha);
  },

  showConflict(path, content, latestSha) {
    const modal = document.getElementById('conflict-modal');
    modal.classList.remove('hidden');
    document.getElementById('conflict-force').onclick = async () => {
      modal.classList.add('hidden');
      await this._doSave(path, content, latestSha);
    };
    document.getElementById('conflict-cancel').onclick = () => modal.classList.add('hidden');
  },

  async _doSave(path, content, sha) {
    try {
      await GitHub.saveFile(path, content, sha);
      const updated = await GitHub.getFile(path);
      this.state.currentNote = updated;
      this.state.editingSha = updated.sha;
      document.getElementById('note-content').innerHTML = MD.render(content, path);
      MD.bind(document.getElementById('note-content'));
      this.showNotePanel('view');
      this.toast('儲存成功');
    } catch (e) {
      this.toast('儲存失敗: ' + e.message);
    }
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteNote() {
    const note = this.state.currentNote;
    if (!note) return;
    if (!confirm(`確定要刪除「${note.path.split('/').pop()}」嗎？`)) return;
    try {
      await GitHub.deleteFile(note.path, note.sha);
      this.state.currentNote = null;
      document.getElementById('empty-state').classList.remove('hidden');
      document.getElementById('note-view').classList.add('hidden');
      this.state.tree = await GitHub.buildTree();
      this.renderTree(this.state.tree, document.getElementById('file-tree'), '');
      this.toast('已刪除');
    } catch (e) {
      this.toast('刪除失敗: ' + e.message);
    }
  },

  // ── New Note ──────────────────────────────────────────────────────────────

  showNewNoteModal() {
    document.getElementById('new-note-modal').classList.remove('hidden');
    document.getElementById('new-note-path').value = '';
    document.getElementById('new-note-path').focus();
  },

  async createNote() {
    let path = document.getElementById('new-note-path').value.trim();
    if (!path) { this.toast('請輸入路徑'); return; }
    if (!path.endsWith('.md')) path += '.md';
    try {
      await GitHub.saveFile(path, `# ${path.split('/').pop().replace(/\.md$/, '')}\n\n`);
      document.getElementById('new-note-modal').classList.add('hidden');
      this.state.tree = await GitHub.buildTree();
      this.renderTree(this.state.tree, document.getElementById('file-tree'), '');
      await this.openNote(path);
      this.startEdit();
      this.toast('已建立');
    } catch (e) {
      this.toast('建立失敗: ' + e.message);
    }
  },

  // ── Quick Capture ─────────────────────────────────────────────────────────

  openCapture() {
    document.getElementById('quick-capture-modal').classList.remove('hidden');
    document.getElementById('capture-content').focus();
  },

  async saveCapture() {
    const title = document.getElementById('capture-title').value.trim()
      || new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
    const content = document.getElementById('capture-content').value.trim();
    if (!content) { this.toast('內容不能為空'); return; }

    const path = `${this.QUICK_FOLDER}/${title}.md`;
    const body = `# ${title}\n\n${content}\n`;
    try {
      await GitHub.saveFile(path, body);
      document.getElementById('capture-title').value = '';
      document.getElementById('capture-content').value = '';
      localStorage.removeItem('ob_draft');
      document.getElementById('quick-capture-modal').classList.add('hidden');
      this.state.tree = await GitHub.buildTree();
      this.renderTree(this.state.tree, document.getElementById('file-tree'), '');
      this.toast('速記已儲存');
    } catch (e) {
      this.toast('儲存失敗: ' + e.message);
    }
  },

  // ── Draft ─────────────────────────────────────────────────────────────────

  loadDraft() {
    const draft = localStorage.getItem('ob_draft');
    if (draft) {
      try {
        const { title, content } = JSON.parse(draft);
        document.getElementById('capture-title').value = title || '';
        document.getElementById('capture-content').value = content || '';
        document.getElementById('draft-indicator').classList.remove('hidden');
      } catch {}
    }
  },

  saveDraft() {
    const title = document.getElementById('capture-title').value;
    const content = document.getElementById('capture-content').value;
    if (title || content) {
      localStorage.setItem('ob_draft', JSON.stringify({ title, content }));
      const ind = document.getElementById('draft-indicator');
      ind.classList.remove('hidden');
      ind.textContent = '草稿已儲存';
    }
  },

  // ── Search ────────────────────────────────────────────────────────────────

  async search(query) {
    if (!query.trim()) {
      this.renderTree(this.state.tree, document.getElementById('file-tree'), '');
      return;
    }
    const q = query.toLowerCase();
    const results = this.filterTree(this.state.tree, q);
    const flat = document.getElementById('file-tree');
    flat.innerHTML = '';
    if (results.length === 0) {
      flat.innerHTML = '<div class="no-results">沒有結果</div>';
      return;
    }
    results.forEach(path => {
      const el = document.createElement('div');
      el.className = 'tree-file search-result';
      el.textContent = path;
      el.addEventListener('click', () => this.openNote(path));
      flat.appendChild(el);
    });
  },

  filterTree(nodes, q, results = []) {
    nodes.forEach(n => {
      if (n.type === 'file' && n.path.toLowerCase().includes(q)) results.push(n.path);
      if (n.children) this.filterTree(n.children, q, results);
    });
    return results;
  },

  // ── Sidebar ───────────────────────────────────────────────────────────────

  closeSidebar() {
    document.getElementById('sidebar').classList.add('closed');
    this.state.sidebarOpen = false;
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    this.state.sidebarOpen = !this.state.sidebarOpen;
    sidebar.classList.toggle('closed', !this.state.sidebarOpen);
  },

  // ── Dark Mode ─────────────────────────────────────────────────────────────

  toggleDark() {
    this.state.darkMode = !this.state.darkMode;
    document.documentElement.setAttribute('data-theme', this.state.darkMode ? 'dark' : '');
    localStorage.setItem('ob_dark', this.state.darkMode);
    document.getElementById('theme-toggle').textContent = this.state.darkMode ? '☀️' : '🌙';
  },

  // ── Markdown Toolbar ──────────────────────────────────────────────────────

  applyMarkdown(textarea, action) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = textarea.value.slice(start, end);
    const wrap = (before, after = before) => {
      textarea.value = textarea.value.slice(0, start) + before + sel + after + textarea.value.slice(end);
      textarea.setSelectionRange(start + before.length, end + before.length);
      textarea.focus();
    };
    const insert = (text) => {
      textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
      textarea.setSelectionRange(start + text.length, start + text.length);
      textarea.focus();
    };
    const actions = {
      bold: () => wrap('**'),
      italic: () => wrap('*'),
      heading: () => insert('\n## '),
      code: () => sel.includes('\n') ? wrap('```\n', '\n```') : wrap('`'),
      list: () => insert('\n- '),
      checkbox: () => insert('\n- [ ] ')
    };
    (actions[action] || (() => {}))();
  },

  // ── Toast ─────────────────────────────────────────────────────────────────

  toast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
  },

  // ── Events ────────────────────────────────────────────────────────────────

  bindStaticEvents() {
    // Theme
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggleDark());
    // Sidebar
    document.getElementById('toggle-sidebar').addEventListener('click', () => this.toggleSidebar());
    // Edit
    document.getElementById('edit-btn').addEventListener('click', () => this.startEdit());
    document.getElementById('save-btn').addEventListener('click', () => this.saveNote());
    document.getElementById('cancel-btn').addEventListener('click', () => this.showNotePanel('view'));
    document.getElementById('delete-btn').addEventListener('click', () => this.deleteNote());
    // New note
    document.getElementById('new-note-btn').addEventListener('click', () => this.showNewNoteModal());
    document.getElementById('create-note-btn').addEventListener('click', () => this.createNote());
    document.getElementById('close-new-note').addEventListener('click', () => {
      document.getElementById('new-note-modal').classList.add('hidden');
    });
    // Quick capture
    document.getElementById('quick-capture-fab').addEventListener('click', () => this.openCapture());
    document.getElementById('quick-capture-empty').addEventListener('click', () => this.openCapture());
    document.getElementById('save-capture').addEventListener('click', () => this.saveCapture());
    document.getElementById('close-capture').addEventListener('click', () => {
      document.getElementById('quick-capture-modal').classList.add('hidden');
    });
    // Draft auto-save
    ['capture-title', 'capture-content'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.saveDraft());
    });
    // Search
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.search(e.target.value), 300);
    });
    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
      if (confirm('重置設定（清除 PIN 和 Token）？')) {
        localStorage.clear();
        location.reload();
      }
    });
    // Markdown toolbars
    document.querySelectorAll('.markdown-toolbar button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const targetId = btn.closest('#note-edit') ? 'edit-content' : 'capture-content';
        this.applyMarkdown(document.getElementById(targetId), action);
      });
    });
    // New note path enter key
    document.getElementById('new-note-path').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.createNote();
    });
    // Setup PAT enter key
    document.getElementById('setup-pat') && document.getElementById('setup-pat').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('setup-numpad').querySelector('button').focus();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
