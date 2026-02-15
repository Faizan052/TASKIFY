const fs = require('fs');

const AI_MODEL = process.env.AI_MODEL || 'gemini-1.5-flash';
const AI_API_URL = process.env.AI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';

const stripCodeFences = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (trimmed.startsWith('```')) {
        return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    return trimmed;
};

const extractJsonPayload = (text) => {
    const normalized = stripCodeFences(text);
    try {
        return JSON.parse(normalized);
    } catch (_error) {
        const start = normalized.indexOf('{');
        const end = normalized.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(normalized.slice(start, end + 1));
        }
        throw new Error('AI response was not valid JSON');
    }
};

const readDocumentPreview = (file) => {
    if (!file || !file.path) return '';

    const lowerName = (file.originalname || '').toLowerCase();
    const textLike = ['.txt', '.json', '.xml', '.html', '.htm', '.css', '.js'];
    const canReadText = textLike.some((ext) => lowerName.endsWith(ext));

    if (!canReadText) return '';

    try {
        const content = fs.readFileSync(file.path, 'utf8');
        return content.slice(0, 4000);
    } catch (_error) {
        return '';
    }
};

const analyzeProjectRequest = async ({ deadline, category, title, description, file }) => {
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('AI API key is missing. Set GOOGLE_AI_API_KEY in server environment.');
    }

    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in this Node runtime.');
    }

    const fileSizeBytes = file?.size || 0;
    const fileSizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    const preview = readDocumentPreview(file);

    const prompt = [
        'You are TASKIFY AI request analyzer. Return strict JSON only, no markdown.',
        'Evaluate feasibility and timeline for software project delivery based on provided metadata.',
        'Use only this JSON schema:',
        '{',
        '  "feasible": boolean,',
        '  "estimatedDays": number,',
        '  "daysAvailable": number,',
        '  "buffer": number,',
        '  "complexity": "low" | "medium" | "high",',
        '  "complexityScore": number,',
        '  "keywordMatches": number,',
        '  "message": string,',
        '  "recommendations": string[],',
        '  "allowSubmit": boolean,',
        '  "analysis": {',
        '    "fileSize": string,',
        '    "category": string,',
        '    "deadline": string,',
        '    "intelligenceLevel": string',
        '  }',
        '}',
        'Rules:',
        '- `daysAvailable`, `buffer`, `estimatedDays`, `complexityScore`, `keywordMatches` must be integers.',
        '- `analysis.intelligenceLevel` must be "Google Gemini API".',
        '- keep recommendations concise and practical.',
        'Input:',
        JSON.stringify({
            now: new Date().toISOString(),
            deadline,
            category: category || 'other',
            title: title || '',
            description: description || '',
            document: {
                originalName: file?.originalname || '',
                mimeType: file?.mimetype || '',
                fileSizeBytes,
                fileSizeMb,
                preview
            }
        })
    ].join('\n');

    const url = `${AI_API_URL}/models/${AI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json'
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API request failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('AI API returned an empty response');
    }

    return extractJsonPayload(text);
};

module.exports = {
    analyzeProjectRequest
};
