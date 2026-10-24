# 💎 Finance Manager — Gerenciador Financeiro Pessoal

Aplicativo web responsivo (PWA) para controlar entradas, saídas, orçamento, metas e contas recorrentes. Funciona no computador, tablet e celular, e pode ser instalado na tela inicial do celular. Funciona também offline.

## Como executar

Não precisa instalar nada além de um servidor estático simples:

```bash
# na pasta do projeto
python -m http.server 8080
# ou
npx serve .
```

Abra `http://localhost:8080`. Também é possível abrir o `index.html` direto no navegador (nesse modo o app não funciona offline nem instala no celular).

### Usar no celular
1. Publique a pasta em qualquer hospedagem estática com HTTPS (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
2. Abra o endereço no celular e toque em **Adicionar à tela inicial** (Android: menu ⋮ › Instalar app; iPhone: Compartilhar › Adicionar à Tela de Início).

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Dashboard** | Saldo total, receitas/despesas e saldo do mês, variação vs. mês anterior, gráfico Entradas x Saídas (6 meses), gastos por categoria, contas a vencer, resumo do orçamento, comparativo mensal e últimas movimentações |
| **Contas & Cartões** | Cadastro de contas (Nubank, Bradesco, Itaú, Inter...) por tipo: cartão de crédito, conta corrente, poupança, carteira ou investimentos. Mostra gastos do mês, saldo, valor em aberto e limite disponível por conta, além de um gráfico de gastos por conta |
| **Importar fatura (PDF)** | Envie (ou arraste) a fatura em PDF: o app reconhece data, descrição, valor, parcelas, estornos e pagamentos, sugere a categoria, detecta o banco e a conta, confere a soma com o total da fatura e marca duplicados. Você revisa e importa. Aceita PDFs com senha e permite desfazer a importação |
| **Entradas** | Cadastro, edição e exclusão de receitas; categorias (Salário, Freelance, Investimentos, Vendas, Outros); recorrente × eventual; busca e filtros |
| **Saídas** | Despesas com categoria, fixa × variável, pago × pendente (com destaque para vencidas), marcar como pago em um clique, busca e filtros |
| **Histórico** | Todas as movimentações com filtros por período, tipo, categoria e status, busca, ordenação por data/valor e exportação em PDF/Excel |
| **Orçamento & Metas** | Limite mensal por categoria, progresso e valor disponível, alertas em 80% e 100%; metas de economia com aportes, retiradas, prazo e valor mensal sugerido |
| **Recorrentes** | Receitas/despesas diárias, semanais, mensais ou anuais, com data final opcional, débito automático, pausa/retomada; os lançamentos são gerados automaticamente no vencimento |
| **Relatórios** | Mensal e anual: receitas x despesas, gastos por categoria (com variação), evolução do saldo, maiores despesas, resumo mês a mês; exportação em PDF e Excel |
| **Assistente** | Responde em português usando os seus dados: gastos do mês ou por categoria, maior categoria, economia, maiores gastos, dicas para reduzir despesas (regra 50/30/20, gastos acima da média), contas pendentes, orçamento, metas, comparação e previsão de fim de mês |
| **Notificações** | Sino com alertas de vencimento (7 dias) e de orçamento; notificações do sistema opcionais |
| **Configurações** | Perfil, tema claro/escuro, alterar senha, exportar PDF/Excel/CSV, backup e restauração em JSON, apagar dados, excluir conta |

## Segurança e armazenamento
- Cada usuário tem login com e-mail e senha. A senha nunca é armazenada: é usada no PBKDF2-SHA-256 (150 mil iterações, salt aleatório) para gerar um verificador e uma chave AES-GCM de 256 bits.
- Todas as movimentações são guardadas **criptografadas** no navegador (localStorage). Sem a senha, os dados não podem ser lidos, nem por outro usuário do mesmo dispositivo.
- O login é bloqueado por 60 s depois de 5 tentativas com senha errada.
- Os dados ficam no dispositivo. Para levá-los a outro aparelho, use **Configurações › Backup › Exportar/Importar**. Se a senha for esquecida, não é possível recuperar os dados, porque não existe servidor.

## Estrutura
```
index.html            estrutura e telas de login
css/styles.css        identidade visual, responsivo, tema escuro
js/utils.js           formatação R$ / DD/MM/AAAA, máscaras, helpers
js/store.js           contas, sessão e criptografia
js/finance.js         categorias, cálculos, orçamento, recorrências, vencimentos
js/exports.js         PDF (jsPDF), Excel (SheetJS), CSV, backup
js/assistant.js       assistente financeiro
js/app.js             rotas, telas, modais e eventos
sw.js, manifest       PWA / offline
vendor/               bibliotecas locais: Chart.js, jsPDF, AutoTable, SheetJS, Lucide, pdf.js
```

Atalho: tecle **N** para lançar uma nova transação.

## Importação de faturas — observações
- Funciona com PDFs **com texto** (os baixados pelo app/site do banco). PDFs escaneados ou fotos não são reconhecidos.
- O reconhecimento é genérico (linhas com data + descrição + valor), então funciona com a maioria dos bancos brasileiros. Como cada banco muda o layout de vez em quando, sempre revise a lista antes de importar.
- Pagamentos da fatura anterior e estornos vêm desmarcados, para não contar em dobro.
- O PDF é lido no próprio navegador: nada é enviado para servidores.
