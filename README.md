# Frango Forte — Simulador IBS e CBS

Calculadora para demonstrar o efeito do Split Payment, do recolhimento pelo adquirente (RAD) e do pagamento pelo fornecedor no caixa e nos créditos de uma compra.

A aplicação usa HTML, CSS e JavaScript. Não precisa de instalação, banco de dados ou processo de build.

## Abrir a calculadora

Abra `index.html` no navegador, mantendo a pasta `assets` ao lado dele. Os arquivos funcionam localmente e no GitHub Pages.

Os parâmetros iniciais são **IBS de 1%** e **CBS de 11,30%**, ambos editáveis. O modo inicial é **Por alíquotas**, com base de R$ 10.000,00 e redução zero:

| Resultado | Valor |
| --- | ---: |
| IBS | R$ 100,00 |
| CBS | R$ 1.130,00 |
| Total da operação | R$ 11.230,00 |
| Repasse ao fornecedor no Split | R$ 10.000,00 |
| Novo recolhimento | R$ 1.230,00 |
| Crédito após a confirmação, com aquisição creditável | R$ 1.230,00 |

Essas alíquotas são parâmetros da apresentação. O sistema não determina a tributação aplicável a cada produto ou período.

## Publicar no GitHub Pages

1. Crie um repositório ou abra o repositório em que deseja publicar.
2. Envie **o conteúdo desta pasta** para a raiz do repositório. O `index.html` deve ficar na raiz, com a pasta `assets` ao lado. Extraia o ZIP antes de enviar; não envie somente o ZIP.
3. Em **Settings → Pages**, selecione **Deploy from a branch**.
4. Escolha a branch **main** e a pasta **/(root)**. Clique em **Save**.
5. Aguarde a publicação. O endereço será informado na própria tela do Pages.

Use os caminhos relativos já presentes no projeto. Eles permitem hospedar a calculadora em um repositório de projeto, sem configurar domínio ou alterar caminhos de arquivos.

Referência: [Configurar a origem de publicação — GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Usar na apresentação

Escolha um exemplo e uma modalidade de recolhimento. Avance por **Documento → Pagamento → Extinção e crédito**. O botão **Reiniciar etapas** volta à primeira etapa sem apagar os valores.

- **Por alíquotas:** informe a base sem IBS/CBS, as duas alíquotas e a redução. Nos campos em %, digite `1,00` para 1% e `11,30` para 11,30%.
- **Valores da nota:** informe o total já incluindo IBS/CBS e os tributos devidos.
- **Débitos já extintos:** informe apenas valores confirmados e vinculados à mesma operação. Os botões Nenhum, 50% e 100% usam os tributos da compra atual.
- **RAD com abatimento:** o novo recolhimento é abatido do repasse mediante acordo comercial. Sem acordo, o desembolso é nota integral + RAD.
- **Modo apresentação:** amplia os resultados e oculta os campos de configuração. O seletor de exemplos continua disponível.
- As setas **←** e **→** percorrem as etapas quando o cursor está fora dos campos.
- **Imprimir cenário** abre a impressão do navegador, que também permite salvar em PDF.

Mudar valores reinicia as etapas e marca o exemplo como **Valores personalizados**. Selecionar outro exemplo restaura os parâmetros iniciais de 1% e 11,30% e os valores daquele exemplo.

## Organização

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Campos, resultados e conteúdo de apoio |
| `assets/css/styles.css` | Layout, responsividade, apresentação e impressão |
| `assets/js/calculator.js` | Conversão de valores, validação e cálculos em centavos |
| `assets/js/app.js` | Eventos, exemplos e atualização da interface |
| `assets/img/contalger.png` | Identidade visual |
| `tests/` | Testes do cálculo e da interação com os campos |
| `.github/workflows/tests.yml` | Execução dos testes no GitHub Actions |

## Testes

Com Node.js 20 ou superior:

```sh
npm test
```

Não há dependências para instalar. Os testes cobrem percentuais editáveis, redução, as modalidades de pagamento, extinção parcial/integral, elegibilidade do crédito e dados inválidos. Os testes de interface usam um DOM simulado; não substituem uma revisão visual em navegador.

## Premissas

Os exemplos usam dados fictícios, uma operação com pagamento integral e a regra geral de crédito. A confirmação da extinção é simulada. Não há conexão com sistemas fiscais, transmissão de obrigações ou realização de pagamentos.

O modelo não inclui parcelas, split simplificado, a exceção do art. 48, crédito presumido rural, Simples Nacional, combustíveis monofásicos, apuração mensal ou pedidos de ressarcimento. IBS e CBS são calculados separadamente.

Base normativa de referência: [LC 214/2025, texto atualizado](https://www2.camara.leg.br/legin/fed/leicom/2025/leicomplementar-214-16-janeiro-2025-796905-normaatualizada-pl.html), especialmente arts. 27, 32, 36, 47 a 52 e 137. Conteúdo de apoio revisto em 24/11/2026.
