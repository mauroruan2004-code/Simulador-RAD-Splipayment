const test = require("node:test");
const assert = require("node:assert/strict");
const { parseNumber, toCents, resolveOperation, calculate, ValidationError } = require("../assets/js/calculator.js");

function operation(changes = {}) {
  return resolveOperation({
    route: "split",
    pricing: "rates",
    stage: 0,
    base: 1_000_000,
    ibsRate: 1,
    cbsRate: 11.3,
    reduction: 0,
    priorIbs: 0,
    priorCbs: 0,
    eligible: true,
    adjustPayment: true,
    ...changes,
  });
}

test("valores brasileiros são convertidos para centavos", () => {
  assert.equal(parseNumber("R$ 1.234,56"), 1234.56);
  assert.equal(parseNumber("1.000"), 1000);
  assert.equal(parseNumber("1234.56"), 1234.56);
  assert.equal(toCents("0,01"), 1);
  for (const invalid of ["", "-1", "1.23,00", "1,2,3", "abc", "Infinity"]) {
    assert.equal(Number.isNaN(parseNumber(invalid)), true, invalid);
  }
});

test("IBS de 1% e CBS de 11,30% compõem o total inicial", () => {
  const input = operation();
  assert.equal(input.ibs, 10_000);
  assert.equal(input.cbs, 113_000);
  assert.equal(input.total, 1_123_000);
  assert.equal(calculate(input).creditTotal, 0);
});

test("alterar as alíquotas recalcula os dois tributos e o total", () => {
  const input = operation({ ibsRate: 2.75, cbsRate: 9.25 });
  assert.equal(input.ibs, 27_500);
  assert.equal(input.cbs, 92_500);
  assert.equal(input.total, 1_120_000);
});

test("redução de 60% aplica 40% das alíquotas informadas", () => {
  const input = operation({ reduction: 60, stage: 2 });
  assert.equal(input.ibs, 4000);
  assert.equal(input.cbs, 45_200);
  assert.equal(input.total, 1_049_200);
  assert.equal(calculate(input).creditTotal, 49_200);
});

test("redução integral não gera recolhimento nem crédito regular", () => {
  const result = calculate(operation({ reduction: 100, stage: 2 }));
  assert.equal(result.taxTotal, 0);
  assert.equal(result.fiscalPayment, 0);
  assert.equal(result.creditTotal, 0);
  assert.equal(result.buyerPayment, 1_000_000);
});

for (const stage of [0, 1, 2]) {
  test(`Split na etapa ${stage}: o novo crédito exige confirmação`, () => {
    const result = calculate(operation({ stage }));
    assert.equal(result.buyerPayment, 1_123_000);
    assert.equal(result.supplierReceipt, 1_000_000);
    assert.equal(result.fiscalPayment, 123_000);
    assert.equal(result.creditTotal, stage === 2 ? 123_000 : 0);
    assert.equal(result.pendingIbs + result.pendingCbs, stage === 2 ? 0 : 123_000);
  });
}

for (const adjustPayment of [true, false]) {
  test(`RAD ${adjustPayment ? "com" : "sem"} abatimento`, () => {
    const result = calculate(operation({ route: "rad", adjustPayment, stage: 2 }));
    assert.equal(result.buyerPayment, adjustPayment ? 1_123_000 : 1_246_000);
    assert.equal(result.supplierReceipt, adjustPayment ? 1_000_000 : 1_123_000);
    assert.equal(result.fiscalPayment, 123_000);
    assert.equal(result.creditTotal, 123_000);
  });
}

test("o recolhimento do fornecedor não aumenta a saída do adquirente", () => {
  const pending = calculate(operation({ route: "supplier", stage: 1 }));
  const confirmed = calculate(operation({ route: "supplier", stage: 2 }));
  assert.equal(pending.buyerPayment, 1_123_000);
  assert.equal(confirmed.buyerPayment, pending.buyerPayment);
  assert.equal(pending.fiscalPayment, 0);
  assert.equal(pending.creditTotal, 0);
  assert.equal(confirmed.fiscalPayment, 123_000);
  assert.equal(confirmed.creditTotal, 123_000);
});

test("extinção parcial reduz apenas o recolhimento adicional", () => {
  const input = operation({ priorIbs: 5000, priorCbs: 56_500 });
  const initial = calculate(input);
  const final = calculate({ ...input, stage: 2 });
  assert.equal(initial.creditTotal, 61_500);
  assert.equal(initial.remaining, 61_500);
  assert.equal(initial.supplierReceipt, 1_061_500);
  assert.equal(final.creditTotal, 123_000);
  assert.equal(final.newIbs + final.newCbs, 61_500);
});

test("extinção integral não duplica crédito nem recolhimento", () => {
  const result = calculate(operation({ priorIbs: 10_000, priorCbs: 113_000, stage: 2 }));
  assert.equal(result.supplierReceipt, 1_123_000);
  assert.equal(result.fiscalPayment, 0);
  assert.equal(result.newIbs + result.newCbs, 0);
  assert.equal(result.creditTotal, 123_000);
});

test("aquisição não creditável mantém o débito e zera o crédito", () => {
  const result = calculate(operation({ eligible: false, stage: 2 }));
  assert.equal(result.taxTotal, 123_000);
  assert.equal(result.fiscalPayment, 123_000);
  assert.equal(result.creditTotal, 0);
});

test("valores da nota não são somados novamente ao total", () => {
  const input = operation({ pricing: "document", total: 1_000_000, ibs: 20_000, cbs: 80_000 });
  const result = calculate(input);
  assert.equal(input.total, 1_000_000);
  assert.equal(result.supplierReceipt, 900_000);
});

test("dados ausentes, negativos ou incoerentes são rejeitados", () => {
  const invalid = [
    { base: 0 }, { base: NaN }, { ibsRate: 101 }, { cbsRate: -1 }, { reduction: NaN },
    { priorIbs: 10_001 }, { priorCbs: 113_001 }, { priorIbs: -1 },
    { route: "other" }, { stage: 3 }, { eligible: undefined },
    { pricing: "document", total: 10, ibs: 11, cbs: 0 },
    { pricing: "document", total: 0, ibs: 0, cbs: 0 },
  ];
  invalid.forEach((input) => assert.throws(() => operation(input), ValidationError));
});

test("a extinção de CBS não pode encobrir IBS anterior excessivo", () => {
  assert.throws(() => operation({ priorIbs: 10_001, priorCbs: 0 }), /IBS já extinto/);
});

test("arredondamento preserva centavos e fecha o fluxo das modalidades", () => {
  for (let amount = 1; amount <= 2000; amount += 37) {
    for (const route of ["split", "rad", "supplier"]) {
      for (const adjustPayment of [true, false]) {
        const input = operation({ base: amount, route, adjustPayment, stage: 2 });
        const result = calculate(input);
        assert.equal(Number.isSafeInteger(result.creditTotal), true);
        assert.equal(result.creditTotal, input.ibs + input.cbs);
        assert.equal(result.pendingIbs + result.pendingCbs, 0);
        if (route !== "supplier") {
          assert.equal(result.buyerPayment, result.supplierReceipt + result.fiscalPayment);
        } else {
          assert.equal(result.buyerPayment, input.total);
        }
      }
    }
  }
});
