# Ship Score: instructions for the agent running the eval

You are the **referee and the judge**, not a player. A local model, driven by an agent harness, builds a game from a
pinned prompt. You set the run up, keep your hands off it, measure it, judge its checklist from screenshots, and
prepare the submission. Never write, fix or hint at the game's code. The model under test never judges itself.

## Rules (they decide whether a run counts)

- **Pinned prompt.** `prompts/<name>/v1/prompt.txt`, byte for byte. The harness checks its sha256, and CI checks that
  the session's first message is that prompt.
- **Everything else is the submitter's choice:** engine, model, quant, settings, agent harness. All of it is scored.
- **No help.** Once a run starts nobody steps in: no nudges, no answers, no killed tools. The only stop is the
  90-minute cap, which the harness enforces. A run anyone helped is void: do not submit it.
- **Fresh start.** A new empty folder per run, and the engine restarted between runs (ask the user to do it).
- **Name the inputs.** `text` or `text+images` (the agent can look at its own screenshots). Give the model images if
  it supports them.
- **Official results take 3 runs** on one rig (`results/`); 1 or 2 runs go to `previews/`, shown but not ranked.

## The score

```
run cost  = √(avg GiB) × minutes × M tokens
checklist = points of the items the judge passed with evidence ÷ 10   (0 if the run did not ship)
score     = 1,000 × (checklists added) ÷ (run costs added, failed runs included)
```

- **avg GiB:** the engine process's memory footprint, sampled every 30 s, averaged from the prompt to the agent's last
  message (macOS `phys_footprint`; NVIDIA the process's VRAM plus its RSS). Caches count.
- **minutes:** the prompt to the agent's last message, at most 90.
- **M tokens:** millions of tokens the model wrote plus prompt tokens it had to prefill. Prompt-cache hits are free.
- **Ships** when the run ended inside the cap, `npm run build` passed, `DONE.md` exists and the play check passed: no
  page errors, a first frame that is not blank, and at least one input that changed the screen.

## Steps

### 0. Ask the user for anything below they have not given you

- The engine: name and version, its OpenAI- or Anthropic-compatible base URL, the model id, and the engine's PID.
- The model's name, quant and where it comes from (a Hugging Face link if public).
- The agent harness to drive it with and its version. Supported: `pi`, `claude-code` (`harness/sessions.mjs`;
  another harness needs a parser there first).
- The rig: chip or GPU, GPU cores, memory. Written like `M5 Ultra 80c · 256 GB` or `RTX 5090 · 32 GB`.
- The prompt (`ls prompts/`) and the inputs (`text` or `text+images`).

### 1. Set up

```
git clone https://github.com/CommunityServe/ship-score && cd ship-score
(cd harness && npm install && npx playwright install chromium)
```

### 2. Name the submission folder

`<area>/<prompt>/v1/<YYYY-MM-DD>_<machine>_<model>_<engine>_<agent>`, lowercase, `[a-z0-9._-]` only, for example
`previews/voxel-sandbox/v1/2026-11-05_m5-ultra-80c-256gb_qwen3.8-flash-next-8bit_mlx-serve_pi`. Use `results/` only
when you will make 3 runs.

### 3. Run (once per run: `run-1`, then `run-2`, `run-3`)

```
node harness/run.mjs --prompt voxel-sandbox --dir <submission>/run-1 --agent pi --engine-pid <PID> -- \
  pi -p --approve --provider <provider> --model <model id> --session-dir {run_dir}/sessions {prompt_text}

node harness/run.mjs --prompt voxel-sandbox --dir <submission>/run-1 --agent claude-code --engine-pid <PID> -- \
  claude -p --dangerously-skip-permissions --model <model id> {prompt_text}
```

The agent runs non-interactively inside `<run>/game` with the prompt as its only message. Configure the harness to
reach the user's engine beforehand (pi: a provider in its config; Claude Code: `ANTHROPIC_BASE_URL` set to the
engine). Do not touch the run until it exits. The harness then saves the session log with home paths scrubbed and
runs the play check (`play.json`, frames in `play/`, a publishable copy of the game in `web/`). Ask the user to restart
the engine before the next run.

### 4. Judge the checklist (every run that shipped)

Read `prompts/<prompt>/v1/checklist.json`. For each item decide **yes or no from what the game shows**, never from
`DONE.md`, the model's own claims or reading the code:

- Look at the play check's frames in `play/` and the game's own screenshots in `game/shots/`.
- When no frame can show an item, play more: write a steps file (same format as `harness/steps.json`: `wait`, `shot`,
  `start`, `press`, `hold` + `ms`, `look: [dx, dy]`, `click: "left" | "right" | [x, y, button]`, `drag: [x1, y1, x2, y2]`)
  and run `node harness/play.mjs <run> --steps extra.json --out play/extra-1`.
- `pass: true` needs at least one screenshot inside the run that shows it. No evidence, no points.
- Judge every run on the same bar. When unsure, it is a no.

Write `<run>/checklist.json`:

```json
{
  "judge": "<your model id>",
  "items": [
    { "id": "walk", "pass": true, "evidence": ["play/04-walk.jpg", "play/06-look-right.jpg"], "note": "moves forward, view turns" },
    { "id": "water", "pass": false, "evidence": [], "note": "no water in any frame" }
  ]
}
```

A run that did not ship still needs a `checklist.json` (`"items": []` is fine): it scores 0 and still pays its cost.

### 5. Write `submission.json`, score and validate

```json
{
  "prompt": "voxel-sandbox", "version": "v1",
  "rig": { "machine": "M5 Ultra 80c · 256 GB", "os": "macOS 27.0" },
  "engine": { "name": "mlx-serve", "version": "26.11.1", "settings": "defaults" },
  "model": { "name": "Qwen3.8 Flash Next", "quant": "8-bit MLX", "source": "https://huggingface.co/..." },
  "agent": { "name": "pi", "version": "0.9.0" },
  "inputs": "text",
  "judge": { "model": "<your model id>" },
  "notes": "optional, one line"
}
```

```
node harness/score.mjs <submission> --write    # fills runs[] and score
node harness/validate.mjs <submission>         # what CI runs
```

### 6. Compare (when the user scored more than one submission of the prompt)

```
node harness/compare.mjs <submission> <submission> ...    # also results/<prompt>/v1/* to set them beside the leaderboard
```

It draws one sheet (a card per submission with its game, bars for the score, checklist, memory, time, tokens and tool
calls, and the table) into `compare/<prompt>-v1_<date>_<time>/compare.html` plus `compare.png`, and opens it in the
browser. It refuses submissions of different prompts and warns when the machines differ. `compare/` is never
submitted.

### 7. Submit (only with the user's OK)

Show the user the score table, the folder's size and what the session logs contain (they hold the system prompt and
the whole conversation). With their OK: fork the repo, branch, commit **only the submission folder**, and open a PR
titled `<prompt> v1: <model> on <machine>`. CI recomputes every number and merges a PR that only adds one new
submission folder; the leaderboard updates by itself. Anything else (a new parser, a prompt fix) is a normal PR for a
maintainer.
