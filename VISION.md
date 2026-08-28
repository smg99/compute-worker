# Compute Worker Vision

## 1. CORE IDEA
The Compute Worker is a reusable local execution layer.

It lives on the user's machine and provides authorized compute capabilities to multiple products.

It must NOT belong to a particular product.

For example:
```text
RTO Slot Booking
        \
X Founder Worker -----> Compute Worker
        /
Future products -------/
```

The Compute Worker handles the machine-level execution concerns.

Individual products should not each build their own compute daemon, process manager, telemetry system, installer, machine identity system, or resource-management layer.

## 2. CONTROL-PLANE ARCHITECTURE
The long-term architecture should be:

```text
                    PRIVATE CONTROL PLANE
                   Developer/Admin Dashboard
                            |
                     Worker policies
                            |
             +--------------+--------------+
             |                             |
       Compute Worker #1              Compute Worker #2
             |                             |
       +-----+------+                 +----+------+
       |            |                 |           |
     XMRig     Founder Worker       XMRig     Future Workload
       |            |                 |           |
       +------------+-----------------+-----------+
                            |
                       User machine
```

The control plane should eventually allow the developer/operator to see and manage the compute-worker fleet.

The dashboard should eventually show things such as:
- total workers
- online/offline workers
- worker health
- installed capabilities
- active workload
- CPU utilization
- hashrate where applicable
- workload uptime
- worker version
- last heartbeat
- errors
- policy state
- consent state

Do not over-specify the final UI yet.

## 3. PRODUCT INTEGRATION MODEL
Products should integrate with the Compute Worker rather than containing compute infrastructure themselves.

First integrations:
1. RTO Slot Booking Chrome Extension
2. X Founder Worker

Future products should be able to integrate through the same interface.

The RTO extension should NOT contain XMRig or mining infrastructure.

The RTO extension should simply be able to determine:
- Is a Compute Worker installed?
- Is it online?
- Is it authorized?
- Is compute enabled?
- Is the required workload capability available?

If the required Compute Worker state is not satisfied, the RTO automation should remain unavailable.

Conceptually:
```text
Product
  ↓
Compute Worker availability check
  ↓
Authorized?
  ↓
Required capability available?
  ↓
Product may operate
```

The exact protocol should be designed later.

## 4. PRODUCT-AGNOSTIC WORKLOAD MODEL
Do NOT design the worker around "mining" only.

The core abstraction should be: **WORKLOAD**

Examples:
- xmrig
- founder-worker
- future CPU workload
- future GPU workload
- future AI/inference workload
- future distributed compute workload

The worker should eventually support workload adapters.

Conceptually:
```text
Compute Worker
    |
    +-- Workload Manager
            |
            +-- XMRig Adapter
            |
            +-- Founder Worker Adapter
            |
            +-- Future Adapter
            |
            +-- Future Adapter
```

The worker should manage lifecycle and resource policy while workload-specific logic lives in adapters.

## 5. INITIAL MINING USE CASE
The first major compute workload is XMRig.

We previously used XMRig for Salvium (SAL), which uses RandomX.

The system should therefore support XMRig as an initial workload.

However: **DO NOT assume the worker only mines Salvium.**

The long-term control plane should allow the developer/operator to choose the supported mining target/configuration remotely.

Potential configuration concepts:
- coin
- algorithm
- pool
- wallet
- CPU threads
- CPU utilization
- priority
- affinity
- auto-start
- auto-restart

The worker should receive an authorized policy and apply it locally.

Do not implement actual coin-switching yet. Document it as a future capability.

## 6. IMPORTANT: SOLANA CLARIFICATION
Document that SOL itself is not a PoW-mined coin.

The previous reference to "SOL mining" was incorrect.

The architecture therefore must distinguish:
- **Direct mining:** XMRig → supported RandomX/PoW asset
- **Economic target:** mined asset → potentially converted/swapped to SOL externally

Do not design a fictitious "SOL mining algorithm."

## 7. EXPLICIT USER CONSENT
This is a critical architectural requirement.

The Compute Worker must have persistent local consent state.

Conceptually:
```text
COMPUTE WORKER

Status: ENABLED
Owner Consent: YES
CPU Limit: 70%
Allowed Workloads:
  ✓ XMRig
  ✓ Founder Worker
```

The worker must have a local mechanism to disable compute.

The remote control plane must NOT be able to silently override the user's local ability to disable compute.

The user should always be able to stop/disable the worker locally.

Document this as a core trust and security property.

## 8. RESOURCE MANAGEMENT
The worker should eventually support resource policies.

At minimum:
- CPU percentage
- CPU threads
- process priority
- workload limits
- optional GPU allocation in the future
- thermal/resource safety considerations where practical

Example:
`CPU allocation: 70%` or `CPU threads: 12 / 16`

The exact implementation is TBD.

The worker should never assume unlimited machine resources.

## 9. LOCAL API
The worker should eventually expose a secure LOCAL control interface.

Conceptually:
```text
Product
  ↓
localhost authenticated API
  ↓
Compute Worker
  ↓
Workload
```

The local API should eventually support concepts such as:
- worker status
- capabilities
- consent state
- current workload
- start workload
- stop workload
- workload health
- resource policy
- worker version

The API should be localhost-only by default.

Do NOT expose XMRig's control API directly to the internet.

The Compute Worker should sit between applications and XMRig.

## 10. XMRig PROCESS MANAGEMENT
The worker should eventually manage XMRig as a child process.

Responsibilities may include:
- launch
- stop
- restart
- crash detection
- health checking
- configuration generation
- CPU/resource configuration
- status collection
- hashrate collection
- accepted shares
- uptime
- controlled updates

XMRig should be treated as one workload adapter, not as the Compute Worker itself.

## 11. WORKER IDENTITY
Every installed worker should eventually have a unique worker identity.

Potential model:
```json
{
  "worker_id": "...",
  "installation_id": "...",
  "version": "...",
  "platform": "...",
  "capabilities": [],
  "last_seen": "...",
  "consent_state": "..."
}
```

Avoid invasive fingerprinting.

Worker identity should be generated and stored locally.

The control plane should not require hardware fingerprinting to identify workers.

## 12. TELEMETRY
The Compute Worker should eventually have its own telemetry model.

Telemetry should be privacy-conscious.

Potential events:
- WORKER_INSTALLED
- WORKER_STARTED
- WORKER_STOPPED
- WORKER_ONLINE
- WORKER_OFFLINE
- WORKLOAD_STARTED
- WORKLOAD_STOPPED
- WORKLOAD_CRASHED
- WORKLOAD_RESTARTED
- POLICY_UPDATED
- CAPABILITY_DETECTED
- CONSENT_ENABLED
- CONSENT_DISABLED
- HEARTBEAT
- ERROR

For XMRig:
- hashrate
- accepted shares
- rejected shares
- uptime

No unnecessary PII.

Do not collect:
- personal files
- arbitrary command output
- browser contents
- passwords
- cookies
- private keys
- unrelated machine data

## 13. REMOTE CONTROL PLANE
Eventually the developer/operator should have a private dashboard.

The dashboard should be able to manage policies such as:
- Compute enabled
- Target workload
- Mining configuration
- CPU allocation
- Auto-start
- Auto-restart

The control plane should NOT directly execute arbitrary shell commands on workers.

Prefer structured policies and explicitly supported workload capabilities.

For example:
**GOOD:**
`workload = xmrig, cpu_limit = 70, algorithm = randomx, pool = configured_pool`

**AVOID:**
`execute = "arbitrary shell command"`

This is a major security boundary.

## 14. SECURITY MODEL
Security should be designed from the beginning.

Requirements:
- no privileged secrets in browser extensions
- no service-role database keys in client applications
- no arbitrary remote shell execution
- localhost API protected
- authenticated worker/control-plane communication
- explicit authorization
- local kill switch
- bounded workload capabilities
- signed/verified updates eventually
- secure configuration handling
- secrets never logged
- wallet/private keys handled carefully
- no unnecessary telemetry
- no stealth or concealment mechanisms

The system should be transparent to the machine owner.

## 15. INSTALLATION EXPERIENCE
Installation should be extremely simple.

This is a major product requirement.

Target:
- **Windows:** one simple installer
- **macOS:** one simple installer

Eventually, potentially:
- **Windows:** single install command or installer
- **macOS:** single install command or installer

The user should not need:
- Docker
- Python
- Node.js
- manually installed dependencies
- complicated configuration
- manual XMRig installation

The worker should package/manage its dependencies appropriately.

Do not implement this yet.

## 16. CROSS-PLATFORM
Primary targets:
- Windows
- macOS

Linux can be considered later.

The architecture should avoid unnecessary OS-specific coupling.

Platform-specific process management may be implemented behind a common interface.

## 17. OFFLINE OPERATION
The worker should continue to function safely if the control plane is temporarily unavailable.

For example:
If the worker already has an authorized local policy:
```text
internet disappears
        ↓
worker continues according to local policy
```

However, remote policy changes cannot be received while offline.

The worker should have safe defaults.

Document policy expiration/revocation as a future design problem.

## 18. CONTROL-PLANE FAILURE
The system should not become unusable simply because the dashboard is temporarily offline.

Distinguish:
- local authorization
- remote policy
- workload state

A local kill switch should always work.

## 19. FUTURE FLEET MANAGEMENT
The architecture should eventually support many workers.

Potentially:
- 10 workers
- 100 workers
- 1,000 workers
- 10,000+ workers

Do not optimize for that scale today.

But avoid architecture that makes fleet management fundamentally impossible.

Eventually the dashboard could provide:
- worker groups
- tags
- workload assignment
- policies
- version rollout
- health monitoring
- fleet statistics

## 20. FUTURE COMPUTE MARKETPLACE / WORKLOAD SYSTEM
Keep this as a long-term vision only.

Eventually the Compute Worker could become a general platform for authorized compute workloads.

Possible workloads:
- mining
- Founder Worker
- AI inference
- rendering
- distributed computation
- benchmarking
- data processing
- other legitimate compute workloads

A workload should declare:
- required capabilities
- resource requirements
- permissions
- version
- configuration schema

The Compute Worker decides whether it is authorized and capable of running it.

## 21. RELATIONSHIP TO RTO
RTO Slot Booking is the FIRST integration.

The RTO project should remain separate.

It should communicate with Compute Worker through the documented local interface.

RTO should NOT:
- bundle XMRig
- manage mining directly
- contain mining configuration
- expose mining controls
- implement its own process manager

The RTO extension should effectively treat Compute Worker as an infrastructure dependency.

If Compute Worker isn't authorized/available, RTO automation does not start.

## 22. RELATIONSHIP TO X FOUNDER WORKER
X Founder Worker is the SECOND planned integration.

It should use the same Compute Worker infrastructure.

Do not duplicate:
- machine identity
- process management
- resource controls
- worker telemetry
- installer
- remote configuration
- health monitoring

The goal is:
```text
ONE worker installation
        ↓
MANY products/workloads
```

## 23. PROJECT BOUNDARIES
**Compute Worker owns:**
- ✓ local compute execution
- ✓ workload lifecycle
- ✓ resource policy
- ✓ worker identity
- ✓ local consent
- ✓ local API
- ✓ workload adapters
- ✓ worker telemetry
- ✓ health monitoring
- ✓ process management
- ✓ installation/update infrastructure

**Products own:**
- ✓ product-specific UI
- ✓ product logic
- ✓ product workflows
- ✓ product-specific business rules

**Control plane owns:**
- ✓ fleet visibility
- ✓ policy management
- ✓ configuration
- ✓ analytics
- ✓ authorized workload assignment

## 24. DEVELOPMENT PHILOSOPHY
Do not over-engineer the first version.

Priority:
1. Extremely simple
2. Reliable
3. Secure
4. Easy to install
5. Easy to integrate
6. Easy to observe
7. Expand only when real use requires it

The first implementation should be the smallest useful Compute Worker.

Do not build a giant distributed-computing platform immediately.

## 25. INITIAL MVP
The eventual MVP should probably be:
1. Windows + macOS worker
2. Worker identity
3. Explicit local consent
4. Local authenticated API
5. Basic resource policy
6. XMRig adapter
7. Founder Worker adapter
8. Start/stop/status
9. Basic health monitoring
10. Basic telemetry
11. Secure connection to control plane
12. Simple installation

Everything else can follow later.

## 26. OPEN QUESTIONS / FUTURE DESIGN
- Exact worker language/runtime
- Windows service vs background application
- macOS launch daemon/agent architecture
- authentication protocol
- worker registration
- policy signing
- policy expiration
- offline policy behavior
- update mechanism
- signed binaries
- workload sandboxing
- resource enforcement
- XMRig packaging
- wallet secret handling
- pool configuration
- Supabase schema
- dashboard architecture
- fleet grouping
- worker revocation
- compromised worker handling
- version compatibility
- API versioning

## 27. KEY PRINCIPLE
"Build the Compute Worker once. Every future product should plug into it rather than reinventing machine compute infrastructure."

**Architectural rule:**
"The Compute Worker is the execution layer. Products request authorized capabilities; they do not own the machine."

---

**STATUS:**
VISION / PRE-IMPLEMENTATION

**NEXT STEP:**
Review the architecture and then create the smallest possible Compute Worker MVP.
