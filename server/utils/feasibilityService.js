const { parseDocument } = require('./documentParser');
const { extractRequirements, identifyRequestType } = require('./summarizationEngine');

const CATEGORY_PROFILES = {
    website: { label: 'Web Development', effortMultiplier: 1.15 },
    'mobile-app': { label: 'Mobile Application', effortMultiplier: 1.35 },
    'desktop-app': { label: 'Desktop Application', effortMultiplier: 1.2 },
    testing: { label: 'Testing & QA', effortMultiplier: 0.95 },
    updation: { label: 'Update / Maintenance', effortMultiplier: 0.85 },
    design: { label: 'UI/UX Design', effortMultiplier: 0.9 },
    api: { label: 'API Development', effortMultiplier: 1.05 },
    database: { label: 'Database Work', effortMultiplier: 1.1 },
    other: { label: 'General Request', effortMultiplier: 1 }
};

const COMPLEXITY_KEYWORDS = {
    integrations: ['integration', 'third-party', 'payment', 'gateway', 'stripe', 'paypal'],
    security: ['auth', 'authentication', 'authorization', 'security', 'role', 'permission', 'jwt', 'otp'],
    data: ['database', 'migration', 'analytics', 'reporting', 'dashboard', 'api', 'sync'],
    scope: ['multi', 'module', 'workflow', 'admin panel', 'real-time', 'chat', 'notification'],
    quality: ['test case', 'unit test', 'qa', 'uat', 'performance', 'security testing'],
    delivery: ['milestone', 'phase', 'sprint', 'deployment', 'rollout', 'handover']
};

const FULL_BUILD_KEYWORDS = [
    'complete website',
    'complete web application',
    'complete application',
    'full website',
    'full web app',
    'from scratch',
    'end-to-end',
    'entire system',
    'build a system',
    'build system',
    'new platform',
    'enterprise platform'
];

const FULL_BUILD_PATTERNS = [
    /\b(complete|full|entire|end-to-end)\b.{0,40}\b(website|web\s*app|application|system|portal|platform|e-?commerce|store)\b/,
    /\b(from scratch|new)\b.{0,30}\b(website|web\s*app|application|system|portal|platform|e-?commerce|store)\b/,
    /\be-?commerce\b.{0,20}\b(website|store|platform)\b/
];

const MAINTENANCE_KEYWORDS = [
    'fix',
    'bug',
    'patch',
    'update',
    'upgrade',
    'minor change',
    'small change',
    'enhancement'
];

const ARCHITECTURE_KEYWORDS = [
    'architecture',
    'microservice',
    'distributed',
    'scalable',
    'high availability',
    'multi tenant',
    'event driven'
];

const PROJECT_MODULE_GROUPS = {
    authentication: ['login', 'signup', 'register', 'auth', 'rbac', 'role', 'permission', 'jwt', 'otp'],
    userManagement: ['user management', 'profile', 'account', 'admin panel', 'admin dashboard'],
    formsValidation: ['form', 'forms', 'crud', 'validation', 'search', 'filter'],
    commerce: ['ecommerce', 'e-commerce', 'cart', 'checkout', 'product', 'catalog', 'order', 'inventory'],
    dataLayer: ['database', 'schema', 'sql', 'mongodb', 'migration', 'data model'],
    apiLayer: ['api', 'endpoint', 'rest', 'graphql', 'backend'],
    dashboards: ['dashboard', 'report', 'analytics', 'kpi'],
    workflow: ['workflow', 'approval', 'task assignment', 'ticket', 'lifecycle'],
    communication: ['notification', 'email', 'sms', 'chat', 'message'],
    integrations: ['integration', 'third-party', 'payment', 'gateway', 'erp', 'crm', 'webhook'],
    qaDelivery: ['testing', 'qa', 'uat', 'deployment', 'ci/cd', 'pipeline']
};

const SCALE_HOUR_FLOORS = {
    website: { minor: 4, feature: 20, full: 140, enterprise: 280 },
    'mobile-app': { minor: 6, feature: 28, full: 180, enterprise: 340 },
    'desktop-app': { minor: 5, feature: 24, full: 150, enterprise: 300 },
    api: { minor: 4, feature: 18, full: 120, enterprise: 240 },
    database: { minor: 4, feature: 16, full: 90, enterprise: 180 },
    design: { minor: 3, feature: 14, full: 80, enterprise: 140 },
    testing: { minor: 3, feature: 12, full: 60, enterprise: 120 },
    updation: { minor: 3, feature: 10, full: 48, enterprise: 90 },
    other: { minor: 4, feature: 20, full: 120, enterprise: 220 }
};

const REQUIREMENT_CLARITY_KEYWORDS = ['must', 'should', 'required', 'need', 'deliverable', 'acceptance', 'criteria'];
const AMBIGUITY_KEYWORDS = ['maybe', 'etc', 'something', 'asap', 'quickly', 'any', 'whatever', 'later'];
const SIMPLE_TASK_KEYWORDS = [
    'create table',
    'basic table',
    'simple table',
    'table in c#',
    'simple c#',
    'basic function',
    'basic method',
    'hello world',
    'single form',
    'single api',
    'small fix',
    'minor fix',
    'bug fix',
    'simple script',
    'print report',
    'small change'
];
const COMPLEX_TASK_KEYWORDS = [
    'architecture',
    'microservice',
    'distributed',
    'real-time',
    'scalable',
    'high availability',
    'multi tenant',
    'payment gateway',
    'oauth',
    'sso',
    'pipeline',
    'ci/cd',
    'migration'
];
const MEDIUM_TASK_KEYWORDS = [
    'crud',
    'dashboard',
    'multiple forms',
    'data validation',
    'role-based',
    'authorization',
    'pagination',
    'search and filter',
    'export',
    'upload and download'
];
const SIMPLE_ACTION_KEYWORDS = [
    'add',
    'create',
    'update',
    'fix',
    'change',
    'display',
    'show',
    'print'
];

const WORKING_HOURS_PER_DAY = 8;

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

const roundTo = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

const normalizeCategoryKey = (category) => {
    const raw = toSafeLower(category);
    if (!raw) return '';
    if (CATEGORY_PROFILES[raw]) return raw;

    const aliasMap = {
        'web-app': 'website',
        'web app': 'website',
        'web application': 'website',
        web: 'website',
        'ecommerce': 'website',
        'e-commerce': 'website',
        mobile: 'mobile-app',
        desktop: 'desktop-app',
        update: 'updation',
        maintenance: 'updation'
    };

    return aliasMap[raw] || '';
};

const resolveFinalCategory = ({ selectedCategory, detectedCategory, textDetectedCategory }) => {
    const selected = normalizeCategoryKey(selectedCategory);
    const detectedFromDoc = normalizeCategoryKey(detectedCategory);
    const detectedFromText = normalizeCategoryKey(textDetectedCategory);

    if (selected && selected !== 'other') return selected;
    if (detectedFromDoc && detectedFromDoc !== 'other') return detectedFromDoc;
    if (detectedFromText && detectedFromText !== 'other') return detectedFromText;
    if (selected) return selected;
    if (detectedFromDoc) return detectedFromDoc;
    if (detectedFromText) return detectedFromText;
    return 'other';
};

const detectModuleCoverage = (body) => {
    const matchedModules = Object.entries(PROJECT_MODULE_GROUPS)
        .filter(([, keywords]) => keywords.some(keyword => body.includes(keyword)))
        .map(([module]) => module);

    return {
        matchedModules,
        moduleCount: matchedModules.length
    };
};

const resolveProjectScale = ({
    fullBuildSignals,
    enterpriseSignals,
    architectureSignals,
    integrationSignals,
    moduleCount,
    scopeItems,
    maintenanceSignals
}) => {
    const maintenanceDominant = maintenanceSignals >= 1 && fullBuildSignals === 0 && moduleCount <= 2 && scopeItems <= 3;

    if (enterpriseSignals >= 2 || moduleCount >= 7 || (architectureSignals >= 2 && integrationSignals >= 2)) {
        return maintenanceDominant ? 'feature' : 'enterprise';
    }

    if (fullBuildSignals >= 1 || moduleCount >= 5 || architectureSignals >= 2 || scopeItems >= 8) {
        return maintenanceDominant ? 'feature' : 'full';
    }

    if (moduleCount >= 2 || integrationSignals >= 1 || scopeItems >= 4) {
        return 'feature';
    }

    return 'minor';
};

const analyzeProjectScope = ({ title, description, documentText = '', scopeItems = 1, category = 'other' }) => {
    const body = `${toSafeLower(title)} ${toSafeLower(description)} ${toSafeLower(documentText)}`;

    const fullBuildKeywordSignals = countKeywordMatches(body, FULL_BUILD_KEYWORDS);
    const fullBuildPatternSignals = FULL_BUILD_PATTERNS.reduce((count, pattern) => (pattern.test(body) ? count + 1 : count), 0);
    const fullBuildSignals = fullBuildKeywordSignals + fullBuildPatternSignals;
    const maintenanceSignals = countKeywordMatches(body, MAINTENANCE_KEYWORDS);
    const architectureSignals = countKeywordMatches(body, ARCHITECTURE_KEYWORDS);
    const integrationSignals = countKeywordMatches(body, COMPLEXITY_KEYWORDS.integrations);
    const enterpriseSignals = countKeywordMatches(body, ['enterprise', 'multi-tenant', 'high availability', 'distributed']);

    const { matchedModules, moduleCount } = detectModuleCoverage(body);

    const scale = resolveProjectScale({
        fullBuildSignals,
        enterpriseSignals,
        architectureSignals,
        integrationSignals,
        moduleCount,
        scopeItems,
        maintenanceSignals
    });

    return {
        scale,
        fullBuildSignals,
        fullBuildKeywordSignals,
        fullBuildPatternSignals,
        maintenanceSignals,
        architectureSignals,
        integrationSignals,
        enterpriseSignals,
        moduleCount,
        matchedModules,
        category
    };
};

const applyProjectScaleAdjustment = ({ estimatedHours, category = 'other', projectScope }) => {
    const floors = SCALE_HOUR_FLOORS[category] || SCALE_HOUR_FLOORS.other;
    const floorByScale = floors[projectScope.scale] || floors.minor;

    let adjustedHours = estimatedHours;

    const modulePressure = Math.min(0.7, (projectScope.moduleCount * 0.08)
        + (projectScope.integrationSignals * 0.05)
        + (projectScope.architectureSignals * 0.06));

    if (projectScope.scale === 'feature' && projectScope.moduleCount >= 3) {
        adjustedHours *= (1 + modulePressure);
    }

    if (projectScope.scale === 'full' || projectScope.scale === 'enterprise' || projectScope.fullBuildSignals >= 1) {
        adjustedHours *= (1 + Math.max(0.2, modulePressure));
    }

    if (projectScope.scale === 'minor') {
        return roundTo(Math.max(0.5, adjustedHours), 2);
    }

    adjustedHours = Math.max(adjustedHours, floorByScale);

    return roundTo(adjustedHours, 2);
};

const applyUncertaintyBuffer = ({ estimatedHours, confidence, requirementQuality }) => {
    const confidenceFactor = confidence === 'low'
        ? 1.25
        : confidence === 'medium'
            ? 1.1
            : 1;

    const qualityFactor = requirementQuality === 'low'
        ? 1.2
        : requirementQuality === 'medium'
            ? 1.08
            : 1;

    const factor = Math.max(confidenceFactor, qualityFactor);
    return roundTo(estimatedHours * factor, 2);
};

const estimateScopeItems = ({ title, description, documentRequirements = null }) => {
    const body = `${toSafeString(title)} ${toSafeString(description)}`;
    const listSplitCount = body
        .split(/[\n,;]|\band\b|\bthen\b/gi)
        .map(item => item.trim())
        .filter(Boolean).length;

    const keyPointCount = Array.isArray(documentRequirements?.keyPoints)
        ? documentRequirements.keyPoints.length
        : 0;

    return Math.max(1, Math.min(20, Math.max(keyPointCount, listSplitCount)));
};

const detectTaskIntent = ({ title, description, documentText = '', complexityScore, scopeItems }) => {
    const body = `${toSafeLower(title)} ${toSafeLower(description)} ${toSafeLower(documentText)}`;
    const simpleSignals = countKeywordMatches(body, SIMPLE_TASK_KEYWORDS);
    const mediumSignals = countKeywordMatches(body, MEDIUM_TASK_KEYWORDS);
    const complexSignals = countKeywordMatches(body, COMPLEX_TASK_KEYWORDS);
    const actionSignals = countKeywordMatches(body, SIMPLE_ACTION_KEYWORDS);
    const simpleToneSignal = /\b(simple|basic|small|minor|quick)\b/.test(body);
    const tableSignal = /\b(table|datatable|data table|grid)\b/.test(body);
    const singleScopeSignal = /\b(single|one|only)\b/.test(body);
    const likelySimpleByTone = simpleToneSignal && actionSignals >= 1 && complexSignals === 0 && mediumSignals <= 1 && scopeItems <= 3 && complexityScore <= 6;
    const likelySimpleTableTask = tableSignal && actionSignals >= 1 && complexSignals === 0 && mediumSignals === 0 && scopeItems <= 3 && complexityScore <= 6;

    if ((simpleSignals >= 1 && complexSignals === 0 && mediumSignals <= 1 && scopeItems <= 3 && complexityScore <= 5) || likelySimpleByTone || likelySimpleTableTask || (singleScopeSignal && likelySimpleByTone)) {
        return {
            type: 'simple',
            confidence: (simpleSignals >= 2 || (likelySimpleByTone && tableSignal)) ? 'high' : 'medium',
            simpleSignals,
            mediumSignals,
            complexSignals,
            actionSignals
        };
    }

    if (complexSignals >= 2 || complexityScore >= 10 || scopeItems >= 8) {
        return {
            type: 'complex',
            confidence: (complexSignals >= 3 || complexityScore >= 13) ? 'high' : 'medium',
            simpleSignals,
            mediumSignals,
            complexSignals,
            actionSignals
        };
    }

    return {
        type: 'medium',
        confidence: mediumSignals >= 2 ? 'high' : 'medium',
        simpleSignals,
        mediumSignals,
        complexSignals,
        actionSignals
    };
};

const countSentences = (text) => {
    if (!text) return 0;
    return text
        .split(/[.!?\n]+/)
        .map(item => item.trim())
        .filter(Boolean).length;
};

const evaluateRequirementQuality = ({ title, description, documentText = '', documentRequirements = null }) => {
    const body = `${toSafeLower(title)} ${toSafeLower(description)} ${toSafeLower(documentText)}`;

    const requirementSignals = countKeywordMatches(body, REQUIREMENT_CLARITY_KEYWORDS);
    const ambiguitySignals = countKeywordMatches(body, AMBIGUITY_KEYWORDS);
    const sentenceCount = countSentences(body);
    const functionalRequirementCount = Array.isArray(documentRequirements?.keyPoints)
        ? documentRequirements.keyPoints.length
        : 0;

    const detailScore = Math.min(4, Math.floor(body.length / 250));
    const clarityScore = Math.min(3, requirementSignals);
    const ambiguityPenalty = Math.min(3, ambiguitySignals);
    const structureScore = sentenceCount >= 6 ? 2 : sentenceCount >= 3 ? 1 : 0;
    const docRequirementScore = functionalRequirementCount >= 6 ? 3 : functionalRequirementCount >= 3 ? 2 : functionalRequirementCount > 0 ? 1 : 0;

    const rawScore = detailScore + clarityScore + structureScore + docRequirementScore - ambiguityPenalty;
    const qualityScore = Math.max(0, Math.min(10, rawScore + 2));

    const qualityLevel = qualityScore >= 8 ? 'high' : qualityScore >= 5 ? 'medium' : 'low';

    return {
        qualityScore,
        qualityLevel,
        factors: {
            detailScore,
            clarityScore,
            structureScore,
            docRequirementScore,
            ambiguityPenalty,
            functionalRequirementCount
        }
    };
};

const detectEffortTier = ({ title, description, documentText = '', complexityScore, wordCount = 0, scopeItems = 1 }) => {
    const body = `${toSafeLower(title)} ${toSafeLower(description)} ${toSafeLower(documentText)}`;
    const simpleSignals = countKeywordMatches(body, SIMPLE_TASK_KEYWORDS);
    const complexSignals = countKeywordMatches(body, COMPLEX_TASK_KEYWORDS);
    const simpleToneSignal = /\b(simple|basic|small|minor|quick)\b/.test(body);

    if ((simpleSignals >= 1 || simpleToneSignal) && complexSignals === 0 && complexityScore <= 5 && wordCount <= 320 && scopeItems <= 3) {
        return { tier: 'micro', simpleSignals, complexSignals };
    }
    if (complexityScore <= 5 && complexSignals <= 1 && wordCount <= 500) {
        return { tier: 'small', simpleSignals, complexSignals };
    }
    if (complexityScore <= 9 && complexSignals <= 3) {
        return { tier: 'medium', simpleSignals, complexSignals };
    }
    if (complexityScore <= 14) {
        return { tier: 'high', simpleSignals, complexSignals };
    }
    return { tier: 'very_high', simpleSignals, complexSignals };
};

const estimateEffortHours = ({ tier, complexityScore, qualityLevel, categoryMultiplier, hasAttachment, wordCount }) => {
    const tierBaseHours = {
        micro: 0.75,
        small: 3,
        medium: 12,
        high: 40,
        very_high: 88
    };

    let estimatedHours = tierBaseHours[tier] || 8;

    if (tier === 'micro') {
        estimatedHours += complexityScore * 0.2;
    } else if (tier === 'small') {
        estimatedHours += complexityScore * 0.8;
    } else if (tier === 'medium') {
        estimatedHours += complexityScore * 1.3;
    } else {
        estimatedHours += complexityScore * 2.1;
    }

    if (qualityLevel === 'low') {
        estimatedHours += tier === 'micro' ? 0.25 : 2.5;
    } else if (qualityLevel === 'medium') {
        estimatedHours += tier === 'micro' ? 0.1 : 1;
    }

    if (hasAttachment && wordCount > 1400) {
        estimatedHours += 3;
    } else if (hasAttachment && wordCount > 700) {
        estimatedHours += 1.5;
    }

    estimatedHours *= categoryMultiplier;

    if (tier === 'micro') {
        estimatedHours = Math.min(6, Math.max(0.5, estimatedHours));
    } else {
        estimatedHours = Math.max(1.5, estimatedHours);
    }

    return roundTo(estimatedHours, 2);
};

const normalizeEffortByIntent = ({ estimatedHours, intentType, scopeItems, complexityScore }) => {
    let result = estimatedHours;

    if (intentType === 'simple') {
        const simpleCap = scopeItems <= 2 ? 2 : 4;
        result = Math.min(result, simpleCap);
        result = Math.max(0.5, result);
    } else if (intentType === 'medium') {
        result = Math.max(3, result);
        if (scopeItems >= 6) result += 2;
    } else {
        result = Math.max(16, result);
        if (complexityScore >= 14) result += 6;
    }

    return roundTo(result, 2);
};

const deriveComplexityClass = ({ intentType, complexityScore }) => {
    if (intentType === 'simple' && complexityScore <= 5) return 'simple';
    if (intentType === 'complex' || complexityScore >= 10) return 'complex';
    return 'medium';
};

const evaluateComplexity = ({ title, description, documentText = '', fileSize = 0 }) => {
    const body = `${toSafeLower(title)} ${toSafeLower(description)} ${toSafeLower(documentText)}`;

    const lengthScore = Math.min(2, Math.floor(body.length / 900));
    const integrationScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.integrations);
    const securityScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.security);
    const dataScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.data);
    const scopeScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.scope);
    const qualityDemandScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.quality);
    const deliveryScopeScore = countKeywordMatches(body, COMPLEXITY_KEYWORDS.delivery);
    const attachmentScore = fileSize > 5 * 1024 * 1024 ? 2 : fileSize > 2 * 1024 * 1024 ? 1 : 0;

    const totalScore = lengthScore + integrationScore + securityScore + dataScore + scopeScore + qualityDemandScore + deliveryScopeScore + attachmentScore;

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
            qualityDemandScore,
            deliveryScopeScore,
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
    const textDetectedCategory = identifyRequestType(`${safeTitle}\n${safeDescription}`);
    const finalCategory = resolveFinalCategory({
        selectedCategory,
        detectedCategory,
        textDetectedCategory
    });
    const profile = CATEGORY_PROFILES[finalCategory] || CATEGORY_PROFILES.other;

    const daysUntilDeadline = daysBetweenTodayAnd(deadline);
    const complexity = evaluateComplexity({
        title: safeTitle,
        description: safeDescription,
        documentText,
        fileSize: file ? file.size : 0
    });
    const requirementQuality = evaluateRequirementQuality({
        title: safeTitle,
        description: safeDescription,
        documentText,
        documentRequirements
    });

    const wordCount = documentRequirements?.wordCount || (`${safeTitle} ${safeDescription}`.split(/\s+/).filter(Boolean).length);
    const scopeItems = estimateScopeItems({ title: safeTitle, description: safeDescription, documentRequirements });
    const effortTier = detectEffortTier({
        title: safeTitle,
        description: safeDescription,
        documentText,
        complexityScore: complexity.totalScore,
        wordCount,
        scopeItems
    });

    const taskIntent = detectTaskIntent({
        title: safeTitle,
        description: safeDescription,
        documentText,
        complexityScore: complexity.totalScore,
        scopeItems
    });

    const projectScope = analyzeProjectScope({
        title: safeTitle,
        description: safeDescription,
        documentText,
        scopeItems,
        category: finalCategory
    });

    let estimatedHours = estimateEffortHours({
        tier: effortTier.tier,
        complexityScore: complexity.totalScore,
        qualityLevel: requirementQuality.qualityLevel,
        categoryMultiplier: profile.effortMultiplier,
        hasAttachment: !!file,
        wordCount
    });
    estimatedHours = normalizeEffortByIntent({
        estimatedHours,
        intentType: taskIntent.type,
        scopeItems,
        complexityScore: complexity.totalScore
    });
    estimatedHours = applyProjectScaleAdjustment({
        estimatedHours,
        category: finalCategory,
        projectScope
    });

    const confidence = (safeDescription.length >= 180 || file) && requirementQuality.qualityLevel !== 'low'
        ? 'high'
        : safeDescription.length >= 100
            ? 'medium'
            : 'low';

    estimatedHours = applyUncertaintyBuffer({
        estimatedHours,
        confidence,
        requirementQuality: requirementQuality.qualityLevel
    });

    const estimatedDays = Math.max(1, Math.ceil(estimatedHours / WORKING_HOURS_PER_DAY));

    const availableHours = Math.max(0, daysUntilDeadline) * WORKING_HOURS_PER_DAY;
    const feasible = availableHours >= estimatedHours;
    const allowSubmit = feasible;

    const scheduleGapHours = availableHours - estimatedHours;

    const recommendations = [];

    if (!feasible) {
        const extraHours = Math.max(1, roundTo(estimatedHours - availableHours, 1));
        const extraDays = Math.max(1, Math.ceil(extraHours / WORKING_HOURS_PER_DAY));
        recommendations.push(`Adjust deadline by at least ${extraDays} day(s).`);
        recommendations.push('Reduce deliverable scope and split work into phased milestones.');
    } else {
        recommendations.push('Lock scope early to prevent delivery drift.');
        recommendations.push('Share clear acceptance criteria for each deliverable.');
    }

    if (requirementQuality.qualityLevel === 'low') {
        recommendations.push('Clarify requirements with explicit features, measurable acceptance criteria, and expected output examples.');
    }

    if (taskIntent.type === 'simple') {
        recommendations.push('This appears to be a minor task; consider batching similar quick tasks for better planning efficiency.');
    } else if (taskIntent.type === 'complex') {
        recommendations.push('Break this into milestones and assign stage-wise ownership to reduce delivery risk.');
    }

    if (projectScope.scale === 'full' || projectScope.scale === 'enterprise') {
        recommendations.push('Define phased milestones (planning, implementation, QA, deployment) for this full-scale delivery.');
    }

    if (safeDescription.length < 120 && !documentSummary) {
        recommendations.push('Provide more detailed functional requirements to reduce rework risk.');
    }

    if (!file) {
        recommendations.push('Attach a supporting document to improve planning accuracy.');
    }

    const riskLevel = !feasible
        ? (scheduleGapHours <= -24 ? 'high' : 'medium')
        : (scheduleGapHours <= 8 ? 'medium' : 'low');

    const effortLabel = `${estimatedDays} day(s)`;

    return {
        feasible,
        allowSubmit,
        estimatedHours,
        estimatedDays,
        daysUntilDeadline,
        message: feasible
            ? `Feasibility approved. Estimated effort is ${effortLabel} for ${profile.label}.`
            : `Feasibility not approved. Estimated effort is ${effortLabel}, while the current timeline allows ${Math.max(0, daysUntilDeadline)} day(s).`,
        recommendations,
        documentSummary,
        analysis: {
            intelligenceLevel: 'Local Feasibility Engine',
            category: finalCategory,
            categoryLabel: profile.label,
            complexityClass: deriveComplexityClass({ intentType: taskIntent.type, complexityScore: complexity.totalScore }),
            complexityLevel: complexity.complexityLevel,
            complexityScore: complexity.totalScore,
            effortTier: effortTier.tier,
            intentType: taskIntent.type,
            intentConfidence: taskIntent.confidence,
            scopeItems,
            requirementQuality: requirementQuality.qualityLevel,
            requirementQualityScore: requirementQuality.qualityScore,
            confidence,
            riskLevel,
            projectScale: projectScope.scale,
            moduleCoverageCount: projectScope.moduleCount,
            moduleCoverage: projectScope.matchedModules,
            fullBuildSignals: projectScope.fullBuildSignals,
            fullBuildKeywordSignals: projectScope.fullBuildKeywordSignals,
            fullBuildPatternSignals: projectScope.fullBuildPatternSignals,
            architectureSignals: projectScope.architectureSignals,
            integrationSignals: projectScope.integrationSignals,
            factors: complexity.factors,
            qualityFactors: requirementQuality.factors,
            detectedCategory,
            wordCount: documentRequirements?.wordCount,
            simpleSignals: effortTier.simpleSignals,
            complexSignals: effortTier.complexSignals,
            intentSignals: {
                simpleSignals: taskIntent.simpleSignals,
                mediumSignals: taskIntent.mediumSignals,
                complexSignals: taskIntent.complexSignals,
                actionSignals: taskIntent.actionSignals
            }
        }
    };
};

module.exports = {
    analyzeRequestFeasibility
};
