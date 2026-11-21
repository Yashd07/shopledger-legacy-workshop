'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function makeStoredStyleOrder(item, coupon) {
  const totals = pricing.computeTotals([item], coupon || '');

  return {
    id: 7001,
    customer: 'In-memory characterization order',
    status: 'completed',
    items: [item],
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: invoice matches the billed HSN GST breakdown and total', function () {
  const item = {
    id: 1,
    sku: 'RICE-1',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  };
  const order = makeStoredStyleOrder(item);
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: order.subtotal, tax: order.tax, total: order.total },
    { subtotal: 100, tax: 5, total: 105 }
  );
  assert.deepEqual(
    {
      gstPercent: invoiceFigures.rows[0].gstPercent,
      tax: invoiceFigures.tax,
      cgst: invoiceFigures.cgst,
      sgst: invoiceFigures.sgst,
      total: invoiceFigures.total
    },
    { gstPercent: 5, tax: 5, cgst: 2.5, sgst: 2.5, total: 105 }
  );
});

test('CURRENT BEHAVIOUR: invoice matches the billed WELCOME cap and post-discount GST', function () {
  const item = {
    id: 1,
    sku: 'RICE-1',
    name: 'Rice',
    hsn: '1006',
    price: 3000,
    qty: 1
  };
  const order = makeStoredStyleOrder(item, 'WELCOME');
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: order.discount, tax: order.tax, total: order.total },
    { discount: 100, tax: 145, total: 3045 }
  );
  assert.deepEqual(
    {
      discount: invoiceFigures.discount,
      tax: invoiceFigures.tax,
      gstPercent: invoiceFigures.rows[0].gstPercent,
      lineTax: invoiceFigures.rows[0].lineTax,
      total: invoiceFigures.total
    },
    { discount: 100, tax: 145, gstPercent: 5, lineTax: 145, total: 3045 }
  );
});

test('CURRENT BEHAVIOUR: GST reconciliation matches the stored billed tax and total', function () {
  const item = {
    id: 1,
    sku: 'RICE-1',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  };
  const order = makeStoredStyleOrder(item);
  const result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].ledgerTax, 5);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].ledgerTotal, 105);
  assert.equal(result.rows[0].invoiceTotal, 105);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});

test('CURRENT BEHAVIOUR: invoice omits a line row when pricing returns no corresponding breakdown', function () {
  const item = {
    id: 1,
    sku: 'RICE-1',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  };
  const order = makeStoredStyleOrder(item);
  const originalComputeTotals = pricing.computeTotals;

  pricing.computeTotals = function (items, coupon) {
    const totals = originalComputeTotals(items, coupon);
    totals.lines = [];
    return totals;
  };

  try {
    const figures = invoice.computeInvoiceFigures(order);
    assert.equal(figures.total, order.total);
    assert.deepEqual(figures.rows, []);
  } finally {
    pricing.computeTotals = originalComputeTotals;
  }
});
