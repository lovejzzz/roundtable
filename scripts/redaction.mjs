export function redactVisibleString(value, limit = Infinity) {
  return String(value || "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/gi, "Bearer [redacted]")
    .replace(
      /\b(authorization|api[_-]?key|bridge[_-]?key|credential|sse[_-]?ticket|ticket|token)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\b(?:sk-|art_v1_|api[_-]?key[:=]?)[A-Za-z0-9._-]{10,}\b/gi, "[redacted]")
    .slice(0, limit);
}
