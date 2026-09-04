import { type TickerSymbol, TickerSymbolSchema } from "../../domain/ids";

export const StockSymbolSchema = TickerSymbolSchema;

export type StockSymbol = TickerSymbol;

export const LATEST_PUBLISHABLE_REPORT_VERSION_PREDICATE = `report_versions.version = (
  SELECT MAX(latest.version) FROM report_versions AS latest
  WHERE latest.report_id = reports.report_id
    AND latest.status IN ('complete', 'complete_with_limitations')
)`;
