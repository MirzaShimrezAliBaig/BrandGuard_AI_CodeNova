(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrandGuardEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_KNOWLEDGE = [
    { id: 'k1', category: 'Brand guideline', title: 'Brand voice', text: 'Use a clear, confident and helpful tone. Avoid exaggerated promises, hype and aggressive sales language.', source: 'Brand Voice v2.4 · Tone principles', version: '2.4', status: 'Approved' },
    { id: 'k2', category: 'Approved fact', title: 'Product overview', text: 'BrandGuard helps teams review content against approved brand guidelines and product information.', source: 'Approved Product Facts v1.8 · Product overview', version: '1.8', status: 'Approved' },
    { id: 'k3', category: 'Approved claim', title: 'Content governance workflow', text: 'BrandGuard brings content checks and reviewer decisions into one clear workflow.', source: 'Approved Claims v1.2 · Claim 04', version: '1.2', status: 'Approved' },
    { id: 'k4', category: 'Preferred terminology', title: 'Audience terminology', text: 'Use “teams” instead of “users” when describing the people who work with the product. Write AI-powered with a hyphen.', source: 'Terminology Register v1.3 · T-008', version: '1.3', status: 'Approved' },
    { id: 'k5', category: 'Restricted terminology', title: 'Restricted claims and language', text: 'Avoid “guaranteed”, “fastest”, “best in the market”, “100% secure” and unsupported performance percentages.', source: 'Claims Policy v1.5 · Restricted claims', version: '1.5', status: 'Approved' },
    { id: 'k6', category: 'Approved visual asset', title: 'Core visual identity', text: 'Registered asset filename: brandguard-approved-logo. Approved primary colours: #15263F navy and #13A892 teal.', source: 'Asset Register v1.1 · Core identity', version: '1.1', status: 'Approved' },
    { id: 'k7', category: 'Accessibility rule', title: 'Readable content', text: 'Prefer short, direct sentences. Split long sentences and use descriptive link text. Provide meaningful alternative text for informative images.', source: 'Content Accessibility Checklist v1.0 · Readability', version: '1.0', status: 'Approved' }
  ];

  const AGENTS = [
    { id: 'fact', name: 'Fact Accuracy', description: 'Checks factual scope, numbers and unsupported statements.' },
    { id: 'brand', name: 'Brand Consistency', description: 'Checks voice, tone and approved messaging.' },
    { id: 'claims', name: 'Claims Review', description: 'Checks guarantees, superlatives and measurable claims.' },
    { id: 'terms', name: 'Terminology', description: 'Checks preferred and restricted product language.' },
    { id: 'accessibility', name: 'Accessibility', description: 'Checks readability and accessible content practices.' },
    { id: 'visual', name: 'Visual Identity', description: 'Checks asset-register and visual evidence where supplied.' }
  ];

  function tokenize(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}%#-]+/gu, ' ')
      .split(/\s+/).filter(Boolean).filter(t => t.length > 1 && !STOP.has(t));
  }
  const STOP = new Set(('a an and are as at be been being by can could did do does for from had has have how i in into is it its of on or our the their them this those to was we were what when where which who will with you your per every all').split(' '));

  function retrieveEvidence(query, knowledge, limit) {
    const docs = (Array.isArray(knowledge) ? knowledge : DEFAULT_KNOWLEDGE)
      .filter(item => item && (!item.status || item.status === 'Approved') && String(item.text || item.content || '').trim());
    const qTokens = tokenize(query);
    if (!qTokens.length || !docs.length) return [];
    const tokenized = docs.map(d => tokenize([d.title, d.category, d.text || d.content, d.source].join(' ')));
    const df = new Map();
    tokenized.forEach(tokens => new Set(tokens).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const avgdl = tokenized.reduce((sum, x) => sum + x.length, 0) / Math.max(1, tokenized.length);
    const k1 = 1.35, b = 0.72;
    const ranked = docs.map((doc, i) => {
      const tokens = tokenized[i];
      const counts = new Map(); tokens.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
      let score = 0;
      for (const term of qTokens) {
        const tf = counts.get(term) || 0;
        if (!tf) continue;
        const idf = Math.log(1 + (docs.length - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * tokens.length / Math.max(1, avgdl))));
      }
      const q = String(query || '').toLowerCase();
      const fullText = [doc.title, doc.category, doc.text || doc.content].join(' ').toLowerCase();
      if (q.length > 8 && fullText.includes(q)) score += 3;
      if (/claim|guarantee|fastest|\d+(?:\.\d+)?\s?%|secure|best in the market/i.test(q) && /claim|restricted/i.test(doc.category || '')) score += 1.1;
      return { id: doc.id, category: doc.category, title: doc.title || doc.category || 'Knowledge item', source: doc.source || 'Workspace knowledge', version: doc.version || '', text: doc.text || doc.content, status: doc.status || 'Approved', score: Number(score.toFixed(3)), relevance: 0 };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit || 5));
    const max = ranked[0]?.score || 1;
    ranked.forEach(item => item.relevance = Math.max(1, Math.min(99, Math.round(item.score / max * 99))));
    return ranked;
  }

  function sourceFor(agentId, query, knowledge, limit) {
    const evidence = retrieveEvidence(query, knowledge, 10);
    const preferences = { fact: /approved fact|product information/i, brand: /brand guideline|brand voice/i, claims: /approved claim|restricted terminology/i, terms: /terminology/i, accessibility: /accessibility/i, visual: /approved visual asset|visual identity/i };
    const preferred = evidence.filter(x => preferences[agentId]?.test(x.category || ''));
    return (preferred.length ? preferred : []).slice(0, limit || 3);
  }

  function createFinding(agentId, input) {
    const sources = input.sources || [];
    const best = sources[0] || null;
    return {
      id: input.id || ('f-' + Math.random().toString(36).slice(2, 10)),
      agentId,
      severity: input.severity || 'medium',
      category: input.category,
      title: input.title,
      rule: input.rule,
      problem: input.problem,
      matched: input.matched || '',
      evidence: best ? best.text : (input.evidence || 'No matching approved knowledge item was retrieved. Treat this as an evidence gap and request human verification.'),
      source: best ? best.source + (best.version ? ' · v' + best.version : '') : 'No matching approved source found',
      sourceId: best ? best.id : null,
      evidenceStatus: best ? 'retrieved' : 'gap',
      evidenceItems: sources,
      fix: input.fix,
      confidence: input.confidence || 85,
      acknowledged: false
    };
  }

  function analyzeContent(content, options) {
    const opts = options || {};
    const text = String(content || '').trim();
    const knowledge = Array.isArray(opts.knowledge) ? opts.knowledge : DEFAULT_KNOWLEDGE;
    const settings = { terms: true, readability: true, visual: true, ...(opts.settings || {}) };
    const agentFindings = { fact: [], brand: [], claims: [], terms: [], accessibility: [], visual: [] };
    const allRetrieved = new Map();
    retrieveEvidence(text, knowledge, 6).forEach(item => allRetrieved.set(item.id, item));
    const add = (agentId, query, finding) => {
      const sources = sourceFor(agentId, query + ' ' + text.slice(0, 180), knowledge, 4);
      sources.forEach(s => allRetrieved.set(s.id, s));
      agentFindings[agentId].push(createFinding(agentId, { ...finding, sources }));
    };

    // Claims specialist: unsupported numbers, guarantees and categorical superlatives.
    const riskyClaim = /\b(?:guarantee[sd]?|fastest|best in (?:the )?market|number one|#1|100\s?%\s?(?:secure|safe)|revolutionary|proven to)\b|\b\d+(?:\.\d+)?\s?%\b/ig;
    const claimMatches = [...text.matchAll(riskyClaim)];
    if (claimMatches.length) {
      const matched = claimMatches.map(m => m[0]).join(', ');
      const sentence = (text.match(/[^.!?]*(?:guarantee[sd]?|fastest|best in (?:the )?market|number one|#1|100\s?%\s?(?:secure|safe)|revolutionary|proven to|\d+(?:\.\d+)?\s?%)[^.!?]*[.!?]?/i) || [matched])[0].trim();
      const claimSource = retrieveEvidence('restricted claims guaranteed percentage fastest best secure performance', knowledge, 8).filter(x => /approved claim|restricted terminology/i.test(x.category || '')).slice(0, 4);
      const approvedClaim = retrieveEvidence(sentence + ' approved claim evidence', knowledge, 5).filter(x => /approved claim/i.test(x.category || '') && x.relevance >= 35);
      const explicitlySupported = approvedClaim.some(x => {
        const core = tokenize(sentence); const doc = tokenize(x.text);
        const overlap = core.filter(t => doc.includes(t)).length / Math.max(1, core.length);
        return overlap >= 0.7 && !/guaranteed|fastest|\d+(?:\.\d+)?%|100\s?%\s?secure/i.test(sentence);
      });
      if (!explicitlySupported) add('claims', 'unsupported guarantee numerical performance claim restricted claims', {
        severity: /100\s?%\s?(?:secure|safe)/i.test(sentence) ? 'critical' : 'high', category: 'Claims & facts',
        title: 'Unsupported performance or absolute claim', rule: 'CLM-04 · Substantiated claims only',
        problem: 'The draft contains a measurable result, guarantee or absolute/superlative statement that could not be matched to an approved claim. It should not be published as a verified product promise without supporting evidence.',
        matched: sentence, evidence: claimSource[0]?.text || 'No matching approved claim was found in the active knowledge base.',
        fix: 'Replace the unsupported promise with a factual description that is present in the approved product information.', confidence: 96
      });
    }

    // Fact specialist: universal statements and unsupported product specifics.
    const universal = text.match(/\b(?:every business|all companies|always|never|works for everyone|guaranteed to)\b/i);
    if (universal) add('fact', 'approved product facts scope conditions universal statement ' + universal[0], {
      severity: 'medium', category: 'Claims & facts', title: 'Broad factual statement needs a defined scope', rule: 'FACT-02 · Factual scope and qualification',
      problem: 'The content makes a broad or universal statement without defining the conditions or showing approved evidence for that scope.',
      matched: universal[0], fix: 'Describe the specific supported workflow or audience instead of making a universal statement.', confidence: 89
    });
    const unverifiedMetric = text.match(/\b(?:increase|improve|reduce|save|boost|accelerate)[^.!?]{0,80}\b\d+(?:\.\d+)?\s?%/i);
    if (unverifiedMetric && !agentFindings.claims.length) add('fact', 'verified product statistics approved metrics evidence ' + unverifiedMetric[0], {
      severity: 'high', category: 'Claims & facts', title: 'Performance metric needs approved evidence', rule: 'FACT-04 · Verified product metrics',
      problem: 'A quantified product outcome appears in the draft, but no directly supporting approved metric was retrieved.',
      matched: unverifiedMetric[0], fix: 'Remove the percentage or replace it with a metric that has an approved source and defined measurement conditions.', confidence: 93
    });

    // Brand voice specialist.
    const hype = text.match(/\b(?:revolutionary|game[- ]changing|unbelievable|world[- ]class|amazing|incredible|ultimate|groundbreaking)\b|!{2,}/i);
    if (hype) add('brand', 'brand voice tone clear confident helpful avoid hype exaggerated promises ' + hype[0], {
      severity: 'medium', category: 'Brand voice', title: 'Tone is more promotional than the approved voice', rule: 'BRD-02 · Clear, confident and helpful tone',
      problem: 'Hype language or exaggerated punctuation makes the draft sound more promotional than the approved brand voice.',
      matched: hype[0], fix: 'Use specific, calm language that explains the product value without exaggeration.', confidence: 92
    });

    // Terminology specialist.
    if (settings.terms !== false) {
      const userTerm = text.match(/\busers\b/i);
      if (userTerm) add('terms', 'preferred terminology teams instead of users terminology register', {
        severity: 'medium', category: 'Terminology', title: 'Use the preferred audience term', rule: 'TRM-008 · Preferred terminology',
        problem: 'The draft uses “users” where the active terminology register prefers “teams” for people who work with the product.',
        matched: userTerm[0], fix: 'teams', confidence: 95
      });
      const aiTerm = text.match(/\bAI powered\b|\bartificial intelligence powered\b/i);
      if (aiTerm) add('terms', 'AI-powered hyphenated preferred terminology style', {
        severity: 'low', category: 'Terminology', title: 'Use the approved product spelling', rule: 'TRM-009 · Product terminology style',
        problem: 'The terminology register uses “AI-powered” with a hyphen.',
        matched: aiTerm[0], fix: 'AI-powered', confidence: 98
      });
      const restricted = text.match(/\b(?:100\s?%\s?secure|guaranteed|fastest|best in the market)\b/i);
      if (restricted && !agentFindings.claims.length) add('terms', 'restricted terminology guaranteed fastest best in market secure claims policy', {
        severity: 'high', category: 'Terminology', title: 'Restricted wording appears in the draft', rule: 'TRM-011 · Restricted terminology',
        problem: 'A restricted term appears in the draft and needs an approved exception or replacement.',
        matched: restricted[0], fix: 'Use specific product language supported by the approved claims library.', confidence: 94
      });
    }

    // Accessibility specialist.
    if (settings.readability !== false) {
      const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      const long = sentences.find(s => s.split(/\s+/).filter(Boolean).length > 29);
      if (long) add('accessibility', 'accessibility plain language sentence length readable direct content', {
        severity: 'low', category: 'Accessibility & readability', title: 'A sentence may be difficult to scan', rule: 'ACC-03 · Readable sentence length',
        problem: 'One sentence contains more than 29 words. Splitting it may make the content easier to understand.',
        matched: long, fix: long.split(/,\s+/).join('. ') + '.', confidence: 87
      });
      if (/[A-Z]{18,}/.test(text)) add('accessibility', 'accessibility screen readers all caps readability', {
        severity: 'low', category: 'Accessibility & readability', title: 'Long all-caps text may be harder to read', rule: 'ACC-05 · Readable text formatting',
        problem: 'A long all-caps phrase can be difficult to scan and may be announced letter by letter by some assistive technologies.',
        matched: (text.match(/[A-Z]{18,}/) || [])[0], fix: 'Use sentence case for long phrases and reserve capitals for short abbreviations.', confidence: 82
      });
    }

    // Visual specialist: report only what the actual local heuristic can establish.
    const visual = opts.visual;
    if (visual && settings.visual !== false) {
      const approvedName = /brandguard-approved-logo|brandguard-approved|approved-brandguard/i.test(visual.name || '');
      const palettePct = Number(visual.brandShare || 0);
      add('visual', 'approved brand asset register logo navy teal brand colours visual identity', {
        severity: approvedName && palettePct >= 10 ? 'low' : 'medium', category: 'Visual identity',
        title: approvedName ? 'Registered asset filename detected' : 'Visual asset needs an approval check', rule: 'VIS-01 · Use registered brand assets',
        problem: approvedName ? 'The filename matches a registered asset pattern, but the current check cannot confirm version, placement or usage rights.' : 'The uploaded image does not match a registered asset filename. The local check cannot confirm that the artwork is approved.',
        matched: visual.name || '', fix: 'Confirm the image against the organisation’s controlled asset library and use the latest approved version.', confidence: 79
      });
    }

    const agents = AGENTS.map(agent => {
      const findings = agentFindings[agent.id];
      return { ...agent, status: findings.length ? (findings.some(f => f.severity === 'critical' || f.severity === 'high') ? 'Flagged' : 'Needs review') : 'No issue detected', findingsCount: findings.length, confidence: findings.length ? Math.round(findings.reduce((s, f) => s + f.confidence, 0) / findings.length) : null, summary: findings.length ? findings.map(f => f.title).join('; ') : 'No configured issue detected in this specialist check.', mode: 'Deterministic specialist rules' };
    });
    const findings = Object.values(agentFindings).flat();
    const severityPoints = { critical: 46, high: 33, medium: 17, low: 7 };
    const raw = findings.reduce((sum, f) => sum + (severityPoints[f.severity] || 0) * (0.72 + (f.confidence || 80) / 360), 0);
    const severityFloor = findings.some(f => f.severity === 'critical') ? 85 : findings.some(f => f.severity === 'high') ? 60 : findings.some(f => f.severity === 'medium') ? 25 : 4;
    const score = findings.length ? Math.min(98, Math.max(severityFloor, Math.round(raw))) : 4;
    const riskLevel = score >= 80 ? 'Critical' : score >= 60 ? 'High' : score >= 25 ? 'Medium' : 'Low';
    const governance = {
      score, riskLevel,
      recommendation: riskLevel === 'Critical' ? 'Block publication until critical findings are resolved and a human reviewer approves the updated version.' : riskLevel === 'High' ? 'Human approval is required before publication. Resolve or explicitly review all high-severity findings.' : riskLevel === 'Medium' ? 'A reviewer should check the flagged items and confirm the evidence before publication.' : 'No configured issue was detected. Keep the required human approval step before publication.',
      publicationGate: riskLevel === 'Critical' || riskLevel === 'High' ? 'Human approval required' : 'Human review recommended',
      findingCount: findings.length,
      evidenceGaps: findings.filter(f => f.evidenceStatus === 'gap').length
    };
    return {
      findings, agents, retrievedSources: [...allRetrieved.values()].sort((a, b) => b.score - a.score),
      governance, score, riskLevel,
      analysisMode: 'Evidence-linked specialist rules',
      retrievalMethod: 'BM25 lexical relevance over approved knowledge',
      externalAIUsed: false,
      reviewedAt: new Date().toISOString()
    };
  }

  return { DEFAULT_KNOWLEDGE, AGENTS, tokenize, retrieveEvidence, analyzeContent };
});
