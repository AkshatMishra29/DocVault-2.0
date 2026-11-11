import { Document } from '../documents/document.model.js';

/**
 * DocVault Smart Share Pack Engine
 *
 * Implements:
 * 1. Purpose-based document recommendations (e.g. "Home Loan", "Vehicle Sale", "Tax Filing 2026", "Medical Claim").
 * 2. Deterministic keyword and category matching across user-owned documents only.
 * 3. Privacy-aware: Strictly excludes storage_only, sensitiveFlag, or restricted documents from external AI processing.
 * 4. Generates missing document warnings without inventing documents.
 * 5. Requires explicit user confirmation before any share record is created.
 */

const PURPOSE_TEMPLATES = {
  'home loan': {
    title: 'Home Loan Application Pack',
    targetCategories: ['Identity', 'Financial', 'Property', 'Tax Invoice'],
    expectedKeywords: ['aadhaar', 'pan', 'salary', 'bank', 'form 16', 'deed', 'registry'],
    checklist: ['PAN Card', 'Aadhaar Card', 'Last 3 Months Salary / Bank Statement', 'Property Sale Deed / Agreement'],
  },
  'vehicle': {
    title: 'Vehicle Transfer / Sale Pack',
    targetCategories: ['Vehicle', 'Insurance Policy', 'Invoice'],
    expectedKeywords: ['rc', 'registration', 'puc', 'insurance', 'pollution', 'chassis'],
    checklist: ['Registration Certificate (RC)', 'Comprehensive Motor Insurance', 'PUC Certificate', 'Service Invoice'],
  },
  'tax filing': {
    title: 'Tax Filing & CA Package',
    targetCategories: ['Financial', 'Tax Invoice', 'Insurance Policy', 'Investment'],
    expectedKeywords: ['form 16', 'tax', 'invoice', '80c', 'lic', 'donation', 'interest'],
    checklist: ['Form 16 / TDS Certificate', 'Bank Statements', 'Insurance Premium Receipts (80C)', 'Tax Invoices'],
  },
  'medical claim': {
    title: 'Health Insurance Claim Pack',
    targetCategories: ['Insurance Policy', 'Medical Report', 'Invoice'],
    expectedKeywords: ['discharge', 'hospital', 'prescription', 'health', 'policy', 'pharmacy'],
    checklist: ['Health Insurance Card / Policy', 'Hospital Discharge Summary', 'Medical Diagnostic Reports', 'Pharmacy Invoices'],
  },
  'job application': {
    title: 'Employment & KYC Verification Pack',
    targetCategories: ['Identity', 'Academic Certificate', 'Financial'],
    expectedKeywords: ['degree', 'resume', 'experience', 'relieving', 'payslip', 'aadhaar', 'pan'],
    checklist: ['Identity Document (PAN / Passport)', 'Highest Educational Degree', 'Previous Experience / Relieving Letter', 'Recent Payslips'],
  },
};

export class SmartShareService {
  /**
   * Suggests documents for a specified user and purpose
   */
  static async suggestSharePack(userId, purposeQuery) {
    if (!userId || !purposeQuery) {
      throw new Error('User ID and purpose description are required.');
    }

    const cleanQuery = purposeQuery.toLowerCase().trim();
    let matchedTemplate = null;

    for (const [key, tpl] of Object.entries(PURPOSE_TEMPLATES)) {
      if (cleanQuery.includes(key)) {
        matchedTemplate = tpl;
        break;
      }
    }

    // Default template if no pre-defined template matches
    if (!matchedTemplate) {
      matchedTemplate = {
        title: `Document Package: ${purposeQuery}`,
        targetCategories: [],
        expectedKeywords: cleanQuery.split(/\s+/).filter((w) => w.length > 3),
        checklist: ['Relevant Supporting Documents'],
      };
    }

    // Retrieve documents owned strictly by this user (Cross-tenant security invariant)
    const userDocs = await Document.find({ userId })
      .select('title category tags summary format fileSizeFormatted createdAt sensitiveFlag aiPolicy keyDetails')
      .sort({ createdAt: -1 });

    const suggestedDocs = [];
    const missingItems = [];

    // Evaluate relevance for each user document
    for (const doc of userDocs) {
      const docText = `${doc.title} ${doc.category} ${(doc.tags || []).join(' ')} ${doc.summary || ''}`.toLowerCase();
      let matchScore = 0;
      const reasons = [];

      // Check category match
      if (matchedTemplate.targetCategories.some((cat) => (doc.category || '').toLowerCase().includes(cat.toLowerCase()))) {
        matchScore += 30;
        reasons.push(`Matches category "${doc.category}" required for ${matchedTemplate.title}`);
      }

      // Check keyword match
      for (const kw of matchedTemplate.expectedKeywords) {
        if (docText.includes(kw)) {
          matchScore += 25;
          reasons.push(`Contains relevant keyword "${kw}"`);
        }
      }

      if (matchScore >= 25) {
        suggestedDocs.push({
          documentId: doc._id,
          title: doc.title,
          category: doc.category,
          format: doc.format,
          fileSizeFormatted: doc.fileSizeFormatted,
          reasons: Array.from(new Set(reasons)),
          matchScore,
          sensitiveFlag: doc.sensitiveFlag || false,
          isStorageOnly: doc.aiPolicy === 'storage_only',
        });
      }
    }

    // Sort by relevance score
    suggestedDocs.sort((a, b) => b.matchScore - a.matchScore);

    // Compute checklist missing items
    matchedTemplate.checklist.forEach((checkItem) => {
      const isFulfilled = suggestedDocs.some((d) =>
        checkItem.toLowerCase().split(/\s+/).some((token) => token.length > 3 && d.title.toLowerCase().includes(token))
      );
      if (!isFulfilled) {
        missingItems.push(checkItem);
      }
    });

    return {
      purpose: purposeQuery,
      suggestedTitle: matchedTemplate.title,
      suggestedDocuments: suggestedDocs,
      totalSuggested: suggestedDocs.length,
      checklist: matchedTemplate.checklist,
      missingItems,
      notice: 'Review and customize the suggested documents below. No documents are shared until you explicitly confirm.',
    };
  }
}

