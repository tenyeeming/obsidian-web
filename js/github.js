const GitHub = {
  base: 'https://api.github.com',
  owner: 'tenyeeming',
  repo: 'obsidian-back',
  token: null,

  setToken(token) { this.token = token; },

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
    return this.request('GET', `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`);
  },

  async getFile(path) {
    const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`);
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
    return this.request('PUT', `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`, body);
  },

  async deleteFile(path, sha) {
    return this.request('DELETE', `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`, {
      message: `web: delete ${path.split('/').pop()}`,
      sha
    });
  },

  async searchCode(query) {
    const q = `${encodeURIComponent(query)}+repo:${this.owner}/${this.repo}`;
    return this.request('GET', `/search/code?q=${q}&per_page=20`);
  },

  async buildTree(path = '', acc = []) {
    const items = await this.listDir(path);
    for (const item of items) {
      if (item.type === 'dir') {
        acc.push({ name: item.name, path: item.path, type: 'dir', children: [] });
        await this.buildTree(item.path, acc[acc.length - 1].children = acc[acc.length - 1].children || []);
      } else if (item.name.endsWith('.md')) {
        acc.push({ name: item.name, path: item.path, type: 'file' });
      }
    }
    return acc;
  }
};
