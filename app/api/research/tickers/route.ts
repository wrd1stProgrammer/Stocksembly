import { getLiveTickerCatalog } from "../../../../src/research/server/api/liveTickerCatalog";
import { createTickerRoute } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createTickerRoute(getLiveTickerCatalog);
