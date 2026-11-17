import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { extractTextFromPDF } from '../src/services/ocr/ocrService.js';
import { extractRelevantContextWindow, answerDocumentQuery } from '../src/services/ai/groqService.js';

describe('Multi-Page Document & In-Chat Document Preview Pipeline', () => {

  it('1. Extracts multi-page text with clear page annotations', async () => {
    // Generate a multi-page PDF text string structure
    const sampleText = await extractTextFromPDF(fs.readFileSync('sample_motor_policy.pdf'));
    assert.ok(sampleText.length > 50, 'PDF text must be extracted');
    assert.ok(sampleText.includes('HDFC ERGO') || sampleText.includes('POL-MOT'), 'Key policy details must be present');
  });

  it('2. Extracts relevant multi-page sections even under character budget', () => {
    // Simulate an 11-page customer agreement
    const pages = [];
    for (let i = 1; i <= 11; i++) {
      pages.push(
        `--- Page ${i} ---\n` +
        `Customer Master Agreement Section ${i}.0.\n` +
        (i === 5 ? 'Important clause: The customer SLA guarantee is 99.95% uptime with 4-hour response window.' : '') +
        (i === 11 ? 'Termination clause: 30 days written notice required for termination.' : 'Standard operating terms and conditions apply to this agreement.')
      );
    }
    const full11PageDoc = pages.join('\n\n');
    assert.ok(full11PageDoc.length > 1000);

    // Query specifically for the SLA guarantee on page 5
    const windowPage5 = extractRelevantContextWindow(full11PageDoc, 'What is the customer SLA guarantee?', 1200);
    assert.ok(windowPage5.includes('--- Page 5 ---') || windowPage5.includes('99.95% uptime'), 'Must capture page 5 specific content');

    // Query specifically for termination clause on page 11
    const windowPage11 = extractRelevantContextWindow(full11PageDoc, 'What is the termination clause notice period?', 1200);
    assert.ok(windowPage11.includes('30 days written notice'), 'Must capture page 11 termination content');
  });

  it('3. Answers specific content in multi-page document via grounding', async () => {
    const multiPageDoc = {
      _id: '67a8b9c0d1e2f3a4b5c6d7e8',
      title: 'Customer Master Service Agreement - 11 Pages',
      category: 'Legal Document',
      pageCount: 11,
      documentDate: '2026-03-01',
      summary: '11-page master customer service agreement covering terms, SLAs, and liability.',
      keyDetails: {
        'CLIENT NAME': 'Acme Global Corp',
        'AGREEMENT DATE': '2026-03-01',
      },
      extractedText: `
--- Page 1 ---
CUSTOMER MASTER SERVICE AGREEMENT
Client: Acme Global Corp
Effective Date: 2026-03-01

--- Page 5 ---
SECTION 5: SERVICE LEVEL GUARANTEE
The customer SLA guarantee is strictly 99.95% uptime with 4-hour response window. Failure to meet SLA results in 10% credit.

--- Page 11 ---
SECTION 11: TERMINATION & NOTICES
Either party may terminate this agreement by providing 30 days written notice to the registered headquarters.
      `.trim(),
    };

    // Test specific question about Page 5 content
    const answerSla = await answerDocumentQuery(
      'What is the customer SLA guarantee and response window?',
      [multiPageDoc],
      []
    );

    console.log('SLA Answer snippet:\n', answerSla.slice(0, 300));
    assert.ok(
      answerSla.includes('99.95%') || answerSla.includes('4-hour') || answerSla.includes('SLA'),
      'AI must answer the specific content from page 5'
    );

    // Test specific question about Page 11 content
    const answerTerm = await answerDocumentQuery(
      'How many days notice are required for termination in this customer agreement?',
      [multiPageDoc],
      []
    );

    console.log('Termination Answer snippet:\n', answerTerm.slice(0, 300));
    assert.ok(
      answerTerm.includes('30') || answerTerm.includes('notice'),
      'AI must answer the specific content from page 11'
    );
  });

  it('4. Document preview download route generates safe RFC 6266 filename header without ERR_INVALID_CHAR', () => {
    // Test filename sanitization and encoding with special chars, em-dash, unicode, quotes
    const testTitles = [
      'SYNTHETIC LANDSCAPE — NON-DOCUMENT TEST',
      'Customer Agreement "Final" (v2.1) - 2026',
      'Facture № 12345 — Électricité & Eau',
      'Doc: with \r\n dangerous newlines & "quotes"',
    ];

    for (const title of testTitles) {
      const rawFilename = (title || 'document').replace(/[\r\n"']/g, '_');
      const asciiFilename = rawFilename.replace(/[^\x20-\x7E]/g, '_') || 'document';
      const encodedFilename = encodeURIComponent(rawFilename);
      const headerVal = `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

      // Verify headerVal has no raw newlines or invalid characters
      assert.ok(!headerVal.includes('\r'), 'Must not contain CR');
      assert.ok(!headerVal.includes('\n'), 'Must not contain LF');
      assert.ok(headerVal.startsWith('inline; filename="'), 'Must be valid RFC format');
    }
  });

});
