(function (root) {
  "use strict";

  const MAX_AMOUNT = 100_000_000_000_000;
  const ROUTES = ["split", "rad", "supplier"];

  class ValidationError extends Error {
    constructor(message, fields = []) {
      super(message);
      this.name = "ValidationError";
      this.fields = fields;
    }
  }

  function parseNumber(value) {
    let text = String(value).trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
    if (!text || !/^[0-9.,]+$/.test(text)) return NaN;

    if (text.includes(",")) {
      if (!/^(\d+|\d{1,3}(\.\d{3})+),\d+$/.test(text)) return NaN;
      text = text.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, "");
    } else if (!/^\d+(\.\d+)?$/.test(text)) {
      return NaN;
    }

    return Number(text);
  }

  function toCents(value) {
    const amount = parseNumber(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
  }

  function checkAmount(amount, field) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
      throw new ValidationError(
        "Informe um valor válido entre zero e R$ 1 trilhão.",
        [field],
      );
    }
  }

  function checkPercentage(value, field) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ValidationError("Informe um percentual entre 0 e 100.", [field]);
    }
  }

  function resolveOperation(input) {
    const operation = { ...input };

    if (!ROUTES.includes(operation.route) || ![0, 1, 2].includes(operation.stage)) {
      throw new ValidationError("Selecione uma modalidade e uma etapa válidas.");
    }
    if (typeof operation.eligible !== "boolean" || typeof operation.adjustPayment !== "boolean") {
      throw new ValidationError("Confira as opções de crédito e de abatimento.");
    }

    if (operation.pricing === "rates") {
      checkAmount(operation.base, "base");
      if (operation.base === 0) {
        throw new ValidationError("A base deve ser maior que zero.", ["base"]);
      }
      checkPercentage(operation.ibsRate, "rateIbs");
      checkPercentage(operation.cbsRate, "rateCbs");
      checkPercentage(operation.reduction, "reduction");

      const taxableShare = 1 - operation.reduction / 100;
      operation.ibs = Math.round(operation.base * operation.ibsRate / 100 * taxableShare);
      operation.cbs = Math.round(operation.base * operation.cbsRate / 100 * taxableShare);
      operation.total = operation.base + operation.ibs + operation.cbs;
    } else if (operation.pricing !== "document") {
      throw new ValidationError("Selecione como deseja informar a operação.");
    }

    for (const field of ["total", "ibs", "cbs", "priorIbs", "priorCbs"]) {
      checkAmount(operation[field], field);
    }
    if (operation.total === 0) {
      throw new ValidationError("O total da operação deve ser maior que zero.", ["total"]);
    }
    if (operation.ibs + operation.cbs > operation.total) {
      throw new ValidationError(
        "A soma do IBS e da CBS não pode superar o total da operação.",
        ["total", "ibs", "cbs"],
      );
    }
    if (operation.priorIbs > operation.ibs) {
      throw new ValidationError("O IBS já extinto não pode superar o IBS devido.", ["priorIbs"]);
    }
    if (operation.priorCbs > operation.cbs) {
      throw new ValidationError("A CBS já extinta não pode superar a CBS devida.", ["priorCbs"]);
    }

    return operation;
  }

  // Valores em centavos. IBS e CBS são apurados separadamente.
  function calculate(operation) {
    const remainingIbs = operation.ibs - operation.priorIbs;
    const remainingCbs = operation.cbs - operation.priorCbs;
    const remaining = remainingIbs + remainingCbs;
    const confirmed = operation.stage === 2;
    const newIbs = confirmed ? remainingIbs : 0;
    const newCbs = confirmed ? remainingCbs : 0;
    const deductFromSupplier = operation.route === "split"
      || (operation.route === "rad" && operation.adjustPayment);

    const buyerPayment = operation.total
      + (operation.route === "rad" && !operation.adjustPayment ? remaining : 0);
    const supplierReceipt = operation.total - (deductFromSupplier ? remaining : 0);
    const fiscalPayment = operation.route === "supplier" && !confirmed ? 0 : remaining;
    const creditIbs = operation.eligible ? operation.priorIbs + newIbs : 0;
    const creditCbs = operation.eligible ? operation.priorCbs + newCbs : 0;

    return {
      taxTotal: operation.ibs + operation.cbs,
      remainingIbs,
      remainingCbs,
      remaining,
      newIbs,
      newCbs,
      pendingIbs: remainingIbs - newIbs,
      pendingCbs: remainingCbs - newCbs,
      buyerPayment,
      supplierReceipt,
      fiscalPayment,
      creditIbs,
      creditCbs,
      creditTotal: creditIbs + creditCbs,
    };
  }

  const calculator = Object.freeze({
    ValidationError,
    parseNumber,
    toCents,
    resolveOperation,
    calculate,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = calculator;
  } else {
    root.FrangoForteCalculator = calculator;
  }
})(globalThis);
