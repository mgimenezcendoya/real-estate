-- Migration 018: Payment plans (cuotas de compradores por reserva)

CREATE TYPE payment_moneda AS ENUM ('USD', 'ARS');
CREATE TYPE payment_ajuste AS ENUM ('ninguno', 'CAC', 'UVA', 'porcentaje_fijo');
CREATE TYPE installment_concepto AS ENUM ('anticipo', 'cuota', 'saldo');
CREATE TYPE installment_estado AS ENUM ('pendiente', 'pagado', 'vencido', 'parcial');
CREATE TYPE payment_metodo AS ENUM ('transferencia', 'cheque', 'efectivo', 'crypto', 'otro');

CREATE TABLE IF NOT EXISTS payment_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  descripcion      TEXT,
  moneda_base      payment_moneda NOT NULL DEFAULT 'USD',
  monto_total      NUMERIC(14,2) NOT NULL,
  tipo_ajuste      payment_ajuste NOT NULL DEFAULT 'ninguno',
  porcentaje_ajuste NUMERIC(5,2),   -- usado cuando tipo_ajuste = porcentaje_fijo
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_installments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  numero_cuota     INT NOT NULL,
  concepto         installment_concepto NOT NULL DEFAULT 'cuota',
  monto            NUMERIC(14,2) NOT NULL,
  moneda           payment_moneda NOT NULL DEFAULT 'USD',
  fecha_vencimiento DATE NOT NULL,
  estado           installment_estado NOT NULL DEFAULT 'pendiente',
  notas            TEXT
);

CREATE TABLE IF NOT EXISTS payment_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id   UUID NOT NULL REFERENCES payment_installments(id) ON DELETE CASCADE,
  fecha_pago       DATE NOT NULL,
  monto_pagado     NUMERIC(14,2) NOT NULL,
  moneda           payment_moneda NOT NULL DEFAULT 'USD',
  metodo_pago      payment_metodo NOT NULL DEFAULT 'transferencia',
  referencia       TEXT,
  comprobante_url  TEXT,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_reservation ON payment_plans(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_plan ON payment_installments(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_vencimiento ON payment_installments(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_payment_records_installment ON payment_records(installment_id);
