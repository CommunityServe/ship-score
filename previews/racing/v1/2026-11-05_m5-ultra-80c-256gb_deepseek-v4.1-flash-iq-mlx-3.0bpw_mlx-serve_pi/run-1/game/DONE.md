# DONE — Night Shift // City Circuit

## What I built

A complete night-city arcade racer with a Need-for-Speed feel, using Vite, three.js `0.187.0`, and plain ES modules.

### Gameplay
- Procedural closed circuit (~1.75 km) generated from a Catmull-Rom spline, with a road ribbon, lane markings, curbs, barriers, neon strips, start/finish gate and a start-line checker.
- Player car with arcade drift physics: acceleration, braking/reverse, steering with speed-dependent turn rate, lateral grip, handbrake drift, off-road penalty, wall scrape and opponent collisions.
- Three AI opponents following racing lines at different speeds with corner slowdown, so the player can chase and overtake them. Live ranking (P1–P4), lap counter, lap timer and best lap.
- Race timer begins on first driving input; opponents wait on the grid until then.
- HUD: large km/h speedometer, gear, RPM bar, lap time, best lap, position, race time, minimap with car dots, off-track warning, controls panel.
- Keyboard controls: W/↑ accelerate, S/↓ brake/reverse, A/D or ←/→ steer, Space handbrake, R reset.

### Procedural visuals (no image files)
- Canvas-painted asphalt with aggregate noise, cracks, oil stains, lane dashes and edge lines; red/white curb stripes; dark ground; neon window facades; brushed-metal car paint; checker start line; billboard text; radial glow sprites; a starry gradient sky with moon glow.
- Procedural low-poly car model with wheels, cabin glass, spoiler, headlights, brake lights, underglow and a fake additive headlight pool on the road (chosen over spotlights so nearby opponents are not blown out).
- ~40 buildings with UV-scaled emissive window facades, ~40 street lamps with glow sprites and light pools, neon pylons, billboards, fog, moonlight, hemisphere/ambient lighting and UnrealBloom post-processing.

### Procedural audio (no audio files)
- Web Audio engine: five detuned oscillators (saw/square/triangle harmonics) through a low-pass filter, plus exhaust rumble noise, tyre noise, wind noise, and a turbo whistle.
- RPM/gear model drives oscillator frequency, filter cutoff and gain. Gear shifts drop the pitch audibly. Tyre squeal rises with drift, wind with speed, and braking adds high-band noise.
- Audio begins on first click/keypress (autoplay policy), with a HUD hint until then.

### Tooling
- `tools/shot.mjs`: builds, starts `vite preview`, launches Playwright Chromium at 1600×900, waits for rendered frames, drives the game with real keyboard events (plus a small steering assistant for screenshot framing), saves `shots/01-start.png`, `02-accelerating.png`, `03-highspeed.png`, verifies engine audio and speed, and fails on browser errors.

## What I checked

- `npm run build` passes (Vite production build, three.js latest from npm).
- `npm run shot` passes and saves all three screenshots. I reviewed every screenshot and fixed the issues they exposed:
  - car paint too dark → lighter procedural paint texture and stronger emissive;
  - opponents invisible at distance → brighter tail lights/halos, closer grid positions;
  - overexposed white opponents → removed spotlights that blew out nearby cars, replaced with additive road beam pools and matte opponent paint;
  - neon strips washed out → deeper cyan/magenta colours and lower bloom strength;
  - facades looked like huge mosaic tiles → 16×16 window cells;
  - wall collision explosive-velocity bug → lateral velocity is now cancelled (not doubled) and scraping only removes speed proportionally to impact.
- Screenshot contents:
  - `01-start.png`: grid before launch, lap timer `0:00.000`, opponents visible ahead, speed 0.
  - `02-accelerating.png`: 140 km/h, gear 4, opponents ahead, lap timer and minimap updating.
  - `03-highspeed.png`: 143 km/h through a corner, overtaking a purple opponent, position improved to P3/4.
- Keyboard checks in Chromium: acceleration (0 → ~88 km/h quickly, 130–140 km/h in screenshots), braking (88 → 13 km/h), steering (real A/D events used by the screenshot autopilot), reset (returns to 0 km/h on the road).
- Lap rollover check: drove a complete lap with keyboard automation; lap advanced 1 → 2, best lap recorded as `0:43.030`, position ranking updated.
- Audio check: AudioContext running after first gesture, analyser RMS > 0, oscillator pitch rises with speed (idle ~66 Hz → ~102 Hz at the screenshot-2 speed of 134 km/h; a high-RPM gear-3 pull reached ~317 Hz in earlier checks), and engine gain rises with throttle/speed. Gear changes produce audible pitch drops by design.
- Browser console: no page errors during the screenshot run (only Chromium WebGL/readPixels performance warnings).
- Asset check: no image or audio files are used by the game; textures come from canvases and sound from Web Audio. The PNGs in `shots/` are generated test artifacts.

## What I would improve next

1. **Car art**: wheel arches, visible rear glass, exhaust tips, richer body curves, tyre smoke and a drift score/combo system.
2. **Race structure**: a start-light countdown, a 3-lap finish screen with standings, and persisted best laps in localStorage.
3. **AI**: proper overtaking, avoidance, varied racing lines and mild rubber-banding.
4. **Environment**: tunnels, elevation changes, rain/weather, animated neon signs and more distinct city districts.
5. **Speed feel**: subtle motion blur/speed streaks, camera roll and tighter camera shake at high speed.
6. **Audio**: Doppler panning for opponents, richer gear-specific engine timbre, and a countdown/UI sound layer.
7. **Performance**: LOD/instancing for buildings and lamps, adaptive bloom resolution, and mobile touch controls.
