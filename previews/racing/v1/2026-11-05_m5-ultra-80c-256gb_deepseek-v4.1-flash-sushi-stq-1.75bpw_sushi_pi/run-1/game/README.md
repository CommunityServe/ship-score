# Neon Ridge GP

A Need for Speed-inspired arcade racer built with [three.js](https://threejs.org/) and Vite. Race four AI rivals around a neon sunset circuit for three laps, manage nitro, and chase a fast lap time.

Everything you see and hear is generated at runtime. There are no texture images, models, or audio files in the project:

- **Canvases + noise functions** create the asphalt, terrain, kerbs, chequered finish, city facades, grandstands, billboards, car paint, and sky.
- **Web Audio** synthesises the engine (three detuned oscillators, distortion, and a speed-driven filter), exhaust/wind/tire noise, impact bursts, and countdown beeps.

## Controls

| Key | Action |
| --- | --- |
| **W** / **↑** | Accelerate |
| **S** / **↓** | Brake / reverse |
| **A** / **D** or **←** / **→** | Steer |
| **Shift** | Nitro boost (drains the nitro bar; regenerates when unused) |
| **Space** | Handbrake — breaks traction for a drift |
| **C** | Toggle chase / bumper camera |
| **R** | Restart the race |
| **M** | Mute / unmute |

The car has a forgiving arcade handling model: steering is smoothed, walls clamp you back onto the road, a drift preserves momentum through corners, and nitro gives a short burst of extra engine power.

## Race

- Four opponents start on the grid and follow the closed circuit with a little lane weaving.
- The HUD shows current lap, race time, best/last lap, position, a live minimap, speed, gear, and nitro.
- Crossing the start/finish line at speed flashes the next lap number. The race finishes after three laps and shows a results panel with total time, best lap, and finishing position.
- Engine pitch, tire smoke, wind, and camera shake all react to speed and braking.

## Run

```bash
npm install
npm run dev       # local dev server
npm run build     # production build in dist/
npm run preview   # preview the production build
```

Open the URL printed by Vite. Click the canvas or press a key once to unlock audio (browsers require a user gesture).

## Screenshot check

The Playwright tool builds nothing itself — run `npm run build` first, then:

```bash
npm run shot
```

`tools/shot.mjs` serves `dist/`, opens Chromium at 1440×900, verifies the countdown, acceleration, steering, brake, lap counting, engine pitch tracking, and camera toggle with real simulated keyboard input, and writes three screenshots to `shots/`:

- `shot1-start.png` — countdown with the four rivals on the grid
- `shot2-race.png` — a high-speed run through the circuit gantry
- `shot3-corner.png` — a later race view with lap and speed HUD

If Chromium is not installed for Playwright:

```bash
npx playwright install chromium
```

## Project layout

```text
index.html          HUD panels and canvas mount
src/main.js         renderer, race loop, input, cameras, scoring
src/track.js        spline circuit, road ribbons, scenery
src/car.js          procedural car model and arcade physics
src/opponents.js    AI racers following the spline
src/textures.js     canvas/noise texture toolkit
src/audio.js        Web Audio engine and effects
src/hud.js          lap/position/minimap/speedometer rendering
src/particles.js    pooled smoke and spark particles
src/style.css       neon HUD styling
tools/shot.mjs      headless browser smoke test and screenshots
```
