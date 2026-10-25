-- ============================================================================
-- MAESTROVOLTA — Migration 0006: samo tri liste (SNS, Studentska, SPS)
-- Operater prati samo glasove po listama, bez upisanih biraca/broja
-- glasalih/nevazecih — ti brojevi se uklanjaju, dodaje se SPS kao treca lista.
-- ============================================================================

alter table biracka_mesta
  add column sps integer not null default 0 check (sps >= 0);

alter table biracka_mesta
  drop column if exists upisani,
  drop column if exists glasalo,
  drop column if exists nevazeci;
