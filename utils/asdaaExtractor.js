/**
 * Asdaa Article Extractor
 *
 * Extracts article content and title from asdaa-alsaa.com pages,
 * converting inline color styles to semantic CSS classes:
 *   - Quran verses (green) -> <span class="quran">
 *   - Hadith text (blue) -> <span class="hadith">
 *   - Section headers (red) -> <span class="section-header">
 *   - Bold text preserved
 *   - Paragraph structure from <p> tags
 */

function convertColorToClass(html) {
  return html
    .replace(/<span[^>]*style="[^"]*color:\s*#(008000|339966|006600|009933)[^"]*"[^>]*>/gi,
      '<span class="quran">')
    .replace(/<span[^>]*style="[^"]*color:\s*#(0000ff|3366ff|666699|0000cc|000099)[^"]*"[^>]*>/gi,
      '<span class="hadith">')
    .replace(/<span[^>]*style="[^"]*color:\s*#(ff0000|cc0000|ee0000)[^"]*"[^>]*>/gi,
      '<span class="section-header">')
    .replace(/<span[^>]*style="[^"]*color:[^"]*"[^>]*>/gi, '<span>')
    .replace(/<span>([^<]*)<\/span>/g, '$1');
}

function cleanHtml(html) {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  cleaned = convertColorToClass(cleaned);
  cleaned = cleaned.replace(/<p[^>]*>/gi, '<p>');
  cleaned = cleaned.replace(/<img[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?div[^>]*>/gi, '');
  cleaned = cleaned.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));

  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*/gi, '<p>')
    .replace(/\s*<\/p>/gi, '</p>');

  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');

  return cleaned.trim();
}

function extractContent(html) {
  const startMatch = html.match(/<div[^>]*class="entry-content[^"]*"[^>]*>/i);
  if (!startMatch) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = html.substring(startIndex);

  let endIndex;
  const tagsMatch = afterStart.match(/<div[^>]*class="post-bottom/i);
  if (tagsMatch) {
    endIndex = tagsMatch.index;
  } else {
    const commentMatch = afterStart.match(/<\/div><!--\s*\.entry-content/i);
    endIndex = commentMatch ? commentMatch.index : afterStart.indexOf('</article>');
  }
  if (endIndex <= 0) endIndex = afterStart.length;

  const rawContent = afterStart.substring(0, endIndex);
  const cleaned = cleanHtml(rawContent);

  const paragraphs = [];
  const pRegex = /<p>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = pRegex.exec(cleaned)) !== null) {
    const content = match[1].trim();
    if (content) {
      paragraphs.push(`<p>${content}</p>`);
    }
  }

  if (paragraphs.length === 0) return null;

  let startIdx = 0;
  const firstText = paragraphs[0].replace(/<[^>]+>/g, '').trim();
  if (firstText.length < 50 && firstText.includes('الدغريري')) {
    startIdx = 1;
  }

  return paragraphs.slice(startIdx).join('\n');
}

function extractTitle(html) {
  const match = html.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  return match[1].replace(/<[^>]+>/g, '').trim();
}

function extractPublishedDate(html) {
  const match = html.match(/<time[^>]*class="[^"]*entry-date[^"]*"[^>]*datetime="([^"]*)"[^>]*>/i);
  if (match) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) return d;
  }
  const metaMatch = html.match(/<meta[^>]*property="article:published_time"[^>]*content="([^"]*)"[^>]*>/i);
  if (metaMatch) {
    const d = new Date(metaMatch[1]);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

async function fetchPage(url) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        }
      });
      clearTimeout(timeout);
      if (response.status === 429) {
        if (attempt === maxAttempts) {
          throw new Error('الموقع يحد من الطلبات (429). حاول مرة أخرى بعد دقيقة');
        }
        const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      if (error.message.includes('429')) {
        const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(r => setTimeout(r, delay));
      } else {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
}

async function extractFromUrl(url) {
  const html = await fetchPage(url);
  const title = extractTitle(html);
  const content = extractContent(html);
  const publishedAt = extractPublishedDate(html);

  if (!content) {
    throw new Error('Could not extract article content from this URL');
  }

  const paragraphCount = (content.match(/<p>/gi) || []).length;
  const hasQuran = content.includes('class="quran"');
  const hasHadith = content.includes('class="hadith"');
  const hasHeaders = content.includes('class="section-header"');

  return {
    title: title || '',
    content,
    publishedAt,
    stats: {
      paragraphs: paragraphCount,
      hasQuran,
      hasHadith,
      hasHeaders
    }
  };
}

module.exports = {
  extractFromUrl,
  extractContent,
  extractTitle,
  extractPublishedDate
};
