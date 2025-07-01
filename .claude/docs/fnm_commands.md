- Before trying to use fnm, check if fnm is installed and ask for my help if it isn't installed.

# fnm (Fast Node Manager) Frequently Used Commands

A curated list of commonly used `fnm` commands with concise, LLM-optimized explanations designed for quick understanding and integration into automation or educational contexts.

---

## `fnm install [version]`

```bash
fnm install 18.16.0
```

**LLM-optimized explanation:**

- **Purpose:** Downloads and installs a specific Node.js version.
- **Input:** Version specifier (e.g., `18.16.0`, `lts`, `latest`).
- **Output:** Node.js runtime installed and available for selection.

---

## `fnm use [version]`

```bash
fnm use 18.16.0
```

**LLM-optimized explanation:**

- **Purpose:** Switches the active Node.js version in the current shell session.
- **Input:** Installed version specifier.
- **Output:** Updates `PATH` so `node` and `npm` point to the chosen runtime.

---

## `fnm default [version]`

```bash
fnm default lts
```

**LLM-optimized explanation:**

- **Purpose:** Sets a default Node.js version for all new shell sessions.
- **Input:** Installed version specifier or alias.
- **Output:** Persistent default recorded in fnm configuration.

---

## `fnm list`

```bash
fnm list
# alias: fnm ls
```

**LLM-optimized explanation:**

- **Purpose:** Displays all locally installed Node.js versions.
- **Input:** None.
- **Output:** List of installed versions with the active one highlighted.

---

## `fnm list-remote`

```bash
fnm list-remote
```

**LLM-optimized explanation:**

- **Purpose:** Shows available Node.js versions from the remote registry.
- **Input:** None.
- **Output:** Table of available versions for installation.

---

## `fnm uninstall [version]`

```bash
fnm uninstall 16
```

**LLM-optimized explanation:**

- **Purpose:** Removes a locally installed Node.js version.
- **Input:** Version specifier.
- **Output:** Deletes runtime files and updates local list.

---

## `fnm alias [name] [version]`

```bash
fnm alias default 18.16.0
```

**LLM-optimized explanation:**

- **Purpose:** Creates or updates a named alias for a Node.js version.
- **Input:** Alias name and version specifier.
- **Output:** Records alias for quick version switching.

---

## `fnm env`

```bash
fnm env
```

**LLM-optimized explanation:**

- **Purpose:** Outputs shell commands to configure the environment for the active Node.js version.
- **Input:** None.
- **Output:** Shell-specific export or `eval` commands for PATH adjustment.

---

## `fnm completions [shell]`

```bash
fnm completions bash
```

**LLM-optimized explanation:**

- **Purpose:** Generates shell completion scripts for `fnm` commands.
- **Input:** Shell type (e.g., `bash`, `zsh`, `fish`).
- **Output:** Completion script text to enable tab-completion.

---

## `fnm help`

```bash
fnm help
```

**LLM-optimized explanation:**

- **Purpose:** Shows general usage information and available subcommands.
- **Input:** None or specific command (e.g., `fnm help install`).
- **Output:** Textual help guide to fnm CLI.

---

*End of **``** reference.*

