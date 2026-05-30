# Claude Design Prompt For Framewise Pitch Deck

Copy this into Claude Design or a design-focused Claude chat.

```text
You are an expert presentation designer and product storyteller. Create a polished 10-12 slide hackathon pitch deck for Framewise, an AI-powered video learning assistant.

Product context:
Framewise turns YouTube videos into interactive learning workspaces. It has two connected surfaces:
1. A web app where users analyze videos, manage a library, search analyzed content, organize videos into collections, chat with videos, save notes/bookmarks, generate captions, quizzes, and use practice tools.
2. A Chrome extension that works directly on YouTube, auto-loads saved timelines for already analyzed videos, injects custom captions timed to playback, provides chat/practice tools, and syncs progress.

Core idea:
Framewise is not just "chat with a video." It is a learning layer with memory. It helps users find exact moments, save them, return to them, search across them, and continue learning across the web app and YouTube.

Technology story:
- Gemini is the intelligence layer: video understanding, topic segmentation, timestamp-aware chat, quiz generation, and learning guidance.
- MongoDB Atlas is the memory layer: videos, segments, captions, chat messages, notes, bookmarks, collections/folders, and playback progress.
- ElevenLabs is the voice layer: natural spoken AI responses and a path toward hands-free practice coaching.
- Web app: React + Vite.
- Backend: Node + Express.
- Extension: Chrome Manifest V3.
- Auth: Google OAuth/JWT.

Recent improvements to highlight:
- Library search across video titles and segment summaries.
- Bookmarks for user-created timestamp pins.
- Collections/folders for organizing videos.
- Continue watching with backend progress tracking and local fallback.
- Extension auto-load when opening an already analyzed YouTube video.
- Injected captions now follow actual video timing instead of only styling YouTube captions.
- Distinct feature panels for Topics, Transcript, Notes, Bookmarks, Quiz, Dance, and Subtitles.
- Unified dark/light visual system.

Audience:
Hackathon judges, technical sponsors, and a teammate joining the project. The deck should feel impressive but clear, with enough technical credibility to show the project is real and not only a mockup.

Visual style:
Make it premium, cinematic, editorial, and media-focused. Avoid generic SaaS dashboard visuals. The deck should feel like a warm intelligent video archive: a library at noon in light mode, and a theatre at midnight in dark mode.

Palette:
- Cocoa / deep ink: #653728
- Rust / emphasis: #C56A43
- Peach / warmth: #FEC9AF
- Cream / paper base: #FFF2E0
- Sage / signature: #72875B
- Olive / fresh accent: #97AC6D

Light theme direction:
- Use #FFF2E0 as the main paper-like base.
- Use #653728 for primary text and deep UI accents.
- Use #72875B and #97AC6D for signature actions, status, progress, and selected states.
- Use #C56A43 and #FEC9AF for emphasis, highlights, alerts, and warm decorative accents.
- The feeling should be "a library at noon": calm, warm, tactile, readable, and organized.

Dark theme direction:
- Use #1F120D or a very dark cocoa derived from #653728 for main surfaces.
- Use #FFF2E0 for text and high-contrast controls.
- Use brighter sage and rust accents for focus states, buttons, badges, and timeline markers.
- The feeling should be "a theatre at midnight": cinematic, focused, intimate, and premium.

Use warm gradients, paper-like panels, subtle grain/noise, soft shadows, and strong screenshot framing. Avoid neon purple, generic blue SaaS gradients, random stock illustrations, and sterile dashboard visuals. Prefer product UI mockups, browser frames, video player frames, timeline visuals, caption overlays, and extension side-panel compositions.

Typography direction:
Use a modern heading style similar to Sora, Outfit, or Clash Display. Use Inter or Manrope for body copy. Keep slide copy concise and presentation-ready.

Deck structure:
1. Title: Framewise - Turn video into active learning.
2. Problem: Video is where learning happens, but video is hard to study.
3. Insight: A video should behave like an interactive document.
4. Solution: Web app + Chrome extension, one AI brain.
5. Demo flow: Paste URL -> analyze -> timeline -> chat -> bookmark -> captions/quiz -> extension auto-load.
6. Core features: timeline, timestamp chat, captions, notes, bookmarks, quiz, collections, continue watching, practice mode.
7. Recent build improvements: search, bookmarks, collections, continue watching, extension auto-load, timed injected captions, distinct feature panels, theme system.
8. Architecture: React/Vite + Express + MongoDB + Gemini + ElevenLabs + Chrome MV3 + OAuth/JWT.
9. Sponsor tech fit: Gemini intelligence layer, MongoDB memory layer, ElevenLabs voice layer.
10. Differentiation: not only summaries; reusable learning memory across web and YouTube.
11. Roadmap: stabilize AI jobs, async queue, uploaded videos, caption editor/export, study packs, deployment, Chrome Web Store.
12. Closing: Framewise makes video learnable.

For each slide, provide:
- Slide title
- Short on-slide copy
- Layout direction
- Visual direction
- Speaker note

Design requirements:
- Use 16:9 slides.
- Keep each slide visually distinct but unified.
- Include at least one architecture diagram.
- Include one demo journey slide that feels like a product flow.
- Include one browser/extension split-screen slide.
- Include one data-memory slide showing MongoDB collections as learning memory.
- Include one sponsor fit slide with Gemini, MongoDB, and ElevenLabs as three product layers.
- Make the product feel built and demo-ready.
- Avoid vague claims. Show concrete features and flows.

If creating mockups, show:
- Framewise library with search, folders, and video cards.
- Selected video page with YouTube player, topic tabs, and chat panel.
- Chrome extension side panel auto-loading a saved timeline.
- Captions overlay timed to the video.

Tone:
Confident, warm, polished, and technically credible. The deck should make judges understand the product in under 30 seconds and remember the extension + shared learning memory as the standout idea.
```
