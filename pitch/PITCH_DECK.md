# Framewise Pitch Deck

Use this as the source for Google Slides, Canva, Keynote, Figma, or Claude Design.

## Slide 1 - Title

**Framewise**

Turn any video into an active learning workspace.

Tagline:
AI-powered video learning assistant for YouTube, classes, tutorials, and practice videos.

Visual direction:
- Framewise logo
- Web app library plus Chrome extension side panel
- Cinematic dark cocoa background with cream, sage, and rust accents

Speaker note:
Framewise is built for the way people actually learn from video: by asking questions, jumping to exact moments, saving timestamps, reviewing later, and practicing.

## Slide 2 - Problem

**Video is where learning happens. But video is still hard to study.**

Pain points:
- Long videos hide the exact moment you need.
- Search inside video is weak.
- Captions, notes, bookmarks, and chat live in separate tools.
- YouTube learning does not remember your full study flow.
- Practice videos need looping, slowdown, timestamps, and repetition.

Speaker note:
People already use video as a classroom, tutor, tutorial, and practice space. The problem is that the video player was designed for watching, not for learning.

## Slide 3 - Product Insight

**A video should behave like an interactive document.**

Framewise adds structure and memory to video:
- AI topic timeline
- Timestamp-aware chat
- Searchable video library
- Notes and bookmarks
- Custom captions
- Quizzes and practice tools
- Continue watching

Speaker note:
Framewise does not replace YouTube. It adds an AI learning layer on top of the videos people already use.

## Slide 4 - Solution

**One AI brain, two connected surfaces.**

Web app:
- Analyze YouTube videos
- Manage a personal video library
- Search across titles and segment summaries
- Organize videos into collections
- Study with chat, notes, bookmarks, quizzes, captions, and practice tools

Chrome extension:
- Works directly on YouTube
- Detects the current video
- Auto-loads saved timelines
- Injects custom captions timed to playback
- Syncs progress and learning state

Speaker note:
The extension is not a separate product. It is the web app reaching into the browser, connected to the same backend and the same MongoDB data.

## Slide 5 - Demo Story

**From YouTube link to learning workspace.**

Demo flow:
1. Paste a YouTube URL into Framewise.
2. Gemini analyzes the video and creates topic segments.
3. Click a segment to jump to the exact timestamp.
4. Ask the AI a question about the video.
5. Save an important timestamp as a bookmark.
6. Generate captions or a quiz.
7. Open the same video on YouTube and show the extension auto-loading the timeline.

Speaker note:
The magic moment is continuity: the same analyzed video, same timeline, same bookmarks, and same progress follow the user between the web app and YouTube.

## Slide 6 - Core Features

**A complete learning layer for video.**

Features already represented in the product:
- AI topic segmentation
- Timestamp-aware video chat
- Library search
- User-created bookmarks
- Notes
- Collections/folders
- Continue watching
- Captions and translation
- Quiz generation
- Dance/practice mode
- Voice replies
- Chrome extension side panel

Speaker note:
This goes beyond a summary. Framewise is about finding, saving, returning to, and practicing the exact moments that matter.

## Slide 7 - Recent Product Improvements

**The MVP now feels like a real learning system.**

Added improvements:
- Library search across video titles and segment summaries
- Bookmarks as user-created timestamp pins
- Collections/folders for organizing the library
- Continue watching with backend progress tracking and local fallback
- Extension auto-load for already analyzed YouTube videos
- Custom injected captions that follow actual video timing
- Distinct feature panels for Topics, Transcript, Notes, Bookmarks, Quiz, Dance, and Subtitles
- Dark/light theme with a unified Framewise visual system

Speaker note:
These improvements matter because they move Framewise from a demo of AI analysis into a product people could actually return to.

## Slide 8 - Sponsor Tech Fit

**Framewise uses the sponsor tools as product-critical layers.**

Gemini:
- Video understanding
- Topic segmentation
- Timestamp-aware chat
- Quiz and learning content generation

MongoDB Atlas:
- Videos
- Segments
- Captions
- Chat history
- Notes
- Bookmarks
- Collections
- Playback progress
- Searchable learning library

ElevenLabs:
- Natural voice replies
- More immersive learning assistant experience
- Path toward hands-free practice coaching

Speaker note:
These tools are not decorative. Gemini is the intelligence layer, MongoDB is the memory layer, and ElevenLabs is the voice layer.

## Slide 9 - Architecture

**Shared backend, shared data, shared user experience.**

Architecture:
- React + Vite web app
- Chrome Manifest V3 extension
- Node + Express API
- MongoDB Atlas with Mongoose models
- Gemini for AI video analysis and chat
- ElevenLabs for voice
- Google OAuth/JWT auth

Shared collections:
- Users
- Videos
- Segments
- Captions
- Chat messages
- Notes
- Bookmarks
- Collections

Speaker note:
Both product surfaces call the same API. That is what makes cross-surface continuity possible.

## Slide 10 - Extension Moment

**Framewise meets users where they already watch.**

Extension behavior:
- Detects YouTube video navigation
- Checks backend for an existing analyzed video
- Loads saved timeline without requiring another analysis click
- Shows chat and learning tools in a side panel
- Injects Framewise captions over the video
- Tracks progress for continue watching

Speaker note:
For users, this is the difference between a separate study app and a true browser-native learning assistant.

## Slide 11 - Design Direction

**A media studio for learning, not a generic dashboard.**

Visual mood:
- Cinematic
- Editorial
- Warm and focused
- Premium but usable
- Dark mode first with a polished light mode

Palette:
- Cocoa / deep ink: `#653728`
- Rust / emphasis: `#C56A43`
- Peach / warmth: `#FEC9AF`
- Cream / paper base: `#FFF2E0`
- Sage / signature: `#72875B`
- Olive / fresh accent: `#97AC6D`

Speaker note:
The design goal is to make studying video feel organized and expressive: a library at noon in light mode, and a theatre at midnight in dark mode.

## Slide 12 - What Makes Framewise Different

**Framewise is not just “chat with a video.”**

Differentiators:
- Web app plus Chrome extension from the start
- Saved learning memory across sessions
- Search across analyzed video content
- Timestamped answers and timestamped bookmarks
- Practice-specific controls for movement learning
- Captions that sync with playback
- Product architecture ready for accounts, history, and libraries

Speaker note:
Most AI video tools stop at summaries. Framewise is about turning video into a reusable learning environment.

## Slide 13 - Current Build Status

**Built and demo-ready.**

Working now:
- Google sign-in/auth flow
- YouTube video analysis
- AI topic timeline
- Chat with video context
- ElevenLabs voice option
- Captions and subtitle tools
- Notes, bookmarks, quizzes
- Collections/folders
- Continue watching
- Library search
- YouTube extension auto-load
- Unified dark/light UI

Speaker note:
This is an MVP-plus. The core product loop works across frontend, backend, database, AI services, and extension.

## Slide 14 - Roadmap

**Moving from hackathon MVP to product.**

Near-term:
1. Stabilize analysis edge cases and add stronger loading/error states.
2. Add background jobs for long AI tasks.
3. Improve caption editing and export.
4. Add video upload support beyond YouTube.
5. Add richer study packs: summaries, flashcards, and spaced review.
6. Prepare deployment and Chrome Web Store submission.

Longer-term:
- Multi-platform video support
- Classroom/team libraries
- Public shared video study pages
- Voice-first practice coach

Speaker note:
The forward path is clear: make the current YouTube-first flow reliable, then expand into uploads, study workflows, and team learning.

## Slide 15 - Closing

**Framewise makes video learnable.**

Closing line:
Framewise turns passive watching into active learning by giving every video a timeline, memory, voice, and study workspace.

Ask:
- Feedback on the learning flow
- Help testing videos and edge cases
- Ideas for the next study features
- Support polishing toward launch
