# SNMP laboratory from Android Emulator
Branch: codex/snmp-lab. Delivery: exception-ok, explicitly approved; local Git only, no remote operations authorized. Original forecast 900–1200 lines was exceeded; workspace assessment included 3927 lines with prior RF01/environment changes. Preserve coherent modules with tests even above400lines.
Runner: Jest for codec/UI, Node test runner for local UDP agent, Gradle and instrumentation for Android. All five tasks verified and saved locally. Engram mirror pending: workspace memory project unresolved. No remote delivery authorized.

## Specs

### S1 — Run the agreed PC laboratory

User: "okey probemos eso que dijiste y avancemos"

Accepted context: one Android emulator and a local PC service. Implement a reproducible SNMP laboratory and a working app query. Controlled laboratory results must be identified and must not be described as a physical router or external LAN validation.

### S2 — Read basic SNMP status

User requirement:

```text
RF-02 Consultar vía SNMP: uptime, sysName, tráfico de interfaces de

un dispositivo objetivo
```

Implementation choices: SNMPv2c GetRequest/Response, four MIB-II OIDs (sysName, sysUpTime, ifInOctets and ifOutOctets for an explicitly selected interface index). Show cumulative octets, not an invented rate. Community remains only in memory. No writes to network equipment, SNMPv3, SSH, persistence or synchronization in this unit.

Checks: deterministic BER vectors and rejection cases; actual UDP exchange with the local agent; Android loopback/timeout/cancellation; app-to-PC query and timeout from the emulator. The native and lab tests do not establish a successful query to a physical router.

### S3 — Explain and validate foundations before protocols

User: "No avanzar a los protocolos SNMP/SSH todavía sin explicar y validar el fundamento."

Explain UDP transport, OIDs, request correlation, BER tags/length/value encoding and the GetRequest/Response subset while implementing. Keep the codec independent of UI and sockets. Validate transport and decoding separately before declaring the app query verified.

### S4 — Work without a physical Android

User: "no tengo acceso a ningun android"

Use the existing emulator and PC. RF01 MAC and external physical-LAN validation remain explicitly pending. Do not require another Android device to run this laboratory.

## Tasks

- T1 | S2,S3 | delegated, parallel codec writer | complete | commit a934c49e284b550fb9587b599610a35c2aa3c4fe | Pure BER codec/types; final Jest includes codec tests, independent source inspection found no blockers.
- T2 | S1,S3,S4 | delegated, parallel native writer | complete | commit 92cfd28dc20e5cd34e487e80fb32407fe2582d9f | Actual native instrumentation stream PASS/code-1 after Gradle runner selection correction; app success/timeout/cancel/retry previously observed.
- T3 | S1,S2,S4 | delegated with T1, same owner/surface | complete | commit f479b1cb49aea941add9efadef31e41013be80a9 | Five actual UDP/CLI tests passed on host. Sandbox UDP timed out; not counted as success.
- T4 | S1,S2,S3 | inline | complete | commit d0a08ba4ce18a3e0494661b5b25de011685ae4d4 | Functional client/UI, 40/40 final Jest, bundle, TypeScript/ESLint/format and actual app-to-PC query. Prior UI RED: all three cases failed on missing query button.
- T5 | S1,S2,S3,S4 | independent verification | complete | commit d0a08ba4ce18a3e0494661b5b25de011685ae4d4 | Corrected runner registration and native PASS/code-1; independent fresh TEMP Jest 24/24 plus 42 unchanged file hashes, S1-S4 laboratory verdicts PASS. No physical router/LAN/MAC acceptance claimed. Work-unit commits still await delivery strategy.


### Saved local work units

Delivery: exception-ok approved by the user; local commits only. Each identity defines its rollback boundary; dependent later units must be considered before reverting a prerequisite. No remote publication.

| Unit | Commit | Scope and observed verification |
| --- | --- | --- |
| Codec | `a934c49e284b550fb9587b599610a35c2aa3c4fe` | src/core/snmp/* and codec tests; deterministic BER vectors and rejection checks. |
| PC laboratory | `f479b1cb49aea941add9efadef31e41013be80a9` | scripts/snmp-lab.* and npm commands; five real UDP/CLI checks. |
| Android platform | `92cfd28dc20e5cd34e487e80fb32407fe2582d9f` | Native mDNS/UDP modules, Codegen, instrumentation and Windows setup; native PASS/code-1 and default/invalid runner checks. |
| Application workflow | `d0a08ba4ce18a3e0494661b5b25de011685ae4d4` | Discovery/detail/SNMP screens, adapters, navigation, tests, guides and screenshots; prior 40 Jest, five UDP and 24 independent tests, plus real emulator-to-PC success/timeout/cancel/retry. |

## Log

- L1 (2026-10-28): User request verbatim: "okey probemos eso que dijiste y avancemos".
- L2: Existing RF01/environment changes are uncommitted on the starting branch. Preserve them; do not reset or accidentally publish them. New branch codex/snmp-lab preserves this work. Commits and review boundaries must account for the pre-existing baseline.
- L3: Parallel writer reason: pure codec/local agent and Android UDP transport are independent units with disjoint edit surfaces and fixed exchange contracts; the parent owns UI, shared integration files and git. No writer runs repository-wide formatting or installs.
- L4: Native transport uses a separate TurboModule; the existing mDNS module and its lifecycle remain unchanged. Codec is dependency-free CommonJS JavaScript with TypeScript declarations so both React Native and Node use the same protocol implementation.
- L5: App laboratory endpoint is 10.0.2.2:1161, mapping to the PC loopback. Agent listens on 127.0.0.1 only. Interface counters belong to a controlled laboratory endpoint and do not claim physical-NIC measurements. Host/port remain explicit app inputs.
- L6: Existing skills loaded: work-unit-commits and cognitive-doc-design; no project skill registry found. Use existing Spanish UI/docs with neutral professional wording. Code identifiers remain English.
- L7 (2026-10-28): User request verbatim: "Hola chat, sigue haciendo el tp que venias armando porfa". Resumed from local feature document; prior child sessions no longer available. Engram current workspace has no resolved project, so memory reads/mirror remain unavailable; no fallback to unrelated projects.
- L8: Integrated client, explicit lab defaults, selected-device route, native registration and UI errors/cancellation. Community remains in memory; no result persistence. Added client regression cases for correlation, BER value types, invalid inputs and propagated timeout.
- L9: Node agent test runner passed 5/5 with host UDP permission. Initial isolated run failed three network tests with timeouts. Started one existing Android emulator, Metro and loopback lab for end-to-end proof.
- L10: Android app and androidTest x86_64 builds passed (136 tasks, 7m37s); instrumentation runtime pending. Initial full verify passed TypeScript/ESLint, then 38/40 Jest cases passed with two first-render 5s hook timeouts while host free memory was about 450 MB of 16 GB. Closed this session's emulator; later stopped the idle Gradle daemon.
- L11: A second Jest run exposed a test mock issue: virtual:true was retained after the real SNMP client file was created, so screen tests called the real native client. Removed the virtual flag; focused screen tests passed 3/3. Final full Jest passed 40/40 with --testTimeout=15000 in 12.93s. Android bundle and format check passed. No implementation change was needed for these test failures.
- L12: Independent source/isolated-test verifier is checking S1-S4. Native instrumentation and app-to-PC UI proof remain pending; no physical equipment acceptance claimed. No commits or remote operations performed; delivery strategy decision is still required by the configured review budget.
- L13: Independent source inspection found no codec/client/UDP concurrency blocker. Isolated scratch test tool did not finish; no independent execution/hashes claimed. Native instrument component was not registered; added test manifest then explicit source mapping. Both targeted builds passed but manifest tasks remained UP-TO-DATE. A scoped per-task --rerun recheck remains in progress; prior Gradle help request was aborted without output after 395 seconds, so no outcome inferred. No source correction beyond this second bounded registration correction is authorized automatically.
- L14: Actual emulator app proved SNMP query success, real timeout for incorrect community, explicit cancellation and successful retry with public/3000ms. Final captured result: TP6-LAB-PC, uptime3218.46s, interface1, in546/out209 cumulative octets. Screenshots saved under docs/evidencia/snmp-*.png. Native standalone instrumentation remains separate pending proof.
- L15: Restarted only owned MetroPID27320 after graph error500, with reset-cache/max-workers1; replacementPID12632 served working app. Emulator resolution540x1200/density210. Dismissed a Gboard stylus tutorial that intercepted automation input; offscreen taps/tutorial-typed values were not counted as successful cancellation checks.
- L16: Native review mode on by default; assessment before final test-manifest adjustments returned medium/under_budget, review_due=false (49paths/3788lines including pre-existing RF01 changes). No START, review consent or review authority created. Do not treat assessment as a final approval or a commit.
- L17: Final scoped rerun tool returned "aborted by user after 275.3s" without output or a process session ID after the parent interrupted the stalled call. Approval versus process execution cannot be inferred; no new manifest-rerun log exists. Worker stopped all commands. Registration remains unconfirmed; bounded correction rounds are exhausted, so ask one decision before another correction/investigation round. No extra app-source changes, commits, PRs or remote actions. Engram mirror remains pending because the current workspace has no resolved memory project.
- L18 (2026-10-28): Renewed user authorization verbatim: "Bien, quieres avanzar?" Continue the native-registration blocker; do not advance SSH or other features. Route: parent inline for a narrow correction if deterministic evidence identifies it; one read-only explorer runs the bounded Gradle/registration probe because the prior mapping/effective-input question exceeds the inline evidence batch. Official Android documentation confirms test manifests may customize instrumentation settings; a forced manifest task has not yet been observed executing. Preserve all prior uncommitted work and keep the Engram mirror pending while the workspace has no resolved memory project.
- L19: Observed RED registration probe: forced processDebugAndroidTestManifest executed, read the custom test manifest, then AGP injected DiscoveryInstrumentation from the Gradle DSL over its name (native-manifest-probe.log:569-599); binary APK confirmed Discovery only. Parent spot-checked the log. This disproves the previous cache hypothesis. Narrow correction: optional tp6TestSuite=discovery|udp selects the DSL runner, discovery remains default, invalid values fail explicitly. Removed the ineffective custom manifest and redundant sourceSets override. Three bounded checks planned: default preservation, invalid-property rejection, UDP APK/component execution. Guide updated with exact commands and expected PASS/code-1; no app or protocol logic changed.
- L20: Own correction checks approved: default manifest runner exactly Discovery (exit0/12s); invalid selector exit1 with exact intended error; UDP test APK build exit0/21s and binary manifest exactly UDP; daemon stopped before runtime; existing emulator installed only testAPK successfully. Native instrumentation returned stream PASS and INSTRUMENTATION_CODE -1 (native-udp-result.txt), covering actual loopback/bounds/timeout/busy/cancel/retry/close/rejected executor. No extra emulator, dependencies, app APK install or UI action. Independent final verifier now checks selector/docs/logs and attempts the previously missing isolated Jest execution once.
- L21: Independent verifier approved S1-S4 for the laboratory subset; 24/24 tests in three suites passed in a fresh host TEMP copy (23.383s). SHA256 of 42 live source/test/config/guide files unchanged. Log: C:/Users/54344/AppData/Local/Temp/tp6-independent-b70f42aaebca41848c3faf618c971311/jest-result.log. No code blocker found; stale pending docs reconciled. No further broad tests warranted because the correction changes only native runner selection; app/protocol sources stayed unchanged.
- L22: Parent spot-check reran installed UDP instrumentation: stream PASS/code-1 again (native-udp-parent-check.txt), and git diff --check passed. Final workspace assessment returned medium/under_budget, review_due=false, 52paths/3927lines including prior work (native-suite-assessment.json). No START or review authority created. All implementation checks for this laboratory unit are now observed; no SSH or new network feature added.
- L23: One delivery slicing pass: keep prior RF01/environment prerequisites separate; codec+tests =658 new lines, local lab+tests=285, native transport/spec/instrumentation=413 before integration changes; client and UI remain dependent follow-ups with their tests/docs. Keeping codec/parser invariants and their tests coherent exceeds400; the native unit also exceeds it. Recommend a size exception for coherent oversized units rather than artificial splits. No commits/PRs/pushes performed; ask one explicit local-delivery/size decision before commits. Engram mirror remains pending; current workspace project is unresolved, so no unrelated memory fallback was used.
- L24: User authorized local delivery and the proposed size exception verbatim: "Si obvio, guarda todo". Save all verified project changes in coherent Conventional Commits, with no Co-Authored-By/AI attribution. Local sequence: bounded SNMP codec+tests; loopback agent+tests/scripts; Android platform integration (mDNS/UDP native modules, Codegen, native checks and Windows setup); app discovery→SNMP workflow with tests/docs/evidence; final provenance notes. Shared package.json and native guide index snapshots will stage only the relevant portion per unit without changing working-tree source bytes. Keep generated outputs, dependencies, environment files and temporary logs ignored. No push/PR authorized.
- L25: Saved local work unit codec: a934c49e284b550fb9587b599610a35c2aa3c4fe (feat(snmp): add bounded BER codec and protocol tests). Verification evidence remains as recorded above; source bytes were not edited while staging.
- L26: Saved local work unit lab: f479b1cb49aea941add9efadef31e41013be80a9 (feat(lab): add loopback SNMP agent and UDP checks). Verification evidence remains as recorded above; source bytes were not edited while staging.
- L27: Git whitespace check required removing surplus blank lines at EOF only in new Markdown documents: docs/EMULADOR.md. No executable source changed.
- L28: Saved local work unit android: 92cfd28dc20e5cd34e487e80fb32407fe2582d9f (feat(android): add native discovery and cancellable UDP transport). Verification evidence remains as recorded above; source bytes were not edited while staging.
- L29: Saved local work unit app: d0a08ba4ce18a3e0494661b5b25de011685ae4d4 (feat(app): integrate LAN discovery and SNMP diagnostics). Verification evidence remains as recorded above; source bytes were not edited while staging.
- L30: Local committed-range assessments: codec: medium/under_budget; lab: medium/under_budget; android: medium/under_budget; app: medium/under_budget. Canonical inventory and explicit exclusion kept future untracked files outside each committed-only candidate. The initial codec assessment needed this declaration; after correction, native assessment succeeded. All ranges remain under_budget, no START/consent/review authority created. Final provenance commit will record these identities without changing executable source.
