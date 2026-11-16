const officialHosts = new Set(['www.mta.info', 'mta.info', 'new.mta.info', 'data.ny.gov']);
function approvedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && officialHosts.has(url.hostname) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

// Parse links only, not HTML or general Markdown. Everything else stays literal text.
export function answerParts(text) {
  const parts = [];
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s<>"']+?)\)|https?:\/\/[^\s<>"']+/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    let candidate = match[2] || match[0], suffix = '';
    if (!match[2]) {
      while (/[.,;:!?]$/.test(candidate) || (candidate.endsWith(')') && (candidate.match(/\)/g)||[]).length > (candidate.match(/\(/g)||[]).length)) {
        suffix = candidate.at(-1) + suffix; candidate = candidate.slice(0,-1);
      }
    }
    const href = approvedUrl(candidate);
    if (href) {
      parts.push({ text: match[1] || candidate, href });
      if (suffix) parts.push({ text: suffix });
    } else parts.push({ text: match[0] });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}

export function appendAnswerText(container, text) {
  for (const part of answerParts(text)) {
    if (!part.href) { container.append(document.createTextNode(part.text)); continue; }
    const link = document.createElement('a');
    link.href = part.href;
    link.textContent = part.text;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${part.text} (opens in a new tab)`);
    container.append(link);
  }
  return container;
}
