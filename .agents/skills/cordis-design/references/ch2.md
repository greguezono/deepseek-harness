# 2. Preliminaries

## Summary
This chapter fixes the notation and theoretical vocabulary that the rest of the paper builds on:
effect systems and coeffect systems, the "two theoretical pillars" underlying the work. It assumes
familiarity with basic type theory and category theory and states its goal explicitly: to introduce
the key abstractions that Section 3 will later "operationalize as runtime mechanisms." Section 2.1
traces effects from Lucassen and Gifford's kinded type system through Moggi's monadic
categorical semantics, Wadler's popularization in Haskell, and Plotkin and Power's algebraic
effects, to Plotkin and Pretnar's effect handlers, giving the judgment form Γ ⊢ 𝑡 : 𝑇^effect, the
monad triple (𝑇, 𝜂, 𝜇), and the `handle e with {op(v,κ) ↦ …}` handler syntax. Section 2.2 develops
the dual notion, coeffects, from Uustalu and Vene's comonadic account of context-dependent
computation through Petricek et al.'s coeffects-as-static-analysis framework to Gaboardi et al.'s
graded coeffect/effect unification, giving the judgment form Γ^coeffect ⊢ 𝑡 : 𝑇, the comonad triple
(𝐷, 𝜀, 𝛿), and the graded pre-ordered semiring 𝒮 = (𝑆, ≤, +, ×, 0, 1). Section 2.3 then draws the
chapter's key structural analogy: effects (a computation's impact on its environment) map onto
temporal composability (revertible modification), while coeffects (the environment's constraints
on a computation) map onto spatial composability (declared, reactively managed dependency).
The chapter's central claim, and the pivot into the rest of the paper, is that classical effect and
coeffect systems are inherently static — tied to lexically fixed scopes and compile-time contexts —
and therefore cannot directly serve components that "arrive and depart at runtime" against
contexts that "evolve continuously." This motivates the paper's core methodological move: reifying
effects and coeffects as runtime-manipulable structures rather than extending static type-system
annotations, so a runtime can establish dynamically the guarantees these systems traditionally
provide only statically.

## Section-by-Section

### 2.1. Effects
- The chapter starts from the simply typed lambda calculus (STLC) [20, 21] and its ordinary typing judgment Γ ⊢ 𝑡 : 𝑇, then defines an effect system as refining the result type with an effect-algebra annotation, giving the judgment form Γ ⊢ 𝑡 : 𝑇^effect (labeled equation 1 in the text).
- This approach "originates with Lucassen and Gifford [22]," who introduced a kinded type system that distinguishes types, effects, and regions in order to discover scheduling constraints in parallel programs.
- Under "Monadic effects," Moggi [16] is credited as the first to model computational effects categorically via monads, and Wadler [23] is credited with popularizing that approach in Haskell.
- A monad is defined as a triple (𝑇, 𝜂, 𝜇) on a category 𝒞, where 𝑇(𝐴) is the type of an effectful computation producing an 𝐴, 𝜂 : 𝐴 → 𝑇(𝐴) lifts a pure value into the monad, and 𝜇 : 𝑇(𝑇(𝐴)) → 𝑇(𝐴) sequences (flattens) nested computations; the chapter names the Maybe monad (partiality), the State monad (mutable state), and the IO monad (external interaction) as classic instances.
- Under "Algebraic effects," Plotkin and Power [17, 24] are credited with showing that algebraic operations determine monads, decoupling an effect's interface from its implementation via an effect signature Σ that declares operations such as `get : () → 𝑆` and `put : 𝑆 → ()` for state, which programs may invoke without committing to a particular interpretation.
- Plotkin and Pretnar [25] are credited with subsequently introducing effect handlers, written `handle e with { op(v, κ) ↦ … }` (equation 2), in which the handler receives the operation's argument 𝑣 and a delimited continuation 𝜅 that it may invoke zero, one, or multiple times, which the chapter says enables exceptions, coroutines, and non-determinism "within a uniform framework [26]."
- The chapter cites Koka [27, 28], Eff [29], and OCaml 5 [30] as languages that have adopted algebraic effects "with varying design trade-offs," situating effect handlers as a real, implemented language feature rather than a purely theoretical device.

### 2.2. Coeffects
- The chapter introduces coeffect systems [18, 31] as the dual construction to effects: instead of annotating the type, a coeffect system annotates the context, giving the judgment form Γ^coeffect ⊢ 𝑡 : 𝑇 (equation 3).
- The coeffect algebra element attached to the context describes "what the computation requires from its environment, such as resources to access, permissions to hold, or services to depend on."
- The chapter states the effect/coeffect duality directly: "effects model a program's impact on the world" while "coeffects model the world's constraints on the program."
- Under "Comonadic coeffects," Uustalu and Vene [32] are credited as first developing the idea of using comonads to structure context-dependent computation, proposing symmetric (semi)monoidal comonads as the dual of Moggi's monadic framework for effects, capturing notions such as dataflow and attribute evaluation.
- Petricek et al. [18] are credited with building on that foundation to propose coeffects as a unified static analysis of context-dependence.
- A comonad is defined as a triple (𝐷, 𝜀, 𝛿), where 𝜀 : 𝐷(𝐴) → 𝐴 extracts the current value from a context and 𝛿 : 𝐷(𝐴) → 𝐷(𝐷(𝐴)) duplicates the context for nested access; the chapter gives two named instances: the Environment comonad 𝐷(𝑋) = 𝐸 × 𝑋 (dependence on a fixed environment 𝐸) and the Stream comonad 𝐷(𝑋) = ℕ → 𝑋 (dependence on temporal data).
- Under "Graded coeffects," the chapter introduces graded coeffect systems that use a pre-ordered semiring 𝒮 = (𝑆, ≤, +, ×, 0, 1) as the coeffect algebra [33] "for finer-grained tracking," with elements of 𝑆 annotating each variable binding to quantify its usage: 0 for unused, 1 for linear use, 𝑛 for bounded use, and ∞ for unrestricted use.
- Gaboardi et al. [19] are credited with later unifying this graded-coeffect discipline with graded effects; the semiring's × operator composes coeffects sequentially and its + operator composes them in parallel, and the chapter states this framework enables precise resource tracking, sensitivity analysis [34], and information-flow control [35, 36] "within a unified algebraic framework [37]."

### 2.3. Relationship to Dynamic Composability
- The chapter states that effects and coeffects "organize reasoning about computation along two complementary directions": effects describe how a computation modifies its environment, while coeffects describe how it depends on its environment.
- These two directions are mapped directly onto "the two dimensions of dynamic composability identified in Section 1": temporal composability and spatial composability.
- Temporal composability is defined as requiring that a component's modifications to the shared environment "be revertible upon unloading," and the chapter identifies the relevant effects as the stateful ones that durably transform the environment, noting that undoing such a transformation "requires it to admit an inverse."
- Spatial composability is defined as requiring that inter-component dependencies "be declared and managed reactively," and the chapter identifies coeffects as exactly what capture such dependencies, with management amounting to "resolving each against what the environment supplies."
- The chapter's central limitation claim: "classical effect and coeffect systems are static instruments" — effects are tracked within lexically fixed scopes and discharged by compile-time handlers, and coeffect annotations are verified against contexts determined before execution.
- It argues dynamic composition breaks both static assumptions, because it "requires these guarantees to hold for components that arrive and depart at runtime, against contexts that evolve continuously"; concretely, "no fixed lexical scope can delimit a plugin loaded after deployment" and "no compile-time context can anticipate dependencies that emerge from runtime configuration."
- This motivates the paper's stated pivot: rather than extending static type systems with more annotations, the authors "reify the conceptual structures of effects and coeffects so that a runtime can operate on them directly," establishing dynamically the guarantees these systems provide statically — this is the explicit bridge from Chapter 2's theory to Chapter 3's runtime mechanisms.

## Terminology

| Term | Notation | Definition |
|---|---|---|
| Effect system | Γ ⊢ 𝑡 : 𝑇^effect | A type system refinement that annotates a term's result type with an element of an effect algebra describing which side effects the computation may produce, enabling compositional reasoning about stateful computations. |
| Coeffect system | Γ^coeffect ⊢ 𝑡 : 𝑇 | The dual of an effect system: it annotates the typing context rather than the type, with an element of a coeffect algebra describing what the computation requires from its environment (resources, permissions, services). |
| Monad | (𝑇, 𝜂, 𝜇) | A categorical structure encapsulating an effectful computation as a value of type 𝑇(𝐴); 𝜂 : 𝐴 → 𝑇(𝐴) lifts pure values, 𝜇 : 𝑇(𝑇(𝐴)) → 𝑇(𝐴) sequences nested computations. Classic instances are Maybe, State, and IO. |
| Comonad | (𝐷, 𝜀, 𝛿) | The dual categorical structure to a monad, capturing context-dependent computation; 𝜀 : 𝐷(𝐴) → 𝐴 extracts the current value from a context, and 𝛿 : 𝐷(𝐴) → 𝐷(𝐷(𝐴)) duplicates context for nested access. |
| Environment comonad | 𝐷(𝑋) = 𝐸 × 𝑋 | A comonad instance modeling dependence on a fixed environment 𝐸. |
| Stream comonad | 𝐷(𝑋) = ℕ → 𝑋 | A comonad instance modeling dependence on temporal (time-indexed) data. |
| Effect signature | Σ | A declaration of a set of algebraic operations (e.g., `get : () → 𝑆`, `put : 𝑆 → ()` for state) that a program may invoke freely without committing to a particular interpretation, per Plotkin and Power's algebraic-effects framework. |
| Effect handler | `handle e with { op(v, κ) ↦ … }` | A construct, introduced by Plotkin and Pretnar, that interprets an effect signature's operations via continuation semantics: the handler receives the operation argument 𝑣 and delimited continuation 𝜅, and may invoke 𝜅 zero, one, or multiple times, enabling exceptions, coroutines, and non-determinism. |
| Delimited continuation | 𝜅 | The continuation passed to an effect handler representing "the rest of the computation" after the operation call; the handler controls how many times, if at all, it is invoked. |
| Graded coeffect algebra / semiring | 𝒮 = (𝑆, ≤, +, ×, 0, 1) | A pre-ordered semiring used as the coeffect algebra for finer-grained usage tracking; elements of 𝑆 annotate variable bindings (0 = unused, 1 = linear use, 𝑛 = bounded use, ∞ = unrestricted use), with × composing coeffects sequentially and + composing them in parallel. |
| Kinded type system (types/effects/regions) | — | Lucassen and Gifford's type system distinguishing types, effects, and regions, originally used to discover scheduling constraints in parallel programs; the historical origin of effect systems. |
| Temporal composability | — | The dynamic-composability dimension (from Section 1) requiring that a component's modifications to the shared environment be revertible upon unloading; mapped in this chapter onto stateful effects, which must admit an inverse. |
| Spatial composability | — | The dynamic-composability dimension (from Section 1) requiring that inter-component dependencies be declared and managed reactively; mapped in this chapter onto coeffects, whose management is resolving each dependency against what the environment currently supplies. |
| Reification (of effects/coeffects) | — | The paper's proposed methodological shift: instead of extending static type systems with more compile-time annotations, encode the conceptual structures of effects and coeffects so a runtime can operate on them directly and establish their guarantees dynamically. |
| Sensitivity analysis | — | A use case cited [34] for graded coeffect systems, made possible by the semiring's usage-quantity tracking. |
| Information-flow control | — | A use case cited [35, 36] for graded coeffect systems, made possible by the semiring's usage-quantity tracking. |

## Relevance to an Agent Harness
- The chapter's core theoretical vocabulary maps directly onto plugin lifecycle mechanics: effects (with their required inverse) are the natural model for anything a harness component does to shared state — writing config, registering a route, opening a connection — that must be undone cleanly on unload or hot-swap.
- Coeffects (resources, permissions, services required from the environment) are the natural model for a plugin's declared dependencies, and the chapter frames "managing them" as continuously resolving each dependency against what the environment currently supplies — i.e., reactive dependency injection rather than one-shot wiring at startup.
- The chapter's central diagnosis — that classical effect/coeffect systems are static, tied to lexically fixed scopes and compile-time-determined contexts — is a direct explanation of why ordinary statically typed effect/DI systems cannot describe a harness where plugins load and unload at runtime; the paper explicitly cites "a plugin loaded after deployment" as the case no fixed lexical scope can delimit.
- The proposed fix (reifying effects and coeffects as runtime-manipulable structures rather than as compile-time type annotations) is effectively a design mandate for any plugin/module system in an agent harness: represent effect-inverses and coeffect requirements as first-class runtime values the loader can inspect, not just static type-checked guarantees that vanish after compilation.
- The graded coeffect semiring's usage levels (0 = unused, 1 = linear, 𝑛 = bounded, ∞ = unrestricted) suggest a concrete vocabulary a harness could reuse for describing how strictly a plugin's declared dependency must be satisfied (e.g., exactly-once resource claims vs. shareable/unrestricted services).
- Effect handlers' "invoke the continuation zero, one, or multiple times" semantics is a reusable abstraction for harness-level interception points (e.g., a plugin manager intercepting a component's request to mutate shared context and deciding whether/how many times to let it proceed).

## Open Questions and Limitations
- The chapter explicitly limits its own scope to background: it states its purpose is only "to fix notation and introduce the key abstractions that Section 3 will operationalize as runtime mechanisms," so no runtime design, proof, or implementation appears in this chapter — it is a survey of prior theory, not new results.
- The chapter assumes reader "familiarity with basic type theory and category theory" and does not itself define STLC, categories, or the general notion of a typing judgment, referring to [20, 21] for STLC rather than reproducing it.
- The chapter names the static/dynamic gap as the paper's motivating problem but does not resolve it here: it states plainly that "no fixed lexical scope can delimit a plugin loaded after deployment" and "no compile-time context can anticipate dependencies that emerge from runtime configuration," but defers the actual reification mechanism to later sections.
- The relationship asserted between effects/temporal-composability and coeffects/spatial-composability is presented as a structural analogy and motivating mapping, not as a formal theorem in this chapter — no proof is given here that reified effects/coeffects actually deliver the stated dynamic guarantees; that is left to subsequent chapters.
- Several cited concepts (e.g., algebraic effects' "uniform framework" for exceptions/coroutines/non-determinism, or the graded semiring's use in sensitivity analysis and information-flow control) are attributed to citations ([26], [34], [35, 36], [37]) without further elaboration in this chapter's text, so their precise technical content is deferred to the cited external works rather than explained here.
