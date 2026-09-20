"use strict";

/*
 * Markdown Slide Deck for Obsidian
 *
 * Presents the current note with the Markdown Slide Deck app, inside an
 * Obsidian pane. No server, no browser, no network: the app ships with the
 * plugin, the note's Markdown is written into a copy of it, and the copy is
 * loaded in an iframe.
 *
 * Vault images are rewritten to Obsidian resource addresses before the deck
 * is handed over, so ![[schema.png]] and ![](attachments/schema.png) display
 * exactly as they do in the note.
 */

const { Plugin, ItemView, Notice } = require("obsidian");

const VIEW_TYPE = "slidedeck-present";
const APP_FILE = "slidedeck.html";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

/* Base64 of UTF-8 text. Buffer exists on the desktop; the fallback keeps the
   code honest if it ever runs where it does not. */
function toBase64(text) {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

class DeckView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.previewPath = null;
  }

  getViewType() { return VIEW_TYPE; }
  getIcon() { return "presentation"; }
  getDisplayText() { return this.file ? `Deck : ${this.file.basename}` : "Deck"; }

  async present(file) {
    this.file = file;
    const adapter = this.app.vault.adapter;
    const dir = this.plugin.manifest.dir;

    const app = await adapter.read(`${dir}/${APP_FILE}`);
    const markdown = this.plugin.rewriteAssets(await this.app.vault.read(file), file.path);
    const block =
      `<script type="text/markdown" id="deck-source" data-encoding="base64">` +
      `${toBase64(markdown)}</script>\n`;

    // The inlined libraries contain that closing tag inside their own source,
    // so the document's real one is the last, never the first.
    const cut = app.lastIndexOf("</body>");
    if (cut === -1) throw new Error(`${APP_FILE} has no </body> to write the deck into.`);
    if (!this.previewPath) this.previewPath = `${dir}/preview-${Date.now()}-${Math.floor(Math.random() * 1e4)}.html`;
    await adapter.write(this.previewPath, app.slice(0, cut) + block + app.slice(cut));

    this.contentEl.empty();
    this.contentEl.style.padding = "0";
    const frame = this.contentEl.createEl("iframe");
    frame.setAttribute("allow", "fullscreen");
    frame.setAttribute("allowfullscreen", "true");
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.border = "0";
    // The query string the adapter appends changes on every write, which is
    // what makes a reload actually reload.
    frame.src = adapter.getResourcePath(this.previewPath);
    frame.addEventListener("load", () => {
      try { frame.contentWindow.focus(); } catch (err) { /* keyboard needs a click, no more */ }
    });
    this.leaf.updateHeader?.();
  }

  async onClose() {
    if (!this.previewPath) return;
    try { await this.app.vault.adapter.remove(this.previewPath); } catch (err) { /* already gone */ }
    this.previewPath = null;
  }
}

module.exports = class SlideDeckPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new DeckView(leaf, this));

    this.addCommand({
      id: "present-current-note",
      name: "Présenter cette note",
      callback: () => this.present(this.app.workspace.getActiveFile()),
    });

    this.addCommand({
      id: "reload-deck",
      name: "Recharger le deck affiché",
      callback: () => this.reload(),
    });

    this.addRibbonIcon("presentation", "Présenter cette note", () => this.present(this.app.workspace.getActiveFile()));

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!file || file.extension !== "md") return;
      menu.addItem((item) => item
        .setTitle("Présenter ce deck")
        .setIcon("presentation")
        .onClick(() => this.present(file)));
    }));
  }

  async present(file) {
    if (!file || file.extension !== "md") {
      new Notice("Ouvre d'abord une note Markdown.");
      return;
    }
    try {
      let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) {
        leaf = this.app.workspace.getLeaf("split", "vertical");
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
      this.app.workspace.revealLeaf(leaf);
      await leaf.view.present(file);
    } catch (err) {
      console.error("Markdown Slide Deck:", err);
      new Notice(`Le deck n'a pas pu être affiché : ${err.message}`);
    }
  }

  async reload() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const file = leaf?.view?.file;
    if (!file) {
      new Notice("Aucun deck affiché.");
      return;
    }
    await this.present(file);
  }

  /* Turn vault image links into addresses the iframe can load. Anything that
     cannot be resolved is left untouched: an unresolved link is better than a
     broken rewrite, and external URLs are already fine. */
  rewriteAssets(markdown, sourcePath) {
    const adapter = this.app.vault.adapter;

    const resolve = (linkpath) => {
      let clean = String(linkpath || "").split("#")[0].split("?")[0].trim();
      if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
      try { clean = decodeURIComponent(clean); } catch (err) { /* keep it as written */ }
      const dest = this.app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
      if (!dest || !IMAGE_EXTENSIONS.has(dest.extension.toLowerCase())) return null;
      return adapter.getResourcePath(dest.path);
    };

    // Obsidian embeds: ![[image.png]] and ![[image.png|400]]
    markdown = markdown.replace(/!\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g, (whole, target, size) => {
      const url = resolve(target);
      if (!url) return whole;
      return `![${size ? `|${size}` : ""}](${url})`;
    });

    // Markdown images: ![alt](path.png)
    markdown = markdown.replace(/!\[([^\]\n]*)\]\(\s*<?([^)>\s]+)>?\s*\)/g, (whole, alt, path) => {
      const url = resolve(path);
      if (!url) return whole;
      return `![${alt}](${url})`;
    });

    return markdown;
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
};
