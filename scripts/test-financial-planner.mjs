import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");
const supabaseStorageJs = readFileSync(join(rootDir, "supabase-storage.js"), "utf8");
const supabaseSchemaSql = readFileSync(join(rootDir, "supabase-schema.sql"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function mustNotMatch(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = ["\nfunction ", "\nasync function "]
    .map((needle) => source.indexOf(needle, start + 1))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return nextFunction === undefined ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /data-view="finance" hidden>Finance<\/button>/, "Finance tab should exist but be hidden by default");
mustMatch(indexHtml, /id="financeView" data-panel="finance" data-admin-only/, "Finance page should be admin-only");
mustMatch(indexHtml, /id="financePlannerBody"/, "Finance planner should render into a dedicated body");
mustMatch(indexHtml, /id="financeSaveBtn"[\s\S]*Save Planner/, "Finance planner should expose a save action");
mustMatch(indexHtml, /id="financeExportTransactionsBtn"[\s\S]*Export Transactions/, "Finance planner should expose a transaction history export action");

mustMatch(appJs, /ADMIN_TAB_VIEWS = new Set\([\s\S]*"finance"/, "Finance should be visible only in admin tab views");
const publicReadViewsLine = appJs.split(/\r?\n/).find((line) => line.includes("PUBLIC_READ_VIEWS")) || "";
mustNotMatch(publicReadViewsLine, /"finance"/, "Finance should not be publicly route-accessible");
mustMatch(appJs, /finance: "\/finance"/, "Finance should have a route");
mustMatch(appJs, /"\/financial-planner": "finance"/, "Finance should support a friendly route alias");
mustMatch(appJs, /financialPlans: \[\]/, "State should seed finance plans");
mustMatch(functionBody(appJs, "normalizeState"), /nextState\.financialPlans = normalizeFinancialPlans/, "State normalization should include finance plans");
const financeChargeFieldsStart = appJs.indexOf("const FINANCE_CHARGE_FIELDS");
const financeChargeFieldsBlock = appJs.slice(financeChargeFieldsStart, appJs.indexOf("];", financeChargeFieldsStart) + 2);
mustNotMatch(financeChargeFieldsBlock, /baseDues|otherFees|umpireFees|jerseyFees/, "Finance charges should not include base dues, catch-all other fees, or lump-sum umpire/jersey fees");
mustMatch(appJs, /const FINANCE_EXPENSE_CATEGORIES[\s\S]*League Fees[\s\S]*Umpires[\s\S]*Jerseys[\s\S]*Playoff Fees/, "Finance should define paid expense categories");
mustMatch(functionBody(appJs, "defaultFinanceCharges"), /umpireRate[\s\S]*umpireGames[\s\S]*jerseyPrice[\s\S]*jerseyCount/, "Finance charges should include umpire and jersey split fields");
mustMatch(functionBody(appJs, "financeUmpireTotal"), /umpireRate[\s\S]*umpireGames/, "Finance should calculate umpire total as rate times games");
mustMatch(functionBody(appJs, "financeJerseyTotal"), /jerseyPrice[\s\S]*jerseyCount/, "Finance should calculate jersey total as price times count");
mustMatch(functionBody(appJs, "financeExpenseCategoryAmount"), /umpireFees[\s\S]*umpireRate[\s\S]*jerseyFees[\s\S]*financeJerseyTotal[\s\S]*custom:/, "Paid expense defaults should come from fixed charges, umpire rate, jersey total, or additional fees");
mustMatch(functionBody(appJs, "normalizeFinancialPlan"), /customFees[\s\S]*expensePayments[\s\S]*transactions/, "Finance normalization should retain custom fees, paid expenses, and transaction history");
mustMatch(functionBody(appJs, "normalizeFinancialPlan"), /left\.included === false[\s\S]*right\.included === false[\s\S]*left\.name\.localeCompare/, "Finance players should sort included players first and alphabetically");
mustNotMatch(functionBody(appJs, "normalizeFinancialPlan"), /moneyOnHand/, "Finance normalization should not keep money-on-hand state");
mustMatch(functionBody(appJs, "calculateFinancialPlanSummary"), /financeBaseChargeTotal[\s\S]*customFees[\s\S]*sharedPerPlayer[\s\S]*financePlayerContributionTotal[\s\S]*outstandingTotal[\s\S]*expensesPaidTotal[\s\S]*contributionTotal[\s\S]*totalIn/, "Finance summary should calculate shared charges, custom fees, player contributions, paid expenses, total in, and outstanding totals");
mustNotMatch(functionBody(appJs, "calculateFinancialPlanSummary"), /moneyRemaining|moneyOnHand/, "Finance summary should not calculate money left");
const renderFinancePlannerBody = functionBody(appJs, "renderFinancePlanner");
mustMatch(renderFinancePlannerBody, /finance-summary-grid/, "Finance view should render the summary controls");
mustMatch(renderFinancePlannerBody, /data-finance-add-fee/, "Finance view should render custom fee controls");
mustMatch(renderFinancePlannerBody, /renderFinanceContributionLogger/, "Finance view should render the player contribution logger");
mustMatch(renderFinancePlannerBody, /finance-ledger-table/, "Finance view should render the player ledger");
mustNotMatch(renderFinancePlannerBody, /data-finance-money-on-hand|Money Left|Money on hand/, "Finance view should not render a money-on-hand field");
mustMatch(functionBody(appJs, "renderFinanceChargeInput"), /data-finance-charge=[\s\S]*data-finance-clear-zero/, "Finance shared charge amount inputs should clear zero on focus");
mustMatch(functionBody(appJs, "renderFinanceUmpireChargeInput"), /data-finance-charge="umpireRate"[\s\S]*data-finance-clear-zero[\s\S]*data-finance-charge="umpireGames"/, "Finance view should render umpire rate and game count inputs while clearing zero only on the dollar amount");
mustMatch(functionBody(appJs, "renderFinanceJerseyChargeInput"), /data-finance-charge="jerseyPrice"[\s\S]*data-finance-clear-zero[\s\S]*data-finance-charge="jerseyCount"/, "Finance view should render jersey price and count inputs while clearing zero only on the dollar amount");
mustMatch(functionBody(appJs, "renderFinanceCustomFeeRow"), /data-finance-custom-fee-field="amount"[\s\S]*data-finance-clear-zero/, "Additional fee amount inputs should clear zero on focus");
mustMatch(functionBody(appJs, "renderFinanceContributionLogger"), /select[\s\S]*data-finance-contribution-draft-field="playerId"[\s\S]*data-finance-contribution-draft-field="amount"[\s\S]*data-finance-clear-zero[\s\S]*data-finance-log-contribution/, "Player contributions should use a player dropdown, zero-clearing amount input, and log action");
mustMatch(functionBody(appJs, "renderFinanceExpenseLogger"), /select[\s\S]*data-finance-expense-draft-field="category"[\s\S]*data-finance-expense-draft-field="amount"[\s\S]*data-finance-clear-zero[\s\S]*data-finance-use-default-expense[\s\S]*data-finance-log-expense/, "Paid expenses should use a single logger with category dropdown, zero-clearing amount input, default amount action, and log action");
mustMatch(functionBody(appJs, "renderFinanceLedgerRow"), /data-finance-player-field="paid"[\s\S]*data-finance-clear-zero[\s\S]*Contrib\.[\s\S]*finance-ledger-subvalue[\s\S]*total in[\s\S]*data-finance-player-field="adjustment"[\s\S]*data-finance-clear-zero/, "Player paid and adjustment amount inputs should clear zero on focus while contribution and total-in values display in the ledger");
mustNotMatch(appJs, /data-finance-add-expense|data-finance-remove-expense|data-finance-expense-field=/, "Finance view should not render retired paid expense rows");
mustMatch(renderFinancePlannerBody, /renderFinanceExpenseLogger/, "Finance view should render the paid expense logger");
mustMatch(renderFinancePlannerBody, /data-finance-tab="planner"[\s\S]*data-finance-tab="history"/, "Finance view should render planner and transaction history tabs");
mustMatch(functionBody(appJs, "renderFinanceTransactionHistory"), /finance-history-table[\s\S]*transactions\.map/, "Finance should render a transaction history table");
mustMatch(functionBody(appJs, "financeTransactionHistoryRows"), /transactions[\s\S]*expensePayments[\s\S]*team-expense/, "Finance history should include transaction rows and legacy paid expense rows");
mustMatch(functionBody(appJs, "exportFinanceTransactionHistory"), /financeTransactionExportRows[\s\S]*downloadTextFile[\s\S]*text\/csv/, "Finance transaction export should download history as CSV");
mustMatch(functionBody(appJs, "recordFinanceTransactionForInput"), /player-payment/, "Finance should record player payment transactions");
mustMatch(functionBody(appJs, "handleFinancePlannerFocusIn"), /data-finance-clear-zero[\s\S]*financeInputIsZero[\s\S]*input\.value = ""/, "Finance amount inputs should clear a zero value on focus");
mustMatch(functionBody(appJs, "handleFinancePlannerFocusOut"), /data-finance-clear-zero[\s\S]*input\.value = "0"/, "Finance amount inputs should restore zero when left blank");
mustMatch(functionBody(appJs, "handleFinancePlannerClick"), /data-finance-log-contribution[\s\S]*type: "player-contribution"/, "Logging a player contribution should add a player-contribution transaction");
mustMatch(functionBody(appJs, "handleFinancePlannerClick"), /data-finance-log-expense[\s\S]*type: "team-expense"/, "Logging a paid expense should add a team-expense transaction");
mustMatch(functionBody(appJs, "saveFinancialPlanOrAlert"), /upsertFinancialPlan[\s\S]*season_financial_plans/, "Saving should use the dedicated Supabase finance table");
mustMatch(functionBody(appJs, "bindEvents"), /financePlannerBody[\s\S]*handleFinancePlannerFocusIn[\s\S]*handleFinancePlannerInput[\s\S]*financeSaveBtn[\s\S]*saveFinancialPlanOrAlert[\s\S]*financeExportTransactionsBtn[\s\S]*exportFinanceTransactionHistory/, "Finance controls should be wired through delegated handlers and export");
mustMatch(functionBody(appJs, "switchView"), /nextView === "finance"[\s\S]*renderFinancePlanner/, "Finance planner should render when the admin tab is opened");

mustMatch(supabaseStorageJs, /const FINANCIAL_PLAN_COLUMNS/, "Supabase adapter should define finance columns");
mustMatch(supabaseStorageJs, /function financialPlanFromRow/, "Supabase adapter should map finance rows to app models");
mustMatch(supabaseStorageJs, /function buildFinancialPlanRow/, "Supabase adapter should map finance plans to rows");
mustMatch(supabaseStorageJs, /async function fetchFinancialPlans/, "Supabase adapter should fetch finance plans");
mustMatch(supabaseStorageJs, /async function upsertFinancialPlan/, "Supabase adapter should save finance plans");
mustMatch(supabaseStorageJs, /season_financial_plans/, "Supabase adapter should use the private finance table");
mustMatch(supabaseStorageJs, /custom_fees[\s\S]*expense_payments[\s\S]*transactions/, "Supabase adapter should persist custom fee, paid expense, and transaction fields");
mustNotMatch(supabaseStorageJs, /money_on_hand|moneyOnHand/, "Supabase adapter should not depend on money-on-hand fields");

mustMatch(supabaseSchemaSql, /create table if not exists public\.season_financial_plans/, "Schema should create season finance table");
mustMatch(supabaseSchemaSql, /custom_fees jsonb[\s\S]*expense_payments jsonb[\s\S]*transactions jsonb/, "Schema should store custom fee, paid expense, and transaction fields");
mustMatch(supabaseSchemaSql, /alter table public\.season_financial_plans enable row level security/, "Finance table should have RLS enabled");
mustMatch(supabaseSchemaSql, /Authenticated admin read season_financial_plans/, "Schema should allow admin reads");
mustMatch(supabaseSchemaSql, /Authenticated write season_financial_plans/, "Schema should allow admin writes");
mustNotMatch(supabaseSchemaSql, /Public read season_financial_plans/, "Finance table should not have a public read policy");

mustMatch(stylesCss, /\.finance-summary-grid[\s\S]*grid-template-columns: repeat\(auto-fit/, "Finance summary should use a flexible dashboard grid");
mustMatch(stylesCss, /\.finance-ledger-wrap[\s\S]*overflow: visible/, "Finance ledger should not force horizontal scrolling");
mustMatch(stylesCss, /\.finance-ledger-table[\s\S]*min-width: 0[\s\S]*table-layout: fixed/, "Finance ledger should fit inside the card");
mustMatch(stylesCss, /\.finance-split-toggle[\s\S]*border-radius: 999px/, "Split indicator should be a compact pill");
mustMatch(stylesCss, /\.finance-balance-amount\.is-due[\s\S]*#f87171/, "Outstanding balances should be highlighted red");
mustMatch(stylesCss, /\.finance-ledger-subvalue[\s\S]*font-size: 0\.58rem/, "Finance ledger should style the player total-in helper line");
mustMatch(stylesCss, /\.finance-split-charge-field[\s\S]*\.finance-split-charge-input-grid/, "Finance should align split charge fields");
mustMatch(stylesCss, /\.finance-contribution-logger[\s\S]*\.finance-log-contribution-button/, "Finance should style the player contribution logger");
mustMatch(stylesCss, /\.finance-expense-logger[\s\S]*\.finance-log-expense-button/, "Finance should style the single paid expense logger");
mustMatch(stylesCss, /\.finance-view-tabs[\s\S]*\.finance-history-table/, "Finance should style the planner tabs and transaction history table");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-summary-grid[\s\S]*grid-template-columns: repeat\(2/, "Finance planner should adapt on mobile");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-ledger-table thead[\s\S]*display: none/, "Finance ledger should hide table headers on mobile");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-ledger-table tbody tr[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Finance ledger player rows should render as mobile cards");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-ledger-table td::before[\s\S]*content: attr\(data-label\)/, "Finance mobile cards should label each stat field");

console.log("Financial planner checks passed.");
