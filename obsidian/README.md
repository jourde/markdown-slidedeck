# Markdown Slide Deck, Obsidian plugin

Presents the current note as a deck, inside an Obsidian pane. No server, no
browser, no network.

## Install

The plugin is not in Obsidian's community catalogue, so it is installed by hand.

1. Build the app copy the plugin ships, from the repository root:

   ```bash
   python3 build-offline.py
   cp slidedeck-offline.html obsidian/slidedeck.html
   ```

2. Copy the `obsidian` folder into your vault, renaming it on the way:

   ```
   YOUR_VAULT/.obsidian/plugins/slidedeck-present/
   ```

   It must end up holding `manifest.json`, `main.js` and `slidedeck.html` at the
   top level. On macOS, `.obsidian` is hidden in the Finder until you press ⌘ ⇧ .

3. Quit Obsidian entirely and reopen it. The installed plugin list is only read
   at startup, and the refresh button next to it concerns the online catalogue,
   not local folders.

4. Settings → Community plugins → turn **Restricted mode** off, then find
   **Markdown Slide Deck** under **Installed plugins**, the section below the
   catalogue, and switch it on.

If it refuses to appear, the developer console (⌥ ⌘ I on macOS) settles it in one
line:

```js
app.plugins.manifests["slidedeck-present"]
```

An object means the plugin is loaded and you are looking in the wrong list; it
can also be enabled straight from there:

```js
await app.plugins.enablePluginAndSave("slidedeck-present")
```

`undefined` means the folder is somewhere else than you think, which this
confirms:

```js
app.vault.adapter.basePath
```

## Use

- Command palette: **Present this note**
- The ribbon icon in the left sidebar
- Right-click a note: **Present this deck**
- The refresh button in the pane's header, or **Reload the displayed deck** in
  the palette, after editing the note
- Right-click the pane's tab to move it to its own window, for a projector

## How it works

The plugin reads the note, rewrites vault image links to addresses the pane can
load, encodes the Markdown in base64 and writes it into a copy of
`slidedeck.html` as a `deck-source` script element. That copy is loaded in an
iframe. Temporary `preview-*.html` files are removed when the pane closes.

Refreshing takes a shorter route: the new Markdown is posted to the page
already on screen, which keeps the current slide and avoids rewriting several
megabytes on every edit. The page acknowledges the message; if nothing comes
back within 600 ms, the plugin falls back to the full rewrite, so a refresh
never silently does nothing.

Both `![[embed.png]]` and `![](path.png)` are resolved, sizes included:
`![[schema.png|400]]` becomes `![|400](…)`, which the app already understands.
Anything that cannot be resolved is left untouched rather than rewritten wrongly.

## Keeping the copy in step

`obsidian/slidedeck.html` is a build artefact and is not committed. Rebuild it
with the two commands of step 1 whenever `slidedeck.html` changes at the root,
otherwise the plugin keeps presenting an older version of the app.
