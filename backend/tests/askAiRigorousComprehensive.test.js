import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { User, Asset, Document } from '../src/models/index.js';
import { Conversation } from '../src/modules/ai/models/conversation.model.js';
import { Message } from '../src/modules/ai/models/message.model.js';
import {
  answerDocumentQuery,
  answerWithDeterministicGrounding,
  executeGroqChatCompletion,
} from '../src/services/ai/groqService.js';

describe('🚀 Rigorous & Comprehensive Ask AI Test Suite', () => {
  // Test Fixtures
  const macbookAsset = {
    _id: new mongoose.Types.ObjectId('6afbd301df74ea42f1576a5a'),
    userId: new mongoose.Types.ObjectId('6af7f3022a06f7c754d25b38'),
    name: 'Macbook Neo',
    category: 'Electronics',
    cardColor: 'indigo',
    description: 'I have Purachased the macbook on may 21 2026,it comes 1 year of warranty',
    customFields: [
      { label: 'Warranty Expiration', value: '2027-05-22', type: 'date' },
      { label: 'Serial Number', value: '1234566678', type: 'text' },
      { label: 'Processor', value: 'Apple M2 Pro', type: 'text' },
      { label: 'Unified Memory', value: '16GB', type: 'text' },
    ],
    warrantyExpiry: '2027-05-22',
    status: 'Active',
    tags: ['macbook', 'apple', 'laptop', 'hardware'],
    linkedDocumentIds: [],
  };

  const hondaAsset = {
    _id: new mongoose.Types.ObjectId('6afbd401df74ea42f1576b01'),
    userId: new mongoose.Types.ObjectId('6af7f3022a06f7c754d25b38'),
    name: 'Honda City ZX',
    category: 'Vehicle',
    cardColor: 'blue',
    description: 'Sedan vehicle purchased for personal commute',
    customFields: [
      { label: 'Chassis Number', value: 'MAK4567890123', type: 'text' },
      { label: 'Engine Number', value: 'ENG987654321', type: 'text' },
    ],
    metadata: {
      regNumber: 'UP32-AB-1234',
      fuelType: 'Petrol',
      pucExpiry: '2027-01-15',
    },
    warrantyExpiry: '2028-03-10',
    insuranceExpiry: '2027-03-09',
    status: 'Active',
    tags: ['car', 'honda', 'sedan'],
    linkedDocumentIds: [new mongoose.Types.ObjectId('6af857c7d0e804c183fb869e')],
  };

  const sonyTvAsset = {
    _id: new mongoose.Types.ObjectId('6afbd501df74ea42f1576c02'),
    userId: new mongoose.Types.ObjectId('6af7f3022a06f7c754d25b38'),
    name: 'Sony Bravia 65 OLED',
    category: 'Appliance',
    cardColor: 'rose',
    description: 'Living room 4K OLED Smart TV',
    customFields: [
      { label: 'Panel Warranty', value: '2029-08-15', type: 'date' },
      { label: 'Invoice No', value: 'RETAIL-9021', type: 'text' },
    ],
    warrantyExpiry: '2029-08-15',
    status: 'Active',
    tags: ['tv', 'sony', 'oled', 'display'],
    linkedDocumentIds: [],
  };

  const electricityDoc = {
    _id: new mongoose.Types.ObjectId('6af857c7d0e804c183fb869d'),
    userId: new mongoose.Types.ObjectId('6af7f3022a06f7c754d25b38'),
    title: 'Electricity Bill Receipt',
    category: 'Purchase Receipt',
    documentDate: '2026-11-11',
    expiryDate: '2026-11-25',
    keyDetails: {
      'TOTAL AMOUNT': '225 ( Two Hundred Twenty Five) Only',
      'CONSUMER NAME': 'SARIKA MISHRA W/O SANJAY MISHRA',
      'ACCOUNT NUMBER': '0671805000',
      'TRANSACTION ID': 'BBPSDP216315BO5MQJMC9HJ',
      'ISSUING AUTHORITY': 'Madhyanchal Vidyut Vitran Nigam Ltd.',
    },
    extractedText: 'MADHYANCHAL VIDYUT VITRAN NIGAM LTD ELECTRICITY PAYMENT RECEIPT CONSUMER: SARIKA MISHRA ACCOUNT: 0671805000 TOTAL AMOUNT: 225 DATE: 11-11-2026',
    aiPolicy: 'ai_enabled',
    sensitiveFlag: false,
  };

  const hondaRcDoc = {
    _id: new mongoose.Types.ObjectId('6af857c7d0e804c183fb869e'),
    userId: new mongoose.Types.ObjectId('6af7f3022a06f7c754d25b38'),
    title: 'Honda City Registration Certificate RC',
    category: 'Automobile',
    documentDate: '2024-03-10',
    expiryDate: '2039-03-09',
    keyDetails: {
      'Registration No': 'UP32-AB-1234',
      'Owner Name': 'Sanjay Mishra',
      'Chassis No': 'MAK4567890123',
    },
    extractedText: 'TRANSPORT DEPARTMENT GOVERNMENT OF UTTAR PRADESH REGISTRATION CERTIFICATE UP32-AB-1234 HONDA CITY ZX',
    aiPolicy: 'ai_enabled',
    sensitiveFlag: false,
  };

  const multiAssets = [macbookAsset, hondaAsset, sonyTvAsset];
  const multiDocs = [electricityDoc, hondaRcDoc];

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ASSET / FLASHCARD RETRIEVAL & GROUNDING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Group 1: Asset / Flashcard Specific Queries', () => {
    it('1.1 Solves MacBook warranty query accurately without leaking Electricity Bill', () => {
      const q = 'what is the warranty of my macbook';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('2027-05-22'), 'Answer must state warranty expiration 2027-05-22');
      assert.ok(ans.includes('Macbook Neo'), 'Answer must reference Macbook Neo');
      assert.ok(!ans.includes('Electricity Bill'), 'Answer must NOT mention Electricity Bill');
      assert.ok(!ans.includes('225'), 'Answer must NOT leak Electricity Bill amount');
      assert.ok(!ans.includes('0671805000'), 'Answer must NOT leak electricity account number');
    });

    it('1.2 Solves MacBook serial number query from custom flashcard fields', () => {
      const q = 'what is the serial number of my macbook';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('1234566678'), 'Answer must extract serial number 1234566678');
      assert.ok(ans.includes('Macbook Neo'), 'Answer must reference Macbook Neo');
      assert.ok(!ans.includes('Electricity Bill'), 'Answer must NOT mention Electricity Bill');
    });

    it('1.3 Solves purchase date & description notes query from flashcard', () => {
      const q = 'when did I purchase my macbook and what does description say';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.toLowerCase().includes('may 21 2026'), 'Answer must extract purchase date from description');
      assert.ok(ans.includes('1 year of warranty'), 'Answer must include description text');
      assert.ok(!ans.includes('SARIKA MISHRA'), 'Answer must NOT leak consumer name');
    });

    it('1.4 Handles case-insensitivity and uppercase queries (e.g. "MACBOOK NEO WARRANTY")', () => {
      const q = 'MACBOOK NEO WARRANTY DETAILS';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('2027-05-22'), 'Must match uppercase query');
      assert.ok(ans.includes('Macbook Neo'), 'Must reference Macbook Neo');
    });

    it('1.5 Solves query referencing "flash card" keyword specifically', () => {
      const q = 'tell me the details of my macbook flash card';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('Macbook Neo'), 'Must resolve to Macbook Neo');
      assert.ok(ans.includes('Electronics'), 'Must mention category');
      assert.ok(ans.includes('Active'), 'Must mention status');
      assert.ok(!ans.includes('Electricity Bill'), 'Zero document cross-talk');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. DOCUMENT SPECIFIC RETRIEVAL & GROUNDING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Group 2: Document Specific Queries', () => {
    it('2.1 Solves Electricity Bill amount query without leaking MacBook details', () => {
      const q = 'what is the amount of the electricity bill';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('225'), 'Answer must state bill amount 225');
      assert.ok(ans.includes('Electricity Bill Receipt'), 'Answer must reference Electricity Bill');
      assert.ok(!ans.includes('Macbook'), 'Answer must NOT mention Macbook');
      assert.ok(!ans.includes('1234566678'), 'Answer must NOT leak serial number');
    });

    it('2.2 Solves Electricity Bill consumer name query', () => {
      const q = 'who is the consumer of the electricity bill';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('SARIKA MISHRA'), 'Must state consumer name');
      assert.ok(!ans.includes('Macbook'), 'Zero MacBook leak');
    });

    it('2.3 Solves Electricity Bill account number query', () => {
      const q = 'what is the account number of my electricity bill';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('0671805000'), 'Must extract account number 0671805000');
      assert.ok(!ans.includes('Macbook'), 'Zero MacBook leak');
    });

    it('2.4 Solves Electricity Bill transaction ID query', () => {
      const q = 'what is the transaction id of the electricity bill';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('BBPSDP216315BO5MQJMC9HJ'), 'Must extract transaction ID');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. MULTI-ASSET DISAMBIGUATION & ZERO CROSS-TALK
  // ───────────────────────────────────────────────────────────────────────────
  describe('Group 3: Multi-Asset Ecosystem Disambiguation', () => {
    it('3.1 Distinguishes Honda City query and extracts Engine & Chassis numbers', () => {
      const q = 'what is the engine number of my honda city';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('ENG987654321'), 'Must extract Honda engine number');
      assert.ok(ans.includes('Honda City ZX'), 'Must identify Honda City');
      assert.ok(!ans.includes('Macbook'), 'Must NOT mention Macbook');
      assert.ok(!ans.includes('Sony'), 'Must NOT mention Sony');
    });

    it('3.2 Distinguishes Sony Bravia OLED TV query and extracts panel warranty', () => {
      const q = 'when does the panel warranty of my sony tv expire';
      const ans = answerWithDeterministicGrounding(q, multiDocs, multiAssets);

      assert.ok(ans.includes('2029-08-15'), 'Must extract Sony OLED warranty 2029-08-15');
      assert.ok(ans.includes('Sony Bravia'), 'Must identify Sony Bravia');
      assert.ok(!ans.includes('Macbook'), 'Must NOT mention Macbook');
      assert.ok(!ans.includes('Honda'), 'Must NOT mention Honda');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. NEGATIVE QUERIES & UNKNOWN ITEMS
  // ───────────────────────────────────────────────────────────────────────────
  describe('Group 4: Negative & Isolation Guarantees', () => {
    it('4.1 Rejects query for non-existent Car Insurance without leaking other assets', () => {
      const q = 'what is the policy number of my health insurance policy';
      const ans = answerWithDeterministicGrounding(q, [], []);

      assert.ok(ans.includes('could not find matching records'), 'Must report no matching records');
      assert.ok(!ans.includes('Electricity Bill'), 'Must NOT invent Electricity Bill');
      assert.ok(!ans.includes('Macbook'), 'Must NOT invent Macbook');
    });

    it('4.2 Rejects query for non-existent Passport without leaking other documents', () => {
      const q = 'what is the date on my passport';
      const ans = answerWithDeterministicGrounding(q, [], []);

      assert.ok(ans.includes('could not find matching records'), 'Must report no matching records');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. LIVE GROQ LLM EXECUTION WITH FULL FLASHCARD CONTEXT
  // ───────────────────────────────────────────────────────────────────────────
  describe('Group 5: Live Groq LLM Completion & Resilience', () => {
    it('5.1 Live Groq Chat Completion answers MacBook warranty and serial number accurately', async () => {
      const q = 'what is the serial number and processor of my macbook';
      const response = await answerDocumentQuery(q, [], [macbookAsset]);

      assert.ok(typeof response === 'string', 'Response must be a formatted string');
      assert.ok(response.includes('1234566678'), 'LLM must extract serial number 1234566678');
      assert.ok(response.toLowerCase().includes('m2') || response.toLowerCase().includes('neo'), 'LLM must mention M2 or Neo');
      assert.ok(!response.includes('Electricity Bill'), 'LLM response must not mention Electricity Bill');
    });

    it('5.2 Live Groq Chat Completion answers Electricity Bill query accurately', async () => {
      const q = 'what is the total amount and consumer name for the electricity bill receipt';
      const response = await answerDocumentQuery(q, [electricityDoc], []);

      assert.ok(typeof response === 'string', 'Response must be a formatted string');
      assert.ok(response.includes('225'), 'LLM must state amount 225');
      assert.ok(response.includes('SARIKA MISHRA'), 'LLM must state consumer name');
      assert.ok(!response.includes('Macbook'), 'LLM response must not mention Macbook');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. PERFORMANCE & SLA BENCHMARKING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Group 6: Performance & Latency SLA', () => {
    it('6.1 Deterministic Grounding resolves in under 10ms (100 iterations)', () => {
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        answerWithDeterministicGrounding('what is the warranty of my macbook', multiDocs, multiAssets);
        answerWithDeterministicGrounding('what is the amount of the electricity bill', multiDocs, multiAssets);
      }

      const elapsed = performance.now() - start;
      const avgLatencyMs = elapsed / (iterations * 2);

      console.log(`  ⚡ [Performance Benchmark] Avg Grounding Latency: ${avgLatencyMs.toFixed(3)} ms per query`);
      assert.ok(avgLatencyMs < 5.0, `Average latency must be under 5.0ms (got ${avgLatencyMs.toFixed(3)} ms)`);
    });
  });
});
