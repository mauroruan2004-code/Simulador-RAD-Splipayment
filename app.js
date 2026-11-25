(function () {
  "use strict";

  const { parseNumber, toCents, resolveOperation, calculate, ValidationError } = window.FrangoForteCalculator;
  const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const decimalFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fields = ["total", "ibs", "cbs", "base", "rateIbs", "rateCbs", "reduction", "priorIbs", "priorCbs"];
  const state = { route: "split", pricing: "rates", stage: 0, presenting: false };

  const routeNames = {
    split: "Split Payment padrão",
    rad: "RAD — recolhimento pelo adquirente",
    supplier: "Pagamento pelo fornecedor",
  };
  const routeDescriptions = {
    split: "O meio de pagamento separa o saldo do IBS/CBS. A parcela já extinta não é recolhida novamente.",
    rad: "O adquirente recolhe o saldo do IBS/CBS por instrumento sem split. O abatimento no repasse depende de acordo entre as partes.",
    supplier: "O adquirente paga a nota ao fornecedor. O crédito novo aguarda a confirmação da extinção do débito da operação.",
  };
  const presets = {
    taxed: { route: "split", reduction: 0, priorShare: 0 },
    rad: { route: "rad", reduction: 0, priorShare: 0 },
    radFull: { route: "rad", reduction: 0, priorShare: 0, adjustPayment: false },
    bird: { route: "split", reduction: 60, priorShare: 0 },
    partial: { route: "split", reduction: 0, priorShare: 0.5 },
    extinct: { route: "split", reduction: 0, priorShare: 1 },
    pending: { route: "supplier", reduction: 0, priorShare: 0, stage: 1 },
    zero: { route: "split", reduction: 100, priorShare: 0 },
  };

  function element(id) {
    return document.getElementById(id);
  }

  function text(id, value) {
    element(id).textContent = value;
  }

  function money(cents) {
    return moneyFormatter.format(cents / 100);
  }

  function putAmount(id, cents) {
    element(id).value = decimalFormatter.format(cents / 100);
  }

  function readOperation({ ignorePrevious = false } = {}) {
    return resolveOperation({
      route: state.route,
      pricing: state.pricing,
      stage: state.stage,
      total: toCents(element("total").value),
      ibs: toCents(element("ibs").value),
      cbs: toCents(element("cbs").value),
      base: toCents(element("base").value),
      ibsRate: parseNumber(element("rateIbs").value),
      cbsRate: parseNumber(element("rateCbs").value),
      reduction: parseNumber(element("reduction").value),
      priorIbs: ignorePrevious ? 0 : toCents(element("priorIbs").value),
      priorCbs: ignorePrevious ? 0 : toCents(element("priorCbs").value),
      eligible: element("eligible").checked,
      adjustPayment: element("radAdjust").checked,
    });
  }

  function restart({ edited = false } = {}) {
    state.stage = 0;
    if (edited) element("example").value = "custom";
    render();
  }

  function applyPreset(name) {
    const preset = presets[name];
    if (!preset) return;

    state.route = preset.route;
    state.pricing = "rates";
    state.stage = preset.stage ?? 0;
    element("eligible").checked = true;
    element("radAdjust").checked = preset.adjustPayment !== false;
    element("base").value = "10.000,00";
    element("rateIbs").value = "1,00";
    element("rateCbs").value = "11,30";
    element("reduction").value = decimalFormatter.format(preset.reduction);
    putAmount("priorIbs", 0);
    putAmount("priorCbs", 0);

    const operation = readOperation();
    putAmount("total", operation.total);
    putAmount("ibs", operation.ibs);
    putAmount("cbs", operation.cbs);
    putAmount("priorIbs", Math.round(operation.ibs * preset.priorShare));
    putAmount("priorCbs", Math.round(operation.cbs * preset.priorShare));
    element("example").value = name;
    render();
  }

  function renderControls() {
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.route === state.route));
    });
    document.querySelectorAll("[data-pricing]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.pricing === state.pricing));
    });
    document.querySelectorAll("[data-step]").forEach((item) => {
      const step = Number(item.dataset.step);
      item.classList.toggle("active", step === state.stage);
      item.classList.toggle("completed", step < state.stage);
      if (step === state.stage) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });

    element("documentFields").hidden = state.pricing !== "document";
    element("ratesFields").hidden = state.pricing !== "rates";
    element("radControls").hidden = state.route !== "rad";
    text("routeHelp", routeDescriptions[state.route]);
    text("stageBadge", ["Antes do pagamento", "Pagamento simulado", "Extinção confirmada"][state.stage]);
    element("stageBadge").className = `badge ${state.stage === 2 ? "success" : "neutral"}`;
    text("flowTitle", state.stage === 0 ? "Previsão dos fluxos" : "Fluxos da simulação");
    text("nextBtn", state.stage === 0 ? "Simular pagamento" : state.stage === 1
      ? state.route === "supplier" ? "Simular recolhimento e confirmar" : "Confirmar extinção e crédito"
      : "Simulação concluída");
  }

  function renderInvalid(error) {
    element("error").hidden = false;
    text("error", error instanceof ValidationError ? error.message : "Não foi possível calcular. Confira os dados da operação.");
    for (const id of error.fields ?? []) {
      element(id).setAttribute("aria-invalid", "true");
      element(id).setAttribute("aria-describedby", "error");
    }

    const outputs = [
      "buyerCash", "supplierCash", "fiscCash", "creditTotal",
      "taxIbs", "doneIbs", "newIbs", "leftIbs",
      "taxCbs", "doneCbs", "newCbs", "leftCbs",
    ];
    outputs.forEach((id) => text(id, "—"));
    text("eventNote", "Revise os campos da operação para continuar a simulação.");
    text("creditDetail", "Resultado indisponível enquanto houver dados inválidos.");
    text("debtBadge", "Confira os valores");
    text("cashNote", "Os resultados serão atualizados após a correção dos dados.");
    text("effective", "");
    text("printSummary", "Operação com dados inválidos. Resultado indisponível.");
    element("debtBadge").className = "badge";
    element("creditBox").className = "credit pending";
    element("comparisonBody").replaceChildren();
    element("nextBtn").disabled = true;
    if (!(error instanceof ValidationError)) console.error(error);
  }

  function describeEvent(operation, result) {
    let message;
    if (result.taxTotal === 0) {
      message = "Compra com alíquota zero: não há IBS/CBS a recolher nem crédito regular desta entrada.";
    } else if (result.remaining === 0) {
      message = "Todo o débito informado já está extinto. Não há novo recolhimento. O crédito é contado uma única vez.";
    } else if (state.stage === 0) {
      if (state.route === "split") {
        message = `A consulta simulada identifica ${money(result.remaining)} ainda não extintos. Este é o valor a segregar no pagamento.`;
      } else if (state.route === "rad") {
        message = `O adquirente pode recolher ${money(result.remaining)} de saldo. O ajuste no repasse ao fornecedor depende do acordo comercial.`;
      } else {
        message = "Pagar a nota não confirma a extinção do IBS/CBS. O crédito anterior permanece; o saldo novo aguarda a extinção.";
      }
    } else if (state.stage === 1) {
      message = state.route === "supplier"
        ? `A nota foi paga ao fornecedor. Ainda faltam ${money(result.remaining)} de débitos a extinguir. Avance para simular o recolhimento dele.`
        : `Pagamento simulado, com ${money(result.remaining)} destinados ao Fisco. Avance para confirmar a extinção e mostrar o crédito.`;
    } else {
      message = state.route === "supplier"
        ? "O recolhimento do fornecedor foi simulado e vinculado à operação. O crédito agora considera os débitos extintos."
        : "Extinção confirmada na simulação. As parcelas anterior e nova compõem um único crédito por tributo.";
    }
    if (!operation.eligible) {
      message += " A opção de documento idôneo e aquisição creditável está desmarcada; o crédito permanece zero.";
    }
    return message;
  }

  function renderCash(operation, result) {
    const supplierPays = state.route === "supplier";
    text("buyerCash", money(result.buyerPayment));
    text("supplierCash", money(result.supplierReceipt));
    text("fiscCash", money(result.fiscalPayment));
    text("fiscalConnector", supplierPays ? "→" : "+");
    text("supplierDetail", state.route === "split" ? "Líquido da segregação" : supplierPays
      ? "Recebimento bruto da nota" : operation.adjustPayment ? "Repasse com ajuste acordado" : "Nota integral, sem abatimento");
    text("fiscLabel", supplierPays
      ? state.stage < 2 ? "Fisco recebe neste passo" : "Fornecedor recolhe ao Fisco"
      : state.stage === 0 ? "Fisco receberá" : "Fisco recebe neste passo");
    text("fiscDetail", supplierPays
      ? state.stage < 2 ? "Recolhimento ainda não simulado" : "Saída do caixa do fornecedor"
      : "Saldo de IBS e CBS da operação");

    let note = supplierPays
      ? "O recolhimento do fornecedor não aumenta o desembolso da Frango Forte."
      : state.route === "rad" && !operation.adjustPayment
        ? "Sem ajuste comercial: nota integral + RAD. Isso não cria crédito em dobro."
        : "Repasse ao fornecedor + novo recolhimento = desembolso do adquirente.";
    const previous = operation.priorIbs + operation.priorCbs;
    if (previous > 0) note += ` Já extinto antes desta etapa: ${money(previous)}.`;
    text("cashNote", note);
    text("eventNote", describeEvent(operation, result));
  }

  function renderCredit(operation, result) {
    const taxes = [
      ["Ibs", operation.ibs, operation.priorIbs, result.newIbs, result.pendingIbs],
      ["Cbs", operation.cbs, operation.priorCbs, result.newCbs, result.pendingCbs],
    ];
    for (const [suffix, due, previous, current, pending] of taxes) {
      text(`tax${suffix}`, money(due));
      text(`done${suffix}`, money(previous));
      text(`new${suffix}`, money(current));
      text(`left${suffix}`, money(pending));
    }

    const pending = result.pendingIbs + result.pendingCbs;
    text("debtBadge", result.taxTotal === 0 ? "Sem débito na operação" : pending === 0
      ? "Débito totalmente extinto" : pending === result.taxTotal ? "Débito pendente" : "Débito parcialmente extinto");
    element("debtBadge").className = `badge ${pending === 0 ? "success" : ""}`;
    text("creditTotal", money(result.creditTotal));
    text("creditDetail", !operation.eligible ? "Aquisição sem os requisitos selecionados."
      : result.taxTotal === 0 ? "Compra a zero não gera crédito regular."
        : `IBS: ${money(result.creditIbs)} · CBS: ${money(result.creditCbs)} · ${pending > 0 ? "Saldo aguardando extinção." : "Contabilizados uma única vez."}`);
    element("creditBox").className = `credit${result.creditTotal === 0 ? " pending" : ""}`;
  }

  function renderComparison(operation) {
    const body = element("comparisonBody");
    body.replaceChildren();
    const comparisons = [
      { route: "split", adjustPayment: true, label: "Split Payment padrão" },
      { route: "rad", adjustPayment: true, label: "RAD com abatimento acordado" },
      { route: "rad", adjustPayment: false, label: "RAD sem abatimento" },
      { route: "supplier", adjustPayment: true, label: "Fornecedor recolhe" },
    ];
    for (const scenario of comparisons) {
      const result = calculate({ ...operation, ...scenario, stage: 2 });
      const row = document.createElement("tr");
      const values = [scenario.label, money(result.buyerPayment), money(result.supplierReceipt),
        `${scenario.route === "supplier" ? "Fornecedor: " : ""}${money(result.fiscalPayment)}`, money(result.creditTotal)];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
  }

  function render() {
    renderControls();
    element("error").hidden = true;
    for (const id of fields) {
      element(id).removeAttribute("aria-invalid");
      element(id).removeAttribute("aria-describedby");
    }

    try {
      const operation = readOperation();
      const result = calculate(operation);
      renderCash(operation, result);
      renderCredit(operation, result);
      renderComparison(operation);
      text("effective", state.pricing === "rates"
        ? `Alíquotas efetivas: IBS ${decimalFormatter.format(operation.ibsRate * (1 - operation.reduction / 100))}% · CBS ${decimalFormatter.format(operation.cbsRate * (1 - operation.reduction / 100))}%`
        : "Valores do documento informados pelo apresentador.");
      text("printSummary", `${routeNames[state.route]} | Total: ${money(operation.total)} | IBS: ${money(operation.ibs)} | CBS: ${money(operation.cbs)} | Etapa: ${state.stage + 1}`);
      element("nextBtn").disabled = state.stage === 2;
    } catch (error) {
      renderInvalid(error);
    }
  }

  function advance() {
    try {
      readOperation();
      state.stage = Math.min(2, state.stage + 1);
      render();
    } catch (error) {
      renderInvalid(error);
    }
  }

  function setPresentation(active) {
    state.presenting = active;
    document.body.classList.toggle("presentation", active);
    text("presentBtn", active ? "Sair da apresentação" : "Modo apresentação");
    element("presentBtn").setAttribute("aria-pressed", String(active));
  }

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      state.route = button.dataset.route;
      restart({ edited: true });
    });
  });
  document.querySelectorAll("[data-pricing]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.pricing === "document") {
        try {
          const operation = readOperation();
          putAmount("total", operation.total);
          putAmount("ibs", operation.ibs);
          putAmount("cbs", operation.cbs);
        } catch { /* Permite corrigir a operação diretamente pelos valores da nota. */ }
      }
      state.pricing = button.dataset.pricing;
      restart({ edited: true });
    });
  });
  for (const id of fields) {
    const input = element(id);
    input.addEventListener("input", () => restart({ edited: true }));
    input.addEventListener("blur", () => {
      const value = parseNumber(input.value);
      if (Number.isFinite(value) && value >= 0) {
        input.value = id.startsWith("rate") ? decimalFormatter.format(value)
          : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
      }
      render();
    });
  }
  document.querySelectorAll("[data-prior]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const operation = readOperation({ ignorePrevious: true });
        const share = Number(button.dataset.prior);
        putAmount("priorIbs", Math.round(operation.ibs * share));
        putAmount("priorCbs", Math.round(operation.cbs * share));
        restart({ edited: true });
      } catch (error) {
        renderInvalid(error);
      }
    });
  });

  element("example").addEventListener("change", (event) => applyPreset(event.target.value));
  element("eligible").addEventListener("change", () => restart({ edited: true }));
  element("radAdjust").addEventListener("change", () => restart({ edited: true }));
  element("restartBtn").addEventListener("click", () => restart());
  element("nextBtn").addEventListener("click", advance);
  element("printBtn").addEventListener("click", () => window.print());
  element("presentBtn").addEventListener("click", () => {
    setPresentation(!state.presenting);
    if (state.presenting && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!state.presenting && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.presenting) setPresentation(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const focused = document.activeElement;
    if (focused?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(focused?.tagName)) return;
    if (event.key === "ArrowRight" && state.stage < 2) {
      event.preventDefault();
      advance();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      state.stage = Math.max(0, state.stage - 1);
      render();
    }
  });

  applyPreset("taxed");
})();
