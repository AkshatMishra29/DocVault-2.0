import mongoose from 'mongoose';
import { getVaultHealthSummary } from './health.service.js';
import { getUserAlerts, evaluateProactiveAlerts } from './alert.service.js';
import { getUserEntities, getEntityById } from './entity.service.js';
import { getEntityRelationships } from './relationship.service.js';
import { evaluateEntityCompleteness } from './completeness.service.js';
import { detectEntityFactConflicts, getUserConflicts } from './conflict.service.js';
import { syncUserVaultToKnowledgeGraph } from './graphBridge.service.js';
import { ConflictRecord, CONFLICT_STATUS } from '../models/conflict.model.js';
import { Entity } from '../models/entity.model.js';
import { Document } from '../../documents/document.model.js';

/**
 * Central Intelligence Orchestrator
 *
 * Coordinates multi-engine intelligence operations, enforces tenant boundaries,
 * and compiles structured, evidence-backed responses.
 */

/**
 * Returns a high-level summary of the user's document health, active alerts,
 * entity graph stats, and open conflicts.
 */
export async function getVaultIntelligenceSummary(userId) {
  const [healthSummary, alerts, entitiesResult, conflictsResult] = await Promise.all([
    getVaultHealthSummary(userId),
    getUserAlerts({ userId, limit: 10 }),
    getUserEntities({ userId, limit: 100 }),
    getUserConflicts({ userId, status: CONFLICT_STATUS.OPEN, limit: 10 }),
  ]);

  // Break down entities by type
  const entityTypeCounts = {};
  for (const ent of entitiesResult.entities) {
    entityTypeCounts[ent.entityType] = (entityTypeCounts[ent.entityType] || 0) + 1;
  }

  // Count alerts by severity
  const alertSeverityCounts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };

  return {
    health: healthSummary,
    alerts: {
      totalActive: alerts.length,
      severityCounts: alertSeverityCounts,
      recent: alerts.slice(0, 5),
    },
    graph: {
      totalEntities: entitiesResult.total,
      typeCounts: entityTypeCounts,
    },
    conflicts: {
      totalOpen: conflictsResult.total,
      items: conflictsResult.conflicts.slice(0, 3),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run a full vault re-evaluation:
 * 1. Syncs any new assets & docs into graph
 * 2. Evaluates proactive alerts
 * 3. Scans for cross-document conflicts
 */
export async function evaluateVaultEvents(userId) {
  // Step 1: Sync Assets & Documents to Graph
  const syncResult = await syncUserVaultToKnowledgeGraph(userId);

  // Step 2: Scan for conflicts across entities
  const entities = await Entity.find({ userId, status: { $ne: 'deleted' } }).lean();
  let totalConflictsFound = 0;
  for (const ent of entities) {
    try {
      const conflicts = await detectEntityFactConflicts(ent._id, userId);
      totalConflictsFound += conflicts.length;
    } catch (e) {
      console.warn(`[Orchestrator] Conflict scan error for ${ent._id}:`, e.message);
    }
  }

  // Step 3: Run proactive alert engine
  const generatedAlerts = await evaluateProactiveAlerts(userId);

  return {
    success: true,
    graphSync: syncResult,
    conflictsDetected: totalConflictsFound,
    alertsEvaluated: generatedAlerts.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Returns a 360-degree profile for an entity:
 * - Details and attributes
 * - Connected documents with health status
 * - Graph relationships
 * - Document completeness checklist
 * - Open conflicts
 */
export async function getComprehensiveEntityDetail(entityId, userId) {
  const entity = await getEntityById(entityId, userId);
  if (!entity) return null;

  const [relationships, completeness, conflicts] = await Promise.all([
    getEntityRelationships(entityId, userId),
    evaluateEntityCompleteness(entityId, userId).catch(() => ({ hasTemplate: false, items: [] })),
    ConflictRecord.find({ entityId, userId, status: CONFLICT_STATUS.OPEN })
      .populate('documentAId', 'title category')
      .populate('documentBId', 'title category')
      .lean(),
  ]);

  return {
    entity,
    relationships,
    completeness,
    conflicts,
  };
}

