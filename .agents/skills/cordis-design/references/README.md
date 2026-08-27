# Cordis paper references

Source material for [the skill](../SKILL.md). Read a chapter when a rule's reasoning matters; the skill itself carries the rules.

`cordis-paper.pdf` is the full paper: "A Programming Paradigm for Spatiotemporal Composability" (Shi, Zhang, Cui), 92 pages. The chapter digests below summarize it; the PDF is here for the figures, proofs, and exact statements the digests condense.

| File | Chapter | Read it for |
|---|---|---|
| [ch1.md](ch1.md) | Introduction | Why restart-based extension fails; the VS Code extension survey |
| [ch2.md](ch2.md) | Preliminaries | Effect and coeffect type judgments |
| [ch3.md](ch3.md) | Revertible Effects and Reactive Coeffects | The core model: inverses, accumulators, activation classification |
| [ch4.md](ch4.md) | A Calculus of Dynamic Composition | Fibers, the reduction rules, and the theorems |
| [ch5.md](ch5.md) | Implementation and Case Study | How Cordis realizes the calculus; the Koishi deployment |
| [ch6.md](ch6.md) | Discussion | The limitations — read before proposing a workaround |
| [ch7.md](ch7.md) | Related Work | How this compares to OSGi, Erlang, React, and module systems |
| [ch8.md](ch8.md) | Conclusion | Future work, including self-evolving agent harnesses |

## Theorems the skill cites

| Theorem | Chapter | Claim |
|---|---|---|
| 7, 16 | [ch3](ch3.md) | Effect composition is revertible; the accumulator restores prior state in LIFO order |
| 43, 47 | [ch3](ch3.md) | Order-independent revert follows from key-disjointness plus per-key commutativity |
| 73 | [ch4](ch4.md) | Progress, assuming acyclic provider precedence and a finite fiber universe |
| 80 | [ch4](ch4.md) | Confluence: a hot-reloaded system equals a clean boot, up to renaming, given acyclicity |

## Sections the skill cites

- **§6.3** — interception-based access control is insufficient for untrusted code
- **§6.5** — mutual dependencies are unresolvable and must be decomposed

## How this maps onto the harness

The digests describe the paper, not this repository. For the concept-to-code mapping — `ctx.effect()` at `vendor/cordis/src/fiber.ts:418`, LIFO revert at `431`, the six-member `FiberState` at `147` — see [the skill](../SKILL.md). For how Cordis is vendored and what diverges from upstream, see [vendor/README.md](../../../../vendor/README.md).
