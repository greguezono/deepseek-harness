# 1. Introduction

## Summary
This chapter sets up the paper's entire problem statement before any formalism appears. It opens
by observing that software composition has traditionally been static — function calls, module
imports, and class inheritance are all resolved at compile time and fixed for the life of the program —
but that modern software (plugin architectures and self-evolving agent harnesses) increasingly
needs *dynamic* composition, where components are loaded, unloaded, and reconfigured while the
system runs. The chapter's key theoretical move is to split "dynamic composability" into two
orthogonal dimensions: **temporal composability** (can a component's effects on the environment be
completely and safely reverted when it is removed?) and **spatial composability** (can components
declare, discover, and resolve dependencies on one another in a structured, verifiable way, as those
dependencies change at runtime?). It grounds both dimensions in concrete evidence rather than
abstraction: a detailed case study of VSCode's extension host shows both a temporal limitation (no
live unload; full-process restart required for the majority of extensions) and a spatial limitation
(the `extensionDependencies` mechanism exists but is barely used and offers no typed contract), and a
shorter discussion extends the same two limitations to self-evolving agent harnesses, where an AI
agent modifies its own components continuously and largely without human oversight. The chapter
then explains why this problem has gone under-theorized: operating systems and container
orchestrators already provide a coarse-grained substitute (process restarts for temporal recovery,
service-level orchestration for spatial dependencies), and most software just tolerates the resulting
costs. Section 1.3 closes the chapter by enumerating the paper's five contributions, each pointing to
the section where it is formalized, which together set up the rest of the paper's structure: revertible
effects, reactive coeffects, the context paradigm, the calculus of dynamic composition, and the
Cordis implementation.

## Section-by-Section

### 1. Introduction (opening paragraph)
- The chapter opens by naming composition — "assembling complex systems from simpler parts" — as a foundational principle of software engineering, citing reference [1].
- It contrasts static composition (function calls, module imports, class inheritance, all resolved at compile time and fixed through execution) with the growing demand for dynamic composition, where components are loaded, unloaded, and reconfigured at runtime.
- It names plugin architectures [2] and self-evolving agent harnesses as the two motivating classes of systems that both require safely adding and removing functionality on the fly.
- It states that current practice instead defers to coarse-grained mechanisms [3] that can only reconfigure by restarting, which discards runtime state — this is the "workaround" the chapter later critiques in Section 1.2.3.
- The paragraph's closing claim, which motivates the whole paper, is that dynamic composition's theoretical foundations "remain underdeveloped" compared to the rich formal frameworks that already exist for static composition.

### 1.1. Dimensions of Composability
- The chapter identifies two orthogonal dimensions of dynamic composition that go beyond the already well-studied algebraic aspects of composition.
- **Temporal composability** is defined as addressing the time dimension: upon removal of a component, the modifications it made to the shared environment "must be completely and safely reversed," which requires tracking every resource allocation, event registration, and state mutation the component performs and guaranteeing their orderly reclamation on removal.
- **Spatial composability** is defined as addressing the space dimension: components must be able to "declare, discover, and resolve their dependencies on one another in a structured and verifiable manner," which requires managing dependency topology and coordinating component lifecycles as dependencies change.
- In the static setting, the chapter notes, temporal composability reduces to lexical scoping mechanisms such as RAII [4] and bracket patterns [5], and spatial composability reduces to module import resolution [6] — i.e., both problems are already "solved" for programs that never change shape at runtime.
- In the dynamic setting, both dimensions become "significantly harder": temporal composability must handle long-lived, stateful effects whose scope is not lexically bounded, and spatial composability must handle dependencies that appear, disappear, or change identity during execution.
- This subsection establishes the vocabulary (temporal vs. spatial composability) that structures the rest of the paper, including the eventual "revertible effects" (temporal) and "reactive coeffects" (spatial) mechanisms introduced in Chapter 3.

### 1.2. Motivating Examples
- This subsection header introduces two concrete motivating cases — plugin systems (1.2.1) and self-evolving agent harnesses (1.2.2) — followed by a diagnosis of why the underlying problem persists uncorrected (1.2.3, "The Coarse-Grained Workaround").
- The chapter uses these examples to argue that the temporal/spatial split from Section 1.1 is not merely theoretical but shows up as observable, measurable limitations in real, widely deployed systems.

### 1.2.1. Plugin Systems
- Plugin systems are presented as "a canonical instance of dynamic composition," with Visual Studio Code (VSCode) chosen as the representative example because it is "one of the most widely-used extensible IDEs."
- **Temporal limitation:** VSCode runs all extensions in a single shared process, the "extension host," which provides no mechanism to unload an individual extension's code at runtime once its `activate` function has executed — disabling or uninstalling that extension requires restarting the entire host, affecting every other loaded extension.
- The chapter notes an exception: purely declarative extensions (themes, keybindings, snippets) carry no code and can be removed freely, but among the top 100 extensions by install count, **87 contain executable code** and therefore require a full host restart to remove (data retrieved from the Visual Studio Code Marketplace on **June 9, 2026**).
- It further critiques VSCode's `deactivate` hook as only "a graceful shutdown callback during the host process' termination" rather than a live-removal mechanism, and observes that separating effect disposal (`deactivate`) from effect creation (`activate`) "violat[es] locality of concern and mak[es] complete cleanup difficult to verify."
- **Spatial limitation:** VSCode does offer `extensionDependencies` for declaring dependencies between extensions, but among the same top-100-by-install-count set, only **7 declare `extensionDependencies` on non-built-in extensions** — the chapter attributes this scarcity to the extension API's shape, which exposes fixed, surface-level extension points (commands, views, language features) that extensions contribute to rather than depend on each other through.
- It also notes that VSCode's inter-extension interaction mechanism, `vscode.extensions.getExtension(...).exports`, provides no structural contract because the returned value is untyped (`any` by default), so a dependent extension "cannot rely on a checked interface."
- The chapter states these two limitations "are not unique to VSCode; they recur across plugin systems generally [2, 7], differing only in degree" — VSCode is offered as a representative case, not a special one.

### 1.2.2. Self-Evolving Agent Harnesses
- The chapter identifies modern AI agents as relying on runtime agent harnesses [8–10] that may "compose diverse tool suites [11] and execution environments, govern permissions and sandboxing, maintain session state and persistence, provide context management and memory systems [12], orchestrate subagents and multi-agent workflows [13], and expose interfaces to users and automation."
- It frames a forward-looking scenario: "a future harness may generate and deploy modifications to its own components while continuously serving requests," and notes that model-synthesized reusable tools [14] are already "a narrower precursor to component-level self-modification" — each such modification is itself an instance of dynamic composition.
- Because such modifications occur continuously and with "limited or no human oversight," the chapter argues dynamic composability becomes indispensable rather than merely convenient in this setting.
- Without temporal composability, each self-modification would force a full restart that discards all process-local accumulated state; at high modification frequency the cumulative unavailability becomes substantial, in-flight tasks are disrupted repeatedly, and — worse — a faulty self-modification could disable the very process needed to recover from it.
- Without spatial composability, each module would have to detect and adapt to changes in the modules it depends on by ad hoc means as they appear, disappear, or change identity; worse, a naive code-replacement strategy could silently break dependents or introduce circular dependencies that surface only at reload time.
- This subsection is the paper's most direct statement of why an autonomous, self-modifying agent harness (the category DSH belongs to) needs the formal guarantees the rest of the paper develops, and it is the passage Chapter 8 explicitly cross-references when proposing self-evolving harnesses as future validation.

### 1.2.3. The Coarse-Grained Workaround
- The chapter argues that dynamic composability has received limited formal attention because operating systems and container orchestrators already supply a coarse-grained substitute: operating systems yield temporal composability at the granularity of a process, and container orchestrators [3] yield spatial composability at the granularity of a service.
- In practice, most software tolerates the lack of fine-grained composability by deferring to these mechanisms: "a misbehaving module is handled by restarting the process, and a service dependency is managed by the container orchestrator."
- The chapter states this workaround "imposes substantial costs." Temporally, each restart discards all process-local accumulated state (caches, connections, partial computations), and rebuilding it "takes seconds to minutes [15]"; maintaining availability in the interim requires redundant replicas, which incurs resource overhead purely to compensate for the inability to recover a single component.
- Spatially, container-level orchestration cannot express dependencies between components that share an address space, and it introduces network overhead for interactions that could otherwise be local function calls.
- The chapter's diagnosis is that both mechanisms "operate at the boundary of processes and containers, yet modern systems increasingly compose at a finer level" — this granularity mismatch is what the chapter says "demands a compositional abstraction that manages effects and dependencies at the same level as the components themselves," directly motivating the paper's approach.

### 1.3. Contributions
- The chapter frames the two composability dimensions as corresponding respectively to how computations modify their environment and how they depend on it, which it identifies as exactly what effect systems [16, 17] and coeffect systems [18, 19] already formalize in the static setting.
- It states the core limitation of existing effect/coeffect theory: "existing formulations restrict reasoning to compile-time analysis over lexically fixed scopes, and do not extend to dynamic scenarios where components arrive and depart at runtime" — this is the gap the paper's approach ("lifting effects to a revertible runtime model and coeffects to a reactive dependency resolution mechanism") is designed to close, yielding a unified formal foundation the chapter describes as "language-agnostic and applicable to any software architecture requiring dynamic composition."
- **Contribution 1 — Revertible effects (Section 3.1):** every context transformation carries an explicit inverse held by the runtime; both tracking and recovery preserve composition, so the context is recovered upon component removal; this establishes local temporal composability.
- **Contribution 2 — Reactive coeffects (Section 3.2):** a component declares the coeffects it requires as a specification, and every context change is classified against that specification as activating, deactivating, or neutral, driving the component's own activation and deactivation; this establishes local spatial composability.
- **Contribution 3 — The context paradigm (Section 3.3):** the effect context and the coeffect context are unified into a single context type, every effect and coeffect is mediated through it, and this mediation induces an observational equivalence up to which the effects of distinct components attain independence.
- **Contribution 4 — A calculus of dynamic composition (Section 4):** combines the two mechanisms into the notion of a component and gives them an operational semantics; its metatheory carries spatiotemporal composability from a single component to a whole system of interleaved components.
- **Contribution 5 — Cordis (Section 5):** a meta-framework of spatiotemporal composability providing a core library that realizes the formal model with effect tracking and coeffect resolution, plus a declarative component loader with configuration reconciliation and hot module replacement.
- The chapter lists exactly five numbered contributions (not more); each is paired with the section number where the paper develops it, which functions as a roadmap for the remaining chapters.

## Terminology

| Term | Notation | Definition |
|---|---|---|
| Composition | — | The foundational software-engineering principle of assembling complex systems from simpler parts, historically resolved statically (function calls, module imports, class inheritance) at compile time. |
| Dynamic composition | — | Composition where components are loaded, unloaded, and reconfigured at runtime rather than fixed at compile time, exemplified by plugin architectures and self-evolving agent harnesses. |
| Temporal composability | — | The property that, upon removal of a component, the modifications it made to the shared environment can be completely and safely reversed, requiring tracked reclamation of every resource allocation, event registration, and state mutation. |
| Spatial composability | — | The property that components can declare, discover, and resolve dependencies on one another in a structured, verifiable manner, requiring management of dependency topology and lifecycle coordination as dependencies change. |
| Lexical scoping (RAII, bracket patterns) | — | The static-setting mechanism to which temporal composability reduces when scope is lexically bounded at compile time; cited examples are RAII [4] and bracket patterns [5]. |
| Module import resolution | — | The static-setting mechanism to which spatial composability reduces when dependencies are fixed at compile time [6]. |
| Extension host | — | VSCode's shared process in which all extensions run; it provides no mechanism to unload an individual extension's code at runtime once activated. |
| `activate` / `deactivate` (VSCode) | — | The VSCode extension lifecycle hooks; `activate` runs an extension's setup code, while `deactivate` is only a graceful shutdown callback fired during host termination, not a live-removal mechanism, and its separation from `activate` violates locality of concern. |
| `extensionDependencies` | — | VSCode's declarative mechanism for one extension to depend on another; used by only 7 of the top 100 extensions (by install count) for non-built-in extensions, reflecting the extension API's bias toward fixed, surface-level extension points over inter-extension dependency. |
| `vscode.extensions.getExtension(...).exports` | — | VSCode's mechanism for one extension to access another's exported functionality; the returned value is untyped (`any` by default), so it provides no checked structural contract for dependents. |
| Agent harness | — | The runtime system an AI agent relies on that may compose tool suites and execution environments, govern permissions and sandboxing, maintain session state and persistence, provide context/memory systems, orchestrate subagents, and expose user/automation interfaces [8–13]. |
| Self-evolving agent harness | — | A harness that generates and deploys modifications to its own components while continuously serving requests, with limited or no human oversight; each self-modification is an instance of dynamic composition. |
| Model-synthesized reusable tools | — | A cited precursor phenomenon [14] to full component-level self-modification, in which a model generates reusable tools narrower in scope than modifying the harness's own components. |
| Coarse-grained workaround | — | The paper's name for the status-quo substitute for fine-grained dynamic composability: operating-system process restarts for temporal recovery and container-orchestrator service management for spatial dependency handling. |
| Container orchestrator | — | Cited [3] infrastructure that provides spatial composability at the granularity of a service, but cannot express dependencies between components sharing an address space and introduces network overhead for what could be local calls. |
| Granularity mismatch | — | The chapter's diagnosis that OS processes and container orchestrators operate at the process/container boundary while modern systems increasingly compose at a finer (sub-process) level, motivating a compositional abstraction at the component level. |
| Effect systems | — | Existing static-analysis formalisms [16, 17] providing "the formal vocabulary for reasoning about environmental modifications," restricted in prior work to compile-time analysis over lexically fixed scopes. |
| Coeffect systems | — | Existing static-analysis formalisms [18, 19] providing the formal vocabulary "for reasoning about environmental requirements," likewise restricted in prior work to compile-time, lexically fixed scopes. |
| Revertible effects | — | This paper's Contribution 1 (Section 3.1): every context transformation carries an explicit runtime-held inverse, with both tracking and recovery preserving composition, establishing local temporal composability. |
| Reactive coeffects | — | This paper's Contribution 2 (Section 3.2): a component's declared coeffect specification classifies every context change as activating, deactivating, or neutral, driving the component's activation/deactivation and establishing local spatial composability. |
| Context paradigm | — | This paper's Contribution 3 (Section 3.3): the discipline of unifying the effect context and coeffect context into a single context type and mediating every effect/coeffect through it, inducing an observational equivalence for effect independence. |
| Calculus of dynamic composition | — | This paper's Contribution 4 (Section 4): a formal system combining revertible effects and reactive coeffects into the notion of a component with an operational semantics, whose metatheory extends composability from one component to a whole interleaved system. |
| Cordis | — | This paper's Contribution 5 (Section 5): the meta-framework of spatiotemporal composability implementing the theory, comprising a core library (effect tracking, coeffect resolution) and a declarative component loader (configuration reconciliation, hot module replacement). |

## Relevance to an Agent Harness
- The chapter's Section 1.2.2 is the paper's most explicit statement that self-evolving agent harnesses — systems like DSH that generate and deploy modifications to their own components while continuously serving requests — are a primary intended application of the theory, not an afterthought.
- The VSCode case study is a direct cautionary template for plugin/extension-style harness design: a shared host process without per-component unload forces a full restart on almost any code-carrying extension (87 of the top 100 by install count), which is exactly the failure mode a harness with hot module replacement must avoid.
- The critique of VSCode's `deactivate` hook — that separating effect disposal from effect creation "violat[es] locality of concern and mak[es] complete cleanup difficult to verify" — implies a concrete design rule: an agent harness's unload/teardown logic should be co-located with (or systematically derived from) the same declaration that creates the effect, not hand-written as a separate callback.
- The critique of `extensionDependencies`'s low adoption and of untyped `exports` implies that a harness's dependency-injection or plugin-interconnection mechanism should offer a structured, checked contract rather than an ad hoc, optional, untyped one, or dependency declarations will simply go unused as they do in VSCode.
- Section 1.2.2's enumerated failure modes without temporal/spatial composability — cumulative unavailability from repeated restarts, in-flight task disruption, a faulty self-modification disabling its own recovery path, silent breakage of dependents, and circular dependencies surfacing only at reload — are a direct checklist of risks an agent harness's plugin-loading and dependency-resolution logic must specifically test against.
- The coarse-grained workaround's costs (redundant replicas to mask restart-induced unavailability; network overhead from container-level orchestration of in-process dependencies) suggest that any harness aiming for fine-grained hot-swapping should manage effects and dependencies "at the same level as the components themselves" rather than falling back to process- or container-level isolation for convenience.

## Open Questions and Limitations
- The chapter does not explain how it selected "the top 100 extensions by install count" as its VSCode sample (e.g., snapshot methodology, whether install count was deduplicated across platforms), beyond stating the data was "retrieved from the Visual Studio Code Marketplace on June 9, 2026."
- The claim that VSCode's two limitations "recur across plugin systems generally [2, 7], differing only in degree" is asserted via citation rather than demonstrated with comparable statistics for other plugin ecosystems within this chapter.
- The self-evolving agent harness discussion (Section 1.2.2) is framed prospectively ("a future harness may generate and deploy modifications to its own components") and cites only a narrower existing precursor (model-synthesized reusable tools [14]); the chapter does not claim any existing system already performs full autonomous component-level self-modification.
- The chapter asserts that dynamic composition's "theoretical foundations remain underdeveloped" but defers the actual formal treatment of effects, coeffects, and the underlying gap in existing effect/coeffect systems to later chapters (2 and 3), so no proof or formal model appears in Chapter 1 itself.
- The five enumerated contributions are stated as claims with section pointers but are not substantiated here; Chapter 1 explicitly defers all definitions, formal machinery, and metatheoretic results to Sections 3, 4, and 5.
