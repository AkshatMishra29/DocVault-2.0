import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';
import { answerWithDeterministicGrounding } from '../src/services/ai/groqService.js';

test('🧪 Ask AI Resume & Complex Project Architecture Engine Suite', async (t) => {
  const mockResumeDoc = {
    _id: 'doc-resume-01',
    title: 'Akshat Mishra - Full Stack AI Engineer Resume',
    category: 'Resume / CV',
    documentDate: '2026-11-01',
    summary: 'Senior Full Stack & AI Systems Engineer with 4+ years of experience designing high-throughput distributed RAG pipelines, microservices, and React architectures.',
    keyDetails: {
      'Candidate or Recipient Name': 'Akshat Mishra',
      'Current Title / Role': 'Lead Full Stack AI Engineer',
      'Core Skills / Tech Stack': 'Node.js, Express, React, TypeScript, Python, Groq LLMs, ONNX Runtime, MongoDB, Docker, TailwindCSS',
      'Projects': 'DocVault 2.0 (Zero-Knowledge AI Document Intelligence), DiHE High-Efficiency OCR Engine',
      'Issue Date': '2026-11-01'
    },
    extractedText: `
--- Page 1 ---
AKSHAT MISHRA
Email: akshat@docvault.dev | Portfolio: https://github.com/AkshatMishra29
SUMMARY:
Full Stack & AI Systems Engineer specializing in privacy-preserving document intelligence, edge inference, and high-performance React architectures.
EXPERIENCE:
DocVault Systems - Lead Architect (2024 - Present)
- Engineered hybrid semantic search combining dense vector embeddings with Reciprocal Rank Fusion (RRF).
- Implemented multi-stage computer vision guardrails using ONNX MobileNetV4 and Laplacian variance analysis.
- Deployed Groq-accelerated 120-Billion parameter reasoning pipelines achieving sub-1200ms roundtrips.
EDUCATION:
B.Tech in Computer Science & Engineering (2020 - 2024)
--- Page 2 ---
TECHNICAL PROJECTS:
1. DocVault 2.0:
   - Full stack encrypted vault featuring client-side SHA-256 duplicate prevention, AES-256 encryption, and zero-leak entity isolation.
   - Microservices architecture powered by Node.js, Express, MongoDB, and React with Lucide icons and TailwindCSS.
2. DiHE Hybrid Extraction Engine:
   - Hybrid OCR combining Tesseract, Groq Vision OCR, and structured metadata normalization.
SKILLS MATRIX:
Languages: JavaScript, TypeScript, Python, SQL, C++
Frameworks & Libraries: React, Node.js, Express.js, TailwindCSS, Mongoose, ONNX Runtime Web
DevOps & Cloud: Docker, Groq Hardware, AWS S3, CI/CD, Git
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
    summary: 'Payment receipt for electricity utility consumer #99214.',
    keyDetails: {
      'Consumer Name': 'City Power Customer',
      'Total Amount': '₹1,450.00',
      'Issue Date': '2026-11-11'
    },
    extractedText: 'Electricity Bill Receipt. Consumer Name: City Power Customer. Total Amount: ₹1,450.00. Date: 2026-11-11.'
  };

  await t.test('1. Groq Config is configured with 120B model', () => {
    assert.equal(config.groq.model, 'openai/gpt-oss-120b');
  });

  await t.test('2. Resume query extracts candidate name, role, tech stack, and projects without hallucinating electricity bill', () => {
    const answer = answerWithDeterministicGrounding(
      'give me the candidate resume details and technical skills',
      [mockElectricityDoc, mockResumeDoc],
      []
    );

    assert.match(answer, /Akshat Mishra/i);
    assert.match(answer, /Lead Full Stack AI Engineer/i);
    assert.match(answer, /Node\.js|Python|React/i);
    assert.match(answer, /DocVault 2\.0/i);
    // Entity isolation check: MUST NOT contain electricity bill
    assert.doesNotMatch(answer, /Electricity Bill Receipt/i);
    assert.doesNotMatch(answer, /City Power Customer/i);
    assert.doesNotMatch(answer, /₹1,450/i);
  });

  await t.test('3. Project Architecture query extracts system design and technical components without utility leakage', () => {
    const answer = answerWithDeterministicGrounding(
      'what is the architecture and tech stack of the project',
      [mockElectricityDoc, mockProjectDoc],
      []
    );

    assert.match(answer, /DocVault 2\.0 System Architecture/i);
    assert.match(answer, /Groq 120B LLM|ONNX Runtime/i);
    assert.doesNotMatch(answer, /Electricity Bill Receipt/i);
    assert.doesNotMatch(answer, /₹1,450/i);
  });

  await t.test('4. Specific candidate experience query cites multi-page resume excerpt accurately', () => {
    const answer = answerWithDeterministicGrounding(
      'what is the candidate experience at DocVault Systems',
      [mockResumeDoc],
      []
    );

    assert.match(answer, /Akshat Mishra/i);
    assert.match(answer, /DocVault Systems|Full Stack/i);
  });
});
