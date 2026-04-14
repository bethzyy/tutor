/**
 * Lightweight inline Markdown renderer.
 * Handles: **bold**, *italic*, `code`, \n line breaks.
 * Returns an array of React elements.
 */
export function renderMarkdown(text) {
  if (!text) return null;

  // Split into parts by patterns: **bold**, *italic*, `code`, and plain text
  const parts = [];
  // Match **bold**, *italic*, `code` — order matters: bold before italic
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const full = match[1];
    if (full.startsWith('**')) {
      parts.push({ type: 'bold', content: match[2], key: key++ });
    } else if (full.startsWith('*')) {
      parts.push({ type: 'italic', content: match[3], key: key++ });
    } else if (full.startsWith('`')) {
      parts.push({ type: 'code', content: match[4], key: key++ });
    }
    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.map((part, i) => {
    if (typeof part === 'string') {
      // Handle newlines within plain text
      return part.split('\n').map((line, j, arr) => (
        <span key={`t-${i}-${j}`}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ));
    }
    if (part.type === 'bold') return <strong key={`b-${part.key}`}>{part.content}</strong>;
    if (part.type === 'italic') return <em key={`i-${part.key}`}>{part.content}</em>;
    if (part.type === 'code') return <code key={`c-${part.key}`} className="px-1 py-0.5 bg-black/5 rounded text-[13px] font-mono">{part.content}</code>;
    return part.content;
  });
}
