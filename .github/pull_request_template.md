<!-- One submission per PR, made by following AGENTS.md. CI recomputes every number and merges a PR that only adds
one new folder under results/ or previews/. -->

**Prompt:** <!-- e.g. voxel-sandbox v1 -->
**Machine:** <!-- e.g. M5 Ultra 80c · 256 GB -->
**Model / engine / agent:** <!-- e.g. Qwen3.8 Flash Next 8-bit / mlx-serve 26.11.1 / pi 0.9 -->
**Runs:** <!-- 3 for results/, 1-3 for previews/ -->
**Judge:** <!-- the model that judged the checklist -->

- [ ] Nobody helped any run: no nudges, answers or killed tools.
- [ ] The engine restarted between runs.
- [ ] `node harness/validate.mjs <submission folder>` passes locally.
