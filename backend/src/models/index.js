export { User } from '../modules/auth/auth.model.js';
export { Document } from '../modules/documents/document.model.js';
export { Asset } from '../modules/assets/asset.model.js';
export { Deadline } from '../modules/deadlines/deadline.model.js';
export { AuditLog } from '../modules/vault/auditLog.model.js';
export { TokenLedger } from '../modules/extraction/tokenLedger.model.js';
export { ExtractionJob } from '../modules/extraction/extractionJob.model.js';
export { ReviewHistory } from '../modules/extraction/reviewHistory.model.js';
export { Job } from '../modules/pipeline/job.model.js';

// Document Intelligence & Health Engine (DIHE) models
export { Entity, ENTITY_TYPES } from '../modules/intelligence/models/entity.model.js';
export { Relationship, RELATIONSHIP_TYPES } from '../modules/intelligence/models/relationship.model.js';
export { DocumentFact } from '../modules/intelligence/models/documentFact.model.js';
export { ConflictRecord, CONFLICT_STATUS } from '../modules/intelligence/models/conflict.model.js';
export { DocumentVersionGroup } from '../modules/intelligence/models/documentVersion.model.js';
export { IntelligenceAlert, ALERT_TYPES, ALERT_SEVERITY, ALERT_STATUS } from '../modules/intelligence/models/alert.model.js';
export { VerificationRecord, VERIFICATION_METHODS, VERIFICATION_RESULTS } from '../modules/intelligence/models/verificationRecord.model.js';
export { RequirementTemplate } from '../modules/intelligence/models/requirement.model.js';
