// BlazePose 33-keypoint feature extraction for dance move classification.
// Exposes window.PoseFeatures — loaded as a plain script before panel.js.
(function () {
  // [vertex, point_a, point_b] triplets for joint angle calculation
  const TRIPLETS = [
    [13, 11, 15],  // left elbow
    [14, 12, 16],  // right elbow
    [11, 13, 23],  // left shoulder-elbow-hip
    [12, 14, 24],  // right shoulder-elbow-hip
    [25, 23, 27],  // left knee
    [26, 24, 28],  // right knee
    [23, 25, 29],  // left hip-knee-ankle
    [24, 26, 30],  // right hip-knee-ankle
    [11, 23, 25],  // left hip angle
    [12, 24, 26],  // right hip angle
    [0,  11, 12],  // spine lean (nose → shoulders)
    [23, 24, 11],  // hip tilt
  ];

  function angle3(a, b, c) {
    const ba = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
    const bc = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
    const dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2];
    const mag = Math.hypot(...ba) * Math.hypot(...bc);
    return mag === 0 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot / mag)));
  }

  // Normalise keypoints: translate to hip-midpoint origin, scale by torso height.
  // Works for both 2D (x,y) and 3D (x,y,z) keypoints.
  function normalise(kp) {
    const lh = kp[23], rh = kp[24], ls = kp[11], rs = kp[12];
    const hipMid = {
      x: (lh.x + rh.x) / 2,
      y: (lh.y + rh.y) / 2,
      z: ((lh.z || 0) + (rh.z || 0)) / 2,
    };
    const shoulderMid = {
      x: (ls.x + rs.x) / 2,
      y: (ls.y + rs.y) / 2,
      z: ((ls.z || 0) + (rs.z || 0)) / 2,
    };
    const torso = Math.hypot(
      shoulderMid.x - hipMid.x,
      shoulderMid.y - hipMid.y,
      shoulderMid.z - hipMid.z
    ) || 1;
    return {
      kp: kp.map((k) => ({
        x: (k.x - hipMid.x) / torso,
        y: (k.y - hipMid.y) / torso,
        z: ((k.z || 0) - hipMid.z) / torso,
        score: k.score || 0,
      })),
      shoulderMid,
      hipMid,
      torso,
    };
  }

  window.PoseFeatures = {
    // Returns Float32Array of 35 features, or null if keypoints are insufficient.
    extract(keypoints) {
      if (!keypoints || keypoints.length < 33) return null;
      const { kp, shoulderMid, hipMid } = normalise(keypoints);

      // 12 joint angles
      const angles = TRIPLETS.map(([v, a, c]) => angle3(kp[a], kp[v], kp[c]));

      // 4 symmetry deltas (left vs right paired joints)
      const symmetry = [
        Math.abs(angles[0] - angles[1]),
        Math.abs(angles[4] - angles[5]),
        Math.abs(angles[6] - angles[7]),
        Math.abs(angles[8] - angles[9]),
      ];

      // 18 selected normalised positions (nose, wrists, ankles, heels, foot tips)
      const positions = [
        kp[0].x,  kp[0].y,
        kp[15].x, kp[15].y,
        kp[16].x, kp[16].y,
        kp[27].x, kp[27].y,
        kp[28].x, kp[28].y,
        kp[29].x, kp[29].y,
        kp[30].x, kp[30].y,
        kp[31].x, kp[31].y,
        kp[32].x, kp[32].y,
      ];

      // 1 spine lean angle
      const spineLean = Math.atan2(
        shoulderMid.x - hipMid.x,
        shoulderMid.y - hipMid.y
      );

      return [...angles, ...symmetry, ...positions, spineLean]; // 35 features
    },

    // Frame-over-frame delta (velocity). Returns zeros for the first frame.
    velocities(prev, curr) {
      if (!prev || !curr || prev.length !== curr.length) {
        return new Array(curr ? curr.length : 35).fill(0);
      }
      return curr.map((v, i) => v - prev[i]);
    },
  };
})();
