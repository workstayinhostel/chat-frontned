const linkPattern = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;

export function extractLinks(text) {
  if (typeof text !== 'string' || !text) return [];
  const links = [];
  for (const match of text.matchAll(linkPattern)) {
    let displayText = match[0];
    while (/[.,!?;:'"]$/.test(displayText)) displayText = displayText.slice(0, -1);
    while (displayText.endsWith(')') && (displayText.match(/\)/g) || []).length > (displayText.match(/\(/g) || []).length) {
      displayText = displayText.slice(0, -1);
    }
    while (displayText.endsWith(']') && (displayText.match(/\]/g) || []).length > (displayText.match(/\[/g) || []).length) {
      displayText = displayText.slice(0, -1);
    }
    if (!displayText) continue;
    const start = match.index;
    const end = start + displayText.length;
    let parsed;
    try {
      parsed = new URL(/^www\./i.test(displayText) ? `https://${displayText}` : displayText);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) continue;
    links.push({
      text: displayText,
      start,
      end,
      href: parsed.href,
      hostname: parsed.hostname
    });
  }
  return links;
}
