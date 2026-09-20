"use strict";

/*
 * Markdown Slide Deck for Obsidian
 *
 * Presents the current note as a deck, inside an Obsidian pane. No server, no
 * browser, no network: the app ships with the plugin, the note's Markdown is
 * written into a copy of it, and the copy is loaded in an iframe.
 *
 * Refreshing does not go through that copy again: the new Markdown is posted
 * to the page already on screen, which keeps the current slide and avoids
 * rewriting several megabytes on every edit. If the message goes unanswered,
 * the full rewrite is used as a fallback.
 */

const { Plugin, ItemView, Notice } = require("obsidian");

const VIEW_TYPE = "slidedeck-present";
const APP_FILE = "slidedeck.html";
const ACK_TIMEOUT = 600;
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

function newToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class DeckView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.previewPath = null;
    this.frame = null;
    this.token = null;
  }

  getViewType() { return VIEW_TYPE; }
  getIcon() { return "presentation"; }
  getDisplayText() { return this.file ? `Deck: ${this.file.basename}` : "Deck"; }

  async onOpen() {
    this.addAction("refresh-cw", "Reload deck", () => this.refresh());
  }

  /* Full display: write the app copy with the deck inside, load it. */
  async present(file) {
    this.file = file;
    const adapter = this.app.vault.adapter;
    const dir = this.plugin.manifest.dir;

    const app = await adapter.read(`${dir}/${APP_FILE}`);
    const markdown = await this.readDeck(file);
    this.token = newToken();
    const block =
      `<script type="text/markdown" id="deck-source" data-encoding="base64" ` +
      `data-token="${this.token}">${toBase64(markdown)}</script>\n`;

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
    this.frame = frame;
    this.leaf.updateHeader?.();
  }

  /* Refresh: hand the new Markdown to the page already on screen. */
  async refresh() {
    if (!this.file) {
      new Notice("No deck is being displayed.");
      return;
    }
    try {
      if (this.frame?.contentWindow && this.token) {
        const markdown = await this.readDeck(this.file);
        if (await this.postDeck(markdown)) return;
      }
      await this.present(this.file);
    } catch (err) {
      console.error("Markdown Slide Deck:", err);
      new Notice(`The deck could not be refreshed: ${err.message}`);
    }
  }

  async readDeck(file) {
    return this.plugin.rewriteAssets(await this.app.vault.read(file), file.path);
  }

  /* Resolves true once the page acknowledges, false if it stays silent. */
  postDeck(markdown) {
    return new Promise((resolve) => {
      const frame = this.frame;
      if (!frame?.contentWindow) return resolve(false);
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timer);
        resolve(ok);
      };
      const onMessage = (event) => {
        if (event.data?.type === "slidedeck:ack" && event.data.token === this.token) finish(true);
      };
      window.addEventListener("message", onMessage);
      const timer = window.setTimeout(() => finish(false), ACK_TIMEOUT);
      try {
        frame.contentWindow.postMessage(
          { type: "slidedeck:deck", token: this.token, markdown, keepPosition: true }, "*");
      } catch (err) {
        console.warn("Markdown Slide Deck: message refused, falling back.", err);
        finish(false);
      }
    });
  }

  async onClose() {
    this.frame = null;
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
      name: "Present this note",
      callback: () => this.present(this.app.workspace.getActiveFile()),
    });

    this.addCommand({
      id: "reload-deck",
      name: "Reload the displayed deck",
      callback: () => this.reload(),
    });

    this.addRibbonIcon("presentation", "Present this note", () => this.present(this.app.workspace.getActiveFile()));

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!file || file.extension !== "md") return;
      menu.addItem((item) => item
        .setTitle("Present this deck")
        .setIcon("presentation")
        .onClick(() => this.present(file)));
    }));
  }

  async present(file) {
    if (!file || file.extension !== "md") {
      new Notice("Open a Markdown note first.");
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
      new Notice(`The deck could not be displayed: ${err.message}`);
    }
  }

  async reload() {
    const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
    if (!view) {
      new Notice("No deck is being displayed.");
      return;
    }
    await view.refresh();
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
