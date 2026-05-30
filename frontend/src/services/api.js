import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Attach token from storage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fw_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Video endpoints ───────────────────────────────────────────────────────────
export const videoAPI = {
  analyze:         (url, source = "youtube") => api.post("/videos/analyze", { url, source }),
  list:            (collectionId)            => api.get("/videos", { params: collectionId ? { collectionId } : {} }),
  search:          (q, collectionId)         => api.get("/videos/search", { params: { q, ...(collectionId ? { collectionId } : {}) } }),
  lookup:          (url)                     => api.get("/videos/lookup", { params: { url } }),
  get:             (videoId)                 => api.get(`/videos/${videoId}`),
  updateMode:      (videoId, modeOverride)   => api.patch(`/videos/${videoId}/mode`, { modeOverride }),
  getSegments:     (videoId, type)           => api.get(`/videos/${videoId}/segments`, { params: type ? { type } : {} }),
  updateProgress:  (videoId, positionSeconds, durationSeconds) => api.patch(`/videos/${videoId}/progress`, { positionSeconds, durationSeconds }),
  delete:          (videoId)                 => api.delete(`/videos/${videoId}`),
  analyzeDance:    (videoId, options = {})   => api.post(`/videos/${videoId}/dance`, options),
  getCaptions:     (videoId)                 => api.get(`/videos/${videoId}/captions`),
  saveCaptions:    (videoId, captions)       => api.put(`/videos/${videoId}/captions`, { captions }),
  correctCaptions: (videoId, captions, options = {}) => api.post(`/videos/${videoId}/captions/correct`, { captions, ...options }),
  generateQuiz:    (videoId, options = {})   => api.post(`/videos/${videoId}/quiz`, options),
  generateCaptions:       (videoId, options = {}) => api.post(`/videos/${videoId}/captions/generate`, options),
  generateCaptionsAudio:  (videoId, options = {}) => api.post(`/videos/${videoId}/captions/generate-audio`, options),
  translateCaptions:      (videoId, language, options = {}) => api.post(`/videos/${videoId}/captions/translate`, { language, ...options }),
  importTranscript:       (videoId, transcript) => api.post(`/videos/${videoId}/transcript`, { transcript }),
};

// ── Collection endpoints ──────────────────────────────────────────────────────
export const collectionAPI = {
  list:        ()                          => api.get("/collections"),
  create:      (name)                      => api.post("/collections", { name }),
  rename:      (collectionId, name)        => api.patch(`/collections/${collectionId}`, { name }),
  addVideo:    (collectionId, videoId)     => api.post(`/collections/${collectionId}/videos`, { videoId }),
  removeVideo: (collectionId, videoId)     => api.delete(`/collections/${collectionId}/videos/${videoId}`),
  delete:      (collectionId)              => api.delete(`/collections/${collectionId}`),
};

// ── Bookmark endpoints ───────────────────────────────────────────────────────
export const bookmarkAPI = {
  list:   (videoId)                          => api.get(`/videos/${videoId}/bookmarks`),
  add:    (videoId, timestamp, label)        => api.post(`/videos/${videoId}/bookmarks`, { timestamp, label }),
  update: (videoId, bookmarkId, label)       => api.patch(`/videos/${videoId}/bookmarks/${bookmarkId}`, { label }),
  delete: (videoId, bookmarkId)              => api.delete(`/videos/${videoId}/bookmarks/${bookmarkId}`),
};

// ── Notes endpoints ───────────────────────────────────────────────────────────
export const notesAPI = {
  list:     (videoId)                     => api.get(`/videos/${videoId}/notes`),
  add:      (videoId, timestamp, content) => api.post(`/videos/${videoId}/notes`, { timestamp, content }),
  generate: (videoId, options = {})       => api.post(`/videos/${videoId}/notes/generate`, options),
  delete:   (videoId, noteId)             => api.delete(`/videos/${videoId}/notes/${noteId}`),
};

// ── Chat endpoints ────────────────────────────────────────────────────────────
export const chatAPI = {
  sendMessage: (videoId, content, mode = "default", options = {}) => api.post(`/chat/${videoId}/message`, { content, mode, ...options }),
  getHistory:  (videoId)          => api.get(`/chat/${videoId}/history`),
  getVoice:    (videoId, text, voicePreset = "default") => api.post(`/chat/${videoId}/voice`, { text, voicePreset }, { responseType: "arraybuffer" }),
};

// ── Job endpoints ─────────────────────────────────────────────────────────────
export const jobsAPI = {
  get: (jobId) => api.get(`/jobs/${jobId}`),
};

// ── Auth endpoints ────────────────────────────────────────────────────────────
export const authAPI = {
  register:   (email, password, displayName) => api.post("/auth/register", { email, password, displayName }),
  login:      (email, password)              => api.post("/auth/login", { email, password }),
  googleAuth: (credential)                   => api.post("/auth/google", { credential }),
  me:         ()                             => api.get("/auth/me"),
  updateMe:   (data)                         => api.put("/auth/me", data),
  deleteMe:   ()                             => api.delete("/auth/me"),
};
