# DONE — NEON RUSH

## What I built

A Need-for-Speed-style procedural racing game in plain JavaScript ES modules with Vite and the latest npm `three`.

- A closed-loop, 1.2 km procedural highway with asphalt grain, dashed lane markings, concrete barriers and neon top rails.
- A chase-camera racing car that accelerates, brakes and steers from keyboard input (arrows and WASD).
- Three opponent cars racing continuously around the same track in different lanes/speeds.
- A live racing HUD:活力 speed in KM/H, lap number, current lap timer, opponent speeds and edge warning.
- Procedural WebAudio engine: sawtooth drone through a filter plus generated brown-noise wind layer; oscillator pitch, gain and wind swell are all tied to speed.
- Fully generated textures: asphalt, grass, concrete, brushed metal, car skins, sky gradient, billboard signs, glowing halos and contact shadow. No PNG/JPG/MP3/WAV assets exist in the game source.
- Roadside environment: generated trees, lamps, mountains, billboards, a start-gate sign and a dusk/neon backdrop.
- Screenshot harness `tools/shot.mjs` that loads the built game through Vite preview and Playwright Chromium and saves three screenshots.

## What I checked

- `npm run build` passes.
- `node tools/shot.mjs` builds/loads the game and saves exactly three shots:
  - `shots/story-01-start.png`
  - `shots/story-02-racing.png`
  - `shots/story-03-steering.png`
- I inspected all three screenshots and fixed what looked wrong:
  - the boot overlay initially stayed visible because its CSS hide selector didn't match, leaving screenshots black and text-only;
  - a giant black tessellated sky-dome silhouette dominated the horizon, so the procedural sky is now used directly as the scene backdrop;
  - the road clamp originally collapsed speed to 12 KM/H, so momentum is preserved and the car auto-realigns to the road tangent when it scrapes a barrier;
  - car skins were washed out to silver by a white texture band, so the skin gradient is now colored;
  - the start gate crossbar was oriented along the road rather than across it; it now spans the road with neon trim and a generated START GATE sign;
  - opponent lane offset vector was fixed to be perpendicular to the track.
- Verified keyboard behavior and audio with a Playwright evaluation:
  - steering at rest with ArrowRight changes heading by +0.27 rad;
  - ArrowUp raises speed above 100 KM/H while the AudioContext becomes `running`;
  - the engine oscillator pitch rises with speed (e.g. ~110 Hz at 121 KM/H);
  - ArrowDown drops speed to about 10 KM/H and the engine pitch falls to ~52 Hz with wind gain ~0.0045;
  - opponent count is 3 and the lap timer is live.
- Verified the rendered shots show speed, road, opponents/opponent HUD, lap timer and the controls overlay.

## What I would improve next

- Real opposing-car collisions and lane-based overtaking so opponents can block/jockey around you.
- Per-lap result history with best/last lap and a finish-line summary after several laps.
- More racing-car geometry detail (open chassis fins, better cockpit, actual spoke animation).
- Smoke/dust and light streaks driven by acceleration rather than constant speed.
- Bloom/postprocessing and subtle chromatic aberration for stronger Need-for-Speed neon bloom.
- Better dynamic music: layer accent pulses and braking screech, or procedural arcade percussion.
- Touch/mobile steering buttons in addition to keyboard controls.
- Optional replay camera and photo mode.
- Split large generated texture canvases into smaller runtime caches to reduce build/startup work and improve frame time.

## Deliverables

- `README.md` — what the game is and controls.
- `DONE.md` — this report.
- `shots/` — three inspected Playwright screenshots.
- Source modules under `src/` and screenshot harness `tools/shot.mjs`.
