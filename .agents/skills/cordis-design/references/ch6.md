# 6. Discussion

## Summary

Chapter 6 steps back from the formal model (Ch. 3–4) and the Koishi case study (Ch. 5) to
examine how the context/coeffect paradigm generalizes beyond the core theory. It opens by
pinning down what the "system boundary" actually is — the line that determines which
operations can be tracked in the effect log Γ and reverted, and which act as the identity idΓ
because the system cannot exclusively own and restore the underlying location (6.1). From
there it works outward through increasingly infrastructural concerns: how the coeffect
model subsumes and extends OSGi-style service composition, including load balancing,
rolling updates, and cross-process RPC via a service broker (6.2); how declared dependencies
and context-level interception provide capability-style access control, and where that model
runs out and a real sandbox is needed instead (6.3); what any host language must minimally
supply — closures, dynamic load/unload, and a dependency-injection mechanism — to host
the paradigm at all (6.4); why mutual dependencies are a structural dead end that is resolved
by finer-grained decomposition rather than by relaxing the acyclicity requirement, and the
quadratic component-count cost of doing so (6.5); why key-based coeffect linking is only
nominal typing, and three approaches (namespacing, peer dependencies, structural
compatibility) to closing the resulting interface-drift and key-collision gaps (6.6); and finally
what a language or operating system explicitly co-designed with the paradigm could offer
beyond what a library realization (like Cordis-in-TypeScript) can — implicit contexts,
compiler-known effects/coeffects, and OS-level sandboxing by construction (6.7). The chapter
matters because it is where the paper concedes the limits of its own implementation and
argues that the underlying theory — the context, the coeffect, the boundary — is the durable
contribution, with TypeScript/Cordis/Koishi as one instantiation among many possible ones.

## Section-by-Section

### 6.1. System Boundary

- The system boundary partitions every location the system runs against into "inside" —
  where the system can modify the location exclusively and restore its prior state, so an
  operation there is tracked in the effect context Γ and can later be reverted — and
  "outside," where at least one of those two abilities fails, so the operation behaves as the
  identity idΓ and is neither tracked nor reverted.
- A coeffect moves the boundary inward by "reifying" an external location: it confines all
  access to that location to a fixed set of operations for which it can supply an inverse, which
  converts previously untracked (idΓ) accesses into tracked, revertible ones.
- The boundary is drawn per location, not per medium (e.g., "memory" or "filesystem" as a
  category), because both defining abilities (exclusive control, restorability) are properties of
  a specific location; the same medium can have locations on either side, e.g., a private
  scratch file is inside while a file shared with other programs is outside.
- Moving the boundary is a trade-off between the cost of supplying revertible semantics on
  every access and the benefit of gaining trackable/revertible behavior for that location; the
  paper defers the co-design implications of this trade-off to Section 6.7.
- Operations that reach outside the boundary typically split into an acquisition stage (e.g.,
  `open`, `malloc`, `fork`), which installs a revertible record inside the boundary (a descriptor,
  a reserved block, a child process) and is undone by a matching operation (`close`, `free`,
  `kill`), and an emission stage (e.g., `write`, `send`), which pushes data through the
  acquired channel to the outside and therefore acts as idΓ.
- Recovering from an emission that has already crossed the boundary has two strategies:
  withholding the emission until the producing state is certain to persist (the "output commit
  problem" of rollback-recovery), or compensation — an application-supplied action (e.g.,
  deleting a created file, refunding a charge) that restores state up to a coarser equivalence
  than the ≃ of Definition 33.
- Compensating actions compose in the same LIFO order as ordinary inverses, so the
  compositional machinery of Section 3.1 carries over structurally, but the metatheoretic
  commutation result of Definition 65 does not automatically transfer, because it was proved
  against the finer ≃ equivalence and must be re-proved against the coarser compensation
  equivalence.

### 6.2. Service Multiplexing

- Cordis's coeffect model is compared to OSGi-style service composition: a "service" is the
  interface behind a coeffect key; components that supply the service are "providers" and
  components that consume it are "consumers."
- Multiple providers for one service can be reconciled in two forms: (1) exclusive binding,
  where only one implementation is bound at a time and switching requires unloading one
  provider and loading another, which momentarily perturbs every consumer's dependency;
  or (2) a service broker, a central component injected by both providers and consumers that
  dispatches requests among coexisting providers, so updating a backing provider does not
  change what consumers see and triggers no reload.
- The service broker enables three capabilities: load balancing (the broker routes requests
  among coexisting providers by a configurable policy — round-robin, least-loaded,
  latency-weighted — or an explicit target, and because providers are ordinary components,
  adding or removing one is a revertible registration effect that automatically updates the
  broker's routing set on unload).
- Rolling updates reduce to a "controlled provider transition": a new provider loads as an
  additional fiber and registers with the broker, traffic is gradually shifted to it once it
  becomes ACTIVE (e.g., by adjusting selection weights), and old providers unload only once
  they carry no in-flight requests — turning an infrastructure-level operation (container
  orchestration, blue-green deployment) into an application-level composition pattern.
- Cross-process invocation extends the broker across process boundaries: each process hosts
  its own Cordis context with local providers, a coordinating component treats a remote
  process's provider as if local, and an RPC mechanism preserves the interface so the
  distribution is transparent to consumers; because a cross-process call can incur latency or
  fail mid-flight, any interface meant to be exposed this way must be designed against an
  asynchronous contract rather than a synchronous one.

### 6.3. Access Control and Sandboxing

- Securing an application assembled from independent components requires two
  complementary mechanisms: constraining what dependencies a component may access, and
  sandboxing untrusted code from the host environment; Cordis's dependency-declaration and
  interception machinery (Section 5.1.4) covers the first, while the second needs an external
  sandbox.
- The dependency-access mechanism is structurally similar to capability-based security: a
  component can access only dependencies it has declared (an undeclared access raises an
  error), the `inject` declaration functions as a capability request, and the context proxy acts
  as the capability mediator; because these requests are static, an orchestrator can review and
  approve a component's complete required capability set before it ever runs.
- This mediation generalizes to fine-grained policy via interception: access-control metadata
  can be carried by contexts or declared by components (Definition 26), and a provider
  consults that metadata at invocation time to decide whether a request is permitted — e.g., a
  filesystem dependency can restrict which paths a given component may read or write.
- Because interception lives on the context rather than in either party's code, an orchestrator
  can install, reconfigure, or remove it at runtime — differentiating access per component
  (e.g., read-only database access for a community component vs. full access for a core one)
  — without triggering a reload or perturbing the dependency graph, since it changes only how
  a dependency is invoked, not whether it is satisfied.
- Language-level access control is insufficient once a component's code cannot be trusted,
  because a malicious component with host-runtime access can reach underlying objects
  directly and bypass the checks; sandboxing instead requires an execution boundary beyond
  language-level reach, such as software fault isolation, a separate language runtime, a
  sandboxed process, or a virtualized container.
- Under sandboxing, the untrusted component runs in its own sandboxed context and reaches
  host-provided dependencies only through a bridge — generalizing the cross-process
  invocation of Section 6.2, with the same transparency argument making bridged access
  indistinguishable from local injection — and on the host side, the bridge is an ordinary fiber
  whose capabilities can be attenuated using the access-control mechanism described above.

### 6.4. Language Independence and Selection

- Cordis is implemented in TypeScript, but the context paradigm itself is language-agnostic:
  it is defined purely by two composability dimensions (temporal and spatial), so it can be
  realized in any language meeting requirements along both.
- Temporal composability minimally requires closures, so an inverse can be captured as a
  value along with the state it restores and later replayed at teardown; beyond that, a
  component's code and its loading side effects must be introducible and retractable at
  runtime.
- How introduction/retraction is realized depends on the execution model: managed
  runtimes typically expose a programmatic module registry (e.g., Node.js, where a module
  can be evicted and later garbage-collected once unreferenced); native code instead uses
  explicit dynamic linking/unlinking (`dlopen`/`dlclose`, `LoadLibrary`/`FreeLibrary`); and
  WebAssembly follows either path depending on its embedder (host-collected under a
  managed embedder, or released when a native embedder like Wasmtime drops it) — in all
  cases, loading is modeled as an effect on the context whose inverse undoes registered
  symbols, types, or handlers.
- Spatial composability reduces to a dependency injection (DI) problem operating at two
  levels: the type level (the context type must record each key's coeffect type so dependency
  access is well-typed, achieved via Haskell typeclasses, Rust traits, or TypeScript's module
  augmentation) and the runtime level (dependency access must be dynamically mediated
  because the coeffect behind a key can change as providers load/unload, using a
  transparent interposition primitive like JavaScript's `Proxy` or Python's descriptor protocol
  `__get__`, or falling back to runtime reflection at the cost of type safety and developer
  experience).
- Metaprogramming facilities (annotations/decorators, or compile-time metaprogramming
  such as Rust procedural macros, Scala macros, or Zig comptime) can supply both the typed
  declaration and the mediating accessor together for each dependency, removing the need
  for a general-purpose interception primitive.

### 6.5. Mutual Dependencies and Component Granularity

- In the reactive coeffect model, a dependency cycle between two components A and B (A
  requires a key B provides, and vice versa) leaves both permanently inactive, because
  neither's satisfaction predicate can ever become true; unlike concurrency deadlock, this
  condition is predictable purely from the static dependency declarations, so a runtime can
  report it at load time rather than detecting it as it happens.
- Most apparently mutual dependencies can be eliminated by decomposing into
  finer-grained components; the paper's worked example splits a monolithic
  server/access-controller pair (which interact bidirectionally) into four components —
  server-core, access-control-core, request-mediation (depends on both cores to apply access
  control), and policy-management (depends on both cores to expose policy modification) —
  so neither core depends on the other and only the integration components carry the
  cross-dependency.
- This decomposition is always possible in principle because every bidirectional interaction
  can be factored into independent unidirectional bindings, but for n mutually interacting
  components the number of integration components can grow quadratically with n, since
  each interacting pair may need a distinct component per direction of interaction.
- Finer granularity does not harm correctness or runtime performance (components are
  lightweight) and can even increase composability, since users can load only the specific
  integration bindings they need, but it raises developer-experience costs — more
  configuration, more naming, more cognitive overhead in understanding the dependency
  graph.
- Mitigating the granularity cost is framed as an engineering rather than theoretical problem,
  addressed via package bundling (grouping fine-grained components into one installable
  unit), convention-based wiring (auto-connecting components whose names/types match a
  pattern), and scaffold tooling (generating integration-component boilerplate from
  declarative specs) — all of which preserve the formal acyclic-model guarantees while
  reducing authoring burden toward that of the monolithic case.

### 6.6. Dependency Typing and Versioning

- In the formal model, a dependency link is established purely by key identity: any provider
  of key k satisfies any consumer declaring k, and the type family 𝒱ₖ enforces type-level
  agreement only within a single compilation unit — a guarantee that breaks down once
  components are built independently, a common case in component ecosystems.
- Interface drift is the first resulting problem: a provider can change the interface behind key
  k across versions while a consumer built against the earlier interface still declares the same
  k; the coeffect-level check k ∈ dom(σ) is satisfied, but the runtime value no longer matches
  the consumer's expectations, producing type errors, method-not-found failures, or silent
  behavioral divergence.
- Key collision is the second problem: two independently developed providers can reuse the
  same key name k for entirely unrelated interfaces, so a consumer expecting one provider's
  interface silently accepts the other's incompatible value with no relationship (not even a
  shared lineage) between expected and actual types, making failures unpredictable and hard
  to diagnose.
- Both problems trace to the same gap: the coeffect model gives only nominal linking (by key
  name), not versioned or structural linking (by interface compatibility); the paper discusses
  three remedies of decreasing infrastructure coupling.
- Key namespacing extends the key space from K to K × P (P identifying the interface's
  defining package), eliminating collision by construction, but it is the most coupled
  approach because it embeds package-registry identity into the formal model itself.
- Peer dependencies — the approach Cordis currently adopts — declare version constraints
  through the host-language package manager (e.g., npm peer dependencies), catching
  incompatibility at install time; its two limitations are dependence on providers actually
  following semantic versioning (an unenforceable convention) and package managers
  typically resolving each dependency to a single version, which precludes loading multiple
  versions of the same package concurrently.
- Structural compatibility would replace the membership check k ∈ dom(σ) with a predicate
  verifying the provider's interface structurally subsumes the consumer's expectation
  (analogous to structural subtyping), but defining this predicate language-agnostically is
  hard: straightforward for record types via width subtyping, but complex for behavioral
  contracts (pre/postconditions, effect specifications) and undecidable once parametric
  polymorphism with bounded quantification is introduced. Unifying all three approaches
  while preserving the coeffect model's dynamic composition guarantees is left as an open
  problem.

### 6.7. Co-Design with Languages and Operating Systems

- Where Section 6.4 asked what a host language must minimally supply, Section 6.7 asks
  what a language or operating system co-designed with the paradigm could offer beyond
  that minimum, across two axes for languages (context semantics, and primitives for
  effects/coeffects) and one for operating systems (sandboxing).
- A co-designed language can make the context implicit again while preserving the context
  semantics of Section 3.3: an ordinary imperative language already runs every statement
  against one implicit context that neither tracks effects nor resolves coeffects, whereas the
  context paradigm distinguishes multiple contexts, where an operation either modifies its
  running context in place or derives a new one from it (Definition 23), and a derived
  realization needs a dedicated language construct to introduce that separate context.
- Making the context implicit yields two benefits over a library realization: ergonomically,
  functions need not take the context as an explicit argument or receiver (contrast with
  Section 5.1); safety-wise, it prevents a component from accidentally reaching another
  component's context through a closure or global variable — a mistake that in a library
  realization can leak an installed effect out of its owning lifecycle or let a read coeffect
  escape its declared dependency specification.
- A co-designed language can also make effects and coeffects first-class to its compiler: for
  effects, where an effect iterator (Definition 17) normally allocates a closure per step to hold
  an inverse and its restored state, syntax for performing an effect would let the compiler emit
  a single state machine for the whole iteration and hold the inverses directly in its frame.
- For coeffects, admitting the coeffect specification into the type system gives two benefits:
  a dependency cycle can be reported at compile time instead of only at runtime (Section 6.5),
  and a dependency can be compared structurally by its type — as row types do — rather than
  by key identity alone, which is type-level support for the structural compatibility discussed
  in Section 6.6.
- A co-designed operating system would generalize the coarse-grained substitute for dynamic
  composability noted in Section 1.2.3 (where the OS supplies temporal composability at
  process granularity and a container orchestrator supplies spatial composability at service
  granularity) down to fine-grained components, by making a component's declared coeffect
  specification the entire set of resources it can reach, supplied at load time, and by exposing
  its own OS resources as coeffects.
- Such an OS would supply, by construction, the sandbox that Section 6.3 otherwise defers to
  an external mechanism: it would bound a component to exactly the dependencies it
  declares, supplying them at load time and leaving nothing else reachable from within it,
  analogous to how a WebAssembly module receives its imports from its embedder only at
  instantiation.

## Terminology

| Term | Notation | Definition |
|---|---|---|
| System boundary | — | The division of every location a system runs against into "inside" (system has exclusive modification and restoration ability, so operations are tracked in Γ and revertible) and "outside" (either ability fails, so operations act as idΓ and are untracked). |
| Inside location | — | A location the system alone can modify and can restore to its pre-modification state; operations on it are tracked in the effect context Γ. |
| Outside location | — | A location where the system either cannot modify it exclusively or cannot restore its prior state; operations on it act as the identity idΓ and are neither tracked nor reverted. |
| Reification | — | The act by which a coeffect confines all access to an external location to a fixed set of operations it can supply inverses for, moving that location from outside the boundary to inside it. |
| Acquisition stage | — | The first stage of an operation that reaches outside the boundary: it obtains access and installs a revertible record inside the boundary (e.g., a file descriptor, a memory block, a child process handle). |
| Emission stage | — | The second stage of an operation reaching outside the boundary: it pushes data through the channel established at acquisition (e.g., bytes written, a datagram sent), acting as idΓ since the data becomes visible/mutable to outside parties. |
| Output commit problem | — | The rollback-recovery problem of deciding when to withhold an emission until the producing state is guaranteed to persist, so recovery does not need to un-send already-emitted data. |
| Compensation | — | An application-supplied action that restores state up to a coarser equivalence than ≃ (Definition 33) after an emission has already crossed the boundary, e.g., deleting a created file or refunding a charge; composes LIFO like ordinary inverses, but Definition 65's commutation result must be re-proved against the coarser equivalence. |
| Service | — | In the OSGi-inspired reading of Cordis, the interface behind a coeffect key; components supplying it are providers, components consuming it are consumers. |
| Exclusive binding | — | A service-multiplexing form where only one provider implementation is bound at a time; switching requires unloading the current provider and loading another, perturbing all consumers momentarily. |
| Service broker | — | A central component injected by both a service's providers and its consumers that dispatches requests among coexisting providers, absorbing provider updates without perturbing consumers or triggering reloads. |
| Rolling update / controlled provider transition | — | Upgrading a service at runtime by loading a new provider fiber, registering it with the broker, shifting traffic to it once ACTIVE, and unloading old providers once they carry no in-flight requests. |
| Cross-process invocation | — | Extension of the service broker across process boundaries, where each process hosts its own Cordis context and a coordinating component treats a remote process's provider as local via a transparency-preserving RPC mechanism. |
| Capability-based access control | — | A security model, structurally echoed by Cordis's dependency declarations, in which authority comes from possessing a reference (here, a declared `inject`) rather than from ambient authority; the context proxy mediates access as the capability mediator. |
| Interception (access-control metadata) | Definition 26 | Metadata carried by contexts or declared by components that a provider consults at invocation time to permit or deny a specific dependency call, installable/removable at runtime without triggering a reload. |
| Sandboxing | — | An execution boundary beyond language-level reach (software fault isolation, separate runtime, sandboxed process, virtualized container) required when a component's code cannot be trusted, since language-level checks can be bypassed by code with direct host-runtime access. |
| Bridge (sandbox bridge) | — | An ordinary fiber on the host side through which a sandboxed untrusted component reaches host-provided dependencies, generalizing cross-process invocation; its capabilities can be attenuated via the same access-control mechanism used for trusted components. |
| Temporal composability (language requirement) | — | The minimal language capability needed to host the paradigm over time: closures (to capture an inverse plus restorable state) and the ability to introduce/retract a component's code and loading side effects at runtime. |
| Spatial composability (language requirement) | — | The minimal language capability needed to host the paradigm across dependencies: a dependency-injection mechanism operating at both the type level (typed dependency access, e.g., typeclasses/traits/module augmentation) and the runtime level (dynamic mediation of access, e.g., Proxy, descriptor protocol, or reflection). |
| Dependency cycle (mutual dependency) | — | A configuration where component A requires a key B provides and B requires a key A provides, leaving both permanently inactive since neither satisfaction predicate can become true; detectable statically at load time, unlike concurrency deadlock. |
| Component granularity | — | The degree to which functionality is split into separate components; decomposing a bidirectional interaction into unidirectional bindings eliminates dependency cycles but can grow the integration-component count quadratically in the number of mutually interacting components. |
| Interface drift | — | The versioning problem where a provider changes the interface behind a key k across versions while a consumer built against an earlier interface still declares k, so the coeffect-level check passes but the runtime value no longer matches consumer expectations. |
| Key collision | — | The versioning problem where two independently developed providers use the same key name k for unrelated interfaces, so a consumer of one silently accepts the other's incompatible value with no shared lineage between them. |
| Nominal linking | — | The property of the coeffect model that a dependency link is established purely by key-name identity (k ∈ dom(σ)), with no versioned or structural compatibility check — the root cause of interface drift and key collision. |
| Key namespacing | K × P | A remedy extending the key space to pairs of a local key and a package identifier P, eliminating key collision by construction at the cost of coupling the formal model to an external package registry. |
| Peer dependencies | — | The versioning approach Cordis currently adopts: components declare version constraints through the host package manager (e.g., npm), catching interface incompatibility at install time rather than at runtime, contingent on providers following semantic versioning and limited by single-version resolution. |
| Structural compatibility | — | A proposed language-agnostic remedy replacing k ∈ dom(σ) with a predicate that checks whether a provider's interface structurally subsumes a consumer's expected interface, analogous to structural subtyping; tractable for record types, harder for behavioral contracts, undecidable under bounded parametric polymorphism. |
| Context semantics (implicit context) | Section 3.3, Definition 23 | The property that an operation either modifies the context it runs against in place or derives a separate context from it; a co-designed language can make this ambient/implicit rather than requiring an explicit context argument or receiver, as in an ordinary imperative language's single implicit context. |
| In-place realization | — | A context realization where an operation modifies the ambient/current context directly, matching how an ordinary imperative language already behaves. |
| Derived realization | — | A context realization where an operation introduces a separate, new context rather than mutating the current one, requiring a dedicated language construct in a co-designed language. |
| Effect iterator | Definition 17 | The abstraction that, at each step of performing an effect, allocates a closure to hold the effect's inverse together with the state it restores; a co-designed language could instead emit a single compiler-generated state machine for a whole iteration. |
| Row types | — | A type-system mechanism cited as prior art for comparing a dependency structurally by its type shape rather than only by key identity, offering type-level support for the structural-compatibility goal of Section 6.6. |
| OS-level fine-grained composition (co-design) | — | A proposed extension of OS-level process/container composability (Section 1.2.3) down to individual components, where a component's declared coeffect specification defines the entirety of what it can reach, with OS resources themselves exposed as coeffects and imports supplied only at load/instantiation time (cf. WebAssembly module instantiation). |

## Relevance to an Agent Harness

- Section 6.1's inside/outside boundary maps directly onto plugin sandboxing decisions in an
  agent harness: a harness should decide, per resource (not per subsystem), whether it can
  exclusively own and restore that resource for a plugin — if so, it can offer automatic
  rollback on unload; if not (e.g., a shared credentials file, a network socket, an external API
  call), it must fall back to compensation logic that the plugin author supplies explicitly.
- The acquisition/emission split (Section 6.1) is a concrete design pattern for plugin
  lifecycle APIs: model any resource acquisition (opening a connection, registering a
  listener, spawning a subprocess) as a revertible effect with a paired teardown, and treat
  any data-emitting call through that resource (writing to a socket, sending a message) as
  outside the harness's rollback guarantees, requiring the plugin (or harness) to design an
  idempotent/asynchronous contract around it.
- The service-broker pattern (Section 6.2) is directly applicable to hot module replacement
  (HMR) for shared services in the harness: routing consumer requests through a broker
  component, rather than binding consumers to a single provider instance, lets a harness
  swap or upgrade a backing plugin/provider without reloading or perturbing every
  dependent plugin — this is the mechanism to reach for when a config-reload or
  hot-swap currently forces cascading restarts.
- The capability/interception model (Section 6.3) suggests concrete access-control features
  for plugin dependency injection: statically declared dependencies let the harness
  audit/approve a plugin's full capability set at load time, and context-level interception
  (rather than in-provider checks) lets an orchestrator tighten or loosen a specific plugin's
  access to a shared dependency (e.g., read-only vs. full database access) without touching
  provider code or triggering a reload.
- Section 6.3's sandboxing discussion is a reminder that declared-dependency access control
  is not a substitute for real isolation of untrusted plugins: a harness that loads third-party or
  community plugins needs an actual execution boundary (subprocess, VM, WASM
  sandbox) with a bridge fiber on the host side whose capabilities are attenuated the same
  way as trusted components' — not just an `inject`-style allow-list enforced in-process.
- Section 6.4's language-requirements analysis is a checklist for whether a given plugin
  runtime can support true dynamic composability: it needs closures (or equivalent) to carry
  inverses, an actual introduce/retract mechanism for loaded code (a module registry, dynamic
  linking, or a WASM instance lifecycle), and a transparent dependency-mediation primitive
  (Proxy-like interposition) rather than relying purely on reflection, which costs type safety
  and DX.
- Section 6.5's mutual-dependency analysis argues that a harness encountering a dependency
  cycle between two plugins should treat it as a design smell to be resolved by decomposing
  into finer-grained integration components (not by adding cycle-breaking hacks), while
  acknowledging this decomposition strategy has a real component-count and cognitive-
  overhead cost that argues for harness tooling like bundling, convention-based wiring, or
  scaffolding to keep authoring burden manageable.
- Section 6.6's versioning discussion is directly relevant to plugin dependency resolution: a
  harness relying on bare key/name-based dependency lookup is exposed to both interface
  drift (a provider plugin updates its interface silently) and key collision (two unrelated
  plugins claim the same dependency key); the practical mitigation Cordis itself uses —
  peer-dependency version constraints via the host package manager — is a reasonable
  default, with namespacing or structural/interface checks as stronger but more invasive
  options.
- Section 6.7's "co-design" discussion implies that a harness built as a library on top of an
  existing language (as DSH is) inherits real risks that a purpose-built runtime would avoid:
  a component can accidentally reach another component's context via a closure or global,
  leaking an effect out of its lifecycle or a coeffect out of its dependency declaration — so a
  harness should treat any ergonomic shortcut that exposes a raw context object across plugin
  boundaries as a latent isolation bug, not just a style issue.

## Open Questions and Limitations

- Section 6.1 explicitly leaves the metatheoretic transfer of Definition 65's commutation
  result to compensation actions unproved: it is proved against the fine equivalence ≃ of
  Definition 33, and the paper states it "has to be re-established" against the coarser,
  application-supplied compensation equivalence — this re-proof is not carried out in the
  chapter.
- The trade-off of "moving the boundary" via a coeffect (cost of supplying revertible
  semantics on every access vs. benefit of tracked/revertible behavior) is stated but not
  quantified; the paper explicitly defers a fuller treatment of this co-design trade-off to
  Section 6.7 rather than resolving it in 6.1.
- Section 6.6 explicitly states that unifying the three dependency-typing/versioning
  approaches (key namespacing, peer dependencies, structural compatibility) "while
  preserving the dynamic composition guarantees of the coeffect model remains an open
  problem" — no unified model is proposed.
- Structural compatibility (Section 6.6) is flagged as undecidable once parametric
  polymorphism introduces bounded quantification, and as "complex" for behavioral
  contracts such as pre/postconditions or effect specifications; the chapter does not offer a
  tractable general algorithm, only the record-type/width-subtyping special case.
- Peer dependencies (Section 6.6), the approach Cordis currently uses, are acknowledged to
  have two unresolved limitations: reliance on providers actually following semantic
  versioning (called "an unenforceable convention") and package managers' typical
  restriction to a single resolved version per dependency, which prevents loading multiple
  versions of the same package concurrently.
- Section 6.5 concedes that finer-grained decomposition to eliminate mutual dependencies
  can cost a quadratic blow-up in integration-component count as the number of mutually
  interacting components n grows, and that this raises real developer-experience costs
  (configuration, naming, cognitive load) that the proposed mitigations (bundling,
  convention-based wiring, scaffolding) only reduce, not eliminate.
- Section 6.4 notes that ES modules provide "no public eviction API" for retracting a loaded
  module, unlike CommonJS's `require.cache`, and that any workaround must go through
  "engine-internal interfaces" — an acknowledged gap in a mainstream managed runtime's
  support for the paradigm's temporal-composability requirement.
- The entire chapter is prescriptive/exploratory rather than backed by new proofs or
  experiments: Sections 6.2–6.7 largely describe design patterns, analogies to prior systems
  (OSGi, capability security, structural subtyping, row types), and future co-design
  directions (a purpose-built language or OS) without implementing or formally verifying
  them within the paper itself.
