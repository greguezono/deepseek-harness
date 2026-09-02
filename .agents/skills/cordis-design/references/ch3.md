# 3. Revertible Effects and Reactive Coeffects

## Summary

This chapter lifts the static effect/coeffect typing contexts of Section 2 into runtime
mechanisms, turning contexts into first-class, runtime-operable "context types." It builds the
mathematical machinery that lets components be loaded and unloaded at runtime without
corrupting a shared environment, and lets components declare and receive dependencies that
appear and disappear dynamically. Section 3.1 models an effect as a context transformation
paired with an explicit inverse the runtime holds, so that undoing a sequence of effects — the
essential operation behind unloading a component — becomes a structural guarantee rather than
a discipline the programmer must remember to uphold. Section 3.2 models a coeffect as a declared
dependency specification against which every context change is classified (activating,
deactivating, or neutral), giving components a principled way to react to the arrival and
withdrawal of the things they depend on. Section 3.3 unifies effect and coeffect contexts into
one recursive context type, Γ∞, establishes the "context paradigm" (every interaction between a
component and its environment passes through this one entity), and defines an observational
equivalence ≃ up to which every earlier equality must be re-read, since physical states (heap
layout, generative names) cannot literally be restored. Section 3.4 proves that if two
components' effects are pairwise independent (their transformations commute) and their coeffects
are commutative at shared keys, then their effects can be interleaved and reverted in any order
without disturbing each other. Together these four sections deliver local temporal composability
(safe load/unload of one component in isolation) and local spatial composability (safe dependency
activation/deactivation), and supply exactly the condition — independence — needed to raise both
local guarantees to a system of many interleaved components, which Chapter 4 exploits for the
runtime's operational semantics.

## Section-by-Section

### 3.1. Revertible Effects

- Temporal composability is defined as the ability to load and unload components at runtime such
  that unloading recovers the shared environment to its pre-composition state, which requires
  every modification to be both trackable and recoverable.
- An effect is modeled as a function of type `Γ → Γ × (Γ → Γ)`: applied to the current context it
  yields the modified context together with an explicit inverse; effects that supply this inverse
  are called revertible.
- Composing these inverses during execution is what turns local temporal composability into a
  structural (rather than merely disciplined) guarantee.

### 3.1.1. Effect Context

- Any impure function `f : X ⇝ Y` is transformed into a pure form `f : Γ × X → Γ × Y`, and for
  fixed input `x`, the induced map `γ ↦ pr1(f(γ, x))` captures the side effect of `f` on the
  context type `Γ` independently of the return value.
- Effects on `Γ` live in the monoid of transformations `Γ → Γ` under composition `∘`; closure,
  associativity, and the identity `idΓ` each have a direct operational reading (sequencing effects
  stays an effect, bracketing does not matter, and `idΓ` is the no-op effect).
- **Definition 1** defines the twisted composition `(f1, g1) ∘ (f2, g2) := (f1 ∘ f2, g2 ∘ g1)` on
  pairs of transformations, where forward maps compose in the usual order but inverses accumulate
  in the opposite order; this makes `(Γ → Γ) × (Γ → Γ)` a monoid called the twisted composition
  monoid `𝔗Γ`.
- **Definition 2** defines the effect context `∂Γ := Γ × (Γ → Γ)` as a pair `(γ, φ)` of the current
  state and an accumulator `φ`, the composite of inverses applied so far, which recovers the
  initial state; iterating `∂` yields the tower `Γ, ∂Γ, ∂²Γ, ...`.
- **Definition 3 / Theorem 4**: `trackΓ(f, g) = (γ, φ) ↦ (f(γ), φ ∘ g)` transforms `∂Γ` by applying
  `f` to the state and composing candidate inverse `g` onto the accumulator; Theorem 4 proves
  tracking leaves the forward behavior untouched (`pr1 ∘ f' = f ∘ pr1`).
- **Theorem 5** proves `trackΓ` is a monoid homomorphism from `𝔗Γ` into `∂Γ → ∂Γ`, so tracking a
  sequence of pairs one at a time agrees with tracking their twisted composite at once.
- **Definition 6 / Theorem 7**: `recoverΓ(γ, φ) = (φ(γ), idΓ)` applies the accumulator and resets
  it to identity; Theorem 7 proves that for any pair `(f, g)` with `g(f(γ)) = γ`,
  `recoverΓ(trackΓ(f, g)(γ, φ)) = recoverΓ(γ, φ)` — a correctly-inverted tracked effect does not
  move the recovery result. `φ(γ) = γ0` is named the **soundness invariant** of a state in `∂Γ`.
- **Theorem 16** (stated in 3.1.3 but proved from 3.1.1–3.1.2 machinery) shows that reverting a
  sequence of effects in the reverse order of application requires nothing further: each inverse
  meets exactly the state its own application produced, so every intermediate state satisfies the
  soundness invariant.

### 3.1.2. Effect Functions

- The track/recover model has two limitations: (1) `trackΓ(f, g)` fixes `g` before any state is
  seen, forcing one uniform inverse to work at every state, when reverting really needs only a
  per-state inverse; (2) `recoverΓ` is all-or-nothing and cannot selectively undo one effect while
  retaining others.
- **Definition 8** fixes both by defining the effect function type `𝔈Γ := Γ → Γ × (Γ → Γ)` (an
  inverse is returned at the point of application) and the witnessed effect function `𝔈*Γ`, which
  additionally carries a proof that for every `γ`, if `e(γ) = (δ, g)` then `g(δ) = γ` — the inverse
  need only revert the one state where it was produced.
- **Definition 9** defines effect composition `f ⋄ g` on `𝔈Γ`, sequencing two effect functions and
  composing their yielded inverses in the corresponding twisted order.
- **Theorem 10**: `(𝔈Γ, ⋄)` is a monoid with unit `ηΓ = γ ↦ (γ, idΓ)`, and the assignment
  `(f, g) ↦ γ ↦ (f(γ), g)` is a monoid homomorphism from `𝔗Γ` into `𝔈Γ`.
- **Theorem 11**: witnessing (membership in `𝔈*Γ`) is preserved by `⋄` (i.e. `𝔈*Γ` is a submonoid
  of `𝔈Γ`), and any pair `(f, g)` with a genuine two-sided-style inverse `g ∘ f = idΓ` maps into
  `𝔈*Γ` under the homomorphism.
- **Definition 12** lifts an effect function to the effect-context level: `effectΓ : 𝔈Γ → ∂Γ →
  ∂²Γ`, applying `e` to the state, composing its inverse onto the accumulator, and returning as
  the new inverse a `trackΓ` built from swapping the effect's own directions (undoing is itself an
  effect, and undoing that is performing the effect again).
- **Theorem 13** proves `effectΓ` preserves `⋄`; **Theorem 14** proves `effectΓ`'s forward map and
  inverse each project down correctly to the level-one maps (a commuting-square condition);
  **Theorem 15** computes exactly what the lifted inverse recovers, showing the accumulator is
  fully restored (i.e. `effectΓ(e) ∈ 𝔈*∂Γ`) if and only if `g ∘ f = idΓ`, but in every case the
  soundness invariant `φ(γ)` is preserved regardless.

### 3.1.3. Effect Iterators

- A component loads via a *sequence* of effects, not one effect, and unloading reverts the whole
  sequence; **Theorem 16** proves reverting in reverse order needs nothing extra because each
  inverse meets the state its own application produced.
- **Definition 17** reifies the sequence as a recursive type, the effect iterator `ℑΓ := μℑ. Γ → Γ
  × (Γ → Γ) × Maybe(ℑ)`, each iteration yielding a new context, an inverse, and either `Nothing`
  (termination) or `Just(i)` (continuation); `ℑ*Γ` is the witnessed version, holding each iteration
  to the single-effect witness condition.
- **Definition 18** defines `effectiterΓ : ℑΓ → ∂Γ → ∂²Γ`, extending `effectΓ` recursively over
  the iterator structure, composing each step's inverse onto the accumulator so that
  `φ ∘ g1 ∘ ⋯ ∘ gk` reverts effects in LIFO order.
- The `Maybe(ℑ)` continuation makes a boundary available between any two consecutive iterations —
  a *reified delimited continuation* analogous to the `yield` operator/generators in mainstream
  languages — so the model maps directly onto language-native generator constructs.
- A plain effect function embeds as the degenerate iterator whose first iteration yields
  `Nothing`; the embedding carries `𝔈*Γ` into `ℑ*Γ`.
- Together, revertible effects give **local temporal composability**: for every sequence of effect
  functions a component applies, the accumulator recovers the initial context (Theorem 7), and
  reverting the sequence hands each inverse the state its own application ran against (Theorem
  16). Loading a component is running one iterator and accumulating inverses; unloading is
  applying the accumulator. What this local criterion leaves out — reverting out of accumulator
  order, and sequences that interleave several components' effects — is deferred to independence
  (Section 3.4).

### 3.2. Reactive Coeffects

- Spatial composability is defined as the ability for components to declare dependencies on one
  another and for the system to resolve, provide, and withdraw those dependencies at runtime, with
  satisfaction re-evaluated whenever the shared context changes.
- Dependencies of a component are modeled as a specification, and every context change is
  classified against that specification as activating, deactivating, or neutral; classifying
  drives activation/deactivation, and this classification-then-response discipline is what makes
  the coeffect "reactive."

### 3.2.1. Coeffect Context

- **Definition 19** defines the coeffect context `Σ := (k : K) ⇀ 𝒱k` as a finite partial
  dependent function from keys to typed values, generalizing traditional IoC key-value containers
  with per-key static types via the type family `𝒱`.
- Extension (`set`) requires the key be absent and restriction (`\`) requires it be present; a
  violated precondition signals an error and produces no transition, so the effect algebra applies
  unchanged to `Σ`'s partial operations (optionally made total via the `Maybe` monad).
- **Definition 20** defines `get(k)(σ) = σ(k)` (partial) and `set(k, v)(σ) = (σ[k ↦ v], λσ'.σ' \
  k)`; crucially, `set(k, v)` has type `𝔈*Σ` — a witnessed effect function on the coeffect context
  — so the effect machinery of Section 3.1 (automatic tracking/recovery) applies directly to
  dependency registration, which is the stated synergy between reactive coeffects and revertible
  effects.

### 3.2.2. Specification and Notification

- Accessing an absent dependency is a runtime failure, so a component should activate only once
  all declared dependencies are jointly satisfied rather than accessing them optimistically.
- **Definition 21** defines a coeffect specification `𝔇Σ := Set(K)`, the set of dependency keys a
  component declares.
- **Equation (22)** defines the satisfaction predicate `σ ⊨ d := ∀k ∈ d. k ∈ dom(σ)`, which is
  decidable because `dom(σ)` is finite.
- **Definition 22** defines `notifyd(σ, σ')` as *activating* when `σ ⊭ d ∧ σ' ⊨ d`, *deactivating*
  when `σ ⊨ d ∧ σ' ⊭ d`, and *neutral* otherwise; because every mutation to `σ` passes through an
  effect function whose inverse can recover the prior domain, changes in satisfaction are
  detectable at every effect boundary — the algebraic basis of reactivity.
- An activating transition triggers execution (tracked as in 3.1) and a deactivating transition
  triggers recovery (applying the accumulator); the operational semantics of this triggering is
  deferred to Chapter 4.
- Together, `set` and `notify` deliver **local spatial composability**: a component activates only
  at a state satisfying its specification (so it never reads an absent binding), and every context
  change is classified against that specification (so loss of satisfaction is detected and drives
  deactivation); this criterion leaves out cross-component ordering concerns (withdrawing only
  after dependent deactivations finish, keeping bindings stable while an activation runs), deferred
  to Section 4.3.3.

### 3.2.3. Isolation and Interception

- **Definition 23** distinguishes two realizations of an effect function: *in-place* realization
  mutates the context and returns a nontrivial inverse (successor aliases the input); *derived*
  realization leaves the input intact, returns a fresh derived context with the identity as
  inverse, and recovery simply discards the derived context.
- Coeffect isolation and coeffect interception are both given derived realization outright: since
  nothing in the shared table changes, there is no effect to track and nothing to lift via
  Definition 12, and neither operation carries a precondition (assignment on a derived table
  simply overrides the inherited value).
- **Definition 24** defines the coeffect context with isolation `Σiso := (K ⇀ R) × ((r : R) ⇀ 𝒱r)`
  as a pair `(ρ, σ)`: `ρ` is an isolation realm table mapping keys to realm identifiers (a key
  outside `dom(ρ)` resolves to its own realm), and `σ` is the dependency table indexed by realm.
- **Definition 25** defines `get`, `set` (still an effect function, `𝔈*Σiso`, inheriting
  revertibility) transported through `ρ(k)`, and `isolate(k, r)` which derives a context
  reassigning realm `r` to key `k` while inheriting the table unchanged — enabling the same
  dependency key to resolve to different values across multi-tenant, testing, or sandboxed
  contexts, described as a runtime ad-hoc polymorphism system finer-grained than traditional
  dependency injection.
- **Definition 26** defines the coeffect context and specification with interception,
  `Σinter := ((k : K) → ℳk) × ((k : K) ⇀ (ℳk → 𝒱k))` and `𝔇inter := (k : K) ⇀ ℳk`: `Σinter` pairs
  context-carried metadata `ι` (default empty `𝜖k`) with a provider function per key from metadata
  to value; each key's metadata forms a monoid `(ℳk, ⊕k, 𝜖k)`.
- **Definition 27** defines `get(k, μ)(ι, σ) = σ(k)(μ ⊕k ι(k))` (component metadata merged with
  context metadata, then applied to the provider), `set` as an ordinary derived-table effect
  function, and `intercept(k, ν)` which merges `ν` onto the inherited metadata at `k`; the merge is
  **right-biased** (context-carried `ι(k)` takes priority), letting an enclosing context constrain
  how a component uses a coeffect without modifying the component itself.

### 3.3. The Context Paradigm

- Section 3.1 and 3.2 each act on a context (effect carrier, coeffect carrier respectively); 3.3.1
  unifies them into one recursive context type and constrains the shape of effect iterators (the
  context paradigm), while 3.3.2 defines observational equivalence as the standard by which all
  earlier equalities are to be re-read.

### 3.3.1. Unified Context

- **Definition 28** defines the unified context type `Γ∞ := μΓ. Γ × (Γ → Γ) × Σ`, recursively
  combining the current state, an accumulator reverting this level's effects, and a coeffect
  context `Σ` carrying dependency information; effect maps `𝔈Γ∞` to itself, unifying the whole
  `∂`-tower into one self-similar type.
- Because the value-type family `𝒱` underlying `Σ` is unconstrained, `Σ` subsumes *all* shared
  mutable state, not just inter-component dependencies, so every interaction between a component
  and its environment passes through this single entity — the defining discipline named the
  "context paradigm."
- **Definition 29** defines a coeffect at key `k` as a pair `(𝒱k, 𝒜k)`, where `𝒜k` is a set of
  coeffect operations available to a component holding the binding; each operation
  `a : Xa → 𝒱k ⇀ 𝒱k × (𝒱k ⇀ 𝒱k) × Ba` acts on the value alone, with its first two constituents
  forming a witnessed effect function (Definition 8) and its third an outcome; operations induce
  the per-key equivalence `≃k` (defined in 3.3.2) and lift to the whole coeffect context via
  Equation (31), reading/writing only the binding at `k`.
- **Definition 30** defines context-mediated iterators `ℑ𝒜Σ(S, P)` (for key sets `P ⊆ S ⊆ K`) as
  the least set of iterators built from the unit and two stage shapes: an *operation stage* that
  performs `a ∈ 𝒜k` for `k ∈ S` and branches its continuation on the outcome, and a *provision
  stage* that installs a new binding via `set(k, v)` for `k ∈ P` (a key no operation can create).
  Membership in this class is the formal content of "mediating every interaction through the
  context"; a map reading anything outside it (e.g. an allocator drawing handles from an
  unbound counter) is not context-mediated until bound at a key.
- The recursive structure of `Γ∞` supports **hierarchical composition**: loading a component is
  executing its effects ("plugging in"), unloading is reverting them ("unplugging" without
  affecting others), and components at different tree levels are independently loadable/unloadable
  while a parent context aggregates and manages all its children's effects.

### 3.3.2. Observational Equivalence

- The recovery guarantee of Theorem 7 asserts an equality of states, which is an idealization: for
  example `free` does not restore the heap's prior layout, and a discarded generative name is not
  restored by its inverse since the next creation draws a fresh one. Every equality in the chapter
  is therefore to be read up to an **observational equivalence** `≃`: two states are related when
  no observer (given only the coeffects it carries and the operations of each key) can
  distinguish them.
- **Definition 31** defines a *test* over a key's operation set `𝒜` as a finite word of forward
  maps and yielded inverses of the operations' effect functions, applied in sequence; two values
  are *indistinguishable* (`v ≈𝒜 v'`) when every test is defined at both or neither and yields the
  same outcomes at both. The per-key equivalence is `≃k := ≈𝒜k`.
- **Lemma 32** proves `≈𝒜` is an equivalence that every operation of `𝒜` respects (defined
  identically or not at all, mapping related inputs to related outputs/inverses/outcomes), and
  that it is the *coarsest* such relation — giving a proof principle: to relate two values,
  exhibit any respected equivalence containing the pair.
- **Definition 33** defines context/state relatedness at a key set `S` (`≃S`), requiring equal
  domains restricted to `S` and `≃k`-related values at every shared key; `≃` (no subscript) is the
  finest such relation (`S = K`).
- **Definition 34** extends `≃S` compositionally over function types, products, and `Maybe`, and
  coinductively over recursive types (as for `ℑΓ`); a map or iterator "respects" `≃S` when it is
  related to itself (`f ≃S f`).
- **Lemma 35** proves `≃S` is a partial equivalence (symmetric, transitive) on maps and iterators,
  so two related members each respect it.
- **Definition 36 / 37** re-define witnessed effect functions (`𝔈SΓ`) and iterators (`ℑSΓ`) with
  the witness clause reading `g(δ) ≃S γ` instead of equality, and requiring `e ≃S e`; taking `≃` as
  equality on `Γ` and `S = K` recovers the original Definitions 8 and 17 exactly.
- **Lemma 38** proves every equality of Section 3.1 holds with `=` replaced by `≃` (and generalizes
  to any equivalence, using only transitivity and respect), and that every accumulator reachable
  from the initial state respects `≃`.
- **Lemma 39** proves that a context-mediated iterator built at key sets `(S', P)` automatically
  lies in `ℑSΓ` for any `S` containing every key it touches, by induction on the iterator's
  construction — so a claim about one component can always be read at exactly the keys that
  component names.

### 3.4. Attaining Independence

- This section supplies the condition — independence — that extends the local guarantees of 3.1
  and 3.2 to a system of interleaved components. 3.4.1 defines independence of effect functions
  (mutual commutation of every transformation each can perform); 3.4.2 reduces independence of
  context-mediated iterators to commutativity at single shared keys, adding a witness to the
  coeffect definition itself.

### 3.4.1. Effect Independence

- Two situations require reverting an effect at a state other than the one its own application
  produced: running an inverse while later effects are still in place (removing one component from
  a running system), and a sequence that interleaves several components' effects. In both, whether
  the inverse still reverts correctly is a question of commutation between every transformation of
  one effect and every transformation of the other.
- **Definition 40** defines, for an iterator `i`, `reach(i)` (the least set of iterators containing
  `i` and closed under continuation) and the **transformation monoid** `𝔐(i)` (the submonoid of
  `Γ → Γ` generated by every forward map and every yielded inverse across `reach(i)`).
- **Lemma 41** proves (1) commutation is settled on generators — if every generator of `𝔐(e1)`
  commutes with every generator of `𝔐(e2)`, every *element* of each commutes with every element of
  the other; and (2) `⋄` enlarges no transformation monoid (`𝔐(e1 ⋄ e2) ⊆ ⟨𝔐(e1) ∪ 𝔐(e2)⟩`).
- **Definition 42** defines two iterators `i, j` as **independent** when (1) every transformation
  of `𝔐(i)` commutes with every transformation of `𝔐(j)`, and (2) neither one's transformations
  disturb what the other yields (inverse and continuation alike) when evaluated after the other
  has acted; a family is pairwise independent when every distinct pair is independent, and an
  iterator independent of itself means its own `𝔐(i)` is commutative.
- **Theorem 43** proves: given pairwise-independent witnessed effect functions `e1, ..., en`
  applied in order from `γ0`, applying the `n` yielded inverses at the final state in *any*
  permutation order reaches `γ0` again — i.e., independence lets a whole set of loaded components
  be unloaded in arbitrary order, not just LIFO.

### 3.4.2. Coeffect Commutativity

- Commutation is read up to `≃` (per Lemma 38), so two operations that leave `≃k`-equivalent
  values still count as commuting.
- **Definition 44** defines two operations `a, a'` as **independent** when their lifts are
  independent as effect functions at every argument pair, and additionally neither's
  transformations disturb the *outcome* the other yields; a key is **commutative** when every pair
  of its operations (including an operation with itself) is independent.
- **Theorem 45** proves operations at *distinct* keys are always independent, since each
  generator reads/writes only its own key and the two keys differ.
- **Definition 46** extends a coeffect to a *witnessed* coeffect, carrying a proof of key
  commutativity as a third constituent alongside `𝒱k` and `𝒜k`, parallel to how an effect
  function's Definition 8 witness carries the inverse-reverts proof; the commutativity obligation
  falls on the component *providing* the key, never on a consumer (by Theorem 45).
- Worked examples ground the commutativity/non-commutativity distinction: a table of independently
  tagged entries (route registration, event listeners) is commutative because registrations name
  distinct entries in either order; an ordered chain (middleware) is not, since insertion order
  changes observed behavior; an allocator is commutative exactly when its interface publishes no
  outcome that lets two allocations be told apart (e.g. handles compared only up to renaming, as in
  CompCert's memory-state relation), and non-commutative when it does (POSIX's `open`, guaranteed
  to return the lowest available descriptor, versus `mmap`/`creat`, which may return any unused
  address/inode) — directly invoking the "scalable commutativity rule," which reads commutativity
  as indistinguishability through an interface rather than equality of internal state.
- **Theorem 47** proves that two context-mediated iterators `i1 ∈ ℑ𝒜Σ(S1, P1)` and `i2 ∈
  ℑ𝒜Σ(S2, P2)` are independent whenever their provision keys don't collide with the other's
  operated keys (`P1 ∩ S2 = P2 ∩ S1 = ∅`) and every key both operate on is commutative — reducing
  whole-iterator independence to key-local disjointness and per-key commutativity checks.
- The chapter closes by framing the overall decomposition: the *commuting part* of a computation
  is carried by effects, freely orderable and revertible in any order (Theorem 43); the
  *order-sensitive part* is carried by coeffects, whose ordering is imposed either internally by the
  LIFO accumulator (Theorem 16) or externally by a provision preceding a declaration's satisfaction
  (Section 3.2.2) — and this split is what lets Chapter 4 build a full operational semantics for
  systems of many interleaved, independently loadable components.

## Terminology

| Term | Notation | Definition |
|---|---|---|
| Effect | `Γ → Γ × (Γ → Γ)` (informal, refined in 3.1.2) | A function on the context type that yields a modified context together with an explicit inverse that can undo the modification. |
| Context type | `Γ` | The runtime-operable reification of a typing context; all side effects of a pure-ified impure function are captured as transformations `Γ → Γ`. |
| Twisted composition | `(f1, g1) ∘ (f2, g2) := (f1 ∘ f2, g2 ∘ g1)` (Def. 1) | Multiplication on pairs of context transformations: forward maps compose normally while inverses accumulate in reverse order. |
| Twisted composition monoid | `𝔗Γ` | `(Γ → Γ) × (Γ → Γ)` under twisted composition, unit `(idΓ, idΓ)`; the product of the transformation monoid with its opposite. |
| Effect context | `∂Γ := Γ × (Γ → Γ)` (Def. 2) | A pair `(γ, φ)` of the current state and an accumulator `φ` (composite of inverses so far) that recovers the initial state. |
| Accumulator | `φ` | The composite of the inverses of every effect performed so far in an effect context; applying it recovers the pre-composition state. |
| Soundness invariant | `φ(γ) = γ0` (from Thm. 7) | The property that the accumulator, applied to the current state, still yields the original starting state — preserved by every correctly-witnessed tracked effect. |
| track | `trackΓ : (Γ→Γ)×(Γ→Γ) → ∂Γ → ∂Γ` (Def. 3) | Lifts a forward map and a candidate inverse into a transformation of the effect context, applying the map to the state and composing the inverse onto the accumulator. |
| recover | `recoverΓ : ∂Γ → ∂Γ` (Def. 6) | Applies the accumulator `φ` to the current state `γ` and resets `φ` to identity, restoring the pre-composition state. |
| Effect function | `𝔈Γ := Γ → Γ × (Γ → Γ)` (Def. 8) | A function returning a new state and an inverse *at the point of application*, so the inverse can vary per state (unlike a fixed `track` pair). |
| Witnessed effect function | `𝔈*Γ` (Def. 8) | An effect function equipped with a proof that at every `γ`, if `e(γ) = (δ, g)` then `g(δ) = γ` — the returned inverse reverts exactly the state it was produced at. |
| Effect composition | `f ⋄ g` (Def. 9) | Sequential composition of two effect functions that also composes their yielded inverses in twisted order; `(𝔈Γ, ⋄)` is a monoid. |
| effect | `effectΓ : 𝔈Γ → ∂Γ → ∂²Γ` (Def. 12) | Lifts an effect function on `Γ` to an effect function on `∂Γ`, tracking the effect and returning an inverse built by re-tracking the reversed direction. |
| Effect iterator | `ℑΓ := μℑ. Γ → Γ × (Γ→Γ) × Maybe(ℑ)` (Def. 17) | A recursive type reifying a sequence ("stream") of effects, each iteration yielding a new state, an inverse, and either termination (`Nothing`) or a continuation (`Just(i)`); analogous to a delimited continuation / generator. |
| Witnessed effect iterator | `ℑ*Γ` (Def. 17) | An effect iterator where every iteration satisfies the per-step witness condition of Definition 8. |
| Coeffect context | `Σ := (k:K) ⇀ 𝒱k` (Def. 19) | A finite, typed, partial dependent function from dependency keys to values, generalizing an IoC container with static per-key value types. |
| get / set (coeffect) | `get(k)(σ)`, `set(k,v)(σ)` (Def. 20) | `get` reads the binding at `k` (defined only if present); `set` extends `σ` at `k` (defined only if absent) and returns an inverse that restricts `σ'` back at `k`; `set` is itself a witnessed effect function `𝔈*Σ`. |
| Satisfaction predicate | `σ ⊨ d := ∀k∈d. k∈dom(σ)` (Eq. 22) | Decidable predicate stating that every key of a coeffect specification `d` is currently bound in `σ`. |
| Coeffect specification | `𝔇Σ := Set(K)` (Def. 21) | The set of dependency keys a component declares from the environment. |
| notify | `notifyd(σ, σ') ∈ {activating, deactivating, neutral}` (Def. 22) | Classifies a state transition against specification `d` as activating (satisfaction gained), deactivating (satisfaction lost), or neutral. |
| In-place / derived realization | (Def. 23) | Two ways an effect function's denotation can be carried out: in-place mutates the context and returns a nontrivial inverse; derived leaves the input intact, returns a fresh derived context, and recovery just discards it (identity inverse). |
| Isolation realm | `ρ : K ⇀ R` (Def. 24) | A table mapping dependency keys to realm identifiers; a key outside `dom(ρ)` resolves to its own realm, so the same logical key can bind to different values across realms/tenants. |
| isolate | `isolate(k,r) : Σiso → Σiso` (Def. 25) | Derives a context reassigning key `k` to realm `r`, leaving the dependency table unchanged; carries no precondition and no effect tracking. |
| Coeffect interception metadata | `ι : (k:K) → ℳk`, `d ∈ 𝔇inter` (Def. 26) | Context-carried (`ι`) and component-declared (`d`) metadata attached to dependency access; each key's metadata forms a monoid `(ℳk, ⊕k, 𝜖k)`. |
| intercept | `intercept(k,ν) : Σinter → Σinter` (Def. 27) | Derives a context merging metadata `ν` onto the inherited metadata at key `k` (right-biased merge), enabling an enclosing context to constrain a component's use of a coeffect without modifying it. |
| Unified context | `Γ∞ := μΓ. Γ × (Γ→Γ) × Σ` (Def. 28) | The recursive type unifying effect and coeffect contexts into one self-similar entity through which every component–environment interaction is mediated (the "context paradigm"). |
| Coeffect (operations) | `(𝒱k, 𝒜k)`, later `(𝒱k, 𝒜k, proof)` (Def. 29, 46) | A key's value type paired with the set of operations `𝒜k` a bound value exposes to a holding component; each operation is itself an effect function plus an outcome, and the witnessed form adds a commutativity proof. |
| Context-mediated iterator | `ℑ𝒜Σ(S, P)` (Def. 30) | The least set of iterators built from the unit, operation stages (performing `a ∈ 𝒜k` for `k ∈ S`), and provision stages (`set(k,v)` for `k ∈ P`), formalizing "every interaction passes through the context." |
| Observational equivalence | `≃`, `≃k`, `≃S` | The equivalence relating states/values that no observer (using only the operations available to it) can distinguish; equalities in Section 3.1 are to be re-read up to `≃`. |
| Test | (Def. 31) | A finite word of forward maps and yielded inverses of a key's operations, applied in sequence; used to define indistinguishability `v ≈𝒜 v'`. |
| Restricted equivalence | `≃S` (Def. 33, 34) | Observational equivalence restricted to a key set `S`, comparing only the bindings and outcomes reachable through those keys; extends compositionally/coinductively over type formers. |
| Respect | `f ≃S f` | A map or iterator "respects" `≃S` when it relates to itself, i.e., it descends to a well-defined map on the quotient `Γ/≃S`. |
| Transformation monoid | `𝔐(i)` (Def. 40) | The submonoid of `Γ → Γ` generated by every forward map and every yielded inverse across `reach(i)` (all iterators reachable from `i` by continuation). |
| Independence (effects) | (Def. 42) | Two iterators are independent when every transformation of one commutes with every transformation of the other, and neither disturbs what the other yields (inverse, continuation). |
| Independence (operations) / commutative key | (Def. 44) | Two coeffect operations are independent when their lifts are independent effect functions and neither disturbs the other's yielded outcome; a key is commutative when all its operations are pairwise (and self-)independent. |
| Scalable commutativity rule | — | The cited principle (from POSIX/interface literature) that commutativity should be judged as indistinguishability *through an interface*, not equality of internal state — directly mirrored by the chapter's `≃k` construction. |

## Relevance to an Agent Harness

- The revertible-effect model (Definitions 8, 9, 12, 17) is a direct blueprint for plugin
  load/unload: a plugin's installation should be expressed as a sequence of effect functions that
  each return their own inverse, so unloading is simply running the accumulated inverses — this
  maps cleanly onto hooking/unhooking handlers, registering/deregistering routes, or patching
  config, and Theorem 16 guarantees LIFO reversal is always safe with no extra bookkeeping.
- Theorem 43 (independence lets inverses run in *any* permutation, not just LIFO) is directly
  relevant to hot-reload and out-of-order unload scenarios: if two plugins' effects are proven
  independent (Definition 42/47), the harness can safely unload plugin A before plugin B even
  though B loaded after A — a property ordinary LIFO teardown does not by itself provide.
- The coeffect model (Section 3.2) is essentially a formal dependency-injection container with
  reactive activation/deactivation: a plugin should declare a specification `d ⊆ K` of the config
  keys/services it needs, activate automatically once `σ ⊨ d` becomes true, and deactivate the
  moment any key it depends on is withdrawn (Definition 22) — this is a rigorous foundation for
  "activate when dependencies are satisfied" plugin lifecycles and for automatic teardown on
  dependency loss during hot config reload.
- Coeffect isolation (Definition 24, `Σiso`) is a formal basis for sandboxing/multi-tenancy: the
  same logical dependency key can resolve to different bound values per isolation realm, which
  maps onto per-plugin-instance or per-tenant config/service scoping without touching the shared
  table.
- Coeffect interception (Definition 26–27, right-biased metadata merge) gives a principled model
  for cross-cutting policy injection (e.g., an enclosing sandbox or supervisor constraining how a
  loaded plugin may use a shared resource) without modifying the plugin's own declared
  dependencies — directly applicable to sandboxing/permission layering in a harness.
- The commutativity witness requirement (Definition 46, discharged by the *provider* of a key, not
  its consumers, per Theorem 45) suggests a concrete engineering discipline: whichever
  subsystem in the harness exposes a shared resource (e.g., a registry, an event bus, an
  allocator-like ID space) is responsible for proving/designing that its own operations commute,
  rather than pushing that burden onto every plugin that consumes the resource.
- The allocator/POSIX examples (`open` vs. `mmap`/`creat`) generalize into a design rule for
  harness-internal ID/handle allocation: if handle equality is never observed by consumers, the
  allocator can be made commutative (and thus freely reorderable across concurrent plugin
  operations) simply by not exposing an ordering-sensitive outcome — a concrete lever for
  designing thread-safe or reorder-safe internal APIs.
- The unified context Γ∞ and its "every interaction passes through this one entity" discipline
  (Definition 28, 3.3.1) argues for a harness architecture where all plugin/environment
  interaction — not just declared dependencies but *any* shared mutable state — is routed through
  a single mediated context object, since anything bypassing it (an "allocator drawing handles
  from a counter the context does not carry") falls outside every guarantee the chapter proves.

## Open Questions and Limitations

- The chapter explicitly notes that the recovery guarantee (`Theorem 7`, `γ0` exactly restored) is
  an idealization that cannot hold of physical state (e.g., `free` does not restore heap layout,
  discarded generative names are not restored) — the entire observational-equivalence apparatus of
  3.3.2 is a deferred, necessary patch for this, and the paper is explicit that ≃ must be
  substituted for `=` throughout.
- Two aspects of local temporal composability are explicitly left open at the end of 3.1.3:
  reverting effects out of the order the accumulator imposes, and sequences that interleave the
  effects of multiple components; both are deferred entirely to the independence condition of
  Section 3.4 rather than solved within 3.1.
- Two aspects of local spatial composability are explicitly left open at the end of 3.2.2:
  withdrawing a binding only after the deactivations it causes have finished, and keeping the
  bindings an activation reads unmoved while that activation runs; both are deferred to Section
  4.3.3 (outside this chapter's scope).
- The operational semantics of activation and deactivation triggered by `notify` (what actually
  happens when a transition is classified activating/deactivating) is explicitly deferred to
  Chapter 4 — Section 3.2.2 defines only the classification, not the execution.
- Theorem 47's independence result for context-mediated iterators requires checking that the two
  iterators' provision-key sets are disjoint from each other's operated-key sets; the chapter notes
  this disjointness check itself is deferred to Chapter 4, which "reads that disjointness off the
  two components' declarations" rather than proving it generically here.
- The chapter treats the commutativity witness (Definition 46) as something "supplied where the
  definition is written rather than checked where it is used," i.e., it is assumed to be
  discharged by whoever defines a key's operations; the chapter gives illustrative examples (table
  registration vs. ordered middleware vs. POSIX allocators) but does not give a general algorithm
  or decision procedure for establishing commutativity of an arbitrary operation set.
- The interaction between coeffect isolation/interception (3.2.3, both given "derived realization"
  with no effect tracking) and the independence/commutativity machinery of 3.4 is not spelled out
  explicitly in this chapter — isolate and intercept are typed as plain `Σ → Σ` maps rather than
  effect functions, and the chapter does not state whether/how Theorem 47's disjointness-based
  independence proof extends to systems that also use isolation realms or interception metadata.
