// Dance move classifier — TF.js BiLSTM/TCN inference over 30-frame sliding window.
// Exposes window.MoveClassifier — loaded as a plain script before panel.js.
// Falls back gracefully if the model file is not yet bundled (training still in progress).
(function () {
  const WINDOW_SIZE = 30;   // 3 seconds at 10 fps (sidebar capture rate)
  const CONF_MIN    = 0.65; // minimum confidence to report a named move

  // Must match labels.json order: index 0–8
  const LABELS = [
    "idle",
    "moonwalk",
    "body_roll",
    "body_wave",
    "chest_pop",
    "hip_sway",
    "arm_wave",
    "shoulder_bounce",
    "side_step",
  ];

  const DISPLAY = {
    idle:             null,           // don't show label when idle
    moonwalk:         "Moonwalk",
    body_roll:        "Body Roll",
    body_wave:        "Body Wave",
    chest_pop:        "Chest Pop",
    hip_sway:         "Hip Sway",
    arm_wave:         "Arm Wave",
    shoulder_bounce:  "Shoulder Bounce",
    side_step:        "Side Step",
  };

  const CATEGORY = {
    idle:             null,
    moonwalk:         "footwork",
    body_roll:        "body isolation",
    body_wave:        "body isolation",
    chest_pop:        "upper body",
    hip_sway:         "lower body",
    arm_wave:         "arm isolation",
    shoulder_bounce:  "upper body",
    side_step:        "footwork",
  };

  let model        = null;
  let buffer       = [];
  let prevFeatures = null;

  window.MoveClassifier = {
    // Returns true when successfully loaded, false if model isn't bundled yet.
    async init() {
      try {
        const url = chrome.runtime.getURL("src/models/dance/model.json");
        model = await tf.loadLayersModel(url);
        console.log("[MoveClassifier] model loaded");
        return true;
      } catch {
        // Normal during development — model is trained and bundled later.
        return false;
      }
    },

    // Feed one frame's features (35-element array from PoseFeatures.extract).
    feed(features) {
      if (!features) return;
      const vel = window.PoseFeatures.velocities(prevFeatures, features);
      prevFeatures = features;
      buffer.push([...features, ...vel]); // 70 features/frame
      if (buffer.length > WINDOW_SIZE) buffer.shift();
    },

    reset() {
      buffer = [];
      prevFeatures = null;
    },

    // Returns { moveName, moveCategory, confidence } or null.
    async classify() {
      if (!model || buffer.length < WINDOW_SIZE) return null;
      const input = tf.tensor3d([buffer], [1, WINDOW_SIZE, 70]);
      const probs = model.predict(input);
      const arr   = await probs.data();
      input.dispose();
      probs.dispose();

      const maxIdx = arr.indexOf(Math.max(...arr));
      const conf   = arr[maxIdx];
      const label  = LABELS[maxIdx];

      if (!label || label === "idle" || conf < CONF_MIN) return null;
      return {
        moveName:     DISPLAY[label] || label,
        moveCategory: CATEGORY[label],
        confidence:   Math.round(conf * 100),
      };
    },

    get ready() { return model !== null; },
  };
})();
