# Twenty MIT Repository Release Design

## Goal

Publish exactly 20 useful repositories under `KitsuneTech1` with an MIT license and a clean public default branch.

## Chosen approach

Use existing work with preserved Git history. Fifteen releases come from private GitHub repositories. Five stronger tools complete the set: Flagwatch, Kitsune Sweep, Token Guardian MCP, Kitsune Vulnerability Research MCP, and Kitsune Repo Scanner.

This was chosen over creating empty microrepos for the count or stopping after a smaller flagship batch. It gives Moo the requested repo count without inventing projects or throwing away existing work.

## Release set

1. `0xb`
2. `AdventureGame`
3. `app-icon-generator`
4. `DesktopDetective`
5. `discord-pfp`
6. `EnderDragonProgressive`
7. `exif-remover`
8. `flagwatch`
9. `kitsune-macropad`
10. `kitsune-repo-scanner`
11. `kitsune-sweep`
12. `kitsune-vuln-research-mcp`
13. `LodestoneWarps`
14. `moo-tanks`
15. `PhysicsGame`
16. `ShulkerInShulker`
17. `SimpleBounty`
18. `Solitare`
19. `token-guardian-mcp`
20. `universal-copy-paste`

## Public gate

Each repository must meet all of these requirements before visibility changes:

- Root MIT license and matching package metadata where applicable.
- README that identifies the project and does not expose private paths, credentials, or unsupported claims.
- Clean working tree in the isolated release clone.
- Full tracked-history secret and sensitive-data scan with every finding reviewed.
- No private CTF answers, commercial internals, gambling automation, cheats, or offensive automation.
- A passing project test or build command when the repository defines one.
- GitHub default branch points to the reviewed release commit.

## Publishing

Existing private GitHub repositories keep their issues, history, and URLs and change to public only after the reviewed commit is pushed. New repositories are created private first, receive the reviewed history, and become public only after verification.

## Failure handling

If a candidate fails the gate, it stays private. Replace it with another already-audited candidate so the final public batch still contains exactly 20 repositories. Never weaken a gate to preserve the count.
