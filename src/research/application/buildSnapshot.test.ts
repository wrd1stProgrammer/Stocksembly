import { registerSnapshotAdversarialTests } from "./buildSnapshotAdversarial.testCases";
import { registerSnapshotCoreTests } from "./buildSnapshotCore.testCases";
import { registerSnapshotCorrectiveTests } from "./buildSnapshotCorrective.testCases";
import { registerSnapshotLineageCorrectiveTests } from "./buildSnapshotLineageCorrective.testCases";

registerSnapshotCoreTests();
registerSnapshotAdversarialTests();
registerSnapshotCorrectiveTests();
registerSnapshotLineageCorrectiveTests();
