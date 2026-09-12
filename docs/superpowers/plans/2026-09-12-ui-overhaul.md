# OmGithub UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Complete each checkbox in order.

**Goal:** Replace the current frontend with a distinctive, responsive dark product interface while preserving all routes and generation workflows.

**Architecture:** Keep the Vue route and data boundaries unchanged. Recompose the global shell, home page, project cards, forms, studio, profile, and store through semantic templates and one shared token-driven stylesheet. Verify the visual contract with source-level tests, a production build, and browser checks at desktop and mobile widths.

**Tech Stack:** Vue 3, Vue Router, Vite, CSS, Node test runner

**Spec:** User request in the current Codex task.

## Global Constraints

- Change at least 50% of frontend UI lines.
- Preserve routes, API calls, repository selection, generation, publication, and review behavior.
- Use a dark theme at desktop and mobile widths.
- Use short, purposeful transitions and support reduced motion.
- Commit and push the completed code change.

---

### Task 1: Define the visual contract

**Files:**
- Create: `src/tests/ui-contract.test.mjs`

**Interfaces:**
- Consume: Vue templates and `src/style.css`.
- Produce: Assertions for the new shell, editorial hero, navigation, card affordance, responsive layout, and reduced-motion rules.

- [x] **Step 1: Write the failing contract test.**
- [x] **Step 2: Run `node --test src/tests/ui-contract.test.mjs` and confirm that the new selectors are absent.**
- [x] **Step 3: Keep the test unchanged while implementing the interface.**

### Task 2: Recompose the application shell and discovery page

**Files:**
- Modify: `src/App.vue`
- Modify: `src/views/HomeView.vue`
- Modify: `src/components/GameCard.vue`

**Interfaces:**
- Consume: Existing router links, `me`, project data, and generation composer methods.
- Produce: `site-header`, `hero-layout`, `signal-strip`, `catalog-header`, and `card-arrow` elements.

- [x] **Step 1: Replace the header hierarchy and add clear active, external, and account affordances.**
- [x] **Step 2: Replace the centered hero with an editorial split layout and a compact proof strip.**
- [x] **Step 3: Add a visual project-card footer while preserving its route and remix actions.**

### Task 3: Replace the complete visual system

**Files:**
- Modify: `src/style.css`

**Interfaces:**
- Consume: Existing and new semantic class names in all Vue views.
- Produce: Shared color, type, spacing, surface, focus, motion, desktop, and mobile rules.

- [x] **Step 1: Replace global tokens, typography, header, hero, composer, and catalog styles.**
- [x] **Step 2: Replace studio, profile, repository, store, social, modal, publication, and responsive styles.**
- [x] **Step 3: Add fine-pointer hover gates and reduced-motion overrides.**

### Task 4: Verify and deliver

**Files:**
- Modify only files required by verification fixes.

**Interfaces:**
- Consume: Completed UI and test contract.
- Produce: Passing tests, successful Vite build, desktop and mobile dark-theme evidence, and pushed Git commit.

- [x] **Step 1: Run `node --test src/tests/ui-contract.test.mjs`.**
- [x] **Step 2: Run `npm test` and `npm run build`.**
- [x] **Step 3: Validate the UI in a browser at desktop and mobile widths.**
- [x] **Step 4: Measure changed frontend lines and confirm at least 50%.**
- [x] **Step 5: Commit with verification evidence and the current Chat-ID, then push.**
