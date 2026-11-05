# Ship Score

**An eval that can't saturate.** Give a local model one real job (build a browser game from a pinned prompt, through
an agent, on your own machine) and score what it got right per unit of what finishing cost.

```
score = 1,000 × checklist ÷ (√avg GiB × minutes × M tokens)
```

Benchmarks die: every model eventually aces them. Memory, time and tokens never max out, and a harder prompt is always
one file away. Why and how: [the Ship Score post](https://mlxserve.com/blog/ship-score/).

**Leaderboard and every game, playable:** https://communityserve.github.io/ship-score/

## Run it

Point your coding agent at this repo and let it referee:

> Run the Ship Score eval on my machine against my local model: follow
> https://github.com/CommunityServe/ship-score/blob/main/AGENTS.md

[`AGENTS.md`](AGENTS.md) is the whole protocol: what to ask you, how to start each run hands-off, how to judge the
checklist from screenshots, and how to open the PR. Claude Code reads it through `CLAUDE.md`.

## The prompts

| Prompt | Difficulty | What it asks for |
|---|---|---|
| [`voxel-sandbox`](prompts/voxel-sandbox/v1/prompt.txt) | 2/5 | A first-person block world: walk, break, place, hotbar |
| [`raycaster`](prompts/raycaster/v1/prompt.txt) | 2/5 | An early-90s style raycaster shooter on a plain 2D canvas: textured walls, doors, sprites |
| [`kings-landing`](prompts/kings-landing/v1/prompt.txt) | 3/5 | A city that builds itself like origami, then a first-person walk |
| [`racing`](prompts/racing/v1/prompt.txt) | 3/5 | A car racing game with generated textures and audio |
| [`subway-fps`](prompts/subway-fps/v1/prompt.txt) | 4/5 | A subway-station shooter with waves and a train between stations |
| [`planet-to-orbit`](prompts/planet-to-orbit/v1/prompt.txt) | 5/5 | Fly from a planet's surface to orbit and back, no loading screen |
| [`rts-skirmish`](prompts/rts-skirmish/v1/prompt.txt) | 5/5 | A real-time strategy skirmish against a computer opponent |
| [`linked-doorways`](prompts/linked-doorways/v1/prompt.txt) | 5/5 | A first-person puzzle game of linked doorways |

Each prompt ends with a **Must have** list; its scored version (1 to 3 points per item, 10 in all) is the prompt's
`checklist.json`. A published prompt never changes: a new version is a new folder, and scores only compare runs of
the same prompt version.

## How a result is judged

- **Ships or fails.** Inside 90 minutes, `npm run build` passes, `DONE.md` exists and the play check passes (no page
  errors, not blank, reacts to input). A failed run scores 0 and still pays its cost.
- **Checklist.** An LLM judge (never the model under test) decides each Must have item from screenshots of the game:
  the scripted play check's frames plus any extra steps it plays. An item counts only with a screenshot that shows it.
- **Cost.** The engine's memory footprint (square root: it matters, but less than getting the game right), the
  minutes, and the tokens written plus uncached prompt tokens.
- **Three runs.** 1,000 × the checklists added ÷ the costs added. One lucky run can't carry a model that fails twice.
  Fewer than 3 runs is a preview: shown, not ranked.
- **Scored per machine.** Compare rows on the same class of machine.

## Comparing models

Ran several models (or quants, engines, agents) on the same prompt? `node harness/compare.mjs <submission>...` puts
them on one sheet: a card per submission with its game, bars for the score, checklist, memory, time, tokens and tool
calls, and the table. It writes `compare/<prompt>-v1_<date>_<time>/compare.html` and `compare.png` and opens the page.
Add `results/<prompt>/v1/*` to see yours beside the leaderboard.

## Submitting

One PR per submission, one folder:

```
results/<prompt>/v1/<YYYY-MM-DD>_<machine>_<model>_<engine>_<agent>/   (previews/ for 1-2 runs)
├── submission.json        rig, engine, model, agent, inputs, judge; runs[] and score filled by harness/score.mjs
└── run-1/ run-2/ run-3/
    ├── run.json           agent command, start, end, capped
    ├── session.jsonl.gz   the agent's session log, home paths scrubbed
    ├── mem.txt            "epoch_ms bytes" footprint samples
    ├── play.json, play/   the play check and its frames
    ├── checklist.json     the judge's verdicts, each with its evidence
    ├── game/              the source the model wrote (no node_modules, no dist)
    └── web/               the built game, published on the leaderboard
```

CI (`.github/workflows/validate.yml`) rechecks the prompt, the evidence and the folder shape, and **recomputes every
number from the raw files**. A green PR that only adds one new submission folder merges itself, and the leaderboard
rebuilds. Anyone can play a submitted game and challenge a verdict in an issue.

## Layout

| Path | What |
|---|---|
| `prompts/<name>/v1/` | `prompt.txt` (the exact bytes) and `checklist.json` (items, points, sha256) |
| `harness/run.mjs` | One run: folder, memory sampler, the agent with the cap, the session log, the play check |
| `harness/play.mjs` | The play check, and extra judge steps (`--steps`) |
| `harness/sessions.mjs` | Session-log parsers, one per agent harness: add yours here |
| `harness/score.mjs`, `validate.mjs` | The score and the CI checks, both from raw files |
| `harness/compare.mjs` | A comparison sheet of several submissions of one prompt, opened in the browser |
| `site/build.mjs` | The GitHub Pages leaderboard |

Tests: `node --test harness/test/harness.test.mjs`. Adding an agent harness is one `parsers` entry in `harness/sessions.mjs` with a test.

MIT licensed: the harness, the prompts and every submitted result.
