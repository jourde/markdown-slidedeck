# Markdown (and HTML) Slide Deck

[https://jourde.github.io/markdown-slidedeck/slidedeck](https://jourde.github.io/markdown-slidedeck/slidedeck)

**_Write in Markdown. Present anywhere._**

Markdown Slide Deck is a lightweight, accessible single-page app that converts uploaded Markdown/HTML files into interactive slide presentations, with configurable slide/notes markers, rich rendering (tables, media, math, callouts, Mermaid), keyboard navigation, search, and a train-line progress view.

➜ [How to use it](https://github.com/jourde/markdown-slidedeck/blob/main/how-to-use.md).

## Present from Obsidian

Decks are often written in a note-taking app, which means leaving it to present: open a browser, find the file, drop it on the app. The plugin in [`obsidian/`](obsidian/) removes that round trip. A "Present this note" command opens the current note as a deck in an Obsidian pane, images included, with no server, no browser and no network.

It works because the app accepts a deck embedded in the page itself, next to the existing file and URL routes:

```html
<script type="text/markdown" id="deck-source">…Markdown…</script>
```

Any host application can use that entry point, not just Obsidian. `data-encoding="base64"` on the element spares the host any escaping worry.

A deck embedded that way can also be replaced without reloading the page, by posting `{ type: "slidedeck:deck", token, markdown }` to the frame. The token is the one written on the `deck-source` element. The current slide is looked up again in the new text, so refreshing an edited deck leaves the speaker where they were.

## Offline

Mermaid, KaTeX and the icon font are the only things fetched from a CDN. Without a network the icon font is the worst of the three: every toolbar button falls back to its ligature name. `build-offline.py` inlines all three, fonts included, and writes a `slidedeck-offline.html` that needs nothing:

```bash
python3 build-offline.py                 # everything, ~4.7 MB
python3 build-offline.py --no-mermaid    # ~1.3 MB, diagrams disabled
```

The Obsidian plugin ships that build, which is why it works on a school wifi that has given up.



## Forks
- By Doug Belshaw: [https://markdeck-3d.dynamicskillset.com/](https://markdeck-3d.dynamicskillset.com/)
