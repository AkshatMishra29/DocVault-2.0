import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';
import { answerWithDeterministicGrounding, parseStructuredResume } from '../src/services/ai/groqService.js';
import { classifyDocumentByRules } from '../src/modules/extraction/ruleExtraction.service.js';

test('🧪 Ask AI Resume & Complex Project Architecture Engine Suite', async (t) => {
  const mockSapResumeDoc = {
    _id: 'doc-sap-resume-01',
    title: 'Akshat Resume for SAP Roles',
    category: 'Resume / CV',
    documentDate: '2026-11-01',
    summary: 'Uploaded document stored securely in your encrypted DocVault.',
    keyDetails: { 'File Name': 'Akshat Resume for SAP Roles.pdf' },
    extractedText: `
--- Page 1 ---
AKSHAT MISHRA
Email: akshat@docvault.dev | LinkedIn: linkedin.com/in/akshatmishra
SUMMARY:
Full Stack Enterprise Architect and SAP Certified Generative AI Developer with a strong interest in B2B SaaS and customer acquisition.
CERTIFICATIONS:
• SAP Certified Generative AI Developer
• AWS Certified Solutions Architect - Associate
• AMD AI Academy Certified Agent Developer
SKILLS:
SAP BTP, SAP CAP, Node.js, Python, React, TypeScript, LangChain, Groq SDK, MongoDB
EXPERIENCE:
DocVault Systems - Senior Full Stack AI Engineer (2024 - Present)
- Architected enterprise document processing pipelines and zero-knowledge RAG engine.
- Integrated SAP Generative AI Hub connectors for enterprise document management.
EDUCATION:
B.Tech in Computer Science (2020 - 2024)
`
  };

  const mockProjectDoc = {
    _id: 'doc-project-01',
    title: 'DocVault 2.0 System Architecture & Technical Specifications',
    category: 'Technical Architecture',
    documentDate: '2026-10-28',
    summary: 'Comprehensive end-to-end architecture specification for DocVault 2.0 including hybrid RAG search, edge vision guardrails, and cryptographic access controls.',
    keyDetails: {
      'Core Skills / Tech Stack': 'Node.js, Express, MongoDB, React, Groq 120B LLM, ONNX Runtime',
      'Projects': 'Client Layer, Vision Guardrail Engine, Semantic Hybrid RAG, Zero-Knowledge Storage Engine',
      'Issue Date': '2026-10-28'
    },
    extractedText: `
--- Page 1 ---
DOCVAULT 2.0 ARCHITECTURAL BLUEPRINT
1. Client Layer:
   - React 18 SPA with responsive bottom navigation, interactive passcode lock, and swipe-to-upload.
2. Security & Ingestion Pipeline:
   - Layer 1: Cryptographic SHA-256 fingerprinting for instant duplicate rejection.
   - Layer 2: Edge vision guardrails checking Laplacian variance (>15 threshold) to reject blurred uploads.
   - Layer 3: ONNX MobileNetV4 synthetic and landscape classifier to reject non-documents.
3. Intelligence & RAG Core:
   - Dense vector embeddings paired with sparse lexical scoring fused via Reciprocal Rank Fusion (RRF).
   - Primary LLM inference powered by Groq openai/gpt-oss-120b for complex reasoning.
`
  };

  const mockElectricityDoc = {
    _id: 'doc-bill-01',
    title: 'Electricity Bill Receipt',
    category: 'Purchase Receipt',
    documentDate: '2026-11-11',
    summary: 'Electricity bill payment receipt of ₹225 for consumer SARIKA MISHRA (Account No: 0671805000) at Madhyanchal Vidyut Vitran Nigam Ltd on 11-11-2026.',
    keyDetails: {
      'CONSUMER NAME': 'SARIKA MISHRA',
      'ACCOUNT NUMBER': '0671805000',
      'TOTAL AMOUNT': '₹225.00',
      'ISSUE DATE': '2026-11-11'
    },
    extractedText: 'Electricity Bill Payment Receipt. Madhyanchal Vidyut Vitran Nigam Ltd. Consumer Name: SARIKA MISHRA. Account No: 0671805000. Total Amount Paid: ₹225.00. Payment Date: 11-11-2026. Status: Paid.'
  };

  await t.test('1. Groq Config is configured with 120B model', () => {
    assert.equal(config.groq.model, 'openai/gpt-oss-120b');
  });

  await t.test('2. Resume query extracts certifications as itemized list, NOT a broken 1-sentence snippet', () => {
    const answer = answerWithDeterministicGrounding(
      'give me my sap resume and give me the list of certfications present in ti',
      [mockElectricityDoc, mockSapResumeDoc],
      []
    );

    assert.match(answer, /Verified Certifications/i);
    assert.match(answer, /SAP Certified Generative AI Developer/i);
    assert.match(answer, /AWS Certified Solutions Architect/i);
    assert.match(answer, /AMD AI Academy/i);
    // Entity isolation: MUST NOT contain electricity bill details
    assert.doesNotMatch(answer, /Electricity Bill Receipt/i);
    assert.doesNotMatch(answer, /SARIKA MISHRA/i);
    assert.doesNotMatch(answer, /₹225/i);
  });

  await t.test('3. Detailed content query of resume extracts candidate name, summary, certs, skills, and experience', () => {
    const answer = answerWithDeterministicGrounding(
      'give me the detailed content of the sap resume',
      [mockElectricityDoc, mockSapResumeDoc],
      []
    );

    assert.match(answer, /Akshat Mishra/i);
    assert.match(answer, /SAP Certified Generative AI Developer/i);
    assert.match(answer, /SAP BTP|Node\.js|Python|React/i);
    assert.match(answer, /DocVault Systems/i);
    assert.doesNotMatch(answer, /Electricity Bill Receipt/i);
  });

  await t.test('4. Electricity bill query returns clean structured metrics card', () => {
    const answer = answerWithDeterministicGrounding(
      'give me the electricity bill of the last month',
      [mockElectricityDoc, mockSapResumeDoc],
      []
    );

    assert.match(answer, /SARIKA MISHRA/i);
    assert.match(answer, /0671805000/);
    assert.match(answer, /225/);
    assert.match(answer, /2026-11-11|11-11-2026/);
    assert.match(answer, /Madhyanchal Vidyut Vitran Nigam Ltd/i);
    assert.doesNotMatch(answer, /Akshat Mishra/i);
    assert.doesNotMatch(answer, /SAP/i);
  });

  await t.test('5. classifyDocumentByRules classifies resume as Resume / CV and NOT Insurance Policy', () => {
    const res = classifyDocumentByRules(mockSapResumeDoc.extractedText, 'Akshat Resume for SAP Roles.pdf');
    assert.equal(res.category, 'Resume / CV');
    assert.notEqual(res.category, 'Insurance Policy');
  });

  await t.test('6. parseStructuredResume extracts all key sections from OCR text', () => {
    const parsed = parseStructuredResume(mockSapResumeDoc.extractedText, mockSapResumeDoc);
    assert.equal(parsed.candidateName, 'AKSHAT MISHRA');
    assert.ok(parsed.certifications.some(c => c.includes('SAP Certified Generative AI Developer')));
    assert.ok(parsed.skills.length > 0);
  });
});
