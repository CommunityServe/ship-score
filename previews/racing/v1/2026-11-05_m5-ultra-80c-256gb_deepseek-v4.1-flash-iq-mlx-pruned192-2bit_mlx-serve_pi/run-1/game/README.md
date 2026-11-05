# NEON RUSH

A Need-for-Speed-style 3D car racing game. The whole world is generated at runtime: asphalt, grass, concrete, brushed metal, cockpit/car skins, billboards, glow sprites, the dusk sky and the engine/wind audio are all produced procedurally from canvas noise, geometry and WebAudio oscillators. There are no image or audio asset files in the project.

## What it is

- A closed-loop neon highway track with lane markings, barriers, roadside lamps, trees, mountains, billboards and a start gate.
- A chase camera racing car. You accelerate, brake and steer with the keyboard while the chase camera tracks your car.
- Three opponent cars continuously race around the same track in different lanes and at different speeds.
- A live race HUD with your current speed, lap number and lap timer, plus opponent speeds.
- A procedural engine drone whose pitch, level and wind-noise swells/changes with your speed.

## Controls

| ArrowUp / W | accelerate |
| ArrowDown / S | brake |
| ArrowLeft / A | steer left |
| ArrowRight / D | steer right |
| R | reset to the start gate |
| M | mute/unmute procedural audio |

Audio starts with the first keyboard or mouse gesture because browsers require a user gesture to open WebAudio.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal.

Production build:

```bash
npm run build
npm run preview
```

## Screenshots

`tools/shot.mjs` loads the built game from `dist/` via the Vite preview server, opens Chromium with Playwright, waits for the renderer, drives the car with keyboard events and saves three screenshots into `shots/`:

- `shots/story-01-start.png` — idle start gate and opponent cars.
- `shots/story-02-racing.png` — accelerated to top speed.
- `shots/story-03-steering.png` — braking then steering through the bend.

```bash
npm run build
node tools/shot.mjs
```

The screenshot PNGs are generated verification artifacts, not assets used by the game runtime.

## Architecture

- `src/main.js` — renderer, boot overlay and animation loop.
- `src/game.js` — car controls/physics, road clamping, opponents, chase camera, lap timer and HUD.
- `src/track.js` — procedural loop spline, road/walls/rails, terrain, roadside props, mountain silhouettes, billboards and start gate.
- `src/cars.js` — tapered racing chassis, cockpit, glowing wheels/stripes and ventral neon glow.
- `src/textures.js` — canvas-generated asphalt, grass, concrete, metal, car skin, sky, glow and billboard textures.
- `src/audio.js` — procedural WebAudio engine, overtone and wind layers mapped to speed.
- `tools/shot.mjs` — Playwright Chromium screenshot harness.

Only Vite and the latest npm `three` package are runtime dependencies. Modules are plain JavaScript ES modules.
