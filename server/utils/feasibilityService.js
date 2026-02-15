const { parseDocument } = require('./documentParser');
const { extractRequirements } = require('./summarizationEngine');

const CATEGORY_PROFILES = {
    website: { baseDays: 14, complexityWeight: 1.35, label: 'Web Development' },
    'mobile-app': { baseDays: 24, complexityWeight: 1.55, label: 'Mobile Application' },
    'desktop-app': { baseDays: 18, complexityWeight: 1.4, label: 'Desktop Application' },
    testing: { baseDays: 8, complexityWeight: 1.1, label: 'Testing & QA' },
    updation: { baseDays: 6, complexityWeight: 1.0, label: 'Update / Maintenance' },
    design: { baseDays: 7, complexityWeight: 1.05, label: 'UI/UX Design' },
    api: { baseDays: 11, complexityWeight: 1.25, label: 'API Development' },
    database: { baseDays: 12, complexityWeight: 1.3, label: 'Database Work' },
    other: { baseDays: 10, complexityWeight: 1.2, label: 'General Request' }
};

const COMPLEXITY_KEYWORDS = {
    integrations: ['integration', 'third-party', 'payment', 'gateway', 'stripe', 'paypal'],
    security: ['auth', 'authentication', 'authorization', 'security', 'role', 'permission', 'jwt', 'otp'],
    data: ['database', 'migration', 'analytics', 'reporting', 'dashboard', 'api', 'sync'],
    scope: ['multi', 'module', 'workflow', 'admin panel', 'real-time', 'chat', 'notification']
};

const toSafeString = (value) => (value || '').toString().trim();

const toSafeLower = (value) => toSafeString(value).toLowerCase();

const daysBetweenTodayAnd = (deadline) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(deadline);
    due.setHours(0, 0, 0, 0);

    const diff = due.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const countKeywordMatches = (text, keywords) => keywords.reduce((count, keyword) => {
    if (text.includes(keyword)) {
        return count + 1;
    }
    return count;
}, 0);

const evaluateComplexity = ({ title, description, documentText = '', fileSize = 0 }) => {
    const body = `${toSafeLower(title)} ${toSafeLower(description)} ${toSafeLower(documentText)}`;

    const lengthScore = Math.min(4, Math.floor(body.length / 220));
    const integrationScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.integrations);
    const securityScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.security);
    const dataScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.data);
    const scopeScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.scope);
    const attachmentScore = fileSize > 5 * 1024 * 1024 ? 2 : fileSize > 2 * 1024 * 1024 ? 1 : 0;

    const totalScore = lengthScore + integrationScore + securityScore + dataScore + scopeScore + attachmentScore;

    let complexityLevel = 'low';
    if (totalScore >= 8) {
        complexityLevel = 'high';
    } else if (totalScore >= 4) {
        complexityLevel = 'medium';
    }

    return {
        totalScore,
        complexityLevel,
        factors: {
            lengthScore,
            integrationScore,
            securityScore,
            dataScore,
            scopeScore,
            attachmentScore
        }
    };
};

const analyzeRequestFeasibility = async ({ deadline, category, title, description, file }) => {
    const selectedCategory = toSafeString(category);
    const safeTitle = toSafeString(title);
    const safeDescription = toSafeString(description);

    // Parse and summarize document if provided
    let documentSummary = null;
    let documentRequirements = null;
    let documentText = '';

    if (file && file.path) {
        try {
            // Parse the document (PDF, Word, or text)
            documentText = await parseDocument(file.path, file.mimetype);
            
            // Extract requirements and generate summary
            documentRequirements = extractRequirements(documentText);
            documentSummary = documentRequirements.summary;
        } catch (error) {
            console.error('Error parsing document:', error);
            documentSummary = 'Unable to parse document content.';
        }
    }

    const detectedCategory = documentRequirements?.category;
    const finalCategory = selectedCategory || (detectedCategory && CATEGORY_PROFILES[detectedCategory] ? detectedCategory : 'other');
    const profile = CATEGORY_PROFILES[finalCategory] || CATEGORY_PROFILES.other;

    const daysUntilDeadline = daysBetweenTodayAnd(deadline);
    const complexity = evaluateComplexity({
        title: safeTitle,
        description: safeDescription,
        documentText,
        fileSize: file ? file.size : 0
    });

    const effortFromComplexity = Math.ceil(complexity.totalScore * profile.complexityWeight);
    const qualityAndBuffer = complexity.complexityLevel === 'high' ? 3 : 2;
    const estimatedDays = profile.baseDays + effortFromComplexity + qualityAndBuffer;

    const feasible = daysUntilDeadline >= estimatedDays;
    const allowSubmit = feasible;

    const scheduleGap = daysUntilDeadline - estimatedDays;

    const recommendations = [];

    if (!feasible) {
        const extraDays = Math.max(1, estimatedDays - daysUntilDeadline);
        recommendations.push(`Adjust deadline by at least ${extraDays} day(s).`);
        recommendations.push('Reduce deliverable scope and split work into phased milestones.');
    } else {
        recommendations.push('Lock scope early to prevent delivery drift.');
        recommendations.push('Share clear acceptance criteria for each deliverable.');
    }

    if (safeDescription.length < 120 && !documentSummary) {
        recommendations.push('Provide more detailed functional requirements to reduce rework risk.');
    }

    if (!file) {
        recommendations.push('Attach a supporting document to improve planning accuracy.');
    }

    const riskLevel = !feasible
        ? (scheduleGap <= -7 ? 'high' : 'medium')
        : (scheduleGap <= 2 ? 'medium' : 'low');

    const confidence = safeDescription.length >= 180 || file
        ? 'high'
        : safeDescription.length >= 100
            ? 'medium'
            : 'low';

    return {
        feasible,
        allowSubmit,
        estimatedDays,
        daysUntilDeadline,
        message: feasible
            ? `Feasibility approved. Estimated effort is ${estimatedDays} day(s) for ${profile.label}.`
            : `Feasibility not approved. Estimated effort is ${estimatedDays} day(s), while the current timeline allows ${Math.max(0, daysUntilDeadline)} day(s).`,
        recommendations,
        documentSummary, // NEW: Include document summary
        analysis: {
            intelligenceLevel: 'Local Feasibility Engine',
            category: finalCategory,
            categoryLabel: profile.label,
            complexityLevel: complexity.complexityLevel,
            complexityScore: complexity.totalScore,
            confidence,
            riskLevel,
            factors: complexity.factors,
            detectedCategory, // NEW: Detected category from doc
            wordCount: documentRequirements?.wordCount // NEW: Document word count
        }
    };
};

module.exports = {
    analyzeRequestFeasibility
};
