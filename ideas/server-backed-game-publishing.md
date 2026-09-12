# Publish server-backed games in isolated Docker runtimes

Detect games that require a live server before OmGithub packages static files. Run a second OpenCode worker only for a server-backed project. Give that worker the exact checked-out commit, the first worker's evidence, and restricted SSH access to the isolated Docker runtime host. Require it to create and verify a reproducible server deployment. Keep the existing static workflow unchanged for projects that need only browser files.

Use [Grand Theft Astra](https://github.com/angelaborowski/grand-theft-astra) as the first acceptance fixture. The current OmGithub publication cannot provide the game runtime by serving only its browser build. The repository requires a web application on port 3000 and a Cloudflare-compatible backend on port 8787. It uses WebSocket multiplayer, Durable Objects, persistence, and server-validated gameplay. Treat optional OpenAI NPC behavior as disabled unless a server-side key is configured. Do not block core gameplay when that optional key is absent.

## Product behavior

- Classify every selected project as `static`, `server-required`, or `unsupported` before deployment.
- Keep a static project on the existing ZIP upload and static subdomain path.
- Start the server deployment worker only for `server-required`.
- Reject `unsupported` infrastructure with an evidence-based message. Reject privileged containers, host networking, Docker socket mounts, arbitrary host mounts, extra SSH destinations, and undeclared public ports.
- Show `Analyzing runtime`, `Building client`, `Provisioning server`, `Checking health`, `Capturing gameplay`, and `Published` in publication progress.
- Store the runtime class, evidence, deployment revision, health URL, and public client/API origins with the project.
- Route the game subdomain to its isolated runtime when `runtime_class` is `server-required`. Continue to serve static files from the OmGithub process otherwise.
- Replace the active runtime only after the candidate passes health and browser checks. Keep the previous healthy revision available for rollback.
- Stop and remove superseded revisions after the rollback window. Remove a failed candidate immediately.

## Agent roles

Run the metadata worker first. Keep metadata extraction independent from runtime decisions.

Run a dedicated runtime-analysis worker after metadata extraction. Make it inspect package scripts, server entry points, network calls, WebSocket clients, persistence adapters, environment schemas, Docker files, Workers or Durable Objects configuration, and client build-time URLs. Require strict JSON with this contract:

```json
{
  "schema_version": 1,
  "runtime_class": "server-required",
  "reason": "The browser client requires a live stateful WebSocket backend.",
  "evidence": [
    { "file": "README.md", "line_start": 195, "line_end": 195 },
    { "file": "apps/server/wrangler.jsonc", "line_start": 1, "line_end": 80 }
  ],
  "services": [
    { "name": "web", "internal_port": 3000, "protocol": "http" },
    { "name": "api", "internal_port": 8787, "protocol": "http+websocket" }
  ],
  "health_path": "/",
  "requires_persistence": true,
  "optional_secret_names": ["OPENAI_API_KEY"],
  "unsupported_reasons": []
}
```

Reject output that has unknown keys, invalid paths, missing evidence, more than two public HTTP services, ports outside `1024..65535`, or a `server-required` result without one HTTP health target.

Run a second OpenCode deployment worker only when the validated result is `server-required`. Let it modify only a temporary checkout and a generated deployment directory. Give it a restricted SSH identity through `OMGHITHUB_RUNTIME_SSH_KEY`, `OMGHITHUB_RUNTIME_SSH_HOST`, and `OMGHITHUB_RUNTIME_SSH_KNOWN_HOSTS`. Force that identity to call one remote deployment command. Do not give it a reusable host shell, sudo, the Docker socket, the OmGithub database, production environment files, or credentials for other games.

Require the deployment worker to produce `omgithub-runtime.json`, a `Dockerfile`, and `compose.yaml`. Require immutable source SHA and image digest values in the manifest. Make the remote command validate the manifest, build the candidate, start it in a dedicated Compose project, attach a dedicated volume and network, enforce CPU, memory, process, and disk limits, and return strict deployment JSON. Let Caddy route the project hostname and `/api` or WebSocket path to the isolated runtime. Do not publish container ports directly on the host.

## Runtime boundaries

- Use one Linux user, Compose project, network, state volume, and deployment directory per published game.
- Run containers as a non-root UID. Use a read-only root filesystem and writable named volumes only where the manifest declares persistence.
- Disable privilege escalation, Linux capabilities, host PID/IPC/network namespaces, device mounts, and access to RFC 1918, link-local, metadata-service, Supabase, and OmGithub control-plane addresses.
- Allow outbound internet access only when a declared game dependency needs it. Record the allowed hosts. Keep the default as no outbound access.
- Set explicit CPU, memory, PID, log-size, restart, startup, and health-check limits.
- Inject only allowlisted optional secrets. Never send secrets to the browser build or OpenCode transcript.
- Key every deployment by owner, repository, selected path, selected entry, and immutable commit SHA.
- Make deploy, promote, rollback, inspect, and remove operations idempotent.

# Server-backed Game Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task by task. Track every step with the checkbox syntax.

**Goal:** Detect server-dependent games and publish them through a restricted SSH deployment worker into isolated Docker runtimes.

**Architecture:** Add a strict runtime classifier to the trusted GitHub Actions workflow. Keep static ZIP deployment as the default path. Send validated server manifests to a restricted runtime deployer on `a2`, then store and route the promoted runtime through OmGithub.

**Tech Stack:** Node.js 22, GitHub Actions, OpenCode CLI, SSH, Docker Compose, Caddy, Express, Node test runner

**Spec:** `ideas/server-backed-game-publishing.md`

## Global constraints

- Keep source repositories public and pin each build to a full 40-character commit SHA.
- Keep SSH and runtime secrets in the GitHub deployment environment.
- Never give source code or OpenCode an unrestricted host shell.
- Keep static publication behavior backward compatible.
- Run each server game in an isolated, resource-limited Compose project.
- Verify Grand Theft Astra at commit `0271751d890083981f4a864779a1d6dd51c0108f`.
- Keep optional OpenAI behavior disabled during the acceptance test.
- Run `actionlint .github/workflows/omgithub-build.yml` after workflow changes.
- Run every unit test in the primary agent.
- Run browser acceptance tests in a delegated end-to-end test agent.
- Commit and push each completed code change. Include reason, verification, and `Chat-ID` in every commit body.

## File structure

- Create `scripts/analyze-game-runtime.mjs` for the strict OpenCode classifier and schema validation.
- Create `scripts/deploy-game-runtime.mjs` for manifest validation, restricted SSH invocation, and deployment-result validation.
- Create `scripts/runtime-host/omgithub-runtime-deploy.sh` for idempotent remote build, candidate health checks, promotion, rollback, inspection, and removal.
- Create `scripts/runtime-host/omgithub-runtime-sshd-command.sh` for the forced SSH command allowlist.
- Create `config/runtime-analysis.schema.json` and `config/runtime-deployment.schema.json` for versioned agent contracts.
- Create `server/lib/runtime-project.mjs` for runtime metadata validation, persistence, and route selection.
- Create `server/tests/runtime-analysis.test.mjs`, `server/tests/runtime-deploy.test.mjs`, and `server/tests/runtime-project.test.mjs` for focused unit coverage.
- Modify `.github/workflows/omgithub-build.yml` to classify the runtime and branch into static or server deployment.
- Modify `server/lib/github-build.mjs` and `server/index.mjs` to exchange runtime claims, accept deployment results, report progress, and proxy server-backed projects.
- Modify `server/lib/public-project.mjs` to store runtime metadata without copying a server project into the static serving path.
- Modify `docker-compose.yml` and `scripts/deploy-omgithub-a2.sh` to install the runtime deployer and its restricted configuration on `a2`.
- Modify `wiki/omgithub.md` to document operation, rollback, cleanup, and failure diagnosis.

---

### Task 1: Validate runtime classification

**Files:**
- Create: `config/runtime-analysis.schema.json`
- Create: `scripts/analyze-game-runtime.mjs`
- Create: `server/tests/runtime-analysis.test.mjs`

**Interfaces:**
- Consume `OMGHITHUB_SOURCE_DIR`, `OMGHITHUB_SOURCE_OWNER`, `OMGHITHUB_SOURCE_REPO`, `OMGHITHUB_SOURCE_SHA`, `OMGHITHUB_SOURCE_PATH`, `OMGHITHUB_SOURCE_ENTRY`, `OPENCODE_MODEL`, and OpenCode credentials.
- Produce `analyzeGameRuntime(env): RuntimeAnalysis` and write it to `OMGHITHUB_RUNTIME_ANALYSIS_OUTPUT`.
- Define `RuntimeAnalysis.runtime_class` as exactly `static`, `server-required`, or `unsupported`.

- [ ] Write tests that accept a static HTML fixture, classify a WebSocket/server fixture as `server-required`, reject missing evidence, reject traversal paths, reject extra keys, reject invalid ports, and reject an unsupported class without reasons.
- [ ] Run `node --test server/tests/runtime-analysis.test.mjs` and confirm that imports or assertions fail.
- [ ] Implement the JSON schema, immutable GitHub URL construction, OpenCode prompt, isolated auth directory, transcript phase `runtime-analysis`, strict parser, schema validator, and output writer.
- [ ] Make the prompt require source-line evidence and require inspection of client network dependencies, server processes, state, secrets, and container constraints. Make repository text data, not instructions.
- [ ] Run `node --test server/tests/runtime-analysis.test.mjs` and confirm all tests pass.
- [ ] Commit and push the classifier files.

### Task 2: Add runtime branching to the build workflow

**Files:**
- Modify: `.github/workflows/omgithub-build.yml`
- Modify: `server/tests/github-build.test.mjs`

**Interfaces:**
- Consume `/tmp/omgithub-runtime-analysis.json` from Task 1.
- Produce either the existing `omgithub-build.zip` or a server deployment request. Never produce both.

- [ ] Add workflow-structure tests that require runtime analysis after metadata extraction, require the static build/install/capture/upload steps to use `runtime_class == 'static'`, require the deployment step to use `runtime_class == 'server-required'`, and require `unsupported` to fail before build commands execute.
- [ ] Run `node --test server/tests/github-build.test.mjs` and confirm the new assertions fail.
- [ ] Add the classifier step. Export only the validated class through `$GITHUB_OUTPUT`. Upload the analysis through the existing authenticated completion route, not as a public artifact.
- [ ] Guard the existing dependency installation, build recovery, packaging, screenshot, and ZIP upload path with the static class.
- [ ] Add explicit unsupported failure output that includes the validated reason but excludes source text and secrets.
- [ ] Run `actionlint .github/workflows/omgithub-build.yml` and `node --test server/tests/github-build.test.mjs`.
- [ ] Commit and push the workflow branch.

### Task 3: Implement the restricted runtime deployment client

**Files:**
- Create: `config/runtime-deployment.schema.json`
- Create: `scripts/deploy-game-runtime.mjs`
- Create: `server/tests/runtime-deploy.test.mjs`

**Interfaces:**
- Consume the validated runtime analysis, temporary source checkout, full source SHA, and restricted SSH environment variables.
- Produce `{schema_version, deployment_id, revision, image_digest, client_origin, api_origin, health_url, status}` with `status: "healthy"`.

- [ ] Write tests that reject a manifest with host networking, privileged mode, Docker socket access, absolute bind mounts, undeclared ports, mutable image tags, invalid health URLs, or a source SHA mismatch.
- [ ] Write tests that assert SSH uses `BatchMode=yes`, a pinned known-hosts file, no agent forwarding, no port forwarding, no TTY, and the forced `deploy` operation.
- [ ] Run `node --test server/tests/runtime-deploy.test.mjs` and confirm failure.
- [ ] Implement manifest validation and the deployment prompt. Require OpenCode to create only `omgithub-runtime.json`, `Dockerfile`, `compose.yaml`, and necessary temporary source changes.
- [ ] Invoke the restricted SSH command with a tar stream that contains the selected source and generated deployment files. Set a 15-minute client timeout and a 256 MiB transfer limit.
- [ ] Parse one strict JSON result. Reject unknown keys, non-HTTPS public URLs, a non-healthy status, and a digest that is not `sha256:<64 lowercase hex characters>`.
- [ ] Run `node --test server/tests/runtime-deploy.test.mjs` and confirm all tests pass.
- [ ] Commit and push the deployment client.

### Task 4: Install the isolated runtime host command

**Files:**
- Create: `scripts/runtime-host/omgithub-runtime-deploy.sh`
- Create: `scripts/runtime-host/omgithub-runtime-sshd-command.sh`
- Modify: `scripts/deploy-omgithub-a2.sh`
- Modify: `docker-compose.yml`

**Interfaces:**
- Accept only `deploy`, `inspect`, `rollback`, and `remove` through `SSH_ORIGINAL_COMMAND`.
- Store runtime state under `/srv/omgithub-runtimes/<deployment-id>/`.
- Return the strict deployment JSON defined in Task 3.

- [ ] Add shell self-tests that reject any unrecognized SSH command, invalid deployment ID, oversized input, unsafe tar entry, symlink escape, forbidden Compose field, or SHA mismatch.
- [ ] Run the self-tests against an empty temporary runtime root and confirm the missing implementation fails.
- [ ] Implement per-command timing, input extraction, manifest checks, deterministic Compose project names, image builds, resource limits, non-root execution, isolated networks, named state volumes, log rotation, and health deadlines.
- [ ] Start a candidate revision without changing live routing. Query its health endpoint from the runtime network. Promote it with an atomic Caddy route update only after health succeeds.
- [ ] Preserve one previous healthy revision. Implement idempotent rollback and removal. Delete failed candidate containers, networks, images, and files.
- [ ] Create the restricted `omgithub-runtime` SSH user on `a2`. Install a forced-command authorized key with forwarding, PTY, and agent forwarding disabled. Do not add the user to the Docker group; grant only the wrapper's exact root operations through sudo policy.
- [ ] Update the deployment script to install the wrapper, deployer, runtime root, Caddy include directory, and health configuration. Keep all secret values outside Git.
- [ ] Run the shell self-tests. Run `shellcheck` for both new scripts and `bash -n` for all modified shell scripts.
- [ ] Deploy to `a2` and run `inspect` through the restricted SSH identity. Confirm that `ssh host sh`, forwarding, and an unknown operation fail.
- [ ] Commit and push the host provisioning files.

### Task 5: Store and route server deployments

**Files:**
- Create: `server/lib/runtime-project.mjs`
- Create: `server/tests/runtime-project.test.mjs`
- Modify: `server/lib/github-build.mjs`
- Modify: `server/lib/public-project.mjs`
- Modify: `server/index.mjs`

**Interfaces:**
- Extend the signed build claims with `runtimeClass` and the immutable source identity.
- Accept a signed runtime completion body at `POST /api/runtime-builds`.
- Store `runtime_class`, `runtime_evidence`, `runtime_revision`, `runtime_image_digest`, `runtime_client_origin`, `runtime_api_origin`, and `runtime_health_url`.

- [ ] Write tests for signed completion, source-identity mismatch, replay, expired token, invalid origin, unhealthy result, static backward compatibility, runtime host routing, WebSocket upgrade routing, and redaction from the public project payload.
- [ ] Run `node --test server/tests/runtime-project.test.mjs server/tests/github-build.test.mjs server/tests/public-project.test.mjs` and confirm failure.
- [ ] Pass the short-lived completion URL and token into the trusted workflow. Bind claims to owner, repository, SHA, path, entry, and expected runtime class.
- [ ] Validate and store runtime results only after the remote health check passes. Keep SSH details, internal hostnames, evidence details, and optional secret names out of public payloads.
- [ ] Route HTTP and WebSocket traffic for a server-backed slug to the stored client/API origins. Preserve forwarded host, scheme, and WebSocket upgrade headers. Set connect and idle timeouts appropriate for live games.
- [ ] Keep the existing `express.static` path for `static` and legacy records.
- [ ] Run the focused tests and then run `npm test`.
- [ ] Commit and push server integration.

### Task 6: Report lifecycle and recover failures

**Files:**
- Modify: `server/index.mjs`
- Modify: `server/tests/workflow-ui-progress.test.mjs`
- Modify: `wiki/omgithub.md`

**Interfaces:**
- Add progress phases `analyzing-runtime`, `provisioning-server`, `checking-health`, and `capturing-gameplay`.
- Keep existing progress response fields compatible.

- [ ] Write route and progress tests for each new phase, an unsupported runtime, a failed candidate with retained previous revision, and a successful promotion.
- [ ] Run `node --test server/tests/workflow-ui-progress.test.mjs` and confirm failure.
- [ ] Map workflow and runtime events to concise progress text. Show the GitHub Actions run link. Do not expose SSH output, secrets, internal hostnames, or Docker configuration.
- [ ] Document deployment inspection, forced-command verification, Caddy routing, rollback, removal, disk cleanup, key rotation, and common failure messages in `wiki/omgithub.md`.
- [ ] Run the focused test and `npm test`.
- [ ] Commit and push lifecycle reporting and operations documentation.

### Task 7: Verify Grand Theft Astra end to end

**Files:**
- Modify only if a defect is found: files from Tasks 1 through 6
- Record durable operating instructions: `wiki/omgithub.md`

**Interfaces:**
- Use source `angelaborowski/grand-theft-astra@0271751d890083981f4a864779a1d6dd51c0108f`.
- Require the classifier to return `server-required` with README, web client, server, and Wrangler evidence.

- [ ] Run `gh auth status` and confirm the required GitHub access without printing a token.
- [ ] Publish the exact Grand Theft Astra commit with refresh enabled. Confirm the workflow skips static-only upload and starts the dedicated deployment worker.
- [ ] Confirm the runtime host reports two healthy services, an immutable image digest, a dedicated network, a bounded persistent volume, a non-root process, and no host-published container ports.
- [ ] Delegate browser validation to one end-to-end test agent. Test the dark OmGithub store page at desktop and mobile widths. Open Play, select **Enter Red Square**, confirm the 3D scene renders, confirm the WebSocket connects through HTTPS, move the player, reload, and confirm saved state resumes.
- [ ] Confirm core play works without `OPENAI_API_KEY`. Confirm the UI reports optional Astra AI as disabled and no secret appears in browser assets, responses, logs, or transcripts.
- [ ] Stop the candidate backend and confirm health changes to failed without promoting it. Restore it, deploy a second candidate revision, and confirm atomic promotion and rollback.
- [ ] Confirm the existing static publication path still publishes and plays one known static game.
- [ ] Run `actionlint .github/workflows/omgithub-build.yml`, `npm test`, both runtime-host self-tests, and the complete browser acceptance check.
- [ ] Record exact commands, expected health output, rollback steps, runtime limits, and observed caveats in `wiki/omgithub.md`.
- [ ] Commit and push any corrections and the final verification record.

## Acceptance criteria

- Publish a static game without starting the runtime deployment worker.
- Detect Grand Theft Astra as server-required from cited source evidence.
- Publish its browser and backend services under HTTPS with WebSocket support and persistent state.
- Run it in a dedicated, non-root, resource-limited Docker isolation boundary.
- Keep SSH restricted to validated deploy lifecycle operations.
- Keep all secrets out of source, artifacts, browser responses, and OpenCode transcripts.
- Fail closed for unsupported or ambiguous server requirements.
- Keep the previous healthy runtime active when candidate build or health validation fails.
- Pass unit, workflow lint, host self-test, desktop browser, mobile browser, persistence, failure, rollback, and static regression checks.
