# Neon Runner

A Need-for-Speed-style night racing game built with **Vite**, the latest **three.js** from npm, and plain JavaScript modules.

Everything is procedural: the asphalt, ground, building windows, neon signs and start/finish line are generated with Canvas textures at runtime. The engine, tyre and wind audio are synthesized with Web Audio oscillators and procedural noise buffers. There are **no image or audio asset files** used by the game.

## Run it

```bash
npm install
npm run dev     # development server
npm run build   # production build
npm run preview # preview the production build
```

Playwright screenshots:

```bash
node tools/shot.mjs
```

This publishes the built game, waits for the first rendered frame, and writes `shots/01-start.png`, `shots/02-accelerated.png` and `shots/03-steering.png`.

## Controls

- **W / ↑** — accelerate. Press repeatedly to build up speed.
- **S / ↓ / B / space** — brake.
- **A / ←** — steer left.
- **D / →** — steer right.

The first control-key press also starts the Web Audio engine. The engine sound changes with speed: oscillator pitch, rumble and filtered noise all rise as speed increases. The tyre sound increases when steering hard.

## What is on screen

- A neon night circuit with a textured road and glowing rails.
- A stylised sports car with headlights, tail lights, wheels, spoiler and underglow.
- Two AI opponent cars on the track.
- Live speed in **KM/H**.
- A lap timer that resets at the start/finish line.
