export const OFFICE_ENTITY_GEOMETRY = Object.freeze({
  evidenceForum: Object.freeze({
    id: "evidence-forum",
    position: Object.freeze({ x: 720, y: 464 }),
    size: Object.freeze({ width: 252, height: 174 }),
    collisionFootprint: null,
    anchors: Object.freeze({
      market: Object.freeze({
        agentId: "market",
        cell: Object.freeze({ x: 19, y: 13 }),
        facing: "right",
        target: Object.freeze({ x: 22, y: 14 }),
      }),
      company: Object.freeze({
        agentId: "company",
        cell: Object.freeze({ x: 25, y: 13 }),
        facing: "left",
        target: Object.freeze({ x: 22, y: 14 }),
      }),
      financial: Object.freeze({
        agentId: "financial",
        cell: Object.freeze({ x: 20, y: 15 }),
        facing: "up",
        target: Object.freeze({ x: 22, y: 14 }),
      }),
      risk: Object.freeze({
        agentId: "risk",
        cell: Object.freeze({ x: 24, y: 15 }),
        facing: "up",
        target: Object.freeze({ x: 22, y: 14 }),
      }),
      chair: Object.freeze({
        agentId: "chair",
        cell: Object.freeze({ x: 22, y: 12 }),
        facing: "down",
        target: Object.freeze({ x: 22, y: 14 }),
      }),
    }),
  }),
  roomSigns: Object.freeze({
    market: Object.freeze({ x: 50, y: 48, width: 238, height: 66 }),
    chair: Object.freeze({ x: 568, y: 48, width: 250, height: 66 }),
    company: Object.freeze({ x: 1094, y: 48, width: 238, height: 66 }),
    financial: Object.freeze({ x: 50, y: 560, width: 250, height: 66 }),
    risk: Object.freeze({ x: 754, y: 560, width: 250, height: 66 }),
  }),
});
