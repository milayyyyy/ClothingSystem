/** Face descriptor matching (128-dim vectors from face-api.js). */

export const FACE_MATCH_THRESHOLD = 0.5;
/** Minimum distance gap between best and second-best match to avoid ambiguous logins. */
export const FACE_MATCH_MIN_GAP = 0.1;

export type FaceProfileCandidate = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  face_descriptor: number[];
};

export function euclideanDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function findBestFaceMatch(
  descriptor: number[],
  candidates: FaceProfileCandidate[],
): { profile: FaceProfileCandidate; distance: number } | { error: string } {
  if (descriptor.length < 128) {
    return { error: "Invalid face data. Try scanning again." };
  }
  if (candidates.length === 0) {
    return { error: "No faces enrolled yet. Ask an admin to enrol employee faces." };
  }

  const scored = candidates
    .map((p) => ({
      profile: p,
      distance: euclideanDistance(descriptor, p.face_descriptor),
    }))
    .sort((a, b) => a.distance - b.distance);

  const best = scored[0];
  const second = scored[1];

  if (best.distance > FACE_MATCH_THRESHOLD) {
    return { error: "Face not recognized. Try better lighting or enrol your face with an admin." };
  }
  if (second && second.distance - best.distance < FACE_MATCH_MIN_GAP) {
    return { error: "Face match was ambiguous. Try again or re-enrol with an admin." };
  }

  return { profile: best.profile, distance: best.distance };
}
