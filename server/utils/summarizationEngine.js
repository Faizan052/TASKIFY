const REQUEST_KEYWORDS = [
  'need', 'require', 'required', 'request', 'looking for', 'would like', 'must',
  'develop', 'create', 'build', 'design', 'implement', 'integrate', 'deliver',
  'feature', 'module', 'dashboard', 'system', 'portal', 'application', 'website',
  'api', 'database', 'security', 'reporting', 'testing', 'deadline', 'timeline', 'urgent'
];

const IMPORTANCE_HINTS = ['scope', 'objective', 'deliverable', 'expected', 'acceptance', 'priority'];

const normalizeText = (text) => (text || '')
  .replace(/\r/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[\t ]{2,}/g, ' ')
  .trim();

const splitSentences = (text) => {
  const clean = normalizeText(text);
  if (!clean) return [];

  const chunks = clean.match(/[^.!?\n]+[.!?]?/g) || [];
  return chunks
    .map((chunk, index) => ({
      index,
      sentence: chunk.trim()
    }))
    .filter(({ sentence }) => sentence.length >= 20);
};

const scoreSentence = (sentenceText, index) => {
  const lower = sentenceText.toLowerCase();
  const wordCount = sentenceText.split(/\s+/).filter(Boolean).length;
  let score = 0;

  REQUEST_KEYWORDS.forEach((keyword) => {
    if (lower.includes(keyword)) score += 2;
  });

  IMPORTANCE_HINTS.forEach((keyword) => {
    if (lower.includes(keyword)) score += 1;
  });

  if (/(^|\s)(please|can you|kindly|we need|we require|the task is|objective)/i.test(lower)) {
    score += 3;
  }

  if (/(deadline|by\s+\d{1,2}[/-]\d{1,2}|within\s+\d+\s+days?|urgent|asap)/i.test(lower)) {
    score += 2;
  }

  if (wordCount >= 10 && wordCount <= 40) {
    score += 2;
  } else if (wordCount > 40) {
    score += 1;
  }

  if (index <= 2) {
    score += 2 - Math.min(index, 2);
  }

  return score;
};

/**
 * Extract key sentences from text based on request-focused scoring.
 * @param {string} text
 * @param {number} maxSentences
 * @returns {Array<{ sentence: string; score: number; index: number }>}
 */
function extractKeySentences(text, maxSentences = 3) {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];

  const scored = sentences.map(({ sentence, index }) => ({
    sentence,
    score: scoreSentence(sentence, index),
    index
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxSentences));
}

/**
 * Generate a summary of what is being requested in the document
 * @param {string} text - Document text content
 * @returns {string} 2-3 sentence summary
 */
function summarizeDocument(text) {
  const clean = normalizeText(text);

  if (!clean) {
    return 'Unable to extract content from the document. Please ensure the document contains readable text.';
  }

  const selected = extractKeySentences(clean, 3);

  if (selected.length === 0) {
    return 'The document appears to be empty or contains no meaningful content.';
  }

  // Preserve natural flow by restoring original document order.
  const ordered = [...selected].sort((a, b) => a.index - b.index).map((item) => item.sentence);
  const summarySentences = ordered.slice(0, Math.min(3, Math.max(2, ordered.length)));

  const summary = summarySentences
    .map((line) => line.replace(/[.!?]*$/, '.'))
    .join(' ')
    .trim();

  if (summary.length > 520) {
    return `${summary.slice(0, 517).trim()}...`;
  }

  return summary;
}

/**
 * Identify the category/type of request from the text
 * @param {string} text - Document text content
 * @returns {string} Detected category
 */
function identifyRequestType(text) {
  if (!text) return 'other';

  const lowerText = normalizeText(text).toLowerCase();

  const categoryPatterns = {
    website: ['website', 'web application', 'web app', 'web portal', 'landing page', 'web development'],
    'mobile-app': ['mobile app', 'android', 'ios', 'flutter', 'react native'],
    'desktop-app': ['desktop app', 'windows app', 'wpf', 'winforms', 'c# desktop', 'electron desktop'],
    design: ['design', 'ui', 'ux', 'user interface', 'mockup', 'wireframe', 'prototype', 'graphic'],
    testing: ['test', 'testing', 'qa', 'quality assurance', 'bug', 'defect'],
    api: ['api', 'endpoint', 'rest', 'graphql', 'backend service'],
    database: ['database', 'sql', 'table', 'schema', 'query', 'migration', 'stored procedure'],
    updation: ['maintain', 'maintenance', 'update', 'upgrade', 'modification', 'enhancement', 'patch', 'fix']
  };

  let maxScore = 0;
  let detectedCategory = 'other';

  for (const [category, keywords] of Object.entries(categoryPatterns)) {
    let score = 0;
    keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        score++;
      }
    });

    if (score > maxScore) {
      maxScore = score;
      detectedCategory = category;
    }
  }

  return detectedCategory;
}

/**
 * Extract key requirements and details from the document
 * @param {string} text - Document text content
 * @returns {Object} Extracted requirements
 */
function extractRequirements(text) {
  if (!text) {
    return {
      summary: 'No content available',
      category: 'general',
      keyPoints: []
    };
  }

  const clean = normalizeText(text);
  const summary = summarizeDocument(clean);
  const category = identifyRequestType(clean);
  const keySentences = extractKeySentences(clean, 5);

  return {
    summary,
    category,
    keyPoints: keySentences.map(item => item.sentence),
    wordCount: clean.split(/\s+/).filter(Boolean).length
  };
}

module.exports = {
  summarizeDocument,
  extractKeySentences,
  identifyRequestType,
  extractRequirements
};
