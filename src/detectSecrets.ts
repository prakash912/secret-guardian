export type DetectionResult =
  | { detected: true; type: string; confidence: "high" | "medium" | "low"; explanation: string }
  | { detected: false };

// Advanced secret detection patterns - comprehensive coverage
const patterns = [
  // AWS
  { type: "AWS Access Key ID", regex: /AKIA[0-9A-Z]{16}/ },
  { type: "AWS Secret Access Key", regex: /aws[_-]?secret[_-]?access[_-]?key[\s:=]+['"]?([A-Za-z0-9/+=]{40})['"]?/i },
  { type: "AWS Session Token", regex: /aws[_-]?session[_-]?token[\s:=]+['"]?([A-Za-z0-9/+=]{20,})['"]?/i },
  
  // GitHub
  { type: "GitHub Personal Access Token", regex: /ghp_[a-zA-Z0-9]{36}/ },
  { type: "GitHub OAuth Token", regex: /gho_[a-zA-Z0-9]{36}/ },
  { type: "GitHub User-to-Server Token", regex: /ghu_[a-zA-Z0-9]{36}/ },
  { type: "GitHub Server-to-Server Token", regex: /ghs_[a-zA-Z0-9]{36}/ },
  { type: "GitHub Refresh Token", regex: /ghr_[a-zA-Z0-9]{36}/ },
  { type: "GitHub Token (generic)", regex: /github[_-]?token[\s:=]+['"]?([a-zA-Z0-9_]{20,})['"]?/i },
  
  // JWT & OAuth
  { type: "JWT Token", regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/ },
  { type: "OAuth Token", regex: /oauth[_-]?token[\s:=]+['"]?([A-Za-z0-9_-]{20,})['"]?/i },
  { type: "Bearer Token", regex: /bearer[\s:]+['"]?([A-Za-z0-9_\-.]{20,})['"]?/i },
  
  // Private Keys
  { type: "RSA Private Key", regex: /-----BEGIN RSA PRIVATE KEY-----/ },
  { type: "EC Private Key", regex: /-----BEGIN EC PRIVATE KEY-----/ },
  { type: "OpenSSH Private Key", regex: /-----BEGIN OPENSSH PRIVATE KEY-----/ },
  { type: "PGP Private Key", regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/ },
  { type: "Private Key (generic)", regex: /-----BEGIN PRIVATE KEY-----/ },
  { type: "DSA Private Key", regex: /-----BEGIN DSA PRIVATE KEY-----/ },
  
  // API Keys
  { type: "API Key", regex: /(api[_-]?key|apikey)[\s:=]+['"]?([A-Za-z0-9_-]{20,})['"]?/i },
  { type: "Secret Key", regex: /(secret[_-]?key|secretkey)[\s:=]+['"]?([A-Za-z0-9_-]{20,})['"]?/i },
  { type: "Access Token", regex: /(access[_-]?token|accesstoken)[\s:=]+['"]?([A-Za-z0-9_-]{20,})['"]?/i },
  
  // Database & Service Credentials
  { type: "Database Password", regex: /(database|db)[_-]?(password|pwd|pass)[\s:=]+['"]?([^\s'"]{8,})['"]?/i },
  { type: "MongoDB Connection String", regex: /mongodb(\+srv)?:\/\/[^\s'"]+/i },
  { type: "PostgreSQL Connection String", regex: /postgres(ql)?:\/\/[^\s'"]+/i },
  { type: "MySQL Connection String", regex: /mysql:\/\/[^\s'"]+/i },
  { type: "Redis Connection String", regex: /redis:\/\/[^\s'"]+/i },
  
  // Cloud Provider Keys
  { type: "Google Cloud API Key", regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { type: "Google OAuth Token", regex: /ya29\.[0-9A-Za-z\-_]+/ },
  { type: "Azure Key", regex: /[a-z0-9]{32}=/ },
  { type: "Stripe API Key", regex: /(sk|pk)_(live|test)_[0-9a-zA-Z]{24,}/ },
  { type: "PayPal Client ID", regex: /[A-Za-z0-9]{80,}/ },
  { type: "Twilio API Key", regex: /SK[0-9a-f]{32}/ },
  { type: "SendGrid API Key", regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  
  // Social Media & Services
  { type: "Twitter API Key", regex: /[0-9a-zA-Z]{25,}/ },
  { type: "Facebook Access Token", regex: /EAAG[a-zA-Z0-9]{100,}/ },
  { type: "Instagram Access Token", regex: /IG[a-zA-Z0-9_\-.]{100,}/ },
  
  // Generic Patterns
  { type: "Password in Config", regex: /(password|pwd|passwd|pass)[\s:=]+['"]?([^\s'"]{8,})['"]?/i },
  { type: "Authorization Header", regex: /(authorization|auth)[\s:]+['"]?(bearer|basic|token)[\s]+([A-Za-z0-9_\-./+=]{20,})['"]?/i },
  { type: "X-API-Key Header", regex: /x[_-]?api[_-]?key[\s:]+['"]?([A-Za-z0-9_-]{20,})['"]?/i },
  
  // Cryptocurrency
  { type: "Bitcoin Private Key", regex: /[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/ },
  { type: "Ethereum Private Key", regex: /0x[0-9a-fA-F]{64}/ },
  
  // Other
  { type: "Slack Token", regex: /xox[baprs]-[0-9a-zA-Z-]{10,48}/ },
  { type: "Discord Token", regex: /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/ },
  { type: "Heroku API Key", regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ },
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
  // 0️⃣ Skip encrypted shared secrets - they're safe to paste
  if (text.startsWith("SG_ENCRYPTED:")) {
    return { detected: false };
  }
  
  // 1️⃣ Known high-confidence patterns
  for (const p of patterns) {
    if (p.regex.test(text)) {
      const match = text.match(p.regex);
      const preview = match ? match[0].substring(0, 20) + "..." : text.substring(0, 20) + "...";
      return {
        detected: true,
        type: p.type,
        confidence: "high",
        explanation: `Looks like ${p.type} (${preview})`,
      };
    }
  }

  // 2️⃣ Advanced high-entropy secret detection
  if (text.length >= 12) {
    const entropy = calculateEntropy(text);
    
    // Check for secret-like patterns in the text
    const hasSecretKeywords = /(key|token|secret|auth|bearer|password|passwd|pwd|credential|cred|api|access|private|signature|sign)/i.test(text);
    const hasSecretContext = /(sk_|pk_|xox|ghp|gho|ghu|ghs|ghr|AKIA|eyJ|-----BEGIN|mongodb|postgres|mysql|redis|stripe|twilio|sendgrid)/i.test(text);
    
    // Check if it looks like a standalone secret (no spaces, no newlines, alphanumeric with special chars)
    const looksLikeSecret = /^[A-Za-z0-9_\-+=/.]{12,}$/.test(text) && 
                           !text.includes(" ") && 
                           !text.includes("\n") &&
                           !text.match(/^https?:\/\//) && // Not a URL
                           !text.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/); // Not an email
    
    // Base64-like strings (common for secrets)
    const isBase64Like = /^[A-Za-z0-9+/=]{16,}$/.test(text) && 
                         text.length % 4 === 0 &&
                         entropy > 3.0;
    
    // Hex strings (common for API keys, tokens)
    const isHexLike = /^[0-9a-fA-F]{24,}$/.test(text) && entropy > 3.0;
    
    // High entropy detection (very random-looking strings)
    if (entropy > 3.5) {
      // Very high entropy - likely a secret
      if (looksLikeSecret || isBase64Like || isHexLike) {
        return {
          detected: true,
          type: "High-entropy secret",
          confidence: "high",
          explanation: `High-entropy secret: ${text.length}+ random chars (entropy: ${entropy.toFixed(2)})`,
        };
      }
    } else if (entropy > 3.2) {
      // Medium-high entropy with context
      if (hasSecretKeywords || hasSecretContext || looksLikeSecret || isBase64Like) {
        return {
          detected: true,
          type: "Potential secret",
          confidence: "medium",
          explanation: `Potential secret: high entropy (${entropy.toFixed(2)}) with secret-like pattern`,
        };
      }
    } else if (entropy > 2.8 && (hasSecretKeywords || hasSecretContext)) {
      // Lower entropy but has secret keywords
      if (looksLikeSecret && text.length >= 16) {
        return {
          detected: true,
          type: "Potential secret",
          confidence: "low",
          explanation: `Potential secret: contains keywords and looks secret-like`,
        };
      }
    }
  }
  
  // 3️⃣ Check for secrets in structured formats (JSON, YAML, env files)
  if (text.includes(":") || text.includes("=")) {
    const lines = text.split(/\n/);
    for (const line of lines.slice(0, 10)) { // Check first 10 lines
      const lowerLine = line.toLowerCase();
      if ((lowerLine.includes("key") || lowerLine.includes("token") || 
           lowerLine.includes("secret") || lowerLine.includes("password") ||
           lowerLine.includes("api") || lowerLine.includes("auth")) &&
          line.match(/[:=]\s*['"]?[A-Za-z0-9_-]{16,}['"]?/)) {
        const match = line.match(/([A-Za-z0-9_-]{16,})/);
        if (match && match[0].length >= 16) {
          return {
            detected: true,
            type: "Secret in configuration",
            confidence: "medium",
            explanation: "Secret found in configuration format (JSON/YAML/env)",
          };
        }
      }
    }
  }

  return { detected: false };
}
