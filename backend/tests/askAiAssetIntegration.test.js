import { describe, it } from 'node:test';
import assert from 'node:assert';
import { answerDocumentQuery, answerWithDeterministicGrounding } from '../src/services/ai/groqService.js';

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

  it('1. Answers MacBook warranty question using MacBook Flashcard and does NOT leak Electricity Bill', () => {
    const question = 'what is the warranty of my macbook';
    // Passing both documents and assets into the resolver
    const answer = answerWithDeterministicGrounding(question, [electricityDoc], [macbookAsset]);

    assert.ok(answer.includes('2027-05-22'), 'Answer must contain the warranty date 2027-05-22');
    assert.ok(answer.includes('Macbook Neo'), 'Answer must mention Macbook Neo');
    assert.ok(!answer.includes('Electricity Bill'), 'Answer must NOT mention Electricity Bill');
    assert.ok(!answer.includes('0671805000'), 'Answer must NOT leak electricity bill account number');
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
  });

  it('4. Handles queries for unknown items by stating no records were found', () => {
    const question = 'what is the policy number of my car insurance';
    const answer = answerWithDeterministicGrounding(question, [], []);

    assert.ok(answer.includes('could not find matching records'), 'Answer must state no records found');
  });
});
