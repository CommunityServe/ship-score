# DONE

Build completed.

## What I built

- A self-contained Vite project using the latest three.js npm package and plain JS modules.
- A closed neon racetrack with procedurally generated asphalt, ground, building-window and billboard textures.
- A chase-camera car with headlights, tail lights, animated wheels, steering and underglow.
- Two opponent cars that move around the circuit.
- Keyboard controls: `W/↑` accelerate, `S/↓` brake, `A/←` steer left, `D/→` steer right.
- HUD with live speed, lap count and lap timer.
- Fully synthesized Web Audio engine/tyre/wind sound that reacts to speed and steering.
- `tools/shot.mjs` builds the game, starts a preview server, waits for the first rendered frame via `window.__racerReady`, and saves exactly three screenshots to `shots/`.

## What I checked

- `npm run build` passes.
- The screenshot tool runs successfully and saves `01-start.png`, `02-accelerated.png`, and `03-steering.png`.
- Screenshot crops/OCR confirmed the speed readouts **092**, **164**, and **227**, and the lap timer values.
- The control panel sits at the bottom-left; the speed HUD is at the top-left and does not overlap it.
- The player and opponent cars are visible in the scene at their expected projected screen positions.
- Audio starts on the first control key and the engine oscillator frequency rises with speed. I tested this through Playwright.
- Fixed issues found during checking: a nested HUD/control layout that placed the controls at the top, a Web Audio `createFilter` bug (changed to `createBiquadFilter`), and a duplicated wheel declaration.

## What I would improve next

- Add continuous throttle/braking while keys are held, instead of discrete speed bumps.
- Use real steering dynamics and collision/contact behaviour between cars.
- Make opponent AI smarter, with drafting, overtaking and race positions in the HUD.
- Add track banking, hills and more varied camera shake at high speed.
- Tune bloom and reflection quality; add wet-road specular highlights and true shadow maps.
- Better accessibility for keyboard controls and a small mobile-friendly optional touch UI.
- Add a race leaderboard and finish-line lap times for both player and opponents.
