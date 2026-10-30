# Money calculations

Everything that turns time, invoices and expenses into money and tax lives
here, as plain functions with no screen or database code. Each file has a
matching `.test.ts` file.

All tax figures are **estimates, not tax advice**. The app must label them that way.

| File | What it does |
|---|---|
| `taxRates.ts` | Income Tax and Class 4 NI rates, one block per tax year. **Update this each April.** |
| `tax.ts` | Income Tax, Class 4 NI, and the tax on freelance profit on top of a salary |
| `yearFigures.ts` | A tax year's income, expenses, profit and take-home (cash basis), projection, tax pot, MTD quarters |
| `goal.ts` | Earnings goal pace, and the income needed to reach a take-home goal |
| `billing.ts` | Retainer usage, the value of a month's work, what's still to invoice, effective hourly rate |
| `invoice.ts` | Line amounts, VAT, totals, due dates, filling in a new invoice from tracked time |
| `duration.ts` | Reading "1:30", "1.5" or "90m" from the time box |
| `dates.ts` | Tax years (6 April to 5 April), months and MTD quarters |
| `money.ts` | Rounding to the penny |

## Rules the calculations follow

- **Cash basis.** Income counts on the date an invoice is paid, excluding VAT. Expenses count on their date.
- **Tax on top of other income.** A salary uses the Personal Allowance and lower bands first.
- **Retainers.** The fee applies from the client's start date. One fee per month, however many invoices you send.
  Overage counts all billable hours in the month minus overage already invoiced.
- **Fixed fees.** The fee is spread across all hours tracked for the project, to give a fair hourly rate.
- **Projections** wait until 61 days into the tax year, because earlier figures swing too much.

## Adding a new tax year

1. In `taxRates.ts`, copy the latest block, change `taxYear`, and update any changed figures from
   https://www.gov.uk/income-tax-rates and https://www.gov.uk/self-employed-national-insurance-rates.
2. Run `npm test`.

## Not covered (yet)

Scottish Income Tax bands, student loan repayments, pension contributions, Gift Aid, Marriage
Allowance, savings and dividend income, loss relief, and voluntary Class 2 NI.
