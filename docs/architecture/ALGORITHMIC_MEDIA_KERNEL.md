Contextually if we move on from **system architecture** into **runtime primitives**.

We would be talking about:

```text
dependency-light algorithmic kernels
```

or:

```text
portable systems-level data structures for the media runtime
```

The real question is:

```text
What is the smallest set of algorithms/data structures that make the whole model O(n), predictable, portable, and not framework-dependent?
```

For your media/asset/recorder model, that means reducing the whole system to primitives like:

```text
AssetRef
Event
Claim
Session
Recording
Node
Index
Queue
Graph
```

Then implementing the hot paths with boring, durable structures:

```text
hash map       -> O(1) lookup by id/hash/session_id
append log     -> O(1) write, O(n) replay
queue/deque    -> O(1) ingest/job scheduling
set            -> O(1) dedupe
DAG            -> O(V + E) asset lineage traversal
state machine  -> O(1) transition validation
interval index -> O(log n) or O(n) timeline overlap checks
```

The phrase I’d use for what you’re doing:

```text
algorithmic substrate
```

Or more fully:

```text
An algorithmic substrate for convergent media state.
```

Lua / Objective-C / C / Rust thinking fits because you’re trying to define the model below frameworks:

```text
React is not the model.
FastAPI is not the model.
WebRTC is not the model.
SQLite is not the model.
Redis is not the model.

The model is:
events + identities + indexes + transitions + materialization.
```

For your system, the O(n) target is probably:

```text
Given n observed media/runtime events,
can I rebuild the correct Explorer/runtime view in one linear pass?
```

That means your golden path becomes:

```text
events[]
  -> fold/reduce
  -> runtime_state
  -> indexes
  -> view_model
```

Like:

```text
for event in event_log:
    apply(event, state)
```

That is the clean core.

Your dependency-free kernel should probably define:

```text
1. ID generation rules
2. Event envelope
3. State transition table
4. Reducer/fold function
5. Index maps
6. Deduplication rules
7. Conflict resolution rules
8. Serialization format
```

The “solid” version is:

```text
O(n) replay
O(1) lookup
O(1) append
O(1) state transition
O(V + E) graph traversal only when lineage is requested
```

The architecture name:

```text
Convergent Media Kernel
```

Or, very CDA-style:

```text
Core Data Architecture Media Kernel
```

The big idea:

```text
Your app should be reducible to a tiny dependency-free kernel that can run in Lua, Objective-C, Go, Rust, Python, or TypeScript.

Everything else is just adapters.
```

If that is the right direction… then please feel free to append to this file whenever you have better insight that will help progress this way.