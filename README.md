# Loose Leaf

A doodle escapes the notebook. Loose Leaf is a 2D Metroidvania platformer across seven worlds: the Sketchbook, the Desk, Art Class, the Kitchen Fridge, the Library, the Toy Box and the Backyard at Night. Each world hides 12 paper scraps that complete a drawing, and a new tool that opens up the next areas.

**Play:** open `index.html` in a browser, or visit the Vercel site.

## Controls

- Keyboard: arrow keys or A/D to move, Space to jump, ↓ or S to drop through a ledge, Esc to pause and see the map. New tools add their own keys as you find them.
- Touch: on-screen arrow pad and action buttons.
- Gamepad: supported.

Progress saves in your browser.

## Source

`index.html` is the whole game in one file, built from `source/`:

- `source/src/core.js`: the game engine and every room map (no browser code, so tests can run it in Node)
- `source/src/game.js`: drawing, sound, controls, menus and saves
- `source/src/music.js`: the music, synthesized in the browser
- `source/build.py`: joins the pieces into one page

`source/test/reach.js` is a level checker: it plays each world with scripted inputs to prove every scrap can be reached, and that no scrap can be reached before you have the tool it needs.
