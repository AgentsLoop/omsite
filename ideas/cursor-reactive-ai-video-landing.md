# Build a cursor-reactive AI video landing page

## Set the scope

Create a dark OmGithub landing page with a short AI-generated background loop and one stable **Enter** button. Make a stylized head appear to watch the cursor. Increase its attention as the cursor approaches Enter. Keep the current application reachable without waiting for media.

Treat this file as a researched proposal, not an implemented feature. Use research checked on 2026-09-13. Generate video offline; do not generate new frames for each visitor or pointer event.

## Select free tools

Distinguish free software and downloadable weights from free compute. Budget for existing GPU hardware, electricity, storage, and delivery bandwidth. Do not promise unlimited free hosted generation.

| Tool or model | Use | Cost and constraint | Decision |
| --- | --- | --- | --- |
| [Wan 2.2 TI2V-5B](https://github.com/Wan-Video/Wan2.2) | Generate video from an approved still | Use the Apache-2.0 release. Allow at least 24 GB VRAM for the documented offloaded 720p command; do not assume a laptop will run it. | Try first when a suitable GPU is available. |
| [LTX-2.3 distilled](https://huggingface.co/Lightricks/LTX-2.3) | Compare image-to-video motion and rapid iteration | Download open weights under the LTX community license, not Apache/MIT. Check the exact checkpoint terms before commercial use. Measure memory and runtime; do not assume it fits the Wan hardware budget. | Keep as an alternative, not a guaranteed free commercial service. |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Save repeatable generation graphs | Use the free local application; pay separately for any rented GPU or cloud service. | Start with the [official Wan workflow](https://docs.comfy.org/tutorials/video/wan/wan2_2). |
| [Blender](https://www.blender.org/) | Build and rig a stylized head; render controlled poses | Use free desktop software. Check separate rights for any imported model or texture. | Use for precise head rotation when video alone fails. |
| [Three.js](https://github.com/mrdoob/three.js) | Rotate a rigged head in the browser | Use the MIT library; account for model size and rendering load. | Add only for continuous, real head tracking. |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Trim, resize, strip audio, and encode loops | Use free local software; check build-specific license terms if redistributing the executable. | Export browser-ready media offline. |

Use hosted demos only for an initial test. Check access, quota, export rights, and watermarks at the time of use. Do not depend on an unverified free tier from Kling, Runway, Pika, or LTX's API. If no suitable GPU or free demo is available, prototype with a Blender render and defer AI generation.

## Choose an interaction technique

Treat the following comparison as engineering judgment, not a measured benchmark.

1. **Video plus parallax:** Translate the whole loop a few pixels and change a separate light layer with cursor position. Use this cheapest baseline. Do not describe it as true head rotation: all objects move together.
2. **Pose clips:** Generate neutral, left, right, up, down, and button-attention variants from one reference. Switch at coarse pointer regions with hysteresis. Align crop, lighting, duration, and loop phase. Expect double faces during crossfades and identity drift between independent generations. Reject this route if seams remain visible; do not load six full videos at once.
3. **Pose atlas:** Render or extract a small grid of head poses and select frames from pointer coordinates. Use for a lightweight, stylized effect. Accept discrete motion and loss of independent idle animation. Avoid continuous video seeking; compressed frame access is not an instant random-access renderer.
4. **Rigged 3D head over AI video:** Put a transparent Three.js canvas above a head-free video background. Rotate head and eye bones toward a bounded target. Use this route when “watch my cursor” must be continuous and convincing. Match light and color between layers; do not leave a second baked head behind the moving head.
5. **Depth displacement:** Warp an image or video texture with a depth map for mild perspective. Limit movement. Do not expect hidden face surfaces or independent eye motion from a flat texture.

Use video plus parallax only to test mood and load cost. Select a rigged head plus a head-free AI background for the requested continuous head tracking, unless a pose-atlas prototype proves sufficient. Keep pose clips as a bounded experiment, not the default architecture.

Do not add webcam tracking. Cursor coordinates already provide the input. Use [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) only if a later offline asset task needs landmarks; it detects a face but does not rig or rotate a baked video head.

## Define cursor behavior

- Set decorative video and canvas layers to ignore pointer input. Read pointer events from the hero container; keep Enter and Pause above those layers.
- Read pointer position within the hero bounds. Map it to clamped normalized x/y values from -1 to 1.
- Smooth targets in requestAnimationFrame with a time-based factor, such as `1 - exp(-dt / 0.12)`. Avoid frame-rate-dependent easing.
- Start with head yaw limited to ±12 degrees, pitch to ±6 degrees, and parallax to ±8 CSS pixels. Treat these as prototype settings.
- Measure distance from the pointer to the Enter button rectangle, not only its center. Set attention strength to `clamp(1 - distance / 180, 0, 1)` as a starting value.
- Blend the gaze target from cursor position toward Enter as attention rises. Increase a restrained button glow; do not move, resize, or activate the button automatically.
- Reset to neutral when the pointer leaves. Pause render and playback work when the page is hidden or the hero is off-screen.
- Give keyboard focus a restrained equivalent cue. Use a native link or button with a visible focus ring. Activate only on a normal click or keyboard action.
- Disable pointer-driven motion for coarse pointers. Keep the page fully usable on touch devices without simulated hover.

## Produce the assets

1. Approve one fictional or licensed character still. Keep text and Enter out of generated footage.
2. Generate a short 4–6 second image-to-video test. Request a locked camera, dark background, subtle breathing, stable face shape, and no speech or cuts. Treat seamless looping as a goal that still needs editing.
3. Use this prompt direction: “Keep the camera fixed. Place one stylized sculpted head on the right. Use soft charcoal and violet lighting. Keep the left half dark and empty for text. Add subtle breathing and one natural blink. Keep the identity and framing stable. Add no text and no camera movement.”
4. For the 3D route, replace the head request with abstract slow light and particles. Model the head manually in Blender or adapt a separately licensed existing model; do not assume the reference still supplies 3D geometry. Export a small GLB with head and eye controls. Check a neutral pose, independent head rotation, bounded eye movement, and correct pivots before browser integration.
5. Inspect first/last-frame seams, face drift, eye artifacts, and dark gradients. Trim or blend offline. Discard defective clips rather than hiding defects with more runtime effects.
6. Export a muted H.264 MP4 fallback and optional WebM. Create a small poster. For the 3D route, composite the neutral head over the background in this poster so static and failure modes retain the main visual. Start with 720p desktop footage and a separate mobile crop; preserve the character and text safe areas under cover cropping.
7. Save the model/checkpoint version, workflow, seed, prompt, source-image rights, output dimensions, generation time, and license link with the asset record. Keep large weights and raw outputs out of Git.

## Preserve access and performance

- Render headline and Enter before loading video or WebGL. Use a charcoal poster and a dark overlay to preserve text contrast.
- Use muted, playsinline playback. Handle a rejected play promise by retaining the poster; do not block entry. Follow the [browser autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
- Add a visible, keyboard-accessible pause control. Stop both video and pointer-driven head motion when paused. Show the paused state and retain it for the browser session, including route returns. Honor reduced motion with a still poster and no pointer animation. Avoid loading video when reduced motion or a supported data-saving preference requests the static mode.
- Mark decorative media as hidden from assistive technology. Keep meaningful text in HTML.
- Cap WebGL pixel ratio, avoid large textures, and release resources after leaving the landing page. Keep a poster fallback for unavailable WebGL, failed decoding, or poor performance.
- Set provisional budgets: poster at most 200 KB, selected loop at most 3 MB, and optional compressed head assets at most 2 MB. Measure transferred bytes, not source-file sizes.
- Require Enter to work while media requests fail. Before testing, record one physical mid-range device, OS, browser, and viewport. Require at least 30 FPS over a 30-second pointer-motion test on that device. Treat this as development acceptance, not proof for all devices. For runtime protection, switch once to the poster after three consecutive five-second foreground samples below 24 FPS; do not automatically switch back. Measure foreground WebGL render frames, not encoded video FPS. Sample only while animation is active and the hero is visible. Exclude hidden, paused, and off-screen periods.

## Test before implementation approval

- Compare the baseline with the rigged-head version. Ask whether the head appears to track the cursor, rather than merely slide with it.
- Test desktop and mobile dark themes. Inspect text contrast, button focus, pause control, hover, disabled/loading states where present, and all visible panels. Reject unintended white surfaces.
- Test rapid pointer motion, leaving/re-entering the hero, button proximity, keyboard navigation, touch, reduced motion, blocked autoplay, offline media, tab hiding, and route changes.
- Measure page load, transfer size, frame rate, and video/3D layer alignment. Test the deployed build before any live UI release.
- Delegate interactive browser validation to one end-to-end test subagent. Keep unit tests in the primary agent.
- Approve implementation only after the prototype meets the access and asset budgets. Do not claim improved conversion without a later experiment.

## Plan delivery

Create the mood-board still and one loop first. Build a small isolated interaction prototype second. Deliver the rigged-head route after visual testing, or accept a proven pose-atlas substitute. Require explicit approval to reduce the scope to parallax without head tracking. Integrate the approved version with the existing landing route last. Keep the current route and static poster as fallbacks.

Do not generate or deploy assets as part of this idea-writing task. Resolve GPU availability, final character style, exact Enter destination, and checkpoint license eligibility before production asset work.

## Record the critique loop

Retain the result of three subagent document critique rounds. Apply round 1 by selecting true tracking, defining a stable performance fallback, and completing Pause behavior. Apply round 2 by aligning delivery scope, defining frame measurement, and specifying the head asset workflow. Apply round 3 by preventing decorative layers from blocking controls and preserving the head in the static poster. Treat this review as proposal validation only; run no UI or model benchmark claims from it.
