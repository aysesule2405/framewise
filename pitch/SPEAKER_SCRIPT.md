# Framewise Speaker Script

## 30-Second Pitch

Framewise is an AI-powered video learning assistant that turns YouTube videos into interactive study workspaces. It uses Gemini to understand the video, MongoDB to remember the user's learning library, and ElevenLabs to give the assistant a voice. Users can generate topic timelines, chat with the video, save bookmarks, take notes, generate captions and quizzes, organize videos into folders, and continue watching later. The web app and Chrome extension share one backend, so learning follows the user from the Framewise library directly onto YouTube.

## 1-Minute Pitch

People learn from video constantly, but video is still hard to use as a real study tool. Important moments are buried in long timelines, captions are limited, notes and bookmarks are scattered, and YouTube does not remember your full learning workflow.

Framewise turns a video into an interactive learning workspace. In the web app, a user can paste a YouTube URL and Gemini generates a clickable topic timeline. They can ask questions about the video, jump to timestamped answers, save important moments as bookmarks, take notes, generate captions, create quizzes, and organize videos into collections.

The Chrome extension brings the same intelligence directly to YouTube. When a user opens a video they have already analyzed, Framewise automatically loads the timeline in the side panel, injects custom captions timed to playback, and syncs progress for continue watching.

The core idea is simple: Gemini is the intelligence layer, MongoDB is the memory layer, and ElevenLabs is the voice layer. Framewise makes passive watching feel like active learning.

## 3-Minute Pitch

Hi, this is Framewise: an AI-powered video learning assistant.

The problem we are solving is that video has become one of the main ways people learn, but the video player itself has not really become a learning tool. A lecture might be forty minutes long. A tutorial might hide the one step you need somewhere in the middle. A dance or practice video requires looping, slowing down, repeating, and remembering the exact moment to revisit. If you want to take notes, bookmark a timestamp, ask a question, or review later, you usually end up jumping between several disconnected tools.

Framewise makes video behave more like an interactive document.

In the web app, users paste a YouTube URL. Gemini analyzes the video and returns a structured topic timeline with timestamps, titles, and summaries. Each segment is clickable, so the user can jump directly to the relevant moment. The user can also chat with the video, and when the AI answer references a specific part, it can include a timestamp.

From there, Framewise becomes a full learning workspace. Users can save bookmarks, take notes, generate quizzes, generate or translate captions, organize videos into collections, search across their library, and continue watching from the last saved position. For movement-based learning, there is a practice mode with loop, speed, and mirror controls.

The second surface is the Chrome extension. This is important because users are already watching on YouTube. The extension detects the current video, checks whether it has already been analyzed, and automatically loads the saved timeline. It can also inject Framewise captions over the video and sync playback progress back to the backend.

Architecturally, both surfaces share one backend. The React web app and Manifest V3 Chrome extension call the same Express API, use the same auth flow, and store everything in MongoDB. Gemini powers the video understanding, segmentation, chat, and learning content generation. MongoDB stores the user's videos, segments, captions, chat messages, notes, bookmarks, folders, and progress. ElevenLabs gives the assistant natural voice responses, which is especially useful for hands-free learning and practice.

What makes Framewise different is that it is not only a video summary tool. It remembers your learning journey. It lets you search inside your studied videos, return to saved moments, continue where you left off, and use the same learning layer inside the web app or directly on YouTube.

Right now, the MVP supports the full YouTube-first loop: analyze a video, study it in the web app, save learning state, and reopen it through the extension. Next, we want to stabilize analysis jobs, improve caption editing, add upload support, build richer study packs, and prepare for deployment and Chrome Web Store submission.

Framewise turns passive watching into active learning.

## Demo Narration

1. “I’ll start in the Framewise library.”
2. “This is the personal learning library. It supports search, folders, continue watching, and analyzed videos.”
3. “I paste a YouTube URL and click Analyze.”
4. “Gemini breaks the video into a topic timeline.”
5. “Each timestamp is clickable, so I can jump directly to that section.”
6. “Now I can ask the video a question.”
7. “The AI answer can come back with a timestamp, so I can jump to the exact moment.”
8. “I can save this moment as a bookmark or write a note.”
9. “I can generate captions, translate them, or create a quiz.”
10. “Now I’ll open the same video on YouTube.”
11. “The extension detects that this video already exists in my library and loads the timeline automatically.”
12. “This shows the core product: one AI brain shared across the web app and extension.”

## Sponsor Narrative

Use this when judges ask about the tech stack:

“Gemini is not just generating a summary. It is powering the core understanding layer: topic segmentation, video-aware chat, quizzes, and learning guidance. MongoDB is the memory layer that makes Framewise feel persistent instead of one-off: videos, segments, captions, chat history, bookmarks, collections, and progress are all stored and reused across the app and extension. ElevenLabs gives the assistant a voice, which makes the experience more natural and opens the path toward hands-free practice coaching.”

