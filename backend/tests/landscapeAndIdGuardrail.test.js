import { describe, it } from 'node:test';
import assert from 'node:assert';
import sharp from 'sharp';
import { validateDocumentPipeline } from '../src/modules/extraction/documentValidationPipeline.service.js';

describe('Document Validation: Landscape Rejection & Human-in-Document Guardrail', () => {

  it('1. MUST REJECT landscape scenery image with synthetic banner text', async () => {
    // Generate synthetic landscape scenery: blue sky + green grass (high vibrantRatio > 0.40)
    // with banner text overlaid
    const width = 1000;
    const height = 700;
    
    // SVG simulating outdoor scenery (rich sky and grass) + incidental text
    const svgLandscape = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0066FF"/>
            <stop offset="50%" stop-color="#3399FF"/>
            <stop offset="100%" stop-color="#99CCFF"/>
          </linearGradient>
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#009933"/>
            <stop offset="100%" stop-color="#006600"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="400" fill="url(#sky)"/>
        <rect y="400" width="${width}" height="300" fill="url(#grass)"/>
        <rect x="20" y="20" width="700" height="50" fill="white" opacity="0.9"/>
        <text x="30" y="55" font-family="Arial" font-size="28" font-weight="bold" fill="#111827">SYNTHETIC LANDSCAPE — NON-DOCUMENT TEST</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svgLandscape))
      .jpeg({ quality: 90 })
      .toBuffer();

    const result = await validateDocumentPipeline(buffer, {
      originalname: 'casual_landscape_non_document_scan.jpg',
      mimetype: 'image/jpeg',
    });

    console.log('Landscape Validation Result:', result.status, result.reason_code, result.document_classification);
    assert.strictEqual(result.status, 'rejected', 'Landscape image must be rejected');
    assert.strictEqual(result.reason_code, 'NON_DOCUMENT_IMAGE', 'Reason code must be NON_DOCUMENT_IMAGE');
    assert.ok(result.document_classification.includes('SCENERY') || result.document_classification.includes('NON_DOCUMENT'));
  });

  it('2. MUST REJECT casual portrait / selfie photo with incidental text on clothing', async () => {
    // Portrait photo: high skin tone ratio, no identity keywords, casual t-shirt text
    const width = 600;
    const height = 800;

    const svgPortrait = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Room wall background -->
        <rect width="${width}" height="${height}" fill="#8D7B68"/>
        <!-- Face and neck with skin tone -->
        <ellipse cx="300" cy="300" rx="140" ry="180" fill="#E0A96D"/>
        <!-- Shirt with incidental branding text -->
        <path d="M 120 480 Q 300 520 480 480 L 520 800 L 80 800 Z" fill="#2C3E50"/>
        <text x="230" y="620" font-family="Arial" font-size="32" font-weight="bold" fill="#FFFFFF">PARIS</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svgPortrait))
      .jpeg({ quality: 90 })
      .toBuffer();

    const result = await validateDocumentPipeline(buffer, {
      originalname: 'selfie_casual_photo.jpg',
      mimetype: 'image/jpeg',
    });

    console.log('Portrait Validation Result:', result.status, result.reason_code, result.document_classification);
    assert.strictEqual(result.status, 'rejected', 'Casual portrait photo must be rejected');
    assert.strictEqual(result.reason_code, 'NON_DOCUMENT_IMAGE', 'Reason code must be NON_DOCUMENT_IMAGE');
  });

  it('3. MUST ACCEPT legitimate ID Card containing a photo of a person (Aadhaar / PAN mock)', async () => {
    // ID card layout: light card background, passport photo in corner, structured identity text
    const width = 800;
    const height = 500;

    const svgIdCard = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- White/light grey ID card body -->
        <rect width="${width}" height="${height}" rx="16" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/>
        
        <!-- Header -->
        <rect x="0" y="0" width="${width}" height="60" fill="#0284C7"/>
        <text x="30" y="40" font-family="Arial" font-size="22" font-weight="bold" fill="#FFFFFF">GOVERNMENT OF INDIA - IDENTITY CARD</text>
        
        <!-- Passport photo of citizen -->
        <rect x="40" y="90" width="160" height="200" fill="#E0A96D" stroke="#94A3B8" stroke-width="2"/>
        <circle cx="120" cy="160" r="45" fill="#C68B59"/>
        <path d="M 60 270 Q 120 220 180 270 Z" fill="#1E293B"/>

        <!-- Structured Identity Details -->
        <text x="240" y="120" font-family="Arial" font-size="20" font-weight="bold" fill="#0F172A">Name: Akshat Mishra</text>
        <text x="240" y="160" font-family="Arial" font-size="16" fill="#334155">DOB: 15/08/1995</text>
        <text x="240" y="200" font-family="Arial" font-size="16" fill="#334155">Gender: MALE</text>
        <text x="240" y="240" font-family="Arial" font-size="16" fill="#334155">Aadhaar / ID No: 9876 5432 1098</text>
        <text x="240" y="280" font-family="Arial" font-size="14" fill="#64748B">Address: 124 Sector 15 Noida UP 201301</text>
        
        <!-- Footer line -->
        <line x1="40" y1="360" x2="760" y2="360" stroke="#E2E8F0" stroke-width="2"/>
        <text x="40" y="420" font-family="Arial" font-size="14" font-weight="bold" fill="#0284C7">Unique Identification Authority of India</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svgIdCard))
      .png()
      .toBuffer();

    const result = await validateDocumentPipeline(buffer, {
      originalname: 'aadhaar_identity_card.png',
      mimetype: 'image/png',
    });

    console.log('ID Card Validation Result:', result.status, result.reason_code, result.document_type);
    assert.strictEqual(result.status, 'accepted', 'Legitimate ID card with human photo must be accepted');
    assert.strictEqual(result.document_type, 'id_card', 'Document type must be id_card');
  });

  it('4. MUST ACCEPT Rent Agreement / Deed containing photo of landlord/tenant', async () => {
    const width = 850;
    const height = 1100;

    const svgDeed = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#FFFFFF"/>
        
        <text x="220" y="80" font-family="Arial" font-size="26" font-weight="bold" fill="#0F172A">RESIDENTIAL LEASE AGREEMENT</text>
        <line x1="60" y1="110" x2="790" y2="110" stroke="#0F172A" stroke-width="2"/>

        <text x="60" y="160" font-family="Arial" font-size="16" fill="#1E293B">This Rent Agreement is made and executed on this 1st day of May 2026</text>
        <text x="60" y="190" font-family="Arial" font-size="16" fill="#1E293B">BETWEEN: Sanjay Mishra (Landlord / First Party)</text>
        <text x="60" y="220" font-family="Arial" font-size="16" fill="#1E293B">AND: Rahul Verma (Tenant / Second Party)</text>
        <text x="60" y="260" font-family="Arial" font-size="15" fill="#334155">WHEREAS the Landlord agrees to lease out Flat No 402, Green Avenue, Delhi.</text>
        <text x="60" y="290" font-family="Arial" font-size="15" fill="#334155">Monthly Rent: Rs 25,000 per month payable in advance.</text>
        
        <!-- Affixed passport photo of tenant -->
        <rect x="620" y="150" width="130" height="160" fill="#E0A96D" stroke="#94A3B8" stroke-width="1.5"/>
        <circle cx="685" cy="205" r="35" fill="#C68B59"/>
        <text x="640" y="330" font-family="Arial" font-size="11" fill="#64748B">Tenant Photograph</text>

        <text x="60" y="400" font-family="Arial" font-size="14" fill="#334155">WITNESS 1: Signature ____________________</text>
        <text x="60" y="440" font-family="Arial" font-size="14" fill="#334155">NOTARY ATTESTATION: Verified and registered before me.</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svgDeed))
      .png()
      .toBuffer();

    const result = await validateDocumentPipeline(buffer, {
      originalname: 'registered_rent_agreement.png',
      mimetype: 'image/png',
    });

    console.log('Rent Agreement Validation Result:', result.status, result.reason_code, result.document_type);
    assert.strictEqual(result.status, 'accepted', 'Rent agreement with photo must be accepted');
    assert.strictEqual(result.document_type, 'legal_document', 'Document type must be legal_document');
  });

});
