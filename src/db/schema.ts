import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('auditor'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ticker: text('ticker').notNull(),
  exchange: text('exchange').notNull().default('HOSE'),
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reportCode: text('report_code').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  companyId: integer('company_id')
    .references(() => companies.id)
    .notNull(),
  originalFilename: text('original_filename').notNull(),
  documentHash: text('document_hash').notNull(),
  reportingPeriod: text('reporting_period').notNull(),
  reportType: text('report_type').notNull(),
  fiscalYear: text('fiscal_year').notNull(),
  currency: text('currency').notNull().default('VND'),
  unit: text('unit').notNull().default('Billion VND'),
  storagePath: text('storage_path').notNull(),
  status: text('status').notNull().default('PENDING'),
  buyerDecision: text('buyer_decision').notNull().default('Pending'),
  buyerNote: text('buyer_note').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const claims = pgTable('claims', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id')
    .references(() => reports.id, { onDelete: 'cascade' })
    .notNull(),
  claimCode: text('claim_code').notNull(),
  claimType: text('claim_type').notNull().default('financial_metric'),
  metric: text('metric').notNull(),
  reportedValue: doublePrecision('reported_value'),
  referenceValue: doublePrecision('reference_value'),
  period: text('period').notNull(),
  reportType: text('report_type').notNull().default('Consolidated'),
  currency: text('currency').notNull().default('VND'),
  unit: text('unit').notNull(),
  formula: text('formula'),
  sourcePage: integer('source_page'),
  sourceLocation: text('source_location'),
  evidence: text('evidence').notNull().default(''),
  verificationStatus: text('verification_status').notNull().default('PENDING'),
});

export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id')
    .references(() => reports.id, { onDelete: 'cascade' })
    .notNull(),
  claimId: integer('claim_id')
    .references(() => claims.id, { onDelete: 'cascade' })
    .notNull(),
  ruleVersion: text('rule_version').notNull().default('1.0.0'),
  verifierVersion: text('verifier_version').notNull().default('stockproof-engine-1.0'),
  result: text('result').notNull(),
  explanation: text('explanation').notNull(),
  difference: text('difference').notNull().default('0'),
  validationRule: text('validation_rule').notNull().default('NUMERICAL'),
  verifiedAt: timestamp('verified_at').defaultNow().notNull(),
});

export const evidences = pgTable('evidences', {
  id: serial('id').primaryKey(),
  claimId: integer('claim_id')
    .references(() => claims.id, { onDelete: 'cascade' })
    .notNull(),
  sourceName: text('source_name').notNull(),
  sourcePage: integer('source_page'),
  sourceLocation: text('source_location').notNull().default(''),
  evidenceHash: text('evidence_hash').notNull(),
});

export const humanReviews = pgTable('human_reviews', {
  id: serial('id').primaryKey(),
  claimId: integer('claim_id')
    .references(() => claims.id, { onDelete: 'cascade' })
    .notNull(),
  reviewerId: text('reviewer_id').notNull(),
  reviewerName: text('reviewer_name').notNull().default('Auditor'),
  decision: text('decision').notNull(),
  comment: text('comment').notNull(),
  previousValue: doublePrecision('previous_value'),
  updatedValue: doublePrecision('updated_value'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const blockchainRecords = pgTable('blockchain_records', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id')
    .references(() => reports.id, { onDelete: 'cascade' })
    .notNull(),
  reportHash: text('report_hash').notNull(),
  evidenceHash: text('evidence_hash').notNull(),
  transactionHash: text('transaction_hash').notNull(),
  contractAddress: text('contract_address').notNull(),
  network: text('network').notNull().default('Avalanche Fuji Testnet'),
  verificationStatus: text('verification_status').notNull().default('VERIFIED'),
  blockNumber: integer('block_number').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  reports: many(reports),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  reports: many(reports),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  user: one(users, {
    fields: [reports.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [reports.companyId],
    references: [companies.id],
  }),
  claims: many(claims),
  verifications: many(verifications),
  blockchainRecords: many(blockchainRecords),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  report: one(reports, {
    fields: [claims.reportId],
    references: [reports.id],
  }),
  verifications: many(verifications),
  evidences: many(evidences),
  humanReviews: many(humanReviews),
}));

export const verificationsRelations = relations(verifications, ({ one }) => ({
  report: one(reports, {
    fields: [verifications.reportId],
    references: [reports.id],
  }),
  claim: one(claims, {
    fields: [verifications.claimId],
    references: [claims.id],
  }),
}));

export const evidencesRelations = relations(evidences, ({ one }) => ({
  claim: one(claims, {
    fields: [evidences.claimId],
    references: [claims.id],
  }),
}));

export const humanReviewsRelations = relations(humanReviews, ({ one }) => ({
  claim: one(claims, {
    fields: [humanReviews.claimId],
    references: [claims.id],
  }),
}));

export const blockchainRecordsRelations = relations(
  blockchainRecords,
  ({ one }) => ({
    report: one(reports, {
      fields: [blockchainRecords.reportId],
      references: [reports.id],
    }),
  }),
);
