# Home Assistant frontend skills

The submodule ships the Home Assistant frontend's own agent skills in
`homeassistant-frontend/.agents/skills/`. They describe the frontend knx-frontend is built from,
at exactly the pinned tag, so read them from there instead of relying on memory. When a rule below
conflicts with them, the KNX rule wins.

## Which skills to read

Read only the skills that match what the change touches:

| Changed                                                               | Read                                                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| always                                                                | `ha-frontend-review`: only the sections on recurring review issues and the review flow                           |
| components and views (`src/**/*.ts` except services, types and tests) | `ha-frontend-lit`, `ha-frontend-components`, `ha-frontend-styling`, `ha-frontend-events`, `ha-frontend-contexts` |
| user-visible text, `src/localize/`                                    | `ha-frontend-user-facing-text`                                                                                   |
| `src/types/`, `src/services/`                                         | `ha-frontend-types`                                                                                              |
| tests                                                                 | `ha-frontend-testing`                                                                                            |

Never use `ha-frontend-demo`, `ha-frontend-gallery`, or the pull request template section of
`ha-frontend-review`; knx-frontend has no demo, no gallery and no PR template.

If `homeassistant-frontend/.agents/skills/` does not exist (submodule not initialized) or a skill
named here is missing (renamed in a newer tag), continue with `checklist.md` alone and state
"HA skills not loaded: <reason>" in the result.

## KNX rules that take precedence

- Import Home Assistant code through `@ha/*`, never with relative paths into the submodule.
- Custom elements start with `knx-`.
- Localization follows the order in `checklist.md`. Panel keys live in
  `src/localize/languages/*.json` (not `src/translations/en.json`). Write "group address".
- The producer of data types is HA Core's KNX integration (and xknx, xknxproject), not the HA
  frontend types.
- `hass` and `this.knx` are legitimate in `knx-frontend`, `knx-router` and the views; only leaf
  components should use contexts.
- There is no Playwright suite, demo or gallery. `yarn lint:types` is compared with the `main`
  baseline, not judged by its exit code.
- The Lovelace card rules in `ha-frontend-components` do not apply.
