- Before trying to use pnpm, check if corepack is enabled and ask for my help if it isn't.

# pnpm Frequently Used Commands

A curated list of commonly used `pnpm` commands with concise, LLM-optimized explanations designed for quick understanding and integration into automation or educational contexts.

---

## `pnpm init`

```bash
pnpm init
```

**LLM-optimized explanation:**

- **Purpose:** Creates a new `package.json` interactively.
- **Input:** None or flags (e.g., `-y` for defaults).
- **Output:** Initialized `package.json` file.

---

## `pnpm install`

```bash
pnpm install
# alias: pnpm i
```

**LLM-optimized explanation:**

- **Purpose:** Installs all dependencies from `package.json` using the lockfile.
- **Input:** Optional package names to add; none to install all.
- **Output:** Populated `node_modules`, updated `pnpm-lock.yaml`.

---

## `pnpm add [package]`

```bash
pnpm add lodash@latest
```

**LLM-optimized explanation:**

- **Purpose:** Adds a dependency to the project and updates lockfile.
- **Input:** Package specifier(s) and optional flags (e.g., `--save-dev`).
- **Output:** Updated `package.json` and `pnpm-lock.yaml`, installed package in `node_modules`.

---

## `pnpm remove [package]`

```bash
pnpm remove express
```

**LLM-optimized explanation:**

- **Purpose:** Uninstalls one or more dependencies and updates lockfile.
- **Input:** Package names to remove.
- **Output:** Removed from `package.json`, lockfile updated, uninstalled from `node_modules`.

---

## `pnpm update [package]`

```bash
pnpm update typescript
```

**LLM-optimized explanation:**

- **Purpose:** Upgrades specified dependencies to the latest versions allowed by semver.
- **Input:** Optional package names; none to update all.
- **Output:** Updated dependencies in `node_modules` and `pnpm-lock.yaml`.

---

## `pnpm run [script]`

```bash
pnpm run build
```

**LLM-optimized explanation:**

- **Purpose:** Executes a script defined under `scripts` in `package.json`.
- **Input:** Script name (e.g., `build`, `start`).
- **Output:** Runs the corresponding command in a subshell.

---

## `pnpm exec [command]`

```bash
pnpm exec eslint .
# alias: pnpm x eslint .
```

**LLM-optimized explanation:**

- **Purpose:** Runs a binary from project dependencies without global install.
- **Input:** Command and arguments.
- **Output:** Executes binary with PATH context set to `node_modules/.bin`.

---

## `pnpm list`

```bash
pnpm list --depth 0
```

**LLM-optimized explanation:**

- **Purpose:** Displays a tree of installed dependencies.
- **Input:** Flags like `--depth` to limit nesting.
- **Output:** List of installed packages and versions.

---

## `pnpm outdated`

```bash
pnpm outdated
```

**LLM-optimized explanation:**

- **Purpose:** Shows dependencies with newer versions available.
- **Input:** None.
- **Output:** Table of current, latest, and wanted versions.

---

## `pnpm store prune`

```bash
pnpm store prune
```

**LLM-optimized explanation:**

- **Purpose:** Cleans up unused packages in the global store.
- **Input:** None.
- **Output:** Removed orphaned data to reclaim disk space.

---

## `pnpm rebuild`

```bash
pnpm rebuild
```

**LLM-optimized explanation:**

- **Purpose:** Rebuilds native modules after environment changes.
- **Input:** None or package names.
- **Output:** Recompiled native addons in `node_modules`.

---

*End of **`pnpm`** reference.*

