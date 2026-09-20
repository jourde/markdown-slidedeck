# Markdown (and HTML) Slide Deck

[https://jourde.github.io/markdown-slidedeck/slidedeck](https://jourde.github.io/markdown-slidedeck/slidedeck)

**_Write in Markdown. Present anywhere._**

Markdown Slide Deck is a lightweight, accessible single-page app that converts uploaded Markdown/HTML files into interactive slide presentations, with configurable slide/notes markers, rich rendering (tables, media, math, callouts, Mermaid), keyboard navigation, search, and a train-line progress view.

A deck can also be opened straight from a link, with no start screen and no upload: `slidedeck.html?url=my-deck.md` for a single deck, `&slide=` to land on a given slide, `?playlist=` for a whole session. Relative paths are resolved against the app, so a local server serving both the app and your `.md` files is enough.

## Offline

Mermaid, KaTeX and the icon font are the only things still fetched from a CDN. `build-offline.py` inlines them, fonts included, and writes a `slidedeck-offline.html` that needs no network at all:

```bash
python3 build-offline.py                 # everything, ~4.7 MB
python3 build-offline.py --no-mermaid    # ~1.3 MB, diagrams disabled
```

➜ [How to use it](https://github.com/jourde/markdown-slidedeck/blob/main/how-to-use.md).



## Forks
- By Doug Belshaw: [https://markdeck-3d.dynamicskillset.com/](https://markdeck-3d.dynamicskillset.com/)
