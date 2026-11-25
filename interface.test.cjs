const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const calculator = require("../assets/js/calculator.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const formatMoney = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

class Element {
  constructor(tag = "div", attributes = "") {
    this.tagName = tag.toUpperCase();
    this.value = attributes.match(/value="([^"]*)"/)?.[1] ?? "";
    this.checked = /\bchecked\b/.test(attributes);
    this.hidden = /\bhidden\b/.test(attributes);
    this.dataset = {};
    for (const match of attributes.matchAll(/data-([a-z]+)="([^"]*)"/g)) this.dataset[match[1]] = match[2];
    this.attributes = {};
    this.children = [];
    this.events = {};
    this.textContent = "";
    this.className = attributes.match(/class="([^"]*)"/)?.[1] ?? "";
    this.classList = {
      toggle: (name, active) => {
        const classes = new Set(this.className.split(" "));
        if (active) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(" ");
      },
    };
  }
  addEventListener(name, callback) { (this.events[name] ??= []).push(callback); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  replaceChildren() { this.children = []; }
  append(child) { this.children.push(child); }
  fire(name, extra = {}) {
    for (const callback of this.events[name] ?? []) callback({ target: this, preventDefault() {}, ...extra });
  }
  click() { if (!this.disabled) this.fire("click"); }
}

function setup() {
  const elements = [];
  const byId = {};
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)) {
    const item = new Element(match[1], match[2]);
    elements.push(item);
    const id = match[2].match(/\bid="([^"]*)"/)?.[1];
    if (id) byId[id] = item;
  }
  const document = {
    body: elements.find((item) => item.tagName === "BODY"),
    activeElement: { tagName: "BODY" },
    documentElement: {},
    events: {},
    getElementById: (id) => { assert.ok(byId[id], `Elemento ausente: ${id}`); return byId[id]; },
    querySelectorAll: (selector) => {
      const key = selector.match(/^\[data-([a-z]+)\]$/)?.[1];
      assert.ok(key, `Seletor não suportado no teste: ${selector}`);
      return elements.filter((item) => item.dataset[key] !== undefined);
    },
    createElement: (tag) => new Element(tag),
    addEventListener(name, callback) { (this.events[name] ??= []).push(callback); },
  };
  const window = { FrangoForteCalculator: calculator, print() {} };
  vm.runInNewContext(app, { document, window, Intl, Number, String, Math, console });
  return {
    nodes: byId,
    document,
    choose(name) { byId.example.value = name; byId.example.fire("change"); },
    edit(id, value) { byId[id].value = value; byId[id].fire("input"); },
    route(name) { elements.find((item) => item.dataset.route === name).click(); },
    pricing(name) { elements.find((item) => item.dataset.pricing === name).click(); },
    prior(share) { elements.find((item) => item.dataset.prior === String(share)).click(); },
    next() { byId.nextBtn.click(); },
  };
}

test("a página começa por alíquotas e permite editar os percentuais", () => {
  const ui = setup();
  assert.equal(ui.nodes.rateIbs.value, "1,00");
  assert.equal(ui.nodes.rateCbs.value, "11,30");
  assert.equal(ui.nodes.ratesFields.hidden, false);
  assert.equal(ui.nodes.buyerCash.textContent, formatMoney(11230));
  ui.edit("rateIbs", "2,00");
  ui.edit("rateCbs", "12,00");
  assert.equal(ui.nodes.buyerCash.textContent, formatMoney(11400));
  assert.equal(ui.nodes.example.value, "custom");
  ui.next();
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
  ui.next();
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(1400));
});

for (const [preset, total, supplier, fiscal, credit] of [
  ["taxed", 11230, 10000, 1230, 1230],
  ["rad", 11230, 10000, 1230, 1230],
  ["radFull", 12460, 11230, 1230, 1230],
  ["bird", 10492, 10000, 492, 492],
  ["partial", 11230, 10615, 615, 1230],
  ["extinct", 11230, 11230, 0, 1230],
  ["pending", 11230, 11230, 1230, 1230],
  ["zero", 10000, 10000, 0, 0],
]) {
  test(`o exemplo ${preset} carrega os valores e conclui o crédito`, () => {
    const ui = setup();
    ui.choose(preset);
    ui.next();
    ui.next();
    assert.equal(ui.nodes.buyerCash.textContent, formatMoney(total));
    assert.equal(ui.nodes.supplierCash.textContent, formatMoney(supplier));
    assert.equal(ui.nodes.fiscCash.textContent, formatMoney(fiscal));
    assert.equal(ui.nodes.creditTotal.textContent, formatMoney(credit));
    assert.equal(ui.nodes.nextBtn.disabled, true);
    assert.equal(ui.nodes.comparisonBody.children.length, 4);
  });
}

test("erro apaga resultados anteriores e se recupera após a correção", () => {
  const ui = setup();
  ui.next();
  ui.next();
  ui.edit("priorIbs", "101,00");
  assert.equal(ui.nodes.error.hidden, false);
  assert.equal(ui.nodes.priorIbs.attributes["aria-invalid"], "true");
  assert.equal(ui.nodes.creditTotal.textContent, "—");
  assert.equal(ui.nodes.buyerCash.textContent, "—");
  assert.equal(ui.nodes.comparisonBody.children.length, 0);
  assert.equal(ui.nodes.nextBtn.disabled, true);
  ui.edit("priorIbs", "0,00");
  assert.equal(ui.nodes.error.hidden, true);
  assert.equal(ui.nodes.nextBtn.disabled, false);
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
  assert.equal(ui.nodes.comparisonBody.children.length, 4);
});

test("os atalhos de extinção usam os valores e as alíquotas atuais", () => {
  const ui = setup();
  ui.edit("rateCbs", "10,00");
  ui.prior(0.5);
  assert.equal(ui.nodes.priorIbs.value, "50,00");
  assert.equal(ui.nodes.priorCbs.value, "500,00");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(550));
  ui.prior(1);
  assert.equal(ui.nodes.fiscCash.textContent, formatMoney(0));
  ui.prior(0);
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
});

test("trocar para valores da nota preserva os tributos calculados", () => {
  const ui = setup();
  ui.edit("rateIbs", "3,00");
  ui.pricing("document");
  assert.equal(ui.nodes.total.value, "11.430,00");
  assert.equal(ui.nodes.ibs.value, "300,00");
  assert.equal(ui.nodes.cbs.value, "1.130,00");
  assert.equal(ui.nodes.documentFields.hidden, false);
  ui.edit("total", "20.000,00");
  assert.equal(ui.nodes.buyerCash.textContent, formatMoney(20000));
});

test("apresentação e reinício preservam os campos e os percentuais", () => {
  const ui = setup();
  ui.edit("rateIbs", "4,00");
  ui.nodes.presentBtn.click();
  assert.match(ui.document.body.className, /presentation/);
  ui.next();
  ui.next();
  ui.nodes.restartBtn.click();
  assert.equal(ui.nodes.rateIbs.value, "4,00");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
  ui.nodes.presentBtn.click();
  assert.equal(ui.document.body.className.includes("presentation"), false);
});

test("editar requisitos do crédito e trocar modalidade reinicia as etapas", () => {
  const ui = setup();
  ui.next();
  ui.next();
  ui.nodes.eligible.checked = false;
  ui.nodes.eligible.fire("change");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
  ui.route("rad");
  ui.nodes.radAdjust.checked = false;
  ui.nodes.radAdjust.fire("change");
  assert.equal(ui.nodes.buyerCash.textContent, formatMoney(12460));
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
});

test("as setas navegam nas etapas e respeitam o foco nos campos", () => {
  const ui = setup();
  const press = (key) => {
    for (const callback of ui.document.events.keydown) callback({ key, preventDefault() {} });
  };
  press("ArrowRight");
  press("ArrowRight");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(1230));
  press("ArrowLeft");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
  ui.document.activeElement = ui.nodes.rateIbs;
  press("ArrowRight");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(0));
  ui.document.activeElement = { tagName: "BODY" };
  press("ArrowRight");
  assert.equal(ui.nodes.creditTotal.textContent, formatMoney(1230));
});

test("recursos estáticos usam caminhos relativos e IDs únicos", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(html.includes("walkthrough"), false);
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) {
    assert.equal(fs.existsSync(path.join(root, match[1])), true, match[1]);
  }
  assert.equal(/<script[^>]+src="https?:/.test(html), false);
});
