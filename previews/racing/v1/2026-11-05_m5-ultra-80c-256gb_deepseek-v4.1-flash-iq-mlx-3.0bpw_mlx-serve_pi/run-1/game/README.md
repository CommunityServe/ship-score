# NIGHT SHIFT // City Circuit

A Need-for-Speed-flavoured arcade racing game built with **Vite** and the latest **three.js** from npm, using plain JavaScript ES modules. Everything you see and hear is generated at runtime: there are **no image or audio asset files** in the project.

## What it is

- A roughly 1.75 km procedural closed city circuit generated from a Catmull-Rom spline, with a tiled road ribbon, painted lane markings, red/white curbs, concrete barriers with neon strips, start/finish gate, street lamps, neon billboards and a night skyline.
- Arcade drift handling: throttle, braking/reverse, steering, handbrake drifts, wall scraping and an off-road speed penalty.
- Three AI opponents racing the same loop, live race position, lap counter, lap timer and best-lap record.
- HUD with km/h speedometer, gear, RPM bar, minimap, lap/position chips and an off-track warning.
- Procedural engine audio synthesised with Web Audio: oscillator harmonics, exhaust rumble, tyre noise, wind, a turbo whistle and gear-shift pitch drops. Pitch and loudness rise with RPM/speed. It starts on the first click or key press because browsers require a gesture.
- Night atmosphere: bloom post-processing, fog, stars, neon facade windows, headlight pools, underglow and moonlit lighting.

## Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake; reverse when stopped |
| `A` / `D` or `←` / `→` | Steer left / right |
| `Space` | Handbrake (drift / reduced grip) |
| `R` | Reset the car onto the track |

The race timer starts the moment you press a driving key. Opponents sit on the grid until then.

## Run it

```bash
npm install
npm run dev      # development server
npm run build    # production build (must pass)
npm run shot     # build + Playwright screenshots + checks
```

`npm run shot` builds the game, serves `dist/` through `vite preview`, loads it in headless Chromium, drives it with real keyboard events, saves three screenshots to `shots/`, and validates speed and engine-pitch changes. If Playwright's browser is not installed yet, run `npx playwright install chromium` first.

## Project layout

```
src/main.js       bootstraps the game
src/game.js       renderer, post-processing, physics, race logic, camera, input
src/track.js      procedural circuit geometry, scenery and start gate
src/cars.js       procedural low-poly car model and lights
src/textures.js   canvas-generated textures (asphalt, curbs, facades, sky, signs)
src/audio.js      Web Audio engine/tyre/wind synthesis
src/hud.js        DOM HUD and canvas minimap
tools/shot.mjs    Playwright screenshot and smoke-test script
```

All textures are painted into canvases at startup and all sounds are synthesised in `src/audio.js`. The PNG files in `shots/` are generated test artifacts, not game assets.
