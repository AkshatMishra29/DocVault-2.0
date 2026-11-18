import { describe, it } from 'node:test';
import assert from 'node:assert';
import { answerDocumentQuery, answerWithDeterministicGrounding } from '../src/services/ai/groqService.js';
import { resolveQuerySourcesAndEntities } from '../src/modules/ai/ai.routes.js';

describe('🧪 Ask AI Flashcard & Document Integration Suite', () => {
  const macbookAsset = {
    _id: '6afbd301df74ea42f1576a5a',
    name: 'Macbook Neo',
    category: 'Electronics',
    description: 'I have Purachased the macbook on may 21 2026,it comes 1 year of warranty',
    customFields: [
      { label: 'Warranty Expiration', value: '2027-05-22', type: 'date' },
      { label: 'Serial Number', value: '1234566678', type: 'text' }
    ],
    warrantyExpiry: '2027-05-22',
    status: 'Active',
    tags: ['macbook', 'apple', 'laptop'],
    linkedDocumentIds: [],
  };

  const electricityDoc = {
    _id: '6af857c7d0e804c183fb869d',
    title: 'Electricity Bill Receipt',
    category: 'Purchase Receipt',
    documentDate: '2026-11-11',
    keyDetails: {
      'TOTAL AMOUNT': '225',
      'CONSUMER NAME': 'SARIKA MISHRA',
      'ACCOUNT NUMBER': '0671805000'
    },
    extractedText: 'MADHYANCHAL VIDYUT VITRAN NIGAM LTD AMOUNT: 225'
  };

  const hondaRcDoc = {
    _id: '6af857c7d0e804c183fb869e',
    title: 'Honda City Registration Certificate RC',
    category: 'Automobile',
    documentDate: '2024-03-10',
    extractedText: 'REGISTRATION CERTIFICATE HONDA CITY ZX UP32-AB-1234'
  };

  const hondaAsset = {
    _id: '6afbd401df74ea42f1576b01',
    name: 'Honda City ZX',
    category: 'Vehicle',
    linkedDocumentIds: ['6af857c7d0e804c183fb869e'],
    customFields: [
      { label: 'Chassis Number', value: 'MAK4567890123' },
      { label: 'Engine Number', value: 'ENG987654321' }
    ]
  };

  it('1. Answers MacBook warranty question using MacBook Flashcard and does NOT leak Electricity Bill', () => {
    const question = 'what is the warranty of my macbook';
    // Passing both documents and assets into the resolver
    const answer = answerWithDeterministicGrounding(question, [electricityDoc], [macbookAsset]);

    assert.ok(answer.includes('2027-05-22'), 'Answer must contain the warranty date 2027-05-22');
    assert.ok(answer.includes('Macbook Neo'), 'Answer must mention Macbook Neo');
    assert.ok(!answer.includes('Electricity Bill'), 'Answer must NOT mention Electricity Bill');
    assert.ok(!answer.includes('0671805000'), 'Answer must NOT leak electricity bill account number');
    assert.ok(answer.includes('open your asset flashcard directly below'), 'Must have clean asset flashcard referral');
  });

  it('2. Answers MacBook serial number question from Flashcard custom fields', () => {
    const question = 'what is the serial number of my macbook';
    const answer = answerWithDeterministicGrounding(question, [electricityDoc], [macbookAsset]);

    assert.ok(answer.includes('1234566678'), 'Answer must contain the serial number 1234566678');
    assert.ok(answer.includes('Macbook Neo'), 'Answer must reference Macbook Neo');
    assert.ok(!answer.includes('Electricity Bill'), 'Answer must NOT mention Electricity Bill');
  });

  it('3. Answers Electricity Bill amount question and does NOT leak MacBook details', () => {
    const question = 'what is the amount of the electricity bill';
    const answer = answerWithDeterministicGrounding(question, [electricityDoc], [macbookAsset]);

    assert.ok(answer.includes('225'), 'Answer must contain the bill amount 225');
    assert.ok(answer.includes('Electricity Bill Receipt'), 'Answer must reference Electricity Bill Receipt');
    assert.ok(!answer.includes('Macbook'), 'Answer must NOT mention Macbook');
    assert.ok(answer.includes('view the original document directly below'), 'Must have clean document referral');
  });

  it('4. Handles queries for unknown items by stating no records were found', () => {
    const question = 'what is the policy number of my car insurance';
    const answer = answerWithDeterministicGrounding(question, [], []);

    assert.ok(answer.includes('could not find matching records'), 'Answer must state no records found');
  });

  it('5. Source Isolation: Forwarding MacBook Flashcard NEVER includes unlinked Electricity Bill', () => {
    const question = 'what is the warranty on my macbook';
    const answer = 'The recorded warranty expiration for your **Macbook Neo** is **2027-05-22**.\n\n*For complete details, you can open your asset flashcard directly below.*';

    const result = resolveQuerySourcesAndEntities({
      answer,
      question,
      documents: [electricityDoc],
      relevantAssets: [macbookAsset],
      matchingAssets: [macbookAsset],
      scoredAssets: [{ asset: macbookAsset, score: 8 }],
      isOverviewQuery: false,
    });

    assert.strictEqual(result.sources.length, 1, 'Sources must contain exactly 1 entry (the MacBook flashcard)');
    assert.strictEqual(result.sources[0].type, 'asset', 'Source must be an asset flashcard');
    assert.strictEqual(result.sources[0].title, 'Macbook Neo (Flashcard)');
    assert.strictEqual(result.sources[0].previewRoute, '/assets/6afbd301df74ea42f1576a5a');
    assert.deepStrictEqual(result.referencedDocIds, [], 'Referenced doc IDs must be empty');
    assert.strictEqual(result.finalDocs.length, 0, 'No unrelated documents may be forwarded');
  });

  it('6. Source Isolation: Forwarding Electricity Bill NEVER includes MacBook Flashcard', () => {
    const question = 'what is the amount of my electricity bill';
    const answer = 'The total amount for **Electricity Bill Receipt** is **₹225**.\n\n*For full details or complete verification, you can view the original document directly below.*';

    const result = resolveQuerySourcesAndEntities({
      answer,
      question,
      documents: [electricityDoc],
      relevantAssets: [macbookAsset],
      matchingAssets: [],
      scoredAssets: [{ asset: macbookAsset, score: 0 }],
      isOverviewQuery: false,
    });

    assert.strictEqual(result.sources.length, 1, 'Sources must contain exactly 1 entry (the document)');
    assert.strictEqual(result.sources[0].type, 'document', 'Source must be a document');
    assert.strictEqual(result.sources[0].title, 'Electricity Bill Receipt');
    assert.strictEqual(result.referencedDocIds[0], '6af857c7d0e804c183fb869d');
    assert.strictEqual(result.finalAssets.length, 0, 'No unrelated assets may be forwarded');
  });

  it('7. Source Integration: Linked Asset & Document are both forwarded without unrelated items', () => {
    const question = 'tell me about my honda city and its rc';
    const answer = 'Here are the details for your **Honda City ZX** and **Honda City Registration Certificate RC**.\n\n*For full details, you can view the verified records directly below.*';

    const result = resolveQuerySourcesAndEntities({
      answer,
      question,
      documents: [electricityDoc, hondaRcDoc],
      relevantAssets: [hondaAsset, macbookAsset],
      matchingAssets: [hondaAsset],
      scoredAssets: [{ asset: hondaAsset, score: 8 }],
      isOverviewQuery: false,
    });

    const assetTitles = result.sources.filter(s => s.type === 'asset').map(s => s.title);
    const docTitles = result.sources.filter(s => s.type === 'document').map(s => s.title);

    assert.ok(assetTitles.includes('Honda City ZX (Flashcard)'), 'Must include Honda City flashcard');
    assert.ok(docTitles.includes('Honda City Registration Certificate RC'), 'Must include linked RC document');
    assert.ok(!assetTitles.includes('Macbook Neo (Flashcard)'), 'Must NOT include MacBook');
    assert.ok(!docTitles.includes('Electricity Bill Receipt'), 'Must NOT include Electricity Bill');
  });

  it('8. Source Isolation: Unanswerable query returns empty sources and zero references', () => {
    const question = 'what is my passport expiry date';
    const answer = 'I cannot find that information in your currently uploaded documents or tracked assets.';

    const result = resolveQuerySourcesAndEntities({
      answer,
      question,
      documents: [electricityDoc],
      relevantAssets: [macbookAsset],
      matchingAssets: [],
      scoredAssets: [],
      isOverviewQuery: false,
    });

    assert.strictEqual(result.sources.length, 0, 'Sources must be empty');
    assert.strictEqual(result.referencedDocIds.length, 0, 'Referenced docs must be empty');
  });
});
