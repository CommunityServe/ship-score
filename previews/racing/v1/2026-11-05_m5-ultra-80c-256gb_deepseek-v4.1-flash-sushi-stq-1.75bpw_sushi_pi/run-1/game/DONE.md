# Done

## Built

`Neon Ridge GP` is a complete, playable arcade racer in this directory.

- **Stack:** Vite, three.js (from npm), plain ES modules.
- **World:** closed spline circuit with asphalt, kerbs, start gantry, barriers, grandstands, city towers, lamps, billboards, mesas, shrubs, and rocks.
- **Racing:** player vs. four AI opponents, three laps, start countdown, lap and race timers, live position, best/last lap, finish results.
- **Controls:** W/S accelerate/brake, A/D steer, Shift nitro, Space handbrake drift, C camera, R restart, M mute.
- **HUD:** lap panel, position/minimap, canvas speedometer (needle + digital speed + gear), nitro bar, engine-live indicator, keyboard help.
- **Audio:** Web Audio engine with three detuned oscillators through distortion and a speed-driven lowpass; generated exhaust/wind/tire noise; crash bursts and beeps. Muting and resume-on-gesture are handled.
- **FX:** speed-sensitive engine pitch, chase/bumper cameras, camera shake, tire smoke, wall/impact sparks, procedural car paint and underglow.
- **Assets:** no image, model, or audio files ship with the game. Everything is generated with canvas/noise functions or Web Audio. (The three review screenshots in `shots/` are test output produced by the screenshot tool, not game assets.)

## Checked

- `npm run build` — **passes**. Vite emits only the non-fatal "chunks larger than 500 kB" warning from three.js.
- `npm run shot` — **PASS** with the following live checks:
  - Canvas 1440×900, WebGL 2.0.
  - Keyboard acceleration: 92.7 km/h → 120.8 km/h.
  - Keyboard steering: yaw delta 0.482 rad after holding D.
  - Braking: 238.1 km/h → 86.0 km/h after holding S.
  - Lap crossing counted: laps = 1, position and lap timer updated.
  - Camera toggle with C: reaches `BUMPER CAM`.
  - Engine pitch tracks speed: idle 80.8 Hz → 156.1 Hz at speed.
  - Three screenshots written and inspected (`shot1-start.png`, `shot2-race.png`, `shot3-corner.png`).
- Manually inspected each screenshot. The start grid shows all four opponents, the race view shows the circuit gantry, and the third shot shows the player, HUD, minimap, and lap/speed telemetry at speed.
- Full-race finish verified in a temporary probe: three laps complete, results panel visible with `1 / 5` finishing position, total time `00:33.46`, best lap `00:10.28`, and zero page errors.
- Search confirms `dist/` contains only HTML/CSS/JS and the source tree has no image/audio asset files.

## Improvements made during review

- Fixed a missing speed readout element that crashed HUD updates, and exposed `#speed-value` for regression checks while keeping the gauge as the visible readout.
- Corrected the underglow material property typo so the car glow animates and intensifies with speed.
- Fixed HUD/lap-state and finish-race signatures, then verified lap counting and timing.
- Reworked the audio graph (limiter placed before the destination, engine filter and layered noise balanced) so engine pitch clearly tracks speed.
- Tuned AI speeds, lane weaving, and starting grid spacing so the race is close but the screenshots read clearly.
- Replaced the first-pass "hood" camera with a bumper camera that hides the car body, avoiding a giant hood filling the frame; added visible chase/bumper state to the HUD.
- Retuned the chase camera distance, height, and speed-driven FOV for a better sense of speed.
- Reduced tire-smoke particle size and opacity and raised the slip threshold so smoke no longer reads as gray floating blobs.
- Added a dedicated Playwright smoke test with real keyboard input, engine-pitch comparison, bumper-camera toggle, and a brake assertion, so regressions are caught automatically.

## Notes

- If Playwright's Chromium is not present, run `npx playwright install chromium` before `npm run shot`.
- The screenshot test uses the built output, so run `npm run build` before `npm run shot`.
