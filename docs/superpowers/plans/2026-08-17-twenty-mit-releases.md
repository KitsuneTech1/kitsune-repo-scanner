# Twenty MIT Repository Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish exactly 20 reviewed MIT repositories under `KitsuneTech1`.

**Architecture:** Use isolated release clones under `.codex/scratch/mit-release-20260817`. Existing private GitHub repositories retain their history. Four local-only projects are cloned from their reviewed release branches, created privately on GitHub, pushed, verified, and then made public.

**Tech Stack:** Git, GitHub CLI, each repository's existing test toolchain, deterministic local secret scanning.

## Global Constraints

- Preserve unrelated local changes and divergent branches.
- Do not publish credentials, private infrastructure, private CTF material, cheats, or commercial source.
- Every public repository must use the MIT license.
- Change visibility only after the reviewed release commit is present on GitHub.
- Publish exactly 20 repositories.

---

### Task 1: Inventory and provenance

**Files:**
- Inspect: `.codex/scratch/mit-release-20260817/*`

- [ ] Verify the exact 20 repository names against the approved design.
- [ ] Record default branches, commit counts, authors, tracked files, and current licenses.
- [ ] Confirm the existing MIT repositories already grant redistribution rights.
- [ ] Confirm Moo controls the four projects that need a new MIT license.

### Task 2: Release metadata

**Files:**
- Create or modify: `<repo>/LICENSE`
- Modify when needed: `<repo>/README.md`
- Modify when needed: `<repo>/package.json`

- [ ] Add the standard MIT license to repositories without it.
- [ ] Change Repo Scanner's package metadata and README from AGPL to MIT.
- [ ] Remove machine-specific paths or private deployment details from public documentation.
- [ ] Run `git diff --check` in every modified repository.
- [ ] Commit only reviewed release files.

### Task 3: Security and quality gate

**Files:**
- Inspect: every tracked file and every reachable Git object in all 20 repositories.

- [ ] Scan all reachable history for credential formats, private keys, environment files, sensitive addresses, and oversized build artifacts.
- [ ] Review every finding and keep any unresolved repository private.
- [ ] Run the repository's documented tests or build when one exists.
- [ ] Verify every release clone is clean after its release commit.

### Task 4: Private GitHub staging

**Files:**
- No local source changes.

- [ ] Create missing GitHub repositories as private.
- [ ] Push the exact reviewed default branch and tags.
- [ ] Verify the remote commit SHA equals the reviewed local SHA.
- [ ] Verify GitHub detects the MIT license.

### Task 5: Public release and verification

**Files:**
- No local source changes.

- [ ] Change each staged repository from private to public.
- [ ] Query GitHub after every change and verify visibility, default branch, release SHA, and license.
- [ ] Count the newly public release set and require exactly 20.
- [ ] Record the final URLs and any limitations in the session note.
