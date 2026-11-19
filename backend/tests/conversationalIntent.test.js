import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyConversationalIntent } from '../src/modules/ai/conversationalIntent.service.js';
import { answerWithDeterministicGrounding } from '../src/services/ai/groqService.js';

describe('🤖 DocVault AI Conversational & Greeting Intent Classifier Suite', () => {
  it('1. Correctly classifies "nice thanks" as gratitude with a polite response', () => {
    const res = classifyConversationalIntent('nice thanks');
    assert.ok(res, 'Must match conversational intent');
    assert.strictEqual(res.type, 'GRATITUDE');
    assert.ok(res.response.includes('welcome'), 'Response must be welcoming');
  });

  it('2. Correctly classifies various gratitude phrases', () => {
    const phrases = ['thanks', 'thank you', 'thank you so much', 'awesome thanks', 'great job', 'much appreciated', 'very helpful thanks'];
    for (const p of phrases) {
      const res = classifyConversationalIntent(p);
      assert.ok(res, `Failed on: "${p}"`);
      assert.strictEqual(res.type, 'GRATITUDE', `Failed type on: "${p}"`);
    }
  });

  it('3. Correctly classifies greetings', () => {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good evening', 'hi docvault', 'hola', 'namaste'];
    for (const g of greetings) {
      const res = classifyConversationalIntent(g);
      assert.ok(res, `Failed on: "${g}"`);
      assert.strictEqual(res.type, 'GREETING', `Failed type on: "${g}"`);
      assert.ok(res.response.includes('DocVault AI Copilot'), 'Greeting must introduce DocVault AI Copilot');
    }
  });

  it('4. Correctly classifies assistant identity and capability queries', () => {
    const queries = ['who are you', 'what can you do', 'what are your capabilities', 'help me', 'introduce yourself'];
    for (const q of queries) {
      const res = classifyConversationalIntent(q);
      assert.ok(res, `Failed on: "${q}"`);
      assert.strictEqual(res.type, 'IDENTITY', `Failed type on: "${q}"`);
      assert.ok(res.response.includes('Instant Fact Retrieval') || res.response.includes('Asset Flashcards'), 'Must outline capabilities');
    }
  });

  it('5. Correctly classifies farewells', () => {
    const farewells = ['bye', 'goodbye', 'see you', 'take care', 'good night'];
    for (const f of farewells) {
      const res = classifyConversationalIntent(f);
      assert.ok(res, `Failed on: "${f}"`);
      assert.strictEqual(res.type, 'FAREWELL', `Failed type on: "${f}"`);
    }
  });

  it('6. Correctly classifies acknowledgments and pleasantries', () => {
    const acks = ['ok', 'okay', 'cool', 'alright', 'got it', 'noted'];
    for (const a of acks) {
      const res = classifyConversationalIntent(a);
      assert.ok(res, `Failed on: "${a}"`);
      assert.ok(['ACKNOWLEDGMENT', 'GRATITUDE'].includes(res.type), `Unexpected type on: "${a}"`);
    }
  });

  it('7. Domain Guardrail: Does NOT hijack document queries', () => {
    const docQueries = [
      'give me my amd certficate',
      'what is the issue date of this certificate',
      'show me my electricity bill',
      'what is the total amount of my tax invoice',
      'when does my insurance policy expire',
      'find my car registration document'
    ];
    for (const dq of docQueries) {
      const res = classifyConversationalIntent(dq);
      assert.strictEqual(res, null, `Query "${dq}" was mistakenly intercepted as conversational!`);
    }
  });

  it('8. Domain Guardrail: Does NOT hijack asset flashcard queries', () => {
    const assetQueries = [
      'what is the serial number of my macbook',
      'when was my laptop purchased',
      'show me the warranty date of honda car'
    ];
    for (const aq of assetQueries) {
      const res = classifyConversationalIntent(aq);
      assert.strictEqual(res, null, `Asset query "${aq}" was mistakenly intercepted as conversational!`);
    }
  });

  it('9. answerWithDeterministicGrounding handles "nice thanks" warmly instead of stating records not found', () => {
    const dummyDocs = [{ _id: '1', title: 'Some Doc', category: 'Other' }];
    const answer = answerWithDeterministicGrounding('nice thanks ', dummyDocs, []);
    assert.ok(answer.includes('welcome'), 'Must return welcoming response');
    assert.ok(!answer.includes('could not find matching records'), 'Must NOT state records not found');
  });
});
