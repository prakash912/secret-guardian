export type DetectionResult =
  | { detected: true; type: string }
  | { detected: false };

// High-confidence known secret patterns
const patterns = [
  { type: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
  { type: "GitHub Token", regex: /ghp_[a-zA-Z0-9]{36}/ },
  { type: "JWT Token", regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./ },
  { type: "Private Key", regex: /-----BEGIN PRIVATE KEY-----/ }
];

// Shannon entropy calculation
function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  for (const char in freq) {
    const p = freq[char] / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function detectSecrets(text: string): DetectionResult {
  // 1️⃣ Known high-confidence patterns
  for (const p of patterns) {
    if (p.regex.test(text)) {
      return { detected: true, type: p.type };
    }
  }

  // 2️⃣ Generic high-entropy secret detection
  if (text.length >= 20) {
    const entropy = calculateEntropy(text);

    // Safe empirical threshold
    if (entropy > 3.5) {
      // Context hints to reduce UUID false positives
      if (
        /key|token|secret|auth|bearer/i.test(text) ||
        /^[A-Za-z0-9_\-+=]{20,}$/.test(text)
      ) {
        return { detected: true, type: "High-entropy secret" };
      }
    }
  }

  return { detected: false };
}
