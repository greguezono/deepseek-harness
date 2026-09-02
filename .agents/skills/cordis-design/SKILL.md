---
name: cordis-design
description: Use when changing or extending DeepSeek Harness — adding or modifying a plugin, tool, MCP server, LLM adapter, Web or client UI, capability seam, bundle, hook, or session behavior, and any work touching lifecycle, effects and disposal, service injection, the Loader, or HMR. Everything in the harness is a Cordis plugin, so this is the default design lens for work under packages/ — what the framework's composability guarantees require, and which designs they rule out.
---

# Cordis design judgment

[Every part of the product is a plugin](../../../docs/architecture.md), so almost any change adds or alters a component in a live, reloadable tree, and the framework's guarantees are what keep that tree coherent.

Cordis is built on "A Programming Paradigm for Spatiotemporal Composability" (Shi, Zhang, Cui). The paper proves that a repeatedly reloaded plugin tree ends in the same state a clean boot would produce — but only while specific conditions hold. This skill names those conditions and the designs that forfeit them.

**Mechanics live elsewhere and are not repeated here.** Writing a plugin, dispatching an event, effects and disposal, the fiber states, HMR: [primer](../../../docs/cordis-primer.md), [tutorial](../../../docs/cordis-tutorial/index.md), [generated API](../../../docs/cordis-api/context.md). Standing rules: [root AGENTS.md](../../../AGENTS.md), [packages/AGENTS.md](../../../packages/AGENTS.md). Read those for how; read this for whether a design holds up.

## The two guarantees

Dynamic composition splits along two dimensions, and every test below protects one.

- **Temporal** — unloading reverses what a component did, because each effect returns its own inverse and disposal applies them last-in-first-out (`vendor/cordis/src/fiber.ts:431`).
- **Spatial** — dependencies are resolved and re-resolved as providers come and go (`vendor/cordis/src/fiber.ts:597-621`).

The payoff (Thm 80) is that any interleaving of loads and unloads reaches the same quiescent state as an ordered boot. Break a precondition and it does not degrade gracefully: reload order becomes observable, which is the exact class of bug the framework exists to prevent.

## Design tests

The [effects rule](../../../AGENTS.md) and the [HMR-safety test](../../../packages/AGENTS.md) are standing orders; they are the enforceable floor. These tests are what the paper adds on top.

1. **Does every contribution have an inverse?** A registration without a disposer is unrevertible state — it survives unload and corrupts the next load. This is why the effects rule exists; apply it to anything that mutates shared state, not only to obvious resources.
2. **Does reverting depend on anything outside the component?** A disposer that assumes what other components did, or the order they unloaded in, is not an inverse. [Sequenced teardown belongs in one effect](../../../docs/cordis-primer.md).
3. **Do concurrent writers commute, or are their keys disjoint?** Order-independent revert requires both (Thm 47). Two components writing one key where order changes the result cannot be independently reverted. Give each its own key, or make the writes commute.
4. **Is any dependency mutual?** Two components requiring each other never both activate (§6.5). This is unresolvable, not merely awkward — decompose into a third component both depend on. A lazy or bidirectional escape hatch trades a loud failure for a silent one.
5. **Does the design assume acyclic dependencies?** Progress assumes it (Thm 73). A cycle forfeits the termination guarantee.

## What the framework does not give you

- **Interception is not a sandbox** (§6.3). `Context.intercept` adjusts how a binding is used, not what may run. Untrusted code needs a real isolation boundary — the [`tool-cordis` trust stance](../../../packages/extensions/tool-cordis/README.md) is the worked example.
- **Keys are nominal.** A service key is a name, not a checked contract. Two providers claiming one key with different behavior is undetectable by the framework; [capability seam](../../../docs/glossary.md#capability-seam) conventions manage this, and nothing else does.
- **Restoration is observational, not physical.** Recovery restores what a key's operations can distinguish, not heap identity. Never assume object identity survives a reload.
- **Confluence is lost for failed fibers** (§4.4). Whether an iteration raises depends on the state it meets, so different schedules can leave different fibers failed. A design that treats failure as rare is fine; one that assumes reload determinism *after* a failure is not.

## Reading the implementation against the paper

Two behaviors look like extras but are the paper's model realized, and designing against them is a mistake:

- **`FAILED`** (`vendor/cordis/src/fiber.ts:576`) corresponds to §4.4's Failure extension. A plugin that throws during load is logged, left having installed nothing, and does not propagate to its parent or siblings (`fiber.ts:660-664`) — contain plugin failure, never cascade it. One divergence matters: the paper blocks a failed fiber from re-entering, while Cordis records the error without gating a later reload on it (`_refresh()` never reads `_error`; `update()` clears it). Never rely on a failure being terminal.
- **Resolution tracks provider identity, not presence.** `_refresh()` builds an epoch from each provider's `fiber.uid` (`fiber.ts:611-621`), matching the paper's committed view, which records the *providing fiber* so a provider swap is detected even when the value is equal. Never cache a resolved service across a reload; re-read it from `ctx`.

Where the vendored source genuinely diverges from upstream, the divergences are logged under "Local modifications" in [vendor/README.md](../../../vendor/README.md). Two shape design work:

- **Effects are rejected while `UNLOADING`**, though `PENDING` and `LOADING` remain legal (`fiber.ts:419-422`). Teardown-time registration would escape the unload snapshot. Never write cleanup that registers.
- **Reentrancy is the dominant failure mode.** An unload can begin inside an effect's setup body, so assume disposal can start at any await point. One asynchronous operation gets [one owner and one settlement point](../../../packages/AGENTS.md); concurrent orchestration over the plugin tree must serialize.

## Applying this

1. Find what the change contributes to the tree. A tool, prompt section, MCP server, LLM adapter, event listener, Chat node, or settings card is a registration — test 1 applies whether or not the work feels like lifecycle work. Mechanics: [extension cookbook](../../../docs/cookbook/extension-cookbook.md).
2. Name the dimension at risk: does the change alter what a component *does* to shared state (temporal) or what it *requires* (spatial)?
3. Run the five design tests. A failure is a design defect, not a review nit — name the test and say why the failure is not order-dependent luck.
4. For lifecycle, concurrency, or teardown work, read [defensive patterns](../../../docs/defensive-patterns.md) and assume reentrancy.
5. When editing `vendor/`, follow the sync procedure and log the divergence ([vendor/AGENTS.md](../../../vendor/AGENTS.md)).
6. Record durable decisions as an [Agent Note](../../../.agents/notes/README.md), not in this skill.

## References

Chapter digests and the paper itself are in [references/](references/README.md) — consult one when a test's reasoning matters, not by default. Ch3 covers revertible effects and coeffects, ch4 the calculus and its theorems, ch5 the Cordis implementation, ch6 the limitations.
