import pathlib
root = pathlib.Path(__file__).parent
html = (root/'src/index.html').read_text()
css = (root/'src/style.css').read_text()
js = (root/'src/core.js').read_text() + '\n' + (root/'src/music.js').read_text() + '\n' + (root/'src/game.js').read_text()
assert '</script' not in js
(root/'dist').mkdir(exist_ok=True)
page = html.replace('/*STYLE*/', css).replace('/*SCRIPT*/', js.replace('/*DEBUG*/', ''))
cut = page.index('<div id="app"')
head, body = page[:cut], page[cut:]
out = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
       'body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
       + head + '</head>\n<body>\n' + body + '</body>\n</html>\n')
(root/'dist/loose-leaf.html').write_text(out)
dbg = "window.__LL = { get s() { return s; }, startGame, openMenu, closeMenu, openPower, closePower, toggleBoxes, Music, SFX, layout, cam, get screen() { return screen; }, render, tick, updateCamera, renderHud, enterWorld, get wi() { return wi; }, get world() { return world; }, get game() { return game; }, saveGame, openEnd, openTitle };"
wrap = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'
test = wrap + html.replace('/*STYLE*/', css).replace('/*SCRIPT*/', js.replace('/*DEBUG*/', dbg)) + '</body></html>'
(root/'test/page.html').write_text(test)
print('built', len(out), 'bytes')
