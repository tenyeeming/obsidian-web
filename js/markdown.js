const MD = {
  onLinkClick: null,

  render(content, notePath = '') {
    const dir = notePath.split('/').slice(0, -1).join('/');
    const rawBase = `https://raw.githubusercontent.com/tenyeeming/obsidian-back/main`;

    let text = content
      // Obsidian image embed ![[file.ext]]
      .replace(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|svg|webp))\]\]/gi, (_, file) => {
        const imgPath = dir ? `${dir}/${file}` : file;
        return `![${file}](${rawBase}/${imgPath.split('/').map(encodeURIComponent).join('/')})`;
      })
      // Highlight ==text==
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      // Wikilink [[note|alias]] or [[note]]
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) =>
        `<span class="wikilink" data-target="${link.trim()}">${(alias || link).trim()}</span>`
      );

    marked.setOptions({ breaks: true, gfm: true });

    const html = marked.parse(text);
    return html;
  },

  bind(container) {
    container.querySelectorAll('.wikilink').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onLinkClick) this.onLinkClick(el.dataset.target);
      });
    });
  }
};
