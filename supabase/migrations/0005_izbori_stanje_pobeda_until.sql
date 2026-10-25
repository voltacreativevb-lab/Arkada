-- ============================================================================
-- MAESTROVOLTA — Migration 0005: pobeda_until za pouzdano automatsko gašenje
-- "Test" dugme uključuje pobeda_prikaz na 10s preko servera (ne preko
-- setTimeout-a u browseru operatera, koji se gubi ako se stranica zatvori
-- ili refreshuje pre isteka) — GET /izbori/stanje sam gasi animaciju kad
-- pobeda_until istekne.
-- ============================================================================

alter table izbori_stanje
  add column pobeda_until timestamptz;
