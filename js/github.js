const GitHub = {
  base: 'https://api.github.com',
  owner: 'tenyeeming',
  repo: 'obsidian-back',
  token: null,

  setToken(token) { this.token = token; },

  _encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  },

  async request(method, path, body = null) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async listDir(path = '') {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/contents/${this._encodePath(path)}`);
  },

  async getFile(path) {
    const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/contents/${this._encodePath(path)}`);
    return {
      content: decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))),
      sha: data.sha,
      path: data.path
    };
  },

  async saveFile(path, content, sha = null, message = null) {
    const msg = message || (sha ? `web: update ${path.split('/').pop()}` : `web: create ${path.split('/').pop()}`);
    const body = {
      message: msg,
      content: btoa(unescape(encodeURIComponent(content)))
    };
    if (sha) body.sha = sha;
    return this.request('PUT', `/repos/${this.owner}/${this.repo}/contents/${this._encodePath(path)}`, body);
  },

  async deleteFile(path, sha) {
    return this.request('DELETE', `/repos/${this.owner}/${this.repo}/contents/${this._encodePath(path)}`, {
      message: `web: delete ${path.split('/').pop()}`,
      sha
    });
  },

  async searchCode(query) {
    const q = `${encodeURIComponent(query)}+repo:${this.owner}/${this.repo}`;
    return this.request('GET', `/search/code?q=${q}&per_page=20`);
  },

  // Single API call instead of recursive calls — much faster
  async buildTree() {
    const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/git/trees/main?recursive=1`);
    const mdFiles = data.tree
      .filter(item => item.type === 'blob' && item.path.endsWith('.md'))
      .map(item => item.path);
    return this._buildStructure(mdFiles);
  },

  _buildStructure(paths) {
    const root = [];
    const dirMap = {};
    paths.forEach(path => {
      const parts = path.split('/');
      let list = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const dirPath = parts.slice(0, i + 1).join('/');
        if (!dirMap[dirPath]) {
          const dir = { name: parts[i], path: dirPath, type: 'dir', children: [] };
          dirMap[dirPath] = dir;
          list.push(dir);
        }
        list = dirMap[dirPath].children;
      }
      list.push({ name: parts[parts.length - 1], path, type: 'file' });
    });
    return root;
  }
};
