import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  createOrUpdateEntity,
  getUserEntities,
  getEntityById,
  updateEntity,
  deleteEntity,
} from './services/entity.service.js';
import {
  createOrUpdateRelationship,
  getEntityRelationships,
  traverseGraph,
  deleteRelationship,
} from './services/relationship.service.js';
import {
  syncDocumentFacts,
  getDocumentFacts,
  getEntityFacts,
} from './services/fact.service.js';
import {
  getVaultHealthSummary,
  getDocumentHealthDetail,
} from './services/health.service.js';
import {
  evaluateEntityCompleteness,
  getRequirementTemplate,
  DEFAULT_REQUIREMENTS,
} from './services/completeness.service.js';
import {
  getUserConflicts,
  resolveConflict,
  detectEntityFactConflicts,
} from './services/conflict.service.js';
import {
  getDocumentVersionHistory,
  compareDocumentVersions,
  addDocumentVersion,
} from './services/version.service.js';
import {
  getUserAlerts,
  dismissAlert,
  resolveAlert,
  evaluateProactiveAlerts,
} from './services/alert.service.js';
import {
  verifyDocumentAuthenticity,
  getDocumentVerificationRecords,
} from './services/authenticity.service.js';
import {
  getVaultIntelligenceSummary,
  evaluateVaultEvents,
  getComprehensiveEntityDetail,
} from './services/orchestrator.service.js';
import {
  executeFamilyAwareRetrieval,
} from './services/familyAccess.service.js';
import {
  syncUserVaultToKnowledgeGraph,
} from './services/graphBridge.service.js';

const router = Router();

// Protect all intelligence routes with authentication
router.use(requireAuth);

/* ==========================================================================
   Intelligence Summary & Event Evaluation
   ========================================================================== */
router.get('/summary', async (req, res) => {
  try {
    const summary = await getVaultIntelligenceSummary(req.user.userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/evaluate', async (req, res) => {
  try {
    const result = await evaluateVaultEvents(req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Knowledge Graph: Entities
   ========================================================================== */
router.get('/entities', async (req, res) => {
  try {
    const { type, status, search, page = 1, limit = 50 } = req.query;
    const result = await getUserEntities({
      userId: req.user.userId,
      entityType: type,
      status,
      search,
      page: Number(page),
      limit: Number(limit),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/entities', async (req, res) => {
  try {
    const { name, entityType, attributes, aliases, linkedDocumentIds, linkedAssetId } = req.body;
    if (!name || !entityType) {
      return res.status(400).json({ success: false, error: 'name and entityType are required' });
    }

    const entity = await createOrUpdateEntity({
      userId: req.user.userId,
      name,
      entityType,
      attributes,
      aliases,
      linkedDocumentIds,
      linkedAssetId,
    });

    res.status(201).json({ success: true, data: entity });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/entities/:id', async (req, res) => {
  try {
    const detail = await getComprehensiveEntityDetail(req.params.id, req.user.userId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/entities/:id', async (req, res) => {
  try {
    const updated = await updateEntity(req.params.id, req.user.userId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/entities/:id', async (req, res) => {
  try {
    const deleted = await deleteEntity(req.params.id, req.user.userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }
    res.json({ success: true, message: 'Entity deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Knowledge Graph: Relationships & Traversal
   ========================================================================== */
router.get('/entities/:id/relationships', async (req, res) => {
  try {
    const { direction = 'both' } = req.query;
    const relationships = await getEntityRelationships(req.params.id, req.user.userId, direction);
    res.json({ success: true, data: relationships });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/relationships', async (req, res) => {
  try {
    const {
      fromEntityId,
      relationshipType,
      toEntityId,
      sourceDocumentId,
      evidenceId,
      confidence,
      verificationStatus,
      metadata,
    } = req.body;

    const relationship = await createOrUpdateRelationship({
      userId: req.user.userId,
      fromEntityId,
      relationshipType,
      toEntityId,
      sourceDocumentId,
      evidenceId,
      confidence,
      verificationStatus,
      metadata,
    });

    res.status(201).json({ success: true, data: relationship });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/relationships/:id', async (req, res) => {
  try {
    const deleted = await deleteRelationship(req.params.id, req.user.userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Relationship not found' });
    }
    res.json({ success: true, message: 'Relationship deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/entities/:id/graph', async (req, res) => {
  try {
    const depth = Math.min(3, Math.max(1, Number(req.query.depth) || 2));
    const graph = await traverseGraph({
      startEntityId: req.params.id,
      userId: req.user.userId,
      maxDepth: depth,
    });
    res.json({ success: true, data: graph });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/graph/sync', async (req, res) => {
  try {
    const result = await syncUserVaultToKnowledgeGraph(req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Document Facts
   ========================================================================== */
router.get('/documents/:documentId/facts', async (req, res) => {
  try {
    const facts = await getDocumentFacts(req.params.documentId, req.user.userId);
    res.json({ success: true, data: facts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/documents/:documentId/facts/sync', async (req, res) => {
  try {
    const { entityId, extractedFields } = req.body;
    const facts = await syncDocumentFacts({
      userId: req.user.userId,
      documentId: req.params.documentId,
      entityId,
      extractedFields,
    });
    res.json({ success: true, data: facts });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/entities/:id/facts', async (req, res) => {
  try {
    const facts = await getEntityFacts(req.params.id, req.user.userId);
    res.json({ success: true, data: facts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Document Health
   ========================================================================== */
router.get('/health', async (req, res) => {
  try {
    const summary = await getVaultHealthSummary(req.user.userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/documents/:documentId/health', async (req, res) => {
  try {
    const detail = await getDocumentHealthDetail(req.params.documentId, req.user.userId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Completeness & Requirements
   ========================================================================== */
router.get('/entities/:id/completeness', async (req, res) => {
  try {
    const result = await evaluateEntityCompleteness(req.params.id, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/requirements', (req, res) => {
  res.json({ success: true, data: DEFAULT_REQUIREMENTS });
});

/* ==========================================================================
   Conflict Detection & Resolution
   ========================================================================== */
router.get('/conflicts', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const result = await getUserConflicts({
      userId: req.user.userId,
      status,
      page: Number(page),
      limit: Number(limit),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/conflicts/:id/resolve', async (req, res) => {
  try {
    const { resolution, manualValue, notes } = req.body;
    const resolved = await resolveConflict({
      conflictId: req.params.id,
      userId: req.user.userId,
      resolution,
      manualValue,
      notes,
    });
    res.json({ success: true, data: resolved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Version Intelligence
   ========================================================================== */
router.get('/documents/:documentId/versions', async (req, res) => {
  try {
    const history = await getDocumentVersionHistory(req.params.documentId, req.user.userId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/documents/:documentId/compare', async (req, res) => {
  try {
    const { compareWithDocumentId } = req.body;
    if (!compareWithDocumentId) {
      return res.status(400).json({ success: false, error: 'compareWithDocumentId is required' });
    }

    const diff = await compareDocumentVersions({
      documentAId: req.params.documentId,
      documentBId: compareWithDocumentId,
      userId: req.user.userId,
    });

    res.json({ success: true, data: diff });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/documents/:documentId/versions', async (req, res) => {
  try {
    const { documentGroupId, previousVersionId, changeSummary, entityId } = req.body;
    if (!documentGroupId) {
      return res.status(400).json({ success: false, error: 'documentGroupId is required' });
    }

    const group = await addDocumentVersion({
      userId: req.user.userId,
      documentGroupId,
      documentId: req.params.documentId,
      previousVersionId,
      changeSummary,
      entityId,
    });

    res.status(201).json({ success: true, data: group });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Proactive Alerts
   ========================================================================== */
router.get('/alerts', async (req, res) => {
  try {
    const { status, severity, limit = 50 } = req.query;
    const alerts = await getUserAlerts({
      userId: req.user.userId,
      status,
      severity,
      limit: Number(limit),
    });
    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/alerts/:id', async (req, res) => {
  try {
    const { action } = req.body; // 'dismiss' or 'resolve'
    let updatedAlert;
    if (action === 'dismiss') {
      updatedAlert = await dismissAlert(req.params.id, req.user.userId);
    } else if (action === 'resolve') {
      updatedAlert = await resolveAlert(req.params.id, req.user.userId);
    } else {
      return res.status(400).json({ success: false, error: 'action must be "dismiss" or "resolve"' });
    }
    res.json({ success: true, data: updatedAlert });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Authenticity Verification
   ========================================================================== */
router.post('/documents/:documentId/verify', async (req, res) => {
  try {
    const result = await verifyDocumentAuthenticity(req.params.documentId, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/documents/:documentId/verification', async (req, res) => {
  try {
    const records = await getDocumentVerificationRecords(req.params.documentId, req.user.userId);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   Family-Aware Retrieval
   ========================================================================== */
router.post('/family-query', async (req, res) => {
  try {
    const { personQuery, assetQuery, categoryFilter } = req.body;
    const result = await executeFamilyAwareRetrieval({
      userId: req.user.userId,
      personQuery,
      assetQuery,
      categoryFilter,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

